import { describe, expect, it, vi } from 'vitest';
import type {
	SpotifyPlaybackState,
	SpotifyPlayerLike,
	SpotifyPlayerOptions,
	SpotifySdk,
	SpotifySource
} from './media-spotify.js';
import {
	createSpotifySource,
	loadSpotifySdk,
	parseSpotifyTrackId,
	searchSpotifyTracks,
	spotifyConnectTimeoutMs,
	spotifySdkLoadTimeoutMs
} from './media-spotify.js';
import type { MediaSourceEvents } from './media-player.svelte.js';
import {
	beginSpotifySignIn,
	completeSpotifySignIn,
	setSpotifyTokens,
	spotifyRedirectAllowed,
	spotifySignedIn
} from './spotify-auth.js';

const trackId = '4cOdK2wGLETKBW3PvgPWqT';
const otherTrackId = '1301WleyT98MSxVHPZCA6M';

/**
 * The load that never answers, and what it costs three surfaces away.
 *
 * An ad blocker, a content policy or a stalled CDN leaves the script tag in the
 * document and the callback uncalled — and with no timeout that promise is
 * pending for the life of the page, so `attachSpotifyTrack`'s `finally` never
 * runs and `busy` stays true, which disables the whole picker. This is the same
 * assertion the YouTube loader carries in `media-player.test.ts`.
 */
describe('loading the Spotify SDK', () => {
	it('rejects when the script never answers', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('document', {
			createElement: () => ({ src: '', async: false, addEventListener: vi.fn() }),
			head: { appendChild: vi.fn() }
		});

		const loading = loadSpotifySdk();
		const rejected = expect(loading).rejects.toThrow('did not load in time');

		await vi.advanceTimersByTimeAsync(spotifySdkLoadTimeoutMs);
		await rejected;
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
});

describe('parseSpotifyTrackId', () => {
	it('reads the forms that actually reach a clipboard', () => {
		for (const input of [
			trackId,
			`spotify:track:${trackId}`,
			`https://open.spotify.com/track/${trackId}`,
			// The share sheet's tail, and the locale segment a non-English account
			// gets in front of the kind.
			`https://open.spotify.com/track/${trackId}?si=abc123`,
			`https://open.spotify.com/intl-no/track/${trackId}`,
			`open.spotify.com/track/${trackId}`
		]) {
			expect(parseSpotifyTrackId(input), input).toEqual({ trackId });
		}
	});

	it('refuses everything that is not one track', () => {
		for (const input of [
			'',
			'https://example.com/track/x',
			`https://open.spotify.com/album/${trackId}`,
			`spotify:album:${trackId}`,
			'https://open.spotify.com/track/short'
		]) {
			expect(parseSpotifyTrackId(input), input).toHaveProperty('error');
		}
	});
});

describe('searchSpotifyTracks', () => {
	const payload = {
		tracks: {
			items: [
				{ id: trackId, name: 'Sensommer', artists: [{ name: 'Mul' }], duration_ms: 212_000 },
				// No id, so it cannot be attached and must not be offered.
				{ name: 'Broken', artists: [{ name: 'Nobody' }], duration_ms: 1000 }
			]
		}
	};

	it('asks for tracks and returns what can actually be attached', async () => {
		let asked: string | undefined;
		const outcome = await searchSpotifyTracks('sensommer mul', {
			token: async () => 'token',
			request: (async (url: RequestInfo | URL) => {
				asked = String(url);
				return new Response(JSON.stringify(payload), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}) as typeof fetch
		});

		expect(asked).toContain('type=track');
		expect(asked).toContain('q=sensommer+mul');
		expect(outcome).toEqual({
			results: [{ trackId, name: 'Mul — Sensommer', durationSeconds: 212 }]
		});
	});

	it('says the sign-in expired rather than reporting an empty catalogue', async () => {
		for (const [token, status] of [
			[undefined, 200],
			['token', 401]
		] as const) {
			const outcome = await searchSpotifyTracks('anything', {
				token: async () => token,
				request: (async () => new Response(null, { status })) as typeof fetch
			});
			expect(outcome).toEqual({ error: 'That Spotify sign-in expired. Search again to sign in.' });
		}
	});

	it('asks nothing at all for an empty query', async () => {
		const request = vi.fn();
		const outcome = await searchSpotifyTracks('   ', {
			token: async () => 'token',
			request: request as unknown as typeof fetch
		});
		expect(outcome).toEqual({ results: [] });
		expect(request).not.toHaveBeenCalled();
	});
});

class StubSpotifyPlayer implements SpotifyPlayerLike {
	readonly listeners = new Map<string, (payload: never) => void>();
	state: SpotifyPlaybackState | null = null;
	resumed = 0;
	paused = 0;
	readonly seeks: number[] = [];
	disconnected = false;

	async connect(): Promise<boolean> {
		return true;
	}
	disconnect(): void {
		this.disconnected = true;
	}
	addListener(event: string, listener: (payload: never) => void): boolean {
		this.listeners.set(event, listener);
		return true;
	}
	async getCurrentState(): Promise<SpotifyPlaybackState | null> {
		return this.state;
	}
	async pause(): Promise<void> {
		this.paused += 1;
	}
	async resume(): Promise<void> {
		this.resumed += 1;
	}
	async seek(positionMs: number): Promise<void> {
		this.seeks.push(positionMs);
	}

	emit(event: string, payload: unknown): void {
		this.listeners.get(event)?.(payload as never);
	}
}

function spyEvents(): MediaSourceEvents {
	return {
		timeChanged: vi.fn(),
		durationChanged: vi.fn(),
		ratesChanged: vi.fn(),
		named: vi.fn(),
		artworkChanged: vi.fn(),
		detailsChanged: vi.fn(),
		started: vi.fn(),
		stopped: vi.fn(),
		ended: vi.fn(),
		failed: vi.fn()
	};
}

/** A macrotask, which is long enough for anything queued to have run. */
async function settle(): Promise<void> {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * A source whose metadata read for `trackId` hangs until the test answers it.
 *
 * Every other read answers at once, so a second `load` can overtake the first —
 * which is the whole shape of the staleness this is for.
 */
function trackReadHarness(events: MediaSourceEvents): {
	source: SpotifySource;
	pending: () => boolean;
	reject: (error: Error) => void;
} {
	let rejectRead: ((error: Error) => void) | undefined;
	const source = createSpotifySource({
		events,
		loadSdk: async () => ({
			Player: class extends StubSpotifyPlayer {} as unknown as SpotifySdk['Player']
		}),
		token: async () => 'token',
		request: (async (url: RequestInfo | URL) => {
			if (String(url).includes(`/tracks/${trackId}`)) {
				return await new Promise<Response>((_, reject) => {
					rejectRead = reject;
				});
			}
			return new Response(JSON.stringify({ name: 'Other' }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			});
		}) as typeof fetch,
		schedule: () => () => {}
	});

	return {
		source,
		pending: () => rejectRead !== undefined,
		reject: (error) => rejectRead?.(error)
	};
}

interface Harness {
	source: SpotifySource;
	player: StubSpotifyPlayer;
	events: MediaSourceEvents;
	calls: { url: string; init?: RequestInit }[];
	playCalls: () => { url: string; init?: RequestInit }[];
}

async function attach(startAt?: number): Promise<Harness> {
	let player: StubSpotifyPlayer | undefined;
	const sdk: SpotifySdk = {
		Player: class {
			constructor() {
				player = new StubSpotifyPlayer();
				return player as unknown as StubSpotifyPlayer;
			}
		} as unknown as SpotifySdk['Player']
	};

	const calls: { url: string; init?: RequestInit }[] = [];
	const request = (async (url: RequestInfo | URL, init?: RequestInit) => {
		calls.push({ url: String(url), ...(init === undefined ? {} : { init }) });
		if (String(url).includes('/tracks/')) {
			return new Response(
				JSON.stringify({
					name: 'Sensommer',
					artists: [{ name: 'Mul' }],
					duration_ms: 212_000,
					// Widest first, as Spotify orders them.
					album: {
						images: [{ url: 'https://i.scdn.co/image/640' }, { url: 'https://i.scdn.co/image/64' }]
					}
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			);
		}
		return new Response(null, { status: 204 });
	}) as typeof fetch;

	const events: MediaSourceEvents = {
		timeChanged: vi.fn(),
		durationChanged: vi.fn(),
		ratesChanged: vi.fn(),
		named: vi.fn(),
		artworkChanged: vi.fn(),
		detailsChanged: vi.fn(),
		started: vi.fn(),
		stopped: vi.fn(),
		ended: vi.fn(),
		failed: vi.fn()
	};

	const source = createSpotifySource({
		events,
		loadSdk: async () => sdk,
		token: async () => 'token',
		request,
		// Never ticks on its own: the poll is a clock this suite does not want.
		schedule: () => () => {}
	});

	const loading = source.load(trackId, startAt);
	await vi.waitFor(() => expect(player).toBeDefined());
	player?.emit('ready', { device_id: 'device-1' });
	await loading;

	return {
		source,
		player: player as StubSpotifyPlayer,
		events,
		calls,
		playCalls: () => calls.filter((call) => call.url.includes('/me/player/play'))
	};
}

describe('createSpotifySource', () => {
	it('attaches without playing a note', async () => {
		const harness = await attach();

		// The whole reason the Web API metadata call exists: Spotify has no cue, so
		// the name and the length have to arrive without `PUT /me/player/play`.
		expect(harness.playCalls()).toHaveLength(0);
		expect(harness.events.named).toHaveBeenCalledWith('Mul — Sensommer');
		expect(harness.events.durationChanged).toHaveBeenCalledWith(212);
	});

	// The cover rides along with the name, so offering it costs no second request.
	it('reports the widest cover the same read already carried', async () => {
		const harness = await attach();
		expect(harness.events.artworkChanged).toHaveBeenCalledWith('https://i.scdn.co/image/640');
		expect(harness.calls.filter((call) => call.url.includes('/tracks/'))).toHaveLength(1);
	});

	it('offers exactly one rate, because Spotify has no rate control', async () => {
		const harness = await attach();
		expect(harness.events.ratesChanged).toHaveBeenCalledWith([1]);
		expect(harness.source.rates).toEqual([1]);
	});

	it('starts the track on the first press and resumes on every one after', async () => {
		const harness = await attach();

		harness.source.play();
		await vi.waitFor(() => expect(harness.playCalls()).toHaveLength(1));
		const body = JSON.parse(String(harness.playCalls()[0]?.init?.body)) as {
			uris: string[];
			position_ms: number;
		};
		expect(body.uris).toEqual([`spotify:track:${trackId}`]);
		expect(body.position_ms).toBe(0);
		expect(harness.player.resumed).toBe(0);

		harness.source.play();
		await vi.waitFor(() => expect(harness.player.resumed).toBe(1));
		// Still one: a resume must not re-issue the start, which would throw the
		// playhead back to where the track was first begun.
		expect(harness.playCalls()).toHaveLength(1);
	});

	it('spends a restored position as the start position rather than a seek', async () => {
		const harness = await attach(64);

		// Nothing is on the device yet, so there is nothing to seek in.
		expect(harness.player.seeks).toHaveLength(0);
		expect(harness.source.time).toBe(64);

		harness.source.play();
		await vi.waitFor(() => expect(harness.playCalls()).toHaveLength(1));
		const body = JSON.parse(String(harness.playCalls()[0]?.init?.body)) as { position_ms: number };
		expect(body.position_ms).toBe(64_000);
	});

	it('seeks the player once the track is running', async () => {
		const harness = await attach();
		harness.source.play();
		await vi.waitFor(() => expect(harness.playCalls()).toHaveLength(1));

		harness.source.seek(30);
		expect(harness.player.seeks).toEqual([30_000]);
		// Reported from the target immediately, the way the YouTube bridge does, so
		// a back-2 then resume cannot read a pre-nudge position off a lagging player.
		expect(harness.source.time).toBe(30);
	});

	it('maps player state onto the transport events', async () => {
		const harness = await attach();

		harness.player.emit('player_state_changed', {
			paused: false,
			position: 12_000,
			duration: 212_000
		});
		expect(harness.events.started).toHaveBeenCalled();
		expect(harness.source.time).toBe(12);

		harness.player.emit('player_state_changed', {
			paused: true,
			position: 15_000,
			duration: 212_000
		});
		expect(harness.events.stopped).toHaveBeenCalled();
		expect(harness.events.ended).not.toHaveBeenCalled();

		// A pause at 0:00 after playing is the only thing Spotify gives us for the
		// end of a track.
		harness.player.emit('player_state_changed', {
			paused: false,
			position: 211_000,
			duration: 212_000
		});
		harness.player.emit('player_state_changed', { paused: true, position: 0, duration: 212_000 });
		expect(harness.events.ended).toHaveBeenCalled();
	});

	it('reports an account without Premium in words that name the way out', async () => {
		const harness = await attach();
		harness.player.emit('account_error', { message: 'Some SDK sentence' });
		expect(harness.events.failed).toHaveBeenCalledWith(
			'Spotify playback needs a Premium account. Attach a file instead.'
		);
	});

	it('disconnects the player when it is cleared', async () => {
		const harness = await attach();
		harness.source.clear();
		expect(harness.player.disconnected).toBe(true);
		expect(harness.source.time).toBe(0);
	});

	it('reports rejected play, pause, and seek presses', async () => {
		const harness = await attach();
		harness.source.play();
		await vi.waitFor(() => expect(harness.playCalls()).toHaveLength(1));
		harness.player.resume = async () => {
			throw new Error('transfer failed');
		};
		harness.player.pause = async () => {
			throw new Error('subscription lapsed');
		};
		harness.player.seek = async () => {
			throw new Error('drm failed');
		};

		harness.source.play();
		harness.source.pause();
		harness.source.seek(20);
		await vi.waitFor(() => {
			expect(harness.events.failed).toHaveBeenCalledWith('Spotify could not play that track.');
			expect(harness.events.stopped).toHaveBeenCalled();
		});
	});

	/**
	 * A read for the track the user has already moved off says nothing.
	 *
	 * The success path has always checked this (`trackId !== id`), because a name
	 * arriving late for the wrong track would rename the strip. The failure path
	 * did not, so a read that was still in flight when the user picked another
	 * track put `Spotify could not be reached.` on a strip that had just attached
	 * something else — an error about an attachment that no longer exists,
	 * arriving after the one that replaced it had succeeded.
	 */
	it('reports a failed track read only while that track is still the one attached', async () => {
		const stale = spyEvents();
		const staleSource = trackReadHarness(stale);
		void staleSource.source.load(trackId);
		await vi.waitFor(() => expect(staleSource.pending()).toBe(true));

		// The user picks another track before the first read comes back.
		void staleSource.source.load(otherTrackId);
		staleSource.reject(new Error('offline'));
		await settle();

		expect(stale.failed).not.toHaveBeenCalled();

		// And the same read, unsuperseded, still reports — or the guard above would
		// be silence rather than staleness.
		const live = spyEvents();
		const liveSource = trackReadHarness(live);
		void liveSource.source.load(trackId);
		await vi.waitFor(() => expect(liveSource.pending()).toBe(true));
		liveSource.reject(new Error('offline'));

		await vi.waitFor(() =>
			expect(live.failed).toHaveBeenCalledWith('Spotify could not be reached.')
		);
	});

	it('fails a device registration that never becomes ready', async () => {
		vi.useFakeTimers();
		const events = {
			timeChanged: vi.fn(),
			durationChanged: vi.fn(),
			ratesChanged: vi.fn(),
			named: vi.fn(),
			artworkChanged: vi.fn(),
			detailsChanged: vi.fn(),
			started: vi.fn(),
			stopped: vi.fn(),
			ended: vi.fn(),
			failed: vi.fn()
		};
		const sdk: SpotifySdk = {
			Player: class extends StubSpotifyPlayer {} as unknown as SpotifySdk['Player']
		};
		const source = createSpotifySource({
			events,
			loadSdk: async () => sdk,
			token: async () => 'token',
			request: (async () =>
				new Response(JSON.stringify({ name: 'Track', duration_ms: 1000 }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})) as typeof fetch,
			schedule: () => () => {}
		});
		const loading = source.load(trackId);
		await Promise.resolve();
		await vi.advanceTimersByTimeAsync(spotifyConnectTimeoutMs);
		await loading;

		expect(events.failed).toHaveBeenCalledWith('The Spotify player could not be loaded.');
		vi.useRealTimers();
	});
});

/**
 * The one Spotify failure with nowhere to report itself.
 *
 * The SDK asks for a token whenever it needs one, and a refused refresh answered
 * by simply not calling the callback: no error event, no timeout of its own, and
 * — once the device had already arrived — nothing left in this module armed
 * either. The transport went quiet and stayed quiet, with the glyphs answering
 * every press. Every Web API path already reports the same case in words.
 */
describe('a Spotify session that expires while a track is attached', () => {
	it('says the sign-in expired rather than going silently dead', async () => {
		const events = spyEvents();
		const tokens: (string | undefined)[] = ['token'];
		let askForToken: SpotifyPlayerOptions['getOAuthToken'] | undefined;
		let player: StubSpotifyPlayer | undefined;

		const source = createSpotifySource({
			events,
			loadSdk: async () => ({
				Player: class {
					constructor(options: SpotifyPlayerOptions) {
						askForToken = options.getOAuthToken;
						player = new StubSpotifyPlayer();
						return player as unknown as StubSpotifyPlayer;
					}
				} as unknown as SpotifySdk['Player']
			}),
			token: async () => tokens.shift(),
			request: (async () =>
				new Response(JSON.stringify({ name: 'Sensommer', artists: [{ name: 'Mul' }] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				})) as typeof fetch,
			schedule: () => () => {}
		});

		const loading = source.load(trackId);
		await vi.waitFor(() => expect(player).toBeDefined());
		player?.emit('ready', { device_id: 'device-1' });
		await loading;
		expect(events.failed).not.toHaveBeenCalled();

		// The refresh the SDK asks for mid-session, refused: the token queue is
		// spent, so this one answers `undefined`.
		askForToken?.(() => {});
		await settle();

		expect(events.failed).toHaveBeenCalledWith(
			'That Spotify sign-in expired. Add the track again to sign in.'
		);
	});
});

describe('spotifyRedirectAllowed', () => {
	// The trap is reading `redirect_uri: Insecure` as a statement about the
	// scheme. Spotify rejects the host `localhost` outright, so an origin with a
	// real certificate behind it fails exactly as the plain-http one does.
	it('refuses localhost at any scheme, and wants the loopback literal', () => {
		for (const [origin, allowed] of [
			['https://lyriclint.com', true],
			['https://127.0.0.1:5173', true],
			['http://127.0.0.1:5173', true],
			// Refused as a *name*: a trusted certificate does not save it.
			['https://localhost:5173', false],
			['http://localhost:5173', false],
			['http://192.168.68.51:5173', false]
		] as const) {
			const url = new URL(origin);
			vi.stubGlobal('location', {
				protocol: url.protocol,
				hostname: url.hostname,
				origin: url.origin
			});
			expect(spotifyRedirectAllowed(), origin).toBe(allowed);
		}
		vi.unstubAllGlobals();
	});
});

describe('the Spotify session', () => {
	it('sends and verifies OAuth state while preserving unrelated URL state', async () => {
		const store = new Map<string, string>();
		const assign = vi.fn();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key)
		});
		vi.stubGlobal('location', {
			protocol: 'https:',
			hostname: '127.0.0.1',
			origin: 'https://127.0.0.1',
			pathname: '/lint/',
			search: '',
			hash: '',
			href: 'https://127.0.0.1/lint/',
			assign
		});

		await beginSpotifySignIn('query');
		const authorization = new URL(String(assign.mock.calls[0]?.[0]));
		const state = authorization.searchParams.get('state');
		expect(state).toBe(store.get('lyriclint:spotify:state'));

		vi.stubGlobal('location', {
			origin: 'https://127.0.0.1',
			pathname: '/lint/',
			search: '?panel=tools&code=code&state=wrong',
			hash: '#draft',
			href: 'https://127.0.0.1/lint/?panel=tools&code=code&state=wrong#draft'
		});
		const replaceState = vi.fn();
		vi.stubGlobal('history', { state: { kept: true }, replaceState });
		const request = vi.fn();
		vi.stubGlobal('fetch', request);

		expect(await completeSpotifySignIn()).toEqual({
			error: 'That Spotify sign-in could not be completed.'
		});
		expect(request).not.toHaveBeenCalled();
		expect(store.has('lyriclint:spotify:intent')).toBe(false);
		expect(replaceState).toHaveBeenCalledWith({ kept: true }, '', '/lint/?panel=tools#draft');
		vi.unstubAllGlobals();
	});

	it('does not throw or redirect when private storage refuses the auth intent', async () => {
		const assign = vi.fn();
		vi.stubGlobal('sessionStorage', {
			setItem: () => {
				throw new Error('denied');
			}
		});
		vi.stubGlobal('location', {
			protocol: 'https:',
			hostname: '127.0.0.1',
			origin: 'https://127.0.0.1',
			assign
		});

		// False rather than nothing: a refusal the caller cannot see is what put
		// `No matches on Spotify` under a valid track link in a private window.
		await expect(beginSpotifySignIn('query')).resolves.toBe(false);
		expect(assign).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});

	/**
	 * `JSON.parse` answers more than an object, and one of those answers is `null`.
	 *
	 * A stored `null` — or `{}`, or anything else that ever reached this key —
	 * parsed without throwing, so the module held it as a session: `spotifySignedIn()`
	 * said yes over nothing at all, the picker offered a search that needed no
	 * sign-in, and the request went out as `Bearer undefined`. The shape is what
	 * decides, and what fails it is cleared rather than re-read on the next miss.
	 */
	it('reads a stored value that is not a session as no session', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key)
		});
		vi.stubGlobal('location', { protocol: 'https:', hostname: '127.0.0.1', origin: 'https://x' });

		for (const stored of ['null', '{}', '{"accessToken":"a"}', '"a"']) {
			setSpotifyTokens(undefined);
			store.set('lyriclint:spotify:tokens', stored);
			expect(spotifySignedIn(), stored).toBe(false);
			// And it is gone, so the next miss does not re-read the same rubbish.
			expect(store.size, stored).toBe(0);
		}

		setSpotifyTokens(undefined);
		vi.unstubAllGlobals();
	});

	// A reload used to send the user back to Spotify's authorize screen for a
	// session the browser still considered open. Module memory dies on reload;
	// a browser session does not, and ends with the tab — which is what
	// "session-scoped" meant all along.
	it('survives a reload and does not outlive the tab', () => {
		const store = new Map<string, string>();
		vi.stubGlobal('sessionStorage', {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => void store.set(key, value),
			removeItem: (key: string) => void store.delete(key)
		});
		vi.stubGlobal('location', { protocol: 'https:', hostname: '127.0.0.1', origin: 'https://x' });

		setSpotifyTokens({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 60_000 });
		expect(spotifySignedIn()).toBe(true);
		// Written where a reload can find it, rather than only in this module.
		expect(store.size).toBe(1);

		// A reload is the module losing its memory while the session storage keeps
		// what the tab was holding.
		setSpotifyTokens(undefined);
		store.set(
			'lyriclint:spotify:tokens',
			JSON.stringify({ accessToken: 'a', expiresAt: Date.now() + 60_000 })
		);
		expect(spotifySignedIn()).toBe(true);

		// Signing out clears storage too, so a later reload cannot rehydrate a
		// session that has ended.
		setSpotifyTokens(undefined);
		expect(store.size).toBe(0);
		expect(spotifySignedIn()).toBe(false);

		vi.unstubAllGlobals();
	});
});

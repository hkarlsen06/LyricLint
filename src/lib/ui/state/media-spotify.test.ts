import { describe, expect, it, vi } from 'vitest';
import type {
	SpotifyPlaybackState,
	SpotifyPlayerLike,
	SpotifySdk,
	SpotifySource
} from './media-spotify.js';
import { createSpotifySource, parseSpotifyTrackId, searchSpotifyTracks } from './media-spotify.js';
import type { MediaSourceEvents } from './media-player.svelte.js';
import { setSpotifyTokens, spotifyRedirectAllowed, spotifySignedIn } from './spotify-auth.js';

const trackId = '4cOdK2wGLETKBW3PvgPWqT';

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

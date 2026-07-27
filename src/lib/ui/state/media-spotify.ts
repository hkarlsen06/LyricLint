import type { MediaSource, MediaSourceEvents } from './media-player.svelte.js';
import type { PollScheduler } from './media-youtube.js';

/**
 * How often a running Spotify playhead is read, in milliseconds.
 *
 * The same 250ms the YouTube source polls at, and for the same reason — there is
 * no `timeupdate` — but with one difference worth knowing: `getCurrentState()`
 * is answered by the SDK inside this tab, not by Spotify's servers. It is not a
 * Web API call and it is not rate limited, so this poll costs nothing on the
 * network. That is the whole argument for driving playback through the Web
 * Playback SDK rather than the Connect API, whose `GET /me/player` would cap out
 * at around one read a second and make every line anchor sloppier than the file
 * source's.
 */
export const spotifyPollIntervalMs = 250;

/** The seek settle window, exactly as the YouTube bridge uses it. */
const settleToleranceSeconds = 1;
const settleMaxPolls = 8;

const webApi = 'https://api.spotify.com/v1';
const sdkScriptUrl = 'https://sdk.scdn.co/spotify-player.js';

export interface SpotifyTrack {
	name: string;
	artists?: { name: string }[];
	duration_ms?: number;
	/** Widest first, as Spotify orders them — 640px at the top. */
	album?: { images?: { url: string }[] };
}

export interface SpotifyPlaybackState {
	paused: boolean;
	/** Milliseconds. */
	position: number;
	/** Milliseconds. */
	duration: number;
	track_window?: { current_track?: SpotifyTrack | null };
}

/** Spotify's player, narrowed to what the transport actually calls. */
export interface SpotifyPlayerLike {
	connect(): Promise<boolean>;
	disconnect(): void;
	addListener(event: string, listener: (payload: never) => void): boolean;
	getCurrentState(): Promise<SpotifyPlaybackState | null>;
	pause(): Promise<void>;
	resume(): Promise<void>;
	seek(positionMs: number): Promise<void>;
}

export interface SpotifyPlayerOptions {
	name: string;
	getOAuthToken: (callback: (token: string) => void) => void;
	volume?: number;
}

export interface SpotifySdk {
	Player: new (options: SpotifyPlayerOptions) => SpotifyPlayerLike;
}

/**
 * How the SDK arrives.
 *
 * Injected rather than imported, exactly as the YouTube loader is, so that no
 * test ever reaches Spotify and the load itself stays gated behind a press.
 */
export type SpotifySdkLoader = () => Promise<SpotifySdk>;

interface SpotifyGlobal {
	Spotify?: SpotifySdk;
	onSpotifyWebPlaybackSDKReady?: () => void;
}

let injected: Promise<SpotifySdk> | undefined;

/**
 * Fetch Spotify's Web Playback SDK — once, and never before something asks.
 *
 * The whole of this source's page-load network surface, and nothing calls it at
 * module scope. A failed load forgets itself so a second attempt is a second
 * attempt rather than the first one's rejection handed back forever.
 */
export function loadSpotifySdk(): Promise<SpotifySdk> {
	if (injected) return injected;

	const attempt = new Promise<SpotifySdk>((resolve, reject) => {
		const scope = globalThis as SpotifyGlobal;
		if (scope.Spotify?.Player) {
			resolve(scope.Spotify);
			return;
		}

		// The SDK announces itself by calling a global, the way Google's does.
		// Chaining whatever was there keeps this from being the one thing on the
		// page allowed to own that name.
		const previous = scope.onSpotifyWebPlaybackSDKReady;
		scope.onSpotifyWebPlaybackSDKReady = () => {
			previous?.();
			if (scope.Spotify?.Player) resolve(scope.Spotify);
			else reject(new Error('The Spotify player did not load.'));
		};

		const script = document.createElement('script');
		script.src = sdkScriptUrl;
		script.async = true;
		script.addEventListener('error', () =>
			reject(new Error('The Spotify player could not be reached.'))
		);
		document.head.appendChild(script);
	});

	injected = attempt.catch((error: unknown) => {
		injected = undefined;
		throw error;
	});
	return injected;
}

/**
 * What the SDK's error events mean, in the words the strip has room for.
 *
 * `account_error` is the one nearly everyone who hits a wall here will hit: the
 * Web Playback SDK refuses free accounts outright, and the SDK's own message for
 * it says nothing a user can act on.
 */
const spotifyErrorMessages: Record<string, string> = {
	account_error: 'Spotify playback needs a Premium account. Attach a file instead.',
	authentication_error: 'That Spotify sign-in expired. Add the track again to sign in.',
	initialization_error: 'This browser cannot run the Spotify player. Attach a file instead.'
};

export type SpotifyUrlResult = { trackId: string } | { error: string };

const trackIdPattern = /^[A-Za-z0-9]{22}$/;
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;

const notALink = 'That is not a Spotify track link.';
const noTrack = 'That link is not a track — albums and playlists cannot be transcribed against.';

/**
 * Turn whatever the user pasted into a track id.
 *
 * Three forms reach the clipboard in practice: the `open.spotify.com/track/…`
 * link the share sheet copies with an `?si=` tail on it, the same link with a
 * locale segment in front (`/intl-no/track/…`), and the `spotify:track:…` URI
 * the desktop app copies. `new URL` rather than one pattern over the string, for
 * the reason the YouTube parser gives: a regex works on the links it was written
 * against and quietly matches the wrong 22 characters in the fourth.
 */
export function parseSpotifyTrackId(input: string): SpotifyUrlResult {
	const trimmed = input.trim();
	if (trimmed === '') return { error: 'Paste a Spotify track link.' };

	if (trackIdPattern.test(trimmed)) return { trackId: trimmed };

	if (trimmed.toLowerCase().startsWith('spotify:')) {
		const parts = trimmed.split(':');
		if (parts[1]?.toLowerCase() !== 'track') return { error: noTrack };
		const id = parts[2];
		return id !== undefined && trackIdPattern.test(id) ? { trackId: id } : { error: noTrack };
	}

	let url: URL;
	try {
		url = new URL(schemePattern.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return { error: notALink };
	}

	if (url.hostname.toLowerCase().replace(/^www\./, '') !== 'open.spotify.com') {
		return { error: notALink };
	}

	// A locale-prefixed share link puts `intl-no` (or any other tag) in front of
	// the kind, so the segment before the id is what identifies it, not the first.
	const segments = url.pathname.split('/').filter((segment) => segment !== '');
	const kindAt = segments.lastIndexOf('track');
	if (kindAt === -1) return { error: noTrack };

	const candidate = segments[kindAt + 1];
	return candidate !== undefined && trackIdPattern.test(candidate)
		? { trackId: candidate }
		: { error: noTrack };
}

export interface SpotifySearchResult {
	trackId: string;
	/** Already in the form the strip and the roster of results both want. */
	name: string;
	durationSeconds: number;
}

export type SpotifySearchOutcome =
	| { results: SpotifySearchResult[] }
	| { error: string }
	/** The page is on its way to Spotify's authorize screen; render nothing. */
	| { signingIn: true };

/**
 * How many results a dialog can show without becoming a list to scroll.
 *
 * A transcriber knows which song they are transcribing, so the right answer is
 * near the top or the query was wrong. Twenty rows would turn one question into
 * a browsing session inside a modal.
 *
 * It is also under a ceiling now: the February 2026 changes capped `limit` at
 * **10** for development-mode apps, down from 50, and dropped the default to 5.
 * Raising this past 10 is a 400, not a longer list.
 */
const searchLimit = 6;

/**
 * Find a track by name, so nobody has to go and fetch a link.
 *
 * Search needs no scope beyond a valid token — it is public catalogue data — so
 * this costs nothing the sign-in has not already paid for. It is a plain
 * function rather than a method on the source because it runs *before* anything
 * is attached: there is no player yet, and building one to ask a question would
 * register a device for a track the user has not chosen.
 */
export async function searchSpotifyTracks(
	query: string,
	deps: { token: () => Promise<string | undefined>; request?: typeof fetch }
): Promise<SpotifySearchOutcome> {
	const trimmed = query.trim();
	if (trimmed === '') return { results: [] };

	const token = await deps.token();
	if (token === undefined)
		return { error: 'That Spotify sign-in expired. Search again to sign in.' };

	const request = deps.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
	const url =
		`${webApi}/search?` +
		new URLSearchParams({ q: trimmed, type: 'track', limit: String(searchLimit) }).toString();

	let response: Response;
	try {
		response = await request(url, { headers: { authorization: `Bearer ${token}` } });
	} catch {
		return { error: 'Spotify could not be reached.' };
	}
	if (!response.ok) {
		return {
			error:
				response.status === 401
					? 'That Spotify sign-in expired. Search again to sign in.'
					: 'Spotify could not be searched just now.'
		};
	}

	const payload = (await response.json().catch(() => undefined)) as
		{ tracks?: { items?: ({ id?: string } & SpotifyTrack)[] } } | undefined;

	return {
		results: (payload?.tracks?.items ?? [])
			.filter((item): item is { id: string } & SpotifyTrack => typeof item.id === 'string')
			.map((item) => ({
				trackId: item.id,
				name: describe(item),
				durationSeconds: (item.duration_ms ?? 0) / 1000
			}))
	};
}

export interface SpotifySourceDependencies {
	events: MediaSourceEvents;
	loadSdk: SpotifySdkLoader;
	/** A usable access token, refreshed if need be, or undefined when signed out. */
	token: () => Promise<string | undefined>;
	/** Injectable so a test answers the Web API without a network. */
	request?: typeof fetch;
	/** Injectable so a test advances the poll by hand rather than on a clock. */
	schedule?: PollScheduler;
}

export interface SpotifySource extends MediaSource {
	/** Point at a track. Resolves once the metadata is in, not once it plays. */
	load(trackId: string, startAt?: number): Promise<void>;
}

function defaultSchedule(tick: () => void, intervalMs: number): () => void {
	const timer = setInterval(tick, intervalMs);
	return () => clearInterval(timer);
}

function artistsOf(track: SpotifyTrack): string[] {
	return (track.artists ?? []).map((artist) => artist.name).filter(Boolean);
}

function describe(track: SpotifyTrack): string {
	const artists = artistsOf(track);
	return artists.length > 0 ? `${artists.join(', ')} — ${track.name}` : track.name;
}

/**
 * Spotify as something the transport can drive.
 *
 * The same three asymmetries the YouTube bridge absorbs — commands that have not
 * landed by the next read, no `timeupdate`, and a rate the source does not
 * control — plus one that is Spotify's alone and shapes the whole module:
 *
 * **There is no cue.** The IFrame API can point a player at a video without
 * starting it, which is what keeps attaching audio from playing it. Spotify's
 * SDK has no equivalent: the only way to put a track on the device is
 * `PUT /me/player/play`, which plays. So attaching fetches the track's metadata
 * over the Web API — name and length, no sound — and the `PUT` is deferred to
 * the user's first `play()`. That is why `started` exists as a flag: the first
 * press starts the track, and every press after it resumes.
 *
 * **The rate is `[1]` and always will be.** Spotify exposes no playback-rate
 * control at any layer, so the honest answer upward is a single rate, and
 * `reconcileRates` narrows the workbench's offer to it and says so once. Nothing
 * here pretends otherwise, and `preservesPitch` has no counterpart to set.
 */
export function createSpotifySource(deps: SpotifySourceDependencies): SpotifySource {
	const schedule = deps.schedule ?? defaultSchedule;
	const events = deps.events;
	const request = deps.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

	let sdk: SpotifySdk | undefined;
	let player: SpotifyPlayerLike | undefined;
	let deviceId: string | undefined;
	let ready: Promise<void> | undefined;

	let trackId: string | undefined;
	let started = false;
	let wantPlaying = false;
	let reportedDuration = Number.NaN;
	let known = 0;

	// The position the player has been told to go to, held until it agrees.
	let target: number | undefined;
	let targetPolls = 0;

	let stopPoll: (() => void) | undefined;

	function position(): number {
		return target ?? known;
	}

	function reportDuration(seconds: number): void {
		const next = Number.isFinite(seconds) && seconds > 0 ? seconds : Number.NaN;
		if (next === reportedDuration || (Number.isNaN(next) && Number.isNaN(reportedDuration))) {
			return;
		}
		reportedDuration = next;
		events.durationChanged(next);
	}

	async function call(path: string, init?: RequestInit): Promise<Response | undefined> {
		const token = await deps.token();
		if (token === undefined) {
			events.failed('That Spotify sign-in expired. Add the track again to sign in.');
			return undefined;
		}
		try {
			return await request(`${webApi}${path}`, {
				...init,
				headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}` }
			});
		} catch {
			events.failed('Spotify could not be reached.');
			return undefined;
		}
	}

	/** Name and length without playing a note, so attaching stays silent. */
	async function fetchTrack(id: string): Promise<void> {
		const response = await call(`/tracks/${id}`);
		if (!response?.ok) return;
		const track = (await response.json().catch(() => undefined)) as SpotifyTrack | undefined;
		if (track?.name === undefined || trackId !== id) return;
		events.named(describe(track));
		// The read that pays for the name carries the cover with it, so this costs
		// no second request. Widest first is Spotify's own order.
		events.artworkChanged(track.album?.images?.[0]?.url);
		// The two halves of that name, for the band that sets them at opposite ends
		// of a row. Everything else Spotify would need for the tools panel's list —
		// the label above all — is on a request this source does not make, so this
		// reports what it has rather than a shape with holes in it.
		events.detailsChanged({
			...(artistsOf(track).length > 0 ? { artist: artistsOf(track).join(', ') } : {}),
			title: track.name
		});
		if (track.duration_ms !== undefined) reportDuration(track.duration_ms / 1000);
	}

	function onStateChanged(state: SpotifyPlaybackState | null): void {
		if (state === null) return;
		known = state.position / 1000;
		if (state.duration > 0) reportDuration(state.duration / 1000);

		const track = state.track_window?.current_track;
		if (track?.name !== undefined) events.named(describe(track));

		if (!state.paused) {
			wantPlaying = true;
			beginPoll();
			events.started();
			return;
		}

		endPoll();
		// ponytail: end-of-track is inferred from a pause at 0:00, because the SDK
		// reports no ended event and nothing distinguishes the two states. Upgrade
		// to comparing against the track's own length if a false ending shows up.
		if (wantPlaying && state.position === 0 && reportedDuration > 0) {
			wantPlaying = false;
			events.ended();
			return;
		}
		wantPlaying = false;
		events.timeChanged(position());
		events.stopped();
	}

	function beginPoll(): void {
		if (stopPoll) return;
		stopPoll = schedule(() => {
			void (async () => {
				const state = await player?.getCurrentState();
				if (state) {
					known = state.position / 1000;
					if (state.duration > 0) reportDuration(state.duration / 1000);
				}
				if (target !== undefined) {
					targetPolls += 1;
					if (Math.abs(known - target) <= settleToleranceSeconds || targetPolls >= settleMaxPolls) {
						target = undefined;
					}
				}
				events.timeChanged(position());
			})();
		}, spotifyPollIntervalMs);
	}

	function endPoll(): void {
		stopPoll?.();
		stopPoll = undefined;
	}

	/**
	 * Build the player and wait for Spotify to hand back a device.
	 *
	 * Held as one promise rather than re-run per call: `connect()` is a websocket
	 * and a device registration, and a second track in the same session must
	 * reuse the device rather than registering another one under the same name.
	 */
	function connect(): Promise<void> {
		ready ??= new Promise<void>((resolve, reject) => {
			const built = new (sdk as SpotifySdk).Player({
				name: 'LyricLint',
				getOAuthToken: (callback) => {
					void deps.token().then((token) => {
						if (token !== undefined) callback(token);
					});
				},
				volume: 1
			});
			player = built;

			built.addListener('ready', ((payload: { device_id: string }) => {
				deviceId = payload.device_id;
				resolve();
			}) as (payload: never) => void);

			built.addListener('not_ready', (() => {
				deviceId = undefined;
			}) as (payload: never) => void);

			built.addListener('player_state_changed', ((state: SpotifyPlaybackState | null) => {
				onStateChanged(state);
			}) as (payload: never) => void);

			for (const kind of [
				'initialization_error',
				'authentication_error',
				'account_error',
				'playback_error'
			]) {
				built.addListener(kind, ((payload: { message?: string }) => {
					const message =
						spotifyErrorMessages[kind] ?? payload?.message ?? 'Spotify could not play that track.';
					events.failed(message);
					// Only the errors that mean no device will ever arrive settle the
					// wait; a playback error on one track leaves the player usable.
					if (kind !== 'playback_error') reject(new Error(message));
				}) as (payload: never) => void);
			}

			void built.connect();
		});
		return ready;
	}

	/** The one call the SDK cannot make for itself: start this track here. */
	async function startPlayback(at: number): Promise<void> {
		if (trackId === undefined || deviceId === undefined) return;
		const response = await call(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				uris: [`spotify:track:${trackId}`],
				position_ms: Math.max(0, Math.round(at * 1000))
			})
		});
		if (response === undefined) return;
		if (!response.ok) {
			events.failed(
				response.status === 403
					? 'Spotify playback needs a Premium account. Attach a file instead.'
					: 'Spotify would not start that track.'
			);
			return;
		}
		started = true;
	}

	function teardown(): void {
		endPoll();
		try {
			player?.disconnect();
		} catch {
			// A player already gone is a player already disconnected.
		}
		player = undefined;
		deviceId = undefined;
		ready = undefined;
		started = false;
	}

	const source: SpotifySource = {
		kind: 'spotify',

		get time() {
			return position();
		},
		get duration() {
			return reportedDuration;
		},
		get rates() {
			return [1];
		},

		async load(nextTrackId, startAt) {
			if (nextTrackId !== trackId) started = false;
			trackId = nextTrackId;
			known = startAt ?? 0;
			// Shown at once, the way a restored file position is, and held for the
			// same reason: the player is not there yet to be asked.
			target = startAt;
			targetPolls = 0;
			reportedDuration = Number.NaN;
			wantPlaying = false;

			try {
				sdk = await deps.loadSdk();
			} catch {
				events.failed('The Spotify player could not be loaded.');
				return;
			}

			events.ratesChanged([1]);
			// The metadata is what makes attaching silent — it is the whole of what
			// the strip needs before a first press, and it costs no sound.
			await fetchTrack(nextTrackId);
			try {
				await connect();
			} catch {
				// Already reported through `failed` by the listener that rejected.
			}
		},

		play() {
			wantPlaying = true;
			void (async () => {
				if (!started) {
					await startPlayback(target ?? known);
					return;
				}
				await player?.resume();
			})();
		},

		pause() {
			wantPlaying = false;
			void player?.pause();
		},

		seek(seconds) {
			target = seconds;
			targetPolls = 0;
			known = seconds;
			// Before the first press there is no track on the device to seek in, so
			// the position is simply remembered and spent as `position_ms` when the
			// track finally starts.
			if (started) void player?.seek(Math.max(0, Math.round(seconds * 1000)));
		},

		setRate() {
			// Spotify has no rate control at any layer. `rates` says so, and the
			// transport has already narrowed its offer to the one rate.
		},

		clear() {
			teardown();
			trackId = undefined;
			target = undefined;
			targetPolls = 0;
			known = 0;
			wantPlaying = false;
			reportedDuration = Number.NaN;
		},

		destroy() {
			source.clear();
		}
	};

	return source;
}

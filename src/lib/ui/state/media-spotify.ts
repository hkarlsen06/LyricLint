// Decision record: docs/subsystems/media-spotify.md — read it before changing this file, and update it with any behavior change.
import type { MediaSource, MediaSourceEvents, SongDetails } from './media-player.svelte.js';
import type { PollScheduler } from './media-youtube.js';
import {
	remoteLoadTimeoutMs,
	remotePollIntervalMs,
	remoteSearchLimit,
	remoteSeekSettled
} from './media-remote-policy.js';

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

/**
 * How long the SDK script has to answer before the load is called a failure.
 *
 * The same twenty seconds the YouTube loader allows, and for the same reason:
 * a script that never runs — an extension blocking it, a content policy, a
 * stalled CDN — otherwise leaves this promise pending for the life of the page,
 * and every `finally` behind it with it. `attachSpotifyTrack` clears `busy` in
 * one of those, so a hung script does not cost a track, it costs the picker.
 */
const webApi = 'https://api.spotify.com/v1';
const sdkScriptUrl = 'https://sdk.scdn.co/spotify-player.js';

interface SpotifyTrack {
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

/**
 * What each SDK event this module listens for carries.
 *
 * Hand-written for the reason `SpotifyPlayerLike` is — Spotify ships no types
 * this module can hold them to — and it is what keeps a listener from having to
 * be cast on its way in. The four error events carry one shape between them.
 */
export interface SpotifyPlayerEventMap {
	ready: { device_id: string };
	not_ready: { device_id: string };
	player_state_changed: SpotifyPlaybackState | null;
	initialization_error: { message?: string };
	authentication_error: { message?: string };
	account_error: { message?: string };
	playback_error: { message?: string };
}

/** Whatever one of those events carries, for a stub that emits any of them. */
export type SpotifyPlayerEvent = SpotifyPlayerEventMap[keyof SpotifyPlayerEventMap];

/** Spotify's player, narrowed to what the transport actually calls. */
export interface SpotifyPlayerLike {
	connect(): Promise<boolean>;
	disconnect(): void;
	addListener<K extends keyof SpotifyPlayerEventMap>(
		event: K,
		listener: (payload: SpotifyPlayerEventMap[K]) => void
	): boolean;
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
		// SAFETY: the SDK installs itself as a property of the global object, which
		// is all this claims — both properties are optional, so the branches below
		// are what establish either is there.
		const scope = globalThis as SpotifyGlobal;
		if (scope.Spotify?.Player) {
			resolve(scope.Spotify);
			return;
		}

		// Armed only once the script is actually in the document, so nothing here
		// leaves a timer running in an environment that has no DOM to load into.
		let timeout: ReturnType<typeof setTimeout> | undefined = undefined;

		// The SDK announces itself by calling a global, the way Google's does.
		// Chaining whatever was there keeps this from being the one thing on the
		// page allowed to own that name.
		const previous = scope.onSpotifyWebPlaybackSDKReady;
		scope.onSpotifyWebPlaybackSDKReady = () => {
			previous?.();
			clearTimeout(timeout);
			if (scope.Spotify?.Player) resolve(scope.Spotify);
			else reject(new Error('The Spotify player did not load.'));
		};

		const script = document.createElement('script');
		script.src = sdkScriptUrl;
		script.async = true;
		script.addEventListener('error', () => {
			clearTimeout(timeout);
			reject(new Error('The Spotify player could not be reached.'));
		});
		document.head.appendChild(script);
		timeout = setTimeout(
			() => reject(new Error('The Spotify player did not load in time.')),
			remoteLoadTimeoutMs
		);
	});

	// A wrapper around `attempt` rather than the promise itself, so that a failure
	// raised while this function is still running — a document that cannot be
	// written to — is forgotten too, by which time the assignment has happened.
	injected = (async () => {
		try {
			return await attempt;
		} catch (failure) {
			injected = undefined;
			throw failure;
		}
	})();
	return injected;
}

/**
 * What the SDK's error events mean, in the words the strip has room for.
 *
 * `account_error` is the one nearly everyone who hits a wall here will hit: the
 * Web Playback SDK refuses free accounts outright, and the SDK's own message for
 * it says nothing a user can act on.
 */
const spotifyErrorMessages = new Map<string, string>([
	['account_error', 'Spotify playback needs a Premium account. Attach a file instead.'],
	['authentication_error', 'That Spotify sign-in expired. Add the track again to sign in.'],
	['initialization_error', 'This browser cannot run the Spotify player. Attach a file instead.']
]);

type SpotifyUrlResult = { trackId: string } | { error: string };

const trackIdPattern = /^[A-Za-z0-9]{22}$/;
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Whether this is a track id and nothing else.
 *
 * The parser's own alphabet, exported because an id that did not come from the
 * parser has to be held to it too: one arriving on a pasted fragment is a string
 * somebody else wrote, and it is interpolated into a path on `api.spotify.com`
 * that this session's own bearer token is sent with.
 */
export function isSpotifyTrackId(id: string): boolean {
	return trackIdPattern.test(id);
}

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
		new URLSearchParams({ q: trimmed, type: 'track', limit: String(remoteSearchLimit) }).toString();

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

	// Annotated rather than asserted: `Response.json()` answers `any`, so the shape
	// is a claim either way — and the one field spent below is re-checked there.
	const payload: { tracks?: { items?: ({ id?: string } & SpotifyTrack)[] } } | undefined =
		await response.json().catch(() => undefined);

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

	/**
	 * A Web API call, with the failures it reports.
	 *
	 * `stale` is what keeps a superseded call quiet. A read for the track the user
	 * has just moved off still has to be waited out, and reporting its refusal
	 * would put an error on the strip about a track that is no longer attached —
	 * the same staleness the success path has always checked, on the half that was
	 * left unguarded.
	 */
	async function call(
		path: string,
		init?: RequestInit,
		stale?: () => boolean
	): Promise<Response | undefined> {
		const token = await deps.token();
		if (token === undefined) {
			if (!stale?.()) {
				events.failed('That Spotify sign-in expired. Add the track again to sign in.');
			}
			return undefined;
		}
		try {
			return await request(`${webApi}${path}`, {
				...init,
				headers: { ...init?.headers, authorization: `Bearer ${token}` }
			});
		} catch {
			if (!stale?.()) events.failed('Spotify could not be reached.');
			return undefined;
		}
	}

	/** Name and length without playing a note, so attaching stays silent. */
	async function fetchTrack(id: string): Promise<void> {
		// Encoded even though every id reaching here has been held to the track
		// alphabet: this is the one path where a string somebody else wrote is
		// interpolated into a URL that carries this session's bearer token.
		const response = await call(
			`/tracks/${encodeURIComponent(id)}`,
			undefined,
			() => trackId !== id
		);
		// Deliberately quiet, and deliberately not a retry. A refused read costs a
		// name and a cover; the track itself still plays, so reporting it through
		// `failed` would replace the scrubber with a sentence about a song the user
		// can hear. What the label falls back to is the provisional one the attach
		// carried, and the cover band draws that rather than nothing — the anonymous
		// playback this used to produce was the band waiting on a picture, not this.
		if (!response?.ok) return;
		// Annotated rather than asserted, exactly as the search read above is: the
		// name is what decides whether anything here is reported at all.
		const track: SpotifyTrack | undefined = await response.json().catch(() => undefined);
		if (track?.name === undefined || trackId !== id) return;
		events.named(describe(track));
		// The read that pays for the name carries the cover with it, so this costs
		// no second request. Widest first is Spotify's own order.
		events.artworkChanged(track.album?.images?.[0]?.url);
		// The two halves of that name, for the band that sets them at opposite ends
		// of a row. Everything else Spotify would need for the tools panel's list —
		// the label above all — is on a request this source does not make, so this
		// reports what it has rather than a shape with holes in it.
		// Built a field at a time rather than spread conditionally: a track with no
		// artist on it reports no artist, rather than one that is there and empty.
		const details: SongDetails = {};
		const artists = artistsOf(track);
		if (artists.length > 0) details.artist = artists.join(', ');
		details.title = track.name;
		events.detailsChanged(details);
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
					if (remoteSeekSettled(known, target, targetPolls)) {
						target = undefined;
					}
				}
				events.timeChanged(position());
			})();
		}, remotePollIntervalMs);
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
	function connect(sdk: SpotifySdk): Promise<void> {
		ready ??= new Promise<void>((resolve, reject) => {
			let settled = false;
			const timeout = setTimeout(() => {
				if (settled) return;
				settled = true;
				const message = 'The Spotify player could not be loaded.';
				events.failed(message);
				reject(new Error(message));
			}, remoteLoadTimeoutMs);
			const fail = (message: string) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				events.failed(message);
				reject(new Error(message));
			};
			const built = new sdk.Player({
				name: 'LyricLint',
				getOAuthToken: (callback) => {
					void deps.token().then((token) => {
						if (token !== undefined) {
							callback(token);
							return;
						}
						// A refused refresh, and the SDK has nowhere to report it: the
						// callback is simply never made, and it arms no timeout of its
						// own. Left silent, a session that expired mid-track took the
						// transport dead with it — the glyphs answered and nothing
						// happened, forever. Before the device arrives `fail` also
						// settles `connect()`, which would otherwise wait out the
						// 20-second timeout and then blame the loader.
						const message = 'That Spotify sign-in expired. Add the track again to sign in.';
						if (settled) events.failed(message);
						else fail(message);
					});
				},
				volume: 1
			});
			player = built;

			built.addListener('ready', (payload) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				deviceId = payload.device_id;
				resolve();
			});

			built.addListener('not_ready', () => {
				deviceId = undefined;
			});

			built.addListener('player_state_changed', (state) => {
				onStateChanged(state);
			});

			for (const kind of [
				'initialization_error',
				'authentication_error',
				'account_error',
				'playback_error'
			] as const) {
				built.addListener(kind, (payload) => {
					const message =
						spotifyErrorMessages.get(kind) ??
						payload?.message ??
						'Spotify could not play that track.';
					// Only the errors that mean no device will ever arrive settle the
					// wait; a playback error on one track leaves the player usable.
					if (kind === 'playback_error' || settled) events.failed(message);
					else fail(message);
				});
			}

			void built
				.connect()
				.then((connected) => {
					if (!connected) fail('The Spotify player could not be loaded.');
				})
				.catch(() => fail('The Spotify player could not be loaded.'));
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

			let sdk: SpotifySdk;
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
				// The SDK is handed over rather than held in the closure: `connect`
				// memoizes its own promise, so a second track reuses the device this
				// built, and the only caller is the one that has just loaded it.
				await connect(sdk);
			} catch {
				// Already reported through `failed` by the listener that rejected.
				teardown();
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
			})().catch(() => events.failed('Spotify could not play that track.'));
		},

		pause() {
			wantPlaying = false;
			void player?.pause().catch(() => events.stopped());
		},

		seek(seconds) {
			target = seconds;
			targetPolls = 0;
			known = seconds;
			// Before the first press there is no track on the device to seek in, so
			// the position is simply remembered and spent as `position_ms` when the
			// track finally starts.
			if (started) {
				void player
					?.seek(Math.max(0, Math.round(seconds * 1000)))
					.catch(() => events.failed('Spotify could not play that track.'));
			}
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

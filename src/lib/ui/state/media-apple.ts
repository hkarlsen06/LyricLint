// Decision record: docs/subsystems/media-apple.md — read it before changing this file, and update it with any behavior change.
import type { MediaSource, MediaSourceEvents, SongDetails } from './media-player.svelte.js';
import { remoteLoadTimeoutMs, remoteSearchLimit } from './media-remote-policy.js';

/**
 * Apple Music as a fourth source, and the first one with nothing to apologise for.
 *
 * It clears both of the things that make Spotify a local-only experiment. There
 * is no allowlist and no quota review: an Apple Developer Program membership
 * signs the token, and any Apple Music subscriber can then use it — so this is
 * the one remote source the deployed build can actually offer. And it has a
 * **playback rate**, which Spotify has at no layer, which makes it the better
 * source than YouTube for the job this application exists for.
 *
 * What it costs instead is a signature. The developer token is a JWT signed with
 * a Media Services private key and it expires within six months, which is a real
 * constraint on a folder of static files with no server behind it — see
 * `appleMusicConfigured`.
 */

const catalogApi = 'https://api.music.apple.com/v1';

/** The seek settle window, exactly as the other two remote bridges use it. */
const settleToleranceSeconds = 1;
/**
 * How many time events a held seek target survives.
 *
 * The other two bridges count polls at 250ms; this one counts MusicKit's own
 * `playbackTimeDidChange`, which is why the number is smaller — it is a backstop
 * for a `seekToTime` that never lands, not the ordinary path.
 */
export const settleMaxEvents = 4;
const musicKitScriptUrl = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

/** Where MusicKit puts a listener's payload. Narrowed to what is read. */
interface AppleMusicPlaybackStateEvent {
	state: number;
}

export interface AppleMusicTimeEvent {
	currentPlaybackTime?: number;
	currentPlaybackDuration?: number;
}

/**
 * What each MusicKit event this module listens for carries.
 *
 * Hand-written for the same reason `AppleMusicInstance` is, and it is what keeps
 * a listener from having to be cast on its way in. `mediaPlaybackError` is
 * `unknown` because this module reports the failure and reads no field of the
 * payload — naming fields nobody has verified would be a claim about Apple's
 * shape rather than a record of what is actually read.
 */
export interface AppleMusicEventMap {
	playbackTimeDidChange: AppleMusicTimeEvent;
	playbackStateDidChange: AppleMusicPlaybackStateEvent;
	mediaPlaybackError: unknown;
}

/**
 * Whether MusicKit filled a field of an event with a number.
 *
 * The interfaces above are hand-written rather than imported, so what is in a
 * payload is a claim this module makes and only a runtime check establishes —
 * and a field that arrived as something else must be skipped rather than passed
 * on as a duration or a playhead.
 */
function isReportedNumber(value: unknown): value is number {
	return typeof value === 'number';
}

/** What a song is queued with. Named so the queue can be built a field at a time. */
export interface AppleMusicQueueRequest {
	song: string;
	startPlaying?: boolean;
	startTime?: number;
}

/**
 * MusicKit's instance, narrowed to what the transport actually calls.
 *
 * Written out rather than imported because Apple ships no types for the web SDK,
 * and a hand-written interface is also the one place the surface this depends on
 * is documented — a stub in a test implements this and nothing else.
 *
 * The four commands are `Promise<void>` because that is the whole of the
 * contract this module holds MusicKit to: it awaits them and reads nothing back.
 */
export interface AppleMusicInstance {
	readonly isAuthorized: boolean;
	/** The user's storefront, which decides what a catalogue search can find. */
	readonly storefrontId: string;
	readonly currentPlaybackTime: number;
	readonly currentPlaybackDuration: number;
	playbackRate: number;
	authorize(): Promise<string>;
	setQueue(options: AppleMusicQueueRequest): Promise<void>;
	play(): Promise<void>;
	pause(): void;
	stop(): Promise<void>;
	seekToTime(seconds: number): Promise<void>;
	addEventListener<K extends keyof AppleMusicEventMap>(
		name: K,
		handler: (event: AppleMusicEventMap[K]) => void
	): void;
	removeEventListener<K extends keyof AppleMusicEventMap>(
		name: K,
		handler: (event: AppleMusicEventMap[K]) => void
	): void;
}

export interface MusicKitGlobal {
	configure(options: {
		developerToken: string;
		app: { name: string; build: string };
	}): Promise<AppleMusicInstance>;
	/** MusicKit's own state map, read rather than mirrored as constants here. */
	readonly PlaybackStates: Record<string, number>;
}

/**
 * How MusicKit arrives.
 *
 * Injected exactly as Google's and Spotify's loaders are, so that no test ever
 * reaches Apple and the script itself stays behind a press.
 */
export type MusicKitLoader = () => Promise<MusicKitGlobal>;

interface MusicKitWindow {
	MusicKit?: MusicKitGlobal;
}

let injected: Promise<MusicKitGlobal> | undefined;

/**
 * Fetch MusicKit — once, and never before something asks.
 *
 * The whole of this source's page-load network surface, and nothing calls it at
 * module scope. MusicKit announces itself with a `musickitloaded` event on the
 * document rather than a global callback, so that is what is waited on; a script
 * that has already run is detected by the global being there first.
 */
export function loadMusicKit(): Promise<MusicKitGlobal> {
	if (injected) return injected;

	const attempt = new Promise<MusicKitGlobal>((resolve, reject) => {
		// SAFETY: MusicKit installs itself as a property of the global object, which
		// is all this claims — the property is optional, so the branch below is what
		// establishes it is there.
		const scope = globalThis as MusicKitWindow;
		if (scope.MusicKit) {
			resolve(scope.MusicKit);
			return;
		}

		// Armed only once the script is actually in the document, so nothing here
		// leaves a timer running in an environment that has no DOM to load into.
		let timeout: ReturnType<typeof setTimeout> | undefined = undefined;

		document.addEventListener(
			'musickitloaded',
			() => {
				clearTimeout(timeout);
				if (scope.MusicKit) resolve(scope.MusicKit);
				else reject(new Error('Apple Music did not load.'));
			},
			{ once: true }
		);

		const script = document.createElement('script');
		script.src = musicKitScriptUrl;
		script.async = true;
		script.addEventListener('error', () => {
			clearTimeout(timeout);
			reject(new Error('Apple Music could not be reached.'));
		});
		document.head.appendChild(script);
		timeout = setTimeout(
			() => reject(new Error('Apple Music did not load in time.')),
			remoteLoadTimeoutMs
		);
	});

	// A failed load forgets itself, so a second attempt is a second attempt rather
	// than the first one's rejection handed back forever. It is a wrapper around
	// `attempt` rather than the promise itself, so that a rejection raised while
	// this function is still running — a document that cannot be written to — is
	// forgotten too, by which time the assignment below has happened.
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
 * The signed token this build carries, and **off unless a build sets one**.
 *
 * Unlike Spotify's client id, this is meant to be set in production — that is
 * the whole reason Apple Music is worth having. It is not a secret either: a
 * developer token is handed to every browser that loads the page, which is what
 * makes it safe to inline. The `.p8` private key that signs it never leaves the
 * machine that mints it.
 *
 * Vite resolves this at **build** time, so it has to be set where the build
 * runs — a Cloudflare Pages *build* variable, not a runtime one and not a
 * `wrangler secret`, neither of which reaches the bundle.
 */
function appleMusicDeveloperToken(): string | undefined {
	const configuredToken = import.meta.env.PUBLIC_APPLE_MUSIC_TOKEN?.trim();
	return configuredToken === undefined || configuredToken === '' ? undefined : configuredToken;
}

/**
 * When the token in this build stops working, in epoch milliseconds.
 *
 * Undefined for anything that is not a JWT with an `exp`, which is treated as
 * unusable rather than as unlimited — a token this module cannot read is one it
 * cannot vouch for. No signature check: the payload is public, the browser is
 * not the party being protected here, and Apple is the one that verifies it.
 */
export function appleMusicTokenExpiry(token: string): number | undefined {
	const payload = token.split('.')[1];
	if (payload === undefined) return undefined;
	try {
		const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const claims: unknown = JSON.parse(json);
		return hasNumericExpiry(claims) ? claims.exp * 1000 : undefined;
	} catch {
		return undefined;
	}
}

/** Whether a parsed JWT payload carries the one claim this module reads. */
function hasNumericExpiry(claims: unknown): claims is { exp: number } {
	return (
		typeof claims === 'object' &&
		claims !== null &&
		'exp' in claims &&
		typeof claims.exp === 'number'
	);
}

/**
 * Whether this build can honestly offer Apple Music.
 *
 * The expiry is checked rather than trusted, and that is the whole reason this
 * function is not just a presence test. A developer token lasts at most six
 * months, so the failure this application will actually meet is not a missing
 * token but a stale one — and a stale one fails as a 401 at the moment the user
 * presses something, several steps after the point where anything could have
 * said so. Checking `exp` here turns that into the picker simply not drawing an
 * answer it cannot carry out, which is the same rule `availableRates` and
 * `spotifyAvailable` both follow.
 *
 * Rotating it is one build variable and a redeploy.
 */
export function appleMusicConfigured(now = Date.now()): boolean {
	const token = appleMusicDeveloperToken();
	if (token === undefined) return false;
	const expiry = appleMusicTokenExpiry(token);
	return expiry !== undefined && expiry > now;
}

/**
 * Load MusicKit and hand back the configured instance for a given loader.
 *
 * Memoized because MusicKit is a singleton on the page — configuring it twice
 * returns the same object anyway, and holding the promise means a search and the
 * attach that follows it share one script load rather than racing two.
 *
 * **Keyed on the loader, not held in one module-level slot**, and that is a
 * correction rather than caution. A single slot is right for the page, where
 * `loadMusicKit` is the only loader there will ever be — and wrong everywhere
 * two players exist in one process, because the second silently inherits the
 * first one's instance. That is a test double answering for a stub it was never
 * given, which is exactly the kind of agreement between a suite and a bug this
 * codebase has been bitten by before. Production still gets one instance,
 * because production passes one loader.
 */
let configuredFor = new WeakMap<MusicKitLoader, Promise<AppleMusicInstance>>();

export function configureAppleMusic(
	load: MusicKitLoader = loadMusicKit
): Promise<AppleMusicInstance> {
	const existing = configuredFor.get(load);
	if (existing) return existing;

	const configuring = (async () => {
		const token = appleMusicDeveloperToken();
		if (token === undefined) throw new Error('Apple Music is not configured for this build.');
		const musicKit = await load();
		return await musicKit.configure({
			developerToken: token,
			app: { name: 'LyricLint', build: '1' }
		});
	})();

	// A wrapper rather than the attempt itself, so a configure that fails
	// synchronously is still forgotten after the map below has been written.
	const attempt = (async () => {
		try {
			return await configuring;
		} catch (failure) {
			configuredFor.delete(load);
			throw failure;
		}
	})();

	configuredFor.set(load, attempt);
	return attempt;
}

/** Test seam: forget the loaded SDK and every configured instance. */
export function resetAppleMusic(): void {
	injected = undefined;
	configuredFor = new WeakMap();
}

/**
 * How a sign-in ended, which is four things and not two.
 *
 * `blocked` is the one worth naming separately: it is not the user declining and
 * it is not Apple failing, it is the browser refusing to open the window, and it
 * is the only one of the four whose repair is a browser setting rather than
 * another press.
 */
type AppleAuthorizationOutcome = 'authorized' | 'blocked' | 'refused' | 'unanswered';

/** What the user is told, per outcome. `authorized` says nothing. */
function appleSignInMessage(outcome: AppleAuthorizationOutcome): string | undefined {
	if (outcome === 'authorized') return undefined;
	if (outcome === 'blocked') {
		return 'Apple Music’s sign-in window was blocked. Allow pop-ups for this site, then press again.';
	}
	if (outcome === 'refused') return 'Apple Music sign-in was cancelled.';
	return 'Apple Music sign-in did not finish.';
}

/**
 * The backstop, and it is deliberately long enough to be useless as a timeout.
 *
 * A sign-in is a person typing an Apple ID, a password and a code from another
 * device, so any duration short enough to feel like a timeout is short enough to
 * cut off somebody halfway through their two-factor prompt — and cancelling a
 * sign-in the user is *in the middle of* is a worse bug than the hang this
 * replaces. The blocked-window detection below is what actually answers quickly;
 * this only exists so that a MusicKit which stops using `window.open` cannot
 * bring back an unbounded wait.
 */
const signInBackstopMs = 5 * 60_000;

type WindowOpen = (typeof globalThis)['open'];

/**
 * Whether this scope has a `window.open` to watch at all.
 *
 * The DOM's own typing says it always does, and outside a browser there is no
 * such function — which is a fact only a runtime check establishes, and the one
 * that keeps this wrapper safe to call anywhere.
 */
function isWindowOpen(value: unknown): value is WindowOpen {
	return typeof value === 'function';
}

/**
 * Sign in, and never hang doing it.
 *
 * `authorize()` opens Apple's sign-in in a pop-up, and MusicKit's own bookkeeping
 * has no answer for one that never opened:
 *
 * ```js
 * this._window = window.open(e, this.target, m) || void 0;
 * _startPollingForWindowClosed(e){ this._window && … setInterval(…) }
 * ```
 *
 * The interval is the only thing that ever settles the promise, and it is guarded
 * on the window existing — so a blocked pop-up is not a rejection, it is silence
 * for the rest of the page's life. Everything downstream inherits that silence:
 * `load` never returns, `reconnect`'s `finally` never runs, `busy` stays true,
 * and the picker's search button — disabled on `busy` — reads as a dead dialog in
 * a completely different part of the workbench. One unsettled promise presenting
 * as three unrelated faults is the whole reason this wrapper exists.
 *
 * So the block is **observed rather than waited out**: `window.open` is patched
 * for the length of the call, and a `null` return resolves the race at once. That
 * is the exact condition MusicKit cannot recover from, which is what makes it a
 * better signal than any duration — the user is told about their pop-up blocker
 * while the sign-in they asked for is still the thing on their mind.
 *
 * The patch is restored in a `finally`, including on the success path, and a
 * `null` return is still handed back to MusicKit unchanged: this watches the
 * call, it does not change what the SDK sees.
 */
export async function authorizeAppleMusic(
	instance: AppleMusicInstance,
	deps: { scope?: { open: WindowOpen }; timeoutMs?: number } = {}
): Promise<AppleAuthorizationOutcome> {
	const scope = deps.scope ?? globalThis;
	const timeoutMs = deps.timeoutMs ?? signInBackstopMs;

	let reportBlocked: (() => void) | undefined;
	const blocked = new Promise<'blocked'>((resolve) => {
		reportBlocked = () => resolve('blocked');
	});

	// Nowhere to open a window is not the same as a window being refused: there is
	// simply nothing to watch, and the backstop is the whole guarantee. This is
	// what keeps the wrapper safe to call outside a browser.
	const nativeOpen = scope.open;
	const watchable = isWindowOpen(nativeOpen);
	if (watchable) {
		scope.open = function patchedOpen(...args: Parameters<WindowOpen>) {
			const opened = nativeOpen.apply(scope, args);
			if (!opened) reportBlocked?.();
			return opened;
		};
	}

	let timer: ReturnType<typeof setTimeout> | undefined;
	const expired = new Promise<'unanswered'>((resolve) => {
		timer = setTimeout(() => resolve('unanswered'), timeoutMs);
	});

	try {
		return await Promise.race([
			instance.authorize().then(
				() => 'authorized' as const,
				() => 'refused' as const
			),
			blocked,
			expired
		]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		if (watchable) scope.open = nativeOpen;
	}
}

type AppleMusicUrlResult = { songId: string } | { error: string };

const songIdPattern = /^\d{1,20}$/;
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Whether this is a song id and nothing else.
 *
 * The parser's own alphabet, exported because an id that did not come from the
 * parser has to be held to it too: one arriving on a pasted fragment is a string
 * somebody else wrote, and it goes into a catalogue path.
 */
export function isAppleMusicSongId(id: string): boolean {
	return songIdPattern.test(id);
}

const notALink = 'That is not an Apple Music link.';
const noSong = 'That link is not a song — albums and playlists cannot be transcribed against.';

/**
 * Turn whatever the user pasted into a song id.
 *
 * Apple's share sheet copies an *album* URL with the song hanging off it as
 * `?i=`, which is the form nearly everybody will paste: the path names the
 * album and the query names the track. `/song/…/{id}` is the other form, from
 * a song's own page. The query is checked first, because an album link with an
 * `i` on it has a valid album id in the path that would otherwise win and
 * attach the wrong thing.
 */
export function parseAppleMusicSongId(input: string): AppleMusicUrlResult {
	const trimmed = input.trim();
	if (trimmed === '') return { error: 'Paste an Apple Music song link.' };

	if (songIdPattern.test(trimmed)) return { songId: trimmed };

	let url: URL;
	try {
		url = new URL(schemePattern.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return { error: notALink };
	}

	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	if (host !== 'music.apple.com' && host !== 'embed.music.apple.com') return { error: notALink };

	const withinAlbum = url.searchParams.get('i');
	if (withinAlbum !== null) {
		return songIdPattern.test(withinAlbum) ? { songId: withinAlbum } : { error: noSong };
	}

	const segments = url.pathname.split('/').filter((segment) => segment !== '');
	const kindAt = segments.lastIndexOf('song');
	if (kindAt === -1) return { error: noSong };

	// `/song/{slug}/{id}` is the usual shape, but the slug is optional, so the id
	// is whichever of the next two segments is one.
	const candidate = [segments[kindAt + 1], segments[kindAt + 2]].find(
		(segment) => segment !== undefined && songIdPattern.test(segment)
	);
	return candidate === undefined ? { error: noSong } : { songId: candidate };
}

export interface AppleMusicSearchResult {
	songId: string;
	/** Already in the form the strip and the roster of results both want. */
	name: string;
	durationSeconds: number;
}

export type AppleMusicSearchOutcome = { results: AppleMusicSearchResult[] } | { error: string };

interface CatalogSong {
	id?: string;
	attributes?: {
		name?: string;
		artistName?: string;
		durationInMillis?: number;
		artwork?: { url?: string };
		releaseDate?: string;
		/** One flat string, and Apple's only answer to "who wrote this". */
		composerName?: string;
		isrc?: string;
		albumName?: string;
	};
	/** Present only where the read asked for `include=albums`. */
	relationships?: {
		albums?: { data?: { attributes?: { recordLabel?: string } }[] };
	};
}

/**
 * How wide a cover the panel asks Apple for.
 *
 * Their artwork `url` is a template with `{w}` and `{h}` in it rather than a
 * finished address, so a size has to be chosen here — the CDN renders whatever
 * is asked for. The panel is 21rem at its narrowest, so this is roughly twice
 * that: enough for a retina screen without fetching a 3000px master to draw a
 * few hundred pixels wide.
 */
const artworkSize = 640;

function artworkUrl(attributes: CatalogSong['attributes']): string | undefined {
	const template = attributes?.artwork?.url;
	if (template === undefined || template === '') return undefined;
	return template.replace('{w}', String(artworkSize)).replace('{h}', String(artworkSize));
}

/**
 * The song's facts, for a page being filled in somewhere else.
 *
 * Every field is dropped rather than emptied when the catalogue does not carry
 * it, so a list of these is a list of things that are actually known. The label
 * comes from the album relationship because a song carries none of its own —
 * which is why the read asks for `include=albums` rather than making a second
 * request for one string.
 *
 * Producers are not here because Apple has none to give: the public catalogue
 * has no credits resource, and the Music app's Credits screen is fed by an
 * endpoint they do not publish.
 */
function songDetails(song: CatalogSong): SongDetails | undefined {
	const attributes = song.attributes;
	const details: SongDetails = {};
	if (attributes?.artistName) details.artist = attributes.artistName;
	if (attributes?.name) details.title = attributes.name;
	if (attributes?.releaseDate) details.releaseDate = attributes.releaseDate;
	if (attributes?.composerName) details.writers = attributes.composerName;
	if (attributes?.isrc) details.isrc = attributes.isrc;
	if (attributes?.albumName) details.album = attributes.albumName;
	const label = song.relationships?.albums?.data?.[0]?.attributes?.recordLabel;
	if (label) details.label = label;
	return Object.keys(details).length === 0 ? undefined : details;
}

function describe(attributes: CatalogSong['attributes']): string {
	const name = attributes?.name ?? '';
	const artist = attributes?.artistName;
	return artist === undefined || artist === '' ? name : `${artist} — ${name}`;
}

async function catalog(
	path: string,
	deps: { token: string; request: typeof fetch }
): Promise<Response | undefined> {
	try {
		return await deps.request(`${catalogApi}${path}`, {
			headers: { authorization: `Bearer ${deps.token}` }
		});
	} catch {
		return undefined;
	}
}

/**
 * Find a song by name, so nobody has to go and fetch a link.
 *
 * The catalogue is public data and the developer token is all it needs, so this
 * runs *before* any sign-in — which is one better than Spotify, where searching
 * is what triggers the OAuth redirect. What it does need is a storefront, and
 * that is why it takes the configured instance rather than a bare token: a
 * search against the wrong storefront returns songs the user's subscription
 * cannot play, which is the same class of wrong answer as offering a rate that
 * will not apply.
 */
export async function searchAppleMusicSongs(
	query: string,
	deps: {
		music: () => Promise<AppleMusicInstance>;
		token?: () => string | undefined;
		request?: typeof fetch;
	}
): Promise<AppleMusicSearchOutcome> {
	const trimmed = query.trim();
	if (trimmed === '') return { results: [] };

	const token = (deps.token ?? appleMusicDeveloperToken)();
	if (token === undefined) return { error: 'Apple Music is not configured for this build.' };

	let music: AppleMusicInstance;
	try {
		music = await deps.music();
	} catch {
		return { error: 'Apple Music could not be loaded.' };
	}

	const request = deps.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
	const search = new URLSearchParams({
		term: trimmed,
		types: 'songs',
		limit: String(remoteSearchLimit)
	}).toString();

	const response = await catalog(
		`/catalog/${encodeURIComponent(music.storefrontId)}/search?${search}`,
		{ token, request }
	);
	if (response === undefined) return { error: 'Apple Music could not be reached.' };
	if (!response.ok) {
		return {
			error:
				response.status === 401
					? 'This build’s Apple Music token has expired.'
					: 'Apple Music could not be searched just now.'
		};
	}

	// Annotated rather than asserted: `Response.json()` answers `any`, so the shape
	// is a claim either way — and every field of it is optional and read through an
	// optional chain, with the one field that is spent re-checked below.
	const payload: { results?: { songs?: { data?: CatalogSong[] } } } | undefined = await response
		.json()
		.catch(() => undefined);

	return {
		results: (payload?.results?.songs?.data ?? [])
			.filter((song): song is CatalogSong & { id: string } => typeof song.id === 'string')
			.map((song) => ({
				songId: song.id,
				name: describe(song.attributes),
				durationSeconds: (song.attributes?.durationInMillis ?? 0) / 1000
			}))
	};
}

export interface AppleMusicSourceDependencies {
	events: MediaSourceEvents;
	/** The configured MusicKit instance, injected so a test drives a stub. */
	music: () => Promise<AppleMusicInstance>;
	/** MusicKit's own state map, read from the SDK rather than mirrored here. */
	playbackStates: () => Promise<Record<string, number>>;
	/** What this source may be asked to play at. The workbench's full offer. */
	rates: readonly number[];
	/** Injectable so a test answers the catalogue without a network. */
	request?: typeof fetch;
	token?: () => string | undefined;
	/**
	 * How a sign-in is asked for, injected so a test can be blocked without a
	 * browser. Defaults to the wrapper that cannot hang.
	 */
	authorize?: (instance: AppleMusicInstance) => Promise<AppleAuthorizationOutcome>;
}

export interface AppleMusicSource extends MediaSource {
	/** Point at a song. Resolves once the metadata is in, not once it plays. */
	load(songId: string, startAt?: number): Promise<void>;
}

/**
 * Apple Music as something the transport can drive.
 *
 * It is the least asymmetric of the three remote sources, and worth stating why,
 * because each difference is a piece of machinery the other two need and this
 * one does not:
 *
 * - **There is a cue.** `setQueue({ startPlaying: false })` points the player at
 *   a song without a note of sound, so attaching is silent for the same reason
 *   YouTube's is, rather than by deferring the start the way Spotify has to.
 * - **There is a `playbackTimeDidChange` event**, so nothing here polls. The
 *   YouTube and Spotify bridges both run a 250ms timer because their players
 *   report no such thing; this one is as event-driven as a media element.
 * - **There is a rate**, and it is the reason to prefer this over both of them.
 *
 * What it does share with Spotify is that a seek before the first press has
 * nowhere to land: `seekToTime` needs a `nowPlayingItem`, which does not exist
 * until playback has started. So a restored position is spent as `startTime` on
 * the queue rather than as a seek, and `started` is what tells the two apart —
 * and a seek made in that window is remembered and spent on the first play, by
 * rebuilding the queue around it, which is the same debt Spotify settles as
 * `position_ms`.
 */
export function createAppleMusicSource(deps: AppleMusicSourceDependencies): AppleMusicSource {
	const events = deps.events;

	let music: AppleMusicInstance | undefined;
	let states: Record<string, number> | undefined;

	let songId: string | undefined;
	let started = false;
	let known = 0;
	// Where the queue was built to start. A seek before the first press has no
	// `nowPlayingItem` to land in, so `known` is all it can move — and the first
	// play compares the two to know whether the queue still points at the right
	// moment or has to be rebuilt around the seek.
	let queuedAt = 0;
	let reportedDuration = Number.NaN;
	let rate = 1;

	// The position the player has been told to go to, held until it agrees.
	// MusicKit answers a `seekToTime` with one or more `playbackTimeDidChange`
	// events still carrying the position the user just left, so without this the
	// readout goes target, back to where it was, and only then to the new time —
	// which is the async gap the YouTube and Spotify bridges already hide.
	let target: number | undefined;
	// Where that seek started from. The stale burst above all carries this
	// position, so it is how a stale event is told from a real one: an event still
	// at the origin is the burst and is held through, while one that has moved
	// somewhere that is neither the origin nor the target is a seek the player
	// redirected or ignored, and only those count toward giving the hold up.
	// Counting the burst instead — which is what an event tally alone did — spent
	// the whole budget before the seek landed and dropped the readout back to the
	// origin for a tick, the "flash to the previous line" a skip was reported to
	// show.
	let origin: number | undefined;
	let targetEvents = 0;

	/**
	 * MusicKit's own playhead, read now rather than remembered.
	 *
	 * `known` is written by `playbackTimeDidChange` and by nothing else, so a
	 * source answering `time` from it hands the *same* stale number to the mirror
	 * and to `liveTime()` — and `liveTime()` is what a sync tap stamps. Every
	 * anchor was therefore written early by however long had passed since the last
	 * event, by a different amount each tap, which is the one thing the
	 * live-versus-mirror split exists to prevent: on playback the wash led the
	 * vocal, and it led it by a different distance on every line.
	 *
	 * `currentPlaybackTime` is the live property, exactly as YouTube's
	 * `getCurrentTime()` is, and it is read the same defensive way — the two
	 * bridges front third-party players that are entitled to throw.
	 *
	 * Only once playback has started. Before the first press there is no
	 * `nowPlayingItem` for the property to describe, and `known` is the restored
	 * position the queue was built around — the same distinction `seek` makes one
	 * screen down, and reading live through it would report a reopened draft at
	 * 0:00 until something pressed play.
	 */
	function rawTime(): number {
		if (!music || !started) return known;
		try {
			// `Number.isFinite` coerces nothing, so it is also the check that this is
			// a number at all — MusicKit is untyped and entitled to answer anything.
			const value = music.currentPlaybackTime;
			return Number.isFinite(value) ? value : known;
		} catch {
			return known;
		}
	}

	function position(): number {
		return target ?? rawTime();
	}

	function reportDuration(seconds: number): void {
		const next = Number.isFinite(seconds) && seconds > 0 ? seconds : Number.NaN;
		if (next === reportedDuration || (Number.isNaN(next) && Number.isNaN(reportedDuration))) {
			return;
		}
		reportedDuration = next;
		events.durationChanged(next);
	}

	function onTime(event: AppleMusicTimeEvent): void {
		if (isReportedNumber(event.currentPlaybackDuration)) {
			reportDuration(event.currentPlaybackDuration);
		}
		if (!isReportedNumber(event.currentPlaybackTime)) return;
		known = event.currentPlaybackTime;
		if (target !== undefined) {
			if (Math.abs(known - target) <= settleToleranceSeconds) {
				// The seek landed. Stop holding and report the player's own time.
				target = undefined;
				origin = undefined;
				targetEvents = 0;
			} else if (origin === undefined || Math.abs(known - origin) > settleToleranceSeconds) {
				// The player has moved off the position it was seeked from but not
				// onto the target — a seek it redirected or ignored, so count it
				// toward giving the hold up rather than stranding the readout on a
				// moment nothing is playing from. The events still carrying the origin
				// are the stale burst and are deliberately not counted, or the burst
				// would spend the budget and flash the readout back.
				targetEvents += 1;
				if (targetEvents >= settleMaxEvents) {
					target = undefined;
					origin = undefined;
					targetEvents = 0;
				}
			}
		}
		events.timeChanged(position());
	}

	function onState(event: AppleMusicPlaybackStateEvent): void {
		const map = states ?? {};
		if (event.state === map.playing) {
			started = true;
			events.started();
			return;
		}
		if (event.state === map.ended || event.state === map.completed) {
			events.ended();
			return;
		}
		if (event.state === map.paused || event.state === map.stopped) events.stopped();
	}

	function onError(): void {
		events.failed('Apple Music could not play that song.');
	}

	function listen(instance: AppleMusicInstance): void {
		instance.addEventListener('playbackTimeDidChange', onTime);
		instance.addEventListener('playbackStateDidChange', onState);
		// Named rather than anonymous, because `removeEventListener` needs the same
		// reference: an anonymous one is a listener on a page singleton that no
		// teardown can ever take off again.
		instance.addEventListener('mediaPlaybackError', onError);
	}

	/** Name and length without playing a note, so attaching stays silent. */
	async function fetchSong(instance: AppleMusicInstance, id: string): Promise<void> {
		const token = (deps.token ?? appleMusicDeveloperToken)();
		if (token === undefined) return;
		const request = deps.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
		// `include=albums` rather than a second request: a song carries no label of
		// its own, and the album relationship is the only place Apple keeps one.
		const response = await catalog(
			`/catalog/${encodeURIComponent(instance.storefrontId)}/songs/${encodeURIComponent(id)}?include=albums`,
			{ token, request }
		);
		// Quiet for the reason the Spotify read is: a refused catalogue read costs a
		// title and a cover, and the queue is already built — reporting it through
		// `failed` would put an error on the strip about a song that plays. The
		// label stays the provisional one the attach carried, and the cover band
		// draws it rather than waiting on a picture that is not coming.
		if (!response?.ok) return;
		// Annotated rather than asserted, exactly as the search read above is.
		const payload: { data?: CatalogSong[] } | undefined = await response
			.json()
			.catch(() => undefined);
		const song = payload?.data?.[0];
		if (song?.attributes?.name === undefined || songId !== id) return;
		events.named(describe(song.attributes));
		events.artworkChanged(artworkUrl(song.attributes));
		events.detailsChanged(songDetails(song));
		if (song.attributes.durationInMillis !== undefined) {
			reportDuration(song.attributes.durationInMillis / 1000);
		}
	}

	const source: AppleMusicSource = {
		kind: 'apple',

		get time() {
			return position();
		},
		get duration() {
			return reportedDuration;
		},
		get rates() {
			return deps.rates;
		},

		async load(nextSongId, startAt) {
			if (nextSongId !== songId) started = false;
			songId = nextSongId;
			known = startAt ?? 0;
			target = undefined;
			reportedDuration = Number.NaN;

			let instance: AppleMusicInstance;
			try {
				instance = await deps.music();
				states ??= await deps.playbackStates();
			} catch {
				events.failed('Apple Music could not be loaded.');
				return;
			}
			if (songId !== nextSongId) return;

			if (music !== instance) {
				music = instance;
				listen(instance);
			}

			// The rate is the reason this source exists, so it is claimed back on
			// every attach: switching here from a Spotify track would otherwise leave
			// the transport's offer narrowed to the single rate that one reported.
			events.ratesChanged(deps.rates);

			// A sign-in is only asked for where there is not one already. MusicKit
			// keeps its own user token between sessions, so a returning subscriber
			// usually passes straight through — the same trade the file source makes
			// with a permission already granted for this origin.
			//
			// **Per origin**, which is why this branch is so rarely exercised and was
			// wrong for so long: moving a dev server to a new hostname is enough to
			// make every subscriber a first-time one again.
			//
			// It goes through `authorizeAppleMusic` rather than calling `authorize`
			// directly because a blocked pop-up leaves MusicKit's own promise
			// unsettled forever — see that function. Every outcome but `authorized`
			// reports and returns, so this can no longer be the step the whole
			// workbench waits behind.
			if (!instance.isAuthorized) {
				const outcome = await (deps.authorize ?? authorizeAppleMusic)(instance);
				if (outcome !== 'authorized') {
					events.failed(appleSignInMessage(outcome) ?? 'Apple Music sign-in did not finish.');
					return;
				}
				if (songId !== nextSongId) return;
			}

			// Started, not awaited. The metadata is a name and a length for the strip;
			// the queue is the thing the user is actually waiting on, and running them
			// one after the other put a whole network round trip in front of the first
			// press. They are independent, so the wait is the slower of the two rather
			// than the sum — and `load` still resolves with both in, which is what
			// lets the transport treat "attached" as "ready to play".
			const naming = fetchSong(instance, nextSongId);

			// `known`, not `startAt`: a seek made while this load was settling — a
			// lyric line tapped during the reconnect press — has already moved it,
			// and the queue may as well be built where the first play will start.
			const startTime = known;
			// Built a field at a time rather than spread conditionally: the top of a
			// song is the absence of `startTime`, not a `startTime` of zero.
			const queue: AppleMusicQueueRequest = { song: nextSongId, startPlaying: false };
			if (startTime !== 0) queue.startTime = startTime;
			try {
				await instance.setQueue(queue);
			} catch {
				// A newer load or a detach superseded this one while the queue was
				// building, so the refusal belongs to a song nothing is attached to:
				// reporting it would put an error on the strip about the song the user
				// has just moved off. The same guard `play`'s own rebuild makes.
				if (songId !== nextSongId) return;
				events.failed('Apple Music would not queue that song.');
				return;
			}
			// And a superseded queue that *succeeded* must not claim the bookkeeping
			// either: `queuedAt` and the rate belong to whatever is attached now.
			if (songId !== nextSongId) return;
			queuedAt = startTime;
			instance.playbackRate = rate;
			await naming;
		},

		play() {
			const instance = music;
			const id = songId;
			// A first start plays from wherever the queue points, and a seek made
			// before it — a lyric line tapped while the song was still loading —
			// only moved `known`, because there was no `nowPlayingItem` to land in.
			// Rebuilding the queue around it is MusicKit's one pre-start
			// positioning, so that is how the remembered press is spent; dropped,
			// the readout says the tapped line while the audio starts somewhere
			// else.
			if (instance && id !== undefined && !started && known !== queuedAt) {
				const startTime = Math.max(0, known);
				void (async () => {
					await instance.setQueue({ song: id, startPlaying: false, startTime });
					// A newer load or a detach superseded this press while the queue
					// was rebuilding; starting playback now would answer a question
					// nobody is still asking.
					if (songId !== id) return;
					queuedAt = startTime;
					await instance.play();
				})().catch(() => events.failed('Apple Music could not play that song.'));
				return;
			}
			void music?.play().catch(() => events.failed('Apple Music could not play that song.'));
		},

		pause() {
			music?.pause();
		},

		seek(seconds) {
			// Where the seek starts from, read before `known` is overwritten — the
			// stale events MusicKit is about to emit all carry this, and the hold
			// uses it to tell them from the event that means the seek has landed.
			const from = rawTime();
			known = seconds;
			// Before the first press there is no `nowPlayingItem` to seek within, so
			// the position is only remembered — and the first play compares it with
			// where the queue points, rebuilding the queue where the two disagree.
			// Nothing is reporting a playhead yet either, so there is no gap to
			// hold open.
			if (!started) return;
			target = seconds;
			origin = from;
			targetEvents = 0;
			void music
				?.seekToTime(Math.max(0, seconds))
				.catch(() => events.failed('Apple Music could not play that song.'));
		},

		setRate(next) {
			rate = next;
			if (music) music.playbackRate = next;
		},

		clear() {
			void music?.stop().catch(() => events.stopped());
			songId = undefined;
			started = false;
			known = 0;
			queuedAt = 0;
			target = undefined;
			reportedDuration = Number.NaN;
		},

		destroy() {
			source.clear();
			// The listeners outlive one song on purpose — the instance is a page
			// singleton — so they are only given up when the source itself is.
			music?.removeEventListener('playbackTimeDidChange', onTime);
			music?.removeEventListener('playbackStateDidChange', onState);
			music?.removeEventListener('mediaPlaybackError', onError);
			music = undefined;
		}
	};

	return source;
}

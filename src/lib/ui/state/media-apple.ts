import type { MediaSource, MediaSourceEvents } from './media-player.svelte.js';

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
const musicKitScriptUrl = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

/** Where MusicKit puts a listener's payload. Narrowed to what is read. */
export interface AppleMusicPlaybackStateEvent {
	state: number;
}

export interface AppleMusicTimeEvent {
	currentPlaybackTime?: number;
	currentPlaybackDuration?: number;
}

/**
 * MusicKit's instance, narrowed to what the transport actually calls.
 *
 * Written out rather than imported because Apple ships no types for the web SDK,
 * and a hand-written interface is also the one place the surface this depends on
 * is documented — a stub in a test implements this and nothing else.
 */
export interface AppleMusicInstance {
	readonly isAuthorized: boolean;
	/** The user's storefront, which decides what a catalogue search can find. */
	readonly storefrontId: string;
	readonly currentPlaybackTime: number;
	readonly currentPlaybackDuration: number;
	playbackRate: number;
	authorize(): Promise<string>;
	setQueue(options: { song: string; startPlaying?: boolean; startTime?: number }): Promise<unknown>;
	play(): Promise<unknown>;
	pause(): void;
	stop(): Promise<unknown>;
	seekToTime(seconds: number): Promise<unknown>;
	addEventListener(name: string, handler: (event: never) => void): void;
	removeEventListener(name: string, handler: (event: never) => void): void;
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
		const scope = globalThis as MusicKitWindow;
		if (scope.MusicKit) {
			resolve(scope.MusicKit);
			return;
		}

		document.addEventListener(
			'musickitloaded',
			() => {
				if (scope.MusicKit) resolve(scope.MusicKit);
				else reject(new Error('Apple Music did not load.'));
			},
			{ once: true }
		);

		const script = document.createElement('script');
		script.src = musicKitScriptUrl;
		script.async = true;
		script.addEventListener('error', () => reject(new Error('Apple Music could not be reached.')));
		document.head.appendChild(script);
	});

	injected = attempt.catch((error: unknown) => {
		injected = undefined;
		throw error;
	});
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
export function appleMusicDeveloperToken(): string | undefined {
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
		const exp = (JSON.parse(json) as { exp?: unknown }).exp;
		return typeof exp === 'number' ? exp * 1000 : undefined;
	} catch {
		return undefined;
	}
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

	const attempt = (async () => {
		const token = appleMusicDeveloperToken();
		if (token === undefined) throw new Error('Apple Music is not configured for this build.');
		const musicKit = await load();
		return await musicKit.configure({
			developerToken: token,
			app: { name: 'LyricLint', build: '1' }
		});
	})().catch((error: unknown) => {
		configuredFor.delete(load);
		throw error;
	});

	configuredFor.set(load, attempt);
	return attempt;
}

/** Test seam: forget the loaded SDK and every configured instance. */
export function resetAppleMusic(): void {
	injected = undefined;
	configuredFor = new WeakMap();
}

export type AppleMusicUrlResult = { songId: string } | { error: string };

const songIdPattern = /^\d{1,20}$/;
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;

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

/** The same six the Spotify picker offers, for the same reason. */
const searchLimit = 6;

interface CatalogSong {
	id?: string;
	attributes?: {
		name?: string;
		artistName?: string;
		durationInMillis?: number;
		artwork?: { url?: string };
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
		limit: String(searchLimit)
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

	const payload = (await response.json().catch(() => undefined)) as
		{ results?: { songs?: { data?: CatalogSong[] } } } | undefined;

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
 * the queue rather than as a seek, and `started` is what tells the two apart.
 */
export function createAppleMusicSource(deps: AppleMusicSourceDependencies): AppleMusicSource {
	const events = deps.events;

	let music: AppleMusicInstance | undefined;
	let states: Record<string, number> | undefined;

	let songId: string | undefined;
	let started = false;
	let known = 0;
	let reportedDuration = Number.NaN;
	let rate = 1;

	function reportDuration(seconds: number): void {
		const next = Number.isFinite(seconds) && seconds > 0 ? seconds : Number.NaN;
		if (next === reportedDuration || (Number.isNaN(next) && Number.isNaN(reportedDuration))) {
			return;
		}
		reportedDuration = next;
		events.durationChanged(next);
	}

	function onTime(event: AppleMusicTimeEvent): void {
		if (typeof event.currentPlaybackDuration === 'number') {
			reportDuration(event.currentPlaybackDuration);
		}
		if (typeof event.currentPlaybackTime !== 'number') return;
		known = event.currentPlaybackTime;
		events.timeChanged(known);
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

	function listen(instance: AppleMusicInstance): void {
		instance.addEventListener('playbackTimeDidChange', onTime as (event: never) => void);
		instance.addEventListener('playbackStateDidChange', onState as (event: never) => void);
		instance.addEventListener('mediaPlaybackError', (() =>
			events.failed('Apple Music could not play that song.')) as (event: never) => void);
	}

	/** Name and length without playing a note, so attaching stays silent. */
	async function fetchSong(instance: AppleMusicInstance, id: string): Promise<void> {
		const token = (deps.token ?? appleMusicDeveloperToken)();
		if (token === undefined) return;
		const request = deps.request ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
		const response = await catalog(
			`/catalog/${encodeURIComponent(instance.storefrontId)}/songs/${encodeURIComponent(id)}`,
			{ token, request }
		);
		if (!response?.ok) return;
		const payload = (await response.json().catch(() => undefined)) as
			{ data?: CatalogSong[] } | undefined;
		const song = payload?.data?.[0];
		if (song?.attributes?.name === undefined || songId !== id) return;
		events.named(describe(song.attributes));
		events.artworkChanged(artworkUrl(song.attributes));
		if (song.attributes.durationInMillis !== undefined) {
			reportDuration(song.attributes.durationInMillis / 1000);
		}
	}

	const source: AppleMusicSource = {
		kind: 'apple',

		get time() {
			return known;
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
			if (!instance.isAuthorized) {
				try {
					await instance.authorize();
				} catch {
					events.failed('Apple Music sign-in was cancelled.');
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

			try {
				await instance.setQueue({
					song: nextSongId,
					startPlaying: false,
					...(startAt === undefined ? {} : { startTime: startAt })
				});
			} catch {
				events.failed('Apple Music would not queue that song.');
				return;
			}
			instance.playbackRate = rate;
			await naming;
		},

		play() {
			void music?.play();
		},

		pause() {
			music?.pause();
		},

		seek(seconds) {
			known = seconds;
			// Before the first press there is no `nowPlayingItem` to seek within, so
			// the position is simply remembered — the queue was built with it as
			// `startTime`, and a play from here starts in the right place.
			if (started) void music?.seekToTime(Math.max(0, seconds));
		},

		setRate(next) {
			rate = next;
			if (music) music.playbackRate = next;
		},

		clear() {
			void music?.stop();
			songId = undefined;
			started = false;
			known = 0;
			reportedDuration = Number.NaN;
		},

		destroy() {
			source.clear();
			// The listeners outlive one song on purpose — the instance is a page
			// singleton — so they are only given up when the source itself is.
			music?.removeEventListener('playbackTimeDidChange', onTime as (event: never) => void);
			music?.removeEventListener('playbackStateDidChange', onState as (event: never) => void);
			music = undefined;
		}
	};

	return source;
}

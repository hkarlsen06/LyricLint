import type { MediaSource, MediaSourceEvents } from './media-player.svelte.js';
import {
	remoteLoadTimeoutMs,
	remotePollIntervalMs,
	remoteSeekSettled
} from './media-remote-policy.js';

/**
 * How often a running YouTube playhead is read, in milliseconds.
 *
 * The IFrame API has no `timeupdate`. `getCurrentTime()` is a number the player
 * keeps up to date on its own side of the bridge, so the only way to watch a
 * playhead is to ask for it — four times a second, which is what a media
 * element's own `timeupdate` works out at and therefore what the write throttle
 * downstream was tuned against. Anything faster is a postMessage round trip per
 * frame for a readout nobody can read that fast.
 */
/**
 * How far the player may be from where it was told to go before the transport
 * believes it, and how many polls it will wait for that.
 *
 * A seek across the bridge does not land by the time the next read happens, so
 * `getCurrentTime()` answers with the position the user just left. The source
 * therefore reports the *target* until the player catches up — otherwise a
 * back-2 followed by a resume reads the pre-nudge time and moves four seconds,
 * which is the exact failure the local-file transport is written to avoid. The
 * poll cap is there so a seek the player ignored outright cannot leave the
 * readout stuck on a position nothing is playing from.
 */
/** Google's IFrame API, narrowed to what the transport actually calls. */
export interface YouTubePlayerLike {
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	getCurrentTime(): number;
	getDuration(): number;
	setPlaybackRate(rate: number): void;
	getAvailablePlaybackRates(): number[];
	getVideoData?(): { title?: string } | undefined;
	cueVideoById(options: { videoId: string; startSeconds?: number }): void;
	destroy(): void;
}

export interface YouTubePlayerOptions {
	videoId: string;
	host?: string;
	playerVars?: Record<string, string | number>;
	events?: {
		onReady?: () => void;
		onStateChange?: (event: { data: number }) => void;
		onError?: (event: { data: number }) => void;
	};
}

export interface YouTubeApi {
	Player: new (host: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayerLike;
	PlayerState: {
		UNSTARTED: number;
		ENDED: number;
		PLAYING: number;
		PAUSED: number;
		BUFFERING: number;
		CUED: number;
	};
}

/**
 * How the API arrives.
 *
 * Injected rather than imported so that a test drives a stub player object and
 * nothing in the suite ever reaches Google.
 */
export type YouTubeApiLoader = () => Promise<YouTubeApi>;

/** Start a repeating tick and hand back the way to stop it. */
export type PollScheduler = (tick: () => void, intervalMs: number) => () => void;

interface YouTubeGlobal {
	YT?: YouTubeApi;
	onYouTubeIframeAPIReady?: () => void;
}

const apiScriptUrl = 'https://www.youtube.com/iframe_api';
let injected: Promise<YouTubeApi> | undefined;

/**
 * Fetch Google's IFrame API — once, and never before something asks for it.
 *
 * This function is the whole of the network surface the YouTube source has, and
 * nothing calls it at module scope or on page load. It runs when the user has
 * chosen YouTube for this draft and not one moment earlier, which is what makes
 * the opt-in in the tools panel an opt-in rather than a notice about something
 * that has already happened.
 *
 * A failed load forgets itself, so a second attempt is a second attempt rather
 * than the first one's rejection handed back forever.
 */
export function loadYouTubeApi(): Promise<YouTubeApi> {
	if (injected) return injected;

	const attempt = new Promise<YouTubeApi>((resolve, reject) => {
		const scope = globalThis as YouTubeGlobal;
		if (scope.YT?.Player) {
			resolve(scope.YT);
			return;
		}

		// The API announces itself by calling a global. Chaining whatever was
		// already there keeps this from being the one thing on the page allowed to
		// own that name.
		const previous = scope.onYouTubeIframeAPIReady;
		const timeout = setTimeout(
			() => reject(new Error('The YouTube player did not load in time.')),
			remoteLoadTimeoutMs
		);
		scope.onYouTubeIframeAPIReady = () => {
			previous?.();
			clearTimeout(timeout);
			if (scope.YT?.Player) resolve(scope.YT);
			else reject(new Error('The YouTube player did not load.'));
		};

		const script = document.createElement('script');
		script.src = apiScriptUrl;
		script.async = true;
		script.addEventListener('error', () => {
			clearTimeout(timeout);
			reject(new Error('The YouTube player could not be reached.'));
		});
		document.head.appendChild(script);
	});

	injected = attempt.catch((error: unknown) => {
		injected = undefined;
		throw error;
	});
	return injected;
}

/**
 * The one failure with nothing to retry, so it names the way out instead of
 * stopping at the diagnosis. Nothing here can lift the owner's embed flag —
 * Google checks it server-side — and the file source is not subject to it, so
 * the sentence points at the control that switches sources rather than leaving
 * the user with a dead track and an `✕`.
 */
const embedRefused =
	'The owner does not allow that video to be played outside YouTube. Download the audio and attach the file with Change audio.';

/**
 * What the IFrame API's error codes mean, in the words the strip has room for.
 *
 * All five used to arrive as one sentence — "That video could not be played." —
 * which is true of every one of them and useful about none. The distinction that
 * costs a debugging session is 101/150 against 5: the first is the owner's
 * decision and no amount of retrying changes it, while the second is this
 * browser on this page, which is usually the app being served over plain `http`
 * so the nested player is not a secure context and DRM-protected audio has
 * nothing to decrypt with.
 */
const youtubeErrorMessages: Record<number, string> = {
	2: 'That video id is not valid.',
	5: 'This browser could not play that video. Serving the app over https usually fixes it.',
	100: 'That video is gone — removed, or private.',
	101: embedRefused,
	150: embedRefused
};

function youtubeErrorMessage(code: number): string {
	return youtubeErrorMessages[code] ?? `That video could not be played (error ${code}).`;
}

/**
 * The still YouTube publishes for a video, at the largest size it always has.
 *
 * `maxresdefault` is twice the size and exists only where the uploader supplied
 * a frame that big — everywhere else it is a 404, which the browser draws as a
 * broken picture in the panel. `hqdefault` is generated for every video there
 * is, which is the trade this makes: a cover that is always there beats a
 * sharper one that sometimes is not.
 */
function youtubeThumbnailUrl(videoId: string): string {
	return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * YouTube's own search, prefilled with whatever the workbench knows the song by.
 *
 * The one honest answer to "find the video for this song", and the reason it is
 * a link rather than a lookup is worth writing down so nobody tries the other
 * two again. The Data API's `search.list` costs 100 quota units against a
 * 10,000/day default — a hundred searches a day for the whole deployed build,
 * shared by every visitor, behind a key inlined in the bundle for anyone to
 * lift. Odesli resolves an Apple or Spotify id keylessly and correctly, and
 * returns no `youtube` entry at all for those inputs. So the search runs where
 * it is free and nobody's quota pays for it: in the user's own browser, on
 * Google's own page, one press away, with the result they pick pasted back into
 * the field above it.
 *
 * The extension goes for the same reason it goes from a draft title — it is a
 * fact about a file on a disk, and `sensommer.mp3` is a worse query than
 * `sensommer`. Nothing else is guessed at: a name this application was given is
 * a better search term than one it has rewritten.
 */
export function youtubeSearchTerm(name: string): string | undefined {
	const term = name
		.replace(/\.[a-z0-9]{1,5}$/i, '')
		.replace(/\s+/gu, ' ')
		.trim();
	return term === '' ? undefined : term;
}

type YouTubeUrlResult = { videoId: string } | { error: string };

const bareIdPattern = /^[A-Za-z0-9_-]{11}$/;
const schemePattern = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Whether this is a video id and nothing else.
 *
 * The parser's own alphabet, exported because an id that did not come from the
 * parser has to be held to it too: one arriving on a pasted fragment is a string
 * somebody else wrote, and it ends up in a thumbnail address and a player call.
 */
export function isYouTubeVideoId(id: string): boolean {
	return bareIdPattern.test(id);
}

/** Hosts YouTube serves watch pages from, with any `www.` already stripped. */
const youtubeHosts = new Set([
	'youtube.com',
	'm.youtube.com',
	'music.youtube.com',
	'youtube-nocookie.com',
	'youtu.be'
]);

/** Path shapes that carry the id in the segment after them. */
const idBearingSegments = new Set(['embed', 'shorts', 'live', 'v']);

const notALink = 'That is not a YouTube link.';
const noVideo = 'That link has no video id in it.';

/**
 * Turn whatever the user pasted into a video id.
 *
 * People have a link, not an id, and the link they have is whichever one the
 * share sheet gave them: a `youtu.be` short form, a watch page with `&t=90s` and
 * a playlist on the end, a mobile host, an embed. So the parser is `new URL`
 * rather than a pattern over the whole string — a regex is the thing that works
 * on the three links it was written against and breaks on the fourth, silently,
 * by matching the wrong eleven characters.
 */
export function parseYouTubeVideoId(input: string): YouTubeUrlResult {
	const trimmed = input.trim();
	if (trimmed === '') return { error: 'Paste a YouTube link.' };

	// Before the URL parse, because `new URL('https://dQw4w9WgXcQ')` succeeds and
	// reads a bare id as a hostname.
	if (bareIdPattern.test(trimmed)) return { videoId: trimmed };

	let url: URL;
	try {
		url = new URL(schemePattern.test(trimmed) ? trimmed : `https://${trimmed}`);
	} catch {
		return { error: notALink };
	}

	const host = url.hostname.toLowerCase().replace(/^www\./, '');
	if (!youtubeHosts.has(host)) return { error: notALink };

	const segments = url.pathname.split('/').filter((segment) => segment !== '');
	const candidate =
		host === 'youtu.be'
			? segments[0]
			: segments[0] === 'watch'
				? (url.searchParams.get('v') ?? undefined)
				: idBearingSegments.has(segments[0] ?? '')
					? segments[1]
					: undefined;

	if (candidate === undefined) return { error: noVideo };
	return bareIdPattern.test(candidate) ? { videoId: candidate } : { error: noVideo };
}

interface YouTubeSourceDependencies {
	events: MediaSourceEvents;
	loadApi: YouTubeApiLoader;
	/** Injectable so a test advances the poll by hand rather than on a clock. */
	schedule?: PollScheduler;
}

export interface YouTubeSource extends MediaSource {
	/** Point at a video. Resolves once the API is in hand, not once it plays. */
	load(videoId: string, startAt?: number): Promise<void>;
	/** Give the player somewhere to draw; the return value unmounts it. */
	mount(container: HTMLElement): () => void;
}

function defaultSchedule(tick: () => void, intervalMs: number): () => void {
	const timer = setInterval(tick, intervalMs);
	return () => clearInterval(timer);
}

/**
 * YouTube as something the transport can drive.
 *
 * Everything asymmetric about the IFrame API is absorbed here so that the
 * transport above never learns which source it is holding. Three asymmetries,
 * and each one is a hole the local-file path does not have:
 *
 * - **Commands cross a postMessage bridge**, so a seek has not landed by the
 *   time the next read happens. The source reports the target it was given until
 *   the player agrees with it, which is what keeps the resume rewind and the
 *   nudge producing the same numbers they produce on a media element.
 * - **There is no `timeupdate`**, so a running playhead is polled. The poll
 *   starts on `PLAYING` and stops on anything that is not playing, so a paused
 *   or detached video leaves no timer behind.
 * - **The rate is a fixed menu.** `getAvailablePlaybackRates()` is the only
 *   honest answer to what this source can do, and it is reported upward rather
 *   than assumed, because `setPlaybackRate` with a rate that is not on the menu
 *   is ignored without a word.
 *
 * `preservesPitch` has no counterpart at all: the YouTube player pitch-corrects
 * on its own and exposes no control over it, so there is nothing here to set and
 * nothing to fall back to.
 */
export function createYouTubeSource(deps: YouTubeSourceDependencies): YouTubeSource {
	const schedule = deps.schedule ?? defaultSchedule;
	const events = deps.events;

	let api: YouTubeApi | undefined;
	let player: YouTubePlayerLike | undefined;
	let container: HTMLElement | undefined;
	let videoId: string | undefined;

	let startAt: number | undefined;
	let wantPlaying = false;
	let wantedRate = 1;
	let rates: readonly number[] = [1];
	let reportedDuration = Number.NaN;

	// The position the player has been told to go to, held until it agrees.
	let target: number | undefined;
	let targetPolls = 0;

	let stopPoll: (() => void) | undefined;

	function rawTime(): number {
		if (!player) return startAt ?? 0;
		try {
			const value = player.getCurrentTime();
			return Number.isFinite(value) ? value : 0;
		} catch {
			return startAt ?? 0;
		}
	}

	function position(): number {
		return target ?? rawTime();
	}

	function reportDuration(): void {
		if (!player) return;
		let value: number;
		try {
			value = player.getDuration();
		} catch {
			return;
		}
		const next = Number.isFinite(value) && value > 0 ? value : Number.NaN;
		// NaN is never equal to itself, so the guard is written the long way round
		// or the source would announce an unknown duration on every poll.
		if (next === reportedDuration || (Number.isNaN(next) && Number.isNaN(reportedDuration))) {
			return;
		}
		reportedDuration = next;
		events.durationChanged(next);
	}

	function beginPoll(): void {
		if (stopPoll) return;
		stopPoll = schedule(() => {
			reportDuration();
			if (target !== undefined) {
				targetPolls += 1;
				if (remoteSeekSettled(rawTime(), target, targetPolls)) {
					target = undefined;
				}
			}
			events.timeChanged(position());
		}, remotePollIntervalMs);
	}

	function endPoll(): void {
		stopPoll?.();
		stopPoll = undefined;
	}

	function applyRate(): void {
		if (!player) return;
		if (!rates.includes(wantedRate)) return;
		try {
			player.setPlaybackRate(wantedRate);
		} catch {
			// The rate is a preference, not the point of the press.
		}
	}

	function onReady(): void {
		if (!player) return;
		let available: number[];
		try {
			available = player.getAvailablePlaybackRates() ?? [];
		} catch {
			available = [];
		}
		rates = available.length > 0 ? [...available].sort((left, right) => left - right) : [1];
		events.ratesChanged(rates);
		applyRate();

		const title = player.getVideoData?.()?.title;
		if (title) events.named(title);

		reportDuration();
		if (startAt !== undefined && startAt > 0) seekPlayer(startAt);
		if (wantPlaying) player.playVideo();
	}

	function onStateChange(state: number): void {
		const known = api?.PlayerState;
		if (!known) return;
		if (state === known.PLAYING) {
			wantPlaying = true;
			beginPoll();
			events.started();
			return;
		}
		if (state === known.PAUSED) {
			wantPlaying = false;
			endPoll();
			events.timeChanged(position());
			events.stopped();
			return;
		}
		if (state === known.ENDED) {
			wantPlaying = false;
			endPoll();
			events.ended();
			return;
		}
		// BUFFERING is still playing as far as the user is concerned, and CUED and
		// UNSTARTED are both moments where the length has just become knowable.
		reportDuration();
	}

	function seekPlayer(seconds: number): void {
		if (!player) return;
		try {
			player.seekTo(seconds, true);
		} catch {
			// Treated as a seek that has not landed yet; the poll cap clears it.
		}
	}

	function build(): void {
		if (!api || !container || videoId === undefined) return;

		if (player) {
			// `cue`, never `load`: `loadVideoById` autoplays by design, so reusing an
			// existing player — a draft switch, a reconnect, an HMR reload — started
			// the song on its own. Playback is `wantPlaying`'s job.
			player.cueVideoById({ videoId, startSeconds: startAt ?? 0 });
			if (wantPlaying) player.playVideo();
			return;
		}

		const host = document.createElement('div');
		host.className = 'media-video__player';
		container.appendChild(host);

		// `youtube-nocookie.com` is the same player without the cookie the ordinary
		// host sets before anything is played. It costs nothing and it is the only
		// part of this the application gets to choose.
		player = new api.Player(host, {
			videoId,
			host: 'https://www.youtube-nocookie.com',
			playerVars: {
				start: Math.max(0, Math.floor(startAt ?? 0)),
				playsinline: 1,
				rel: 0
			},
			events: {
				onReady: () => onReady(),
				onStateChange: (event) => onStateChange(event.data),
				onError: (event) => events.failed(youtubeErrorMessage(event.data))
			}
		});
	}

	function teardown(): void {
		endPoll();
		try {
			player?.destroy();
		} catch {
			// A player whose iframe has already gone is a player already destroyed.
		}
		player = undefined;
		if (container) container.textContent = '';
	}

	const source: YouTubeSource = {
		kind: 'youtube',

		get time() {
			return position();
		},
		get duration() {
			return reportedDuration;
		},
		get rates() {
			return rates;
		},

		async load(nextVideoId, nextStartAt) {
			if (player && nextVideoId !== videoId) teardown();
			videoId = nextVideoId;
			// Before the player, and without asking Google anything: the address is
			// derived from the id, so the cover is known the moment the video is.
			events.artworkChanged(youtubeThumbnailUrl(nextVideoId));
			startAt = nextStartAt;
			// Shown at once, the way a restored file position is, and held for the
			// same reason: the player is not there yet to be asked.
			target = nextStartAt;
			targetPolls = 0;
			reportedDuration = Number.NaN;
			wantPlaying = false;

			try {
				api = await deps.loadApi();
			} catch {
				events.failed('The YouTube player could not be loaded.');
				return;
			}
			build();
		},

		mount(nextContainer) {
			container = nextContainer;
			build();
			return () => {
				teardown();
				container = undefined;
			};
		},

		play() {
			wantPlaying = true;
			player?.playVideo();
		},

		pause() {
			wantPlaying = false;
			player?.pauseVideo();
		},

		seek(seconds) {
			startAt = seconds;
			target = seconds;
			targetPolls = 0;
			seekPlayer(seconds);
		},

		setRate(rate) {
			wantedRate = rate;
			applyRate();
		},

		clear() {
			teardown();
			videoId = undefined;
			startAt = undefined;
			target = undefined;
			targetPolls = 0;
			wantPlaying = false;
			reportedDuration = Number.NaN;
		},

		destroy() {
			source.clear();
			container = undefined;
		}
	};

	return source;
}

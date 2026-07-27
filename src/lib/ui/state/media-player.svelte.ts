import type { FeedbackState } from './feedback.svelte.js';
import type { PollScheduler, YouTubeApiLoader, YouTubeSource } from './media-youtube.js';
import { createYouTubeSource, loadYouTubeApi } from './media-youtube.js';
import type { SpotifySdkLoader, SpotifySource } from './media-spotify.js';
import { createSpotifySource, loadSpotifySdk } from './media-spotify.js';
import { spotifyAccessToken } from './spotify-auth.js';
import type { AppleMusicSource, MusicKitLoader } from './media-apple.js';
import { configureAppleMusic, createAppleMusicSource, loadMusicKit } from './media-apple.js';

/**
 * How far a resume backs up before it starts, in seconds.
 *
 * This is the single most valuable default in the transport. Transcription is a
 * loop of listen, pause, type, and the words either side of a pause are the ones
 * hardest to place — so a resume that starts exactly where the ear stopped makes
 * the user rewind by hand nearly every time. Two seconds of run-in is enough to
 * re-enter the phrase and short enough that it never feels like a repeat.
 */
export const resumeRewindSeconds = 2;

/** What one press of the side keys, or one press of a skip button, moves. */
export const nudgeSeconds = 2;

/**
 * Playback rates the workbench offers, slow to fast.
 *
 * Everything below 1 is the point: dense or slurred passages are the reason a
 * transcriber reaches for a speed control at all. On a media element
 * `preservesPitch` is what keeps these listenable rather than comic.
 *
 * This is the *offer*, not the promise. A source narrows it — YouTube has a
 * fixed menu of its own and ignores `setPlaybackRate` for anything outside it,
 * without a word — so what a surface actually renders is
 * `MediaPlayer.availableRates`, which is this list intersected with what the
 * attached source says it can do. Offering a rate that will not apply is worse
 * than offering fewer.
 */
export const playbackRates = [0.5, 0.75, 1, 1.25, 1.5] as const;

export type TransportAction = 'toggle' | 'back' | 'forward';

/** Where the sound is coming from. Absent from a record means `file`. */
export type MediaSourceKind = 'file' | 'youtube' | 'spotify' | 'apple';

/**
 * What the transport tells itself about whatever is making sound.
 *
 * A source reports; it never decides. Clamping, the resume rewind, and the
 * cancellation rules all live one level up, so the two sources cannot drift into
 * two different transports.
 */
export interface MediaSourceEvents {
	timeChanged(time: number): void;
	durationChanged(duration: number): void;
	/** What this source can actually play at, once it knows. */
	ratesChanged(rates: readonly number[]): void;
	/** The source learned what it is playing, after it was already attached. */
	named(name: string): void;
	/**
	 * Cover art for what is playing, where the source has any.
	 *
	 * Optional in practice rather than in the type: a source that has no picture
	 * to offer simply never calls it, which is every source but Apple Music today.
	 * It is on the transport rather than on that one source because a cover is a
	 * fact about what is playing, and the panel that draws it should not have to
	 * know which of four things is playing it.
	 */
	artworkChanged(url: string | undefined): void;
	started(): void;
	stopped(): void;
	ended(): void;
	failed(message: string): void;
}

/**
 * The transport's view of a playback source.
 *
 * Deliberately synchronous. The YouTube bridge is not, and hiding that is the
 * source's own work: `time` there answers with the position the player was last
 * told to go to until the player agrees, so the arithmetic above reads the same
 * numbers it reads off a media element.
 */
export interface MediaSource {
	readonly kind: MediaSourceKind;
	/** The source's own playhead, not a mirrored one. */
	readonly time: number;
	/** NaN until the source knows how long the track is. */
	readonly duration: number;
	/** Rates this source can apply, slow to fast. */
	readonly rates: readonly number[];
	play(): void;
	pause(): void;
	seek(seconds: number): void;
	setRate(rate: number): void;
	/** Give up what is loaded without giving up the source itself. */
	clear(): void;
	destroy(): void;
}

export interface MediaAttachment {
	name: string;
	/** Absent when the browser has no File System Access API to hand one back. */
	handle?: FileSystemFileHandle;
	size?: number;
	/**
	 * Where to place the playhead once the file is readable.
	 *
	 * It cannot simply be assigned: `currentTime` is ignored until the browser has
	 * read the file's metadata, so the seek is held and applied on the event that
	 * says the track has a length.
	 */
	startAt?: number;
}

/** What `attachVideo` needs. The id is the whole of the durable fact. */
export interface VideoAttachment {
	videoId: string;
	/** What to call it until the player says what it actually is. */
	name?: string;
	startAt?: number;
}

/** What `attachTrack` needs. Same shape as a video: an id and a placeholder. */
export interface TrackAttachment {
	trackId: string;
	name?: string;
	startAt?: number;
}

/** What `attachSong` needs. The same shape again, for Apple Music. */
export interface SongAttachment {
	songId: string;
	name?: string;
	startAt?: number;
}

/**
 * Why the transport is reporting its position.
 *
 * `settled` means playback has come to rest — a pause or the end of the track —
 * and is the moment a listener should write the position down rather than
 * waiting for its next threshold.
 */
export type ProgressReason = 'progress' | 'settled';

export type ProgressListener = (time: number, reason: ProgressReason) => void;

export interface MediaPlayerDependencies {
	feedback: FeedbackState;
	/** Injectable so tests drive a stub instead of a real decoder. */
	createAudio?: () => HTMLMediaElement;
	createObjectUrl?: (file: Blob) => string;
	revokeObjectUrl?: (url: string) => void;
	/**
	 * How the YouTube IFrame API arrives.
	 *
	 * Injectable so the suite drives a stub player object; nothing in a test ever
	 * reaches Google. The default is the real loader, and it is a function rather
	 * than an import precisely so that nothing runs until a user has asked for it.
	 */
	loadYouTubeApi?: YouTubeApiLoader;
	/** Injectable so a test advances the YouTube poll by hand. */
	scheduleYouTubePoll?: PollScheduler;
	/** How Spotify's Web Playback SDK arrives. Injectable for the same reason. */
	loadSpotifySdk?: SpotifySdkLoader;
	/** The Spotify access token, so a test never runs an OAuth flow. */
	spotifyToken?: () => Promise<string | undefined>;
	/** Injectable so a test answers Spotify's Web API without a network. */
	spotifyRequest?: typeof fetch;
	/** Injectable so a test advances the Spotify poll by hand. */
	scheduleSpotifyPoll?: PollScheduler;
	/** How MusicKit arrives. Injectable for the same reason as the other two. */
	loadMusicKit?: MusicKitLoader;
	/** Injectable so a test answers Apple's catalogue without a network. */
	appleMusicRequest?: typeof fetch;
}

export interface MediaPlayer {
	/** The attached file's name, or undefined when nothing is attached. */
	readonly name: string | undefined;
	readonly attached: boolean;
	readonly playing: boolean;
	readonly currentTime: number;
	/** NaN until the browser has read the file's metadata. */
	readonly duration: number;
	readonly rate: number;
	/** Set when the file could not be decoded; the strip shows it in place. */
	readonly error: string | undefined;
	/**
	 * A press on play that the source has not been able to act on yet.
	 *
	 * `playing` already reports it, because the control has to flip and a second
	 * press has to cancel — but a control that says Pause over silence is only
	 * half the answer. This is the other half, and the only thing it is for: the
	 * surfaces draw a spinner in the glyph's place, so the gap reads as a wait
	 * rather than as nothing having happened.
	 *
	 * It covers the whole gap — the attachment *and* the buffer after `play()` was
	 * issued — because a spinner that gave up at the halfway mark put the Play
	 * glyph back for the second half, and one press reading as three states is the
	 * thing this was supposed to stop.
	 */
	readonly starting: boolean;
	/** What is attached, or undefined when nothing is. */
	readonly sourceKind: MediaSourceKind | undefined;
	/**
	 * A cover for what is playing, where the source has one to give.
	 *
	 * Undefined for a local file, a video and a track, which is the honest answer
	 * rather than a placeholder: a band that drew an empty square whenever there
	 * was no picture would cost the panel a third of its height to say nothing.
	 */
	readonly artwork: string | undefined;
	/**
	 * The rates the attached source can actually apply, slow to fast.
	 *
	 * `playbackRates` narrowed by what the source says it can do. A surface that
	 * renders the constant instead is offering presses that silently do nothing.
	 *
	 * The workbench's own offer stands until a source contradicts it, which for a
	 * video is the moment Google's player is ready. A control that collapsed to
	 * one option on attach and grew back a second later would be worse than
	 * either — and under-promising is its own kind of wrong answer.
	 */
	readonly availableRates: readonly number[];
	attach(file: File, attachment?: MediaAttachment): void;
	/**
	 * Point the transport at a YouTube video.
	 *
	 * Asynchronous where `attach` is not, because the first call is what fetches
	 * Google's IFrame API. It resolves when the API is in hand, not when the video
	 * plays — everything after that arrives as ordinary source events.
	 */
	attachVideo(video: VideoAttachment): Promise<void>;
	/**
	 * Point the transport at a Spotify track.
	 *
	 * Asynchronous like `attachVideo`, and silent like it: this resolves once the
	 * track's name and length are in hand, having played nothing. Spotify has no
	 * cue, so the call that actually starts the track is deferred to the first
	 * `play()` — see `createSpotifySource`.
	 */
	attachTrack(track: TrackAttachment): Promise<void>;
	/**
	 * Point the transport at an Apple Music song.
	 *
	 * Silent like the other two, and for the reason the file source is: MusicKit
	 * has a real cue, so the queue is built without playing. This resolves once
	 * the song is queued — which includes the sign-in, where a sign-in is needed,
	 * so it must be called from a gesture.
	 */
	attachSong(song: SongAttachment): Promise<void>;
	/**
	 * Give the video source somewhere to draw, and take it back on unmount.
	 *
	 * The return value is the teardown, so this can be handed straight to a Svelte
	 * attachment. A file source draws nothing and never calls it.
	 */
	mountVideo(container: HTMLElement): () => void;
	detach(): void;
	play(): void;
	pause(): void;
	toggle(): void;
	/**
	 * The moments the side keys step between, in seconds, ascending.
	 *
	 * The timed lines of the lyric, pushed down by the shell. A transcriber
	 * checking a line wants the line, not two seconds of wherever the last
	 * press left off — so once a song has timings, back and forward mean the
	 * previous and next timed line. Outside them, and for a song with none, the
	 * plain nudge is what is left.
	 */
	readonly cuePoints: readonly number[];
	setCuePoints(times: readonly number[]): void;
	/** Move by `seconds`, clamped to the track. Never starts or stops playback. */
	nudge(seconds: number): void;
	seek(time: number): void;
	setRate(rate: number): void;
	transport(action: TransportAction): void;
	/**
	 * The source's own playhead rather than the mirrored one.
	 *
	 * `currentTime` is reactive state fed by whatever the source reports, which is
	 * a few times a second — near enough for a readout, up to a tick stale for a
	 * write. The flush that runs as the tab is closing is the one place that
	 * difference is the difference between the right second and the previous one.
	 */
	liveTime(): number;
	/** Watch the playhead. One listener; setting it again replaces the previous. */
	setProgressListener(listener: ProgressListener | undefined): void;
	/**
	 * Watch for the source learning what it is playing.
	 *
	 * A file is named before it is opened. A video is a bare id until Google's
	 * player answers with a title, and that title is worth writing down — it is
	 * what the strip and the reconnect control say next session.
	 */
	setNameListener(listener: ((name: string) => void) | undefined): void;
	destroy(): void;
}

function clamp(value: number, lower: number, upper: number): number {
	if (!Number.isFinite(value)) return lower;
	return Math.min(Math.max(value, lower), Number.isFinite(upper) ? upper : value);
}

interface FileSourceDependencies {
	events: MediaSourceEvents;
	createAudio: () => HTMLMediaElement;
	createObjectUrl: (file: Blob) => string;
	revokeObjectUrl: (url: string) => void;
}

interface FileSource extends MediaSource {
	load(file: Blob, startAt?: number): void;
}

/**
 * A local file, played by one media element.
 *
 * One element for the lifetime of the source and a swapped `src`, rather than an
 * element per file: a fresh element per attachment leaks decoders and loses the
 * rate the user chose. It is never in the document — this is audio, and a
 * visible `<audio controls>` would be a second transport disagreeing with the
 * strip.
 */
function createFileSource(deps: FileSourceDependencies): FileSource {
	const events = deps.events;

	let audio: HTMLMediaElement | undefined;
	let objectUrl: string | undefined;
	let pendingSeek: number | undefined;

	function element(): HTMLMediaElement {
		if (audio) return audio;
		const created = deps.createAudio();
		created.preload = 'metadata';
		// Rates below 1 are unusable without it, and Safari spells it differently.
		created.preservesPitch = true;
		created.addEventListener('timeupdate', () => events.timeChanged(created.currentTime));
		// A held seek is applied on whichever of these arrives first: both mean the
		// browser now knows how long the track is, which is what `currentTime` was
		// waiting for. Clearing it here is what keeps it from firing twice.
		const applyPendingSeek = () => {
			events.durationChanged(created.duration);
			if (pendingSeek === undefined) return;
			created.currentTime = clamp(pendingSeek, 0, created.duration);
			pendingSeek = undefined;
			events.timeChanged(created.currentTime);
		};
		created.addEventListener('loadedmetadata', applyPendingSeek);
		created.addEventListener('durationchange', applyPendingSeek);
		created.addEventListener('play', () => events.started());
		created.addEventListener('pause', () => events.stopped());
		created.addEventListener('ended', () => events.ended());
		created.addEventListener('error', () => events.failed('That file could not be played.'));
		audio = created;
		return created;
	}

	function releaseUrl(): void {
		if (objectUrl === undefined) return;
		deps.revokeObjectUrl(objectUrl);
		objectUrl = undefined;
	}

	const source: FileSource = {
		kind: 'file',

		get time() {
			return audio ? audio.currentTime : 0;
		},
		get duration() {
			return audio ? audio.duration : Number.NaN;
		},
		get rates() {
			return playbackRates;
		},

		load(file, startAt) {
			const media = element();
			media.pause();
			releaseUrl();
			objectUrl = deps.createObjectUrl(file);
			media.src = objectUrl;
			// Held rather than assigned: `currentTime` does not stick until the
			// browser has read the file.
			pendingSeek = startAt;
			events.ratesChanged(playbackRates);
		},

		play() {
			// A rejected play is a decode failure the `error` listener already
			// reports; nothing here should surface an unhandled rejection for it.
			void Promise.resolve(element().play()).catch(() => events.stopped());
		},

		pause() {
			element().pause();
		},

		seek(seconds) {
			element().currentTime = seconds;
		},

		setRate(rate) {
			if (audio) audio.playbackRate = rate;
		},

		clear() {
			if (audio) {
				audio.pause();
				audio.removeAttribute('src');
				audio.load();
			}
			releaseUrl();
			pendingSeek = undefined;
		},

		destroy() {
			source.clear();
			audio = undefined;
		}
	};

	return source;
}

/**
 * The workbench's transport, and the one place its arithmetic lives.
 *
 * It holds a source rather than a media element. Every rule that makes the
 * transport worth having — the two-second run-in on a resume, the clamp to both
 * ends of the track, a deliberate placement cancelling the run-in — is written
 * once here against `MediaSource`, so a local file and a YouTube video cannot
 * behave differently under the same key. The sources exist to make that possible
 * and to hide, each in its own file, whatever is asymmetric about them.
 */
export function createMediaPlayer(deps: MediaPlayerDependencies): MediaPlayer {
	const createAudio = deps.createAudio ?? (() => new Audio());
	const createObjectUrl = deps.createObjectUrl ?? ((file: Blob) => URL.createObjectURL(file));
	const revokeObjectUrl = deps.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));

	let name = $state<string | undefined>(undefined);
	let playing = $state(false);
	let currentTime = $state(0);
	let duration = $state(Number.NaN);
	let rate = $state(1);
	let error = $state<string | undefined>(undefined);
	let sourceKind = $state<MediaSourceKind | undefined>(undefined);
	let artwork = $state<string | undefined>(undefined);
	let availableRates = $state<readonly number[]>(playbackRates);
	let cuePoints = $state<readonly number[]>([]);
	/**
	 * What the user has asked for, as against what the source is doing.
	 *
	 * These are two different facts and the transport needs both, because between
	 * them is a gap that is always visible and sometimes seconds long. A remote
	 * source is not ready to be told anything the moment its strip draws — a video
	 * waits on Google's player, a track on a device registration, a song on a
	 * script, a sign-in and a queue — and even once it is, `play()` is a request
	 * that buffers before it becomes sound.
	 *
	 * Every press in that gap used to be dropped: press play, get silence, press
	 * again, and eventually one lands by luck. Holding the intent separately is
	 * what fixes it, and one flag covers the whole gap rather than one per half —
	 * an earlier version cleared as soon as `play()` was *issued*, which put the
	 * Play glyph back on screen for the buffer and made a single press look like
	 * three states.
	 *
	 * The YouTube bridge already solved its own half with a flag of this name that
	 * it replays when its player arrives. Right behaviour, wrong place: it left
	 * the identical gap open in the two sources written after it. Here it is once,
	 * above all four.
	 */
	let wantPlaying = $state(false);
	/** Whether a source is still being handed what it was told to load. */
	let attaching = false;

	let active: MediaSource | undefined;
	let fileSource: FileSource | undefined;
	let youtubeSource: YouTubeSource | undefined;
	let spotifySource: SpotifySource | undefined;
	let appleSource: AppleMusicSource | undefined;
	let progressListener: ProgressListener | undefined;
	let nameListener: ((name: string) => void) | undefined;
	// Cleared by any deliberate seek: someone who has just dragged the scrubber to
	// a point has named where they want playback to start, and backing up from
	// there would be the transport overriding an instruction it was just given.
	let rewindOnResume = false;

	/**
	 * Events from a source that is no longer the attached one are dropped.
	 *
	 * A YouTube poll in flight when the user attaches a file would otherwise
	 * report the video's playhead into the file's readout, and a `pause` from the
	 * source being torn down would arm a run-in on the one taking its place.
	 */
	function eventsFor(owner: () => MediaSource | undefined): MediaSourceEvents {
		const live = () => active !== undefined && active === owner();
		return {
			timeChanged(time) {
				if (!live()) return;
				currentTime = time;
				progressListener?.(time, 'progress');
			},
			durationChanged(next) {
				if (!live()) return;
				duration = next;
			},
			ratesChanged(rates) {
				if (!live()) return;
				reconcileRates(rates);
			},
			named(next) {
				if (!live()) return;
				name = next;
				nameListener?.(next);
			},
			artworkChanged(url) {
				if (!live()) return;
				artwork = url;
			},
			started() {
				if (!live()) return;
				playing = true;
			},
			stopped() {
				if (!live()) return;
				playing = false;
				wantPlaying = false;
				rewindOnResume = true;
				progressListener?.(active?.time ?? currentTime, 'settled');
			},
			ended() {
				if (!live()) return;
				playing = false;
				wantPlaying = false;
				rewindOnResume = false;
				progressListener?.(active?.time ?? currentTime, 'settled');
			},
			failed(message) {
				if (!live()) return;
				error = message;
				playing = false;
				// Nothing is going to start now, so the control must stop saying it is.
				wantPlaying = false;
				deps.feedback.announce(message);
			}
		};
	}

	/**
	 * Narrow the offer to what the source can do, and never leave the chosen rate
	 * pointing at something that will be ignored.
	 */
	function reconcileRates(sourceRates: readonly number[]): void {
		const offered = playbackRates.filter((candidate) => sourceRates.includes(candidate));
		availableRates = offered.length > 0 ? offered : [...sourceRates];
		if (availableRates.includes(rate)) return;

		const nearest = availableRates.reduce(
			(best, candidate) => (Math.abs(candidate - rate) < Math.abs(best - rate) ? candidate : best),
			availableRates[0] ?? 1
		);
		const previous = rate;
		player.setRate(nearest);
		deps.feedback.announce(`This source plays at ${nearest}× rather than ${previous}×.`);
	}

	/**
	 * Place the playhead, clamped to the track. Never starts or stops playback.
	 *
	 * Every discrete press lands here — a nudge, a step to the next line — as
	 * against `seek`, which is the scrubber's path and reports ordinary progress.
	 */
	function moveTo(target: number): void {
		const source = active;
		if (source === undefined) return;
		source.seek(clamp(target, 0, source.duration));
		currentTime = source.time;
		// A deliberate placement, so it cancels the run-in the same way a scrub
		// does — otherwise a back-2 followed by a resume moves four seconds and the
		// two controls stop being separately predictable.
		rewindOnResume = false;
		// One press, so it is worth writing down at once. A scrub is not: dragging
		// the length of a track would queue a write for every pixel crossed.
		progressListener?.(source.time, 'settled');
	}

	/**
	 * The step back and the step forward, or nothing when the playhead is already
	 * outside the timed part of the song.
	 *
	 * The margin is what makes repeated presses walk: landing exactly on a cue and
	 * then asking for the one before it must not answer with the cue underfoot,
	 * and a source that reports its own rounding — or the seek it was last told to
	 * make — can be a few milliseconds either side of the number it was given.
	 */
	function cueBefore(time: number): number | undefined {
		return cuePoints.findLast((cue) => cue < time - 0.25);
	}

	function cueAfter(time: number): number | undefined {
		return cuePoints.find((cue) => cue > time + 0.25);
	}

	function file(): FileSource {
		fileSource ??= createFileSource({
			events: eventsFor(() => fileSource),
			createAudio,
			createObjectUrl,
			revokeObjectUrl
		});
		return fileSource;
	}

	function youtube(): YouTubeSource {
		youtubeSource ??= createYouTubeSource({
			events: eventsFor(() => youtubeSource),
			loadApi: deps.loadYouTubeApi ?? loadYouTubeApi,
			...(deps.scheduleYouTubePoll ? { schedule: deps.scheduleYouTubePoll } : {})
		});
		return youtubeSource;
	}

	function spotify(): SpotifySource {
		spotifySource ??= createSpotifySource({
			events: eventsFor(() => spotifySource),
			loadSdk: deps.loadSpotifySdk ?? loadSpotifySdk,
			token: deps.spotifyToken ?? spotifyAccessToken,
			...(deps.spotifyRequest ? { request: deps.spotifyRequest } : {}),
			...(deps.scheduleSpotifyPoll ? { schedule: deps.scheduleSpotifyPoll } : {})
		});
		return spotifySource;
	}

	function apple(): AppleMusicSource {
		const load = deps.loadMusicKit ?? loadMusicKit;
		appleSource ??= createAppleMusicSource({
			events: eventsFor(() => appleSource),
			music: () => configureAppleMusic(load),
			playbackStates: async () => (await load()).PlaybackStates,
			rates: playbackRates,
			...(deps.appleMusicRequest ? { request: deps.appleMusicRequest } : {})
		});
		return appleSource;
	}

	/** Hand the transport to a source, before that source is told what to load. */
	function beginAttachment(next: MediaSource, label: string): void {
		if (active && active !== next) active.clear();
		active = next;
		sourceKind = next.kind;
		name = label;
		error = undefined;
		// Before the load, not after: the outgoing song's cover must not sit over
		// the incoming one for however long its metadata takes to arrive.
		artwork = undefined;
	}

	/**
	 * Reset the readout, *after* the source has been told what to load.
	 *
	 * A source giving up what it was holding reports a stop on the way out, and a
	 * stop arms the resume run-in. Resetting before the load would leave a track
	 * that has never been played owing the user two seconds of somewhere else.
	 */
	function settleAttachment(startAt: number | undefined): void {
		currentTime = startAt ?? 0;
		duration = Number.NaN;
		rewindOnResume = false;
		playing = false;
		wantPlaying = false;
	}

	/**
	 * Spend a press that arrived before the source could act on it.
	 *
	 * Called at the end of every asynchronous attachment, and deliberately not
	 * where a failure has already been reported: a source that could not load has
	 * nothing to play, and starting it anyway would answer a real error with
	 * silence and a Pause button.
	 */
	function playIfAsked(source: MediaSource): void {
		if (!wantPlaying) return;
		if (active !== source || error !== undefined) {
			wantPlaying = false;
			return;
		}
		// The intent is *not* cleared here. It is cleared by the source reporting
		// that playback started, stopped or failed — until one of those arrives the
		// press is still outstanding, and so is the spinner.
		source.play();
	}

	const player: MediaPlayer = {
		get name() {
			return name;
		},
		get attached() {
			return name !== undefined;
		},
		get playing() {
			// The intent, not the source's state: `toggle` has to cancel a start that
			// has not landed rather than ask for it twice, and the control has to say
			// what the user just did rather than what has finished happening.
			return playing || wantPlaying;
		},
		get currentTime() {
			return currentTime;
		},
		get duration() {
			return duration;
		},
		get rate() {
			return rate;
		},
		get error() {
			return error;
		},
		get starting() {
			return wantPlaying && !playing;
		},
		get sourceKind() {
			return sourceKind;
		},
		get artwork() {
			return artwork;
		},
		get availableRates() {
			return availableRates;
		},

		attach(file_, attachment) {
			const source = file();
			beginAttachment(source, attachment?.name ?? file_.name);
			source.load(file_, attachment?.startAt);
			settleAttachment(attachment?.startAt);
			// The rate survives an attachment on purpose: someone transcribing an
			// album at 0.75 should not have to re-choose it for every track.
			source.setRate(rate);
			deps.feedback.announce(`${name} attached.`);
		},

		async attachVideo(video) {
			const source = youtube();
			beginAttachment(source, video.name ?? video.videoId);
			attaching = true;
			const loading = source.load(video.videoId, video.startAt);
			settleAttachment(video.startAt);
			deps.feedback.announce(`${name} attached.`);
			await loading;
			attaching = false;
			if (active !== source) return;
			source.setRate(rate);
			playIfAsked(source);
		},

		async attachTrack(track) {
			const source = spotify();
			beginAttachment(source, track.name ?? track.trackId);
			attaching = true;
			const loading = source.load(track.trackId, track.startAt);
			settleAttachment(track.startAt);
			deps.feedback.announce(`${name} attached.`);
			await loading;
			attaching = false;
			playIfAsked(source);
		},

		async attachSong(song) {
			const source = apple();
			beginAttachment(source, song.name ?? song.songId);
			attaching = true;
			const loading = source.load(song.songId, song.startAt);
			settleAttachment(song.startAt);
			deps.feedback.announce(`${name} attached.`);
			await loading;
			attaching = false;
			if (active !== source) return;
			// Unlike the other two, this one can actually honour it.
			source.setRate(rate);
			playIfAsked(source);
		},

		mountVideo(container) {
			return youtube().mount(container);
		},

		detach() {
			active?.clear();
			active = undefined;
			sourceKind = undefined;
			name = undefined;
			artwork = undefined;
			playing = false;
			wantPlaying = false;
			currentTime = 0;
			duration = Number.NaN;
			error = undefined;
			rewindOnResume = false;
			availableRates = playbackRates;
		},

		play() {
			const source = active;
			if (source === undefined) return;
			// Recorded before anything else, so the control flips and the spinner
			// appears on the press rather than on whatever answers it. A press that
			// works but shows nothing for a second is still a press somebody makes
			// twice.
			wantPlaying = true;
			// Nothing to spend it on yet; the attachment will, when it lands.
			if (attaching) return;
			if (rewindOnResume) {
				const target = clamp(source.time - resumeRewindSeconds, 0, source.duration);
				source.seek(target);
				currentTime = source.time;
				rewindOnResume = false;
			}
			source.play();
		},

		pause() {
			// A press to stop something that has not started yet has to count, or the
			// pending start fires a second later over a user who changed their mind.
			wantPlaying = false;
			active?.pause();
		},

		toggle() {
			// `player.playing`, not the bare state: a queued press counts as playing,
			// so pressing again while a track is still loading cancels it instead of
			// asking for the same start a second time.
			if (player.playing) player.pause();
			else player.play();
		},

		get cuePoints() {
			return cuePoints;
		},

		setCuePoints(times) {
			cuePoints = [...times].sort((a, b) => a - b);
		},

		nudge(seconds) {
			const source = active;
			if (source === undefined) return;
			moveTo(source.time + seconds);
		},

		seek(time) {
			const source = active;
			if (source === undefined) return;
			source.seek(clamp(time, 0, source.duration));
			currentTime = source.time;
			rewindOnResume = false;
			progressListener?.(source.time, 'progress');
		},

		setRate(nextRate) {
			rate = nextRate;
			active?.setRate(nextRate);
		},

		transport(action) {
			const source = active;
			if (action === 'toggle') player.toggle();
			else if (source === undefined) return;
			else if (action === 'back') moveTo(cueBefore(source.time) ?? source.time - nudgeSeconds);
			else moveTo(cueAfter(source.time) ?? source.time + nudgeSeconds);
		},

		liveTime() {
			return active && name !== undefined ? active.time : currentTime;
		},

		setProgressListener(listener) {
			progressListener = listener;
		},

		setNameListener(listener) {
			nameListener = listener;
		},

		destroy() {
			progressListener = undefined;
			nameListener = undefined;
			player.detach();
			fileSource?.destroy();
			fileSource = undefined;
			youtubeSource?.destroy();
			youtubeSource = undefined;
			spotifySource?.destroy();
			spotifySource = undefined;
			appleSource?.destroy();
			appleSource = undefined;
		}
	};

	return player;
}

/** `m:ss`, or `—` before the browser has read the duration. */
export function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '—';
	const whole = Math.floor(seconds);
	const minutes = Math.floor(whole / 60);
	return `${minutes}:${String(whole % 60).padStart(2, '0')}`;
}

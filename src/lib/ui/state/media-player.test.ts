import { describe, expect, it, vi } from 'vitest';
import { createFeedbackState } from './feedback.svelte.js';
import {
	createMediaPlayer,
	cueStepReach,
	formatTime,
	nudgeSeconds,
	resumeRewindSeconds
} from './media-player.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { remoteLoadTimeoutMs } from './media-remote-policy.js';
import { loadYouTubeApi } from './media-youtube.js';

describe('YouTube API loading', () => {
	it('rejects when the script never answers', async () => {
		vi.useFakeTimers();
		vi.stubGlobal('document', {
			createElement: () => ({
				src: '',
				async: false,
				addEventListener: vi.fn()
			}),
			head: { appendChild: vi.fn() }
		});
		const loading = loadYouTubeApi();
		const rejected = expect(loading).rejects.toThrow('did not load in time');

		await vi.advanceTimersByTimeAsync(remoteLoadTimeoutMs);
		await rejected;
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});
});

function setup(durationSeconds = 200) {
	const audio = new StubAudio();
	const revoked: string[] = [];
	const player = createMediaPlayer({
		feedback: createFeedbackState(),
		createAudio: () => audio.asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: (url) => revoked.push(url)
	});

	player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
	audio.setDuration(durationSeconds);

	return { audio, player, revoked };
}

describe('media player transport', () => {
	it('backs up on resume so the phrase either side of a pause is heard again', async () => {
		const { audio, player } = setup();

		player.play();
		audio.currentTime = 40;
		player.pause();
		expect(player.playing).toBe(false);

		player.play();
		expect(audio.currentTime).toBe(40 - resumeRewindSeconds);
		expect(player.currentTime).toBe(40 - resumeRewindSeconds);
	});

	it('rewinds only once per pause, not on every play call', () => {
		const { audio, player } = setup();
		const play = vi.spyOn(audio, 'play');

		player.play();
		audio.currentTime = 40;
		player.pause();
		player.play();
		player.play();

		expect(audio.currentTime).toBe(40 - resumeRewindSeconds);
		// A second caller asking for the state already requested must not become a
		// second source command. Media elements tolerate that; MusicKit rejects it.
		expect(play).toHaveBeenCalledTimes(2);
	});

	it('never rewinds past the start of the track', () => {
		const { audio, player } = setup();

		player.play();
		audio.currentTime = 0.5;
		player.pause();
		player.play();

		expect(audio.currentTime).toBe(0);
	});

	// Back-2 then resume has to move two seconds, not four. Otherwise the two
	// controls stop being separately predictable and the user compensates by
	// pressing one of them a random number of times.
	it('cancels the resume rewind after a deliberate placement', () => {
		const { audio, player } = setup();

		player.play();
		audio.currentTime = 40;
		player.pause();
		player.nudge(-nudgeSeconds);
		expect(audio.currentTime).toBe(38);

		player.play();
		expect(audio.currentTime).toBe(38);
	});

	it('cancels the resume rewind after a scrub', () => {
		const { audio, player } = setup();

		player.play();
		audio.currentTime = 40;
		player.pause();
		player.seek(90);

		player.play();
		expect(audio.currentTime).toBe(90);
	});

	it('clamps a nudge to both ends of the track', () => {
		const { audio, player } = setup(200);

		player.nudge(-nudgeSeconds);
		expect(audio.currentTime).toBe(0);

		player.seek(199);
		player.nudge(nudgeSeconds);
		expect(audio.currentTime).toBe(200);
	});

	// The whole point of timing a lyric is being able to go back to a line, so
	// once there are cues the side keys step between them — and only between
	// them. Outside the timed part of the song the plain nudge is what is left.
	it('steps between cue points, and nudges outside them', () => {
		const { audio, player } = setup(200);
		player.setCuePoints([24, 12, 18]);

		player.seek(25);
		player.transport('back');
		expect(audio.currentTime).toBe(24);
		player.transport('back');
		expect(audio.currentTime).toBe(18);
		player.transport('back');
		expect(audio.currentTime).toBe(12);

		// Before the first cue and after the last one there is nothing to step to.
		player.transport('back');
		expect(audio.currentTime).toBe(12 - nudgeSeconds);

		player.seek(24);
		player.transport('forward');
		expect(audio.currentTime).toBe(24 + nudgeSeconds);

		player.seek(13);
		player.transport('forward');
		expect(audio.currentTime).toBe(18);
	});

	// The step to a cue is a "replay this line" — only worth it while the playhead
	// is actually inside that line. Past the last timed line, or across an untimed
	// stretch between two of them, the nearest cue can be far enough back that
	// leaping to it is worse than the two-second nudge it replaced. Beyond
	// `cueStepReach`, the nudge takes over in both directions.
	it('nudges instead of leaping to a distant cue', () => {
		const { audio, player } = setup(200);
		player.setCuePoints([12, 30, 61]);

		// Sitting in the untimed gap between two timed lines: neither cue is within
		// reach, so both keys nudge rather than jump across the gap.
		player.seek(45);
		player.transport('back');
		expect(audio.currentTime).toBe(45 - nudgeSeconds);
		player.seek(45);
		player.transport('forward');
		expect(audio.currentTime).toBe(45 + nudgeSeconds);

		// Just past the last cue is still inside its line, so back replays it.
		player.seek(61 + cueStepReach - 1);
		player.transport('back');
		expect(audio.currentTime).toBe(61);

		// Far past the last cue — the reported bug — nudges rather than leaping back.
		player.seek(61 + cueStepReach + 5);
		player.transport('back');
		expect(audio.currentTime).toBe(61 + cueStepReach + 5 - nudgeSeconds);
	});

	it('nudges when the song has no cue points', () => {
		const { audio, player } = setup(200);

		player.seek(45);
		player.transport('back');
		expect(audio.currentTime).toBe(45 - nudgeSeconds);
		player.transport('forward');
		expect(audio.currentTime).toBe(45);
	});

	it('keeps the chosen rate across a new attachment', () => {
		const { audio, player } = setup();

		player.setRate(0.75);
		expect(audio.playbackRate).toBe(0.75);

		player.attach(new File([''], 'next.m4a', { type: 'audio/mp4' }));
		expect(audio.playbackRate).toBe(0.75);
		expect(player.rate).toBe(0.75);
		expect(player.name).toBe('next.m4a');
	});

	it('preserves pitch, so the slow rates stay listenable', () => {
		const { audio } = setup();
		expect(audio.preservesPitch).toBe(true);
	});

	it('releases the previous object URL when the file is replaced or detached', () => {
		const { player, revoked } = setup();

		player.attach(new File([''], 'next.m4a', { type: 'audio/mp4' }));
		expect(revoked).toEqual(['blob:test']);

		player.detach();
		expect(revoked).toEqual(['blob:test', 'blob:test']);
		expect(player.attached).toBe(false);
		expect(player.name).toBeUndefined();
	});

	it('does nothing at all with no file attached', () => {
		const audio = new StubAudio();
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => audio.asMediaElement()
		});

		player.transport('toggle');
		player.transport('back');
		expect(player.playing).toBe(false);
		expect(audio.currentTime).toBe(0);
	});

	it('reports a decode failure instead of leaving the strip claiming to play', () => {
		const { audio, player } = setup();

		player.play();
		audio.dispatchEvent(new Event('error'));

		expect(player.playing).toBe(false);
		expect(player.error).toBe('That file could not be played.');
	});
});

describe('media player playhead memory', () => {
	// `currentTime` does not stick before the browser has read the file, so a
	// restore assigned at attach time is silently dropped and the track opens at
	// 0:00 — which is the whole failure this holds off.
	it('holds a restored position until the track has a length', () => {
		const audio = new StubAudio();
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => audio.asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {}
		});

		player.attach(new File([''], 'track.mp3'), { name: 'track.mp3', startAt: 96 });
		// Shown at once, so a restored draft says where it left off immediately.
		expect(player.currentTime).toBe(96);

		audio.setDuration(200);
		expect(audio.currentTime).toBe(96);
		expect(player.currentTime).toBe(96);
	});

	it('clamps a restored position to a track that has since got shorter', () => {
		const audio = new StubAudio();
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => audio.asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {}
		});

		player.attach(new File([''], 'track.mp3'), { name: 'track.mp3', startAt: 400 });
		audio.setDuration(120);

		expect(audio.currentTime).toBe(120);
	});

	it('reports a settled position on pause, on ending, and after a nudge', () => {
		const { audio, player } = setup();
		const seen: [number, string][] = [];
		player.setProgressListener((time, reason) => seen.push([time, reason]));

		player.play();
		audio.currentTime = 30;
		player.pause();
		player.nudge(nudgeSeconds);
		audio.dispatchEvent(new Event('ended'));

		expect(seen).toEqual([
			[30, 'settled'],
			[30 + nudgeSeconds, 'settled'],
			[30 + nudgeSeconds, 'settled']
		]);
	});

	// A drag across the track crosses the whole timeline; writing each step down
	// would be an IndexedDB write per pixel.
	it('reports a scrub as ordinary progress, not as settled', () => {
		const { player } = setup();
		const seen: string[] = [];
		player.setProgressListener((_time, reason) => seen.push(reason));

		player.seek(10);
		player.seek(20);

		expect(seen).toEqual(['progress', 'progress']);
	});
});

/**
 * The gap between a strip drawing and its source being able to do anything.
 *
 * A remote source is not ready the moment its transport appears: a video waits
 * on Google's player, a track on a device registration, a song on a script, a
 * sign-in and a queue. Every press in that gap used to be dropped — press play,
 * get silence, press again, and eventually one lands by luck.
 *
 * Driven through Apple Music because its queue is the easiest of the three to
 * hold open, but the rule under test belongs to the transport and therefore to
 * all four sources.
 */
describe('a press that arrives before the source is ready', () => {
	function slowAttachment() {
		let release = (): void => {};
		const opened = new Promise<void>((resolve) => {
			release = resolve;
		});
		const calls: string[] = [];
		const queues: (number | undefined)[] = [];
		const listeners = new Map<string, (event: never) => void>();
		const instance = {
			isAuthorized: true,
			storefrontId: 'no',
			playbackRate: 1,
			setQueue: async (options: { startTime?: number }) => {
				queues.push(options.startTime);
				await opened;
			},
			play: async () => void calls.push('play'),
			pause: () => void calls.push('pause'),
			seekToTime: async () => {},
			addEventListener: (name: string, handler: (event: never) => void) => {
				listeners.set(name, handler);
			},
			removeEventListener: (name: string) => void listeners.delete(name)
		};

		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => new StubAudio().asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			loadMusicKit: async () =>
				({ PlaybackStates: { playing: 2 }, configure: async () => instance }) as never,
			appleMusicRequest: (async () =>
				new Response('{}', { headers: { 'content-type': 'application/json' } })) as typeof fetch
		});

		const attaching = player.attachSong({ songId: '1091453645', name: 'Kygo — Stole the Show' });
		// MusicKit's own `playing` state number. Nothing reports playback until this
		// is fired, which is the point: `play()` is a request, not a fact.
		const reportPlaying = () => listeners.get('playbackStateDidChange')?.({ state: 2 } as never);
		const reportError = () => listeners.get('mediaPlaybackError')?.({} as never);
		return { player, calls, queues, release, attaching, reportPlaying, reportError };
	}

	it('spends the press once the source can take it, rather than dropping it', async () => {
		const { player, calls, release, attaching } = slowAttachment();

		player.play();
		// It reads as playing at once. A press that works but shows nothing for a
		// second is still a press somebody makes twice.
		expect(player.playing).toBe(true);
		expect(calls).toEqual([]);

		release();
		await attaching;

		expect(calls).toEqual(['play']);
	});

	/**
	 * A seek in the same gap is the line the user tapped, and the queued press
	 * has to start there. It used to be remembered by the readout and dropped by
	 * the audio: the queue kept whatever position the load was built around, so
	 * the song came in from the beginning while the strip said the tapped line.
	 */
	it('starts a press queued behind the load from the position seeked to during it', async () => {
		const { player, calls, queues, release, attaching } = slowAttachment();

		player.seek(30);
		player.play();
		release();
		await attaching;
		await vi.waitFor(() => expect(calls).toContain('play'));

		expect(queues.at(-1)).toBe(30);
		expect(player.currentTime).toBe(30);
	});

	/**
	 * The wait has to be visible, not merely correct.
	 *
	 * `playing` flipping to true is what makes the control say Pause and a second
	 * press cancel — but a Pause button over silence is only half an answer, and
	 * the half that was missing read as nothing having happened. `starting` is the
	 * other half and is the only thing it is for: the surfaces put a spinner in
	 * the glyph's own slot while it is true.
	 */
	it('reports the wait for as long as it lasts, and one press reads as one state', async () => {
		const { player, release, attaching, reportPlaying } = slowAttachment();

		expect(player.starting).toBe(false);
		player.play();
		expect(player.starting).toBe(true);
		expect(player.playing).toBe(true);

		release();
		await attaching;

		// The gap has two halves and the spinner has to cover both. `play()` has
		// been issued by now, but issuing it is a request rather than sound: an
		// earlier version cleared here, which put the Play glyph back on screen for
		// the buffer and made a single press read as spinner, then play, then pause.
		expect(player.starting).toBe(true);
		expect(player.playing).toBe(true);

		reportPlaying();

		expect(player.starting).toBe(false);
		expect(player.playing).toBe(true);
	});

	// Because the queued press reads as playing, the control says Pause — so the
	// obvious second press has to mean what it says and call the start off.
	it('lets a second press cancel a start that has not happened yet', async () => {
		const { player, calls, release, attaching } = slowAttachment();

		player.toggle();
		expect(player.playing).toBe(true);
		player.toggle();
		expect(player.playing).toBe(false);

		release();
		await attaching;

		expect(calls).toEqual([]);
	});

	// Two presses in the gap are one start, not two: the user pressing again
	// because nothing happened must not queue a second play behind the first.
	it('collapses repeated presses into one start', async () => {
		const { player, calls, release, attaching } = slowAttachment();

		player.play();
		player.play();
		player.play();

		release();
		await attaching;

		expect(calls).toEqual(['play']);
	});

	// A loaded remote source still has an asynchronous gap between accepting
	// `play()` and reporting its playing state. MusicKit rejects a second command
	// in that gap instead of treating it as an idempotent request.
	it('issues one remote play command while the first start is still outstanding', async () => {
		const { player, calls, release, attaching } = slowAttachment();
		release();
		await attaching;

		player.play();
		player.play();
		player.play();

		expect(calls).toEqual(['play']);
		expect(player.starting).toBe(true);
	});

	/**
	 * A failure is what the source last said, not what it will always say.
	 *
	 * `error` was only ever cleared by an attach or a detach, so one refused press
	 * — an expired token since refreshed, a device that came back — left the strip
	 * printing that sentence *instead of the scrubber* for the rest of the
	 * attachment, over a track the user could hear. It also armed `playIfAsked` to
	 * refuse the next queued press.
	 *
	 * The source reporting that it started is the one honest signal that the
	 * trouble is over. `play()` deliberately does not clear it: a press is a
	 * request rather than evidence, and clearing there would wipe the explanation
	 * for the previous press at the instant the user made the next one.
	 */
	it('clears the error when the source reports it is playing after all', async () => {
		const { player, release, attaching, reportError, reportPlaying } = slowAttachment();
		release();
		await attaching;

		reportError();
		expect(player.error).toBe('Apple Music could not play that song.');
		expect(player.playing).toBe(false);

		player.play();
		expect(player.error).toBe('Apple Music could not play that song.');

		reportPlaying();
		expect(player.error).toBeUndefined();
		expect(player.playing).toBe(true);
	});

	it('clears a failed remote attachment so a later file can play', async () => {
		const audio = new StubAudio();
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => audio.asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			loadYouTubeApi: async () => {
				throw new Error('blocked');
			}
		});

		await player.attachVideo({ videoId: 'dQw4w9WgXcQ' });
		expect(player.error).toBe('The YouTube player could not be loaded.');

		player.attach(new File([''], 'replacement.mp3'));
		player.play();

		expect(audio.paused).toBe(false);
		expect(player.playing).toBe(true);
	});
});

/**
 * The lock screen is a surface too, and it was the one this workbench was wrong
 * about: `media-shortcuts.ts` registers the action handlers, so the OS buttons
 * worked, and nothing ever said what they were operating. What the notification
 * shade drew was the page's title over a play state left wherever the last
 * session put it.
 */
describe('what the operating system is told about the song', () => {
	class StubMetadata {
		title: string;
		artist: string | undefined;
		artwork: { src: string }[] | undefined;
		constructor(init: { title: string; artist?: string; artwork?: { src: string }[] }) {
			this.title = init.title;
			this.artist = init.artist;
			this.artwork = init.artwork;
		}
	}

	it('names what is playing and keeps the play state in step with the transport', () => {
		vi.stubGlobal('MediaMetadata', StubMetadata);
		// Typed as the stub the global was just replaced with, so what the transport
		// wrote can be read back without asserting anything about it.
		const session = { metadata: null as StubMetadata | null, playbackState: 'none' as string };
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => new StubAudio().asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			mediaSession: session as never
		});

		player.attach(new File([''], 'sensommer.mp3'));
		expect(session.metadata?.title).toBe('sensommer.mp3');
		expect(session.playbackState).toBe('paused');

		player.play();
		expect(session.playbackState).toBe('playing');

		player.pause();
		expect(session.playbackState).toBe('paused');

		// Nothing attached is not the same as something paused, and a lock screen
		// still offering a track this draft has thrown away is a press with nowhere
		// to land.
		player.detach();
		expect(session.metadata).toBeNull();
		expect(session.playbackState).toBe('none');
		vi.unstubAllGlobals();
	});
});

describe('formatTime', () => {
	it('reads as minutes and padded seconds', () => {
		expect(formatTime(0)).toBe('0:00');
		expect(formatTime(9)).toBe('0:09');
		expect(formatTime(75)).toBe('1:15');
		expect(formatTime(3600)).toBe('60:00');
	});

	it('says nothing rather than 0:00 before the duration is known', () => {
		expect(formatTime(Number.NaN)).toBe('—');
		expect(formatTime(Number.POSITIVE_INFINITY)).toBe('—');
	});
});

import { describe, expect, it } from 'vitest';
import { createFeedbackState } from './feedback.svelte.js';
import {
	createMediaPlayer,
	formatTime,
	nudgeSeconds,
	resumeRewindSeconds
} from './media-player.svelte.js';
import { StubAudio } from './media-test-audio.js';

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

		player.play();
		audio.currentTime = 40;
		player.pause();
		player.play();
		player.play();

		expect(audio.currentTime).toBe(40 - resumeRewindSeconds);
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
		player.setCuePoints([61, 12, 30]);

		player.seek(45);
		player.transport('back');
		expect(audio.currentTime).toBe(30);
		player.transport('back');
		expect(audio.currentTime).toBe(12);

		// Before the first cue and after the last one there is nothing to step to.
		player.transport('back');
		expect(audio.currentTime).toBe(12 - nudgeSeconds);

		player.seek(61);
		player.transport('forward');
		expect(audio.currentTime).toBe(61 + nudgeSeconds);

		player.seek(20);
		player.transport('forward');
		expect(audio.currentTime).toBe(30);
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
		const listeners = new Map<string, (event: never) => void>();
		const instance = {
			isAuthorized: true,
			storefrontId: 'no',
			playbackRate: 1,
			setQueue: async () => {
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
		return { player, calls, release, attaching, reportPlaying };
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

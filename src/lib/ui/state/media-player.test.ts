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

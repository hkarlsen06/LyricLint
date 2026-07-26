import { describe, expect, it } from 'vitest';
import { createFeedbackState } from './feedback.svelte.js';
import {
	createMediaPlayer,
	nudgeSeconds,
	playbackRates,
	resumeRewindSeconds
} from './media-player.svelte.js';
import { parseYouTubeVideoId, youtubePollIntervalMs } from './media-youtube.js';
import { createStubPoll, createStubYouTubeApi, stubPlayerState } from './media-test-youtube.js';

const id = 'dQw4w9WgXcQ';

describe('YouTube link parsing', () => {
	// People have a link, not an id, and the link they have is whichever one the
	// share sheet gave them.
	it.each([
		['a watch page', `https://www.youtube.com/watch?v=${id}`],
		['a watch page with no scheme', `youtube.com/watch?v=${id}`],
		['a short link', `https://youtu.be/${id}`],
		['a short link with a timestamp', `https://youtu.be/${id}?t=43`],
		['a watch page behind other parameters', `https://www.youtube.com/watch?app=desktop&v=${id}`],
		[
			'a watch page with a timestamp and a playlist',
			`https://youtube.com/watch?v=${id}&t=90s&list=PLabc123`
		],
		['the mobile host', `https://m.youtube.com/watch?v=${id}`],
		['the music host', `https://music.youtube.com/watch?v=${id}`],
		['the no-cookie host', `https://www.youtube-nocookie.com/embed/${id}`],
		['an embed', `https://www.youtube.com/embed/${id}`],
		['a short', `https://www.youtube.com/shorts/${id}`],
		['a live page', `https://www.youtube.com/live/${id}`],
		['a bare id', id],
		['a link with spaces around it', `  https://youtu.be/${id}  `]
	])('reads the id out of %s', (_case, input) => {
		expect(parseYouTubeVideoId(input)).toEqual({ videoId: id });
	});

	// The `&t=` case is the reason this is `new URL` and not a pattern: a regex
	// that matches eleven characters after `v=` reads the wrong eleven the first
	// time a parameter follows, and does it silently.
	it('is not confused by what follows the id', () => {
		expect(parseYouTubeVideoId(`https://www.youtube.com/watch?v=${id}&t=90s`)).toEqual({
			videoId: id
		});
	});

	it.each([
		['nothing', ''],
		['whitespace', '   '],
		['a sentence', 'the one with the sea in it'],
		['another site', `https://vimeo.com/${id}`],
		['a lookalike host', `https://youtube.com.example.net/watch?v=${id}`]
	])('rejects %s as not a YouTube link', (_case, input) => {
		const result = parseYouTubeVideoId(input);
		expect('error' in result).toBe(true);
	});

	it.each([
		['a bare host', 'https://www.youtube.com/'],
		['a channel page', 'https://www.youtube.com/@someone'],
		['a watch page with no v', 'https://www.youtube.com/watch?list=PLabc123'],
		['a short link with nothing after it', 'https://youtu.be/'],
		['an id of the wrong length', 'https://www.youtube.com/watch?v=short'],
		['an id with a character no id has', `https://www.youtube.com/watch?v=dQw4w9WgXc!`]
	])('rejects %s as having no video in it', (_case, input) => {
		expect(parseYouTubeVideoId(input)).toEqual({ error: 'That link has no video id in it.' });
	});

	it('says something a reader can act on rather than nothing', () => {
		const result = parseYouTubeVideoId('nonsense');
		expect(result).toEqual({ error: 'That is not a YouTube link.' });
	});
});

// The whole of the opt-in rests on this: importing the module, which every
// surface that can offer YouTube does, must not be what fetches Google's script.
describe('the YouTube API at rest', () => {
	it('injects nothing on import', () => {
		expect(document.querySelector('script[src*="youtube.com"]')).toBeNull();
	});
});

function setup() {
	const stub = createStubYouTubeApi();
	const poll = createStubPoll();
	const feedback = createFeedbackState();
	const player = createMediaPlayer({
		feedback,
		loadYouTubeApi: stub.load,
		scheduleYouTubePoll: poll.schedule
	});

	async function attach(startAt?: number) {
		const container = document.createElement('div');
		document.body.append(container);
		player.mountVideo(container);
		await player.attachVideo({
			videoId: id,
			name: 'Sensommer',
			...(startAt === undefined ? {} : { startAt })
		});
		const video = stub.players.at(-1);
		if (!video) throw new Error('The stub API built no player.');
		return video;
	}

	return { attach, feedback, player, poll, stub };
}

/**
 * The transport is one implementation, so these are the local-file assertions
 * from `media-player.test.ts` run against the other source. Any number that
 * comes out different here is the abstraction having failed at its one job.
 */
describe('YouTube transport arithmetic', () => {
	it('backs up on resume, exactly as a local file does', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		video.currentTime = 40;
		player.pause();
		expect(player.playing).toBe(false);

		player.play();
		expect(video.currentTime).toBe(40 - resumeRewindSeconds);
		expect(player.currentTime).toBe(40 - resumeRewindSeconds);
	});

	it('rewinds only once per pause', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		video.currentTime = 40;
		player.pause();
		player.play();
		player.play();

		expect(video.currentTime).toBe(40 - resumeRewindSeconds);
	});

	it('never rewinds past the start of the track', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		video.currentTime = 0.5;
		player.pause();
		player.play();

		expect(video.currentTime).toBe(0);
	});

	it('cancels the resume rewind after a nudge', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		video.currentTime = 40;
		player.pause();
		player.nudge(-nudgeSeconds);
		expect(video.currentTime).toBe(38);

		player.play();
		expect(video.currentTime).toBe(38);
	});

	it('clamps a nudge to both ends of the track', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.nudge(-nudgeSeconds);
		expect(video.currentTime).toBe(0);

		player.seek(199);
		player.nudge(nudgeSeconds);
		expect(video.currentTime).toBe(200);
	});

	// The gap this whole source exists to hide. `seekTo` crosses a postMessage
	// bridge, so the next `getCurrentTime` still answers with where the user just
	// left — and arithmetic read off that answer moves four seconds for a back-2
	// and a resume, which is the failure the local-file transport is written to
	// avoid in the first place.
	it('reads its own target back while the player is still catching up', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });
		video.seekLatencyReads = 3;

		player.play();
		video.currentTime = 40;
		player.pause();

		player.play();
		expect(player.currentTime).toBe(38);
		// Still answering 40 across the bridge, and it must not matter.
		expect(video.getCurrentTime()).toBe(40);

		player.nudge(-nudgeSeconds);
		expect(player.currentTime).toBe(36);
	});

	it('opens where the draft left off', async () => {
		const { attach, player } = setup();
		const video = await attach(143);
		// Shown before the player exists to be asked, the way a restored file
		// position is shown before the browser has read the file.
		expect(player.currentTime).toBe(143);

		video.ready({ duration: 200 });
		expect(video.currentTime).toBe(143);
	});
});

describe('the YouTube poll', () => {
	it('runs only while the video is playing', async () => {
		const { attach, player, poll } = setup();
		const video = await attach();
		video.ready({ duration: 200 });
		expect(poll.running).toBe(false);

		player.play();
		expect(poll.running).toBe(true);

		video.currentTime = 12;
		poll.advance();
		expect(player.currentTime).toBe(12);

		player.pause();
		expect(poll.running).toBe(false);
		expect(poll.stops).toBe(1);
	});

	// Four a second, which is what a media element's `timeupdate` works out at and
	// therefore what the position write throttle downstream was tuned against.
	it('ticks at the rate a media element reports at, and reports ordinary progress', async () => {
		const { attach, player, poll } = setup();
		const video = await attach();
		video.ready({ duration: 200 });
		const seen: [number, string][] = [];
		player.setProgressListener((time, reason) => seen.push([time, reason]));

		player.play();
		expect(poll.intervalMs).toBe(youtubePollIntervalMs);
		expect(youtubePollIntervalMs).toBeLessThanOrEqual(250);

		video.currentTime = 4;
		poll.advance();
		video.currentTime = 8;
		poll.advance();

		expect(seen).toEqual([
			[4, 'progress'],
			[8, 'progress']
		]);
	});

	it('stops when the video is detached, so nothing is left ticking', async () => {
		const { attach, player, poll } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		expect(poll.running).toBe(true);

		player.detach();
		expect(poll.running).toBe(false);
		expect(video.destroyed).toBe(true);
	});

	it('stops when the track ends', async () => {
		const { attach, player, poll } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		video.setState(stubPlayerState.ENDED);

		expect(poll.running).toBe(false);
		expect(player.playing).toBe(false);
	});
});

describe('YouTube playback rates', () => {
	// YouTube's menu is wider at both ends than the workbench offers, so what the
	// user sees is the workbench's list and nothing new appears from the source.
	it('offers the workbench list where the source can play all of it', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		expect(player.availableRates).toEqual([...playbackRates]);
	});

	it('offers only the rates the source will actually apply', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.rates = [0.5, 1, 2];
		video.ready({ duration: 200 });

		// 2 is not on the workbench's list and 0.75 is not on the source's, so
		// neither is offered — a rate the user can press and not hear is worse
		// than one rate fewer.
		expect(player.availableRates).toEqual([0.5, 1]);
	});

	it('moves a chosen rate the source cannot apply rather than pretending', async () => {
		const { attach, player } = setup();
		player.setRate(0.5);

		const video = await attach();
		video.rates = [1];
		video.ready({ duration: 200 });

		expect(player.availableRates).toEqual([1]);
		expect(player.rate).toBe(1);
		expect(video.rate).toBe(1);
	});
});

describe('what a video says about itself', () => {
	it('takes the title once the player answers with one', async () => {
		const { attach, player } = setup();
		const seen: string[] = [];
		player.setNameListener((name) => seen.push(name));

		const video = await attach();
		expect(player.name).toBe('Sensommer');

		video.ready({ duration: 200, title: 'Sensommer — live' });
		expect(player.name).toBe('Sensommer — live');
		expect(seen).toEqual(['Sensommer — live']);
	});

	it('states a playback failure in place rather than claiming to play', async () => {
		const { attach, player } = setup();
		const video = await attach();
		video.ready({ duration: 200 });

		player.play();
		video.fail();

		expect(player.playing).toBe(false);
		expect(player.error).toBe('That video could not be played.');
	});
});

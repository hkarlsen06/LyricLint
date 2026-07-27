import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { createMediaStore } from '../state/media-store.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
import type { MediaHandleRecord } from '$lib/persistence/index.js';
import MediaStrip from './MediaStrip.svelte';

function store(options: { records?: MediaHandleRecord[]; file?: File } = {}) {
	const audio = new StubAudio();
	const feedback = createFeedbackState();
	// Nothing in this file reaches Google: the API is a stub and the poll is a
	// function the test would have to call.
	const youtube = createStubYouTubeApi();
	const poll = createStubPoll();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => audio.asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadYouTubeApi: youtube.load,
		scheduleYouTubePoll: poll.schedule
	});
	const file = options.file ?? new File([''], 'track.mp3', { type: 'audio/mpeg' });
	const media = createMediaStore({
		repository: createInMemoryMediaRepository(options.records ?? []),
		feedback,
		draftId: () => 'draft-1',
		player,
		pickFile: async () => ({ file })
	});

	return { audio, media, player, youtube };
}

/**
 * A strip with a Spotify track on it, and nothing reaching Spotify.
 *
 * The SDK is a stub whose device never arrives, which is enough: attaching is
 * silent by design, so the name and the link are in place before any player is.
 */
async function spotifyStore() {
	const feedback = createFeedbackState();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadSpotifySdk: async () => ({ Player: class {} }) as never,
		spotifyToken: async () => 'token',
		spotifyRequest: (async () =>
			new Response(JSON.stringify({ name: 'Sensommer', artists: [{ name: 'Mul' }] }), {
				status: 200,
				headers: { 'content-type': 'application/json' }
			})) as typeof fetch,
		scheduleSpotifyPoll: () => () => {}
	});
	const media = createMediaStore({
		repository: createInMemoryMediaRepository(),
		feedback,
		draftId: () => 'draft-1',
		player
	});
	await media.attachSpotifyTrack('4cOdK2wGLETKBW3PvgPWqT', 'Mul — Sensommer');
	return { media, player };
}

/** The same, one source over, and nothing reaching Apple. */
async function appleStore() {
	const feedback = createFeedbackState();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadMusicKit: async () =>
			({
				PlaybackStates: { playing: 2, paused: 3 },
				configure: async () => ({
					isAuthorized: true,
					storefrontId: 'no',
					playbackRate: 1,
					setQueue: async () => undefined,
					addEventListener: () => {},
					removeEventListener: () => {}
				})
			}) as never,
		appleMusicRequest: (async () =>
			new Response(
				JSON.stringify({ data: [{ attributes: { name: 'Stole the Show', artistName: 'Kygo' } }] }),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)) as typeof fetch
	});
	const media = createMediaStore({
		repository: createInMemoryMediaRepository(),
		feedback,
		draftId: () => 'draft-1',
		player
	});
	await media.attachAppleMusicSong('1091453645', 'Kygo — Stole the Show');
	return { media, player };
}

describe('MediaStrip', () => {
	it('offers the transport, the elapsed time, and the track at both ends', async () => {
		const { audio, media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(125);

		render(MediaStrip, { props: { media } });
		const modifier = navigator.platform.toLocaleLowerCase().includes('mac') ? 'Control' : 'Alt';
		const modifierKey = modifier === 'Control' ? '⌃' : modifier;

		const back = page.getByRole('button', { name: 'Back 2 seconds' });
		const play = page.getByRole('button', { name: 'Play' });
		const forward = page.getByRole('button', { name: 'Forward 2 seconds' });

		await expect.element(play).toBeVisible();
		await expect.element(back).toBeVisible();
		await expect.element(forward).toBeVisible();
		await expect
			.element(back)
			.toHaveAttribute('aria-keyshortcuts', `F7 ${modifier}+J Control+Alt+J`);
		await expect
			.element(play)
			.toHaveAttribute('aria-keyshortcuts', `F8 Space ${modifier}+K Control+Alt+K`);
		await expect
			.element(forward)
			.toHaveAttribute('aria-keyshortcuts', `F9 ${modifier}+L Control+Alt+L`);
		// One cap per control, modifier folded into it — not a repeated `⌃` box.
		expect([...back.element().querySelectorAll('kbd')].map((key) => key.textContent)).toEqual([
			`${modifierKey}J`
		]);
		expect([...play.element().querySelectorAll('kbd')].map((key) => key.textContent)).toEqual([
			`${modifierKey}K`
		]);
		expect([...forward.element().querySelectorAll('kbd')].map((key) => key.textContent)).toEqual([
			`${modifierKey}L`
		]);
		const detach = page.getByRole('button', { name: 'Detach track.mp3' });
		// The stack's own content has to fit the height the row's other controls
		// already set, or the shortcut caption costs the document a strip of pixels.
		const stack = play.element() as HTMLElement;
		const glyph = (stack.querySelector('svg') as SVGElement).getBoundingClientRect();
		const cap = (stack.querySelector('kbd') as HTMLElement).getBoundingClientRect();
		expect(cap.bottom - glyph.top).toBeLessThanOrEqual(
			(detach.element() as HTMLElement).offsetHeight
		);
		await expect.element(page.getByTestId('media-elapsed')).toHaveTextContent('0:00');
		await expect.element(page.getByText('2:05')).toBeVisible();
		await expect.element(page.getByText('track.mp3')).toBeVisible();
		await expect.element(page.getByRole('slider', { name: 'Seek' })).toBeEnabled();
	});

	// A timed song moves the side keys off seconds and onto lines, so a control
	// still naming a number of seconds would be naming something it no longer does.
	it('names the side controls after the lines once the song is timed', async () => {
		const { audio, media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(125);
		player.setCuePoints([12, 30]);

		render(MediaStrip, { props: { media } });

		await expect.element(page.getByRole('button', { name: 'Previous line' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Next line' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Back 2 seconds' }).elements()).toHaveLength(0);
	});

	it('swaps the middle control to Pause while playing, keeping its slot', async () => {
		const { audio, media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(60);

		render(MediaStrip, { props: { media } });

		await page.getByRole('button', { name: 'Play' }).click();
		await expect.element(page.getByRole('button', { name: 'Pause' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Play' }).elements()).toHaveLength(0);

		await page.getByRole('button', { name: 'Pause' }).click();
		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
	});

	// A scrubber that spans an unknown range is a control that cannot be aimed.
	it('holds the scrubber until the browser has read the duration', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));

		render(MediaStrip, { props: { media } });

		await expect.element(page.getByRole('slider', { name: 'Seek' })).toBeDisabled();
	});

	it('names the remembered file in the reconnect control and offers no transport', async () => {
		const { media } = store({
			records: [{ draftId: 'draft-1', name: 'sensommer.mp3', attachedAt: '2026-07-01T00:00:00Z' }]
		});
		await media.openFor('draft-1');

		render(MediaStrip, { props: { media } });

		await expect
			.element(page.getByRole('button', { name: 'Reconnect sensommer.mp3' }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Forget sensommer.mp3' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Play' }).elements()).toHaveLength(0);
		expect(page.getByRole('slider', { name: 'Seek' }).elements()).toHaveLength(0);
	});

	it('reconnects into the full transport when the control is pressed', async () => {
		const { media } = store({
			records: [{ draftId: 'draft-1', name: 'sensommer.mp3', attachedAt: '2026-07-01T00:00:00Z' }]
		});
		await media.openFor('draft-1');

		render(MediaStrip, { props: { media } });

		await page.getByRole('button', { name: 'Reconnect sensommer.mp3' }).click();

		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
		expect(media.pendingName).toBeUndefined();
		expect(media.player.attached).toBe(true);
	});

	// The error is prose in the row, not a tinted box appearing inside the strip,
	// and the file stays named so re-attaching is one press away.
	it('states a decode failure in place of the scrubber', async () => {
		const { audio, media, player } = store();
		player.attach(new File([''], 'broken.mp3', { type: 'audio/mpeg' }));
		audio.dispatchEvent(new Event('error'));

		render(MediaStrip, { props: { media } });

		await expect.element(page.getByText('That file could not be played.')).toBeVisible();
		expect(page.getByRole('slider', { name: 'Seek' }).elements()).toHaveLength(0);
		await expect.element(page.getByText('broken.mp3')).toBeVisible();
	});

	// The transport is the same transport whichever source is playing, and this row
	// is only the transport. The picture belongs to the right panel's foot, so
	// attaching a video must not grow the editor column by a frame.
	it('draws no picture for either source', async () => {
		const { audio, media, player } = store();
		render(MediaStrip, { props: { media } });

		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(125);
		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
		expect(document.querySelectorAll('.media-video')).toHaveLength(0);

		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');

		await expect.element(page.getByRole('button', { name: 'Play' })).toBeVisible();
		expect(document.querySelectorAll('.media-video')).toHaveLength(0);
	});

	// `loadVideoById` autoplays by design, so reusing an existing player — a draft
	// switch, a reconnect, an HMR reload — started the song on its own.
	it('does not start playing when an existing player is reused', async () => {
		const { media, player, youtube } = store();
		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
		player.mountVideo(document.createElement('div'));
		const video = youtube.players.at(-1);
		if (!video) throw new Error('no player was built');
		video.ready({ duration: 200 });
		expect(player.playing).toBe(false);

		// The same video adopted again, the way `openFor` does on a draft switch.
		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');

		expect(youtube.players).toHaveLength(1);
		expect(player.playing).toBe(false);
	});

	it('offers only the rates the attached source will apply', async () => {
		const { media, player, youtube } = store();
		await media.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
		// The picture draws in the right panel, so nothing this row renders builds a
		// player. Stand in for that mount: what is under test here is the strip's
		// speed control answering to whatever the source turns out to allow.
		player.mountVideo(document.createElement('div'));

		render(MediaStrip, { props: { media } });

		const select = page.getByRole('combobox', { name: 'Playback speed' });
		await expect.element(select).toBeVisible();
		// Until the player answers, the workbench's own offer stands; a control
		// that collapsed to one option and grew back would be worse than either.
		expect(select.element().querySelectorAll('option')).toHaveLength(5);

		const video = youtube.players.at(-1);
		if (!video) throw new Error('The strip mounted no player for the video.');
		video.rates = [0.5, 1, 2];
		video.ready({ duration: 200 });

		expect(player.availableRates).toEqual([0.5, 1]);
		await expect.element(select).toBeVisible();
		expect(select.element().querySelectorAll('option')).toHaveLength(2);
	});

	it('says which question the waiting control is asking', async () => {
		const { media } = store({
			records: [
				{
					draftId: 'draft-1',
					name: 'Sensommer',
					source: 'youtube',
					videoId: 'dQw4w9WgXcQ',
					attachedAt: '2026-07-01T00:00:00Z'
				}
			]
		});
		await media.openFor('draft-1');

		render(MediaStrip, { props: { media } });

		// Naming YouTube in the control is what makes the press the consent: a bare
		// "Reconnect" would spend it without saying so.
		await expect
			.element(page.getByRole('button', { name: 'Load Sensommer from YouTube' }))
			.toBeVisible();
		expect(page.getByRole('button', { name: 'Reconnect Sensommer' }).elements()).toHaveLength(0);
	});

	// Timing the whole lyric is a transport activity, so its control is in the
	// transport. While a run is under way the strip stops naming the file and
	// offers the tap instead — the document has quietly stopped taking typing, and
	// `Stop syncing` explains that only to someone who already knows what syncing
	// is. The tap is a real control on every pointer, not one that appears under a
	// coarse one: a button that exists only on some devices is one nobody tests.
	it('offers the sync control and swaps the track name for the tap while it runs', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		let active = $state(false);
		let taps = 0;
		const sync = {
			get active() {
				return active;
			},
			toggle: () => {
				active = !active;
			},
			tap: () => {
				taps += 1;
			}
		};

		render(MediaStrip, { props: { media, sync } });

		await expect.element(page.getByText('track.mp3')).toBeVisible();
		expect(page.getByRole('button', { name: 'Tap each line' }).elements()).toHaveLength(0);

		await page.getByRole('button', { name: 'Sync lyrics' }).click();

		expect(active).toBe(true);
		await expect.element(page.getByRole('button', { name: 'Stop syncing' })).toBeVisible();
		await expect.element(page.getByText('Esc stops')).toBeVisible();
		expect(page.getByText('track.mp3').elements()).toHaveLength(0);

		// The press runs the run's own command, which is the whole point of the
		// control: a phone has no `Space` to stand in for it.
		await page.getByRole('button', { name: 'Tap each line' }).click();
		expect(taps).toBe(1);
	});

	// A finished song states that it is finished, and is still the same one-press
	// control: `runStart` reads a fully timed lyric as a fresh pass from the top,
	// so a readout here would take away the only way to re-time a song.
	it('reads Lyrics synced when every line is timed, and still starts a fresh run', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		let active = $state(false);
		const sync = {
			get active() {
				return active;
			},
			complete: true,
			toggle: () => {
				active = !active;
			},
			tap: () => {}
		};

		render(MediaStrip, { props: { media, sync } });

		await page.getByRole('button', { name: 'Lyrics synced' }).click();

		expect(active).toBe(true);
		await expect.element(page.getByRole('button', { name: 'Stop syncing' })).toBeVisible();
	});

	// A strip mounted without one has nothing to toggle, which is what keeps the
	// control from appearing in a build whose editor cannot enter the mode.
	it('draws no sync control when the shell offers none', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));

		render(MediaStrip, { props: { media } });

		await expect.element(page.getByText('track.mp3')).toBeVisible();
		expect(page.getByRole('button', { name: /sync/iu }).elements()).toHaveLength(0);
	});

	/**
	 * The loop is listen, pause, type — so a press on the transport must not take
	 * focus off the document. On a phone that is the whole difference between
	 * pausing to fix a word and pausing, losing the keyboard, and tapping back into
	 * the line to get it again.
	 *
	 * Asserted on `defaultPrevented` rather than on where focus ended up, because
	 * moving focus *is* the default action being prevented: there is nothing left
	 * to observe afterwards.
	 */
	it('keeps the caret in the document when a transport button is pressed', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));

		render(MediaStrip, { props: { media } });

		const play = page.getByRole('button', { name: 'Play' }).element();
		const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		play.dispatchEvent(press);

		expect(press.defaultPrevented).toBe(true);
	});

	/**
	 * The scrubber and the rate control are the exception. Both need their own
	 * press — one to drag, one to open — and both are aimed rather than tapped, so
	 * a lost keyboard is the cheaper of the two costs.
	 */
	it('leaves the scrubber and the rate control their own press', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));

		render(MediaStrip, { props: { media } });

		for (const control of [
			page.getByRole('slider').element(),
			page.getByRole('combobox').element()
		]) {
			const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			control.dispatchEvent(press);
			expect(press.defaultPrevented).toBe(false);
		}
	});

	it('detaching clears the strip and forgets the file for this draft', async () => {
		const { media, player } = store();
		await media.attachFile(new File([''], 'track.mp3', { type: 'audio/mpeg' }));

		render(MediaStrip, { props: { media } });

		await page.getByRole('button', { name: 'Detach track.mp3' }).click();

		expect(player.attached).toBe(false);
		expect(media.pendingName).toBeUndefined();
		await media.openFor('draft-1');
		expect(media.pendingName).toBeUndefined();
	});
});

// Spotify's Design Guidelines require the mark, the track and artist beside it,
// and a way back to the track — and a missing one of those is the most common
// reason a quota-extension request is refused.
describe('MediaStrip attribution', () => {
	it('names the track and links the mark to it on Spotify', async () => {
		const { media } = await spotifyStore();
		render(MediaStrip, { props: { media } });

		const link = page.getByRole('link', { name: 'Open Mul — Sensommer on Spotify' });
		await expect
			.element(link)
			.toHaveAttribute('href', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
		// A new tab, because the workbench is a document being typed into.
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	// It is a brand asset, so it takes Spotify's green rather than the accent
	// every other link on the page inherits — and their stated 21px floor.
	it('draws the mark in Spotify green at their minimum size', async () => {
		const { media } = await spotifyStore();
		render(MediaStrip, { props: { media } });

		const link = page.getByRole('link', { name: 'Open Mul — Sensommer on Spotify' }).element();
		expect(getComputedStyle(link).color).toBe('rgb(29, 185, 84)');
		expect(link.querySelector('svg')?.getAttribute('width')).toBe('21');
	});

	it('draws no mark for a source that is not Spotify', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		render(MediaStrip, { props: { media } });

		expect(document.querySelector('.media-strip__spotify')).toBeNull();
	});

	// Apple wants the same thing, and gets their own supplied lockup for it.
	it('carries Apple’s badge and links back to the song', async () => {
		const { media } = await appleStore();
		render(MediaStrip, { props: { media } });

		const link = page.getByRole('link', {
			name: 'Listen to Kygo — Stole the Show on Apple Music'
		});
		await expect.element(link).toHaveAttribute('href', 'https://music.apple.com/song/1091453645');
		await expect.element(link).toHaveAttribute('target', '_blank');
		await expect.element(link).toHaveAttribute('rel', 'noopener noreferrer');
	});

	/**
	 * The three things Apple's identity guidelines forbid, asserted as a shape
	 * rather than trusted to a comment.
	 *
	 * Their artwork must be used rather than redrawn, the `Listen on` call to
	 * action may not be removed from the badge, and it may not be stretched or
	 * recolored. So: an `<img>` pointing at their file (not an inline path we
	 * could have cut ourselves), drawn at the artwork's own 125.1 × 27.78.
	 *
	 * The ratio is measured rather than assumed, because the obvious way to write
	 * this markup gets it wrong: `width`/`height` attributes are parsed as
	 * integers, so 125 × 28 squeezes the badge by 0.9% — invisible, and still the
	 * thing the guidelines name.
	 *
	 * The data URI is the third rule and a fix in its own right. Apple's lockups
	 * are ~7.5KB, over Vite's 4096-byte inline threshold, so they shipped as
	 * separate files and the badge visibly popped in a moment after a song
	 * attached — a request that only starts when the element mounts, which is
	 * exactly when the user is looking at that row. Inlining is also byte-for-byte
	 * their file, where minifying it to fit would not have been.
	 */
	it('uses Apple’s own artwork at its own aspect ratio, with no second request', async () => {
		const { media } = await appleStore();
		render(MediaStrip, { props: { media } });

		const badge = document.querySelector('.media-strip__apple img') as HTMLImageElement;
		const src = badge.getAttribute('src') ?? '';
		expect(src.startsWith('data:image/svg+xml')).toBe(true);
		// Their own gradient, still in the file: this is Apple's artwork rather
		// than something redrawn to be small enough to inline.
		expect(decodeURIComponent(src)).toContain('#FA233B');

		const box = badge.getBoundingClientRect();
		expect(box.width / box.height).toBeCloseTo(125.1 / 27.78, 3);
		// The dark-scheme twin is offered by the browser rather than by a theme
		// value, so exactly one of the two files is ever fetched.
		const source = document.querySelector('.media-strip__apple source');
		expect(source?.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
	});

	it('draws no attribution at all for a local file', async () => {
		const { media, player } = store();
		player.attach(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		render(MediaStrip, { props: { media } });

		expect(document.querySelector('.media-strip__apple')).toBeNull();
	});
});

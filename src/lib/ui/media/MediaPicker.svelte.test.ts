import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { createMediaStore } from '../state/media-store.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
import MediaPicker from './MediaPicker.svelte';

/**
 * A picker whose two answers are both stubbed.
 *
 * The file side never opens an OS dialog and the video side never reaches
 * Google: `youtube.loads` is the number of times the real loader would have
 * injected a script tag, which is what makes "nothing has been fetched" an
 * assertion rather than a hope.
 */
function setup(options: { file?: File | undefined } = {}) {
	const feedback = createFeedbackState();
	const youtube = createStubYouTubeApi();
	const poll = createStubPoll();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => new StubAudio().asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadYouTubeApi: youtube.load,
		scheduleYouTubePoll: poll.schedule
	});
	const file = 'file' in options ? options.file : new File([''], 'track.mp3');
	const media = createMediaStore({
		repository: createInMemoryMediaRepository(),
		feedback,
		draftId: () => 'draft-1',
		player,
		pickFile: async () => (file ? { file } : undefined)
	});

	render(MediaPicker, { props: { media } });
	return { media, youtube };
}

const dialog = () => document.querySelector('dialog');

describe('MediaPicker', () => {
	it('is one trigger in the status bar and nothing else until it is pressed', async () => {
		const { youtube } = setup();

		await expect.element(page.getByRole('button', { name: 'Add audio' })).toBeVisible();
		expect(dialog()?.open).toBe(false);
		expect(youtube.loads).toBe(0);
	});

	it('offers every answer to one question, in one place', async () => {
		setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		expect(dialog()?.open).toBe(true);
		await expect.element(page.getByRole('button', { name: 'Choose a file…' })).toBeVisible();
		await expect.element(page.getByLabelText('YouTube link')).toBeVisible();
		await expect.element(page.getByLabelText('Spotify search')).toBeVisible();
	});

	// The trade is stated where the decision is made, not an hour earlier in a
	// panel the reader has since scrolled past — and as a line of facts rather
	// than a paragraph of prose, which read as a warning about the button under it.
	it('states what YouTube costs before the press that spends it, having loaded nothing', async () => {
		const { youtube } = setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		await expect
			.element(page.getByText('Google can theoretically see what you play ·', { exact: false }))
			.toBeVisible();
		expect(youtube.loads).toBe(0);
	});

	// The answer most transcribers have is the one they meet first, and the local
	// file — the answer that always works and needs nothing — anchors the end.
	it('leads with YouTube and closes with the file', async () => {
		setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		const controls = [...(dialog()?.querySelectorAll('input, button.button') ?? [])];
		expect(controls.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim())).toEqual([
			'YouTube link',
			'Use video',
			'Spotify search',
			'Search',
			'Choose a file…'
		]);
	});

	// Spotify is the one source that does not need the user to go and fetch a
	// link first, and the search field is that. One field takes both, so a paste
	// still works without a second control beside it.
	it('asks for a track by name rather than by link', async () => {
		setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		const field = page.getByLabelText('Spotify search').element() as HTMLInputElement;
		expect(field.placeholder).toBe('Search Spotify, or paste a link');
	});

	// Spotify costs a subscription and the speed control, and both are facts the
	// user needs in front of them before the press rather than after it.
	it('states what Spotify costs, including the rate it takes away', async () => {
		setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		await expect.element(page.getByText('Needs Spotify Premium ·', { exact: false })).toBeVisible();
		await expect.element(page.getByText('No speed control', { exact: false })).toBeVisible();
	});

	it('takes a chosen file and closes on the answer', async () => {
		const { media } = setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		await page.getByRole('button', { name: 'Choose a file…' }).click();

		expect(media.player.attached).toBe(true);
		expect(media.player.name).toBe('track.mp3');
		expect(dialog()?.open).toBe(false);
	});

	// A dismissed OS picker is not an answer, so the question stays open.
	it('stays open when the file picker is dismissed', async () => {
		const { media } = setup({ file: undefined });
		await page.getByRole('button', { name: 'Add audio' }).click();

		await page.getByRole('button', { name: 'Choose a file…' }).click();

		expect(media.player.attached).toBe(false);
		expect(dialog()?.open).toBe(true);
	});

	it('answers a link that is not one in place, and spends nothing', async () => {
		const { media, youtube } = setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		await page.getByLabelText('YouTube link').fill('https://vimeo.com/12345');
		await page.getByRole('button', { name: 'Use video' }).click();

		await expect.element(page.getByText('That is not a YouTube link.')).toBeVisible();
		expect(youtube.loads).toBe(0);
		expect(media.youtubeAllowed).toBe(false);
		// Still open, so the link can be corrected where it was typed.
		expect(dialog()?.open).toBe(true);
	});

	it('treats a real link as the opt-in and closes the question', async () => {
		const { media, youtube } = setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		await page
			.getByLabelText('YouTube link')
			.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');
		await page.getByRole('button', { name: 'Use video' }).click();

		await vi.waitFor(() => expect(youtube.loads).toBe(1));
		expect(media.youtubeAllowed).toBe(true);
		expect(media.player.sourceKind).toBe('youtube');
		expect(dialog()?.open).toBe(false);
	});

	it('closes on Escape and on the closing control, abandoning what was typed', async () => {
		setup();
		await page.getByRole('button', { name: 'Add audio' }).click();
		await page.getByLabelText('YouTube link').fill('https://vimeo.com/12345');

		await userEvent.keyboard('{Escape}');
		expect(dialog()?.open).toBe(false);

		await page.getByRole('button', { name: 'Add audio' }).click();
		expect((page.getByLabelText('YouTube link').element() as HTMLInputElement).value).toBe('');

		await page.getByRole('button', { name: 'Close' }).click();
		expect(dialog()?.open).toBe(false);
	});

	// A draft already on a video opens the field holding that video's link,
	// selected — copying it out and typing over it are both one gesture from here.
	it('prefills and selects the link of the video already attached', async () => {
		const { media } = setup();
		await media.attachYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s');

		await page.getByRole('button', { name: 'Change audio' }).click();

		const input = page.getByLabelText('YouTube link').element() as HTMLInputElement;
		expect(input.value).toBe('https://youtu.be/dQw4w9WgXcQ');
		expect(input.selectionStart).toBe(0);
		expect(input.selectionEnd).toBe(input.value.length);
	});

	// A file is not a link, so there is nothing to offer back.
	it('opens empty for a draft on a local file', async () => {
		const { media } = setup();
		await media.attachFile(new File([''], 'track.mp3'));

		await page.getByRole('button', { name: 'Change audio' }).click();

		expect((page.getByLabelText('YouTube link').element() as HTMLInputElement).value).toBe('');
	});

	// The slot never moves; only the label follows the state. A control that
	// disappeared once audio was attached would take the only way to swap tracks
	// with it.
	it('keeps its slot and renames itself once audio is attached', async () => {
		const { media } = setup();
		await expect.element(page.getByRole('button', { name: 'Add audio' })).toBeVisible();

		await media.attachFile(new File([''], 'track.mp3'));

		await expect.element(page.getByRole('button', { name: 'Change audio' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Add audio' }).elements()).toHaveLength(0);
	});
});

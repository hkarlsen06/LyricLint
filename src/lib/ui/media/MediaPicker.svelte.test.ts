import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';
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
function setup(options: { file?: File | undefined; draftTitle?: string } = {}) {
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

	render(MediaPicker, {
		props: {
			media,
			...(options.draftTitle === undefined ? {} : { draftTitle: options.draftTitle })
		}
	});
	return { media, youtube };
}

const dialog = () => document.querySelector('dialog');

/** What this dialog would actually announce, in the regions that announce. */
const liveText = (): string[] =>
	[...(dialog()?.querySelectorAll('[aria-live]') ?? [])]
		.map((region) => region.textContent?.trim() ?? '')
		.filter((text) => text !== '');

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
	// Between them the two subscription sources sit in the order the deployed
	// build will actually show them: Apple Music ships, Spotify is a local-only
	// experiment, so the one a stranger can use comes first.
	it('leads with YouTube and closes with the file', async () => {
		setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		const controls = [...(dialog()?.querySelectorAll('input, button.button') ?? [])];
		expect(controls.map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim())).toEqual([
			'YouTube link',
			'Use video',
			'Apple Music search',
			'Search',
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

	/**
	 * The two slowest things in this dialog, both of which used to look like
	 * nothing happening.
	 *
	 * A search is a round trip to Apple's catalogue and an attach is a script, a
	 * sign-in and a queue. `media.busy` disables controls during the second, which
	 * reads as the dialog having gone dead rather than as work being done — and
	 * says nothing about which row was pressed.
	 */
	it('shows the search is running, and gives the control back on a refusal', async () => {
		let release = (): void => {};
		const answered = new Promise<void>((resolve) => {
			release = resolve;
		});
		const { media } = setup();
		// A search that hangs until this test lets it go.
		media.searchAppleMusic = async () => {
			await answered;
			return { error: 'Apple Music could not be reached.' };
		};

		await page.getByRole('button', { name: 'Add audio' }).click();
		await page.getByLabelText('Apple Music search').fill('kygo');

		const search = dialog()?.querySelector('.media-dialog__search') as HTMLButtonElement;
		search.click();
		await vi.waitFor(() => expect(search.getAttribute('aria-busy')).toBe('true'));
		expect(search.querySelector('.loading-mark')).not.toBeNull();

		release();
		// A refusal has to hand the field back as surely as an answer does: a
		// loading mark left moving over a dead request is worse than the silence it
		// replaced.
		await vi.waitFor(() => expect(search.getAttribute('aria-busy')).toBe('false'));
		expect(search.querySelector('.loading-mark')).toBeNull();
	});

	/*
	 * A dialog headed `Add audio` opened from a control reading `Change audio
	 * source` is two names for one job, and the one the user pressed is the one
	 * they are holding in their head while they read the heading.
	 */
	it('heads the dialog with the label of the control that opened it', async () => {
		const { media } = setup();
		await page.getByRole('button', { name: 'Add audio' }).click();
		await expect.element(page.getByRole('heading', { name: 'Add audio source' })).toBeVisible();

		await media.attachFile(new File([''], 'track.mp3'));

		await expect.element(page.getByRole('heading', { name: 'Change audio source' })).toBeVisible();
	});

	/*
	 * Every outcome of a search, in the region that speaks.
	 *
	 * Only the error strings were ever in one: the result rows are an ordinary
	 * list and `No matches` was ordinary prose, so a search that answered — or
	 * answered with nothing — was silent to a screen reader and the field simply
	 * sat there. The count is `sr-only` because the rows underneath are the
	 * sighted answer to it.
	 */
	it('says what a search found, and what it did not, where it will be heard', async () => {
		const { media } = setup();
		media.searchAppleMusic = async () => ({ results: [] });

		await page.getByRole('button', { name: 'Add audio' }).click();
		await page.getByLabelText('Apple Music search').fill('kygo');
		(dialog()?.querySelector('.media-dialog__search') as HTMLButtonElement).click();

		await vi.waitFor(() => expect(liveText()).toContain('No matches on Apple Music.'));

		media.searchAppleMusic = async () => ({
			results: [
				{ songId: '1091453645', name: 'Kygo — Stole the Show', durationSeconds: 232 },
				{ songId: '1091453646', name: 'Kygo — Firestone', durationSeconds: 253 }
			]
		});
		(dialog()?.querySelector('.media-dialog__search') as HTMLButtonElement).click();

		await vi.waitFor(() => expect(liveText()).toContain('2 matches on Apple Music.'));
		// One state at a time in that region, or a count and a refusal speak over
		// each other.
		expect(liveText()).not.toContain('No matches on Apple Music.');
		expect(dialog()?.querySelectorAll('.media-dialog__result')).toHaveLength(2);
	});

	/**
	 * The press that pays for Apple's SDK is not the press that signs in.
	 *
	 * A sign-in opens a pop-up, and a browser only allows one out of an activation
	 * it can still see. Attaching used to await Apple's ~600KB script and its
	 * `configure()` round trips *first*, so on a cold load the press had been spent
	 * long before `authorize()` was reached and the window was blocked every time —
	 * which, because MusicKit never settles a blocked sign-in, hung the whole
	 * workbench rather than failing.
	 *
	 * Opening the dialog is the earlier press, and the one that offers Apple Music
	 * in the first place. Removing this call is the regression that brings the hang
	 * back on the slowest connections, where nothing else here would fail.
	 */
	it('buys Apple’s SDK with the press that opens the dialog', async () => {
		const { media } = setup();
		const prepared = vi.fn();
		media.prepareAppleMusic = prepared;

		expect(prepared).not.toHaveBeenCalled();

		await page.getByRole('button', { name: 'Add audio' }).click();

		expect(prepared).toHaveBeenCalledTimes(1);
	});

	/*
	 * The way in for somebody who has the song and not its link. It is a search
	 * the user runs on Google's own page rather than a lookup this build pays a
	 * quota for — and it must not be offered when there is nothing to search for,
	 * which is the same rule `availableRates` and `spotifyAvailable` follow.
	 */
	it('offers a prefilled YouTube search named after the draft', async () => {
		setup({ draftTitle: 'Mul — Sensommer' });
		await page.getByRole('button', { name: 'Add audio' }).click();

		const search = dialog()?.querySelector('a[href*="results?search_query"]') as HTMLAnchorElement;
		expect(search.href).toBe(
			'https://www.youtube.com/results?search_query=Mul%20%E2%80%94%20Sensommer'
		);
		expect(search.textContent?.trim()).toBe('Search YouTube for “Mul — Sensommer”');
		// A new tab, because the workbench is a document being typed into.
		expect(search.target).toBe('_blank');
	});

	it('says nothing where the draft has no name and nothing is attached', async () => {
		// The placeholder title by its own name, so renaming it cannot leave this
		// asserting against a string nothing produces any more.
		setup({ draftTitle: DEFAULT_DRAFT_TITLE });
		await page.getByRole('button', { name: 'Add audio' }).click();

		expect(dialog()?.querySelector('a[href*="results?search_query"]')).toBeNull();
	});

	/*
	 * The way out, which used to be an X at the end of the transport row and was
	 * hit by accident more often than on purpose. It lives here now, behind the
	 * same deliberate press every other answer to "where is the song?" is — and
	 * it draws only while there is something to detach, the rule every
	 * conditional answer in this dialog follows.
	 */
	it('offers detach only while something is attached, and the press detaches and closes', async () => {
		const { media } = setup();
		await page.getByRole('button', { name: 'Add audio' }).click();

		expect(page.getByRole('button', { name: 'Detach', exact: false }).elements()).toHaveLength(0);
		dialog()?.close();

		await media.attachFile(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		await page.getByRole('button', { name: 'Change audio' }).click();
		await page.getByRole('button', { name: 'Detach track.mp3' }).click();

		expect(media.player.attached).toBe(false);
		expect(media.pendingName).toBeUndefined();
		expect(dialog()?.open).toBe(false);
	});
});

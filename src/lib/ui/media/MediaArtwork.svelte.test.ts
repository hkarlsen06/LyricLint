import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { createMediaStore } from '../state/media-store.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import MediaArtwork from './MediaArtwork.svelte';

const cover = 'https://is1-ssl.mzstatic.com/image/thumb/x/640x640bb.jpg';

/** A song attached, its cover in hand, and nothing reaching Apple. */
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
				JSON.stringify({
					data: [
						{
							attributes: {
								name: 'Stole the Show',
								artistName: 'Kygo',
								artwork: { url: 'https://is1-ssl.mzstatic.com/image/thumb/x/{w}x{h}bb.jpg' }
							}
						}
					]
				}),
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

describe('MediaArtwork', () => {
	it('draws the cover and names the track over it', async () => {
		const { media } = await appleStore();
		render(MediaArtwork, { props: { media } });

		await expect.element(page.getByText('Kygo — Stole the Show')).toBeVisible();
		expect(document.querySelector('.media-artwork__cover')?.getAttribute('src')).toBe(cover);
	});

	/**
	 * The one thing this band does that the video band may not.
	 *
	 * YouTube's embed terms require their player visible and unobscured, so a
	 * collapse control there would be a control for breaking them. Apple asks for
	 * attribution — which the strip's badge carries — and nothing about a picture,
	 * so this is the one band in the panel the user can take their height back
	 * from. It opens by default, because a cover that arrived folded is a feature
	 * nobody finds.
	 */
	/**
	 * The fold is reported, not owned.
	 *
	 * Two things would forget it otherwise: this band is destroyed whenever the
	 * attached source changes, so a local flag resets on every swapped song, and a
	 * reload starts over. The controller holds it and writes it beside the current
	 * draft, which is also what puts it inside the workspace backup and inside
	 * `Delete all local data`.
	 */
	it('draws what it is told and reports the press rather than acting on it', async () => {
		const { media } = await appleStore();
		const toggles: boolean[] = [];
		render(MediaArtwork, {
			props: { media, open: true, onToggle: (open: boolean) => toggles.push(open) }
		});

		expect(document.querySelector('.media-artwork__cover')).not.toBeNull();
		await page.getByRole('button', { name: 'Hide artwork' }).click();

		expect(toggles).toEqual([false]);
		// Nothing moved on its own: the band is still open until it is told.
		expect(document.querySelector('.media-artwork__cover')).not.toBeNull();
	});

	it('folds when it is told to, keeping the bar and naming the way back', async () => {
		const { media } = await appleStore();
		render(MediaArtwork, { props: { media, open: false } });

		expect(document.querySelector('.media-artwork__cover')).toBeNull();
		// The bar that folded it stays, or there would be no way back — and the
		// control says what it now does rather than what it did.
		await expect.element(page.getByText('Kygo — Stole the Show')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Show artwork' })).toBeVisible();
	});

	/**
	 * The transport is on the picture, not in the bar, and it is the strip's own.
	 *
	 * Two copies of three buttons would be two copies of every label rule — and
	 * `Previous line` appearing on one surface while the other still said
	 * `Back 2 seconds` is the kind of drift nobody notices for months. The one
	 * difference is deliberate: the strip prints the shortcut captions because
	 * that is where the shortcut is learned, and printing the same legend twice on
	 * one screen turns a row of controls into a row of documentation.
	 */
	it('puts the transport over the cover, without the strip’s shortcut captions', async () => {
		const { media, player } = await appleStore();
		player.setCuePoints([12, 30]);
		render(MediaArtwork, { props: { media } });

		const controls = document.querySelector('.media-artwork__controls');
		expect(controls?.contains(page.getByRole('button', { name: 'Play' }).element())).toBe(true);
		// The same labels the strip uses, from the same component.
		await expect.element(page.getByRole('button', { name: 'Previous line' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Next line' })).toBeVisible();
		expect(controls?.querySelectorAll('kbd')).toHaveLength(0);
	});

	// Play leads, the way it does in every transport anyone has used — and all
	// three are player-sized rather than chrome-sized, which is the whole reason
	// they are on the picture rather than in the bar.
	it('draws the controls at player size, with play the largest', async () => {
		const { media } = await appleStore();
		render(MediaArtwork, { props: { media } });

		const glyph = (name: string) =>
			page.getByRole('button', { name }).element().querySelector('svg')!.getBoundingClientRect()
				.width;

		expect(glyph('Play')).toBeGreaterThan(glyph('Back 2 seconds'));
		expect(glyph('Back 2 seconds')).toBeGreaterThan(14);
	});

	// A cover carries nothing a screen reader can use, and the track is named on
	// the row directly above it — so an alt here would announce the same fact
	// twice rather than add one.
	it('leaves the cover out of the accessible tree', async () => {
		const { media } = await appleStore();
		render(MediaArtwork, { props: { media } });

		expect(document.querySelector('.media-artwork__cover')?.getAttribute('alt')).toBe('');
	});
});

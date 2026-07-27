import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { appleStore, spotifyStore } from '../state/media-test-stores.js';
import MediaAttribution from './MediaAttribution.svelte';

/*
 * What each mark is, tested once, because there is now one implementation of it
 * for the two surfaces that can show a song. Which surface draws it is the other
 * half, pinned in `MediaStrip.svelte.test.ts` and `MediaArtwork.svelte.test.ts`.
 *
 * Spotify's Design Guidelines require the mark, the track and artist beside it,
 * and a way back to the track — and a missing one of those is the most common
 * reason a quota-extension request is refused.
 */
describe('MediaAttribution', () => {
	it('names the track and links the mark to it on Spotify', async () => {
		const { media } = await spotifyStore();
		render(MediaAttribution, { props: { media } });

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
		render(MediaAttribution, { props: { media } });

		const link = page.getByRole('link', { name: 'Open Mul — Sensommer on Spotify' }).element();
		expect(getComputedStyle(link).color).toBe('rgb(29, 185, 84)');
		expect(link.querySelector('svg')?.getAttribute('width')).toBe('21');
	});

	// Apple wants the same thing, and gets their own supplied lockup for it.
	it('carries Apple’s badge and links back to the song', async () => {
		const { media } = await appleStore();
		render(MediaAttribution, { props: { media } });

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
		render(MediaAttribution, { props: { media } });

		const badge = document.querySelector('.media-attribution__apple img') as HTMLImageElement;
		const src = badge.getAttribute('src') ?? '';
		expect(src.startsWith('data:image/svg+xml')).toBe(true);
		// Their own gradient, still in the file: this is Apple's artwork rather
		// than something redrawn to be small enough to inline.
		expect(decodeURIComponent(src)).toContain('#FA233B');

		const box = badge.getBoundingClientRect();
		expect(box.width / box.height).toBeCloseTo(125.1 / 27.78, 3);
		// The dark-scheme twin is offered by the browser rather than by a theme
		// value, so exactly one of the two files is ever fetched.
		const source = document.querySelector('.media-attribution__apple source');
		expect(source?.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
	});
});

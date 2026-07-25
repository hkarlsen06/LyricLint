import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import '$lib/ui/styles/global.css';
import SmallScreenNotice from './SmallScreenNotice.svelte';

/**
 * The notice is always in the document and `display: none` until the coarse-
 * pointer query claims it, which no component-test viewport can satisfy. A
 * hidden subtree is not in the accessibility tree at all, so a role query would
 * find nothing here for reasons that have nothing to do with what is asserted.
 * This reveals it the way the media query does, and only that.
 */
function reveal(): void {
	const notice = document.querySelector<HTMLElement>('.small-screen-notice');
	expect(notice).toBeTruthy();
	notice!.style.display = 'grid';
}

describe('SmallScreenNotice', () => {
	it('announces the whole headline even though its first word is a lockup', async () => {
		// The brand is set in type here rather than sitting above the sentence as a
		// logo, so `Lyric[Lint]` is eleven spans and two SVG brackets where a word
		// used to be. `role="img"` on the group is what puts `LyricLint` back into
		// the heading's name — without it the heading announces as "needs a bigger
		// screen", which names no product and reads as a fragment.
		const screen = await render(SmallScreenNotice);
		reveal();

		await expect
			.element(screen.getByRole('heading', { name: 'LyricLint needs a bigger screen' }))
			.toBeInTheDocument();
	});

	it('carries the brand exactly once', async () => {
		// A lockup above a sentence that then names the product again is the same
		// word twice in four inches. The headline is the only place it appears.
		await render(SmallScreenNotice);

		expect(document.querySelectorAll('.app-wordmark')).toHaveLength(1);
		expect(document.querySelector('h1')?.contains(document.querySelector('.app-wordmark'))).toBe(
			true
		);
	});

	it('offers the one page a phone can actually read', async () => {
		// The gate used to be a dead end: it explained that the app was gone and
		// left the reader with nothing to do. `/about` is outside the `(app)` route
		// group precisely so this link lands somewhere that has not been blanked.
		const screen = await render(SmallScreenNotice);
		reveal();

		const link = screen.getByRole('link', { name: 'See what LyricLint does' });
		await expect.element(link).toBeInTheDocument();
		await expect.element(link).toHaveAttribute('href', '/about');
	});

	it('keeps the action as the surface it is, not a box on the page', async () => {
		// A full-page message is prose on the canvas. The link is allowed the
		// contrast tier because it is the single destination action here, but it
		// must not arrive wrapped in a bordered container.
		await render(SmallScreenNotice);
		reveal();

		const action = document.querySelector<HTMLElement>('.small-screen-notice__action');
		expect(action).toBeTruthy();
		const styles = getComputedStyle(action!);
		expect(styles.borderTopWidth).toBe('0px');
		expect(styles.backgroundColor).toBe('rgba(0, 0, 0, 0)');
	});
});

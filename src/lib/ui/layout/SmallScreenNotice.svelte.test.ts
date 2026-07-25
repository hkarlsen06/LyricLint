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
});

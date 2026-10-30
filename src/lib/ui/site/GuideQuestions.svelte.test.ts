import { within } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { guidanceEntries } from '#lib/guidance/entries.js';
import { entryAnchor } from '#lib/guidance/guidance.js';
import GuideQuestions from './GuideQuestions.svelte';
import { resetReferenceSearchState, setReferenceSearchState } from './reference-search.svelte.js';

const expected = [
	['How do I label song sections?', 'guidance.section-headers.bracketed-headers'],
	['How do I credit different singers?', 'guidance.section-headers.artist-identifiers'],
	['What if I cannot hear a word?', 'guidance.censored-unknown.unknown-marker'],
	['How do I write ad-libs?', 'guidance.ad-libs.include-every']
].map(([label, id]) => ({ label, entry: guidanceEntries.find((entry) => entry.id === id)! }));

beforeEach(() => {
	resetReferenceSearchState();
	history.replaceState(null, '', location.pathname);
});

describe('GuideQuestions', () => {
	it('links each question to its canonical answer, described by its exact example', async () => {
		setReferenceSearchState({ query: 'singers' });
		const view = await render(GuideQuestions);
		const section = within(view.container).getByRole('region', { name: 'Common questions' });
		const links = within(section).getAllByRole('link');
		expect(links.map((link) => link.textContent)).toEqual(expected.map(({ label }) => label));
		for (const [index, { entry }] of expected.entries()) {
			expect(links[index].getAttribute('href')).toBe(
				`/guidelines/${entry.topic}/?q=singers#${entryAnchor(entry.id)}`
			);
			const description = document.getElementById(links[index].getAttribute('aria-describedby')!);
			expect(description?.querySelector('code')?.textContent).toBe(entry.example?.correct);
		}
		expect(section.querySelector('figure, .site-meta, a[href*="genius.com"]')).toBeNull();
	});

	it.each([
		[1200, 2],
		[320, 1]
	])('lays tiles out at %ipx with the whole tile as the target', async (width, columns) => {
		await page.viewport(width, 844);
		const view = await render(GuideQuestions);
		try {
			const tiles = [...view.container.querySelectorAll('li')];
			const tops = new Set(tiles.map((tile) => Math.round(tile.getBoundingClientRect().top)));
			expect(tops.size).toBe(tiles.length / columns);
			const tile = tiles[3].getBoundingClientRect();
			const corner = document.elementFromPoint(tile.right - 4, tile.bottom - 4);
			expect(corner).toBe(tiles[3].querySelector('a'));
			expect(tile.height).toBeGreaterThanOrEqual(44);
			expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
		} finally {
			await view.unmount();
			await page.viewport(800, 600);
		}
	});
});

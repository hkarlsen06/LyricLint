import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { getSource } from '$lib/rules/data/sources.js';
import SiteSourceFold from './SiteSourceFold.svelte';

// Real registry sources rather than invented ones, so the citation link's
// accessible name is the page title a reader actually meets.
const one = [getSource('G-SECTION-HOOK')!];
const two = [getSource('G-SECTION-HOOK')!, getSource('G-LANG-HEADERS')!];

describe('SiteSourceFold', () => {
	it('draws a single citation inline, with no disclosure to press', () => {
		render(SiteSourceFold, { sources: one });

		expect(document.querySelector('a')?.textContent).toContain(one[0]!.pageTitle);
		expect(document.querySelector('button')).toBeNull();
	});

	it('folds two citations behind Sources, and the label never rewrites itself', async () => {
		render(SiteSourceFold, { sources: two });

		// Folded: the disclosure is the only thing on the line, and neither
		// citation is in the document at all — a hidden link would still be a
		// tab stop.
		const disclosure = page.getByRole('button', { name: 'Sources' });
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'false');
		expect(document.querySelectorAll('a')).toHaveLength(0);

		await disclosure.click();
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'true');
		// The label carries no state — the chevron and `aria-expanded` do — so
		// the control does not rewrite itself under the pointer that pressed it.
		expect(disclosure.element().textContent?.trim()).toBe('Sources');
		// Unfolded, each citation is the inline one exactly.
		const links = [...document.querySelectorAll('a')];
		expect(links.map((link) => link.textContent?.trim())).toEqual(
			two.map((source) => source.pageTitle)
		);

		// The unfolded list is a row of its own under the whole meta line, never a
		// run spliced into the middle of it: inside `.site-meta`'s flex row, the
		// full basis forces the wrap and the `order` sorts the list past the
		// facts that follow the disclosure in the line.
		const list = document.querySelector('.site-meta__sources')!;
		expect(getComputedStyle(list).flexBasis).toBe('100%');
		expect(getComputedStyle(list).order).toBe('1');
		expect(list.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			disclosure.element().getBoundingClientRect().bottom
		);
	});
});

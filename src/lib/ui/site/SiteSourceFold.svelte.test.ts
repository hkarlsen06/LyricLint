import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { guidanceEntries } from '$lib/guidance/entries.js';
import { getSource } from '$lib/rules/data/sources.js';
import SiteSourceFold from './SiteSourceFold.svelte';

// Real registry sources rather than invented ones, so the citation link's
// accessible name is the page title a reader actually meets.
const one = [getSource('G-SECTION-HOOK')!];
const two = [getSource('G-SECTION-HOOK')!, getSource('G-LANG-HEADERS')!];

// The guidance topic page's `Checked by` run, which folds behind this same
// control rather than growing a second one beside it. Driven off the real
// entries, so the count in the label stays a fact about the catalog: the
// longest `relatedRuleIds` run supplies the folded count, which is what keeps
// this honest as the catalog grows.
const INLINE_RULE_IDS = 3;
const longestRuleRun = guidanceEntries.reduce<readonly string[]>(
	(longest, entry) =>
		(entry.relatedRuleIds?.length ?? 0) > longest.length ? entry.relatedRuleIds! : longest,
	[]
);
const shortRuleRun = guidanceEntries
	.map((entry) => entry.relatedRuleIds ?? [])
	.find((ids) => ids.length > 1 && ids.length <= INLINE_RULE_IDS)!;

const ruleRun = (ids: readonly string[]) =>
	createRawSnippet(() => ({
		render: () => `<span>${ids.map((id) => `<a href="/rules/">${id}</a>`).join(', ')}</span>`
	}));

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
		// Unfolded, each citation is the inline one exactly — the page title it
		// leads with, plus whatever `SourceCitation` says about the press after
		// it, which is that component's own copy rather than this one's.
		const links = [...document.querySelectorAll('a')];
		expect(links).toHaveLength(two.length);
		for (const [index, link] of links.entries()) {
			expect(link.textContent).toContain(two[index]!.pageTitle);
		}

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

	// The second run this control draws. A short one is the meta line's own
	// words and must stay exactly that: a disclosure there would be a press for
	// two links the reader can already read.
	it('draws a short run inline behind its prefix, with no disclosure to press', () => {
		expect(shortRuleRun.length).toBeLessThanOrEqual(INLINE_RULE_IDS);
		render(SiteSourceFold, {
			prefix: 'Checked by',
			folded: false,
			children: ruleRun(shortRuleRun)
		});

		expect(document.body.textContent).toContain(`Checked by ${shortRuleRun.join(', ')}`);
		expect(document.querySelector('button')).toBeNull();
		expect(document.querySelector('.site-meta__sources')).toBeNull();
	});

	// A long one folds, and the label is the count: `Checked by` introduces the
	// run and stays outside the button, so the button names only what is behind
	// it — and the run it reveals is the same run the inline branch draws.
	it('folds a long run behind its own count, keeping the prefix outside the button', async () => {
		expect(longestRuleRun.length).toBeGreaterThan(INLINE_RULE_IDS);
		render(SiteSourceFold, {
			prefix: 'Checked by',
			folded: longestRuleRun.length > INLINE_RULE_IDS,
			label: `${longestRuleRun.length} rules`,
			children: ruleRun(longestRuleRun)
		});

		const disclosure = page.getByRole('button', { name: `${longestRuleRun.length} rules` });
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'false');
		expect(document.querySelectorAll('a')).toHaveLength(0);
		expect(document.body.textContent).toContain('Checked by');

		await disclosure.click();
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'true');
		expect([...document.querySelectorAll('a')].map((link) => link.textContent)).toEqual([
			...longestRuleRun
		]);

		// The same full-width row the citations unfold into, rather than a run
		// spliced into the middle of the line.
		const row = document.querySelector('.site-meta__sources')!;
		expect(getComputedStyle(row).flexBasis).toBe('100%');
		expect(getComputedStyle(row).order).toBe('1');
	});
});

import { within } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { RuleLookupTable } from '#lib/rules/lookup-tables.js';
import GuideWelcome from './GuideWelcome.svelte';
import ReferenceIndex from './ReferenceIndex.svelte';
import StandardizedSpellings from './StandardizedSpellings.svelte';
import { resetReferenceSearchState, setReferenceSearchState } from './reference-search.svelte.js';

const spellings: RuleLookupTable = {
	ruleId: 'spelling.standardized',
	description: 'Reviewed preferred forms.',
	entries: [
		{ preferred: ["I'ma"], instead: ["I'mma", 'Ima', 'Imma'], curatedMisspellings: ["im'a"] },
		{ preferred: ['okay'], instead: ['ok', 'O.K.'] },
		{ preferred: ['tryna'], instead: ['trynna'], curatedMisspellings: ['tryina'] },
		{ preferred: ['ayy'], instead: ['aye', 'ay'] },
		{ preferred: ['though'], instead: ['tho'] },
		{ preferred: ['skrrt'], instead: ['skrt'] },
		{
			preferred: ['ho'],
			instead: ['hoe'],
			appliesWhen: '`hoe` remains valid for the gardening tool or its use.'
		}
	]
};

beforeEach(() => {
	resetReferenceSearchState();
	history.replaceState(null, '', location.pathname);
});

describe('StandardizedSpellings', () => {
	it('previews reviewed forms and links to the complete list with search intact', async () => {
		setReferenceSearchState({ query: 'standard spellings' });
		const view = await render(StandardizedSpellings, { spellings });
		const section = within(view.container).getByRole('region', { name: 'Standardized spellings' });
		const table = within(section).getByRole('table', { name: 'Standardized spelling examples' });
		expect(
			within(table)
				.getAllByRole('columnheader')
				.map((cell) => cell.textContent)
		).toEqual(['Use', 'Instead of']);
		expect(
			[...table.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((row) =>
				within(row)
					.getAllByRole('cell')
					.map((cell) => cell.textContent)
			)
		).toEqual([
			["I'ma", "I'mma, Ima, Imma"],
			['okay', 'ok, O.K.'],
			['tryna', 'trynna'],
			['ayy', 'aye, ay'],
			['though', 'tho'],
			['skrrt', 'skrt']
		]);
		expect(section.textContent).not.toContain("im'a");
		expect(section.textContent).not.toContain('tryina');
		expect(section.textContent).not.toContain('gardening');
		expect(
			within(section)
				.getByRole('link', { name: 'See all standardized spellings' })
				.getAttribute('href')
		).toBe('/guidelines/spelling/?q=standard+spellings#standardized-spellings');
	});

	it.each([1200, 320])(
		'discloses its source below the list without moving it at %ipx',
		async (width) => {
			await page.viewport(width, 844);
			const view = await render(StandardizedSpellings, { spellings });
			try {
				const section = within(view.container).getByRole('region', {
					name: 'Standardized spellings'
				});
				const table = within(section).getByRole('table');
				const link = within(section).getByRole('link', { name: 'See all standardized spellings' });
				const summary = within(section).getByText('Source', { exact: true });
				const source = within(section).getByText('Genius staff guidance', { exact: true });
				const before = [table.getBoundingClientRect().y, link.getBoundingClientRect().y];
				await expect.element(source).not.toBeVisible();
				await page.getByText('Source', { exact: true }).click();
				await expect.element(source).toBeVisible();
				expect(within(section).getAllByRole('link')).toHaveLength(2);
				expect(section.querySelector('a[href*="genius.com"]')).not.toBeNull();
				expect(summary.getBoundingClientRect().top).toBeGreaterThanOrEqual(
					link.getBoundingClientRect().bottom
				);
				expect([table.getBoundingClientRect().y, link.getBoundingClientRect().y]).toEqual(before);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
			} finally {
				await view.unmount();
				await page.viewport(800, 600);
			}
		}
	);

	it.each([1200, 390, 320])(
		'shows one homepage preview before the directory at %ipx',
		async (width) => {
			await page.viewport(width, 844);
			const finder = await render(ReferenceIndex, { corpus: [], spellings });
			const welcome = await render(GuideWelcome, { spellings });
			try {
				const sections = within(document.body).getAllByRole('region', {
					name: 'Standardized spellings'
				});
				expect(sections).toHaveLength(1);
				await expect
					.element(page.getByRole('heading', { name: 'Standardized spellings' }))
					.toBeVisible();
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
				if (width <= 390) {
					const topics = within(finder.container).getByRole('heading', { name: 'Browse by topic' });
					expect(sections[0].getBoundingClientRect().bottom).toBeLessThan(
						topics.getBoundingClientRect().top
					);
				}
			} finally {
				await finder.unmount();
				await welcome.unmount();
				await page.viewport(800, 600);
			}
		}
	);
});

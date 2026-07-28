import { page, userEvent } from 'vitest/browser';
import { beforeAll, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
import { groupedRuleReferences, type RuleReferenceGroup } from '$lib/rules/reference.js';
import { countRules } from '$lib/rules/reference-search.js';
import RuleIndex from './RuleIndex.svelte';

// The real index, not a fixture: what this component has to survive is fifty-two
// rules in nineteen groups, and a hand-made pair of them would pass every
// assertion below while telling us nothing about the page that ships.
//
// `reference.ts` loads the statistical detector for itself only when there is no
// `window` — the static builder needs it synchronously, a browser fetches it on
// demand — so here it is loaded by hand before the first derivation, or
// `language.selection-mismatch` produces no diagnostic and the whole reference
// refuses to build.
let groups: RuleReferenceGroup[];
let total: number;

beforeAll(async () => {
	await loadStatisticalLanguageDetector();
	groups = groupedRuleReferences();
	total = countRules(groups);
});

function rows(): HTMLAnchorElement[] {
	return [...document.querySelectorAll<HTMLAnchorElement>('.site-run a')];
}

function titles(): string[] {
	return rows().map((row) => row.querySelector('.site-run__title')?.textContent?.trim() ?? '');
}

function headings(): string[] {
	return [...document.querySelectorAll('.rules__group')].map(
		(heading) => heading.textContent?.trim() ?? ''
	);
}

function field() {
	return page.getByRole('searchbox', { name: 'Search the formatting rules' });
}

describe('RuleIndex', () => {
	it('leads each row with the rule’s name and keeps the linter’s message under it', async () => {
		render(RuleIndex, { groups });

		expect(rows()).toHaveLength(total);
		// The specific regression: the row used to be titled with the message, so
		// the index of a reference read as a dump of somebody else's diagnostics.
		expect(titles()).toContain('Common English misspellings');
		expect(titles()).not.toContain('“definately” is a common English spelling error.');
		await expect
			.element(page.getByText('“definately” is a common English spelling error.'))
			.toBeVisible();
	});

	it('says nothing about a count while nothing is narrowing the list', () => {
		render(RuleIndex, { groups });

		// `52 of 52 rules` is a number that could not have been otherwise, and the
		// page beside this column already states how many there are.
		expect(document.querySelector('.rules__readout')).toBeNull();
	});

	it('narrows to the rule whose example carries the word the reader typed', async () => {
		render(RuleIndex, { groups });

		await field().fill('definately');

		expect(titles()).toEqual(['Common English misspellings']);
		// A group that keeps nothing is dropped, not left standing empty.
		expect(headings()).toEqual(['Spelling']);
		await expect.element(page.getByText(`1 of ${total} rules`)).toBeVisible();
	});

	it('searches the guidance and the identifier as well as the examples', async () => {
		render(RuleIndex, { groups });

		await field().fill('spelling-standardized');
		expect(titles()).toEqual(['Standardized lyric spellings']);

		await field().fill('parenthetical');
		expect(titles()).toContain('Style the whole parenthetical');
	});

	it('answers a search nothing matches with a sentence rather than an empty column', async () => {
		render(RuleIndex, { groups });

		await field().fill('qqzzxx');

		expect(rows()).toHaveLength(0);
		await expect.element(page.getByText('No rule matches this search.')).toBeVisible();
		await expect.element(page.getByText(`0 of ${total} rules`)).toBeVisible();
	});

	it('clears the field on Escape', async () => {
		render(RuleIndex, { groups });

		await field().fill('definately');
		expect(rows()).toHaveLength(1);

		await userEvent.keyboard('{Escape}');

		expect(rows()).toHaveLength(total);
	});

	it('hides a severity when its chip is unpressed, and says so on the chip', async () => {
		render(RuleIndex, { groups });

		const warnings = page.getByRole('button', { name: /^Warnings/u });
		await expect.element(warnings).toHaveAttribute('aria-pressed', 'true');
		const before = rows().length;

		await warnings.click();

		await expect.element(warnings).toHaveAttribute('aria-pressed', 'false');
		expect(rows().length).toBeLessThan(before);
		for (const row of rows()) {
			expect(row.textContent).not.toContain('Warning');
		}
	});

	it('narrows to the rules that are judgment calls', async () => {
		render(RuleIndex, { groups });

		await page.getByRole('button', { name: /^Automatic fix/u }).click();
		await page.getByRole('button', { name: /^Previewed fix/u }).click();

		expect(rows().length).toBeGreaterThan(0);
		for (const row of rows()) {
			expect(row.textContent).toContain('No automatic fix');
		}
	});

	it('counts each chip over the query alone, so pressing one says what it puts back', async () => {
		render(RuleIndex, { groups });

		const warnings = page.getByRole('button', { name: /^Warnings/u });
		const full = (await warnings.element().textContent) ?? '';

		await warnings.click();

		// The chip is off and its rows are gone, but its number has not moved:
		// read the other way it would be a press towards a zero.
		expect((await warnings.element().textContent) ?? '').toBe(full);
	});

	it('gives back the whole list from one control', async () => {
		render(RuleIndex, { groups });

		await field().fill('chorus');
		await page.getByRole('button', { name: /^Warnings/u }).click();
		expect(rows().length).toBeLessThan(total);

		await page.getByRole('button', { name: 'Clear filters' }).click();

		expect(rows()).toHaveLength(total);
		expect(document.querySelector('.rules__readout')).toBeNull();
	});

	it('marks the open rule’s row as the page', () => {
		const slug = groups[0]?.rules[0]?.slug;
		render(RuleIndex, { groups, selectedSlug: slug });

		const current = document.querySelectorAll('.site-run a[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0]?.getAttribute('href')).toContain(slug);
	});
});

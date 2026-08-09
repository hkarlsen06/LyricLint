import { page, userEvent } from 'vitest/browser';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
import { groupedRuleReferences, type RuleReferenceGroup } from '$lib/rules/reference.js';
import { countRules } from '$lib/rules/reference-search.js';
import RuleIndex from './RuleIndex.svelte';
import { ruleSearchQuery, setRuleSearchQuery } from './rule-search.svelte.js';

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

// The query outlives this component on purpose — the rule the reader opens
// marks what they searched for, and a list has nothing to hand its sibling
// column — so it also outlives a render. Every test below starts from a field
// nobody has typed in; without this, a test asserting the list is unnarrowed
// would pass or fail on whatever the test above it happened to type.
beforeEach(() => setRuleSearchQuery(''));

// The index proper. The popular block is the same rules drawn again, so counting
// it here would make every assertion about "the whole list" six rows too many.
function rows(): HTMLAnchorElement[] {
	return [...document.querySelectorAll<HTMLAnchorElement>('.site-run:not(.rules__popular) a')];
}

function popularRows(): HTMLAnchorElement[] {
	return [...document.querySelectorAll<HTMLAnchorElement>('.rules__popular a')];
}

/**
 * What each link in the list is called.
 *
 * A rule's own row carries the title inside the link; a language pack's link
 * inside a collapsed family is the language, and its title belongs to the row
 * around it. Both are links to a rule page, which is what keeps every count
 * assertion below reading against `total` — collapsing changed how the rules
 * are grouped into rows, not how many of them there are.
 */
function titles(list: HTMLAnchorElement[] = rows()): string[] {
	return list.map(
		(row) =>
			row.querySelector('.site-run__title')?.textContent?.trim() ?? row.textContent?.trim() ?? ''
	);
}

/** The title of every collapsed family row, in order. */
function families(): string[] {
	return [...document.querySelectorAll('.rules__family .site-run__title')].map(
		(title) => title.textContent?.trim() ?? ''
	);
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
	it('names each row by what the rule catches, and keeps the linter’s message under it', async () => {
		render(RuleIndex, { groups });

		expect(rows()).toHaveLength(total);
		// Two regressions in one row. The row used to be titled with the *message*,
		// so the index of a reference read as a dump of somebody else's
		// diagnostics; and the titles that replaced it restated the convention, so
		// eleven header rules were eleven paraphrases of one instruction. A title
		// names the failure now.
		expect(titles()).toContain('A section with no header');
		expect(titles()).toContain('A header written as a plain line');
		expect(titles()).not.toContain('This lyric section has no header.');
		// `.first()`, because this rule is in the popular block as well as in its
		// own family and the message is therefore drawn twice.
		await expect.element(page.getByText('This lyric section has no header.').first()).toBeVisible();
	});

	it('draws one row for a convention that exists once per language pack', () => {
		render(RuleIndex, { groups });

		// Eight of the eleven spelling rules are the same rule per language, and
		// eight near-identical rows landed on the second screen of a reader who
		// came to find out what the conventions are.
		expect(families()).toEqual(['Spellings the reviewed guides correct']);
		const packs = [...document.querySelectorAll<HTMLAnchorElement>('.rules__languages a')];
		expect(packs.map((link) => link.textContent?.trim())).toEqual([
			'English',
			'Norwegian',
			'German',
			'Spanish',
			'French',
			'Arabic',
			'Japanese',
			'Korean'
		]);
		// Every pack is still its own page, so the list is exhaustive and the
		// count under the field is still a count of rules.
		expect(rows()).toHaveLength(total);
		// The trailing slash is the URL's final form under `trailingSlash: 'always'`
		// — `resolve` alone emits the bare path, which 301s on every press and is
		// what kept Search Console from crediting rule pages as link targets.
		for (const link of packs)
			expect(link.getAttribute('href')).toMatch(/\/rules\/spelling-[a-z-]+\/$/u);
	});

	it('gives a family of one its own row back, because a heading over one link is two rows for one press', async () => {
		render(RuleIndex, { groups });

		await field().fill('desverre');

		expect(families()).toEqual([]);
		expect(titles()).toEqual(['A common Norwegian misspelling']);
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

		expect(titles()).toEqual(['A common English misspelling']);
		// A group that keeps nothing is dropped, not left standing empty.
		expect(headings()).toEqual(['Spelling']);
		await expect.element(page.getByText(`1 of ${total} rules`)).toBeVisible();
	});

	it('searches the guidance and the identifier as well as the examples', async () => {
		render(RuleIndex, { groups });

		await field().fill('spelling-standardized');
		expect(titles()).toEqual(['A spelling the guide standardizes']);

		await field().fill('parenthetical');
		expect(titles()).toContain('Formatting wrapped around the parentheses');
	});

	it('searches the prose a table-shaped rule’s page is mostly made of', async () => {
		render(RuleIndex, { groups });

		// For the eight rules that are a lookup table, the table is the page — so
		// the conditions written down its rows are most of what the reader is
		// looking at, and for a while none of it was reachable by typing the words
		// in it.
		await field().fill('cousin');
		expect(titles()).toEqual(['A spelling the guide standardizes']);
	});

	it('publishes the query, because the rule it opens marks what was searched for', async () => {
		render(RuleIndex, { groups });

		// The list and the rule are sibling columns under the section's layout,
		// with no way to hand each other anything — so the field writes to module
		// state and `RuleSearchHighlight` reads it. A local mirror here would look
		// identical on this page and mark nothing on the one it opens.
		await field().fill('cousin');
		expect(ruleSearchQuery()).toBe('cousin');

		await userEvent.keyboard('{Escape}');
		expect(ruleSearchQuery()).toBe('');
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

	// This column is its own scroll port, so it clips at its padding edge — a
	// full-width field flush against the start of it had the left side of its
	// focus ring cut off, which reads as a control whose border is broken rather
	// than as an outline that ran out of room. The lane is measured against the
	// margin that gives it back, because a padding that indented the whole column
	// by four pixels would look exactly like this fix working.
	it('reserves the focus ring’s lane at the start of the column without indenting it', async () => {
		// Past 62rem, where the columns stop stacking and this one becomes a scroll
		// port. Below it nothing clips and the lane is correctly zero, which is the
		// width a component test runs at by default.
		await page.viewport(1100, 800);
		try {
			render(RuleIndex, { groups });

			const column = document.querySelector('.rules__index')!;
			const style = getComputedStyle(column);
			const lane = Number.parseFloat(style.paddingInlineStart);

			expect(lane).toBeGreaterThan(0);
			expect(Number.parseFloat(style.marginInlineStart)).toBe(-lane);
		} finally {
			await page.viewport(414, 896);
		}
	});

	it('marks the open rule’s row as the page, in both places it is drawn', () => {
		// `section.header-missing` leads the index and is also one of the six in the
		// popular block, so it is the case that has two rows pointing at one page.
		// Both are marked: they are the same link, and a shortcut that refused the
		// marker would be the one row in this column where "you are here" is false.
		const slug = groups[0]?.rules[0]?.slug;
		render(RuleIndex, { groups, selectedSlug: slug });

		const current = [...document.querySelectorAll('.site-run a[aria-current="page"]')];
		expect(current).toHaveLength(2);
		for (const row of current) expect(row.getAttribute('href')?.endsWith(`/${slug}/`)).toBe(true);
		// And a rule that is not popular keeps exactly one.
		expect(rows().filter((row) => row.getAttribute('aria-current') === 'page')).toHaveLength(1);
	});

	it('leads with the rules a transcriber has to be told, and drops them once asked', async () => {
		render(RuleIndex, { groups });

		// The index proper is untouched — the block is the same rules drawn again,
		// as a way onto the first screen rather than as a twentieth family.
		expect(rows()).toHaveLength(total);
		expect(headings()[0]).toBe('Popular');
		expect(titles(popularRows())).toEqual([
			'A section with no header',
			'A header written as a plain line',
			'Styled vocals with no legend',
			'A spelling the guide standardizes',
			'A period at the end of a line',
			'A near-miss of the [?] marker'
		]);

		// A search is the reader saying what they are looking for, so the shortcut
		// goes: six duplicated rows over their answer are six rows of noise, and
		// they would stand in front of a readout counting a different number.
		await field().fill('definately');

		expect(popularRows()).toHaveLength(0);
		expect(headings()).toEqual(['Spelling']);
	});

	// A rule is a URL, so most arrivals are not presses on this list. The row is
	// marked the whole time; forty rows below the fold it says that to nobody.
	// Measured against a real scroll port rather than trusted: the column only
	// becomes one past 62rem, and it needs a height to overflow.
	it('brings the open rule’s row into view for a reader who arrived by its URL', async () => {
		await page.viewport(1100, 800);
		try {
			const last = groups.at(-1)?.rules.at(-1);
			const { component } = render(RuleIndex, { groups, selectedSlug: last?.slug });
			const column = document.querySelector<HTMLElement>('.rules__index')!;
			column.style.height = '400px';
			expect(column.scrollTop).toBe(0);

			await component.revealSelected();

			expect(column.scrollTop).toBeGreaterThan(0);
			// And clear of the finder pinned over the top of the column, which is the
			// half `scrollIntoView({ block: 'nearest' })` knows nothing about: it
			// would call a row underneath the field visible and move nothing.
			const row = column.querySelector<HTMLElement>('a[aria-current="page"]')!;
			const finder = column.querySelector<HTMLElement>('.rules__finder')!;
			expect(row.getBoundingClientRect().top).toBeGreaterThanOrEqual(
				finder.getBoundingClientRect().bottom - 1
			);
		} finally {
			await page.viewport(414, 896);
		}
	});

	it('leaves the list alone when the row is already in view', async () => {
		await page.viewport(1100, 800);
		try {
			// The other half of "pressing a row may not move the list the row is in":
			// the row a reader pressed is by definition one they can see.
			const first = groups[0]?.rules[0];
			const { component } = render(RuleIndex, { groups, selectedSlug: first?.slug });
			const column = document.querySelector<HTMLElement>('.rules__index')!;
			column.style.height = '400px';
			column.scrollTop = 0;

			await component.revealSelected();

			expect(column.scrollTop).toBe(0);
		} finally {
			await page.viewport(414, 896);
		}
	});
});

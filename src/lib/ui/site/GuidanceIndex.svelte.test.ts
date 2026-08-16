import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { countGuidanceLookups, type GuidanceTopicSection } from '$lib/guidance/guidance-search.js';
import { entryAnchor, guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import { setReadingAnchor } from './guidance-reading.svelte.js';
import { setGuidanceSearchQuery } from './guidance-search.svelte.js';
import GuidanceIndex from './GuidanceIndex.svelte';

// The real catalog plus a fixed pair of linter lookups: the entries are what
// ships, and the two rules pin the half of every assertion that is about the
// list carrying both kinds of row without depending on which rules a topic's
// families hold this release.
const sections: GuidanceTopicSection[] = guidanceTopics().map(({ topic, entries }) => ({
	topic,
	entries,
	landmarks: guidanceTopicLandmarks[topic] ?? [],
	linterRules: [
		{
			id: 'punctuation.question',
			title: 'A question mark the line needs',
			message: 'This clearly interrogative line may need a question mark.',
			slug: 'punctuation-question',
			severity: 'suggestion',
			fixability: 'none'
		},
		{
			id: 'quotes.typewriter',
			title: 'Typewriter quotes',
			message: 'Use a straight apostrophe.',
			slug: 'quotes-typewriter',
			severity: 'warning',
			fixability: 'safe'
		}
	]
}));

const total = countGuidanceLookups(sections);
const firstEntry = sections[0]!.entries[0]!;

function rows(): HTMLAnchorElement[] {
	return [...document.querySelectorAll<HTMLAnchorElement>('.site-run a')];
}

function field() {
	return page.getByRole('searchbox', { name: 'Search the transcription guidelines' });
}

// The selection's fragment half is read off the real location, so every test
// starts from a document with no hash — without this, a test asserting nothing
// is current would pass or fail on whatever the test above it navigated to.
// The query is module state for the topic page's highlighting, so it has to be
// reset the same way — `RuleIndex.svelte.test.ts` makes the same two resets.
beforeEach(() => {
	history.replaceState(null, '', location.pathname);
	setGuidanceSearchQuery('');
	// The reading position is module state the topic page writes, and the topic
	// page is not mounted here — so without this reset a test asserting on the
	// fragment would pass or fail on whatever the test above it was reading.
	setReadingAnchor('');
});

describe('GuidanceIndex', () => {
	it('lists every convention — guidance entries and linter rules — under topic headings', () => {
		render(GuidanceIndex, { sections });

		expect(rows()).toHaveLength(total);
		const titles = rows().map((row) => row.querySelector('.site-run__title')?.textContent?.trim());
		expect(titles[0]).toBe('The standardized spellings');
		expect(titles).toContain(firstEntry.title);
		expect(titles).toContain('A question mark the line needs');
		// A guidance row opens its entry's fragment on the topic page; a linter row
		// leaves for the rule reference. The two kinds are one run, told apart by
		// where they go.
		const hrefs = rows().map((row) => row.getAttribute('href') ?? '');
		expect(hrefs.some((href) => href.endsWith(`#${entryAnchor(firstEntry.id)}`))).toBe(true);
		expect(hrefs.some((href) => href.endsWith('/rules/punctuation-question/'))).toBe(true);
	});

	it('narrows both kinds with one query, and the readout only draws while it narrows', async () => {
		render(GuidanceIndex, { sections });

		// `N of N lookups` under a field nobody has typed in is a count that could
		// not have been otherwise.
		expect(document.querySelector('.site-finder__readout')).toBeNull();

		await field().fill('question');
		const titles = rows().map((row) => row.querySelector('.site-run__title')?.textContent?.trim());
		expect(titles).toContain('Questions always end with a question mark');
		expect(titles).toContain('A question mark the line needs');
		expect(titles).not.toContain('Typewriter quotes');
		await expect.element(page.getByRole('status')).toBeVisible();

		await page.getByRole('button', { name: 'Clear search' }).click();
		expect(rows()).toHaveLength(total);
		expect(document.querySelector('.site-finder__readout')).toBeNull();
	});

	it('says so when nothing matches, as prose rather than a bare empty column', async () => {
		render(GuidanceIndex, { sections });

		await field().fill('zzz-no-such-convention');
		expect(rows()).toHaveLength(0);
		expect(document.querySelector('.site-index__empty')?.textContent).toContain('No convention');
	});

	it('draws a linter row as one line, and a guidance row as its statement', () => {
		// A linter row points out of the section, so it is a name, the severity
		// that colors it, and the leaving mark — the wording, the id and the fix
		// kind are on the rule's own page, one press away. A guidance row is not
		// a pointer: its statement is the convention itself, so it keeps it.
		render(GuidanceIndex, { sections });

		const rule = rows().find((candidate) =>
			candidate.textContent?.includes('A question mark the line needs')
		);
		expect(rule?.textContent).not.toContain('punctuation.question');
		expect(rule?.textContent).not.toContain('No automatic fix');
		expect(rule?.querySelector('.site-run__message')).toBeNull();
		// The severity is on it as a glyph, with the word left in the accessible
		// tree rather than on screen.
		expect(rule?.querySelector('.severity--suggestion')).not.toBeNull();
		expect(rule?.querySelector('.severity .sr-only')?.textContent).toBe('Suggestion');

		const entry = rows().find((candidate) => candidate.textContent?.includes(firstEntry.title));
		expect(entry?.querySelector('.site-run__message')?.textContent).toBe(firstEntry.statement);
	});

	it('opens a linter rule in a tab, and an entry in place', () => {
		// A rule is a lookup beside the topic being read, so taking it in place
		// costs the reader the place they were in — and the way back on this
		// surface returns to the catalog's welcome view, not to their entry. The
		// mark says the row leaves and the sr-only note says it opens a tab,
		// which the mark cannot: it is `aria-hidden`, and a new tab is a fact
		// about the press rather than about the destination.
		render(GuidanceIndex, { sections });

		const rule = rows().find((candidate) =>
			candidate.textContent?.includes('A question mark the line needs')
		);
		expect(rule?.target).toBe('_blank');
		expect(rule?.rel).toBe('noopener noreferrer');
		expect(rule?.textContent).toContain('opens in a new tab');

		// An entry row stays inside the section: it is a fragment on a page of
		// this catalog, and a tab per convention would be a tab per press.
		const entry = rows().find((candidate) => candidate.textContent?.includes(firstEntry.title));
		expect(entry?.target).toBe('');
	});

	it('marks the entry the fragment names as the page, and only that one', async () => {
		// A guideline is a fragment on its topic's page, so the current row is the
		// topic *and* the hash together — the hash alone names an entry on a page
		// the reader is not on.
		history.replaceState(null, '', `#${entryAnchor(firstEntry.id)}`);
		render(GuidanceIndex, { sections, selectedTopic: firstEntry.topic });
		await Promise.resolve();

		const current = document.querySelectorAll('a[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0]?.textContent).toContain(firstEntry.title);
	});

	it('marks nothing while the fragment names no entry', async () => {
		render(GuidanceIndex, { sections, selectedTopic: firstEntry.topic });
		await Promise.resolve();

		expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(0);
	});

	// The hash is where the reader was *sent*, which stops being true the moment
	// they scroll off that entry. A topic page is a column of conventions, so
	// that is most of a visit.
	it('marks the entry the page says is being read over the fragment it opened at', async () => {
		const { entries } = sections.find((section) => section.entries.length > 1)!;
		history.replaceState(null, '', `#${entryAnchor(entries[0]!.id)}`);
		render(GuidanceIndex, { sections, selectedTopic: entries[1]!.topic });
		await Promise.resolve();

		setReadingAnchor(entryAnchor(entries[1]!.id));
		await expect
			.poll(() => document.querySelector('a[aria-current="page"]')?.textContent)
			.toContain(entries[1]!.title);
		expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
	});

	// And the list travels with it: the mark answers "where am I" only for the
	// rows on screen, and a topic runs to more of them than the column holds.
	// Measured against a real scroll port rather than trusted — the column only
	// becomes one past 62rem, and it needs a height to overflow.
	it('brings the row it is following back into the column when it scrolls out', async () => {
		await page.viewport(1100, 800);
		try {
			const longest = [...sections].sort((a, b) => b.entries.length - a.entries.length)[0]!;
			render(GuidanceIndex, { sections, selectedTopic: longest.topic });
			const column = document.querySelector<HTMLElement>('.site-split__index')!;
			column.style.height = '400px';
			expect(column.scrollTop).toBe(0);

			setReadingAnchor(entryAnchor(longest.entries.at(-1)!.id));

			// The follow is smooth, so the settled position is what is asserted —
			// polling the first pixel of movement would measure the animation
			// rather than where it was going.
			const row = () => column.querySelector<HTMLElement>('a[aria-current="page"]')!;
			await expect
				.poll(() => row().getBoundingClientRect().bottom, { timeout: 2000 })
				.toBeLessThanOrEqual(column.getBoundingClientRect().bottom + 1);

			expect(column.scrollTop).toBeGreaterThan(0);
			// And clear of the finder pinned over the top of the column, which is
			// the half `scrollIntoView({ block: 'nearest' })` knows nothing about.
			const finder = column.querySelector<HTMLElement>('.site-finder')!;
			expect(row().getBoundingClientRect().top).toBeGreaterThanOrEqual(
				finder.getBoundingClientRect().bottom - 1
			);
		} finally {
			await page.viewport(414, 896);
		}
	});

	// The other half of "pressing a row may not move the list the row is in":
	// the row a reader pressed is one they can see, so the follow finds it
	// comfortable and returns rather than hauling the column to the top.
	it('leaves the list alone while the row it is following is already in view', async () => {
		await page.viewport(1100, 800);
		try {
			const longest = [...sections].sort((a, b) => b.entries.length - a.entries.length)[0]!;
			render(GuidanceIndex, { sections, selectedTopic: longest.topic });
			const column = document.querySelector<HTMLElement>('.site-split__index')!;
			column.style.height = '400px';
			column.scrollTop = 0;

			setReadingAnchor(entryAnchor(longest.entries[0]!.id));
			await expect.poll(() => document.querySelector('a[aria-current="page"]')).not.toBeNull();

			expect(column.scrollTop).toBe(0);
		} finally {
			await page.viewport(414, 896);
		}
	});
});

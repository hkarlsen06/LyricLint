import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { countGuidanceLookups, type GuidanceTopicSection } from '$lib/guidance/guidance-search.js';
import { entryAnchor } from '$lib/guidance/guidance.js';
import { setGuidanceSearchQuery } from './guidance-search.svelte.js';
import GuidanceIndex from './GuidanceIndex.svelte';

// The real catalog plus a fixed pair of linter lookups: the entries are what
// ships, and the two rules pin the half of every assertion that is about the
// list carrying both kinds of row without depending on which rules a topic's
// families hold this release.
const sections: GuidanceTopicSection[] = guidanceTopics().map(({ topic, entries }) => ({
	topic,
	entries,
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
});

describe('GuidanceIndex', () => {
	it('lists every convention — guidance entries and linter rules — under topic headings', () => {
		render(GuidanceIndex, { sections });

		expect(rows()).toHaveLength(total);
		const titles = rows().map((row) => row.querySelector('.site-run__title')?.textContent?.trim());
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

	it('dresses a linter row in the rule index’s own meta', () => {
		// The same rows in another shape — a row stripped down to its id here
		// would read as a different kind of thing than at /rules/, and the drift
		// arrives one omitted field at a time.
		render(GuidanceIndex, { sections });

		const row = rows().find((candidate) =>
			candidate.textContent?.includes('A question mark the line needs')
		);
		expect(row?.textContent).toContain('punctuation.question');
		expect(row?.textContent).toContain('Suggestion');
		expect(row?.textContent).toContain('No automatic fix');
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
});

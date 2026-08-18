import { page } from 'vitest/browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { countGuidanceLookups, type GuidanceTopicSection } from '$lib/guidance/guidance-search.js';
import { entryAnchor, guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import { setReadingAnchor } from './guidance-reading.svelte.js';
import { setGuidanceSearchQuery } from './guidance-search.svelte.js';
import GuidanceIndex from './GuidanceIndex.svelte';

// The real catalog, with rule terms as the layout load delivers them:
// synthetic strings that appear in no entry's own text, so an assertion about
// a hit through them is unambiguous. The index draws no rule rows — the terms
// are only searchable facts on the entries that name the rules.
const sections: GuidanceTopicSection[] = guidanceTopics().map(({ topic, entries }) => ({
	topic,
	entries,
	landmarks: guidanceTopicLandmarks[topic] ?? [],
	ruleTerms: {
		'punctuation.question': 'A question mark the line needs',
		'quotes.typewriter': 'Typewriter quotes\nwoah whoa'
	}
}));

const total = countGuidanceLookups(sections);
const firstEntry = sections[0]!.entries[0]!;

function rows(): HTMLAnchorElement[] {
	return [...document.querySelectorAll<HTMLAnchorElement>('.site-run a')];
}

function field() {
	return page.getByRole('searchbox', { name: 'Search the transcription guidelines' });
}

/**
 * The visible count, drawn only while the query narrows the list, and the live
 * region beside it, which is always mounted. Both carry the same sentence while
 * something is narrowing, so each is read off its own element.
 */
function readout(): string {
	return document.querySelector('.site-finder__readout span')?.textContent?.trim() ?? '';
}

function status(): HTMLElement | null {
	return document.querySelector<HTMLElement>('.site-finder [role="status"]');
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
	it('lists every convention under topic headings, and no linter rows', () => {
		render(GuidanceIndex, { sections });

		expect(rows()).toHaveLength(total);
		const titles = rows().map((row) => row.querySelector('.site-run__title')?.textContent?.trim());
		expect(titles[0]).toBe('The standardized spellings');
		expect(titles).toContain(firstEntry.title);
		// Every row is a convention opening its own fragment on a topic page. The
		// index used to close each topic with rows pointing out to the rule
		// reference; those retired when every rule became reachable through an
		// entry's "Checked by" line, so a row leaving the section again is the
		// regression.
		const hrefs = rows().map((row) => row.getAttribute('href') ?? '');
		expect(hrefs.some((href) => href.endsWith(`#${entryAnchor(firstEntry.id)}`))).toBe(true);
		expect(hrefs.some((href) => href.includes('/rules/'))).toBe(false);
		// A row is the title alone. The statement is the exact sentence the press
		// lands on, so previewing it here was four fifths of the list's height
		// spent repeating the destination — the rule index keeps its second line
		// because a diagnostic message is an independent fact, and re-adding one
		// here is the regression.
		const entry = rows().find((candidate) => candidate.textContent?.includes(firstEntry.title));
		expect(entry?.querySelector('.site-run__message')).toBeNull();
		expect(entry?.textContent).not.toContain(firstEntry.statement);
		expect(entry?.target).toBe('');
	});

	// Every row under a topic heading is a fragment on one page, so the heading
	// itself is the way to read that page whole — and the press is advertised
	// at rest by the chevron, because a link only discoverable by hovering a
	// heading is one a finger never finds.
	it('makes each topic heading the way into the whole topic page', () => {
		render(GuidanceIndex, { sections });

		const headings = [...document.querySelectorAll<HTMLAnchorElement>('.site-index__group a')];
		expect(headings).toHaveLength(sections.length);
		for (const [index, section] of sections.entries()) {
			const href = headings[index]?.getAttribute('href') ?? '';
			// No fragment: the press means "from the top", not one convention.
			expect(href.endsWith(`/guidelines/${section.topic}/`)).toBe(true);
			expect(href).not.toContain('#');
		}
		expect(headings[0]?.querySelector('.site-index__group-mark')).not.toBeNull();
	});

	it('narrows with one query, and the readout only draws while it narrows', async () => {
		render(GuidanceIndex, { sections });

		// `N of N lookups` under a field nobody has typed in is a count that could
		// not have been otherwise.
		expect(document.querySelector('.site-finder__readout')).toBeNull();

		await field().fill('question');
		const titles = rows().map((row) => row.querySelector('.site-run__title')?.textContent?.trim());
		expect(titles).toContain('Questions always end with a question mark');
		expect(readout()).toBe(`${rows().length} of ${total} conventions`);

		// A symptom query answers through the named rules' terms — the searchable
		// half the retired rule rows left behind, folded into the entries.
		await field().fill('whoa');
		const bySymptom = rows().map((row) =>
			row.querySelector('.site-run__title')?.textContent?.trim()
		);
		expect(bySymptom).toContain('Quotes mark titles, speech, and mentions');

		await page.getByRole('button', { name: 'Clear search' }).click();
		expect(rows()).toHaveLength(total);
		expect(document.querySelector('.site-finder__readout')).toBeNull();
	});

	// The visible readout comes and goes with the query, so it arrives already
	// carrying its text — an addition to the accessibility tree rather than a
	// change inside a live region, which most screen readers do not announce. The
	// region is mounted empty for exactly that reason, and says the whole list is
	// back rather than emptying, because emptying announces nothing at all.
	it('speaks each narrowing, and says the whole list is back rather than falling silent', async () => {
		render(GuidanceIndex, { sections });

		expect(status()?.textContent).toBe('');

		await field().fill('question');
		await expect.poll(() => status()?.textContent).toBe(`${rows().length} of ${total} conventions`);

		await page.getByRole('button', { name: 'Clear search' }).click();
		await expect.poll(() => status()?.textContent).toBe(`All ${total} conventions`);
	});

	// A landmark's fragment and the comparison that marks it current are one
	// derivation, not two that happen to agree: `entryCurrent` reads
	// `entryAnchor`, so a landmark id that ever carried a dot would link to one
	// fragment and be marked against another. The single landmark there is today
	// has no dot in it, which is what made the two look interchangeable.
	it('links a landmark at the anchor its own current-state is compared against', () => {
		const landmarked = sections.find((section) => (section.landmarks ?? []).length > 0)!;
		const landmark = landmarked.landmarks![0]!;
		render(GuidanceIndex, { sections });

		const row = rows().find(
			(candidate) =>
				candidate.querySelector('.site-run__title')?.textContent?.trim() === landmark.title
		)!;
		const href = row.getAttribute('href') ?? '';

		expect(href).toContain(`/${landmarked.topic}/#`);
		expect(href.slice(href.indexOf('#') + 1)).toBe(entryAnchor(landmark.id));
	});

	it('says so when nothing matches, as prose rather than a bare empty column', async () => {
		render(GuidanceIndex, { sections });

		await field().fill('zzz-no-such-convention');
		expect(rows()).toHaveLength(0);
		expect(document.querySelector('.site-index__empty')?.textContent).toContain('No convention');
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

	// A fragment is somebody else's string, and a percent sign that opens no
	// escape is a `URIError` rather than an anchor — `#%C3` is what a chat app
	// leaves after clipping a shared link to a non-ASCII heading. Thrown from
	// the effect that reads it, that takes the whole column down, on exactly the
	// arrival a deep link exists for. It marks no row, which is the same answer
	// as no fragment at all.
	it('survives a fragment that is not valid percent-encoding', async () => {
		history.replaceState(null, '', '#%C3');
		render(GuidanceIndex, { sections, selectedTopic: firstEntry.topic });
		await Promise.resolve();

		expect(rows()).toHaveLength(total);
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

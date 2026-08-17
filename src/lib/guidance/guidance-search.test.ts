import { describe, expect, it } from 'vitest';
import { getSource } from '$lib/rules/data/sources.js';
import { guidanceEntries, guidanceTopics } from './entries.js';
import { guidanceTopicLandmarks } from './guidance.js';
import {
	countGuidanceLookups,
	filterGuidanceSections,
	type GuidanceTopicSection
} from './guidance-search.js';

// The rule terms ride the section exactly as the layout load delivers them:
// synthetic strings standing in for a rule's reader-facing title and, for a
// table-shaped rule, its lookup terms. What matters is only that they appear
// in no other haystack string, so a hit through them is unambiguous.
const ruleTerms: Record<string, string> = {
	'punctuation.question': 'A question mark the line needs',
	'quotes.typewriter': 'Typewriter quotes\nwoah whoa',
	'spelling.standardized': 'Standardized lyric spellings\nimma tryna'
};

const sections: GuidanceTopicSection[] = guidanceTopics().map(({ topic, entries }) => ({
	topic,
	entries,
	landmarks: guidanceTopicLandmarks[topic] ?? [],
	ruleTerms
}));

describe('guidance search', () => {
	it('returns everything for an empty query', () => {
		expect(filterGuidanceSections(sections, '')).toEqual(sections);
		// Entries and landmarks are the conventions; the readout counts nothing
		// else — the linter rows the index used to draw are gone, and counting
		// rules as conventions was the double-count that went with them.
		expect(countGuidanceLookups(sections)).toBe(
			guidanceEntries.length +
				sections.reduce((sum, section) => sum + (section.landmarks?.length ?? 0), 0)
		);
	});

	it('finds the standardized-spellings landmark by name', () => {
		const filtered = filterGuidanceSections(sections, 'standardized spellings');
		expect(filtered.flatMap((section) => section.landmarks ?? []).map(({ id }) => id)).toEqual([
			'standardized-spellings'
		]);
	});

	it('matches an entry by its statement and note, not just its title', () => {
		// "delivery" appears only in statements/notes, never in a title.
		const filtered = filterGuidanceSections(sections, 'delivery');
		expect(filtered.flatMap((section) => section.entries).length).toBeGreaterThan(0);
	});

	it('requires every token to match, and folds through the /rules/ fold', () => {
		expect(filterGuidanceSections(sections, 'question nowhere-word')).toEqual([]);
		const folded = filterGuidanceSections(sections, 'BRAND NAME');
		expect(folded.flatMap((section) => section.entries).map((entry) => entry.id)).toContain(
			'guidance.punctuation.brand-name-marks'
		);
	});

	it('drops a topic that keeps nothing rather than leaving a bare heading', () => {
		expect(filterGuidanceSections(sections, 'zzz-no-such-lookup')).toEqual([]);
	});

	// The topic's own name — the heading over the rows, and the most obvious
	// query a newcomer types. Measured before it was in the haystack: it
	// dropped every guidance entry under the heading that said it.
	it('keeps everything under a topic whose own title is the query', () => {
		const filtered = filterGuidanceSections(sections, 'punctuation');
		const punctuation = filtered.find((section) => section.topic === 'punctuation');
		expect(punctuation?.entries).toHaveLength(
			sections.find((section) => section.topic === 'punctuation')!.entries.length
		);
	});

	// A symptom query still answers here now that the index draws no rule
	// rows: an entry's haystack folds in the search terms of the rules it
	// names — the rule's failure-naming title, and a table-shaped rule's own
	// forms. `whoa` reaches the quotation entry through `quotes.typewriter`'s
	// terms, exactly as it reaches the rule at /rules/.
	it("matches an entry through its related rules' titles and lookup terms", () => {
		const throughTitle = filterGuidanceSections(sections, 'a question mark the line needs')
			.flatMap((section) => section.entries)
			.map((entry) => entry.id);
		expect(throughTitle).toContain('guidance.punctuation.unmarked-question');

		const throughTerms = filterGuidanceSections(sections, 'whoa')
			.flatMap((section) => section.entries)
			.map((entry) => entry.id);
		expect(throughTerms).toContain('guidance.punctuation.quotation-usage');
		expect(throughTerms).not.toContain('guidance.punctuation.unmarked-question');
	});

	// The landmark answers for its rules the same way: the standardized table
	// is `spelling.standardized`'s data, so the table's own forms have to land
	// on the landmark that draws it.
	it("matches a landmark through its related rules' lookup terms", () => {
		const filtered = filterGuidanceSections(sections, 'tryna');
		expect(filtered.flatMap((section) => section.landmarks ?? []).map(({ id }) => id)).toContain(
			'standardized-spellings'
		);
	});

	// What is searchable is what the page says — and the page says the citation
	// and the `Checked by` rule ids, so both have to answer a search.
	// The rule reference learned this the long way about its own citations.
	it('matches an entry by its citation title and its related rule ids', () => {
		const first = guidanceEntries[0]!;
		const sourceTitle = getSource(first.sourceIds[0]!)!.pageTitle;
		expect(
			filterGuidanceSections(sections, sourceTitle)
				.flatMap((section) => section.entries)
				.map((entry) => entry.id)
		).toContain(first.id);
		expect(
			filterGuidanceSections(sections, 'line-ending')
				.flatMap((section) => section.entries)
				.map((entry) => entry.id)
		).toContain('guidance.punctuation.unmarked-question');
	});
});

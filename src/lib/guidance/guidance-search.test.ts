import { describe, expect, it } from 'vitest';
import { getSource } from '$lib/rules/data/sources.js';
import { guidanceEntries, guidanceTopics } from './entries.js';
import { guidanceTopicLandmarks } from './guidance.js';
import {
	countGuidanceLookups,
	filterGuidanceSections,
	type GuidanceTopicSection
} from './guidance-search.js';

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
			fixability: 'safe',
			// Synthetic terms standing in for a table-shaped rule's own — what
			// matters is only that they appear in no other haystack string.
			lookupTerms: 'woah whoa'
		}
	]
}));

describe('guidance search', () => {
	it('returns everything for an empty query', () => {
		expect(filterGuidanceSections(sections, '')).toEqual(sections);
		// The fixture attaches its two linter rows to every topic, so the total
		// follows the topic count rather than assuming one. Topic landmarks are
		// first-class lookups too: the standardized table must count in the field
		// whose list it appears in.
		expect(countGuidanceLookups(sections)).toBe(
			guidanceEntries.length +
				sections.length * 2 +
				sections.reduce((sum, section) => sum + (section.landmarks?.length ?? 0), 0)
		);
	});

	it('finds the standardized-spellings landmark by name', () => {
		const filtered = filterGuidanceSections(sections, 'standardized spellings');
		expect(filtered.flatMap((section) => section.landmarks ?? []).map(({ id }) => id)).toEqual([
			'standardized-spellings'
		]);
	});

	it('narrows entries and linter rules with one query', () => {
		const filtered = filterGuidanceSections(sections, 'question');
		expect(countGuidanceLookups(filtered)).toBeGreaterThan(0);
		const titles = filtered.flatMap((section) => [
			...section.entries.map((entry) => entry.title),
			...section.linterRules.map((rule) => rule.title)
		]);
		expect(titles).toContain('Questions always end with a question mark');
		expect(titles).toContain('A question mark the line needs');
		expect(titles).not.toContain('Typewriter quotes');
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
	// query a newcomer types. Measured before it was in the haystack: it kept
	// only the linter rows whose ids happened to carry the word and dropped
	// every guidance entry under the heading that said it.
	it('keeps everything under a topic whose own title is the query', () => {
		const filtered = filterGuidanceSections(sections, 'punctuation');
		const punctuation = filtered.find((section) => section.topic === 'punctuation');
		expect(punctuation?.entries).toHaveLength(
			sections.find((section) => section.topic === 'punctuation')!.entries.length
		);
		// The rules under the heading are covered by it too — `quotes.typewriter`
		// carries the word in neither its id nor its title.
		expect(punctuation?.linterRules.map((rule) => rule.title)).toContain('Typewriter quotes');
	});

	// A table-shaped rule's row answers for the forms it checks, exactly as it
	// does at /rules/ — `woah` has to find the standardized spellings here too,
	// because the spelling topic page draws that table.
	it('matches a linter row by its lookup terms', () => {
		const filtered = filterGuidanceSections(sections, 'whoa');
		const titles = filtered.flatMap((section) => section.linterRules.map((rule) => rule.title));
		expect(titles).toContain('Typewriter quotes');
		expect(titles).not.toContain('A question mark the line needs');
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

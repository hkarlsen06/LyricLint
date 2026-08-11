import { describe, expect, it } from 'vitest';
import { guidanceEntries, guidanceTopics } from './entries.js';
import {
	countGuidanceLookups,
	filterGuidanceSections,
	type GuidanceTopicSection
} from './guidance-search.js';

const sections: GuidanceTopicSection[] = guidanceTopics().map(({ topic, entries }) => ({
	topic,
	entries,
	linterRules: [
		{
			id: 'punctuation.question',
			title: 'A question mark the line needs',
			message: 'This clearly interrogative line may need a question mark.',
			slug: 'punctuation-question'
		},
		{
			id: 'quotes.typewriter',
			title: 'Typewriter quotes',
			message: 'Use a straight apostrophe.',
			slug: 'quotes-typewriter'
		}
	]
}));

describe('guidance search', () => {
	it('returns everything for an empty query', () => {
		expect(filterGuidanceSections(sections, '')).toEqual(sections);
		expect(countGuidanceLookups(sections)).toBe(guidanceEntries.length + 2);
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
});

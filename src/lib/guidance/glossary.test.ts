import { describe, expect, it } from 'vitest';
import { glossarySegments } from './glossary.js';

describe('guide glossary matching', () => {
	it('preserves exact text and handles casing, plurals and possessives', () => {
		const text = "The Linter's annotations explain elisions; AD-LIBS stay (Here).";
		const segments = glossarySegments(text);
		expect(segments.map((segment) => segment.text).join('')).toBe(text);
		expect(
			segments.filter((segment) => segment.kind === 'term').map((segment) => segment.text)
		).toEqual(['Linter', 'annotations', 'elisions', 'AD-LIBS']);
	});

	it('matches complete words and phrases without splitting longer or non-English words', () => {
		const segments = glossarySegments('splinter différemment linteré linter_name authority tiers');
		expect(
			segments.filter((segment) => segment.kind === 'term').map((segment) => segment.text)
		).toEqual(['authority tiers']);
	});
});

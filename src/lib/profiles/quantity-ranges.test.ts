import { describe, expect, it } from 'vitest';
import {
	englishQuantityPattern,
	isCompleteEnglishQuantitySelection,
	needsEnglishQuantityReview
} from './quantity-ranges.js';

function candidates(text: string) {
	return [...text.matchAll(englishQuantityPattern)]
		.filter((match) => needsEnglishQuantityReview(match[0]))
		.map((match) => match[0]);
}

describe('English quantity lexical boundaries', () => {
	it.each([
		'Twenty-one',
		'twenty one',
		'twenty\u2011one',
		'one hundred',
		'a hundred and one',
		'one hundred and twenty-one',
		'a thousand and five',
		'one thousand two hundred and thirty-four'
	])('groups the complete words in %s without assigning a value', (words) => {
		expect(candidates(`We counted ${words} stars`)).toEqual([words]);
	});
	it('keeps separate quantities, lines, markup and ordinary small words separate', () => {
		expect(candidates('twenty and thirty stars')).toEqual(['twenty', 'thirty']);
		expect(candidates('twenty\none stars')).toEqual(['twenty']);
		expect(candidates('twenty <i>one</i> stars')).toEqual(['twenty']);
		expect(candidates('one two three ten stars')).toEqual([]);
		expect(candidates('twentyfold anti-twenty-one twenty-one-year-old')).toEqual([]);
	});
	it('rejects a phrase component and word fragment while preserving explicit custom wording', () => {
		const text = 'Twenty-one stars';
		for (const range of [
			{ from: 0, to: 6 },
			{ from: 7, to: 10 },
			{ from: 0, to: 3 }
		])
			expect(isCompleteEnglishQuantitySelection(text, range)).toBe(false);
		expect(isCompleteEnglishQuantitySelection(text, { from: 0, to: 10 })).toBe(true);
		expect(isCompleteEnglishQuantitySelection('dozen stars', { from: 0, to: 5 })).toBe(true);
		expect(isCompleteEnglishQuantitySelection('two dozen stars', { from: 0, to: 9 })).toBe(true);
		expect(isCompleteEnglishQuantitySelection('dozen stars', { from: 0, to: 3 })).toBe(false);
	});
});

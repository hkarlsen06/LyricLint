import { describe, expect, it } from 'vitest';
import { numbersSpellOutRule as rule } from './numbers-spell-out.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('numbers.spell-out', () => {
	it('offers a preview spelling for every reviewed small number', () => {
		const text = '[Verse]\n0 1 2 3 4 5 6 7 8 9 10';
		const found = checkRule(rule, text);

		expect(fixInserts(found)).toEqual([
			'zero',
			'one',
			'two',
			'three',
			'four',
			'five',
			'six',
			'seven',
			'eight',
			'nine',
			'ten'
		]);
		expect(found.every((finding) => finding.fixes?.[0]?.kind === 'preview')).toBe(true);
		expect(found.every((finding) => finding.fixes?.[0]?.edit.baseRevision === testRevision)).toBe(
			true
		);
	});

	it('stops above the reviewed range', () => {
		expect(checkRule(rule, '[Verse]\nI need 11 reasons')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nBorn in 2026')).toEqual([]);
	});

	it('runs for regional English tags only', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nI need 5 reasons'))).toEqual(['five']);
		for (const language of ['en-US', 'en-GB']) {
			expect(fixInserts(checkRule(rule, '[Verse]\nI need 5 reasons', { language }))).toEqual([
				'five'
			]);
		}
		expect(checkRule(rule, '[Verse]\nI need 5 reasons', { language: 'no' })).toEqual([]);
	});

	it('leaves the documented time, money, percentage, and reference contexts alone', () => {
		for (const line of [
			'Meet at 5:30 with $5',
			'I paid €5 and £5',
			'Room #5',
			'5% sure',
			'At 5 a.m.',
			'At 5 A.M.',
			'5/4 time'
		]) {
			expect(checkRule(rule, `[Verse]\n${line}`), line).toEqual([]);
		}
	});

	it('exempts both digits of a compound number, not only the trailing one', () => {
		expect(checkRule(rule, '[Verse]\nOn 5.5 acres')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n2-5 people')).toEqual([]);
		// A hyphen that is not followed by a digit still reads as a word.
		expect(fixInserts(checkRule(rule, '[Verse]\nA 5-star night'))).toEqual(['five']);
	});

	it('only matches a standalone digit', () => {
		expect(checkRule(rule, '[Verse]\nLevel 5A')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nI have ٥ apples')).toEqual([]);
	});

	it('reports each number on a line in order', () => {
		const text = '[Verse]\nI need 5 and 6 and 7';
		expect(markedText(text, checkRule(rule, text))).toEqual(['5', '6', '7']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nI need five and six and seven');
	});

	it('leaves the ordinal of a written-out label alone', () => {
		// `Verse 1:` is a header that has not been bracketed yet, so the number in
		// it is part of a song-part name — spelling it out reads as the linter
		// asking for `Verse one:`, on the first line of a fresh paste.
		const text = 'Verse 1:\nI need 5 reasons';
		// The label's own `1` is gone; the lyric's `5` below it is untouched.
		expect(markedText(text, checkRule(rule, text))).toEqual(['5']);
		expect(checkRule(rule, 'VERSE 2\nA lyric')).toEqual([]);
		// A line that only happens to contain a part name is still a lyric.
		expect(fixInserts(checkRule(rule, '[Verse]\nVerse 1 of the book'))).toEqual(['one']);
	});

	it('reads inside supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verse]\n<i>I need 5</i>';
		expect(markedText(supported, checkRule(rule, supported))).toEqual(['5']);
		expect(checkRule(rule, '[Verse]\n<u>I need 5</u>')).toEqual([]);
		expect(checkRule(rule, '[Verse 5]\nGo now')).toEqual([]);
	});
});

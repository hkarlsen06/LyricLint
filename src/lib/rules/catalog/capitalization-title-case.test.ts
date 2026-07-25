import { describe, expect, it } from 'vitest';
import { capitalizationTitleCaseRule as rule } from './capitalization-title-case.js';
import { checkRule, markedText } from '../rule-test-utils.js';

describe('capitalization.title-case', () => {
	it('marks whole lines only when a section holds at least two of them', () => {
		const text = '[Verse]\nThis Is The Way We Live\nEvery Single Word Starts Uppercase';
		const found = checkRule(rule, text);

		expect(markedText(text, found)).toEqual([
			'This Is The Way We Live',
			'Every Single Word Starts Uppercase'
		]);
		expect(found.every((finding) => finding.fixes === undefined)).toBe(true);
	});

	it('stays silent on a single title-cased line', () => {
		expect(checkRule(rule, '[Verse]\nThis Is One Deliberate Title')).toEqual([]);
	});

	it('counts candidates per section rather than per document', () => {
		expect(
			checkRule(
				rule,
				'[Verse]\nThis Is The Way We Live\n\n[Chorus]\nEvery Single Word Starts Uppercase'
			)
		).toEqual([]);
	});

	it('needs four words and three eligible followers before a line counts', () => {
		expect(checkRule(rule, '[Verse]\nThree Word Line\nAnother Short One')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nI Am The One\nYou Are The Two')).toHaveLength(2);
	});

	it('excludes “I” and acronyms from the ratio instead of counting them as evidence', () => {
		expect(
			checkRule(rule, '[Verse]\nNASA And FBI Are The Ones\nThis Is The Way We Live')
		).toHaveLength(2);
	});

	it('drops below the ratio as soon as ordinary words stay lowercase', () => {
		expect(
			checkRule(rule, '[Verse]\nThis Is The Way we live\nEvery Single Word Starts Uppercase')
		).toEqual([]);
	});

	it('covers the literal markup in the line and skips unsupported markup', () => {
		const supported =
			'[Verse]\n<i>This Is The Way We Live</i>\n<i>Every Single Word Is Uppercase</i>';
		expect(markedText(supported, checkRule(rule, supported))).toEqual([
			'<i>This Is The Way We Live</i>',
			'<i>Every Single Word Is Uppercase</i>'
		]);
		expect(
			checkRule(
				rule,
				'[Verse]\n<u>This Is The Way We Live</u>\n<u>Every Single Word Is Uppercase</u>'
			)
		).toEqual([]);
	});

	it('never fires on a script without letter case', () => {
		expect(checkRule(rule, '[Verse]\nكلمات عربية هنا الآن\nكلمات عربية هنا الآن')).toEqual([]);
	});
});

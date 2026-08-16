import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { sectionHeaderProseRule as rule } from './section-header-prose.js';

function messages(text: string, language?: string): string[] {
	return checkRule(rule, text, language ? { language } : {}).map((finding) => finding.message);
}

describe('section.header-prose', () => {
	it('converts the three shapes a written-out label takes', () => {
		expect(applyRuleFixes(rule, 'Verse 1:\nA lyric')).toBe('[Verse 1]\nA lyric');
		expect(applyRuleFixes(rule, 'Chorus:\nA lyric')).toBe('[Chorus]\nA lyric');
		expect(applyRuleFixes(rule, 'VERSE 2\nA lyric')).toBe('[Verse 2]\nA lyric');
	});

	it('normalizes casing to the reviewed spelling', () => {
		expect(applyRuleFixes(rule, 'CHORUS\nA lyric')).toBe('[Chorus]\nA lyric');
		expect(applyRuleFixes(rule, 'pre-chorus:\nA lyric')).toBe('[Pre-Chorus]\nA lyric');
	});

	it('leaves a bare part name alone, because a lyric can be one word', () => {
		expect(messages('[Verse]\nChorus')).toEqual([]);
		expect(messages('[Verse]\nBridge')).toEqual([]);
	});

	it('brackets a bare part name when it leads a headerless section with lyrics', () => {
		const input = '[Bridge]\nFirst section\n\nOutro\nLast lines';
		expect(messages(input)).toEqual(['Write this section header as [Outro].']);
		expect(applyRuleFixes(rule, input)).toBe('[Bridge]\nFirst section\n\n[Outro]\nLast lines');
	});

	it('leaves a lone bare part name ambiguous without a lyric body', () => {
		expect(messages('Outro')).toEqual([]);
	});

	it('ignores a line that only contains a part name among other words', () => {
		expect(messages('[Verse]\nThe chorus of my life:')).toEqual([]);
		expect(messages('[Verse]\nVerse 1 of the book')).toEqual([]);
	});

	it('ignores a name no reviewed pack knows', () => {
		expect(messages('Breakdance 1:\nA lyric')).toEqual([]);
	});

	it('prefers the document language before falling back to other packs', () => {
		expect(applyRuleFixes(rule, 'Refreng:\nEn natt', { language: 'no' })).toBe(
			'[Refreng]\nEn natt'
		);
		// English is still recognized in a Norwegian draft; choosing the localized
		// term is `section.localized-header-preference`'s decision, not this rule's.
		expect(applyRuleFixes(rule, 'Chorus:\nEn natt', { language: 'no' })).toBe('[Chorus]\nEn natt');
	});

	it('does not read an uppercase non-cased script as shouting', () => {
		// Hangul has no case, so `isAllCaps` must not treat it as a marked label.
		expect(messages('[Verse]\n후렴', 'ko')).toEqual([]);
	});

	it('drops indentation and marks the whole line', () => {
		const input = '  Verse 1:  \nA lyric';
		expect(markedText(input, checkRule(rule, input))).toEqual(['  Verse 1:  ']);
		expect(applyRuleFixes(rule, input)).toBe('[Verse 1]\nA lyric');
	});

	it('leaves a styled line to the performer rules', () => {
		expect(messages('[Verse: A & <i>B</i>]\n<i>Chorus:</i>')).toEqual([]);
	});

	it('converts every label in a scraped document', () => {
		const input = 'Verse 1:\nFirst\n\nChorus:\nSecond\n\nVerse 2:\nThird';
		expect(applyRuleFixes(rule, input)).toBe(
			'[Verse 1]\nFirst\n\n[Chorus]\nSecond\n\n[Verse 2]\nThird'
		);
	});

	// `PROSE_LABEL`'s lazy name group in front of two optional trailing groups is
	// polynomial against a long run of spaces that never reaches a digit or a
	// colon — measured at 2.1s for one 32,000-character line, on a rule that runs
	// per line per keystroke. The length ceiling is what makes that impossible;
	// the bound here is generous because what it is proving is termination.
	it('refuses a line no reviewed label could be, before the pattern sees it', () => {
		const text = `[Verse]\na${' '.repeat(32_000)}5x`;
		const started = performance.now();

		expect(checkRule(rule, text)).toEqual([]);
		expect(performance.now() - started).toBeLessThan(200);
	});

	it('keeps each label its own batch so one card cannot sweep up another', () => {
		const labels = checkRule(rule, 'Verse 1:\nFirst\n\nChorus:\nSecond').flatMap(
			(finding) => finding.fixes?.map((fix) => fix.label) ?? []
		);
		expect(labels).toEqual(['Use [Verse 1]', 'Use [Chorus]']);
	});
});

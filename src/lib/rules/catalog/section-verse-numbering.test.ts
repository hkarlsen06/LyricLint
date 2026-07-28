import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { sectionVerseNumberingRule } from './section-verse-numbering.js';

function findings(text: string, language = 'en') {
	return checkRule(sectionVerseNumberingRule, text, { language });
}

describe('section.verse-numbering', () => {
	describe('a song whose verses were never numbered', () => {
		const text = '[Verse]\nFirst\n\n[Chorus]\nHold\n\n[Verse]\nSecond';

		it('asks for the enumeration once, not once per verse', () => {
			const found = findings(text);

			expect(markedText(text, found)).toEqual(['[Verse]']);
			expect(found[0]?.message).toBe("Number this song's verses.");
			expect(found[0]?.relatedRanges?.map(({ from, to }) => text.slice(from, to))).toEqual([
				'[Verse]'
			]);
		});

		// One press does the whole job. Numbering is a single decision about a
		// set, and a fix that numbered only the verse its card sits on would
		// leave the song half enumerated.
		it('numbers every verse in one edit', () => {
			const [fix] = findings(text)[0]?.fixes ?? [];

			expect(fix?.label).toBe('Number the verses');
			expect(fix?.kind).toBe('preview');
			expect(fix?.edit.edits).toHaveLength(2);
			expect(applyRuleFixes(sectionVerseNumberingRule, text)).toBe(
				'[Verse 1]\nFirst\n\n[Chorus]\nHold\n\n[Verse 2]\nSecond'
			);
		});

		it('leaves the numbered song alone', () => {
			expect(findings('[Verse 1]\nFirst\n\n[Verse 2]\nSecond')).toEqual([]);
		});

		it('reads the song part through the language pack, not the spelling', () => {
			const norwegian = '[Vers]\nFørst\n\n[Refreng]\nHold\n\n[Vers]\nSå';

			expect(applyRuleFixes(sectionVerseNumberingRule, norwegian, { language: 'no' })).toBe(
				'[Vers 1]\nFørst\n\n[Refreng]\nHold\n\n[Vers 2]\nSå'
			);
		});

		// The number goes on the name, which is not the end of the header.
		it('numbers a header that carries a legend', () => {
			expect(
				applyRuleFixes(sectionVerseNumberingRule, '[Verse: Ane]\nFirst\n\n[Verse: Ane]\nSecond', {
					performers: ['Ane']
				})
			).toBe('[Verse 1: Ane]\nFirst\n\n[Verse 2: Ane]\nSecond');
		});
	});

	// A repeated verse is one verse, and Genius leaves a song with one verse
	// unnumbered — so the missing numbers here are correct.
	it('says nothing where the song has one distinct verse sung twice', () => {
		expect(findings('[Verse]\nFirst\n\n[Chorus]\nHold\n\n[Verse]\nFirst')).toEqual([]);
	});

	// The trigger counts verses that have words. Pressing Enter on a fresh
	// header would otherwise ask for numbering before there was a second verse
	// to distinguish from the first.
	it('waits for the second verse to have words', () => {
		expect(findings('[Verse]\nFirst\n\n[Chorus]\nHold\n\n[Verse]')).toEqual([]);
	});

	it('numbers an empty verse once another distinct one is written', () => {
		expect(
			applyRuleFixes(sectionVerseNumberingRule, '[Verse]\nFirst\n\n[Verse]\n\n[Verse]\nThird')
		).toBe('[Verse 1]\nFirst\n\n[Verse 2]\n\n[Verse 3]\nThird');
	});

	it('gives a repeated verse the number of its first occurrence', () => {
		const text = '[Verse]\nFirst\n\n[Verse]\nSecond\n\n[Verse]\nFirst';
		const found = findings(text);

		expect(found[0]?.explanation).toContain('3 verse headers and 2 distinct verses');
		expect(applyRuleFixes(sectionVerseNumberingRule, text)).toBe(
			'[Verse 1]\nFirst\n\n[Verse 2]\nSecond\n\n[Verse 1]\nFirst'
		);
	});

	// One header short of the enumeration is still the enumeration missing, so
	// it reads as the single finding it is rather than as a wrong number.
	it('names the one verse it would number when the rest already are', () => {
		const text = '[Verse 1]\nFirst\n\n[Verse]\nSecond';
		const [found] = findings(text);

		expect(found?.message).toBe('This verse should be numbered 2.');
		expect(found?.fixes?.[0]?.label).toBe('Number this verse 2');
		expect(found?.relatedRanges).toBeUndefined();
		expect(applyRuleFixes(sectionVerseNumberingRule, text)).toBe(
			'[Verse 1]\nFirst\n\n[Verse 2]\nSecond'
		);
	});

	// A wrong number and a missing one are one repair, because the fix is the
	// song's enumeration rather than one header's digits.
	it('corrects a wrong number in the same pass', () => {
		expect(applyRuleFixes(sectionVerseNumberingRule, '[Verse 3]\nFirst\n\n[Verse]\nSecond')).toBe(
			'[Verse 1]\nFirst\n\n[Verse 2]\nSecond'
		);
	});

	describe('the numbering a song already carries', () => {
		it('corrects each conflicting number on its own', () => {
			const text = '[Verse 1]\nFirst\n\n[Verse 3]\nSecond';
			const found = findings(text);

			expect(markedText(text, found)).toEqual(['3']);
			expect(found[0]?.message).toBe('This verse should be numbered 2.');
			expect(found[0]?.fixes?.[0]?.label).toBe('Replace with 2');
		});

		it('removes a number from a song with only one distinct verse', () => {
			expect(applyRuleFixes(sectionVerseNumberingRule, '[Verse 1]\nFirst')).toBe('[Verse]\nFirst');
		});

		it('removes a number from a song part that is not a verse', () => {
			expect(applyRuleFixes(sectionVerseNumberingRule, '[Chorus 2]\nAgain')).toBe(
				'[Chorus]\nAgain'
			);
		});
	});
});

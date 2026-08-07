import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '$lib/rules/rule-test-utils.js';
import { sectionExtraBlankLinesRule } from './section-extra-blank-lines.js';

describe('section.extra-blank-lines', () => {
	it('marks the section below the run and safely deletes the extra lines', () => {
		const input = '[Verse 1]\nFirst line\n\n\n[Verse 2]\nSecond line';
		const diagnostics = checkRule(sectionExtraBlankLinesRule, input);

		expect(markedText(input, diagnostics)).toEqual(['[Verse 2]']);
		expect(diagnostics[0]).toMatchObject({
			severity: 'suggestion',
			message: 'Leave one blank line between song parts.',
			explanation: expect.stringContaining('does not say how many empty lines'),
			fixes: [
				{
					kind: 'safe',
					label: 'Remove extra blank lines',
					// The first blank line survives untouched; only the tail of the gap
					// is deleted, and nothing is inserted in its place.
					edit: { edits: [{ from: 22, to: 23, insert: '' }] }
				}
			]
		});
		expect(applyRuleFixes(sectionExtraBlankLinesRule, input)).toBe(
			'[Verse 1]\nFirst line\n\n[Verse 2]\nSecond line'
		);
	});

	it('collapses a long run to one blank line in a single edit', () => {
		expect(
			applyRuleFixes(sectionExtraBlankLinesRule, '[Verse]\nFirst\n\n\n\n\n[Chorus]\nSecond')
		).toBe('[Verse]\nFirst\n\n[Chorus]\nSecond');
	});

	it('preserves CRLF and the whitespace on the blank line it keeps', () => {
		expect(
			applyRuleFixes(sectionExtraBlankLinesRule, '[Verse]\r\nFirst\r\n \r\n\r\n[Chorus]\r\nSecond')
		).toBe('[Verse]\r\nFirst\r\n \r\n[Chorus]\r\nSecond');
	});

	it('reports a headerless section on its first line', () => {
		const input = '[Verse]\nFirst\n\n\nA stray lyric';

		expect(markedText(input, checkRule(sectionExtraBlankLinesRule, input))).toEqual([
			'A stray lyric'
		]);
	});

	it('reports every gap in one document', () => {
		const input = '[Verse 1]\nFirst\n\n\n[Chorus]\nHold\n\n\n[Verse 2]\nSecond';

		expect(checkRule(sectionExtraBlankLinesRule, input)).toHaveLength(2);
		expect(applyRuleFixes(sectionExtraBlankLinesRule, input)).toBe(
			'[Verse 1]\nFirst\n\n[Chorus]\nHold\n\n[Verse 2]\nSecond'
		);
	});

	it.each([
		'[Verse]\nFirst\n\n[Chorus]\nSecond',
		'[Verse]\nFirst\n \n[Chorus]\nSecond',
		'[Verse]\nFirst\n[Chorus]\nSecond'
	])('accepts a separator of one blank line or none: %j', (input) => {
		expect(checkRule(sectionExtraBlankLinesRule, input)).toEqual([]);
	});

	it('defers an exact immediate repeat to the stronger repeat-spacing rule', () => {
		expect(checkRule(sectionExtraBlankLinesRule, '[Chorus]\nAgain\n\n\n[Chorus]\nAgain')).toEqual(
			[]
		);
	});

	it('says nothing about blank lines above or below the whole song', () => {
		expect(checkRule(sectionExtraBlankLinesRule, '\n\n\n[Verse]\nFirst\n\n\n')).toEqual([]);
	});
});

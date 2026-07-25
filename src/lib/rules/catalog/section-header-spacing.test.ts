import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '$lib/rules/rule-test-utils.js';
import { sectionHeaderSpacingRule } from './section-header-spacing.js';

describe('section.header-spacing', () => {
	it('suggests and safely inserts one blank line before an adjacent header', () => {
		const input = '[Verse]\nFirst line\n[Chorus]\nSecond line';
		const diagnostics = checkRule(sectionHeaderSpacingRule, input);

		expect(markedText(input, diagnostics)).toEqual(['[Chorus]']);
		expect(diagnostics[0]).toMatchObject({
			severity: 'suggestion',
			message: 'Add a blank line before this section header.',
			explanation: expect.stringContaining('does not explicitly require a blank line'),
			fixes: [
				{
					kind: 'safe',
					label: 'Add blank line',
					edit: { edits: [{ from: 19, to: 19, insert: '\n' }] }
				}
			]
		});
		expect(applyRuleFixes(sectionHeaderSpacingRule, input)).toBe(
			'[Verse]\nFirst line\n\n[Chorus]\nSecond line'
		);
	});

	it('preserves CRLF and header indentation', () => {
		const input = '[Verse]\r\nFirst line\r\n  [Chorus]\r\nSecond line';

		expect(applyRuleFixes(sectionHeaderSpacingRule, input)).toBe(
			'[Verse]\r\nFirst line\r\n\r\n  [Chorus]\r\nSecond line'
		);
	});

	it.each([
		'[Verse]\nFirst line\n\n[Chorus]\nSecond line',
		'[Verse]\nFirst line\n \n[Chorus]\nSecond line',
		'[Verse]\nFirst line\n\n\n[Chorus]\nSecond line'
	])('accepts an existing blank separator: %j', (input) => {
		expect(checkRule(sectionHeaderSpacingRule, input)).toEqual([]);
	});

	it('does not suggest spacing before the first header', () => {
		expect(checkRule(sectionHeaderSpacingRule, '[Verse]\nFirst line')).toEqual([]);
	});

	it('defers an exact immediate repeat to the stronger repeat-spacing rule', () => {
		expect(
			checkRule(sectionHeaderSpacingRule, '[Chorus]\nAgain tonight\n[Chorus]\nAgain tonight')
		).toEqual([]);
	});
});

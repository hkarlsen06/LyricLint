import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { performerInlineMismatchRule as rule } from './performer-inline-mismatch.js';

describe('performer.inline-mismatch', () => {
	it('marks every styled span whose slot is absent from the legend', () => {
		const text = '[Verse: A]\n<i>Second voice</i> and <b>third voice</b>';
		const findings = checkRule(rule, text, { performers: ['A', 'B', 'C'] });

		expect(markedText(text, findings)).toEqual(['<i>Second voice</i>', '<b>third voice</b>']);
		expect(findings.map((finding) => finding.message)).toEqual([
			'Inline style has no performer in the section legend.',
			'Inline style has no performer in the section legend.'
		]);
		expect(findings.every((finding) => finding.fixes === undefined)).toBe(true);
	});

	it('reads slots from the parsed legend rather than the global roster', () => {
		expect(
			checkRule(rule, '[Verse: A & <i>B</i>]\n<i>Second voice</i>', { performers: [] })
		).toEqual([]);
	});

	it('ignores unsupported markup', () => {
		expect(checkRule(rule, '[Verse: A]\n<u>Unknown voice</u>', { performers: ['A', 'B'] })).toEqual(
			[]
		);
	});
});

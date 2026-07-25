import { describe, expect, it } from 'vitest';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';
import { punctuationLineEndingRule as rule } from './punctuation-line-ending.js';

describe('punctuation.line-ending', () => {
	it('reports trailing commas and periods with preview removals', () => {
		const text = '[Verse]\nHei alle sammen.\nJeg vet ikke,';
		const findings = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, findings)).toEqual(['.', ',']);
		expect(findings.map((finding) => finding.fixes?.[0])).toMatchObject([
			{
				kind: 'preview',
				label: 'Remove the period',
				edit: { baseRevision: testRevision }
			},
			{
				kind: 'preview',
				label: 'Remove the comma',
				edit: { baseRevision: testRevision }
			}
		]);
		expect(fixInserts(findings)).toEqual(['', '']);
		expect(applyRuleFixes(rule, text, { language: 'no' })).toBe(
			'[Verse]\nHei alle sammen\nJeg vet ikke'
		);
	});

	it('finds punctuation before closing quotes, parentheses, and supported markup', () => {
		const text = `[Verse]\n<i>"Stay."</i>\n(Wait,)\n'Go,'`;

		expect(markedText(text, checkRule(rule, text))).toEqual(['.', ',', ',']);
		expect(applyRuleFixes(rule, text)).toBe(`[Verse]\n<i>"Stay"</i>\n(Wait)\n'Go'`);
	});

	it('allows internal punctuation and supported terminal marks', () => {
		expect(
			checkRule(rule, '[Verse]\nTell me, friend\nAre you ready?\nI am ready!\nHe said "go"\nWait—')
		).toEqual([]);
	});

	it('leaves ellipses for contextual review rather than damaging them', () => {
		expect(checkRule(rule, '[Verse]\nWait...\nWait…')).toEqual([]);
	});

	it('handles trailing whitespace without including it in the range', () => {
		const text = '[Verse]\nA line.   ';
		expect(markedText(text, checkRule(rule, text))).toEqual(['.']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nA line   ');
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		expect(
			markedText('[Verse]\n<i>A line.</i>', checkRule(rule, '[Verse]\n<i>A line.</i>'))
		).toEqual(['.']);
		expect(checkRule(rule, '[Verse]\n<u>A line.</u>')).toEqual([]);
		expect(checkRule(rule, '[Verse.]\nA line')).toEqual([]);
	});
});

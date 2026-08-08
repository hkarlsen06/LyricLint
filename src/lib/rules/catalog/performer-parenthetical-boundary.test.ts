import { describe, expect, it } from 'vitest';
import { performerParentheticalBoundaryRule as rule } from './performer-parenthetical-boundary.js';
import { applyRuleFixes, checkRule, markedText, testRevision } from '../rule-test-utils.js';

describe('performer.parenthetical-boundary', () => {
	it('moves the performer formatting inside the complete parenthetical', () => {
		const text = '[Verse: A & <i>B</i>]\nA <i>(La oss THC)</i>';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['<i>(La oss THC)</i>']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'safe',
			label: 'Move formatting inside the parentheses',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse: A & <i>B</i>]\nA (<i>La oss THC</i>)');
	});

	it('keeps whitespace where it was while the tags move to hug the words', () => {
		expect(applyRuleFixes(rule, '[Verse]\n<b>( Voice )</b>')).toBe('[Verse]\n( <b>Voice</b> )');
		expect(applyRuleFixes(rule, '[Verse]\n<i> (Voice) </i>')).toBe('[Verse]\n (<i>Voice</i>) ');
	});

	it('supports every generated performer wrapper', () => {
		expect(applyRuleFixes(rule, '[Verse]\n<b>(Voice)</b>')).toBe('[Verse]\n(<b>Voice</b>)');
		expect(applyRuleFixes(rule, '[Verse]\n<i><b>(Joint voice)</b></i>')).toBe(
			'[Verse]\n(<i><b>Joint voice</b></i>)'
		);
	});

	it('leaves a parenthetical inside a longer styled passage alone', () => {
		expect(checkRule(rule, '[Verse]\n<i>Before (voice) after</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>Before (voice)</i>')).toEqual([]);
	});

	it('only claims a wrapper holding exactly one parenthetical', () => {
		expect(checkRule(rule, '[Verse]\n<i>(One) (Two)</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>(Voice</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>()</i>')).toEqual([]);
		expect(applyRuleFixes(rule, '[Verse]\n<i>((Voice))</i>')).toBe('[Verse]\n(<i>(Voice)</i>)');
	});

	it('leaves the guide’s own form, unsupported markup, and cross-line wrappers alone', () => {
		expect(checkRule(rule, '[Verse]\n(<i>Voice</i>)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<u>(Voice)</u>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>(Voice\nmore)</i>')).toEqual([]);
	});
});

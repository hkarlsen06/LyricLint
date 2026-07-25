import { describe, expect, it } from 'vitest';
import { performerParentheticalBoundaryRule as rule } from './performer-parenthetical-boundary.js';
import { applyRuleFixes, checkRule, markedText, testRevision } from '../rule-test-utils.js';

describe('performer.parenthetical-boundary', () => {
	it('moves a single performer wrapper around the complete parenthetical', () => {
		const text = '[Verse: A & <i>B</i>]\nA (<i>La oss THC</i>)';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['(<i>La oss THC</i>)']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'safe',
			label: 'Include parentheses in performer formatting',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse: A & <i>B</i>]\nA <i>(La oss THC)</i>');
	});

	it('repairs either excluded boundary without shortening an existing styled passage', () => {
		expect(applyRuleFixes(rule, '[Verse]\n<i>Before (voice</i>)')).toBe(
			'[Verse]\n<i>Before (voice)</i>'
		);
		expect(applyRuleFixes(rule, '[Verse]\n(<b>Voice) after</b>')).toBe(
			'[Verse]\n<b>(Voice) after</b>'
		);
	});

	it('consolidates same-performer wrappers that fill one parenthetical', () => {
		expect(applyRuleFixes(rule, '[Verse]\n(<i>Call</i> <i>back</i>)')).toBe(
			'[Verse]\n<i>(Call back)</i>'
		);
	});

	it('supports every generated performer wrapper and preserves internal whitespace', () => {
		expect(applyRuleFixes(rule, '[Verse]\n( <b>Voice</b> )')).toBe('[Verse]\n<b>( Voice )</b>');
		expect(applyRuleFixes(rule, '[Verse]\n(<i><b>Joint voice</b></i>)')).toBe(
			'[Verse]\n<i><b>(Joint voice)</b></i>'
		);
	});

	it('does not infer one performer for mixed or partly plain content', () => {
		expect(checkRule(rule, '[Verse]\n(Plain <i>voice</i>)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(<i>One</i> <b>Two</b>)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(<i>Voice</i>!)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(Plain voice)')).toEqual([]);
	});

	it('leaves already complete, malformed, unmatched, and cross-line formatting alone', () => {
		expect(checkRule(rule, '[Verse]\n<i>(Voice)</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(<u>Voice</u>)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n(<i>Voice</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>Before\n(Voice</i>)')).toEqual([]);
	});
});

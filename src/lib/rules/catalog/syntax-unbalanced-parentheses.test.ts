import { describe, expect, it } from 'vitest';
import { syntaxUnbalancedParenthesesRule as rule } from './syntax-unbalanced-parentheses.js';
import { checkRule, markedText } from '../rule-test-utils.js';

describe('syntax.unbalanced-parentheses', () => {
	it('reports every parenthesis that never closes', () => {
		const text = '[Pre-Chorus]\n(La oss feste litt(';
		const findings = checkRule(rule, text);
		expect(markedText(text, findings)).toEqual(['(', '(']);
		expect(
			findings.every((finding) => finding.message === 'This parenthesis is never closed.')
		).toBe(true);
	});

	it('reports a closing parenthesis that never opened', () => {
		const text = '[Verse]\nHold me close) tonight';
		const [finding] = checkRule(rule, text);
		expect(finding?.message).toBe('This parenthesis was never opened.');
		expect(markedText(text, [finding!])).toEqual([')']);
	});

	it('offers no fix, because where the vocal ends is a judgment call', () => {
		const [finding] = checkRule(rule, '[Verse]\nHold me close (Yeah');
		expect(finding?.fixes ?? []).toEqual([]);
	});

	it('accepts balanced marks, nested ones included', () => {
		expect(checkRule(rule, '[Verse]\nHold me close (Yeah)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nHold me (so (very) close)')).toEqual([]);
	});

	it('pairs across markup and stays out of unsupported lines', () => {
		expect(checkRule(rule, '[Verse]\n(<i>Yeah</i>)')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<u>Hold (me</u>')).toEqual([]);
	});

	it('reads lyric lines only, never the header', () => {
		expect(checkRule(rule, '[Verse (2]\nLine')).toEqual([]);
	});
});

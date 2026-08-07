import { describe, expect, it } from 'vitest';
import { punctuationParenthesisSpacingRule as rule } from './punctuation-parenthesis-spacing.js';
import { applyRuleFixes, checkRule, markedText, testRevision } from '../rule-test-utils.js';

describe('punctuation.parenthesis-spacing', () => {
	it('asks for a space before an opening mark glued to a letter', () => {
		const text = '[Verse]\nHold me close(Yeah)';
		const [finding] = checkRule(rule, text);
		expect(markedText(text, [finding!])).toEqual(['(']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'safe',
			label: 'Add a space',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nHold me close (Yeah)');
	});

	it('asks for a space after a closing mark glued to a letter', () => {
		const text = '[Verse]\n(Yeah)tonight';
		expect(markedText(text, checkRule(rule, text))).toEqual([')']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\n(Yeah) tonight');
	});

	it('repairs both ends of one glued pair in a single pass', () => {
		expect(applyRuleFixes(rule, '[Verse]\nWe(Yeah)run')).toBe('[Verse]\nWe (Yeah) run');
	});

	it('leaves punctuation and spaces beside the marks alone', () => {
		expect(checkRule(rule, '[Verse]\nHold me close (Yeah), tonight')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nHold me close (Yeah)!')).toEqual([]);
	});

	it('leaves a stray mark to the balance rule', () => {
		// A parenthesis that never pairs is likely a typo for its other half, so
		// offering to space it out would be wrong advice beside the real finding.
		expect(checkRule(rule, '[Verse]\nHold me close(Yeah')).toEqual([]);
		expect(checkRule(rule, '[Pre-Chorus]\n(La oss feste litt(')).toEqual([]);
	});

	it('stays quiet where markup separates the letter from the mark', () => {
		// The masked text reads a tag as a gap, so the rule declines to guess at
		// how the rendered line abuts rather than flag the tag's own edge.
		expect(checkRule(rule, '[Verse]\n<i>Hold</i>(Yeah)')).toEqual([]);
	});
});

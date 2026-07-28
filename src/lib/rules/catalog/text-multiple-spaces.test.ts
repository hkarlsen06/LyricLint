import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { textMultipleSpacesRule as rule } from './text-multiple-spaces.js';

describe('text.multiple-spaces', () => {
	it('suggests and safely collapses repeated spaces between words', () => {
		const input = '[Verse]\nTwo   spaces';
		const [finding] = checkRule(rule, input);

		expect(markedText(input, [finding!])).toEqual(['   ']);
		expect(finding).toMatchObject({
			severity: 'suggestion',
			message: 'Use one space between these words.',
			fixes: [
				{
					kind: 'safe',
					label: 'Use one space',
					edit: { edits: [{ from: 11, to: 14, insert: ' ' }] }
				}
			]
		});
		expect(applyRuleFixes(rule, input)).toBe('[Verse]\nTwo spaces');
	});

	it('reports every repeated run independently', () => {
		const input = '[Verse]\nOne  two   three';

		expect(markedText(input, checkRule(rule, input))).toEqual(['  ', '   ']);
		expect(applyRuleFixes(rule, input)).toBe('[Verse]\nOne two three');
	});

	it('works across supported performer markup without editing the tags', () => {
		const input = '[Verse: A & <i>B</i>]\n<i>One</i>  <b>two</b>';

		expect(markedText(input, checkRule(rule, input))).toEqual(['  ']);
		expect(applyRuleFixes(rule, input)).toBe('[Verse: A & <i>B</i>]\n<i>One</i> <b>two</b>');
	});

	it('uses Unicode word boundaries', () => {
		const input = '[Verse]\nقمر  مضيء\nCafé   glows';

		expect(markedText(input, checkRule(rule, input))).toEqual(['  ', '   ']);
	});

	it('leaves spaces that are not between words to their existing owners', () => {
		expect(checkRule(rule, '[Verse]\n  Indented words')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWords  ')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWords  , punctuation')).toEqual([]);
		expect(checkRule(rule, '[Verse  1]\nWords')).toEqual([]);
	});

	it('skips unsupported markup rather than editing ambiguous source text', () => {
		expect(checkRule(rule, '[Verse]\n<u>Two  words</u>')).toEqual([]);
	});

	it('does not treat tabs or non-breaking spaces as ordinary spaces', () => {
		expect(checkRule(rule, '[Verse]\nTwo\t\twords')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nTwo\u00a0\u00a0words')).toEqual([]);
	});
});

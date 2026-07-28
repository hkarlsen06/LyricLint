import { describe, expect, it } from 'vitest';
import { adlibParenthesesRule as rule } from './adlib-parentheses.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('adlib.parentheses', () => {
	it('capitalizes an ad-lib that is already parenthesized', () => {
		const text = '[Verse]\n(yeah)';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['yeah']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'preview',
			label: 'Capitalize as Yeah',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\n(Yeah)');
	});

	it('takes the stranded comma with the ad-lib it wrapped', () => {
		const text = '[Verse]\nI never surrendered, yeah';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual([', yeah']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'preview',
			label: 'Wrap as (Yeah)',
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nI never surrendered (Yeah)');
	});

	it('leads with accepting the line the singer may be performing as written', () => {
		// Parentheses are for a vocal behind the lead, so an ad-lib sung as part of
		// the line is already right — the shell answers with "It's correct" first
		// and offers the wrap second.
		const [wrap] = checkRule(rule, '[Verse]\nI never surrendered, yeah');
		expect(wrap?.presumedCorrect).toBe(true);

		// Capitalizing inside brackets is a fact about the text, not a question
		// about how it was sung, so that finding claims nothing of the kind.
		const [capitalize] = checkRule(rule, '[Verse]\n(yeah)');
		expect(capitalize?.presumedCorrect).toBeUndefined();
	});

	it('does not double the space when the comma already stands apart', () => {
		expect(applyRuleFixes(rule, '[Verse]\nWe run , yeah')).toBe('[Verse]\nWe run (Yeah)');
		expect(applyRuleFixes(rule, '[Verse]\n, yeah')).toBe('[Verse]\n(Yeah)');
	});

	it('keeps the comma when markup sits between it and the ad-lib', () => {
		const text = '[Verse]\nWe run, <i>yeah</i>';
		expect(markedText(text, checkRule(rule, text))).toEqual(['yeah']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nWe run, <i>(Yeah)</i>');
	});

	it('separates the ad-lib from markup that closes right before the comma', () => {
		expect(applyRuleFixes(rule, '[Verse]\n<i>We run</i>, yeah')).toBe(
			'[Verse]\n<i>We run</i> (Yeah)'
		);
	});

	it('leaves trailing whitespace outside the range', () => {
		const text = '[Verse]\nWe run, yeah   ';
		expect(markedText(text, checkRule(rule, text))).toEqual([', yeah']);
		expect(applyRuleFixes(rule, text)).toBe('[Verse]\nWe run (Yeah)   ');
	});

	it('reads the recognized ad-libs in any casing', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nWe run, Ayy'))).toEqual([' (Ayy)']);
		expect(fixInserts(checkRule(rule, "[Verse]\nWe run, let's go"))).toEqual([" (Let's go)"]);
		expect(checkRule(rule, '[Verse]\n(Yeah)')).toEqual([]);
	});

	it('only reads an ad-lib that ends the line', () => {
		expect(checkRule(rule, '[Verse]\nYeah I know')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWe run, yeah we do')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWe run, yeahs')).toEqual([]);
	});

	it('skips unsupported markup and ignores headers', () => {
		expect(checkRule(rule, '[Verse]\n<u>We run, yeah</u>')).toEqual([]);
		expect(checkRule(rule, '[Verse, yeah]\nWe run')).toEqual([]);
	});
});

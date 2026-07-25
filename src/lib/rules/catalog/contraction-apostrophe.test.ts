import { describe, expect, it } from 'vitest';
import { contractionApostropheRule as rule } from './contraction-apostrophe.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('contraction.apostrophe', () => {
	it('offers a preview replacement for a listed form', () => {
		const text = '[Verse]\nDont go';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Dont']);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'preview',
			label: "Replace with Don't",
			edit: { baseRevision: testRevision }
		});
		expect(applyRuleFixes(rule, text)).toBe("[Verse]\nDon't go");
	});

	it('carries the casing of the matched word into the replacement', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\ndont go'))).toEqual(["don't"]);
		expect(fixInserts(checkRule(rule, '[Verse]\nDONT GO'))).toEqual(["DON'T"]);
		expect(fixInserts(checkRule(rule, '[Verse]\nWont you'))).toEqual(["Won't"]);
	});

	it('always writes the first-person forms with their canonical capital I', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nwell im fine'))).toEqual(["I'm"]);
		expect(fixInserts(checkRule(rule, '[Verse]\nIM HERE'))).toEqual(["I'm"]);
		expect(fixInserts(checkRule(rule, '[Verse]\nive been'))).toEqual(["I've"]);
	});

	it('leaves the ambiguous forms the list deliberately omits', () => {
		expect(checkRule(rule, '[Verse]\nIll will fades')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWell, ill be')).toEqual([]);
	});

	it('only matches complete words', () => {
		expect(checkRule(rule, '[Verse]\ndontcha')).toEqual([]);
		expect(checkRule(rule, "[Verse]\ndon't go")).toEqual([]);
		// A hyphen is a word boundary, so the contraction is still reported.
		expect(markedText('[Verse]\nthats-a right', checkRule(rule, '[Verse]\nthats-a right'))).toEqual(
			['thats']
		);
	});

	it('runs only for the exact English tag', () => {
		for (const language of ['en-US', 'de']) {
			expect(checkRule(rule, '[Verse]\nDont go', { language })).toEqual([]);
		}
	});

	it('reports every contraction on a line in order', () => {
		const text = '[Verse]\nive dont and cant';
		expect(markedText(text, checkRule(rule, text))).toEqual(['ive', 'dont', 'cant']);
		expect(applyRuleFixes(rule, text)).toBe("[Verse]\nI've don't and can't");
	});

	it('reads inside supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verse]\n<i>Dont go</i>';
		expect(markedText(supported, checkRule(rule, supported))).toEqual(['Dont']);
		expect(checkRule(rule, '[Verse]\n<u>Dont go</u>')).toEqual([]);
		expect(checkRule(rule, '[Dont]\nGo now')).toEqual([]);
	});
});

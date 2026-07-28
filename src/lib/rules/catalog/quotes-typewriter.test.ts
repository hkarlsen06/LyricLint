import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { quotesTypewriterRule as rule } from './quotes-typewriter.js';

function messages(text: string): string[] {
	return checkRule(rule, text).map((finding) => finding.message);
}

describe('quotes.typewriter', () => {
	it('straightens every curly mark', () => {
		expect(applyRuleFixes(rule, '[Verse]\nShe said “hold on”')).toBe('[Verse]\nShe said "hold on"');
		expect(applyRuleFixes(rule, '[Verse]\nThe ‘line’ holds')).toBe("[Verse]\nThe 'line' holds");
		expect(applyRuleFixes(rule, '[Verse]\nI don’t go')).toBe("[Verse]\nI don't go");
	});

	// The pair sits on one line, so severity, line number and citation are the
	// same on both rows and the message is all that is left to tell them apart.
	it('names which mark it found, so a pair on one line reads as two findings', () => {
		expect(messages('[Verse]\nShe said “hold on”')).toEqual([
			'Use a straight " instead of the opening curly double quote.',
			'Use a straight " instead of the closing curly double quote.'
		]);
		expect(messages('[Verse]\nThe ‘line’ holds')).toEqual([
			"Use a straight ' instead of the opening curly single quote.",
			"Use a straight ' instead of the closing curly single quote."
		]);
	});

	// Most of what this rule points at in real lyrics is an apostrophe, and
	// calling one a closing quote would be confidently wrong rather than merely
	// indistinguishable.
	it('calls ’ between letters an apostrophe', () => {
		expect(messages('[Verse]\nI don’t go')).toEqual([
			"Use a straight ' instead of the curly apostrophe."
		]);
		expect(messages('[Verse]\nHold ’em close')).toEqual([
			"Use a straight ' instead of the closing curly single quote."
		]);
	});

	// The label is what `Fix all N` batches on, and replacing either half of a
	// pair with `"` is the same command — so the messages differ and the labels
	// deliberately do not.
	it('keeps one fix label per replacement, so a pair batches together', () => {
		expect(
			checkRule(rule, '[Verse]\nShe said “hold on”').map((finding) => finding.fixes?.[0]?.label)
		).toEqual(['Replace with "', 'Replace with "']);
	});

	it('marks the mark alone', () => {
		const text = '[Verse]\nShe said “hold on”';
		expect(markedText(text, checkRule(rule, text))).toEqual(['“', '”']);
	});

	it('leaves a line carrying unsupported markup alone', () => {
		expect(messages('[Verse]\n<u>“Hello”</u>')).toEqual([]);
	});
});

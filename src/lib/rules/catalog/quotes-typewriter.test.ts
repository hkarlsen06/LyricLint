import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { quotesTypewriterRule as rule } from './quotes-typewriter.js';
import { collectSafeFixes } from '../engine.js';

function messages(text: string): string[] {
	return checkRule(rule, text).map((finding) => finding.message);
}

describe('quotes.typewriter', () => {
	it('straightens every curly mark', () => {
		expect(applyRuleFixes(rule, '[Verse]\nShe said “hold on”')).toBe('[Verse]\nShe said "hold on"');
		expect(applyRuleFixes(rule, '[Verse]\nThe ‘line’ holds')).toBe("[Verse]\nThe 'line' holds");
		expect(applyRuleFixes(rule, '[Verse]\nI don’t go')).toBe("[Verse]\nI don't go");
	});

	it('flags the spacing acute accent in the Norwegian line and previews only that character', () => {
		const text = '[Pre-Chorus]\nSe de fant, de fant no´ hoes, hoes, hoes';
		const findings = checkRule(rule, text, { language: 'no' });
		expect(markedText(text, findings)).toEqual(['´']);
		expect(findings[0]).toMatchObject({
			message: "Use a straight ' instead of the acute accent.",
			settlesOn: 'line',
			fixes: [{ kind: 'preview' }]
		});
		expect(applyRuleFixes(rule, text, { language: 'no' })).toBe(
			"[Pre-Chorus]\nSe de fant, de fant no' hoes, hoes, hoes"
		);
		expect(collectSafeFixes(findings)).toEqual([]);
	});

	it.each([
		['I don´t go', "I don't go"],
		['Hold ´em close', "Hold 'em close"],
		['Keep runnin´', "Keep runnin'"],
		['🌙 <i>no´</i>', "🌙 <i>no'</i>"],
		['𐐀´', "𐐀'"],
		['e\u0301´', "e\u0301'"]
	])('finds word-adjacent accents with exact offsets in %s', (input, expected) => {
		const text = `[Verse]\n${input}`;
		expect(markedText(text, checkRule(rule, text))).toEqual(['´']);
		expect(applyRuleFixes(rule, text)).toBe(`[Verse]\n${expected}`);
	});

	it.each(['café og òg', 'cafe\u0301', 'A standalone ´ mark', '5′ 2″', '<u>no´</u>'])(
		'leaves genuine accents, notation, and unsupported markup alone: %s',
		(input) => {
			expect(messages(`[Verse]\n${input}`)).toEqual([]);
		}
	);

	it('keeps curly quote replacements safe beside a previewed accent', () => {
		const findings = checkRule(rule, '[Verse]\n“no´”');
		expect(findings.map((finding) => finding.fixes?.[0]?.kind)).toEqual([
			'safe',
			'preview',
			'safe'
		]);
		expect(collectSafeFixes(findings)).toHaveLength(2);
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

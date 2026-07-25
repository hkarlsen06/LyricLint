import { describe, expect, it } from 'vitest';
import { spellingLanguageVariantRule as rule } from './spelling-language-variant.js';
import { checkRule, markedText } from '../rule-test-utils.js';

describe('spelling.language-variant', () => {
	it('only runs for the two exact reviewed regional tags', () => {
		for (const language of ['en', 'en-AU', 'no', 'engb']) {
			expect(checkRule(rule, "[Verse]\nStay 'til dawn and stay till dawn", { language })).toEqual(
				[]
			);
		}
		for (const language of ['en-GB', 'en-gb', 'EN-GB']) {
			expect(checkRule(rule, "[Verse]\nStay 'til dawn", { language })).toHaveLength(1);
		}
		for (const language of ['en-US', 'en-us', 'EN-US']) {
			expect(checkRule(rule, '[Verse]\nStay till dawn', { language })).toHaveLength(1);
		}
	});

	it('marks the apostrophe with the American form for British pages', () => {
		const text = "[Verse]\n'Til dawn and 'til night";
		const found = checkRule(rule, text, { language: 'en-GB' });

		expect(markedText(text, found)).toEqual(["'Til", "'til"]);
		expect(found.every((finding) => finding.severity === 'manual-review')).toBe(true);
		expect(found.every((finding) => finding.fixes === undefined)).toBe(true);
	});

	it('does not read the American form out of a longer word', () => {
		expect(checkRule(rule, '[Verse]\nuntil dawn', { language: 'en-GB' })).toEqual([]);
		expect(checkRule(rule, '[Verse]\nuntil’til', { language: 'en-GB' })).toEqual([]);
	});

	it('reviews either apostrophe glyph as the American form', () => {
		// Genius documents 'til / til / till as one set (annotation 9298624), so
		// the curly form is the same spelling. `spelling.standardized` skips `til`
		// preceded by an apostrophe, so without this the curly form is reviewed by
		// no rule at all until `quotes.typewriter` happens to straighten it.
		const text = '[Verse]\nStay ’til dawn and ’Til night';
		expect(markedText(text, checkRule(rule, text, { language: 'en-GB' }))).toEqual([
			'’til',
			'’Til'
		]);
	});

	it('marks only the variant word after a reviewed temporal verb for American pages', () => {
		const text = '[Verse]\nWait till dawn and dance till night';
		const found = checkRule(rule, text, { language: 'en-US' });

		expect(markedText(text, found)).toEqual(['till', 'till']);

		const spaced = '[Verse]\nWait   till dawn';
		expect(markedText(spaced, checkRule(rule, spaced, { language: 'en-US' }))).toEqual(['till']);

		const shouted = '[Verse]\nSTAY TILL DAWN';
		expect(markedText(shouted, checkRule(rule, shouted, { language: 'en-US' }))).toEqual(['TILL']);
	});

	it('leaves the unrelated noun alone', () => {
		expect(checkRule(rule, '[Verse]\nCoins fill the till', { language: 'en-US' })).toEqual([]);
	});

	it('reads inside supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = "[Verse]\n<i>Stay 'til dawn</i>";
		expect(markedText(supported, checkRule(rule, supported, { language: 'en-GB' }))).toEqual([
			"'til"
		]);
		expect(checkRule(rule, "[Verse]\n<u>Stay 'til dawn</u>", { language: 'en-GB' })).toEqual([]);
		expect(checkRule(rule, "[Verse 'til]\nGo now", { language: 'en-GB' })).toEqual([]);
	});
});

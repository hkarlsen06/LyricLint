import { describe, expect, it } from 'vitest';
import { numbersDecadeApostropheRule } from './numbers-decade-apostrophe.js';
import { checkRule, fixInserts, markedText } from '../rule-test-utils.js';

describe('numbers.decade-apostrophe', () => {
	it('offers both readings for a bare two-digit token', () => {
		const text = "[Verse]\nBack in the 90's we had it all";
		const findings = checkRule(numbersDecadeApostropheRule, text);
		expect(markedText(text, findings)).toEqual(["90's"]);
		expect(findings[0]?.message).toBe("Use “'90s” or “90s” instead of “90's”.");
		expect(fixInserts(findings)).toEqual(["'90s", '90s']);
		// Neither reading is audible, so neither fix may enter the bulk batch.
		expect(findings[0]?.fixes?.map((fix) => fix.kind)).toEqual(['preview', 'preview']);
	});

	it('collapses a doubled apostrophe to the decade form alone', () => {
		const text = "[Verse]\nDancing like the '90's never ended";
		const findings = checkRule(numbersDecadeApostropheRule, text);
		expect(markedText(text, findings)).toEqual(["'90's"]);
		expect(fixInserts(findings)).toEqual(["'90s"]);
	});

	it('drops the apostrophe outright from a four-digit year', () => {
		const text = "[Verse]\nA 1990's kind of love";
		const findings = checkRule(numbersDecadeApostropheRule, text);
		expect(markedText(text, findings)).toEqual(["1990's"]);
		expect(fixInserts(findings)).toEqual(['1990s']);
	});

	it('mirrors the case of an all-caps line', () => {
		const text = "[Verse]\nBACK IN THE 90'S";
		expect(fixInserts(checkRule(numbersDecadeApostropheRule, text))).toEqual(["'90S", '90S']);
	});

	it('leaves correct forms and non-decade numbers alone', () => {
		for (const line of [
			"Party like it's the '90s",
			'She is in her 90s now',
			'It was 1990 all over again',
			// A non-decade number: the possessive is as likely as the plural.
			"Spinning 45's all night",
			// A plural possessive, which is not this rule's question.
			"The 90s' finest hour"
		]) {
			expect(checkRule(numbersDecadeApostropheRule, `[Verse]\n${line}`)).toEqual([]);
		}
	});

	it('leaves curly-apostrophe forms to quotes.typewriter', () => {
		expect(checkRule(numbersDecadeApostropheRule, '[Verse]\nBack in the 90’s')).toEqual([]);
	});

	it('reports nothing outside English', () => {
		expect(
			checkRule(numbersDecadeApostropheRule, "[Vers]\nTilbake i 90's", { language: 'no' })
		).toEqual([]);
	});
});

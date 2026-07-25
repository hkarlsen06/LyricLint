import { describe, expect, it } from 'vitest';
import { grammarEnglishPronounIRule as rule } from './grammar-english-pronoun-i.js';
import { applyRuleFixes, checkRule, markedText, testRevision } from '../rule-test-utils.js';

describe('grammar.english-pronoun-i', () => {
	it('capitalizes standalone i and the initial i in common contractions', () => {
		const text = "[Verse]\ni know i'm ready, i’ve tried, i’d go, and i'll stay";
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual(['i', 'i', 'i', 'i', 'i']);
		expect(findings.every((finding) => finding.severity === 'suggestion')).toBe(true);
		expect(
			findings.every((finding) =>
				finding.fixes?.some(
					(fix) =>
						fix.kind === 'preview' &&
						fix.label === 'Capitalize I' &&
						fix.edit.baseRevision === testRevision
				)
			)
		).toBe(true);
		expect(applyRuleFixes(rule, text)).toBe(
			"[Verse]\nI know I'm ready, I’ve tried, I’d go, and I'll stay"
		);
	});

	it('runs for English base and regional tags only', () => {
		for (const language of ['en', 'en-US', 'EN-gb']) {
			expect(checkRule(rule, '[Verse]\nyou and i', { language })).toHaveLength(1);
		}
		for (const language of ['de', 'eng', 'no', 'english']) {
			expect(checkRule(rule, '[Verse]\nyou and i', { language })).toEqual([]);
		}
	});

	it('requires a complete pronoun or supported contraction', () => {
		const text = "[Verse]\nInside mini iPhone ii i.e. i'ma i's I I'm I've I'd I'll";
		expect(checkRule(rule, text)).toEqual([]);
	});

	it('still recognizes the pronoun before punctuation', () => {
		const text = "[Verse]\nYou know i. You know i, and 'i' is a quoted letter";
		expect(markedText(text, checkRule(rule, text))).toEqual(['i', 'i']);
	});

	it('reports multiple matches in document order and reaches a fixed point', () => {
		const text = '[Verse]\nyou and i\n\n[Chorus]\ni think i’ll stay';
		const findings = checkRule(rule, text);

		expect(findings.map((finding) => finding.from)).toEqual(
			[...findings].map((finding) => finding.from).sort((left, right) => left - right)
		);
		expect(markedText(text, findings)).toEqual(['i', 'i', 'i']);
		const fixed = applyRuleFixes(rule, text);
		expect(fixed).toBe('[Verse]\nyou and I\n\n[Chorus]\nI think I’ll stay');
		expect(checkRule(rule, fixed)).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = "[Verse]\n<i>you and i, i'm ready</i>";
		expect(markedText(supported, checkRule(rule, supported))).toEqual(['i', 'i']);
		expect(checkRule(rule, "[Verse]\n<u>you and i, i'm ready</u>")).toEqual([]);
		expect(checkRule(rule, "[i'm]\nI am ready")).toEqual([]);
	});
});

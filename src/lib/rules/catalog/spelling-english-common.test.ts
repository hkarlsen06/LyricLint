import { describe, expect, it } from 'vitest';
import { spellingEnglishCommonRule as rule } from './spelling-english-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.english-common', () => {
	it('previews high-frequency English spelling corrections', () => {
		const text =
			'[Verse]\nDefinately tommorrow we acheive it becouse my freind stays untill I recieve a seperate sign';
		const findings = checkRule(rule, text, { language: 'en' });

		expect(markedText(text, findings)).toEqual([
			'Definately',
			'tommorrow',
			'acheive',
			'becouse',
			'freind',
			'untill',
			'recieve',
			'seperate'
		]);
		expect(fixInserts(findings)).toEqual([
			'Definitely',
			'tomorrow',
			'achieve',
			'because',
			'friend',
			'until',
			'receive',
			'separate'
		]);
		expect(
			findings.every(
				(finding) =>
					finding.fixes?.[0]?.kind === 'preview' &&
					finding.fixes[0].edit.baseRevision === testRevision
			)
		).toBe(true);
	});

	it('runs only for English tags and preserves casing', () => {
		for (const language of ['en', 'en-US', 'EN_gb']) {
			expect(checkRule(rule, '[Verse]\nDEFINATELY', { language })).toHaveLength(1);
		}
		expect(fixInserts(checkRule(rule, '[Verse]\nDEFINATELY', { language: 'en' }))).toEqual([
			'DEFINITELY'
		]);
		expect(checkRule(rule, '[Verse]\nDefinately', { language: 'de' })).toEqual([]);
	});

	it('requires complete words and reaches a fixed point', () => {
		expect(checkRule(rule, '[Verse]\nseperately befriended weird', { language: 'en' })).toEqual([]);
		const text = '[Verse]\nDefinately my freind comes tommorrow';
		const fixed = applyRuleFixes(rule, text, { language: 'en' });
		expect(fixed).toBe('[Verse]\nDefinitely my friend comes tomorrow');
		expect(checkRule(rule, fixed, { language: 'en' })).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verse]\n<i>definately recieve</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'en' }))).toEqual([
			'definately',
			'recieve'
		]);
		expect(checkRule(rule, '[Verse]\n<u>definately</u>', { language: 'en' })).toEqual([]);
		expect(checkRule(rule, '[Definately]\ndefinitely', { language: 'en' })).toEqual([]);
	});
});

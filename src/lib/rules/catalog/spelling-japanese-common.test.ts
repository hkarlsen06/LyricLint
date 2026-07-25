import { describe, expect, it } from 'vitest';
import { spellingJapaneseCommonRule as rule } from './spelling-japanese-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.japanese-common', () => {
	it('runs for the Japanese base tag and regional variants only', () => {
		expect(checkRule(rule, '[Verse]\nこんにちわ', { language: 'ja' })).toHaveLength(1);
		expect(checkRule(rule, '[Verse]\nこんにちわ', { language: 'ja-JP' })).toHaveLength(1);
		expect(checkRule(rule, '[Verse]\nこんにちわ', { language: 'zh' })).toEqual([]);
	});

	it('offers preview fixes with the current revision', () => {
		const findings = checkRule(rule, '[Verse]\nこんにちわ こんばんわ 一人づつ', { language: 'ja' });

		expect(fixInserts(findings)).toEqual(['こんにちは', 'こんばんは', 'ずつ']);
		expect(findings.every((finding) => finding.fixes?.[0]?.kind === 'preview')).toBe(true);
		expect(
			findings.every((finding) => finding.fixes?.[0]?.edit.baseRevision === testRevision)
		).toBe(true);
		expect(findings[0]?.explanation).toContain('phonetic');
	});

	it('reports literal forms in source order and applies them to a fixed point', () => {
		const text = '[Verse]\nこんばんわ、こんにちわ、一人づつ';
		const findings = checkRule(rule, text, { language: 'ja' });

		expect(markedText(text, findings)).toEqual(['こんばんわ', 'こんにちわ', 'づつ']);
		const fixed = applyRuleFixes(rule, text, { language: 'ja' });
		expect(fixed).toBe('[Verse]\nこんばんは、こんにちは、一人ずつ');
		expect(checkRule(rule, fixed, { language: 'ja' })).toEqual([]);
	});

	it('matches the literal spelling in continuous Japanese text and leaves correct forms alone', () => {
		const text = '[Verse]\n君にこんにちわって言う';
		expect(markedText(text, checkRule(rule, text, { language: 'ja' }))).toEqual(['こんにちわ']);
		expect(
			checkRule(rule, '[Verse]\nこんにちは、こんばんは、一人ずつ', { language: 'ja' })
		).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verse]\n<i>こんにちわ こんばんわ</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'ja' }))).toEqual([
			'こんにちわ',
			'こんばんわ'
		]);
		expect(checkRule(rule, '[Verse]\n<u>こんにちわ</u>', { language: 'ja' })).toEqual([]);
		expect(checkRule(rule, '[こんにちわ]\nこんにちは', { language: 'ja' })).toEqual([]);
	});
});

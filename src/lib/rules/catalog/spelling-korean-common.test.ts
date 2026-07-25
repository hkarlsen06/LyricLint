import { describe, expect, it } from 'vitest';
import { spellingKoreanCommonRule as rule } from './spelling-korean-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.korean-common', () => {
	it('runs for the Korean base tag and regional variants only', () => {
		expect(checkRule(rule, '[Verse]\n됬어', { language: 'ko' })).toHaveLength(1);
		expect(checkRule(rule, '[Verse]\n됬어', { language: 'ko-KR' })).toHaveLength(1);
		expect(checkRule(rule, '[Verse]\n됬어', { language: 'ja' })).toEqual([]);
	});

	it('offers preview fixes with the current revision', () => {
		const findings = checkRule(
			rule,
			'[Verse]\n됬 몇일 웬지 오랫만 설레임 설레이는 설레이네 일일히',
			{ language: 'ko' }
		);

		expect(fixInserts(findings)).toEqual([
			'됐',
			'며칠',
			'왠지',
			'오랜만',
			'설렘',
			'설레는',
			'설레네',
			'일일이'
		]);
		expect(findings.every((finding) => finding.fixes?.[0]?.kind === 'preview')).toBe(true);
		expect(
			findings.every((finding) => finding.fixes?.[0]?.edit.baseRevision === testRevision)
		).toBe(true);
	});

	it('reports multiple forms in source order and applies them to a fixed point', () => {
		const text = '[Verse]\n몇일 됬어 웬지 오랫만 설레임 일일히';
		const findings = checkRule(rule, text, { language: 'ko' });

		expect(markedText(text, findings)).toEqual([
			'몇일',
			'됬',
			'웬지',
			'오랫만',
			'설레임',
			'일일히'
		]);
		const fixed = applyRuleFixes(rule, text, { language: 'ko' });
		expect(fixed).toBe('[Verse]\n며칠 됐어 왠지 오랜만 설렘 일일이');
		expect(checkRule(rule, fixed, { language: 'ko' })).toEqual([]);
	});

	it('matches 됬 inside conjugated text but requires 몇일 to be a whole token', () => {
		expect(
			markedText('[Verse]\n안됬어', checkRule(rule, '[Verse]\n안됬어', { language: 'ko' }))
		).toEqual(['됬']);
		expect(checkRule(rule, '[Verse]\n몇일간', { language: 'ko' })).toEqual([]);
		expect(checkRule(rule, '[Verse]\n됐어 며칠', { language: 'ko' })).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verse]\n<i>됬 몇일</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'ko' }))).toEqual([
			'됬',
			'몇일'
		]);
		expect(checkRule(rule, '[Verse]\n<u>됬 몇일</u>', { language: 'ko' })).toEqual([]);
		expect(checkRule(rule, '[됬]\n됐', { language: 'ko' })).toEqual([]);
	});
});

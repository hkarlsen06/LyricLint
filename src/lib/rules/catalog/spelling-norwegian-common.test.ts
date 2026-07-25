import { describe, expect, it } from 'vitest';
import { spellingNorwegianCommonRule as rule } from './spelling-norwegian-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.norwegian-common', () => {
	it('previews the standard spelling for common Norwegian errors', () => {
		const text =
			'[Vers]\nDesverre var en nyskjerrig venn blandt oss, værre etterhvert, ihvertfall ved tunell';
		const findings = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, findings)).toEqual([
			'Desverre',
			'nyskjerrig',
			'blandt',
			'værre',
			'etterhvert',
			'ihvertfall',
			'tunell'
		]);
		expect(fixInserts(findings)).toEqual([
			'Dessverre',
			'nysgjerrig',
			'blant',
			'verre',
			'etter hvert',
			'i hvert fall',
			'tunnel'
		]);
		expect(
			findings.every(
				(finding) =>
					finding.fixes?.[0]?.kind === 'preview' &&
					finding.fixes?.[0]?.edit.baseRevision === testRevision
			)
		).toBe(true);
		expect(applyRuleFixes(rule, text, { language: 'no' })).toBe(
			'[Vers]\nDessverre var en nysgjerrig venn blant oss, verre etter hvert, i hvert fall ved tunnel'
		);
	});

	it('runs for Norwegian base and regional tags only', () => {
		for (const language of ['no', 'no-NB', 'NO-nn']) {
			expect(checkRule(rule, '[Vers]\nDet er desverre sant', { language })).toHaveLength(1);
		}
		for (const language of ['nb', 'nn', 'de', 'nor']) {
			expect(checkRule(rule, '[Vers]\nDet er desverre sant', { language })).toEqual([]);
		}
	});

	it('preserves simple casing', () => {
		expect(
			fixInserts(
				checkRule(rule, '[Vers]\nDESVERRE INTERRESANT', {
					language: 'no'
				})
			)
		).toEqual(['DESSVERRE', 'INTERESSANT']);
	});

	it('requires complete misspelled words', () => {
		const text = '[Vers]\nDessverre interessant superdesverre interresante';
		expect(checkRule(rule, text, { language: 'no' })).toEqual([]);
	});

	it('reports multiple matches in order and reaches a fixed point', () => {
		const text = '[Vers]\ndesverre interresant desverre';
		const findings = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, findings)).toEqual(['desverre', 'interresant', 'desverre']);
		const fixed = applyRuleFixes(rule, text, { language: 'no' });
		expect(fixed).toBe('[Vers]\ndessverre interessant dessverre');
		expect(checkRule(rule, fixed, { language: 'no' })).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Vers]\n<i>Det er desverre interresant</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'no' }))).toEqual([
			'desverre',
			'interresant'
		]);
		expect(checkRule(rule, '[Vers]\n<u>Det er desverre sant</u>', { language: 'no' })).toEqual([]);
		expect(checkRule(rule, '[Desverre]\nDessverre', { language: 'no' })).toEqual([]);
	});
});

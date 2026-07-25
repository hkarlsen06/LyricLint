import { describe, expect, it } from 'vitest';
import { spellingSpanishCommonRule as rule } from './spelling-spanish-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.spanish-common', () => {
	it('previews high-frequency Spanish word-division corrections', () => {
		const text =
			'[Verso]\nSinembargo estoy agusto através de ti enmedio, alomejor deacuerdo, apesar, porfavor';
		const findings = checkRule(rule, text, { language: 'es' });

		expect(markedText(text, findings)).toEqual([
			'Sinembargo',
			'agusto',
			'através',
			'enmedio',
			'alomejor',
			'deacuerdo',
			'apesar',
			'porfavor'
		]);
		expect(fixInserts(findings)).toEqual([
			'Sin embargo',
			'a gusto',
			'a través',
			'en medio',
			'a lo mejor',
			'de acuerdo',
			'a pesar',
			'por favor'
		]);
		expect(
			findings.every(
				(finding) =>
					finding.fixes?.[0]?.kind === 'preview' &&
					finding.fixes[0].edit.baseRevision === testRevision
			)
		).toBe(true);
	});

	it('runs only for Spanish tags and preserves casing', () => {
		for (const language of ['es', 'es-MX', 'ES_es']) {
			expect(checkRule(rule, '[Verso]\nPORFAVOR', { language })).toHaveLength(1);
		}
		expect(fixInserts(checkRule(rule, '[Verso]\nPORFAVOR', { language: 'es' }))).toEqual([
			'POR FAVOR'
		]);
		expect(checkRule(rule, '[Verse]\nporfavor', { language: 'en' })).toEqual([]);
	});

	it('requires complete words and reaches a fixed point', () => {
		expect(checkRule(rule, '[Verso]\nsin embargo por favor', { language: 'es' })).toEqual([]);
		expect(checkRule(rule, '[Verso]\nagarrafavor', { language: 'es' })).toEqual([]);
		const text = '[Verso]\nPorfavor ven, alomejor estoy deacuerdo';
		const fixed = applyRuleFixes(rule, text, { language: 'es' });
		expect(fixed).toBe('[Verso]\nPor favor ven, a lo mejor estoy de acuerdo');
		expect(checkRule(rule, fixed, { language: 'es' })).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verso]\n<i>porfavor sinembargo</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'es' }))).toEqual([
			'porfavor',
			'sinembargo'
		]);
		expect(checkRule(rule, '[Verso]\n<u>porfavor</u>', { language: 'es' })).toEqual([]);
		expect(checkRule(rule, '[Porfavor]\npor favor', { language: 'es' })).toEqual([]);
	});
});

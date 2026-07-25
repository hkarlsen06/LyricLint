import { describe, expect, it } from 'vitest';
import { grammarSpanishContractionsRule as rule } from './grammar-spanish-contractions.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('grammar.spanish-contractions', () => {
	it('previews both reviewed Spanish contractions', () => {
		const text = '[Verso]\nVoy a el parque y vengo de el mercado';
		const found = checkRule(rule, text, { language: 'es' });

		expect(markedText(text, found)).toEqual(['a el', 'de el']);
		expect(fixInserts(found)).toEqual(['al', 'del']);
		expect(found.map((finding) => finding.message)).toEqual([
			'Contract “a el” to “al” in Spanish.',
			'Contract “de el” to “del” in Spanish.'
		]);
		expect(
			found.every(
				(finding) =>
					finding.ruleId === rule.id &&
					finding.severity === 'suggestion' &&
					finding.sourceIds[0] === 'L-ES-CONTRACTIONS' &&
					finding.fixes?.[0]?.kind === 'preview' &&
					finding.fixes[0].edit.baseRevision === testRevision
			)
		).toBe(true);
		expect(found.map((finding) => finding.fixes?.[0]?.label)).toEqual([
			'Replace with al',
			'Replace with del'
		]);
	});

	it('runs for the Spanish base tag and regional variants only', () => {
		for (const language of ['es', 'es-MX', 'ES_es']) {
			expect(checkRule(rule, '[Verso]\nVoy a el parque', { language })).toHaveLength(1);
		}
		for (const language of ['en', 'fr', 'no', 'esp', 'und']) {
			expect(checkRule(rule, '[Verse]\nVoy a el parque', { language })).toEqual([]);
		}
	});

	it('reports multiple phrases from left to right after astral text', () => {
		const text = '[Verso]\n🌙 a el lado, de el cielo, a el mar';
		expect(markedText(text, checkRule(rule, text, { language: 'es' }))).toEqual([
			'a el',
			'de el',
			'a el'
		]);
		expect(applyRuleFixes(rule, text, { language: 'es' })).toBe(
			'[Verso]\n🌙 al lado, del cielo, al mar'
		);
	});

	it('matches whole lowercase phrases without changing proper names or embedded text', () => {
		for (const text of [
			'[Verso]\nVoy al parque y vuelvo del mercado',
			'[Verso]\nVengo de El Salvador',
			'[Verso]\nMiro a El Greco',
			'[Verso]\nPara el camino',
			'[Verso]\nHablo de ellos',
			'[Verso]\nVoy A el parque'
		]) {
			expect(checkRule(rule, text, { language: 'es' }), text).toEqual([]);
		}
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Verso]\n<i>Voy a el parque</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'es' }))).toEqual(['a el']);
		expect(checkRule(rule, '[Verso]\n<u>Voy a el parque</u>', { language: 'es' })).toEqual([]);
		expect(checkRule(rule, '[a el]\nVoy al parque', { language: 'es' })).toEqual([]);
	});

	it('reaches a fixed point after applying every preview', () => {
		const text = '[Verso]\nVoy a el parque y vengo de el mercado';
		const fixed = applyRuleFixes(rule, text, { language: 'es' });

		expect(fixed).toBe('[Verso]\nVoy al parque y vengo del mercado');
		expect(checkRule(rule, fixed, { language: 'es' })).toEqual([]);
	});
});

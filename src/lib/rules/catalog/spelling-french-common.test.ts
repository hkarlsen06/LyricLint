import { describe, expect, it } from 'vitest';
import { spellingFrenchCommonRule as rule } from './spelling-french-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.french-common', () => {
	it('previews frequent French spelling corrections', () => {
		const text =
			'[Couplet]\nJe crois que sa va rester comme sa: acceuil, parmis, addresse, apeller, envelope, mourrir, traditionel, interresser';
		const found = checkRule(rule, text, { language: 'fr' });

		expect(markedText(text, found)).toEqual([
			'sa va',
			'comme sa',
			'acceuil',
			'parmis',
			'addresse',
			'apeller',
			'envelope',
			'mourrir',
			'traditionel',
			'interresser'
		]);
		expect(fixInserts(found)).toEqual([
			'ça va',
			'comme ça',
			'accueil',
			'parmi',
			'adresse',
			'appeler',
			'enveloppe',
			'mourir',
			'traditionnel',
			'intéresser'
		]);
		expect(
			found.every(
				(finding) =>
					finding.ruleId === rule.id &&
					finding.severity === 'suggestion' &&
					finding.sourceIds[0] === 'L-FR-COMMON' &&
					finding.fixes?.[0]?.kind === 'preview' &&
					finding.fixes[0].edit.baseRevision === testRevision
			)
		).toBe(true);
		expect(found.map((finding) => finding.fixes?.[0]?.label)).toEqual(
			fixInserts(found).map((replacement) => `Replace with ${replacement}`)
		);
	});

	it('runs for the French base tag and regional variants only', () => {
		for (const language of ['fr', 'fr-CA', 'FR_fr']) {
			expect(checkRule(rule, '[Couplet]\nJe crois que sa va', { language })).toHaveLength(1);
		}
		for (const language of ['en', 'es', 'no', 'fra', 'und']) {
			expect(checkRule(rule, '[Verse]\nJe crois que sa va', { language })).toEqual([]);
		}
	});

	it('reports multiple phrases from left to right after astral text', () => {
		const text = '[Couplet]\n🌙 sa va, reste comme sa, puis sa va';
		expect(markedText(text, checkRule(rule, text, { language: 'fr' }))).toEqual([
			'sa va',
			'comme sa',
			'sa va'
		]);
		expect(applyRuleFixes(rule, text, { language: 'fr' })).toBe(
			'[Couplet]\n🌙 ça va, reste comme ça, puis ça va'
		);
	});

	it('matches whole reviewed forms case-insensitively and leaves valid uses alone', () => {
		expect(fixInserts(checkRule(rule, '[Couplet]\nSA VA ACCEUIL', { language: 'fr' }))).toEqual([
			'ÇA VA',
			'ACCUEIL'
		]);
		for (const text of [
			'[Couplet]\nJe crois que ça va rester comme ça',
			'[Couplet]\nReste comme Sa Majesté',
			'[Couplet]\nSa veste est ici',
			'[Couplet]\nMoussa va partir',
			'[Couplet]\nLe passage sauvage',
			'[Couplet]\nJe prends sa main'
		]) {
			expect(checkRule(rule, text, { language: 'fr' }), text).toEqual([]);
		}
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Couplet]\n<b>Je crois que sa va</b>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'fr' }))).toEqual([
			'sa va'
		]);
		expect(checkRule(rule, '[Couplet]\n<u>Je crois que sa va</u>', { language: 'fr' })).toEqual([]);
		expect(checkRule(rule, '[comme sa]\nJe reste comme ça', { language: 'fr' })).toEqual([]);
	});

	it('reaches a fixed point after applying every preview', () => {
		const text = '[Couplet]\nJe crois que sa va rester comme sa, parmis cet acceuil';
		const fixed = applyRuleFixes(rule, text, { language: 'fr' });

		expect(fixed).toBe('[Couplet]\nJe crois que ça va rester comme ça, parmi cet accueil');
		expect(checkRule(rule, fixed, { language: 'fr' })).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import { spellingGermanCommonRule as rule } from './spelling-german-common.js';
import {
	applyRuleFixes,
	checkRule,
	fixInserts,
	markedText,
	testRevision
} from '../rule-test-utils.js';

describe('spelling.german-common', () => {
	it('previews the standard spelling for common German errors', () => {
		const text =
			'[Strophe]\nDas ist garnicht nähmlich nur ein bischen, immernoch wiedermal seperat im Rythmus entgültig';
		const findings = checkRule(rule, text, { language: 'de' });

		expect(markedText(text, findings)).toEqual([
			'garnicht',
			'nähmlich',
			'bischen',
			'immernoch',
			'wiedermal',
			'seperat',
			'Rythmus',
			'entgültig'
		]);
		expect(fixInserts(findings)).toEqual([
			'gar nicht',
			'nämlich',
			'bisschen',
			'immer noch',
			'wieder mal',
			'separat',
			'Rhythmus',
			'endgültig'
		]);
		expect(
			findings.every(
				(finding) =>
					finding.fixes?.[0]?.kind === 'preview' &&
					finding.fixes?.[0]?.edit.baseRevision === testRevision
			)
		).toBe(true);
		expect(applyRuleFixes(rule, text, { language: 'de' })).toBe(
			'[Strophe]\nDas ist gar nicht nämlich nur ein bisschen, immer noch wieder mal separat im Rhythmus endgültig'
		);
	});

	it('runs for German base and regional tags only', () => {
		for (const language of ['de', 'de-DE', 'DE-at']) {
			expect(checkRule(rule, '[Strophe]\nDas ist garnicht so', { language })).toHaveLength(1);
		}
		for (const language of ['en', 'ger', 'deu', 'no']) {
			expect(checkRule(rule, '[Strophe]\nDas ist garnicht so', { language })).toEqual([]);
		}
	});

	it('preserves simple casing', () => {
		expect(
			fixInserts(
				checkRule(rule, '[Strophe]\nGARNICHT NÄHMLICH', {
					language: 'de'
				})
			)
		).toEqual(['GAR NICHT', 'NÄMLICH']);
	});

	it('requires complete misspelled words', () => {
		const text = '[Strophe]\nGar nicht nämlich ungarnicht annähmlich';
		expect(checkRule(rule, text, { language: 'de' })).toEqual([]);
	});

	it('reports multiple matches in order and reaches a fixed point', () => {
		const text = '[Strophe]\ngarnicht nähmlich garnicht';
		const findings = checkRule(rule, text, { language: 'de' });

		expect(markedText(text, findings)).toEqual(['garnicht', 'nähmlich', 'garnicht']);
		const fixed = applyRuleFixes(rule, text, { language: 'de' });
		expect(fixed).toBe('[Strophe]\ngar nicht nämlich gar nicht');
		expect(checkRule(rule, fixed, { language: 'de' })).toEqual([]);
	});

	it('reads supported markup, skips unsupported markup, and ignores headers', () => {
		const supported = '[Strophe]\n<i>Das ist garnicht nähmlich schwer</i>';
		expect(markedText(supported, checkRule(rule, supported, { language: 'de' }))).toEqual([
			'garnicht',
			'nähmlich'
		]);
		expect(checkRule(rule, '[Strophe]\n<u>Das ist garnicht so</u>', { language: 'de' })).toEqual(
			[]
		);
		expect(checkRule(rule, '[Garnicht]\nGar nicht', { language: 'de' })).toEqual([]);
	});
});

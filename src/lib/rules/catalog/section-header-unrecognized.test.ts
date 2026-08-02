import { describe, expect, it } from 'vitest';
import { checkRule, markedText } from '../rule-test-utils.js';
import { sectionHeaderUnrecognizedRule as rule } from './section-header-unrecognized.js';

describe('section.header-unrecognized', () => {
	it('marks only the custom name and quotes it in the message', () => {
		const text = '[Chor 2: Ane]\nEn natt';
		const findings = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, findings)).toEqual(['Chor']);
		expect(findings[0]).toMatchObject({
			message: 'Review the custom section header “Chor”.',
			severity: 'manual-review'
		});
		expect(findings[0]?.sourceIds.slice(0, 2)).toEqual(['G-SECTIONS', 'G-LANG-NO']);
		expect(findings[0]?.fixes).toBeUndefined();
	});

	it('accepts a quoted title header only as the first non-English section', () => {
		expect(checkRule(rule, '[Letra de “Chantaje” ft. Maluma]\nHola', { language: 'es' })).toEqual(
			[]
		);
		const text = '[Intro]\nHola\n\n[Letra de “Chantaje” ft. Maluma]\nMás';
		expect(markedText(text, checkRule(rule, text, { language: 'es' }))).toEqual([
			'Letra de “Chantaje” ft. Maluma'
		]);
	});

	it('accepts recognized, localized-preference, empty, and absent headers', () => {
		expect(checkRule(rule, '[Refreng]\nEn natt', { language: 'no' })).toEqual([]);
		expect(checkRule(rule, '[Bridge]\nEn natt', { language: 'no' })).toEqual([]);
		expect(checkRule(rule, '[]\nEn natt', { language: 'no' })).toEqual([]);
		expect(checkRule(rule, 'En natt', { language: 'no' })).toEqual([]);
	});
});

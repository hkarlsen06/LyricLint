import { describe, expect, test } from 'vitest';
import { reviewedLanguagePacks } from '#lib/languages/registry.js';
import { hasReviewedLanguageRules } from './languages.js';

describe('reviewed language rules per format', () => {
	test('Genius counts every reviewed header pack', () => {
		for (const pack of reviewedLanguagePacks)
			expect(hasReviewedLanguageRules(pack.tag, 'genius')).toBe(true);
		expect(hasReviewedLanguageRules('zz-Latn-custom', 'genius')).toBe(false);
	});

	test('Musixmatch counts only its own policy families', () => {
		expect(hasReviewedLanguageRules('nb-NO', 'musixmatch')).toBe(true);
		expect(hasReviewedLanguageRules('ko', 'musixmatch')).toBe(true);
		expect(hasReviewedLanguageRules('pt-BR', 'musixmatch')).toBe(false);
		expect(hasReviewedLanguageRules('pt-BR', 'genius')).toBe(true);
	});
});

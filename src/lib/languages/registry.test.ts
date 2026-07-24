import { describe, expect, it } from 'vitest';
import { languageSourceInventory } from './inventory.js';
import { canLintHeaderLanguage, getLanguagePack, resolveLanguageTag } from './registry.js';

describe('language packs', () => {
	it('resolves English and Norwegian regional tags to reviewed enforcing packs', () => {
		expect(resolveLanguageTag('en-US')).toBe('en');
		expect(resolveLanguageTag('no')).toBe('no');
		expect(canLintHeaderLanguage(getLanguagePack('en-GB'))).toBe(true);
		expect(canLintHeaderLanguage(getLanguagePack('no'))).toBe(true);
		expect(getLanguagePack('no').headers.flatMap((header) => header.terms)).toContain('Refreng');
	});

	it('preserves Arabic, Japanese, and unknown languages without production enforcement', () => {
		expect(getLanguagePack('ar')).toMatchObject({ policy: 'unreviewed', reviewed: false });
		expect(getLanguagePack('ja')).toMatchObject({
			policy: 'english-preferred',
			reviewed: false
		});
		expect(getLanguagePack('xx-ZZ')).toMatchObject({ tag: 'und', reviewed: false });
		expect(canLintHeaderLanguage(getLanguagePack('ja'))).toBe(false);
	});

	it('retains every exact source-inventory mapping and policy exception', () => {
		expect(languageSourceInventory).toHaveLength(63);
		expect(
			languageSourceInventory.find((entry) => entry.language === 'English')?.annotationId
		).toBe(12744609);
		expect(
			languageSourceInventory.find((entry) => entry.language === 'Norwegian')?.annotationId
		).toBe(13453292);
		expect(languageSourceInventory.find((entry) => entry.language === 'Thai')?.policy).toBe(
			'english-preferred'
		);
		expect(languageSourceInventory.find((entry) => entry.language === 'Korean')?.policy).toBe(
			'contextual'
		);
		expect(
			languageSourceInventory.find((entry) => entry.language === 'German')?.policyNote
		).toMatch(/genre/u);
	});
});

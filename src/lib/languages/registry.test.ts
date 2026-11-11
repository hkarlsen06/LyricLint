import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { languageSourceInventory } from './inventory.js';
import {
	canLintHeaderLanguage,
	getLanguagePack,
	resolveLanguageTag,
	reviewedLanguagePacks,
	reviewedPackSourceIds
} from './registry.js';

const rulesMd = readFileSync(join(__dirname, '../../../docs/rules.md'), 'utf8');

describe('language packs', () => {
	it('resolves every reviewed selector language to an enforcing pack', () => {
		expect(resolveLanguageTag('en-US')).toBe('en');
		expect(resolveLanguageTag('no')).toBe('no');
		expect(canLintHeaderLanguage(getLanguagePack('en-GB'))).toBe(true);
		for (const { tag } of reviewedLanguagePacks) {
			expect(canLintHeaderLanguage(getLanguagePack(tag)), tag).toBe(true);
			expect(getLanguagePack(tag).reviewed, tag).toBe(true);
		}
		expect(getLanguagePack('no').headers.flatMap((header) => header.terms)).toContain('Refreng');
		expect(getLanguagePack('ar').headers.flatMap((header) => header.terms)).toContain('المقطع');
		expect(getLanguagePack('de').headers.flatMap((header) => header.terms)).toContain('Strophe');
		expect(getLanguagePack('es').headers.flatMap((header) => header.terms)).toContain('Estribillo');
		expect(getLanguagePack('fr').headers.flatMap((header) => header.terms)).toContain('Couplet');
		expect(getLanguagePack('ja').headers.flatMap((header) => header.terms)).toContain('Verse');
		expect(getLanguagePack('ko').headers.flatMap((header) => header.terms)).toContain('벌스');
	});

	it('models English-preferred and contextual policies without enforcing unknown languages', () => {
		expect(getLanguagePack('ja')).toMatchObject({
			policy: 'english-preferred',
			reviewed: true
		});
		expect(getLanguagePack('de')).toMatchObject({ policy: 'contextual', reviewed: true });
		expect(getLanguagePack('ko')).toMatchObject({ policy: 'contextual', reviewed: true });
		expect(getLanguagePack('xx-ZZ')).toMatchObject({ tag: 'und', reviewed: false });
		expect(canLintHeaderLanguage(getLanguagePack('xx-ZZ'))).toBe(false);
	});

	it('registers every pack file in this directory', () => {
		const packFiles = readdirSync(__dirname)
			.filter((name) => /^[a-z]{2,3}\.ts$/.test(name))
			.map((name) => name.slice(0, -'.ts'.length));
		expect(packFiles.sort()).toEqual(reviewedLanguagePacks.map((pack) => pack.tag).sort());
	});

	it("gives every reviewed pack's inventory entry the pack's policy", () => {
		for (const pack of reviewedLanguagePacks) {
			const entry = languageSourceInventory.find((candidate) => candidate.tag === pack.tag);
			expect(entry?.policy, pack.tag).toBe(pack.policy);
		}
	});

	it('lists every reviewed pack source in the docs/rules.md source table', () => {
		const missing = reviewedPackSourceIds.filter((id) => !rulesMd.includes(`\n| \`${id}\` |`));
		expect(missing).toEqual([]);
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

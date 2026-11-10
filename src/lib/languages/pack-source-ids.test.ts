import { describe, expect, it } from 'vitest';
import { sectionDeprecatedHookRule } from '#lib/rules/catalog/section-deprecated-hook.js';
import { sectionHeaderLanguageRule } from '#lib/rules/catalog/section-header-language.js';
import { sectionHeaderUnrecognizedRule } from '#lib/rules/catalog/section-header-unrecognized.js';
import { currentRuleSet } from '#lib/rules/data/rule-set.js';
import { reviewedPackSourceIds } from './registry.js';

// Temporary: proves the hand-written lists equal the derived one before they are replaced.
describe('reviewed pack source ids', () => {
	it('matches section.header-language', () => {
		expect(sectionHeaderLanguageRule.sourceIds).toEqual(['G-SECTIONS', ...reviewedPackSourceIds]);
	});

	it('matches section.header-unrecognized', () => {
		expect(sectionHeaderUnrecognizedRule.sourceIds).toEqual([
			'G-SECTIONS',
			...reviewedPackSourceIds,
			'G-NON-ENGLISH'
		]);
	});

	it('matches section.deprecated-hook', () => {
		expect(sectionDeprecatedHookRule.sourceIds).toEqual([
			'G-SECTION-HOOK',
			...reviewedPackSourceIds
		]);
	});

	it('matches the run in the rule-set manifest', () => {
		const start = currentRuleSet.sourceIds.indexOf('G-LANG-EN');
		expect(currentRuleSet.sourceIds.slice(start, start + reviewedPackSourceIds.length)).toEqual(
			reviewedPackSourceIds
		);
		expect(
			currentRuleSet.sourceIds.filter((id) => /^G-LANG-(?!HEADERS$|PURPOSE$)/u.test(id))
		).toEqual(reviewedPackSourceIds);
	});
});

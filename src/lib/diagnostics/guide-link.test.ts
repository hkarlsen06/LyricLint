import { describe, expect, it } from 'vitest';
import { ruleReferences } from '#lib/rules/reference.js';
import { harperRuleIds } from '#lib/rules/harper-ids.js';
import { currentRuleSet } from '#lib/rules/data/rule-set.js';
import { diagnosticGuideSlug } from './guide-link.js';

describe('diagnostic guide destinations', () => {
	it('matches every published native check and no extra manifest entry', () => {
		const published = ruleReferences();
		for (const rule of published) {
			expect(diagnosticGuideSlug(rule.id)).toBe(rule.slug);
		}
		expect(
			currentRuleSet.ruleIds.filter((id) => diagnosticGuideSlug(id) !== undefined).sort()
		).toEqual(published.map((rule) => rule.id).sort());
	});

	it('does not fabricate pages for Harper or unknown rules', () => {
		for (const id of [...harperRuleIds, 'future.native', 'constructor', 'toString']) {
			expect(diagnosticGuideSlug(id)).toBeUndefined();
		}
	});
});

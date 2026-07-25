import { describe, expect, it } from 'vitest';
import { policyCases } from './catalog/policy-cases.js';
import { sourceRegistry } from './data/sources.js';
import {
	groupedRuleReferences,
	ruleFromSlug,
	ruleReferenceFromSlug,
	ruleReferences,
	ruleSlug
} from './reference.js';
import { enabledRules } from './registry.js';

describe('rule reference derivation', () => {
	it('derives a page for every enabled rule from its policy case', () => {
		// `ruleReferences` throws for a rule with no policy case or whose invalid
		// example produces no diagnostic, so a new rule cannot ship without a
		// reference page — this assertion is what turns that contract into CI.
		const references = ruleReferences();
		expect(references.map((reference) => reference.id)).toEqual(
			enabledRules.map((rule) => rule.id)
		);
		for (const reference of references) {
			expect(reference.message.length, reference.id).toBeGreaterThan(0);
			expect(reference.explanation.length, reference.id).toBeGreaterThan(0);
			expect(reference.groupTitle.length, reference.id).toBeGreaterThan(0);
			expect(reference.language.length, reference.id).toBeGreaterThan(0);
			expect(reference.sources.length, reference.id).toBeGreaterThan(0);
		}
	});

	it('has no policy case for a rule that is not enabled', () => {
		const enabledIds = new Set(enabledRules.map((rule) => rule.id));
		expect(policyCases.filter((policy) => !enabledIds.has(policy.id))).toEqual([]);
	});

	it('gives every rule a unique slug that round-trips to its ID', () => {
		const slugs = enabledRules.map((rule) => ruleSlug(rule.id));
		expect(new Set(slugs).size).toBe(enabledRules.length);
		for (const rule of enabledRules) {
			expect(ruleFromSlug(ruleSlug(rule.id))).toBe(rule.id);
			expect(ruleReferenceFromSlug(ruleSlug(rule.id))?.id).toBe(rule.id);
		}
		// Dots are what the slug exists to remove: a dot in a static-adapter path
		// segment writes a file whose "extension" is half the rule ID.
		for (const slug of slugs) {
			expect(slug).not.toContain('.');
		}
	});

	it('resolves every enabled rule source ID in the source registry', () => {
		for (const rule of enabledRules) {
			for (const sourceId of rule.sourceIds) {
				expect(sourceRegistry.get(sourceId)?.id, `${rule.id} → ${sourceId}`).toBe(sourceId);
			}
		}
	});

	it('keeps meta descriptions within what result pages display', () => {
		for (const reference of ruleReferences()) {
			expect(reference.seoDescription.length, reference.id).toBeLessThanOrEqual(155);
			expect(reference.seoDescription.length, reference.id).toBeGreaterThanOrEqual(90);
		}
	});

	it('groups the index contiguously with every rule in exactly one group', () => {
		const groups = groupedRuleReferences();
		const flattened = groups.flatMap((group) => group.rules.map((reference) => reference.id));
		expect(new Set(flattened).size).toBe(enabledRules.length);
		expect(new Set(groups.map((group) => group.title)).size).toBe(groups.length);
	});
});

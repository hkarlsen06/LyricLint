import { describe, expect, it } from 'vitest';
import { harperRuleIds } from '../harper.js';
import { enabledRules } from '../registry.js';
import { currentRuleSet } from './rule-set.js';
import { sourceRegistry } from './sources.js';

// The manifest is a hand-written record of what a version of the rule set
// shipped, and for a while it was wrong: `performer.parenthetical-boundary` was
// enabled in the registry and absent here, so the two counts the product states
// — the landing page's, off the registry, and the tools panel's, off this list —
// disagreed by one more than the three Harper IDs that explain the rest. Nothing
// failed, because nothing compared them. These do.
describe('current rule-set manifest', () => {
	const enabledIds = enabledRules.map((rule) => rule.id);

	it('lists every enabled rule', () => {
		const listed = new Set(currentRuleSet.ruleIds);
		expect(enabledIds.filter((id) => !listed.has(id))).toEqual([]);
	});

	it('lists nothing but the enabled rules and Harper', () => {
		// Harper's three are the one set with no catalog entry and no reference
		// page. Anything else here is a rule that was renamed or removed and left
		// behind, which reads as a rule the workbench runs and does not.
		const known = new Set<string>([...enabledIds, ...harperRuleIds]);
		expect(currentRuleSet.ruleIds.filter((id) => !known.has(id))).toEqual([]);
	});

	it('lists Harper under all three of the IDs its findings arrive as', () => {
		const listed = new Set(currentRuleSet.ruleIds);
		expect(harperRuleIds.filter((id) => !listed.has(id))).toEqual([]);
	});

	it('names every rule once', () => {
		expect(new Set(currentRuleSet.ruleIds).size).toBe(currentRuleSet.ruleIds.length);
		expect(new Set(currentRuleSet.sourceIds).size).toBe(currentRuleSet.sourceIds.length);
	});

	it('cites every source an enabled rule cites', () => {
		const listed = new Set(currentRuleSet.sourceIds);
		const missing = enabledRules.flatMap((rule) =>
			rule.sourceIds.filter((id) => !listed.has(id)).map((id) => `${rule.id} → ${id}`)
		);
		expect(missing).toEqual([]);
	});

	it('resolves every source it names in the reviewed registry', () => {
		for (const id of currentRuleSet.sourceIds) {
			expect(sourceRegistry.get(id)?.reviewStatus, id).toBe('reviewed');
		}
	});
});

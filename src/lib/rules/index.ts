import type { RuleDefinition } from '$lib/core/types.js';
import { enabledRules } from './registry.js';

/** Return the reviewed rule definitions enabled in the bundled rule set. */
export function getEnabledRules(): RuleDefinition[] {
	return [...enabledRules];
}

export { collectSafeFixes, filterIgnored, runRules, sortDiagnostics } from './engine.js';
export type { BulkFixPlan } from './bulk-fix.js';
export { collectMatchingFixes, fixBatchKey, mergeFixes, planBulkFix } from './bulk-fix.js';
export { enabledRules, getRule, validateRuleRegistry } from './registry.js';
export { currentRuleSet, previousKnownGoodRuleSet } from './data/rule-set.js';
export { assertReviewedSources, getSource, sourceRegistry } from './data/sources.js';

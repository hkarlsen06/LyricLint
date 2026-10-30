import { currentRuleSet } from '#lib/rules/data/rule-set.js';
import { isHarperRuleId } from '#lib/rules/harper-ids.js';
import { ruleSlug } from '#lib/rules/reference-search.js';

// The shipped manifest is lightweight metadata, not the executable registry.
const nativeRuleIds = new Set(currentRuleSet.ruleIds.filter((id) => !isHarperRuleId(id)));

/** Only native checks have published guide pages. Unknown findings get no link. */
export function diagnosticGuideSlug(ruleId: string): string | undefined {
	return nativeRuleIds.has(ruleId) ? ruleSlug(ruleId) : undefined;
}

import { currentRuleSet } from '$lib/rules/data/rule-set.js';

/** Rendering must reject an unavailable pinned policy rather than silently upgrade it. */
export const profilePolicyVersions = {
	genius: currentRuleSet.version,
	musixmatch: '2026.09.16.1'
} as const;

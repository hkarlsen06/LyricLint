/**
 * The per-topic "checked by the linter" lookups, derived from the rule
 * reference at prerender time. A `.server` module because `reference.ts` is
 * server-only by design (deriving it in a browser throws) and must never ride
 * into a documentation page's bundle — both guidelines loads read this instead
 * of each holding the derivation.
 */
import { groupedRuleReferences } from '$lib/rules/reference.js';
import { guidanceTopicRuleGroups, type GuidanceTopic } from './guidance.js';
import type { GuidanceLinterRule } from './guidance-search.js';

export function guidanceTopicLinterRules(topic: GuidanceTopic): GuidanceLinterRule[] {
	const families = new Set<string>(guidanceTopicRuleGroups[topic]);
	return groupedRuleReferences()
		.filter((group) => families.has(group.group))
		.flatMap((group) =>
			group.rules.map((rule) => ({
				id: rule.id,
				title: rule.title,
				message: rule.message,
				slug: rule.slug
			}))
		);
}

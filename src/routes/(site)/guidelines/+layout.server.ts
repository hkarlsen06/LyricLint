import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import { guidanceRuleTerms } from '$lib/guidance/lookups.server.js';
import type { GuidanceTopicSection } from '$lib/guidance/guidance-search.js';
import type { LayoutServerLoad } from './$types.js';

/**
 * The index column's sections, loaded for the whole section: every topic's
 * guidance entries and landmarks (plain data the pages could import
 * themselves), plus the search terms of the linter rules those entries name —
 * which are derived from the rule reference, a server-only module, and
 * therefore have to arrive through a load. It lives on the layout because the
 * list does: `GuidanceIndex` is mounted once beside whichever page is open,
 * exactly as the rule reference's index is.
 */
export const load: LayoutServerLoad = () => ({
	sections: guidanceTopics().map(({ topic, entries }): GuidanceTopicSection => {
		const landmarks = guidanceTopicLandmarks[topic] ?? [];
		return {
			topic,
			entries,
			landmarks,
			ruleTerms: guidanceRuleTerms([
				...entries.flatMap((entry) => entry.relatedRuleIds ?? []),
				...landmarks.flatMap((landmark) => landmark.relatedRuleIds ?? [])
			])
		};
	})
});

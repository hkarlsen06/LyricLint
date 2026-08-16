import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import { guidanceTopicLinterRules } from '$lib/guidance/lookups.server.js';
import type { GuidanceTopicSection } from '$lib/guidance/guidance-search.js';
import type { LayoutServerLoad } from './$types.js';

/**
 * The index column's sections, loaded for the whole section: every topic's
 * guidance entries (plain data the pages could import themselves) and the
 * linter's own rules for the topic — which are derived from the rule
 * reference, a server-only module, and therefore have to arrive through a
 * load. It lives on the layout because the list does: `GuidanceIndex` is
 * mounted once beside whichever page is open, exactly as the rule reference's
 * index is.
 */
export const load: LayoutServerLoad = () => ({
	sections: guidanceTopics().map(({ topic, entries }): GuidanceTopicSection => ({
		topic,
		entries,
		landmarks: guidanceTopicLandmarks[topic] ?? [],
		linterRules: guidanceTopicLinterRules(topic)
	}))
});

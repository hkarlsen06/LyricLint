import { referenceCorpus } from '$lib/reference/corpus.server.js';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import { countGuidanceLookups } from '$lib/guidance/guidance-search.js';
import type { LayoutServerLoad } from './$types.js';
import { musixmatchReferenceCorpus } from '$lib/profiles/reference.server.js';

// Server-derived once for the unified guide. The browser never imports the rule engine.
export const load: LayoutServerLoad = () => {
	const sections = guidanceTopics().map(({ topic, entries }) => ({
		topic,
		entries,
		landmarks: guidanceTopicLandmarks[topic] ?? []
	}));
	return {
		referenceCorpus: referenceCorpus(),
		musixmatchCorpus: musixmatchReferenceCorpus(),
		guidanceCount: countGuidanceLookups(sections),
		guidanceTopics: sections.map(({ topic }) => topic)
	};
};

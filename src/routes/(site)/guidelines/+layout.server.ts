import { referenceCorpus } from '$lib/reference/corpus.server.js';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import type { LayoutServerLoad } from './$types.js';

// Server-derived once for the unified guide. The browser never imports the rule engine.
export const load: LayoutServerLoad = () => ({
	referenceCorpus: referenceCorpus(),
	sections: guidanceTopics().map(({ topic, entries }) => ({
		topic,
		entries,
		landmarks: guidanceTopicLandmarks[topic] ?? []
	}))
});

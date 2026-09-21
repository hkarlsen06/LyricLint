import { referenceCorpus } from '$lib/reference/corpus.server.js';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicLandmarks } from '$lib/guidance/guidance.js';
import { countGuidanceLookups } from '$lib/guidance/guidance-search.js';
import { referenceTopics } from '$lib/reference/topics.js';
import { topicChecks } from '$lib/reference/topic-checks.server.js';
import { ruleLookupTable } from '$lib/rules/lookup-tables.js';
import type { LayoutServerLoad } from './$types.js';

// Server-derived once for the unified guide. The browser never imports the rule engine.
export const load: LayoutServerLoad = () => {
	const sections = guidanceTopics().map(({ topic, entries }) => ({
		topic,
		entries,
		landmarks: guidanceTopicLandmarks[topic] ?? []
	}));
	return {
		sections: guidanceTopics()
			.sort(
				(a, b) =>
					referenceTopics.findIndex((topic) => topic.id === a.topic) -
					referenceTopics.findIndex((topic) => topic.id === b.topic)
			)
			.map(({ topic }) => ({ topic, ...topicChecks(topic) })),
		spellings: ruleLookupTable('spelling.standardized'),
		referenceCorpus: referenceCorpus(),
		guidanceCount: countGuidanceLookups(sections),
		guidanceTopics: sections.map(({ topic }) => topic)
	};
};

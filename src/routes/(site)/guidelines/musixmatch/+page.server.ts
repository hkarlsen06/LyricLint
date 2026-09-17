import { profileGuidelines } from '$lib/profiles/coverage.js';
import { profileGuidelineTopic } from '$lib/profiles/reference-topics.js';
import { referenceTopics } from '$lib/reference/topics.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = () => {
	const topics = referenceTopics
		.map((topic) => ({
			...topic,
			count: profileGuidelines.filter((entry) => profileGuidelineTopic(entry) === topic.id).length
		}))
		.filter((topic) => topic.count > 0);
	return {
		topics,
		claimCount: profileGuidelines.length,
		conflictCount: profileGuidelines.filter((entry) => entry.handling === 'source-conflict').length
	};
};

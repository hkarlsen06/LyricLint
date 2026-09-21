import { error } from '@sveltejs/kit';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicTitles } from '$lib/guidance/guidance.js';
import type { EntryGenerator, PageServerLoad } from './$types.js';

// adapter-static only writes the pages it is told about, so the entries come
// from the catalog, not from crawling, the same rule as `/guidelines/checks/[rule]`. Only
// topics that actually have entries get a page; a title in
// `guidanceTopicTitles` with nothing under it yet is not a destination.
export const entries: EntryGenerator = () => guidanceTopics().map(({ topic }) => ({ topic }));

function isPublishedTopic(topic: string): topic is keyof typeof guidanceTopicTitles {
	return guidanceTopics().some((published) => published.topic === topic);
}

export const load: PageServerLoad = ({ params }) => {
	if (!isPublishedTopic(params.topic)) {
		error(404, `No guidelines are published at "${params.topic}".`);
	}
	return { topic: params.topic };
};

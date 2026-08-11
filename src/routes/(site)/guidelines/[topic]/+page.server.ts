import { error } from '@sveltejs/kit';
import { guidanceTopics } from '$lib/guidance/entries.js';
import { guidanceTopicTitles } from '$lib/guidance/guidance.js';
import type { EntryGenerator, PageServerLoad } from './$types.js';

// adapter-static only writes the pages it is told about, so the entries come
// from the catalog, not from crawling — the same rule as `/rules/[rule]`. Only
// topics that actually have entries get a page; a title in
// `guidanceTopicTitles` with nothing under it yet is not a destination.
export const entries: EntryGenerator = () => guidanceTopics().map(({ topic }) => ({ topic }));

/**
 * The guidance catalog itself is plain data the page imports directly, and the
 * topic's linter lookups ride the section layout's own load — so the one job
 * left here is refusing a slug that names no topic, which the static host
 * answers on its own in production and nothing answers in development.
 */
export const load: PageServerLoad = ({ params }) => {
	const known = guidanceTopics().some(({ topic }) => topic === params.topic);
	if (!known) {
		error(404, `No guidelines are published at "${params.topic}".`);
	}
	return { topic: params.topic as keyof typeof guidanceTopicTitles };
};

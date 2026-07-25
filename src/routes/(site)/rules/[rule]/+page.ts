import { error } from '@sveltejs/kit';
import { ruleReferenceFromSlug, ruleReferences } from '$lib/rules/reference.js';
import type { EntryGenerator, PageLoad } from './$types.js';

// adapter-static only writes the pages it is told about, and nothing links to
// every rule from prerendered HTML the crawler is guaranteed to walk before
// this route — so the entries come from the registry, not from crawling.
export const entries: EntryGenerator = () =>
	ruleReferences().map((reference) => ({ rule: reference.slug }));

export const load: PageLoad = ({ params }) => {
	const reference = ruleReferenceFromSlug(params.rule);
	if (!reference) {
		error(404, `No rule is published at "${params.rule}".`);
	}
	return { reference };
};

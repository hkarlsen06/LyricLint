import { error } from '@sveltejs/kit';
import { ruleLookupTable } from '$lib/rules/lookup-tables.js';
import { ruleReferences, ruleReferenceFromSlug } from '$lib/rules/reference.js';
import type { EntryGenerator, PageServerLoad } from './$types.js';

export const entries: EntryGenerator = () =>
	[...ruleReferences(), ...ruleReferences('musixmatch')].map((reference) => ({
		rule: reference.slug
	}));

// Derive on the server and load only the requested check and its optional table.
// The unified guide's parent does not carry the full rule reference collection.
export const load: PageServerLoad = ({ params }) => {
	const reference = ruleReferenceFromSlug(params.rule);
	if (!reference) error(404, `No check is published at "${params.rule}".`);
	return { reference, lookup: ruleLookupTable(reference.id) };
};

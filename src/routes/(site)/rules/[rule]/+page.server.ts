import { error } from '@sveltejs/kit';
import { ruleLookupTable } from '$lib/rules/lookup-tables.js';
import { ruleFromSlug, ruleReferences } from '$lib/rules/reference.js';
import type { EntryGenerator, PageServerLoad } from './$types.js';

// adapter-static only writes the pages it is told about, and nothing links to
// every rule from prerendered HTML the crawler is guaranteed to walk before
// this route — so the entries come from the registry, not from crawling.
export const entries: EntryGenerator = () =>
	ruleReferences().map((reference) => ({ rule: reference.slug }));

/**
 * A server module rather than the universal `+page.ts` this replaces, for the
 * reason `+layout.server.ts` gives at length: a universal load is shipped to
 * the browser and runs there on a client-side navigation, so importing the
 * reference from one puts the whole rules engine back in a documentation
 * page's bundle — and re-runs a derivation that cannot succeed there.
 *
 * It returns almost nothing. The rule this page is about is already in the
 * layout's data, and returning it again would copy the entire index into all
 * fifty-five prerendered payloads. What is left to do here is refuse a slug that
 * names no rule — which the static host answers on its own in production and
 * nothing answers in development — and hand over this rule's lookup table.
 *
 * **The table is loaded here rather than put on `RuleReference` precisely
 * because of the copying above.** Only seven rules have one, and the full set is
 * 17.8% of the layout payload against the 2.5% its search terms cost; carried on
 * the reference it would ride into all fifty-five payloads so that seven pages
 * could draw it. `lookupTerms` is the part every page genuinely needs, because
 * the index's search is mounted by the layout.
 */
export const load: PageServerLoad = async ({ params, parent }) => {
	const { groups } = await parent();
	const known = groups.some((group) => group.rules.some((rule) => rule.slug === params.rule));
	if (!known) {
		error(404, `No rule is published at "${params.rule}".`);
	}
	const id = ruleFromSlug(params.rule);
	return { lookup: id ? ruleLookupTable(id) : undefined };
};

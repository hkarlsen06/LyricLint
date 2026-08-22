/**
 * Search terms for the linter rules the guidance entries name, derived from
 * the rule reference at prerender time. A `.server` module because
 * `reference.ts` is server-only by design (deriving it in a browser throws)
 * and must never ride into a documentation page's bundle — the guidelines
 * layout load reads this instead of holding the derivation.
 *
 * This is what keeps the guidance finder answering symptom queries now that
 * the index draws no rule rows of its own: an entry's haystack folds in each
 * named rule's reader-facing title and, for a table-shaped rule, every form
 * in its table, so `woah` still lands on the spelling topic and "question
 * mark" on the unmarked-question entry.
 */
import { ruleReferences } from '$lib/rules/reference.js';

let termsById: Map<string, string> | undefined;

/** Searchable terms per rule id, as the guidance sections carry them. */
export interface GuidanceRuleTerms {
	[ruleId: string]: string;
}

/** The searchable terms for these rules, keyed by id; unknown ids drop out. */
export function guidanceRuleTerms(ruleIds: Iterable<string>): GuidanceRuleTerms {
	if (!termsById) {
		termsById = new Map(
			ruleReferences().map((rule) => [
				rule.id,
				[rule.title, rule.lookupTerms ?? ''].filter(Boolean).join('\n')
			])
		);
	}
	const terms: GuidanceRuleTerms = {};
	for (const ruleId of ruleIds) {
		const entry = termsById.get(ruleId);
		if (entry !== undefined) {
			terms[ruleId] = entry;
		}
	}
	return terms;
}

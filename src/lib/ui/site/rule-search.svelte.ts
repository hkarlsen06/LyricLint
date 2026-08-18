import { searchTokens } from '$lib/rules/reference-search.js';

/**
 * What the reference is being searched for, held for the whole document rather
 * than by the list that takes it.
 *
 * The query was `RuleIndex`'s own state for as long as the list was the only
 * thing that needed it, and the section's layout mounting that component once
 * was what carried it across opening a rule. That stops working the moment the
 * *rule* has to know as well: the page and the list are siblings under the
 * layout, so there is nothing for one to hand the other. A rule opened out of a
 * search marks what was searched for, and that is a fact about the reader's
 * session rather than about either column.
 *
 * Module state rather than context, like every other cross-surface answer in
 * `ui/state/`. What it costs is that the query now outlives leaving the section
 * altogether — search, read the landing page, come back, and the list is still
 * narrowed. That is the right end of the trade rather than an oversight: the
 * field is showing the query, the readout under it says `3 of 60 rules` with
 * `Clear filters` beside it, so nothing about the state is hidden from the
 * person who is in it. A filter is a way of looking at the list, which does not
 * stop being true because the reader looked at something else in between.
 */
let query = $state('');

export function ruleSearchQuery(): string {
	return query;
}

export function setRuleSearchQuery(value: string): void {
	query = value;
}

/**
 * The query as the terms every surface matches on, derived once rather than
 * re-split per string.
 *
 * The rule page marks a dozen or more strings and the index matches 60 rules,
 * and both of them ask this on every keystroke. `searchTokens` folds, which is
 * three passes over the query, so the alternative is that work repeated a
 * hundred times for a value that changed once.
 */
const tokens = $derived(searchTokens(query));

export function ruleSearchTokens(): readonly string[] {
	return tokens;
}

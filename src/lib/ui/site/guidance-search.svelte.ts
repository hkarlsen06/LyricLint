import { searchTokens } from '$lib/rules/reference-search.js';

/**
 * What the guidance catalog is being searched for, held for the whole document
 * rather than by the list that takes it — `rule-search.svelte.ts` for the
 * guidance section, and it exists for that module's exact reason: the topic
 * page marks what was searched for, and the page and the list are siblings
 * under the section's layout, so there is nothing for one to hand the other.
 *
 * It is a second module rather than a shared one because the two sections are
 * searched for different things: a reader narrowing the rules to `apostrophe`
 * has said nothing about the guidelines, and one query silently narrowing both
 * lists would be a filter applied where nobody typed it.
 *
 * What module state costs — the query outliving the section — is the trade
 * `rule-search.svelte.ts` already weighs: nothing about the state is hidden,
 * because the field shows it and the readout under it counts what is left.
 */
let query = $state('');

export function guidanceSearchQuery(): string {
	return query;
}

export function setGuidanceSearchQuery(value: string): void {
	query = value;
}

/**
 * The query as the terms every surface matches on, derived once rather than
 * re-split per string — the topic page marks half a dozen strings per entry,
 * and all of them ask this on every keystroke.
 */
const tokens = $derived(searchTokens(query));

export function guidanceSearchTokens(): readonly string[] {
	return tokens;
}

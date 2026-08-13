/**
 * Which guidance entry the reader is currently on in the topic page.
 *
 * The same arrangement as `guidance-search.svelte.ts` and `rule-hover.svelte.ts`,
 * for the same reason: the topic page and the index are sibling columns under
 * the section's layout, so there is nothing for one to hand the other. The page
 * writes here as it is scrolled, and the index answers by marking that entry's
 * row and keeping it in the column.
 *
 * A topic page is a column of conventions rather than one document, which is
 * what makes this worth having: `aria-current` used to be the *hash* — where
 * the reader was sent — so it went stale the moment they scrolled off that
 * entry, and a topic opened without a fragment marked no row at all. A list
 * beside a page it does not follow is a list that has stopped answering "where
 * am I".
 *
 * The page clears it when it is destroyed, exactly as the rule guide clears its
 * hover: the index outlives any one topic, so a stale anchor would leave a row
 * marked in a list whose page has gone.
 */
let anchor = $state('');

export function readingAnchor(): string {
	return anchor;
}

export function setReadingAnchor(value: string): void {
	anchor = value;
}

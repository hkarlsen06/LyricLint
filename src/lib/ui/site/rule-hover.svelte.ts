/**
 * Which rule the reader's pointer is resting on in the guide column.
 *
 * The same arrangement as `rule-search.svelte.ts`, for the same reason: the
 * guide and the index are sibling columns under the section's layout, so there
 * is nothing for one to hand the other. The guide's check links write here on
 * hover and on focus, and the index answers by marking that rule's row and
 * bringing it into the column — the run and the list are the same rules in two
 * shapes, and the hover is the reader asking which row a check is.
 *
 * The guide page clears it when it is destroyed: pressing a check navigates
 * while the pointer is still on it, and a destroyed link fires no
 * `pointerleave`, so without that a row in the index stayed lit as though a
 * pointer nobody was holding were resting on it.
 */
let slug = $state<string | undefined>();

export function hoveredRuleSlug(): string | undefined {
	return slug;
}

export function setHoveredRuleSlug(value: string | undefined): void {
	slug = value;
}

import { tick } from 'svelte';

/**
 * Bring an index column's selected row into view, for a reader who did not
 * press it there. Shared by both index columns — the rule reference's and the
 * guidance catalog's — because the arithmetic is about the column, not about
 * what its rows list.
 *
 * A detail page is a URL, so most arrivals are not presses on its list: a
 * shared link, a search result, a reload, a link from elsewhere on the site.
 * The row is marked `aria-current` and drawn recessed the whole time, which is
 * the whole of the "you are here" — and forty rows above the fold it says that
 * to nobody. The column then reads as a list with nothing selected in it,
 * beside a page that came from one of its rows.
 *
 * Two things it owes, and the second is why this is arithmetic rather than
 * `scrollIntoView`:
 *
 * - **A row already wholly in view is not moved.** The section layout only
 *   calls this for an arrival, and this is the second half of the same
 *   guarantee — the rule that pressing a row may not move the list the row is
 *   in.
 * - **The finder is pinned over the top of the column**, so a row the browser
 *   would call visible can be entirely underneath it. `block: 'nearest'` knows
 *   nothing about that and would leave the row covered; the free space starts
 *   at the finder's own bottom edge, and it is measured rather than restated
 *   here, because the chips wrap and the readout comes and goes.
 *
 * It moves the scroll and not the focus. The reader opened a page to read it,
 * and focus parked in a `<nav>` of dozens of links would send their first Tab
 * away from the document they came for — the same reason the workbench leaves
 * the editor unfocused after a fix.
 */
export async function revealSelectedRow(column: HTMLElement | undefined): Promise<void> {
	await tick();
	const row = column?.querySelector<HTMLElement>('a[aria-current="page"]');
	// No row at all under a filter that excludes it, and no box below 62rem,
	// where the columns stack and the list is `display: none` while a page is
	// open. Neither is a failure: there is nothing on screen to bring into view.
	if (!column || !row || row.offsetParent === null) return;

	const port = column.getBoundingClientRect();
	const finder = column.querySelector<HTMLElement>('.site-finder');
	const free = port.top + (finder?.getBoundingClientRect().height ?? 0);
	const rect = row.getBoundingClientRect();
	if (rect.top >= free && rect.bottom <= port.bottom) return;
	// Instant, and clamped by the scroller itself at both ends. A smooth scroll
	// here would still be animating while the reader started reading.
	column.scrollTop += rect.top - free;
}

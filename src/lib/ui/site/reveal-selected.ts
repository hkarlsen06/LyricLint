import { tick } from 'svelte';
import { prefersReducedMotion } from '$lib/interaction/motion.js';

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
	revealRow(column, column?.querySelector<HTMLElement>('a[aria-current="page"]'));
}

/**
 * The arithmetic on its own, for a caller that already knows which row — the
 * rule reference's guide column asks for the row its hovered check names.
 */
export function revealRow(
	column: HTMLElement | undefined,
	row: HTMLElement | null | undefined
): void {
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

/**
 * Keep the row the reader is currently on inside the column, for a list that
 * follows a page being *read* rather than one being opened. The guidance
 * catalog's index is the caller: a topic page is a column of conventions, and
 * this is what keeps the list beside it answering "where am I".
 *
 * Three things separate it from `revealRow` above, and each is the difference
 * between arriving somewhere and staying with somebody:
 *
 * - **It nudges to the nearest edge rather than aligning to the top.** An
 *   arrival has no previous position to respect, so putting the row under the
 *   finder is as good an answer as any. A follow does: the reader is looking at
 *   this column, and hauling a row that had merely slipped past the bottom all
 *   the way up to the top moves every other row under their eye for a
 *   correction of a few pixels.
 * - **It keeps a row's worth of breath at whichever edge it lands against**, so
 *   the marked row arrives *inside* the list with its neighbours around it
 *   rather than flush against the finder or half off the bottom, which reads as
 *   a row on its way out. The breath is bounded by a quarter of the free
 *   height, or in a short column the two edges cross and the row is pushed back
 *   and forth between them forever.
 * - **It is smooth, where every other scroll in this section is instant.** The
 *   instant ones are jumps somebody asked for; this one is a list travelling
 *   with a page nobody pressed anything to move, and a jump there reads as the
 *   column flinching. Under `prefers-reduced-motion` it is instant, like every
 *   other animation here.
 */
export async function followSelectedRow(column: HTMLElement | undefined): Promise<void> {
	await tick();
	const row = column?.querySelector<HTMLElement>('a[aria-current="page"]');
	// No box at all below 62rem, where the columns stack and the list is
	// `display: none` while a page is open — so the follow costs the layout that
	// has no list to follow with exactly nothing, and needs no gate of its own.
	if (!column || !row || row.offsetParent === null) return;

	const port = column.getBoundingClientRect();
	const finder = column.querySelector<HTMLElement>('.site-finder');
	const top = port.top + (finder?.getBoundingClientRect().height ?? 0);
	const rect = row.getBoundingClientRect();
	const breath = Math.min(rect.height, Math.max(0, (port.bottom - top) / 4));

	let delta = 0;
	if (rect.top < top + breath) delta = rect.top - (top + breath);
	else if (rect.bottom > port.bottom - breath) delta = rect.bottom - (port.bottom - breath);
	if (delta === 0) return;

	const to = column.scrollTop + delta;
	if (prefersReducedMotion()) {
		column.scrollTop = to;
		return;
	}
	column.scrollTo({ top: to, behavior: 'smooth' });
}

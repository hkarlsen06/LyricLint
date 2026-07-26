import type { ScreenRect } from '../contracts.js';

/** Gap between the anchored range and the card hanging off it. */
const GAP = 6;
/** How close to a viewport edge the card may come. */
const EDGE = 8;

/**
 * The inline style for a `position: fixed` card anchored to a document range.
 *
 * A card that only ever hangs *below* its anchor runs off the bottom of the
 * window as soon as the anchored line is near it — which is most of the time in
 * an editor people scroll to the end of. So the side is chosen from whichever
 * has more room, and the space on that side is published as `--ll-anchor-space`
 * for the card's own `max-height` to fold into its cap.
 *
 * The horizontal clamp is left to CSS: the card's width is `--ll-card-width` on
 * the card itself, so `clamp()` can subtract it without this ever having to
 * guess at the root font size a `rem` width resolves against.
 */
export function anchoredPosition(anchor: ScreenRect): string {
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
	const below = viewportHeight - anchor.bottom - GAP - EDGE;
	const above = anchor.top - GAP - EDGE;
	const left = `left: clamp(${EDGE}px, ${anchor.left}px, max(${EDGE}px, 100vw - var(--ll-card-width) - ${EDGE}px));`;
	const vertical =
		below >= above
			? `top: ${Math.max(EDGE, anchor.bottom + GAP)}px;`
			: `bottom: ${Math.max(EDGE, viewportHeight - anchor.top + GAP)}px;`;
	return `${left} ${vertical} --ll-anchor-space: ${Math.max(0, Math.max(below, above))}px;`;
}

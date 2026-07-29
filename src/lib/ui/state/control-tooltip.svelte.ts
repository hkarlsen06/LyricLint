import type { Attachment } from 'svelte/attachments';

/** What a control is, and the keystroke that does the same thing. */
export interface ControlHint {
	label: string;
	/**
	 * The keystroke, already written the way it is pressed on this platform.
	 * Omitted where the control has none — the box then carries the label alone.
	 */
	shortcut?: string;
}

interface ShownHint extends ControlHint {
	/** Inline `top`/`bottom` and `left`/`right`, resolved against the viewport. */
	position: string;
}

/**
 * One hint on screen at a time, for the whole application.
 *
 * Held here rather than per control, because hover and focus are separate: a
 * pointer crossing one control while the keyboard sits on another would
 * otherwise leave two boxes up. It also means the markup exists once — see
 * `ControlTooltip.svelte` — instead of being repeated by every surface that
 * wants to name its controls.
 */
let shown = $state<ShownHint | undefined>();

/** The control the visible hint belongs to, so a stale leave cannot close it. */
let owner: Element | undefined;

export function shownControlHint(): ShownHint | undefined {
	return shown;
}

export function hideControlHint(): void {
	owner = undefined;
	shown = undefined;
}

/**
 * Where the box goes, measured from the control it describes.
 *
 * `position: fixed`, so both decisions are against the viewport rather than
 * against whatever scroll port the control is sitting in — the action tray is
 * inside the editor region's grid and the transport is inside a horizontal
 * scroller, and a box in either one's flow would grow the thing it annotates.
 *
 * It flips on both axes rather than taking a placement prop, because the two
 * surfaces that use it want opposite answers and neither should have to say so:
 * the tray hangs at the top-right of the document, where a box laid out
 * leftward runs off the panel edge, and the transport is the last row above the
 * status bar, where there is no room below at all.
 */
export function placeControlHint(
	rect: { top: number; bottom: number; left: number; right: number; width: number },
	viewport: { width: number; height: number }
): string {
	// 96px is a two-line box plus its gap. Under that, the box goes above the
	// control instead of being pushed back up the viewport by the clamp, which
	// would put it over the thing it describes.
	const below = viewport.height - rect.bottom > 96;
	const vertical = below
		? `top: ${rect.bottom + 6}px;`
		: `bottom: ${viewport.height - rect.top + 6}px;`;
	const alignRight = rect.left + rect.width / 2 > viewport.width / 2;
	const horizontal = alignRight
		? `right: ${Math.max(8, viewport.width - rect.right)}px;`
		: `left: ${Math.max(8, rect.left)}px;`;
	return `${vertical} ${horizontal}`;
}

/**
 * Name this control, and the keystroke that runs it, on hover and on focus.
 *
 * The replacement for `title`, which is slow, unstyled, and says the same thing
 * in a different voice on every platform. Two rules it keeps, both of them the
 * citation tooltip's (`SourceCitation.svelte`):
 *
 * - **The keyboard opens it the same way the pointer does.** A control reached
 *   by Tab has had its name asked for just as plainly as one under a pointer.
 * - **The box is `aria-hidden`, not `aria-describedby`.** Both facts in it are
 *   already the control's own accessible name and `aria-keyshortcuts`, so
 *   describing would announce each twice. Where that is *not* true — where the
 *   visible text is the only copy — the citation's `aria-describedby` is the
 *   right shape instead. This is the one case where the direction reverses.
 *
 * It is an attachment rather than a wrapper component on purpose: the transport
 * row's height is budgeted to the pixel (see `.media-strip__transport-button`),
 * and an element wrapped around a flex item is a new flex item with its own
 * sizing. This adds nothing to any control's box.
 */
export function describeControl(hint: () => ControlHint | undefined): Attachment<Element> {
	return (node) => {
		const show = (): void => {
			const current = hint();
			if (!current) return;
			owner = node;
			shown = {
				...current,
				position: placeControlHint(node.getBoundingClientRect(), {
					width: window.innerWidth,
					height: window.innerHeight
				})
			};
		};
		// Guarded on ownership, so the pointer leaving a control the keyboard has
		// since moved on from cannot close the box that control no longer owns.
		const hide = (): void => {
			if (owner === node) hideControlHint();
		};
		const onKeydown = (event: Event): void => {
			if ((event as KeyboardEvent).key === 'Escape' && owner === node) {
				event.stopPropagation();
				hideControlHint();
			}
		};
		node.addEventListener('pointerenter', show);
		node.addEventListener('pointerleave', hide);
		node.addEventListener('focus', show);
		node.addEventListener('blur', hide);
		node.addEventListener('keydown', onKeydown);
		// A pressed control is a control the user has finished asking about, and on
		// a toggle the box would otherwise sit there describing the old state.
		node.addEventListener('click', hide);
		return () => {
			hide();
			node.removeEventListener('pointerenter', show);
			node.removeEventListener('pointerleave', hide);
			node.removeEventListener('focus', show);
			node.removeEventListener('blur', hide);
			node.removeEventListener('keydown', onKeydown);
			node.removeEventListener('click', hide);
		};
	};
}

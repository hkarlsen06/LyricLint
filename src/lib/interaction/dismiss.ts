import type { Attachment } from 'svelte/attachments';

/** A native modal still owns Escape after its focused control is removed. */
export function modalOwnsEscape(target: EventTarget | null): boolean {
	return (
		document.querySelector('dialog:modal') !== null ||
		(target instanceof Element && target.closest('dialog, [role="dialog"]') !== null)
	);
}

/**
 * An open list (the shared `Select`) closes on Escape before the surface around
 * it does. Focus stays on its trigger while the list is open, so the keydown
 * reaches the surface's own handler first; the surface stands down for it.
 */
export function openListOwnsEscape(target: EventTarget | null): boolean {
	return (
		target instanceof Element && target.closest('[role="combobox"][aria-expanded="true"]') !== null
	);
}

/**
 * Whether a press landed on this surface: on the surface itself, or on a list a
 * control inside it opened. The shared `Select` portals its list to the body,
 * out of the surface's subtree, and choosing a row there is a press on the
 * surface's own control.
 */
function pressedInside(node: Element, target: Node): boolean {
	if (node.contains(target)) return true;
	const list = target instanceof Element ? target.closest('[role="listbox"][id]') : null;
	return list !== null && node.querySelector(`[aria-controls="${CSS.escape(list.id)}"]`) !== null;
}

/**
 * Close a transient surface when a pointer press lands outside it.
 *
 * Every floating surface in the workbench (pickers, popovers, the drafts menu)
 * is dismissed the same three ways: Escape, its own closing control, and a
 * press anywhere else. The last one is the one users reach for without being
 * told, so it is a shared attachment rather than a per-component handler.
 *
 * Two decisions are baked in and should stay that way:
 *
 * - The press is read on `pointerdown`, in the capture phase. Waiting for
 *   `click` leaves the surface up through the press, and the bubble phase never
 *   arrives for presses that CodeMirror or a picker cancels for its own reasons.
 * - Dismissal does not move focus. The press has already named where the user
 *   is going; handing focus back to the editor would drag the caret away from
 *   whatever they just pressed. Escape and Cancel are the paths that return it.
 *
 * Attach it to the outermost node of the surface, which for a `<details>` menu
 * is the `<details>` itself. That keeps a press on the summary inside the
 * surface, where the native toggle can do its job.
 */
export function dismissOnOutside(onDismiss: () => void): Attachment<Element> {
	return (node) => {
		const handlePointerDown = (event: PointerEvent): void => {
			const target = event.target;
			if (target instanceof Node && !pressedInside(node, target)) {
				onDismiss();
			}
		};
		document.addEventListener('pointerdown', handlePointerDown, true);
		return () => document.removeEventListener('pointerdown', handlePointerDown, true);
	};
}

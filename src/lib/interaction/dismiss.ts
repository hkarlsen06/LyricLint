import type { Attachment } from 'svelte/attachments';

/**
 * Close a transient surface when a pointer press lands outside it.
 *
 * Every floating surface in the workbench — pickers, popovers, the drafts menu
 * — is dismissed the same three ways: Escape, its own closing control, and a
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
 * is the `<details>` itself — that keeps a press on the summary inside the
 * surface, where the native toggle can do its job.
 */
export function dismissOnOutside(onDismiss: () => void): Attachment<Element> {
	return (node) => {
		const handlePointerDown = (event: PointerEvent): void => {
			const target = event.target;
			if (target instanceof Node && !node.contains(target)) {
				onDismiss();
			}
		};
		document.addEventListener('pointerdown', handlePointerDown, true);
		return () => document.removeEventListener('pointerdown', handlePointerDown, true);
	};
}

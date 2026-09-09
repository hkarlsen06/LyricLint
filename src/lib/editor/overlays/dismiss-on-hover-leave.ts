import type { Attachment } from 'svelte/attachments';
import { diagnosticTriggerAttribute, type ScreenRect } from '../contracts.js';

/** The pending and loaded diagnostic share the same pointer-travel grace. */
export function dismissOnHoverLeave(options: {
	anchor?: ScreenRect;
	takeFocus: boolean;
	onDismiss: () => void;
}): Attachment<HTMLElement> {
	return (root) => {
		if (options.takeFocus) return;
		let timer: number | undefined;
		const within = (rect: ScreenRect, x: number, y: number, pad: number) =>
			x >= rect.left - pad &&
			x <= rect.right + pad &&
			y >= rect.top - pad &&
			y <= rect.bottom + pad;
		const onMove = (event: PointerEvent) => {
			const near =
				within(root.getBoundingClientRect(), event.clientX, event.clientY, 28) ||
				(options.anchor !== undefined && within(options.anchor, event.clientX, event.clientY, 12));
			if (near) {
				clearTimeout(timer);
				timer = undefined;
			} else if (timer === undefined) {
				timer = window.setTimeout(() => {
					const active = document.activeElement;
					const heldFocus =
						root.contains(active) ||
						(active instanceof Element &&
							active.closest(`[${diagnosticTriggerAttribute}]`) !== null);
					if (!heldFocus) options.onDismiss();
				}, 250);
			}
		};
		window.addEventListener('pointermove', onMove, { passive: true });
		return () => {
			window.removeEventListener('pointermove', onMove);
			clearTimeout(timer);
		};
	};
}

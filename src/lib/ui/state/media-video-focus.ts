import type { Attachment } from 'svelte/attachments';

/** Keep workbench shortcuts available after pointer interaction with the video. */
export const keepVideoShortcuts: Attachment<HTMLElement> = (node) => {
	let keyboardEntry = false;
	let pending: ReturnType<typeof setTimeout> | undefined;
	const pointer = () => {
		keyboardEntry = false;
	};
	const keydown = (event: KeyboardEvent) => {
		keyboardEntry = event.key === 'Tab';
	};
	const blur = () => {
		clearTimeout(pending);
		// The active element becomes the iframe after the window's blur event.
		pending = setTimeout(() => {
			const focused = document.activeElement;
			if (
				keyboardEntry ||
				!document.hasFocus() ||
				!(focused instanceof HTMLIFrameElement) ||
				!node.contains(focused) ||
				(document.fullscreenElement && node.contains(document.fullscreenElement))
			) {
				return;
			}
			// Cross-origin frames cannot forward keys. Return pointer focus to this
			// group, but leave Tab entry and fullscreen to YouTube's own controls.
			node.focus({ preventScroll: true });
		}, 0);
	};

	window.addEventListener('keydown', keydown, true);
	window.addEventListener('pointermove', pointer, true);
	window.addEventListener('pointerdown', pointer, true);
	node.addEventListener('pointerenter', pointer);
	window.addEventListener('blur', blur);
	return () => {
		clearTimeout(pending);
		window.removeEventListener('keydown', keydown, true);
		window.removeEventListener('pointermove', pointer, true);
		window.removeEventListener('pointerdown', pointer, true);
		node.removeEventListener('pointerenter', pointer);
		window.removeEventListener('blur', blur);
	};
};

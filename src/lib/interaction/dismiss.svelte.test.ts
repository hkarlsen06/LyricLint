import { afterEach, describe, expect, it, vi } from 'vitest';
import { dismissOnOutside } from './dismiss.js';

/**
 * The attachment is a plain `(node) => cleanup` function, so it is exercised
 * against real nodes here rather than through a component. The file carries the
 * `.svelte.test.ts` suffix only to land in the browser project, where a DOM and
 * real pointer events exist.
 */

const mounted: Array<() => void> = [];

function attachTo(node: Element, onDismiss: () => void): void {
	const cleanup = dismissOnOutside(onDismiss)(node);
	if (cleanup) {
		mounted.push(cleanup);
	}
}

function element(className: string, parent: Element = document.body): HTMLDivElement {
	const node = document.createElement('div');
	node.className = className;
	parent.append(node);
	return node;
}

function press(target: Element): void {
	target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
}

afterEach(() => {
	for (const cleanup of mounted.splice(0)) {
		cleanup();
	}
	document.body.replaceChildren();
});

describe('dismissOnOutside', () => {
	it('dismisses on a press outside the surface', () => {
		const surface = element('surface');
		const elsewhere = element('elsewhere');
		const onDismiss = vi.fn();
		attachTo(surface, onDismiss);

		press(elsewhere);

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('leaves the surface alone for a press on it or anything inside it', () => {
		const surface = element('surface');
		const child = element('child', surface);
		const onDismiss = vi.fn();
		attachTo(surface, onDismiss);

		press(surface);
		press(child);

		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('reads the press in the capture phase, so a handler that stops it cannot hide it', () => {
		// CodeMirror and the pickers both cancel presses they handle themselves;
		// a bubble-phase listener would never hear those.
		const surface = element('surface');
		const elsewhere = element('elsewhere');
		elsewhere.addEventListener('pointerdown', (event) => event.stopPropagation());
		const onDismiss = vi.fn();
		attachTo(surface, onDismiss);

		press(elsewhere);

		expect(onDismiss).toHaveBeenCalledTimes(1);
	});

	it('stops listening once the surface is gone', () => {
		const surface = element('surface');
		const elsewhere = element('elsewhere');
		const onDismiss = vi.fn();
		const cleanup = dismissOnOutside(onDismiss)(surface);

		cleanup?.();
		press(elsewhere);

		expect(onDismiss).not.toHaveBeenCalled();
	});
});

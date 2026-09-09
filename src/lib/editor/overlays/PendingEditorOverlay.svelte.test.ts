import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, expect, it, vi } from 'vitest';
import PendingEditorOverlay from './PendingEditorOverlay.svelte';

const children = createRawSnippet(() => ({
	render: () => '<p role="status">Loading editor controls…</p>'
}));
const anchor = { left: 20, right: 40, top: 20, bottom: 40, width: 20, height: 20 };

afterEach(async () => {
	await cleanup();
});

it('takes keyboard focus immediately and cancels Escape before the editor sees it', async () => {
	const onDismiss = vi.fn();
	const onFocus = vi.fn();
	const view = await render(PendingEditorOverlay, {
		props: {
			anchor,
			takeFocus: true,
			hover: false,
			onDismiss,
			onFocus,
			children
		}
	});
	const pending = screen.getByRole('dialog', { name: 'Editor controls' });
	expect(document.activeElement).toBe(pending);
	expect(onFocus).toHaveBeenCalled();
	const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
	pending.dispatchEvent(event);
	expect(event.defaultPrevented).toBe(true);
	expect(onDismiss).toHaveBeenCalledWith(true);
	await view.unmount();
	onDismiss.mockClear();
	window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
	expect(onDismiss).not.toHaveBeenCalled();
});

it('leaves pointer selections focused and dismisses outside without returning focus', async () => {
	const input = document.createElement('input');
	document.body.append(input);
	try {
		input.focus();
		const onDismiss = vi.fn();
		await render(PendingEditorOverlay, {
			props: {
				anchor,
				takeFocus: false,
				hover: false,
				onDismiss,
				onFocus: vi.fn(),
				children
			}
		});
		expect(document.activeElement).toBe(input);
		await fireEvent.pointerDown(input);
		expect(onDismiss).toHaveBeenCalledWith(false);
		expect(document.activeElement).toBe(input);
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onDismiss).toHaveBeenLastCalledWith(true);
	} finally {
		input.remove();
	}
});

it('retires a hovered request when the pointer leaves the pending card and underline', async () => {
	await page.viewport(1000, 800);
	const onDismiss = vi.fn();
	await render(PendingEditorOverlay, {
		props: {
			anchor,
			takeFocus: false,
			hover: true,
			onDismiss,
			onFocus: vi.fn(),
			children
		}
	});
	await fireEvent.pointerMove(window, { clientX: 950, clientY: 750 });
	await waitFor(() => expect(onDismiss).toHaveBeenCalledWith(false));
});

it.each([
	[1000, 800],
	[360, 780]
])('keeps a long pending refusal within a %ipx by %ipx viewport', async (width, height) => {
	await page.viewport(width, height);
	const longMessage = createRawSnippet(() => ({
		render: () =>
			`<p role="alert">${'The editor controls could not load. '.repeat(8)}Retry or cancel.</p>`
	}));
	await render(PendingEditorOverlay, {
		props: {
			anchor: {
				left: width - 35,
				right: width - 15,
				top: height - 60,
				bottom: height - 40,
				width: 20,
				height: 20
			},
			takeFocus: true,
			hover: false,
			onDismiss: vi.fn(),
			onFocus: vi.fn(),
			children: longMessage
		}
	});
	const rect = screen.getByRole('dialog', { name: 'Editor controls' }).getBoundingClientRect();
	expect(rect.left).toBeGreaterThanOrEqual(0);
	expect(rect.right).toBeLessThanOrEqual(width);
	expect(rect.top).toBeGreaterThanOrEqual(0);
	expect(rect.bottom).toBeLessThanOrEqual(height);
});

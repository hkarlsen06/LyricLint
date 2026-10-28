import { page, userEvent } from 'vitest/browser';
import { afterEach, expect, it } from 'vitest';
import { keepVideoShortcuts } from './media-video-focus.js';
import { bindTransportShortcuts } from './media-shortcuts.js';
import type { TransportAction } from './media-player.svelte.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
	for (const stop of cleanup.splice(0).reverse()) stop();
});

async function setup() {
	const node = document.createElement('div');
	node.tabIndex = -1;
	const before = document.createElement('button');
	before.textContent = 'Before video';
	const iframe = document.createElement('iframe');
	iframe.title = 'Test video';
	iframe.width = '356';
	iframe.height = '200';
	// An opaque origin reproduces the browser boundary without contacting Google.
	iframe.sandbox.add('allow-scripts');
	iframe.srcdoc = `<body style="margin:0;height:100vh"><button style="width:100%;height:100%" onclick="parent.postMessage('video-click', '*')">Video</button></body>`;
	node.append(iframe);
	const loaded = new Promise<void>((resolve) => iframe.addEventListener('load', () => resolve()));
	document.body.append(before, node);
	cleanup.push(() => {
		before.remove();
		node.remove();
	});
	await loaded;
	let clicks = 0;
	const message = (event: MessageEvent) => {
		if (event.source === iframe.contentWindow && event.data === 'video-click') clicks += 1;
	};
	window.addEventListener('message', message);
	cleanup.push(() => window.removeEventListener('message', message));
	const detach = keepVideoShortcuts(node);
	if (detach) cleanup.push(detach);
	const actions: TransportAction[] = [];
	cleanup.push(
		bindTransportShortcuts({
			mediaSession: null,
			transport: (action) => {
				actions.push(action);
				return true;
			}
		})
	);
	before.focus();
	return { node, before, iframe, actions, clicks: () => clicks, detach };
}

it('keeps pointer clicks in a cross-origin video working and Escape available afterward', async () => {
	const { node, iframe, actions, clicks } = await setup();
	for (let count = 1; count <= 2; count += 1) {
		await page.elementLocator(iframe).click();
		await expect.poll(clicks).toBe(count);
		await expect.poll(() => document.activeElement).toBe(node);
		await userEvent.keyboard('{Escape}');
	}
	expect(actions).toEqual(['toggle', 'toggle']);
	await userEvent.keyboard('{Shift>}{Escape}{/Shift}{Alt>}{Escape}{/Alt}{F8}');
	expect(actions).toEqual(['toggle', 'toggle', 'back', 'forward', 'toggle']);
});

it('preserves Tab entry into the provider keyboard controls', async () => {
	const { iframe, actions } = await setup();
	await userEvent.keyboard('{Tab}');
	await expect.poll(() => document.activeElement).toBe(iframe);
	await userEvent.keyboard('{Enter}');
	expect(actions).toEqual([]);
	expect(document.activeElement).toBe(iframe);
});

it('leaves unrelated frames alone and cancels a pending handoff on teardown', async () => {
	const { node, iframe, detach } = await setup();
	const outside = document.createElement('iframe');
	document.body.append(outside);
	cleanup.push(() => outside.remove());
	outside.focus();
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(document.activeElement).toBe(outside);
	node.focus();
	iframe.focus();
	detach?.();
	await new Promise((resolve) => setTimeout(resolve, 20));
	expect(document.activeElement).toBe(iframe);
});

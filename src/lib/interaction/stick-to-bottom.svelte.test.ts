import { afterEach, describe, expect, it } from 'vitest';
import { stickToBottom } from './stick-to-bottom.js';

/**
 * The attachment is a plain `(node) => cleanup` function, so it is driven
 * against a real scroll port here rather than through a component. The
 * `.svelte.test.ts` suffix is what lands it in the browser project, and a real
 * browser is the whole point: every assertion below is about `scrollTop` and
 * about the frame in which something moved, neither of which exists under a
 * simulated DOM.
 */

const mounted: Array<() => void> = [];
const ports: HTMLElement[] = [];

function scrollPort(): HTMLElement {
	const node = document.createElement('div');
	node.style.cssText = 'position:fixed;top:0;left:0;width:300px;height:200px;overflow-y:auto';
	document.body.append(node);
	ports.push(node);
	return node;
}

function grow(node: HTMLElement, lines: number): void {
	for (let index = 0; index < lines; index += 1) {
		const line = document.createElement('p');
		line.style.cssText = 'margin:0;height:40px';
		line.textContent = `line ${index}`;
		node.append(line);
	}
}

/** Two frames: one for the observer to schedule the follow, one for it to run. */
function frames(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
	});
}

function distanceFromBottom(node: HTMLElement): number {
	return node.scrollHeight - node.clientHeight - node.scrollTop;
}

/** A wheel notch upward, followed by the scroll it causes. */
function wheelUp(node: HTMLElement, by: number): void {
	node.dispatchEvent(new WheelEvent('wheel', { deltaY: -by, bubbles: true }));
	node.scrollTop -= by;
}

afterEach(() => {
	for (const cleanup of mounted.splice(0)) cleanup();
	for (const node of ports.splice(0)) node.remove();
});

async function pinnedPort(lines = 20) {
	const node = scrollPort();
	const follow = stickToBottom();
	const cleanup = follow.attach(node);
	if (cleanup) mounted.push(cleanup);
	grow(node, lines);
	await frames();
	return { node, follow };
}

describe('stickToBottom', () => {
	it('follows the foot as the transcript grows', async () => {
		const { node, follow } = await pinnedPort();

		expect(follow.pinned).toBe(true);
		expect(distanceFromBottom(node)).toBe(0);

		grow(node, 10);
		await frames();

		expect(distanceFromBottom(node)).toBe(0);
	});

	it('stops following once the reader scrolls up, and does not haul them back', async () => {
		const { node, follow } = await pinnedPort();
		const port = node;

		wheelUp(port, 300);
		port.dispatchEvent(new Event('scroll'));
		const readingAt = port.scrollTop;

		expect(follow.pinned).toBe(false);

		// The stream carries on underneath them.
		grow(port, 10);
		await frames();

		expect(follow.pinned).toBe(false);
		expect(port.scrollTop).toBe(readingAt);
	});

	/**
	 * The race this exists for: the wheel updates `scrollTop` at once but its
	 * `scroll` event is dispatched at the top of the next frame, so a chunk
	 * landing in between used to be followed while the module still believed it
	 * was pinned — eating the reader's scroll with nothing to show for it.
	 */
	it('gives up the pin on the wheel itself, before the scroll event arrives', async () => {
		const { node, follow } = await pinnedPort();

		wheelUp(node, 300);
		const readingAt = node.scrollTop;
		grow(node, 10);
		await frames();

		expect(follow.pinned).toBe(false);
		expect(node.scrollTop).toBe(readingAt);
	});

	it('takes the pin back when the reader returns to the foot', async () => {
		const { node, follow } = await pinnedPort();

		wheelUp(node, 300);
		node.dispatchEvent(new Event('scroll'));
		expect(follow.pinned).toBe(false);

		node.scrollTop = node.scrollHeight;
		node.dispatchEvent(new Event('scroll'));
		expect(follow.pinned).toBe(true);

		grow(node, 10);
		await frames();
		expect(distanceFromBottom(node)).toBe(0);
	});

	/**
	 * Growth never moves `scrollTop`, so it can only ever look like the reader
	 * standing still — which is what lets a pinned transcript be unpinned by an
	 * upward move alone. Read as a distance instead, the first chunk taller than
	 * the threshold would unpin the follow in the middle of its own answer.
	 */
	it('is not unpinned by an answer that outgrows the threshold in one chunk', async () => {
		const { node, follow } = await pinnedPort();

		grow(node, 20);
		node.dispatchEvent(new Event('scroll'));
		await frames();

		expect(follow.pinned).toBe(true);
		expect(distanceFromBottom(node)).toBe(0);
	});

	it('pins and returns to the foot on request', async () => {
		const { node, follow } = await pinnedPort();

		wheelUp(node, 300);
		node.dispatchEvent(new Event('scroll'));
		expect(follow.pinned).toBe(false);

		follow.pin();

		expect(follow.pinned).toBe(true);
		expect(distanceFromBottom(node)).toBe(0);
	});

	it('opens a restored transcript at its foot', async () => {
		const node = scrollPort();
		grow(node, 20);
		const follow = stickToBottom();
		const cleanup = follow.attach(node);
		if (cleanup) mounted.push(cleanup);

		expect(distanceFromBottom(node)).toBe(0);
	});

	it('stops following once detached', async () => {
		const { node } = await pinnedPort();

		mounted.splice(0).forEach((cleanup) => cleanup());
		node.scrollTop = 0;
		grow(node, 10);
		await frames();

		expect(node.scrollTop).toBe(0);
	});
});

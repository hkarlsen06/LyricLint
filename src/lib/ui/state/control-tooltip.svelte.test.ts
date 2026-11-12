import { afterEach, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { describeControl, hideControlHint, shownControlHint } from './control-tooltip.svelte.js';

const mounted: Array<() => void> = [];
const buttons: HTMLButtonElement[] = [];

function control(label: string): HTMLButtonElement {
	const button = document.createElement('button');
	button.textContent = label;
	document.body.append(button);
	buttons.push(button);
	const cleanup = describeControl(() => ({ label, shortcut: 'Ctrl+K' }))(button);
	if (cleanup) mounted.push(cleanup);
	return button;
}

afterEach(() => {
	for (const cleanup of mounted.splice(0)) cleanup();
	for (const button of buttons.splice(0)) button.remove();
	hideControlHint();
});

it('discloses shortcuts on keyboard focus without opening on a pointer focus handoff', async () => {
	const first = control('First control');
	const second = control('Second control');
	await userEvent.click(first);
	first.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
	second.focus();
	expect(shownControlHint()).toBeUndefined();
	await userEvent.click(first);
	await userEvent.keyboard('{Tab}');
	expect(document.activeElement).toBe(second);
	expect(shownControlHint()?.label).toBe('Second control');
	expect(shownControlHint()?.shortcut).toBe('Ctrl+K');
	await userEvent.keyboard('{Escape}');
	expect(shownControlHint()).toBeUndefined();
});

it('keeps touch pointer entry quiet while retaining mouse hover disclosure', () => {
	const button = control('Named control');
	button.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
	expect(shownControlHint()).toBeUndefined();
	button.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
	expect(shownControlHint()?.label).toBe('Named control');
	control('Touch control').dispatchEvent(
		new PointerEvent('pointerenter', { pointerType: 'touch' })
	);
	expect(shownControlHint()).toBeUndefined();
});

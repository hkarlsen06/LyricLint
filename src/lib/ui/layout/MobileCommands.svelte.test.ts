import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cdp, page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';
import EditorActions from './EditorActions.svelte';
import Workspace from './Workspace.svelte';
import MockEditorPane from './MockEditorPane.svelte';

beforeEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
});

afterEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	cleanup();
	await page.viewport(800, 600);
});

test('keeps phone identity and copy visible while document commands dismiss three ways', async () => {
	await page.viewport(320, 844);
	const { controller } = createTestWorkbench({ text: '[Verse]\nThe words' });
	render(DocumentToolbar, { controller });
	const trigger = await screen.findByRole('button', { name: 'Document' });
	const copy = screen.getByRole('button', { name: 'Copy lyrics' });
	expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
	for (const control of [trigger, copy, screen.getByLabelText("'Scribe title")]) {
		const rect = control.getBoundingClientRect();
		expect(rect.left).toBeGreaterThanOrEqual(0);
		expect(rect.right).toBeLessThanOrEqual(320);
		expect(rect.height).toBeGreaterThanOrEqual(44);
	}
	await fireEvent.click(trigger);
	expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy();
	expect(screen.getByRole('button', { name: "New 'scribe" })).toBeTruthy();
	await fireEvent.click(trigger);
	expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
	await fireEvent.click(trigger);
	await fireEvent.keyDown(window, { key: 'Escape' });
	expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
	expect(document.activeElement).toBe(trigger);
	await fireEvent.click(trigger);
	await fireEvent.pointerDown(copy);
	expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
});

test('names touch editing actions and preserves the selection before opening assignment', async () => {
	await page.viewport(390, 844);
	const { controller, calls } = createTestWorkbench({
		text: '[Verse]\nThe words',
		selection: { anchor: 8, head: 17 }
	});
	const assign = vi.fn();
	controller.editor.requestPerformerAssignment = assign;
	render(EditorActions, { controller, onToggleEditor: vi.fn() });
	const section = await screen.findByRole('button', { name: 'Section header' });
	expect(section.textContent?.trim()).toBe('Section');
	const voices = screen.getByRole('button', { name: 'Assign voices' });
	for (const command of [
		section,
		voices,
		screen.getByRole('button', { name: 'Unknown lyric [?]' }),
		screen.getByRole('button', { name: 'Find and replace' })
	]) {
		const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
		command.dispatchEvent(down);
		expect(down.defaultPrevented).toBe(false);
		const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
		command.dispatchEvent(mouseDown);
		expect(mouseDown.defaultPrevented).toBe(true);
	}
	await fireEvent.click(voices);
	expect(assign).toHaveBeenCalledOnce();
	expect(controller.snapshot.selection).toEqual({ anchor: 8, head: 17 });
	expect(calls.selections).toEqual([]);
	expect(screen.queryByRole('button', { name: 'Expand editor' })).toBeNull();
	controller.onSnapshot({ ...controller.snapshot, selection: { anchor: 0, head: 7 } });
	await waitFor(() => expect(screen.queryByRole('button', { name: 'Assign voices' })).toBeNull());
});

test.each([320, 390])(
	'keeps every named document-menu row above the workspace tray at %ipx',
	async (width) => {
		await page.viewport(width, 844);
		const { controller } = createTestWorkbench({ text: '[Verse]\nThe words' });
		render(Workspace, {
			controller,
			editorComponent: MockEditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		await fireEvent.click(await screen.findByRole('button', { name: 'Document' }));
		const menu = document.querySelector<HTMLElement>('#document-commands')!;
		const tray = document.querySelector<HTMLElement>('.editor-actions')!;
		const menuBox = menu.getBoundingClientRect();
		const trayBox = tray.getBoundingClientRect();
		expect(menuBox.top).toBeLessThan(trayBox.bottom);
		expect(menuBox.bottom).toBeGreaterThan(trayBox.top);
		const labels = ["New 'scribe", 'Undo', 'Redo', 'Language: English', 'Compare'];
		const rows = [...menu.querySelectorAll<HTMLButtonElement>(':scope > button')];
		expect(rows.map((row) => row.textContent?.trim())).toEqual(labels);
		for (const row of rows) {
			const box = row.getBoundingClientRect();
			expect(box.left).toBeGreaterThanOrEqual(0);
			expect(box.right).toBeLessThanOrEqual(width);
			expect(box.height).toBeGreaterThanOrEqual(44);
			expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth);
			expect(
				row.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2))
			).toBe(true);
			expect(box.width).toBe(rows[0].getBoundingClientRect().width);
		}
		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: English' }));
		expect(screen.getByRole('dialog', { name: 'Lyric language' })).toBeTruthy();
	}
);

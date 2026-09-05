import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';

afterEach(async () => {
	cleanup();
	await page.viewport(800, 600);
});

function mount(text = '[Verse]\nImma go\nImma stay') {
	const { controller } = createTestWorkbench({ text });
	render(Workspace, {
		controller,
		editorComponent: MockEditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} }
	});
	return controller;
}

test.each([390, 640])(
	'a %ipx mouse-driven desktop keeps its panels and document commands',
	async (width) => {
		await page.viewport(width, 844);
		mount();
		await waitFor(() => expect(window.matchMedia('(pointer: fine)').matches).toBe(true));
		expect(screen.queryByRole('navigation', { name: 'Workbench views' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Document' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Compare' })).toBeTruthy();
		expect(screen.getByRole('tab', { name: /Review/ })).toBeTruthy();
		const editor = screen.getByTestId('editor-region');
		await fireEvent.click(screen.getByRole('button', { name: 'Expand editor' }));
		expect(screen.queryByRole('tab', { name: /Review/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: /Show tools/ }));
		expect(screen.getByRole('tab', { name: /Review/ })).toBeTruthy();
		expect(screen.getByTestId('editor-region')).toBe(editor);
	}
);

test.each([750, 1000])('centers a clean review within the %ipx stacked panel', async (width) => {
	await page.viewport(width, 844);
	mount('[Verse]\nWalking home\nThrough the night');
	const workspace = screen.getByTestId('workspace');
	workspace.style.height = '800px';
	await waitFor(() => expect(screen.getByText('No issues found')).toBeTruthy());
	const body = workspace.querySelector<HTMLElement>('.right-panel__body')!;
	const title = screen.getByText('No issues found');
	const message = title.closest<HTMLElement>('.diagnostic-list__empty')!;
	const bodyBounds = body.getBoundingClientRect();
	expect(bodyBounds.width).toBeGreaterThan(700);
	for (const content of message.children) {
		const bounds = content.getBoundingClientRect();
		expect(
			Math.abs(bounds.left + bounds.width / 2 - (bodyBounds.left + bodyBounds.width / 2))
		).toBeLessThanOrEqual(1);
	}
});

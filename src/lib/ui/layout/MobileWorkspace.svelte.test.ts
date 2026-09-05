import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cdp, page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';

const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
beforeEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
});

afterEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	cleanup();
	if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
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

test('phone review opens one decision, releases it on return, and retains the editor', async () => {
	await page.viewport(390, 844);
	mount();
	const editor = screen.getByTestId('editor-region');
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(600);
	expect(screen.queryByRole('tab', { name: /Review/ })).toBeNull();
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(true);
	expect(document.querySelectorAll('.diagnostic-card--expanded')).toHaveLength(0);
	const finding = screen.getAllByRole('button', { name: /^Go to / })[0];
	await fireEvent.click(finding);
	await waitFor(() => expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(false));
	expect(screen.getAllByRole('button', { name: /^Go to / })).toHaveLength(1);
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(200);
	await fireEvent.click(screen.getByRole('button', { name: 'All findings' }));
	await waitFor(() => expect(document.activeElement).toBe(finding));
	expect(document.querySelectorAll('.diagnostic-card--expanded')).toHaveLength(0);
	await fireEvent.click(navigation.getByRole('button', { name: 'Write' }));
	expect(screen.getByTestId('editor-region')).toBe(editor);
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(600);
});

test('the keyboard gives its space to writing and restores navigation only after dismissal', async () => {
	await page.viewport(390, 844);
	const events = new EventTarget();
	const viewport = {
		height: 844,
		width: 390,
		offsetTop: 0,
		addEventListener: events.addEventListener.bind(events),
		removeEventListener: events.removeEventListener.bind(events)
	};
	Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
	mount();
	viewport.height = 420;
	viewport.offsetTop = 30;
	events.dispatchEvent(new Event('resize'));
	const workspace = screen.getByTestId('workspace');
	await waitFor(() => expect(Math.round(workspace.getBoundingClientRect().height)).toBe(420));
	expect(screen.queryByRole('navigation', { name: 'Workbench views' })).toBeNull();
	expect(screen.getByTestId('editor-region').getBoundingClientRect().height).toBeGreaterThan(300);
	viewport.height = 844;
	viewport.offsetTop = 0;
	events.dispatchEvent(new Event('resize'));
	await waitFor(() =>
		expect(screen.getByRole('navigation', { name: 'Workbench views' })).toBeTruthy()
	);
	expect(
		screen.getByRole('navigation', { name: 'Workbench views' }).getBoundingClientRect().bottom
	).toBe(844);
});

test('fixing the last mobile finding returns focus to the visible Review control', async () => {
	await page.viewport(390, 844);
	mount('[Verse]\nImma go');
	const review = within(screen.getByRole('navigation', { name: 'Workbench views' })).getByRole(
		'button',
		{ name: /^Review/ }
	);
	await fireEvent.click(review);
	await fireEvent.click(screen.getByRole('button', { name: /^Go to / }));
	const fix = screen.getByRole('button', { name: "Replace with I'ma" });
	fix.focus();
	await fireEvent.click(fix);
	await waitFor(() => expect(document.activeElement).toBe(review));
	expect(screen.getByText('No issues found')).toBeTruthy();
});

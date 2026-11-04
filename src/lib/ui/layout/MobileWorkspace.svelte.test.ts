import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cdp, page } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';
import ToastRegion from '../primitives/ToastRegion.svelte';
import SongPanel from '../tools/SongPanel.svelte';
import { importDocument, renderProfile } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';

const viewportDescriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
beforeEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
});

afterEach(async () => {
	await cdp().send('Emulation.setTouchEmulationEnabled', { enabled: false });
	await cleanup();
	if (viewportDescriptor) Object.defineProperty(window, 'visualViewport', viewportDescriptor);
	await page.viewport(800, 600);
});

async function mount(text = '[Verse]\nImma go\nImma stay') {
	const { controller } = createTestWorkbench({ text });
	await render(Workspace, {
		controller,
		editorComponent: MockEditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} }
	});
	return controller;
}

test('phone review opens one decision, releases it on return, and retains the editor', async () => {
	await page.viewport(390, 844);
	await mount();
	const editor = screen.getByTestId('editor-region');
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(600);
	expect(screen.queryByRole('tab', { name: /Review/ })).toBeNull();
	expect(document.querySelector('#document-panel')).toBeNull();
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	await screen.findAllByRole('button', { name: /^Go to / });
	const panel = document.querySelector('#document-panel');
	expect(panel).not.toBeNull();
	expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(true);
	expect(document.querySelectorAll('.diagnostic-card--expanded')).toHaveLength(0);
	const finding = (await screen.findAllByRole('button', { name: /^Go to / }))[0];
	await fireEvent.click(finding);
	await waitFor(() => expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(false));
	expect(screen.getAllByRole('button', { name: /^Go to / })).toHaveLength(1);
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(200);
	await fireEvent.click(screen.getByRole('button', { name: 'All findings' }));
	await waitFor(() => expect(document.activeElement).toBe(finding));
	expect(document.querySelectorAll('.diagnostic-card--expanded')).toHaveLength(0);
	await fireEvent.click(navigation.getByRole('button', { name: 'Write' }));
	expect(document.querySelector('#document-panel')).toBe(panel);
	expect(screen.getByTestId('editor-region')).toBe(editor);
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(600);
});

test('notifications leave phone navigation reachable and release its offset on teardown', async () => {
	await page.viewport(390, 844);
	const controller = await mount();
	controller.feedback.addToast({ message: 'Imported two performers.', duration: 60_000 });
	await render(ToastRegion, { feedback: controller.feedback });
	const navigation = screen.getByRole('navigation', { name: 'Workbench views' });
	const notification = screen.getByRole('group', { name: 'Notification' });
	await waitFor(() =>
		expect(notification.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			navigation.getBoundingClientRect().top
		)
	);
	await cleanup();
	expect(document.documentElement.style.getPropertyValue('--mobile-navigation-height')).toBe('');
});

test('Song fields keep touch targets outside the workspace ancestor', async () => {
	await page.viewport(390, 844);
	const imported = importDocument({ text: '[Verse: Mira]\nStay beside me', profile: 'genius' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const projection = renderProfile(imported.value, 'musixmatch');
	if (!projection.ok) throw new Error(projection.refusal.message);
	const { controller } = createTestWorkbench({ text: projection.value.text });
	controller.onSnapshot({
		...controller.snapshot,
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
	const view = await render(SongPanel, { controller });
	view.container.style.height = '550px';
	view.container.style.overflowY = 'auto';
	const chooser = screen.getByRole('combobox', { name: 'Choose a section' });
	await fireEvent.change(chooser, { target: { value: imported.value.sections[0]!.id } });
	for (const control of [
		chooser,
		screen.getByRole('combobox', { name: 'Section type' }),
		screen.getByRole('textbox', { name: 'Genius page link' })
	]) {
		expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		expect(parseFloat(getComputedStyle(control).fontSize)).toBeGreaterThanOrEqual(16);
	}
	controller.openSectionDetails(imported.value.sections[0]!.id, 'review');
	await waitFor(() => {
		const task = view.container.querySelector('.conversion-details')!;
		expect(
			Math.abs(task.getBoundingClientRect().top - view.container.getBoundingClientRect().top)
		).toBeLessThanOrEqual(1);
	});
	expect(document.activeElement).toBe(view.container.querySelector('[data-section-id]'));
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
	await mount();
	viewport.height = 420;
	viewport.offsetTop = 30;
	events.dispatchEvent(new Event('resize'));
	const workspace = screen.getByTestId('workspace');
	await waitFor(() => expect(Math.round(workspace.getBoundingClientRect().height)).toBe(420));
	expect(screen.queryByRole('navigation', { name: 'Workbench views' })).toBeNull();
	const editor = screen.getByTestId('editor-region');
	const editorRect = editor.getBoundingClientRect();
	const actionsRect = screen
		.getByRole('group', { name: 'Document actions' })
		.getBoundingClientRect();
	// The two-row toolbar keeps format and Copy reachable; all remaining space,
	// including the dismissed navigation's former slot, belongs to writing.
	expect(editorRect.top).toBe(actionsRect.bottom);
	const bottomInset = parseFloat(getComputedStyle(editor.closest('.editor-region')!).marginBottom);
	expect(editorRect.bottom + bottomInset).toBe(workspace.getBoundingClientRect().bottom);
	expect(editorRect.height).toBeGreaterThan(viewport.height / 2);
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
	await mount('[Verse]\nImma go');
	const review = within(screen.getByRole('navigation', { name: 'Workbench views' })).getByRole(
		'button',
		{ name: /^Review/ }
	);
	await fireEvent.click(review);
	await fireEvent.click(await screen.findByRole('button', { name: /^Go to / }));
	const fix = screen.getByRole('button', { name: "Replace with I'ma" });
	fix.focus();
	await fireEvent.click(fix);
	await waitFor(() => expect(document.activeElement).toBe(review));
	expect(screen.getByText('No issues found')).toBeTruthy();
});

test('revealing an ignored finding opens its lyrics without restoring it or focusing typing', async () => {
	await page.viewport(390, 844);
	const controller = await mount();
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	await fireEvent.click((await screen.findAllByRole('button', { name: /^Go to / }))[0]);
	await fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
	await fireEvent.click(screen.getByRole('button', { name: 'All findings' }));
	await fireEvent.click(screen.getByRole('button', { name: '1 diagnostic ignored' }));
	await fireEvent.click(screen.getByRole('button', { name: 'Show [Verse] · Line 2' }));
	const editor = screen.getByLabelText<HTMLTextAreaElement>('Lyrics editor');
	await waitFor(() => expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(false));
	expect(editor.getBoundingClientRect().height).toBeGreaterThan(0);
	expect(controller.editor.getSnapshot().selection).toEqual({ anchor: 8, head: 12 });
	expect(document.activeElement).toBe(navigation.getByRole('button', { name: 'Write' }));
	expect(controller.ignoredDiagnosticKeys).toHaveLength(1);
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	expect(screen.getAllByRole('button', { name: /^Go to / })).toHaveLength(1);
	expect(screen.getByRole('button', { name: '1 diagnostic ignored' })).toBeTruthy();
});

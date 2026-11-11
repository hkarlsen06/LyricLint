import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cdp, page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, test } from 'vitest';
import type { Diagnostic } from '#lib/core/types.js';
import type { HarperDiagnosticProvider } from '#lib/rules/index.js';
import { createTestWorkbench } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';

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

async function mount(
	text = '[Verse]\nImma go\nImma stay',
	harperProvider: HarperDiagnosticProvider = { lint: async () => [], dispose: async () => {} }
) {
	const { controller } = createTestWorkbench({ text });
	await render(Workspace, { controller, editorComponent: MockEditorPane, harperProvider });
	return controller;
}

// One Harper spelling finding from the first lint. Every later answer never
// lands, so a typed edit's carry is all that decides whether it stays.
const typoLyrics = '[Verse]\nImma go\nI write a sentnce now';
function firstLintTypo(): HarperDiagnosticProvider {
	let calls = 0;
	return {
		lint: async ({ text, revision }) => {
			calls += 1;
			if (calls > 1) return new Promise<Diagnostic[]>(() => {});
			const from = text.indexOf('sentnce');
			return [
				{
					from,
					to: from + 7,
					ruleId: 'spelling.harper',
					severity: 'suggestion',
					message: 'Spelling: sentnce.',
					explanation: 'Spelling detected by Harper.',
					sourceIds: ['G-SECTIONS'],
					fixes: [
						{
							kind: 'preview',
							label: 'Replace with sentence',
							edit: { baseRevision: revision, edits: [{ from, to: from + 7, insert: 'sentence' }] }
						}
					]
				}
			];
		},
		dispose: async () => {}
	};
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

test('the phone Review control counts decisions, not the places they cover', async () => {
	await page.viewport(390, 844);
	const controller = await mount();
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await waitFor(() => expect(controller.visibleDiagnostics).toHaveLength(2));
	expect(navigation.getByRole('button', { name: /^Review/ }).textContent?.trim()).toBe(
		'Review (1)'
	);
});

test('the phone place stepper hands focus to the other direction at either end', async () => {
	await page.viewport(390, 844);
	await mount();
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	await fireEvent.click((await screen.findAllByRole('button', { name: /^Go to / }))[0]!);
	const previous = await screen.findByRole('button', { name: 'Previous place' });
	const next = screen.getByRole('button', { name: 'Next place' });

	// The phone's editor learns of the place a tick after the press.
	next.focus();
	await fireEvent.click(next);
	await waitFor(() => expect(screen.getByText(/^Place 2 of 2, /u)).toBeTruthy());
	await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(true));
	expect(document.activeElement).toBe(previous);

	await fireEvent.click(previous);
	await waitFor(() => expect(screen.getByText(/^Place 1 of 2, /u)).toBeTruthy());
	await waitFor(() => expect((previous as HTMLButtonElement).disabled).toBe(true));
	expect(document.activeElement).toBe(next);
});

test('a phone decision keeps its stepper’s slot when one place is left', async () => {
	await page.viewport(390, 844);
	await mount();
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	await fireEvent.click((await screen.findAllByRole('button', { name: /^Go to / }))[0]!);
	await screen.findByRole('group', { name: 'Places' });
	const fixTop = () =>
		screen.getByRole('button', { name: "Replace with I'ma" }).getBoundingClientRect().top;
	const before = fixTop();

	await fireEvent.click(screen.getByRole('button', { name: "Replace with I'ma" }));

	await waitFor(() => expect(screen.queryByRole('group', { name: 'Places' })).toBeNull());
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
	expect(fixTop()).toBe(before);
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

test('typing away an open phone finding leaves the caret where the user is typing', async () => {
	await page.viewport(390, 844);
	const controller = await mount(typoLyrics, firstLintTypo());
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	await fireEvent.click(await screen.findByRole('button', { name: /^Go to Spelling: sentnce/u }));
	const editor = screen.getByLabelText<HTMLTextAreaElement>('Lyrics editor');
	await waitFor(() => expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(false));

	const end = typoLyrics.length;
	editor.focus();
	editor.setSelectionRange(end, end);
	await fireEvent.select(editor);
	await userEvent.keyboard('e');
	await waitFor(() => expect(screen.queryByText('Spelling: sentnce.')).toBeNull());
	await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

	expect([editor.selectionStart, editor.selectionEnd]).toEqual([end + 1, end + 1]);
	expect(document.activeElement).toBe(editor);
	await userEvent.keyboard('xtra');
	expect(controller.snapshot.text).toBe(`${typoLyrics}extra`);
});

test('opening another finding after All findings navigates the editor once', async () => {
	await page.viewport(390, 844);
	const controller = await mount(typoLyrics, firstLintTypo());
	// A loop here never yields, so stop delegating after a bound and count.
	const navigate = controller.navigateToDiagnostic;
	let navigations = 0;
	controller.navigateToDiagnostic = (...args) => {
		navigations += 1;
		if (navigations <= 20) navigate(...args);
	};
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	const harperRow = await screen.findByRole('button', { name: /^Go to Spelling: sentnce/u });
	await fireEvent.click(screen.getByRole('button', { name: /^Go to Use “I'ma”/u }));
	const editor = screen.getByLabelText<HTMLTextAreaElement>('Lyrics editor');
	await waitFor(() => expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(false));
	editor.focus();
	await fireEvent.click(screen.getByRole('button', { name: 'All findings' }));
	navigations = 0;

	await fireEvent.click(harperRow);
	await waitFor(() => expect(screen.getByText('Spelling detected by Harper.')).toBeTruthy());
	await new Promise((resolve) => setTimeout(resolve, 100));

	expect(navigations).toBe(1);
	const from = typoLyrics.indexOf('sentnce');
	expect(controller.editor.getSnapshot().selection).toEqual({ anchor: from, head: from + 7 });
	expect(screen.getAllByRole('button', { name: /^Go to / })).toHaveLength(1);
});

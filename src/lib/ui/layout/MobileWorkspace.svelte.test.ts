import { conversionFixture } from '#lib/conversion/test-fixture.js';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { cdp, page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Diagnostic } from '#lib/core/types.js';
import type { HarperDiagnosticProvider } from '#lib/rules/index.js';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import MockEditorPane from './MockEditorPane.svelte';
import EditorPane from '#lib/editor/EditorPane.svelte';
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

test.each([
	[360, 'Review', 'genius'],
	[390, 'Tools', 'musixmatch']
] as const)(
	'Compare reveals the mapped editor from %s %s in %s',
	async (width, origin, profile) => {
		await page.viewport(width, 844);
		const source = '[Verse: Mira]\nSilver compass';
		const { controller } = createTestWorkbench({ conversion: conversionFixture(source, profile) });
		const view = await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		await waitFor(() => expect(controller.editor.switchProfile).toBeDefined());
		const text = controller.snapshot.text;
		controller.setCompareBaseline('[Verse: Mira]\nLunar compass');
		const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
		await fireEvent.click(navigation.getByRole('button', { name: new RegExp(`^${origin}`) }));
		const editor = screen.getByTestId('editor-region').closest<HTMLElement>('.editor-region');
		expect(editor).not.toBeVisible();
		const documentControl = screen.getByRole('button', { name: 'Document' });
		await fireEvent.click(documentControl);
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await waitFor(() =>
			expect(view.container.querySelector('.compare-diff__row ins')).not.toBeNull()
		);
		const changed = view.container.querySelector('.compare-diff__row ins')?.closest('button');
		if (!changed) throw new Error('The changed comparison line is missing.');
		await fireEvent.click(changed);
		const write = navigation.getByRole('button', { name: 'Write' });
		await waitFor(() => expect(write).toHaveAttribute('aria-pressed', 'true'));
		expect(write).toHaveFocus();
		expect(editor).toBeVisible();
		expect(editor?.inert).toBe(false);
		expect(documentControl).toHaveAttribute('aria-expanded', 'false');
		expect(view.container.querySelector('dialog.compare-dialog')).not.toBeVisible();
		const position = text.indexOf('Silver');
		expect(controller.snapshot.selection).toEqual({ anchor: position, head: position });
		expect(controller.snapshot.text).toBe(text);
	}
);

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

test.each([360, 390])(
	'gives a conversion task one phone scroll region and keeps a direct edit handoff at %ipx',
	async (width) => {
		await page.viewport(width, 844);
		const { controller } = createTestWorkbench({
			conversion: conversionFixture('[Verse]\nI counted 2 stars')
		});
		await render(Workspace, {
			controller,
			editorComponent: EditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		await waitFor(() => expect(controller.editor.switchProfile).toBeDefined());
		await fireEvent.click(
			within(screen.getByRole('navigation', { name: 'Workbench views' })).getByRole('button', {
				name: /^Review/
			})
		);
		const editor = screen.getByTestId('editor-region');
		const range = { from: 10, to: 11 };
		controller.openConversionReview(
			diagnostic({
				ruleId: 'mxm.numbers.context',
				message: 'Review this quantity.',
				severity: 'warning',
				...range
			})
		);
		const heading = await screen.findByRole('heading', { name: 'Review quantity' });
		await waitFor(() => expect(heading).toHaveFocus());
		expect(editor.closest<HTMLElement>('.editor-region')!.inert).toBe(true);
		expect(editor.closest('.editor-region')).not.toBeVisible();
		const pane = document.querySelector('#document-panel')!.getBoundingClientRect();
		const nav = screen.getByRole('navigation', { name: 'Workbench views' }).getBoundingClientRect();
		expect(pane.height).toBeGreaterThan(550);
		expect(pane.bottom).toBeLessThanOrEqual(nav.top);
		expect(screen.queryByLabelText('Exact whole-number value')).toBeNull();
		expect(screen.getByLabelText('How is this number used?')).toHaveValue('unknown');
		expect(screen.queryByLabelText('How is it sung?')).toBeNull();
		await fireEvent.change(screen.getByLabelText('How is this number used?'), {
			target: { value: 'ordinary-cardinal' }
		});
		expect(screen.getByLabelText('How is it sung?')).toHaveValue('unknown');
		await fireEvent.change(screen.getByLabelText('How is it sung?'), {
			target: { value: 'whole-quantity' }
		});
		const wording = screen.getByText('Use custom exact wording', { exact: true });
		expect(wording.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		const beforeWording = wording.getBoundingClientRect().toJSON();
		await fireEvent.click(wording);
		expect(screen.getByLabelText('Exact words as sung')).toBeVisible();
		expect(wording.getBoundingClientRect().toJSON()).toEqual(beforeWording);
		await fireEvent.click(wording);
		const edit = screen.getByRole('button', { name: 'Edit in lyrics' });
		expect(edit.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		const back = screen.getByRole('button', { name: 'Back to Review' });
		expect(edit.getBoundingClientRect().top).toBe(back.getBoundingClientRect().top);
		await fireEvent.click(edit);
		await waitFor(() => expect(editor.closest('.editor-region')).toBeVisible());
		expect(controller.requestedConversionReview).toBeUndefined();
		expect(controller.snapshot.selection).toEqual({ anchor: range.from, head: range.to });
		expect(screen.getByTestId('editor-region')).toBe(editor);
		await waitFor(() => expect(screen.getByLabelText('Lyrics editor')).toHaveFocus());
		const before = controller.snapshot.text;
		await userEvent.keyboard('two');
		await waitFor(() => expect(controller.snapshot.text).toBe('I counted two stars'));
		controller.undo();
		await waitFor(() => expect(controller.snapshot.text).toBe(before));
	}
);

test('choosing another phone finding retires the previous deferred reveal', async () => {
	await page.viewport(390, 844);
	const controller = await mount();
	const editor = screen.getByTestId('editor-region');
	const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
	await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
	const findings = await screen.findAllByRole('button', { name: /^Go to / });
	await fireEvent.click(findings[0]);
	await waitFor(() =>
		expect(controller.editor.getSnapshot().selection).toEqual({ anchor: 8, head: 12 })
	);
	const previous = controller.editor.getSnapshot().selection;
	await fireEvent.click(screen.getByRole('button', { name: 'All findings' }));

	await waitFor(() => expect(document.activeElement).toBe(findings[0]));
	const navigate = controller.navigateToDiagnostic;
	const requests = vi.spyOn(controller, 'navigateToDiagnostic').mockImplementation((...args) => {
		// A stale reveal used to alternate forever and starve the browser runner.
		// Bound delegation so that regression fails assertions instead of hanging.
		if (requests.mock.calls.length <= 8) navigate(...args);
	});
	await fireEvent.click(findings[1]);
	await waitFor(() =>
		expect(controller.editor.getSnapshot().selection).toEqual({ anchor: 16, head: 20 })
	);
	const selected = controller.editor.getSnapshot().selection;
	expect(selected).not.toEqual(previous);
	for (const [diagnostic] of requests.mock.calls) {
		expect({ anchor: diagnostic.from, head: diagnostic.to }).toEqual(selected);
	}
	expect(screen.getAllByRole('button', { name: /^Go to / })).toEqual([findings[1]]);
	expect(controller.editor.getSnapshot().text).toBe('[Verse]\nImma go\nImma stay');
	expect(screen.getByTestId('editor-region')).toBe(editor);
	expect(document.activeElement).not.toBe(screen.getByLabelText('Lyrics editor'));
	await fireEvent.click(screen.getByRole('button', { name: 'All findings' }));
	await waitFor(() => expect(document.activeElement).toBe(findings[1]));
	await fireEvent.click(navigation.getByRole('button', { name: 'Write' }));
	expect(controller.editor.getSnapshot().selection).toEqual(selected);
	requests.mockRestore();
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

test.each([360, 390])(
	'keeps Song files in the first usable phone viewport at %ipx',
	async (width) => {
		await page.viewport(width, 844);
		const { controller, calls } = createTestWorkbench({
			text: '[Verse: Åsa]\nOne [silver](12345) line\n\n[Chorus]\nStay beside me'
		});
		await controller.setTitle(
			'A very long song title with Åsa and Bjørn that fills several phone widths'
		);
		controller.setGeniusUrl('https://genius.com/Asa-a-very-long-song-title-lyrics');
		calls.lineAnchors = [{ line: 2, time: 1.25 }];
		controller.onLineAnchorsChanged();
		await render(Workspace, {
			controller,
			editorComponent: MockEditorPane,
			harperProvider: { lint: async () => [], dispose: async () => {} }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
		await fireEvent.click(await screen.findByRole('tab', { name: 'Song' }));
		const pane = document.querySelector('#document-panel')!.getBoundingClientRect();
		for (const name of ['Export .txt', 'Export Scribe', 'Export timings']) {
			const buttons = await screen.findAllByRole('button', { name });
			expect(buttons).toHaveLength(1);
			const rect = buttons[0]!.getBoundingClientRect();
			expect(rect.top).toBeGreaterThanOrEqual(pane.top);
			expect(rect.bottom).toBeLessThanOrEqual(pane.bottom);
			expect(rect.height).toBeGreaterThanOrEqual(44);
			expect(rect.right).toBeLessThanOrEqual(width);
		}
		expect(screen.getByRole('link', { name: 'Open Genius page' })).toHaveAttribute(
			'href',
			controller.geniusUrl
		);
		expect(screen.getByRole('textbox', { name: 'Genius page link' })).not.toBeVisible();
		for (const label of ['Language and content type', 'Advanced tools'])
			expect(
				screen.getByText(label, { exact: true }).getBoundingClientRect().height
			).toBeGreaterThanOrEqual(44);
		expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
	}
);

test.each([360, 390])(
	'keeps passage language within the ordinary Song section rhythm at %ipx',
	async (width) => {
		await page.viewport(width, 844);
		await mount('[Verse: Mira]\nHéllo 🌙\nOther words stay exact');
		await fireEvent.click(screen.getByRole('button', { name: 'Tools' }));
		await fireEvent.click(await screen.findByRole('tab', { name: 'Song' }));
		await fireEvent.click(await screen.findByText('Language and content type', { exact: true }));
		const passage = document.querySelector('.passage-language');
		if (
			!(passage instanceof HTMLElement) ||
			!(passage.previousElementSibling instanceof HTMLElement)
		)
			throw new Error('The adjacent Song sections are missing.');
		expect(
			passage.getBoundingClientRect().top -
				passage.previousElementSibling.getBoundingClientRect().bottom
		).toBeLessThanOrEqual(44);
	}
);

test('Song fields keep touch targets outside the workspace ancestor', async () => {
	await page.viewport(390, 844);
	const imported = importDocument({ text: '[Verse: Mira]\nStay beside me', profile: 'genius' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const projection = renderProfile(imported.value, 'musixmatch');
	if (!projection.ok) throw new Error(projection.refusal.message);
	const { controller } = createTestWorkbench({
		conversion: createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions)
	});
	const view = await render(SongPanel, { controller });
	view.container.style.height = '550px';
	view.container.style.overflowY = 'auto';
	await fireEvent.click(screen.getByText('Advanced tools', { exact: true }));
	const reference = screen.getByRole('textbox', { name: 'Genius page link' });
	expect(reference).toBeVisible();
	expect(reference.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
	expect(parseFloat(getComputedStyle(reference).fontSize)).toBeGreaterThanOrEqual(16);
	controller.openSectionDetails(imported.value.sections[0]!.id, 'review');
	await waitFor(() => {
		const task = view.container.querySelector('.conversion-details')!;
		const bounds = view.container.getBoundingClientRect();
		expect(task.getBoundingClientRect().top).toBeGreaterThanOrEqual(bounds.top);
		expect(task.getBoundingClientRect().bottom).toBeLessThanOrEqual(bounds.bottom);
	});
	expect(document.activeElement).toBe(view.container.querySelector('[data-section-id]'));
	for (const control of [
		screen.getByRole('combobox', { name: 'Section type' }),
		screen.getByRole('textbox', { name: 'Genius section label' })
	]) {
		expect(control).toBeVisible();
		expect(control.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
		expect(parseFloat(getComputedStyle(control).fontSize)).toBeGreaterThanOrEqual(16);
	}
	expect(screen.queryByRole('combobox', { name: 'Choose a section', hidden: true })).toBeNull();
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
	const completed = Promise.withResolvers<[]>();
	const lint = vi.fn(() => completed.promise);
	const { controller } = createTestWorkbench({ text: '[Verse]\nImma go' });
	await render(Workspace, {
		controller,
		editorComponent: MockEditorPane,
		harperProvider: { lint, dispose: async () => {} }
	});
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
	// Focus belongs to the removed finding, not to the later grammar answer.
	expect(screen.getByText('Checking lyrics…')).toBeTruthy();
	expect(screen.queryByText('No issues found')).toBeNull();
	await waitFor(() =>
		expect(lint).toHaveBeenLastCalledWith(
			expect.objectContaining({
				text: "[Verse]\nI'ma go"
			})
		)
	);
	expect(review).toHaveFocus();
	completed.resolve([]);
	await screen.findByText('No issues found');
	expect(review).toHaveFocus();
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

test.each([360, 390])(
	'reserves notification space outside the task and preserves reading and focus at %ipx',
	async (width) => {
		await page.viewport(width, 844);
		const controller = await mount();
		await render(ToastRegion, { feedback: controller.feedback });
		const navigation = within(screen.getByRole('navigation', { name: 'Workbench views' }));
		await fireEvent.click(navigation.getByRole('button', { name: /^Review/ }));
		const task = document.querySelector<HTMLElement>('#document-panel')!;
		const trigger = (await screen.findAllByRole('button', { name: /^Go to / }))[0];
		trigger.focus();
		const top = trigger.getBoundingClientRect().top;
		const scroll = task.scrollTop;
		controller.feedback.addToast({
			message: 'Imported a performer with a long exact name into the roster.',
			actionLabel: 'Undo',
			action() {},
			duration: 10000
		});
		const notification = screen.getByRole('region', { name: 'Notifications' });
		await waitFor(() =>
			expect(task.getBoundingClientRect().bottom).toBeLessThanOrEqual(
				notification.getBoundingClientRect().top
			)
		);
		expect(trigger).toHaveFocus();
		expect(trigger.getBoundingClientRect().top).toBe(top);
		expect(task.scrollTop).toBe(scroll);
		expect(notification.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			screen.getByRole('navigation', { name: 'Workbench views' }).getBoundingClientRect().top
		);
		controller.feedback.dismissToast(controller.feedback.toasts[0].id);
		await waitFor(() => expect(notification.getBoundingClientRect().height).toBe(0));
		expect(trigger).toHaveFocus();
		expect(trigger.getBoundingClientRect().top).toBe(top);
	}
);

import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Diagnostic, EditorHandle, PerformerRecord } from '../core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';
import DiagnosticPopover from './overlays/DiagnosticPopover.svelte';
import PerformerPicker from './overlays/PerformerPicker.svelte';

function performers(): PerformerRecord[] {
	return ['Avery', 'Blair'].map((displayName, order) => ({
		id: displayName.toLocaleLowerCase(),
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

function context(overrides: Partial<EditorDisplayContext> = {}): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'test',
		...overrides
	};
}

function callbacks(): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn()
	};
}

async function mountEditor(options?: {
	text?: string;
	selection?: { anchor: number; head: number };
	displayContext?: EditorDisplayContext;
	editorCallbacks?: LyricEditorCallbacks;
}): Promise<{ handle: EditorHandle; editorCallbacks: LyricEditorCallbacks }> {
	const editorCallbacks = options?.editorCallbacks ?? callbacks();
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: options?.text ?? 'First line',
			initialSelection: options?.selection,
			context: options?.displayContext ?? context(),
			callbacks: editorCallbacks,
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) {
		throw new Error('Editor did not expose its handle.');
	}
	return { handle, editorCallbacks };
}

function testDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		ruleId: 'test-rule',
		severity: 'warning',
		from: 0,
		to: 5,
		message: 'Test issue',
		explanation: 'This diagnostic needs attention.',
		sourceIds: [],
		...overrides
	};
}

async function pressMod(key: string, shift = false): Promise<void> {
	const modifier = navigator.platform.toLocaleLowerCase().includes('mac') ? 'Meta' : 'Control';
	const shiftDown = shift ? '{Shift>}' : '';
	const shiftUp = shift ? '{/Shift}' : '';
	await userEvent.keyboard(`{${modifier}>}${shiftDown}${key}${shiftUp}{/${modifier}}`);
}

afterEach(() => {
	document.querySelectorAll('[data-test-focus-return]').forEach((node) => node.remove());
});

describe('EditorPane', () => {
	it('mounts CodeMirror in the browser and preserves initial text', async () => {
		const { handle } = await mountEditor({ text: '[Verse]\nHello' });

		expect(handle.getSnapshot().text).toBe('[Verse]\nHello');
		await expect.element(page.getByText('[Verse]')).toBeVisible();
	});

	it('canonicalizes a CRLF document to LF once, deterministically', async () => {
		const { handle } = await mountEditor({ text: 'First\r\nSecond\r\n' });
		expect(handle.getSnapshot().text).toBe('First\nSecond\n');
	});

	it('keeps an LF document unchanged', async () => {
		const { handle } = await mountEditor({ text: 'First\nSecond\n' });
		expect(handle.getSnapshot().text).toBe('First\nSecond\n');
	});

	it('does not emit snapshots for effects-only context updates', async () => {
		// Regression: context application dispatches CodeMirror effects; emitting
		// snapshots for those transactions forms an infinite shell↔editor cycle
		// (effect_update_depth_exceeded) because the shell re-derives context
		// from every snapshot.
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: '[Verse]\nHello',
				context: context(),
				callbacks: editorCallbacks
			}
		});
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		const snapshotCalls = vi.mocked(editorCallbacks.onSnapshot).mock.calls.length;

		await screen.rerender({
			context: { ...context(), ruleSetVersion: 'context-change-only' }
		});
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(vi.mocked(editorCallbacks.onSnapshot).mock.calls.length).toBe(snapshotCalls);
	});

	it('sets content language and direction attributes and updates the language', async () => {
		let handle: EditorHandle | undefined;
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: 'مرحبا',
				context: context({ language: 'ar' }),
				callbacks: editorCallbacks,
				onready: (readyHandle: EditorHandle) => {
					handle = readyHandle;
				}
			}
		});
		const textbox = page.getByRole('textbox', { name: 'Lyrics editor' });
		await expect.element(textbox).toHaveAttribute('lang', 'ar');
		await expect.element(textbox).toHaveAttribute('dir', 'auto');

		await screen.rerender({
			initialText: 'مرحبا',
			context: context({ language: 'he' }),
			callbacks: editorCallbacks,
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		});
		await expect.element(textbox).toHaveAttribute('lang', 'he');
		expect(handle).toBeDefined();
	});

	it('applies a multi-change atomic edit as one undo step', async () => {
		const original = 'Verse\nhello';
		const { handle } = await mountEditor({ text: original, selection: { anchor: 6, head: 11 } });

		handle.dispatchAtomic({
			baseRevision: 0,
			edits: [
				{ from: 0, to: 5, insert: '[Verse: Avery]' },
				{ from: 6, to: 11, insert: '<i>hello</i>' }
			],
			selectionAfter: { anchor: 22, head: 27 }
		});
		expect(handle.getSnapshot().text).toBe('[Verse: Avery]\n<i>hello</i>');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(original);
		expect(handle.getSnapshot().selection).toEqual({ anchor: 6, head: 11 });

		handle.undo();
		expect(handle.getSnapshot().text).toBe(original);
	});

	it('discards diagnostics tagged with a stale revision', async () => {
		const stale: Diagnostic = {
			ruleId: 'test-rule',
			severity: 'warning',
			from: 0,
			to: 5,
			message: 'Stale issue',
			explanation: 'This result belongs to revision zero.',
			sourceIds: []
		};
		let handle: EditorHandle | undefined;
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: 'hello',
				context: context({ diagnostics: { revision: 0, items: [stale] } }),
				callbacks: editorCallbacks,
				onready: (readyHandle: EditorHandle) => {
					handle = readyHandle;
				}
			}
		});
		await expect.element(page.getByRole('button', { name: /warning: Stale issue/u })).toBeVisible();
		if (!handle) {
			throw new Error('Editor did not expose its handle.');
		}

		handle.dispatchAtomic({
			baseRevision: 0,
			edits: [{ from: 0, to: 0, insert: '!' }]
		});
		await screen.rerender({
			initialText: 'hello',
			context: context({ diagnostics: { revision: 0, items: [stale] } }),
			callbacks: editorCallbacks,
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		});

		await expect
			.element(page.getByRole('button', { name: /warning: Stale issue/u }))
			.not.toBeInTheDocument();
		expect(handle.getSnapshot().diagnostics).toEqual([]);
	});

	it('suppresses selection UI and diagnostic refresh during IME composition', async () => {
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: '日本語',
				initialSelection: { anchor: 0, head: 3 },
				context: context({ performers: performers() }),
				callbacks: editorCallbacks
			}
		});
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		const content = document.querySelector<HTMLElement>('.cm-content');
		if (!content) {
			throw new Error('Missing CodeMirror content element.');
		}
		content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'に' }));

		const pendingDiagnostic: Diagnostic = {
			ruleId: 'ime-rule',
			severity: 'error',
			from: 0,
			to: 1,
			message: 'Incomplete composition',
			explanation: 'Must not appear during composition.',
			sourceIds: []
		};
		await screen.rerender({
			initialText: '日本語',
			initialSelection: { anchor: 0, head: 3 },
			context: context({
				performers: performers(),
				diagnostics: { revision: 0, items: [pendingDiagnostic] }
			}),
			callbacks: editorCallbacks
		});
		await new Promise((resolve) => window.setTimeout(resolve, 100));

		await expect
			.element(page.getByRole('toolbar', { name: 'Assign performers' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /Incomplete composition/u }))
			.not.toBeInTheDocument();

		content.dispatchEvent(
			new CompositionEvent('compositionend', { bubbles: true, data: '日本語' })
		);
	});

	it('opens assignment UI only for a user-driven selection', async () => {
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({ performers: performers() })
		});

		handle.setSelection({ anchor: 0, head: 5 });
		await new Promise((resolve) => window.setTimeout(resolve, 100));
		await expect
			.element(page.getByRole('toolbar', { name: 'Assign performers' }))
			.not.toBeInTheDocument();

		handle.setSelection({ anchor: 0, head: 0 });
		handle.focus();
		await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}');
		await expect.element(page.getByRole('toolbar', { name: 'Assign performers' })).toBeVisible();
		expect(handle.getSnapshot().selection).toEqual({ anchor: 0, head: 2 });
	});

	it('still opens assignment explicitly with Alt+P for a programmatic selection', async () => {
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({ performers: performers() })
		});

		handle.setSelection({ anchor: 0, head: 5 });
		handle.focus();
		await userEvent.keyboard('{Alt>}p{/Alt}');

		await expect.element(page.getByRole('toolbar', { name: 'Assign performers' })).toBeVisible();
	});

	it('keeps F8 diagnostic navigation visible when a performer roster exists', async () => {
		const issue = testDiagnostic();
		const { handle } = await mountEditor({
			text: 'hello world',
			selection: { anchor: 6, head: 6 },
			displayContext: context({
				performers: performers(),
				diagnostics: { revision: 0, items: [issue] }
			})
		});

		handle.focus();
		await userEvent.keyboard('{F8}');

		const popover = page.getByRole('dialog', { name: 'Diagnostic details' });
		await expect.element(popover).toBeVisible();
		await expect.element(popover).toHaveFocus();
		await expect.element(page.getByText('Test issue')).toBeVisible();
		await expect
			.element(page.getByRole('toolbar', { name: 'Assign performers' }))
			.not.toBeInTheDocument();
	});

	it('focuses keyboard-opened diagnostics and closes them with Escape from editor focus', async () => {
		const issue = testDiagnostic({
			fixes: [
				{
					kind: 'safe',
					label: 'Replace greeting',
					edit: {
						baseRevision: 0,
						edits: [{ from: 0, to: 5, insert: 'hi' }]
					}
				}
			]
		});
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({ diagnostics: { revision: 0, items: [issue] } })
		});

		handle.focus();
		await pressMod('.');
		await expect.element(page.getByRole('button', { name: /Replace greeting/u })).toHaveFocus();

		handle.focus();
		await userEvent.keyboard('{Escape}');
		await expect
			.element(page.getByRole('dialog', { name: 'Diagnostic details' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toHaveFocus();
	});

	it('announces performer identity only when the caret enters a highlighted range', async () => {
		const editorCallbacks = callbacks();
		const { handle } = await mountEditor({
			text: 'hello x',
			selection: { anchor: 6, head: 6 },
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from: 0,
						to: 5,
						group: { id: 'voice-a', performerIds: ['avery'], styleSlot: 3 }
					}
				]
			}),
			editorCallbacks
		});

		handle.setSelection({ anchor: 1, head: 1 });
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledWith('Performed by Avery');
		handle.setSelection({ anchor: 2, head: 2 });
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledTimes(1);
		handle.setSelection({ anchor: 6, head: 6 });
		handle.setSelection({ anchor: 3, head: 3 });
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledTimes(2);

		const highlight = document.querySelector<HTMLElement>('.ll-performer-slot-3');
		expect(highlight).not.toBeNull();
		expect(getComputedStyle(highlight!).borderBottomStyle).toBe('dashed');
	});

	it('uses the containing section start for the section shortcut and editor handle', async () => {
		const createSectionHeaderEdit = vi.fn(({ range }: { range: { from: number; to: number } }) =>
			range.from === 0
				? {
						baseRevision: 0,
						edits: [{ from: 0, to: 0, insert: '[Verse]\n' }]
					}
				: undefined
		);
		const editorCallbacks: LyricEditorCallbacks = {
			...callbacks(),
			createSectionHeaderEdit
		};
		const languagePack = {
			tag: 'en',
			displayName: 'English',
			policy: 'localized' as const,
			headers: [{ semanticPart: 'verse', terms: ['Verse'] }],
			sourceIds: [],
			reviewed: true
		};
		const { handle } = await mountEditor({
			text: 'first line\nsecond line',
			selection: { anchor: 14, head: 14 },
			displayContext: context({ languagePack }),
			editorCallbacks
		});

		handle.focus();
		await pressMod('h', true);
		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: 'Verse' }));
		expect(createSectionHeaderEdit).toHaveBeenCalledWith(
			expect.objectContaining({ range: expect.objectContaining({ from: 0 }) })
		);
		expect(handle.getSnapshot().text).toBe('[Verse]\nfirst line\nsecond line');

		handle.undo();
		handle.setSelection({ anchor: 14, head: 14 });
		handle.requestSectionHeader?.();
		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();
	});

	it('shows a non-document ghost row for a headerless section', async () => {
		const { handle } = await mountEditor({ text: 'A lyric line' });

		await expect.element(page.getByRole('button', { name: '+ Add section header' })).toBeVisible();
		expect(handle.getSnapshot().text).toBe('A lyric line');
	});
});

describe('PerformerPicker keyboard flow', () => {
	it('toggles a joint group with Space, applies with Enter, and returns focus', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onApply = vi.fn();
		const onCancel = vi.fn();

		await render(PerformerPicker, {
			performers: performers(),
			onApply,
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		await expect.element(page.getByRole('button', { name: 'Avery' })).toHaveFocus();

		await userEvent.keyboard(' ');
		await userEvent.keyboard('{ArrowRight}');
		await userEvent.keyboard(' ');
		await userEvent.keyboard('{Enter}');

		expect(onApply).toHaveBeenCalledWith(['avery', 'blair']);
		expect(focusTarget).toBe(document.activeElement);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it('cancels with Escape and returns focus', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onCancel = vi.fn();

		await render(PerformerPicker, {
			performers: performers(),
			onApply: vi.fn(),
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		await userEvent.keyboard('{Escape}');

		expect(onCancel).toHaveBeenCalledOnce();
		expect(focusTarget).toBe(document.activeElement);
	});

	it('lets Enter on Cancel run cancel without applying', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onApply = vi.fn();
		const onCancel = vi.fn();

		await render(PerformerPicker, {
			performers: performers(),
			initialSelectedIds: ['avery'],
			onApply,
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		const cancel = page.getByRole('button', { name: 'Cancel' });
		cancel.element().focus();
		await userEvent.keyboard('{Enter}');

		expect(onCancel).toHaveBeenCalledOnce();
		expect(onApply).not.toHaveBeenCalled();
	});
});

describe('DiagnosticPopover fix flow', () => {
	it('requires preview fixes to be activated twice and keeps safe fixes one-click', async () => {
		const previewFix = {
			kind: 'preview' as const,
			label: 'Replace word',
			edit: {
				baseRevision: 0,
				edits: [{ from: 0, to: 5, insert: 'world' }]
			}
		};
		const safeFix = {
			kind: 'safe' as const,
			label: 'Remove mark',
			edit: {
				baseRevision: 0,
				edits: [{ from: 5, to: 6, insert: '' }]
			}
		};
		const onApplyFix = vi.fn();
		await render(DiagnosticPopover, {
			diagnostic: testDiagnostic({ to: 6, fixes: [previewFix, safeFix] }),
			documentText: 'hello!',
			onApplyFix,
			onIgnore: vi.fn()
		});

		await userEvent.click(page.getByRole('button', { name: /Replace word Preview/u }));
		expect(onApplyFix).not.toHaveBeenCalled();
		await expect.element(page.getByText('hello')).toBeVisible();
		await expect.element(page.getByText('world')).toBeVisible();

		await userEvent.click(page.getByRole('button', { name: /Apply Replace word Confirm/u }));
		expect(onApplyFix).toHaveBeenCalledWith(previewFix);

		await userEvent.click(page.getByRole('button', { name: /Remove mark Safe fix/u }));
		expect(onApplyFix).toHaveBeenCalledWith(safeFix);
		expect(onApplyFix).toHaveBeenCalledTimes(2);
	});
});

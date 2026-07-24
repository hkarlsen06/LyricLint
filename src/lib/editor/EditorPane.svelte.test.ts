import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Diagnostic, EditorCallbacks, EditorHandle, PerformerRecord } from '../core/types.js';
import type { EditorDisplayContext } from './contracts.js';
import EditorPane from './EditorPane.svelte';
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

function callbacks(): EditorCallbacks {
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
	editorCallbacks?: EditorCallbacks;
}): Promise<{ handle: EditorHandle; editorCallbacks: EditorCallbacks }> {
	const editorCallbacks = options?.editorCallbacks ?? callbacks();
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: options?.text ?? 'First line',
			initialSelection: options?.selection,
			context: options?.displayContext ?? context(),
			callbacks: editorCallbacks,
			onready: (readyHandle) => {
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

afterEach(() => {
	document.querySelectorAll('[data-test-focus-return]').forEach((node) => node.remove());
});

describe('EditorPane', () => {
	it('mounts CodeMirror in the browser and preserves initial text', async () => {
		const { handle } = await mountEditor({ text: '[Verse]\nHello' });

		expect(handle.getSnapshot().text).toBe('[Verse]\nHello');
		await expect.element(page.getByText('[Verse]')).toBeVisible();
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
				onready: (readyHandle) => {
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
			onready: (readyHandle) => {
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

	it('anchors a settled selection without changing the CodeMirror selection', async () => {
		const { handle } = await mountEditor({
			text: 'hello world',
			selection: { anchor: 0, head: 5 },
			displayContext: context({ performers: performers() })
		});

		await expect.element(page.getByRole('toolbar', { name: 'Assign performers' })).toBeVisible();
		expect(handle.getSnapshot().selection).toEqual({ anchor: 0, head: 5 });
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
});

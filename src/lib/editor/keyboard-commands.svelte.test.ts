import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Diagnostic, EditorHandle } from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

function callbacks(overrides: Partial<LyricEditorCallbacks> = {}): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn(),
		...overrides
	};
}

function context(diagnostics: readonly Diagnostic[] = []): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'keyboard-test',
		diagnostics: { revision: 0, items: diagnostics },
		languagePack: {
			tag: 'en',
			displayName: 'English',
			policy: 'localized',
			headers: [{ semanticPart: 'Verse', terms: ['Verse', 'Chorus'] }],
			sourceIds: [],
			reviewed: true
		}
	};
}

async function mount(options: {
	text: string;
	selection?: { anchor: number; head: number };
	diagnostics?: readonly Diagnostic[];
	editorCallbacks?: LyricEditorCallbacks;
}): Promise<{ handle: EditorHandle; editorCallbacks: LyricEditorCallbacks }> {
	let handle: EditorHandle | undefined;
	const editorCallbacks = options.editorCallbacks ?? callbacks();
	await render(EditorPane, {
		props: {
			initialText: options.text,
			initialSelection: options.selection,
			context: context(options.diagnostics),
			callbacks: editorCallbacks,
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return { handle, editorCallbacks };
}

async function pressMod(key: string, shift = false): Promise<void> {
	const modifier = navigator.platform.toLocaleLowerCase().includes('mac') ? 'Meta' : 'Control';
	const shiftDown = shift ? '{Shift>}' : '';
	const shiftUp = shift ? '{/Shift}' : '';
	await userEvent.keyboard(`{${modifier}>}${shiftDown}${key}${shiftUp}{/${modifier}}`);
}

function diagnostic(from: number, to: number, message: string, withFix = false): Diagnostic {
	return {
		ruleId: `test.${from}`,
		severity: 'warning',
		from,
		to,
		message,
		explanation: `${message} explanation`,
		sourceIds: [],
		...(withFix
			? {
					fixes: [
						{
							kind: 'safe' as const,
							label: 'Replace word',
							edit: {
								baseRevision: 0,
								edits: [{ from, to, insert: 'fixed' }]
							}
						}
					]
				}
			: {})
	};
}

describe('LyricLint keyboard commands through CodeMirror', () => {
	it('opens the section picker for the section containing the caret', async () => {
		const text = '[Verse]\nFirst\n\n[Chorus]\nSecond';
		const secondSectionFrom = text.indexOf('[Chorus]');
		const editorCallbacks = callbacks();
		const { handle } = await mount({
			text,
			selection: { anchor: text.indexOf('Second') + 2, head: text.indexOf('Second') + 2 },
			editorCallbacks
		});

		handle.focus();
		await pressMod('h', true);

		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();
		expect(editorCallbacks.onSectionHeaderRequest).toHaveBeenCalledOnce();
		expect(editorCallbacks.onSectionHeaderRequest).toHaveBeenCalledWith({
			range: { from: secondSectionFrom, to: secondSectionFrom + '[Chorus]'.length },
			prefer: 'above'
		});
	});

	it('cycles forward and backward diagnostics with F8 and Shift+F8', async () => {
		const issues = [diagnostic(0, 3, 'First issue'), diagnostic(4, 7, 'Second issue')];
		const { handle } = await mount({
			text: 'one two',
			selection: { anchor: 3, head: 3 },
			diagnostics: issues
		});

		handle.focus();
		await userEvent.keyboard('{F8}');
		expect(handle.getSnapshot().selection).toEqual({ anchor: 4, head: 7 });
		await expect.element(page.getByText('Second issue', { exact: true })).toBeVisible();

		handle.focus();
		await userEvent.keyboard('{Shift>}{F8}{/Shift}');
		expect(handle.getSnapshot().selection).toEqual({ anchor: 0, head: 3 });
		await expect.element(page.getByText('First issue', { exact: true })).toBeVisible();
	});

	it('opens the available fix with Mod+.', async () => {
		const { handle } = await mount({
			text: 'bad word',
			selection: { anchor: 1, head: 1 },
			diagnostics: [diagnostic(0, 3, 'Fixable issue', true)]
		});

		handle.focus();
		await pressMod('.');

		await expect.element(page.getByRole('dialog', { name: 'Diagnostic details' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /Replace word/u })).toHaveFocus();
	});

	it('withholds composition snapshots and resumes lint exactly once after compositionend', async () => {
		const lint = vi.fn();
		const editorCallbacks = callbacks({
			onSnapshot: (snapshot) => {
				if (!snapshot.composing) lint(snapshot.text);
			}
		});
		await mount({ text: '日本語', editorCallbacks });
		const textbox = page.getByRole('textbox', { name: 'Lyrics editor' }).element();

		textbox.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'に' }));
		await new Promise((resolve) => window.setTimeout(resolve, 20));
		expect(lint).not.toHaveBeenCalled();

		textbox.dispatchEvent(
			new CompositionEvent('compositionend', { bubbles: true, data: '日本語' })
		);
		await new Promise((resolve) => window.setTimeout(resolve, 50));
		expect(lint).toHaveBeenCalledOnce();
		expect(lint).toHaveBeenCalledWith('日本語');
	});
});

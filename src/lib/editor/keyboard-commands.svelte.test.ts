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
	const finding: Diagnostic = {
		ruleId: `test.${from}`,
		severity: 'warning',
		from,
		to,
		message,
		explanation: `${message} explanation`,
		sourceIds: []
	};
	if (withFix) {
		finding.fixes = [
			{
				kind: 'safe',
				label: 'Replace word',
				edit: {
					baseRevision: 0,
					edits: [{ from, to, insert: 'fixed' }]
				}
			}
		];
	}
	return finding;
}

describe('LyricLint keyboard commands through CodeMirror', () => {
	it('opens the section picker at the caret line when its section already has a header', async () => {
		const text = '[Verse]\nFirst\n\n[Chorus]\nSecond';
		const caretLineFrom = text.indexOf('Second');
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
			range: { from: caretLineFrom, to: text.length },
			prefer: 'above'
		});
	});

	// `Ctrl-Alt` is the modifier that survives macOS, where a bare Alt-letter
	// binding never resolves; `Alt-P` is kept for the platforms it always worked
	// on, so both have to be asserted.
	it('opens performer assignment with Ctrl+Alt+P', async () => {
		const editorCallbacks = callbacks();
		const { handle } = await mount({
			// Headed, because assignment refuses a range with no legend to write
			// into: the binding is what these two pin, not the refusal.
			text: '[Verse]\none two three',
			selection: { anchor: 8, head: 11 },
			editorCallbacks
		});

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}p{/Alt}{/Control}');

		expect(editorCallbacks.onAssignRequest).toHaveBeenCalledOnce();
		expect(editorCallbacks.onAssignRequest).toHaveBeenCalledWith({
			range: { from: 8, to: 11 },
			prefer: 'above'
		});
	});

	it('keeps Alt+P as an alias for performer assignment', async () => {
		const editorCallbacks = callbacks();
		const { handle } = await mount({
			// Headed, because assignment refuses a range with no legend to write
			// into: the binding is what these two pin, not the refusal.
			text: '[Verse]\none two three',
			selection: { anchor: 8, head: 11 },
			editorCallbacks
		});

		handle.focus();
		await userEvent.keyboard('{Alt>}p{/Alt}');

		expect(editorCallbacks.onAssignRequest).toHaveBeenCalledOnce();
		expect(editorCallbacks.onAssignRequest).toHaveBeenCalledWith({
			range: { from: 8, to: 11 },
			prefer: 'above'
		});
	});

	// The action bar prints this keystroke under its own button, so the binding
	// has to exist for the caption to be true. The shell owns the edit: this asks
	// and nothing else, which is why the assertion is on the hook rather than on
	// the document.
	it('asks the shell for the unknown-lyric marker with Ctrl+Alt+U', async () => {
		const onUnknownMarkerRequest = vi.fn(() => true);
		const editorCallbacks = callbacks({ onUnknownMarkerRequest });
		const { handle } = await mount({
			text: '[Verse]\nI heard something',
			selection: { anchor: 8, head: 13 },
			editorCallbacks
		});

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}u{/Alt}{/Control}');

		expect(onUnknownMarkerRequest).toHaveBeenCalledOnce();
		// The editor wrote nothing itself.
		expect(handle.getSnapshot().text).toBe('[Verse]\nI heard something');
	});

	// No `preventDefault: true` on that binding, because the option prevents the
	// default even when the command returns false — and it returns false whenever
	// no shell is listening, which would swallow the keystroke in an editor that
	// never bound it. This is the same trap the sync-mode bindings document.
	it('lets Ctrl+Alt+U through when no shell is listening', async () => {
		const { handle } = await mount({
			text: '[Verse]\nI heard something',
			selection: { anchor: 8, head: 8 },
			editorCallbacks: callbacks()
		});

		handle.focus();
		const event = new KeyboardEvent('keydown', {
			key: 'u',
			code: 'KeyU',
			ctrlKey: true,
			altKey: true,
			bubbles: true,
			cancelable: true
		});
		document.activeElement?.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
	});

	it('cycles forward and backward diagnostics with Ctrl+Alt+. and Ctrl+Alt+,', async () => {
		const issues = [diagnostic(0, 3, 'First issue'), diagnostic(4, 7, 'Second issue')];
		const { handle } = await mount({
			text: 'one two',
			selection: { anchor: 3, head: 3 },
			diagnostics: issues
		});

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>}.{/Alt}{/Control}');
		expect(handle.getSnapshot().selection).toEqual({ anchor: 4, head: 7 });
		await expect.element(page.getByText('Second issue', { exact: true })).toBeVisible();

		handle.focus();
		await userEvent.keyboard('{Control>}{Alt>},{/Alt}{/Control}');
		expect(handle.getSnapshot().selection).toEqual({ anchor: 0, head: 3 });
		await expect.element(page.getByText('First issue', { exact: true })).toBeVisible();
		expect(handle.getSnapshot().text).toBe('one two');
	});

	it('cycles forward and backward diagnostics with F2 and Shift+F2', async () => {
		const issues = [diagnostic(0, 3, 'First issue'), diagnostic(4, 7, 'Second issue')];
		const { handle } = await mount({
			text: 'one two',
			selection: { anchor: 3, head: 3 },
			diagnostics: issues
		});

		handle.focus();
		await userEvent.keyboard('{F2}');
		expect(handle.getSnapshot().selection).toEqual({ anchor: 4, head: 7 });
		await expect.element(page.getByText('Second issue', { exact: true })).toBeVisible();

		handle.focus();
		await userEvent.keyboard('{Shift>}{F2}{/Shift}');
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

	it('prunes an unused legend slot in the same transaction and restores it with one undo', async () => {
		const text = '[Verse: Mara, <i>Jun</i>]\nMara sings\n<i>Jun sings</i>';
		const { handle } = await mount({ text });
		const spanFrom = text.indexOf('<i>Jun sings</i>');

		handle.dispatchAtomic({
			baseRevision: 0,
			edits: [{ from: spanFrom, to: spanFrom + '<i>Jun sings</i>'.length, insert: '' }]
		});
		expect(handle.getSnapshot().text).toBe('[Verse: Mara]\nMara sings\n');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(text);
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
		// The editor emits one snapshot at mount (lint-on-load); composition
		// suppression is measured relative to that baseline.
		lint.mockClear();

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

	// The transport triad is the shell's, bound to the window so it answers while
	// the caret is anywhere — including here. What the editor owes it is passage:
	// the keystroke has to reach the window unclaimed, leaving the document and
	// the caret exactly where they were, because a transport key is pressed
	// mid-word.
	it('lets the transport triad through to the window, mid-word and unclaimed', async () => {
		const { handle } = await mount({
			text: 'one two three',
			selection: { anchor: 5, head: 5 }
		});
		const seen: KeyboardEvent[] = [];
		const watch = (event: Event): void => void seen.push(event as KeyboardEvent);
		window.addEventListener('keydown', watch);

		try {
			handle.focus();
			await userEvent.keyboard('{Control>}{Alt>}k{/Alt}{/Control}');
			await userEvent.keyboard('{Control>}{Alt>}j{/Alt}{/Control}');
			await userEvent.keyboard('{Control>}{Alt>}l{/Alt}{/Control}');
		} finally {
			window.removeEventListener('keydown', watch);
		}

		const triad = seen.filter((event) => ['j', 'k', 'l'].includes(event.key.toLowerCase()));
		expect(triad).toHaveLength(3);
		// Unclaimed: nothing in the editor may prevent a key it no longer binds, or
		// the shell's listener would be handling an event someone else had answered.
		expect(triad.every((event) => !event.defaultPrevented)).toBe(true);
		expect(handle.getSnapshot().selection).toEqual({ anchor: 5, head: 5 });
		expect(handle.getSnapshot().text).toBe('one two three');
	});
});

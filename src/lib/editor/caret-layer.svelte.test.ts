import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

/*
 * The caret is drawn in a layer above the document's fills, because the native
 * one paints under any child with a background — on a performer-tinted line it
 * typed into the right place and could not be seen.
 */

function callbacks(): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onAnnouncement: vi.fn()
	};
}

function context(): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'caret-layer-test',
		diagnostics: { revision: 0, items: [] }
	};
}

async function mount(text: string): Promise<{ handle: EditorHandle; content: HTMLElement }> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: text,
			context: context(),
			callbacks: callbacks(),
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	const textbox = page.getByRole('textbox', { name: 'Lyrics editor' });
	await expect.element(textbox).toBeVisible();
	if (!handle) throw new Error('CodeMirror did not publish its editor handle.');
	return { handle, content: textbox.element() as HTMLElement };
}

describe('the drawn caret', () => {
	it('draws in its own layer while focused, above the line fills, and only then', async () => {
		const { handle, content } = await mount('[Verse]\nHello line');
		const editor = content.closest('.cm-editor')!;

		handle.focus();
		handle.setSelection({ anchor: 10, head: 10 });
		await vi.waitFor(() => {
			const caret = editor.querySelector<HTMLElement>('.ll-caret-layer .ll-caret');
			expect(caret).toBeTruthy();
			// Shown while focused: the display gate is what stands in for the
			// native caret's own focus behavior.
			expect(getComputedStyle(caret!).display).toBe('block');
		});

		// Above the content, so no line fill — performer tint, fix preview,
		// active-line wash — can paint over it.
		const caretLayer = editor.querySelector<HTMLElement>('.ll-caret-layer')!;
		expect(Number(getComputedStyle(caretLayer).zIndex)).toBeGreaterThan(1);

		// And the native caret is transparent, so there are not two.
		expect(getComputedStyle(content).caretColor).toBe('rgba(0, 0, 0, 0)');

		content.blur();
		await vi.waitFor(() => {
			const caret = editor.querySelector<HTMLElement>('.ll-caret-layer .ll-caret');
			if (caret) expect(getComputedStyle(caret).display).toBe('none');
		});
	});

	it('draws no caret marker over a range selection', async () => {
		const { handle, content } = await mount('[Verse]\nHello line');
		const editor = content.closest('.cm-editor')!;

		handle.focus();
		handle.setSelection({ anchor: 8, head: 13 });
		await vi.waitFor(() => {
			// The native selection highlight is the answer for a range; a drawn
			// caret at its head would be a mark nobody asked for.
			expect(editor.querySelector('.ll-caret-layer .ll-caret')).toBeNull();
		});
	});
});

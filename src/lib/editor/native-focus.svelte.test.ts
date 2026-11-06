import { page } from 'vitest/browser';
import { EditorView } from '@codemirror/view';
import { expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EditorPane from './EditorPane.svelte';
import type { EditorHandle } from '#lib/core/types.js';

it('synchronizes native focus immediately without replacing pointer or composition selection', async () => {
	let handle: EditorHandle | undefined;
	const rendered = await render(EditorPane, {
		props: {
			initialText: 'First passage\nSecond passage',
			context: { language: 'en', performers: [], ruleSetVersion: 'test' },
			callbacks: {
				onSnapshot: vi.fn(),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onDiagnosticHighlight: vi.fn(),
				onAnnouncement: vi.fn(),
				onPerformerRenamed: vi.fn()
			},
			onready: (ready: EditorHandle) => {
				handle = ready;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	await vi.waitFor(() => expect(handle).toBeDefined());
	const content = rendered.container.querySelector<HTMLElement>('.cm-content');
	if (!content) throw new Error('Editor content missing');
	const view = EditorView.findFromDOM(content);
	if (!view) throw new Error('Editor view missing');
	const outside = document.createElement('button');
	document.body.append(outside);
	try {
		view.dispatch({ selection: { anchor: 5 } });
		view.focus();
		outside.focus();
		const stale = view.domAtPos(20);
		const selection = document.getSelection();
		if (!selection) throw new Error('Native selection missing');
		selection.collapse(stale.node, stale.offset);
		content.focus();
		expect(
			selection.anchorNode && view.posAtDOM(selection.anchorNode, selection.anchorOffset)
		).toBe(5);
		expect(view.state.selection.main.head).toBe(5);

		const focus = vi.spyOn(view, 'focus');
		try {
			outside.focus();
			content.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			content.focus();
			expect(focus).not.toHaveBeenCalled();

			outside.focus();
			const composing = vi.spyOn(view, 'compositionStarted', 'get').mockReturnValue(true);
			try {
				content.focus();
				expect(focus).not.toHaveBeenCalled();
			} finally {
				composing.mockRestore();
			}
		} finally {
			focus.mockRestore();
		}
	} finally {
		outside.remove();
	}
});

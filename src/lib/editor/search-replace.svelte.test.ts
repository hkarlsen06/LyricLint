import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import type { LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

function callbacks(): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onDiagnosticHighlight: vi.fn(),
		onAnnouncement: vi.fn(),
		onPerformerRenamed: vi.fn()
	};
}

async function mount(): Promise<EditorHandle> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: 'Echo one\nEcho two\nEcho three',
			context: { language: 'en', performers: [], ruleSetVersion: 'test' },
			callbacks: callbacks(),
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) throw new Error('Editor did not expose its handle.');
	return handle;
}

/** The shortcut is bound to the window, so it opens the bar from outside the editor too. */
function openFind(): void {
	const outsideEditor = document.createElement('button');
	document.body.append(outsideEditor);
	outsideEditor.focus();
	try {
		const mac = /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
		const shortcut = new KeyboardEvent('keydown', {
			key: 'f',
			bubbles: true,
			cancelable: true,
			metaKey: mac,
			ctrlKey: !mac
		});
		outsideEditor.dispatchEvent(shortcut);
		expect(shortcut.defaultPrevented).toBe(true);
	} finally {
		outsideEditor.remove();
	}
}

describe('find and replace', () => {
	it('finds every match and replaces one chosen instance or all remaining instances', async () => {
		const handle = await mount();
		openFind();

		const find = page.getByRole('textbox', { name: 'Find' });
		await expect.element(find).toBeVisible();
		await find.fill('echo');
		await expect.poll(() => document.querySelectorAll('.cm-searchMatch').length).toBe(3);
		await expect.poll(() => document.querySelector('.ll-find__status')?.textContent).toBe('1 of 3');

		// A lower-case query matches either case; a capital in it means the user meant one.
		await find.fill('Echo one');
		await expect.poll(() => document.querySelectorAll('.cm-searchMatch').length).toBe(1);
		await find.fill('echo');

		// The current match previews its replacement as a diff, and only that one.
		const replace = page.getByRole('textbox', { name: 'Replace with' });
		await expect.element(replace).toBeVisible();
		await replace.fill('Song');
		await expect.poll(() => document.querySelectorAll('.ll-fix-preview-insert').length).toBe(1);
		expect(document.querySelector('.ll-fix-preview-insert')?.textContent).toBe('Song');
		expect(document.querySelector('.ll-find-preview-remove')?.textContent).toBe('Echo');

		await page.getByRole('button', { name: 'Replace', exact: true }).click();
		expect(handle.getSnapshot().text).toBe('Song one\nEcho two\nEcho three');
		await expect.poll(() => document.querySelector('.ll-find__status')?.textContent).toBe('1 of 2');

		await page.getByRole('button', { name: 'Replace all 2' }).click();
		expect(handle.getSnapshot().text).toBe('Song one\nSong two\nSong three');
	});

	it('offers only what it can carry out', async () => {
		await mount();
		openFind();
		const find = page.getByRole('textbox', { name: 'Find' });
		await expect.element(find).toBeVisible();

		// Nothing to step through, nothing to replace, and no count worth stating.
		expect(document.querySelector('.ll-find__status')?.textContent).toBe('');
		expect(page.getByRole('button', { name: 'Replace', exact: true }).elements()).toHaveLength(0);

		await find.fill('nothing here');
		await expect
			.poll(() => document.querySelector('.ll-find__status')?.textContent)
			.toBe('No matches');
		expect(page.getByRole('button', { name: 'Next match' }).elements()).toHaveLength(0);

		// One match is one press: no step controls, and no `Replace all 1`.
		await find.fill('Echo one');
		await expect.poll(() => document.querySelector('.ll-find__status')?.textContent).toBe('1 of 1');
		expect(page.getByRole('button', { name: 'Next match' }).elements()).toHaveLength(0);
		// The commands arrive with the diff that explains them, so an empty
		// replacement offers nothing — and one match is one press, never `all 1`.
		expect(page.getByRole('button', { name: 'Replace', exact: true }).elements()).toHaveLength(0);
		await page.getByRole('textbox', { name: 'Replace with' }).fill('Song');
		await expect
			.poll(() => page.getByRole('button', { name: 'Replace', exact: true }).elements().length)
			.toBe(1);
		expect(page.getByRole('button', { name: 'Replace all 1' }).elements()).toHaveLength(0);
	});
});

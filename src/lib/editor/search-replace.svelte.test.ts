import { page, userEvent } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import type { LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';

function callbacks(overrides: Partial<LyricEditorCallbacks> = {}): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onDiagnosticHighlight: vi.fn(),
		onAnnouncement: vi.fn(),
		onPerformerRenamed: vi.fn(),
		...overrides
	};
}

async function mount(overrides: Partial<LyricEditorCallbacks> = {}): Promise<EditorHandle> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: 'Echo one\nEcho two\nEcho three',
			context: { language: 'en', performers: [], ruleSetVersion: 'test' },
			callbacks: callbacks(overrides),
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

	// The action tray's magnifier and `Mod-F` are the same command, because the
	// handle runs CodeMirror's own panel — the shortcut was folklore until the tray
	// drew it, and two implementations of one command is how they come to disagree
	// about which field ends up focused.
	//
	// It toggles, because the tray glyph is a pressed-state button sitting directly
	// over the row's own way out: the bar runs under the tray, so a second press on
	// the thing that opened it has to be a way back.
	it('toggles the same panel from the handle as the shortcut opens', async () => {
		const handle = await mount();

		expect(handle.toggleSearch).toBeTypeOf('function');
		handle.toggleSearch!();

		await expect.element(page.getByRole('textbox', { name: 'Find' })).toBeVisible();
		// It focuses the field it opened, which is the whole point of the press.
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Find');

		handle.toggleSearch!();
		expect(page.getByRole('textbox', { name: 'Find' }).query()).toBeNull();
	});

	// Three things open and close this panel and only one is the tray's own press,
	// so the panel reports rather than being asked — a glyph that only knew about
	// its own presses would burn accent over a bar `Escape` had already closed.
	it('reports every open and close to the shell', async () => {
		const openStates: boolean[] = [];
		const handle = await mount({ onSearchOpenChange: (open: boolean) => openStates.push(open) });

		handle.toggleSearch!();
		await expect.element(page.getByRole('textbox', { name: 'Find' })).toBeVisible();
		expect(openStates).toEqual([true]);

		handle.toggleSearch!();
		expect(openStates).toEqual([true, false]);
	});

	// The tray's magnifier is this bar's visible way out — it toggles, it sits over
	// the row's own right end, and it draws accent while the bar is open — so an
	// `✕` here would be a second control for a press the user already has, in the
	// row with least space for one. Re-adding it is the regression this pins.
	it('carries no close button, and still closes on Escape', async () => {
		const handle = await mount();
		handle.toggleSearch!();
		const find = page.getByRole('textbox', { name: 'Find' });
		await expect.element(find).toBeVisible();

		expect(page.getByRole('button', { name: 'Close find' }).elements()).toHaveLength(0);
		expect(document.querySelector('.ll-find__close')).toBeNull();

		await find.fill('echo');
		await userEvent.keyboard('{Escape}');
		await expect.poll(() => document.querySelectorAll('.ll-find').length).toBe(0);
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

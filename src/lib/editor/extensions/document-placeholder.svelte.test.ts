import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { EditorHandle } from '$lib/core/types.js';
import { norwegianLanguagePack } from '$lib/languages/no.js';
import { englishLanguagePack } from '$lib/languages/en.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from '../contracts.js';
import EditorPane from '../EditorPane.svelte';
import { placeholderGuidance } from './document-placeholder.js';

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

async function mount(options?: {
	text?: string;
	languagePack?: EditorDisplayContext['languagePack'];
}): Promise<EditorHandle> {
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: options?.text ?? '',
			context: {
				language: options?.languagePack?.tag ?? 'en',
				performers: [],
				ruleSetVersion: 'test',
				languagePack: options?.languagePack ?? englishLanguagePack
			},
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

function ghostLines(): string[] {
	return Array.from(document.querySelectorAll('.ll-placeholder-line')).map(
		(line) => line.textContent ?? ''
	);
}

describe('the empty-document placeholder', () => {
	it('shows the shape of a transcription where the caret is', async () => {
		await mount();

		expect(ghostLines()).toEqual(['[Verse 1]', placeholderGuidance, '\u00a0', '[Chorus]']);
	});

	// A header is document content, and the language picker is what decides it.
	// A ghost that stayed English would be modelling the shape the linter is
	// about to complain about.
	it('names the sections in the selected language', async () => {
		await mount({ languagePack: norwegianLanguagePack });

		expect(ghostLines()).toEqual(['[Vers 1]', placeholderGuidance, '\u00a0', '[Refreng]']);
	});

	// A screen reader cannot see a ghost, so it gets the guidance through the
	// textbox's own placeholder attribute rather than four announced fragments.
	it('keeps the drawn ghost out of the accessibility tree', async () => {
		await mount();

		const ghost = document.querySelector('.ll-placeholder');
		expect(ghost?.getAttribute('aria-hidden')).toBe('true');
		expect(document.querySelector('.cm-content')?.getAttribute('aria-placeholder')).toBe(
			placeholderGuidance
		);
	});

	// The browser draws the native caret at the height of the line box it stands
	// in, so a ghost left in flow put a four-row caret beside it.
	it('leaves the line it starts on one row tall', async () => {
		await mount();

		const line = document.querySelector('.cm-line');
		const ghost = document.querySelector('.ll-placeholder');
		if (!line || !ghost) throw new Error('The empty document did not draw its ghost.');
		expect(getComputedStyle(ghost).position).toBe('absolute');
		expect(line.getBoundingClientRect().height).toBeLessThan(
			ghost.getBoundingClientRect().height / 2
		);
	});

	it('is absent from a document that has something in it', async () => {
		await mount({ text: '[Verse 1]\nA lyric' });

		expect(document.querySelector('.ll-placeholder')).toBeNull();
	});

	it('leaves as soon as the document does not need it', async () => {
		const handle = await mount();

		handle.dispatchAtomic({
			baseRevision: 0,
			edits: [{ from: 0, to: 0, insert: 'A lyric' }]
		});

		await expect.poll(() => document.querySelector('.ll-placeholder')).toBeNull();
	});
});

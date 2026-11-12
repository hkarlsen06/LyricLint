import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test } from 'vitest';
import LiveRegion from '../primitives/LiveRegion.svelte';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';
import DraftStart from './DraftStart.svelte';

afterEach(cleanup);

describe('the start tray holds every way to begin an empty document', () => {
	// The contrast tier is the loudest thing on the screen. While the document
	// is empty it belongs to the way in, in the sheet, and the toolbar offers
	// neither end of the work.
	test('offers paste in the sheet, and nothing to take out in the toolbar', async () => {
		const { controller } = createTestWorkbench({ text: '' });
		await render(DraftStart, { controller });
		await render(DocumentToolbar, { controller });

		const paste = screen.getByRole('button', { name: 'Paste lyrics' });
		expect(paste.classList.contains('button--contrast')).toBe(true);
		expect(paste.closest('.draft-start')).not.toBeNull();
		expect(screen.getAllByRole('button', { name: 'Paste lyrics' })).toHaveLength(1);
		expect(screen.queryByRole('button', { name: 'Copy Genius' })).toBeNull();
	});

	test('leaves once the document has something in it', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nLine' });
		await render(DraftStart, { controller });

		expect(screen.queryByRole('button', { name: 'Paste lyrics' })).toBeNull();
		expect(screen.queryByRole('button', { name: "Load a sample 'scribe" })).toBeNull();
		expect(screen.queryByRole('group', { name: 'Lyric format' })).toBeNull();
	});

	test('pastes the clipboard into the empty document in one edit', async () => {
		const { controller, calls } = createTestWorkbench({
			text: '',
			clipboardText: '[Verse]\nPasted line'
		});
		await render(DraftStart, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Paste lyrics' }));

		await waitFor(() => expect(calls.dispatched).toHaveLength(1));
		expect(calls.dispatched[0]!.edits).toEqual([
			{ from: 0, to: 0, insert: '[Verse]\nPasted line' }
		]);
	});

	// Firefox gates a programmatic read behind its own prompt and Safari denies
	// it outright, but the keyboard path is still open in both. Put the caret
	// where that keystroke lands instead of explaining a permission.
	test('hands over to keyboard paste when the clipboard cannot be read', async () => {
		const { controller, calls, feedback } = createTestWorkbench({ text: '' });
		await render(DraftStart, { controller });
		await render(LiveRegion, { feedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Paste lyrics' }));

		await waitFor(() => expect(calls.focusCount).toBe(1));
		expect(calls.dispatched).toEqual([]);
		expect(screen.getByTestId('live-region').textContent).toContain('paste shortcut');
	});

	test('replaces the empty document with the sample transcription in one edit', async () => {
		const { controller, calls } = createTestWorkbench({ text: '' });
		await render(DraftStart, { controller });

		await fireEvent.click(screen.getByRole('button', { name: "Load a sample 'scribe" }));

		expect(calls.dispatched).toHaveLength(1);
		expect(calls.dispatched[0]!.edits[0]!.insert).toContain('[Verse 1]');
	});

	// English lyrics under another selection would open with a mismatch warning
	// about a document the user never wrote, so the offer is withdrawn rather
	// than made and then apologized for.
	test('withholds the sample when the selected language is not the sample’s', async () => {
		const { controller } = createTestWorkbench({ text: '' });
		controller.setLanguage('no');
		await render(DraftStart, { controller });

		await waitFor(() =>
			expect(screen.queryByRole('button', { name: "Load a sample 'scribe" })).toBeNull()
		);
		expect(screen.getByRole('button', { name: 'Paste lyrics' })).toBeTruthy();
	});

	// The sample is a Genius transcription, so it follows the chosen format. Its
	// row keeps its height when it goes, or choosing a format would move the
	// cards and the paste button under the pointer.
	test('keeps every control in place when the format choice withdraws the sample', async () => {
		const { controller } = createTestWorkbench({ text: '' });
		await render(DraftStart, { controller });

		const top = (name: string) => screen.getByRole('button', { name }).getBoundingClientRect().top;
		const before = [
			top('Lyric format: Genius'),
			top('Lyric format: Musixmatch'),
			top('Paste lyrics')
		];

		await fireEvent.click(screen.getByRole('button', { name: 'Lyric format: Musixmatch' }));

		await waitFor(() =>
			expect(screen.queryByRole('button', { name: "Load a sample 'scribe" })).toBeNull()
		);
		expect([
			top('Lyric format: Genius'),
			top('Lyric format: Musixmatch'),
			top('Paste lyrics')
		]).toEqual(before);
	});

	// Once a draft has been written in, its format is fixed even if it is
	// cleared, so the choice does not come back, but the ways to begin do.
	test('offers the ways to begin, without the format choice, in a cleared draft', async () => {
		const { controller } = createTestWorkbench({ text: '   \n\n' });
		await render(DraftStart, { controller });

		expect(screen.getByRole('button', { name: 'Paste lyrics' })).toBeTruthy();
		expect(screen.queryByRole('group', { name: 'Lyric format' })).toBeNull();
	});
});

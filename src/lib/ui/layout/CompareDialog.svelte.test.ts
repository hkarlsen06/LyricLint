import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { createTestWorkbench } from '../test-utils.js';
import CompareDialog from './CompareDialog.svelte';

function openDialog(): HTMLDialogElement {
	const dialog = document.querySelector<HTMLDialogElement>('dialog.compare-dialog');
	if (!dialog) throw new Error('the compare dialog is not in the document');
	return dialog;
}

async function pasteBaseline(text: string): Promise<void> {
	const area = screen.getByRole('textbox', { name: 'The lyrics as the page has them' });
	await fireEvent.input(area, { target: { value: text } });
	await fireEvent.click(screen.getByRole('button', { name: 'Show changes' }));
}

describe('CompareDialog', () => {
	afterEach(cleanup);

	test('the trigger does not draw over an empty document', () => {
		const { controller } = createTestWorkbench({ text: '' });
		render(CompareDialog, { controller });
		expect(screen.queryByRole('button', { name: 'Compare' })).toBeNull();
	});

	test('the first open asks for the page, and the action waits for a paste', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

		const area = screen.getByRole('textbox', { name: 'The lyrics as the page has them' });
		expect(area).toBeTruthy();
		const action = screen.getByRole('button', { name: 'Show changes' });
		expect(action).toHaveProperty('disabled', true);
		await fireEvent.input(area, { target: { value: '[Verse]\nLyne' } });
		expect(action).toHaveProperty('disabled', false);
		// The first ask has nothing to cancel back to; close is the way out.
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	});

	test('a pasted baseline becomes a diff of del and ins with the line numbered per row', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		expect(screen.getByText('1 line changed', { exact: false })).toBeTruthy();
		const dropped = openDialog().querySelector('del');
		const added = openDialog().querySelector('ins');
		expect(dropped?.textContent).toBe('Lyne');
		expect(added?.textContent).toBe('Line');
		// The number rides the row it is true of — no "Line N" heading, which
		// named the first changed line over a card that starts at the header.
		const changedRow = screen.getByText('Lyne').closest('button');
		expect(changedRow?.querySelector('.compare-diff__num')?.textContent).toBe('2');
		expect(screen.queryByText('Line 2')).toBeNull();
	});

	test('pressing a changed line closes the dialog and parks the caret on it, focused', async () => {
		const { controller, calls } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		await fireEvent.click(screen.getByText('Lyne').closest('button')!);
		expect(openDialog().open).toBe(false);
		// '[Verse]\nLine' — line 2 starts at offset 8, and the caret is collapsed
		// there rather than selecting: the press aimed at a line to edit.
		expect(calls.selections.at(-1)).toEqual({ anchor: 8, head: 8 });
		expect(calls.revealed.at(-1)).toEqual({ from: 8, to: 8 });
		// Unlike a diagnostic press, this caret is exactly where the user put it,
		// so the editor takes focus with it.
		expect(calls.focusCount).toBe(1);
	});

	test('a tap resolves to the character under it, not the start of the line', async () => {
		const { controller, calls } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		// Aim inside the inserted word, past its first character. The caret must
		// land within line 2 (offsets 8–12), not at its start.
		const inserted = openDialog().querySelector('ins')!;
		const rect = inserted.getBoundingClientRect();
		await fireEvent.click(inserted.closest('button')!, {
			clientX: rect.left + rect.width * 0.6,
			clientY: rect.top + rect.height / 2
		});
		const anchor = calls.selections.at(-1)!.anchor;
		expect(anchor).toBeGreaterThan(8);
		expect(anchor).toBeLessThanOrEqual(12);
	});

	test('a tap on deleted text lands at the boundary its deletion left behind', async () => {
		const { controller, calls } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		// The struck-through characters are not in the document, so no character
		// under the tap exists to land on — the boundary is the honest answer.
		const dropped = openDialog().querySelector('del')!;
		const rect = dropped.getBoundingClientRect();
		await fireEvent.click(dropped.closest('button')!, {
			clientX: rect.left + rect.width * 0.6,
			clientY: rect.top + rect.height / 2
		});
		expect(calls.selections.at(-1)).toEqual({ anchor: 8, head: 8 });
	});

	test('a context row is a press too, parking the caret on the unchanged line', async () => {
		const { controller, calls } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		await fireEvent.click(screen.getByText('[Verse]').closest('button')!);
		expect(openDialog().open).toBe(false);
		expect(calls.selections.at(-1)).toEqual({ anchor: 0, head: 0 });
	});

	test('the baseline is kept, so reopening shows the diff at once', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(openDialog().open).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		expect(screen.queryByRole('textbox', { name: 'The lyrics as the page has them' })).toBeNull();
		expect(screen.getByText('Lyne')).toBeTruthy();
	});

	test('the baseline is written to the draft record, so it survives a reload', async () => {
		const { controller, repository } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		// Setting a baseline changes no text, so the set schedules its own save —
		// the record on disk is what a reload comes back to.
		await waitFor(async () => {
			const record = await repository.get(controller.draftId);
			expect(record?.compareBaseline?.text).toBe('[Verse]\nLyne');
			expect(record?.compareBaseline?.pastedAt).toBeTruthy();
		});
	});

	test('the diff states the baseline age, and a stale one carries the nudge', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		// The test workbench stamps `now()` in July 2026, which is long past by
		// the real clock this component reads — so the stale wording must show.
		expect(screen.getByText(/Baseline from/)).toBeTruthy();
		expect(screen.getByText(/the page may have changed since/)).toBeTruthy();
	});

	test('line endings and the trailing newline a select-all drags along are not differences', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\r\nLine\r\n');

		expect(screen.getByText('matches the page exactly', { exact: false })).toBeTruthy();
		expect(openDialog().querySelector('del')).toBeNull();
	});

	test('Change baseline swaps to the ask in place, and Cancel returns to the diff', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		await fireEvent.click(screen.getByRole('button', { name: 'Change baseline' }));
		expect(screen.getByRole('textbox', { name: 'The lyrics as the page has them' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(screen.queryByRole('textbox', { name: 'The lyrics as the page has them' })).toBeNull();
		expect(screen.getByText('Lyne')).toBeTruthy();
	});

	test('an invisible-only change is carried by a sentence, not by the rows alone', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nHello world' });
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nHello world ');

		expect(screen.getByText('Trailing whitespace removed', { exact: false })).toBeTruthy();
	});

	test('hunks that collapse to the same offset and line label both render', async () => {
		// Two removals straddling a kept line near the document's end share
		// their collapse point. Keyed on that point, the each block threw
		// each_key_duplicate mid-flush — the first Show changes press appeared
		// to do nothing while the baseline was already stored, and the press
		// after it stored the emptied paste area as the baseline.
		const { controller } = createTestWorkbench({ text: 'c\na\n' });
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('a\nb\n\na');

		const dropped = [...openDialog().querySelectorAll('del')].map((el) => el.textContent);
		expect(dropped).toEqual(['b', 'a']);
		// A removed line has no line in the document any more, so its gutter
		// cell is honestly empty.
		for (const del of openDialog().querySelectorAll('del')) {
			const num = del.closest('button')?.querySelector('.compare-diff__num');
			expect(num?.textContent).toBe('');
		}
	});

	test('a press on the backdrop closes the dialog', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await fireEvent.click(openDialog());
		expect(openDialog().open).toBe(false);
	});
});

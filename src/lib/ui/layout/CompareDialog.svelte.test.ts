import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import { resetCompareBaselines } from '../state/compare-baseline.svelte.js';
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
	afterEach(() => {
		cleanup();
		// The baseline is module state on purpose — a session survives component
		// mounts — so each test starts the session over.
		resetCompareBaselines();
	});

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

	test('a pasted baseline becomes a diff of del and ins with the line named', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		expect(screen.getByText('1 line changed', { exact: false })).toBeTruthy();
		expect(screen.getByText('Line 2')).toBeTruthy();
		const dropped = openDialog().querySelector('del');
		const added = openDialog().querySelector('ins');
		expect(dropped?.textContent).toBe('Lyne');
		expect(added?.textContent).toBe('Line');
	});

	test('pressing a hunk closes the dialog and puts the selection on its range', async () => {
		const { controller, calls } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');

		await fireEvent.click(screen.getByText('Line 2').closest('button')!);
		expect(openDialog().open).toBe(false);
		// '[Verse]\nLine' — line 2 spans offsets 8–12.
		expect(calls.selections.at(-1)).toEqual({ anchor: 8, head: 12 });
		expect(calls.revealed.at(-1)).toEqual({ from: 8, to: 12 });
		// The editor is deliberately left unfocused: the wash is a location, and
		// a caret nobody placed would arm the next keystroke over it.
		expect(calls.focusCount).toBe(0);
	});

	test('the baseline is kept for the session, so reopening shows the diff at once', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await pasteBaseline('[Verse]\nLyne');
		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
		expect(openDialog().open).toBe(false);

		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		expect(screen.queryByRole('textbox', { name: 'The lyrics as the page has them' })).toBeNull();
		expect(screen.getByText('Line 2')).toBeTruthy();
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
		expect(screen.getByText('Line 2')).toBeTruthy();
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
		expect(screen.getAllByText('Line 3')).toHaveLength(2);
	});

	test('a press on the backdrop closes the dialog', async () => {
		const { controller } = createTestWorkbench();
		render(CompareDialog, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
		await fireEvent.click(openDialog());
		expect(openDialog().open).toBe(false);
	});
});

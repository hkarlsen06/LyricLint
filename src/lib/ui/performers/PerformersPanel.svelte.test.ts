import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import ToastRegion from '../primitives/ToastRegion.svelte';
import { createTestWorkbench, performer } from '../test-utils.js';
import PerformersPanel from './PerformersPanel.svelte';

describe('PerformersPanel', () => {
	afterEach(cleanup);

	test('supports roster CRUD, merge suggestions, order, color, and toast undo', async () => {
		const { controller, feedback } = createTestWorkbench({
			performers: [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1, 'teal')]
		});
		render(PerformersPanel, { controller });
		render(ToastRegion, { feedback });

		const addInput = screen.getByRole('textbox', { name: 'Add performer' });
		await fireEvent.input(addInput, { target: { value: 'avery' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Add' }));
		expect(controller.performers).toHaveLength(3);
		expect(screen.getByText('Possible duplicates')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Merge into Avery' }));
		expect(controller.performers).toHaveLength(2);
		expect(controller.performers[0]?.aliases).toContain('avery');

		const roster = screen.getByRole('list', { name: 'Draft performer roster' });
		const averyRow = within(roster).getByText('Avery').closest('li');
		expect(averyRow).toBeTruthy();
		await fireEvent.click(within(averyRow!).getByRole('button', { name: 'Rename' }));
		const renameInput = within(averyRow!).getByRole('textbox', { name: 'Performer name' });
		await waitFor(() => expect(document.activeElement).toBe(renameInput));
		await fireEvent.input(renameInput, { target: { value: 'Avery Stone' } });
		await fireEvent.click(within(averyRow!).getByRole('button', { name: 'Save' }));
		expect(controller.performers[0]?.displayName).toBe('Avery Stone');
		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(averyRow!).getByRole('button', { name: 'Rename' })
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Move Blair up' }));
		expect(controller.performers[0]?.displayName).toBe('Blair');

		const blairRow = within(roster).getByText('Blair').closest('li');
		expect(blairRow).toBeTruthy();
		const oldColor = controller.performers[0]?.colorId;
		await fireEvent.click(within(blairRow!).getByRole('button', { name: 'Recolor' }));
		expect(controller.performers[0]?.colorId).not.toBe(oldColor);
		expect(within(blairRow!).getByLabelText(/color/)).toBeTruthy();

		await fireEvent.click(within(blairRow!).getByRole('button', { name: 'Remove' }));
		expect(controller.performers.some((candidate) => candidate.displayName === 'Blair')).toBe(
			false
		);
		await waitFor(() => expect(document.activeElement?.textContent).toContain('Assign'));

		const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
		await fireEvent.click(undoButtons.at(-1)!);
		await waitFor(() =>
			expect(controller.performers.some((candidate) => candidate.displayName === 'Blair')).toBe(
				true
			)
		);
	});

	test('assigns a joint performer group from panel checkboxes and supports cancellation', async () => {
		const text = '[Chorus]\nShared line';
		const { controller, calls } = createTestWorkbench({
			text,
			selection: { anchor: 9, head: text.length },
			performers: [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1, 'teal')]
		});
		render(PerformersPanel, { controller });

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Avery' }));
		await fireEvent.click(screen.getByRole('checkbox', { name: 'Blair' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

		expect(calls.dispatched).toHaveLength(1);
		expect(calls.dispatched[0]?.baseRevision).toBe(4);
		expect(calls.dispatched[0]?.edits.some((edit) => edit.insert.includes('Avery & Blair'))).toBe(
			true
		);

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Avery' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(
			(screen.getByRole('checkbox', { name: 'Avery' }) as HTMLInputElement).checked
		).toBe(false);
		expect(calls.focusCount).toBeGreaterThan(1);
	});

	test('surfaces unresolved imported styles without changing the document', () => {
		const text =
			'[Chorus: Avery]\nA long plain lyric with <i>an unmatched styled voice</i>';
		const { controller } = createTestWorkbench({ text, performers: [] });
		render(PerformersPanel, { controller });

		expect(screen.getByRole('heading', { name: 'Unresolved voices' })).toBeTruthy();
		expect(
			within(screen.getByRole('region', { name: 'Unresolved imported voices' })).getByText(
				'Unresolved voice 2'
			)
		).toBeTruthy();
		expect(controller.snapshot.text).toBe(text);
	});
});

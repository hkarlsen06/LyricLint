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

		const averyRow = screen.getByText('Avery').closest('li');
		expect(averyRow).toBeTruthy();
		await fireEvent.click(within(averyRow!).getByRole('button', { name: 'Rename' }));
		const renameInput = within(averyRow!).getByRole('textbox', { name: 'Performer name' });
		await fireEvent.input(renameInput, { target: { value: 'Avery Stone' } });
		await fireEvent.click(within(averyRow!).getByRole('button', { name: 'Save' }));
		expect(controller.performers[0]?.displayName).toBe('Avery Stone');

		await fireEvent.click(screen.getByRole('button', { name: 'Move Blair up' }));
		expect(controller.performers[0]?.displayName).toBe('Blair');

		const blairRow = screen.getByText('Blair').closest('li');
		expect(blairRow).toBeTruthy();
		const oldColor = controller.performers[0]?.colorId;
		await fireEvent.click(within(blairRow!).getByRole('button', { name: 'Recolor' }));
		expect(controller.performers[0]?.colorId).not.toBe(oldColor);
		expect(within(blairRow!).getByLabelText(/color/)).toBeTruthy();

		await fireEvent.click(within(blairRow!).getByRole('button', { name: 'Remove' }));
		expect(controller.performers.some((candidate) => candidate.displayName === 'Blair')).toBe(
			false
		);

		const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
		await fireEvent.click(undoButtons.at(-1)!);
		await waitFor(() =>
			expect(controller.performers.some((candidate) => candidate.displayName === 'Blair')).toBe(
				true
			)
		);
	});
});

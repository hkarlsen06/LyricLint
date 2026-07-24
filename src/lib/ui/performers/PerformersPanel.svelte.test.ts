import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import ToastRegion from '../primitives/ToastRegion.svelte';
import { createTestWorkbench, performer } from '../test-utils.js';
import PerformersPanel from './PerformersPanel.svelte';

describe('PerformersPanel', () => {
	afterEach(cleanup);

	test('supports roster CRUD, merge suggestions, and toast undo', async () => {
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
			expect(document.activeElement).toBe(within(averyRow!).getByRole('button', { name: 'Rename' }))
		);

		const blairRow = within(roster).getByText('Blair').closest('li');
		expect(blairRow).toBeTruthy();

		await fireEvent.click(within(blairRow!).getByRole('button', { name: 'Remove' }));
		expect(controller.performers.some((candidate) => candidate.displayName === 'Blair')).toBe(
			false
		);
		// Blair was the last row, so focus falls back to the add-performer input.
		await waitFor(() => expect(document.activeElement?.id).toBe('new-performer'));

		const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
		await fireEvent.click(undoButtons.at(-1)!);
		await waitFor(() =>
			expect(controller.performers.some((candidate) => candidate.displayName === 'Blair')).toBe(
				true
			)
		);
	});

	test('lists the roster in order of first appearance in the lyrics', () => {
		const text = '[Chorus: Blair, <i>Avery</i>]\nBlair line\n<i>Avery line</i>';
		const { controller } = createTestWorkbench({
			text,
			performers: [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1, 'teal')]
		});
		render(PerformersPanel, { controller });

		const roster = screen.getByRole('list', { name: 'Draft performer roster' });
		const names = within(roster)
			.getAllByRole('listitem')
			.map((item) => item.querySelector('strong')?.textContent);
		expect(names).toEqual(['Blair', 'Avery']);
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
		expect((screen.getByRole('checkbox', { name: 'Avery' }) as HTMLInputElement).checked).toBe(
			false
		);
		expect(calls.focusCount).toBeGreaterThan(1);
	});

	test('surfaces unresolved imported styles without changing the document', () => {
		const text = '[Chorus: Avery]\nA long plain lyric with <i>an unmatched styled voice</i>';
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

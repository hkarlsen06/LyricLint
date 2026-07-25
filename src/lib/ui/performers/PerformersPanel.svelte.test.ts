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
		// The row's commands are glyphs, so the performer's own name is what
		// carries them in the accessible tree.
		await fireEvent.click(within(averyRow!).getByRole('button', { name: 'Rename Avery' }));
		const renameInput = within(averyRow!).getByRole('textbox', { name: 'Performer name' });
		await waitFor(() => expect(document.activeElement).toBe(renameInput));
		await fireEvent.input(renameInput, { target: { value: 'Avery Stone' } });
		await fireEvent.click(within(averyRow!).getByRole('button', { name: 'Save' }));
		expect(controller.performers[0]?.displayName).toBe('Avery Stone');
		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(averyRow!).getByRole('button', { name: 'Rename Avery Stone' })
			)
		);

		const blairRow = within(roster).getByText('Blair').closest('li');
		expect(blairRow).toBeTruthy();

		// Two presses in the trigger's own slot, with the row's other command
		// stepping aside while the removal is its only question.
		await fireEvent.click(within(blairRow!).getByRole('button', { name: 'Remove Blair' }));
		expect(within(blairRow!).queryByRole('button', { name: /^Rename/ })).toBeNull();
		const confirm = within(blairRow!).getByRole('button', { name: 'Remove' });
		expect(document.activeElement).toBe(confirm);
		await fireEvent.click(confirm);
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

	// Pressing the name is the rename: a pencil beside it would be a second
	// control for the thing the pointer is already on.
	test('the name is the rename control, and it is the only one', async () => {
		const { controller } = createTestWorkbench({
			performers: [performer('avery', 'Avery', 0)]
		});
		render(PerformersPanel, { controller });

		const row = screen.getByRole('list', { name: 'Draft performer roster' }).querySelector('li')!;
		expect(within(row).queryByTitle('Rename')?.tagName).toBe('BUTTON');
		expect(within(row).queryAllByRole('button', { name: /^Rename/ })).toHaveLength(1);

		await fireEvent.click(within(row).getByText('Avery'));

		const renameInput = within(row).getByRole('textbox', { name: 'Performer name' });
		await waitFor(() => expect(document.activeElement).toBe(renameInput));
		// The field opens with the name selected, so typing replaces it.
		expect((renameInput as HTMLInputElement).value).toBe('Avery');
	});

	// The removal is the row's only question while it is open, so the name stops
	// offering to become a field under the same pointer.
	test('the name stops being pressable while a removal is pending', async () => {
		const { controller } = createTestWorkbench({
			performers: [performer('avery', 'Avery', 0)]
		});
		render(PerformersPanel, { controller });

		const row = screen.getByRole('list', { name: 'Draft performer roster' }).querySelector('li')!;
		await fireEvent.click(within(row).getByRole('button', { name: 'Remove Avery' }));

		expect(within(row).queryByRole('button', { name: /^Rename/ })).toBeNull();
		expect(within(row).getByText('Avery').tagName).toBe('SPAN');
	});

	test('cancelling a removal puts the row back, and only one row is armed at a time', async () => {
		const { controller } = createTestWorkbench({
			performers: [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1, 'teal')]
		});
		render(PerformersPanel, { controller });

		const roster = screen.getByRole('list', { name: 'Draft performer roster' });
		const averyRow = within(roster).getByText('Avery').closest('li')!;
		const blairRow = within(roster).getByText('Blair').closest('li')!;

		await fireEvent.click(within(averyRow).getByRole('button', { name: 'Remove Avery' }));
		await fireEvent.click(within(blairRow).getByRole('button', { name: 'Remove Blair' }));
		expect(within(averyRow).getByRole('button', { name: 'Remove Avery' })).toBeTruthy();
		expect(within(blairRow).getByRole('button', { name: 'Remove' })).toBeTruthy();

		await fireEvent.click(within(blairRow).getByRole('button', { name: 'Cancel' }));
		expect(within(blairRow).getByRole('button', { name: 'Remove Blair' })).toBeTruthy();
		expect(within(blairRow).getByRole('button', { name: 'Rename Blair' })).toBeTruthy();
		expect(controller.performers).toHaveLength(2);
	});

	// Renaming one row and removing another are two questions about the roster,
	// so beginning the rename abandons the removal rather than leaving a primed
	// confirm somewhere above it.
	test('beginning a rename abandons a removal pending on another row', async () => {
		const { controller } = createTestWorkbench({
			performers: [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1, 'teal')]
		});
		render(PerformersPanel, { controller });

		const roster = screen.getByRole('list', { name: 'Draft performer roster' });
		const averyRow = within(roster).getByText('Avery').closest('li')!;
		const blairRow = within(roster).getByText('Blair').closest('li')!;

		await fireEvent.click(within(averyRow).getByRole('button', { name: 'Remove Avery' }));
		await fireEvent.click(within(blairRow).getByRole('button', { name: 'Rename Blair' }));

		expect(within(averyRow).getByRole('button', { name: 'Remove Avery' })).toBeTruthy();
		expect(within(averyRow).queryByRole('button', { name: 'Remove' })).toBeNull();
		expect(controller.performers).toHaveLength(2);
	});

	test('gives the same artist the same preferred color in separate drafts', () => {
		const first = createTestWorkbench();
		const second = createTestWorkbench();

		first.controller.addPerformer('Beyoncé');
		second.controller.addPerformer('  Beyoncé  ');

		expect(first.controller.performers[0]?.colorId).toBe(second.controller.performers[0]?.colorId);
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
			.map((item) => item.querySelector('.list-row__name')?.textContent);
		expect(names).toEqual(['Blair', 'Avery']);
	});

	// Assignment is a selection-anchored action, so it lives only in the editor's
	// floating picker. The panel offers no second, selection-blind way in.
	test('offers no assignment controls, only a pointer to the editor picker', () => {
		const text = '[Chorus]\nShared line';
		const { controller } = createTestWorkbench({
			text,
			selection: { anchor: 9, head: text.length },
			performers: [performer('avery', 'Avery', 0), performer('blair', 'Blair', 1, 'teal')]
		});
		render(PerformersPanel, { controller });

		expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
		expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Assign' })).toBeNull();
		expect(screen.getByText(/select lyric text in the editor/i)).toBeTruthy();
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

	test('lists a recurring unresolved voice once across sections', () => {
		// Extraction emits one unresolved group per section that styles the slot,
		// and they share an identity id. Rendering both crashed the panel with
		// `each_key_duplicate`, which left the workspace stuck on its loading state.
		const text =
			'[Chorus: Avery]\nA long plain lyric with <i>an unmatched styled voice</i>\n\n' +
			'[Verse: Avery]\nAnother plain lyric with <i>a second unmatched voice</i>';
		const { controller } = createTestWorkbench({ text, performers: [] });
		render(PerformersPanel, { controller });

		const region = screen.getByRole('region', { name: 'Unresolved imported voices' });
		expect(within(region).getAllByText('Unresolved voice 2')).toHaveLength(1);
		expect(within(region).getAllByRole('listitem')).toHaveLength(1);
		expect(controller.unresolvedVoiceGroups).toHaveLength(1);
		expect(controller.snapshot.text).toBe(text);
	});
});

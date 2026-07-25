import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';
import type { DraftRecord } from '$lib/core/types.js';
import { createTestWorkbench } from '../test-utils.js';
import DraftMenu from './DraftMenu.svelte';

function secondDraft(): DraftRecord {
	return {
		id: 'draft-2',
		title: 'Second song',
		text: '[Chorus]\nAnother line',
		language: 'en-GB',
		performers: [],
		createdAt: '2026-07-19T10:00:00.000Z',
		updatedAt: '2026-07-19T10:00:00.000Z',
		ruleSetVersion: '2026.7',
		editorSelection: { anchor: 0, head: 0 }
	};
}

function thirdDraft(): DraftRecord {
	return {
		...secondDraft(),
		id: 'draft-3',
		title: 'Third song',
		updatedAt: '2026-07-18T10:00:00.000Z'
	};
}

describe('DraftMenu', () => {
	afterEach(cleanup);

	test('opens, renames, duplicates, exports, deletes, and deletes all drafts', async () => {
		const exported: Array<{ text: string; filename: string }> = [];
		const base = createTestWorkbench();
		const { controller, repository } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft()],
			exportLog: exported
		});
		await controller.refreshDrafts();
		render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));
		expect(screen.getByRole('heading', { name: 'Saved drafts', level: 2 })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /^Second song/ }));
		expect(controller.draftId).toBe('draft-2');
		const secondRow = screen.getByText('Second song').closest('li');
		expect(secondRow).toBeTruthy();
		// The row's commands are glyphs, so the draft's own name is what carries
		// them in the accessible tree.
		await fireEvent.click(within(secondRow!).getByRole('button', { name: 'Export Second song' }));
		expect(exported[0]).toEqual({
			text: '[Chorus]\nAnother line',
			filename: 'Second song.txt'
		});

		await fireEvent.click(within(secondRow!).getByRole('button', { name: 'Rename Second song' }));
		const titleInput = within(secondRow!).getByRole('textbox', { name: 'Draft title' });
		// The field takes the row's place, so it takes its focus too.
		expect(document.activeElement).toBe(titleInput);
		await fireEvent.input(titleInput, { target: { value: 'Bridge notes' } });
		await fireEvent.submit(secondRow!.querySelector('form')!);
		await waitFor(() => expect(screen.getByText('Bridge notes')).toBeTruthy());

		const renamedRow = screen.getByText('Bridge notes').closest('li');
		expect(renamedRow).toBeTruthy();
		await fireEvent.click(
			within(renamedRow!).getByRole('button', { name: 'Duplicate Bridge notes' })
		);
		await waitFor(async () => expect((await repository.list()).length).toBe(3));

		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Delete Bridge notes' }));
		// The pending confirm is the row's only decision: the other row actions
		// step aside, and the row stops being a way into the draft.
		expect(within(renamedRow!).queryByRole('button', { name: /^Rename/ })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: /^Duplicate/ })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: /^Export/ })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: /^Bridge notes/ })).toBeNull();

		// Two presses in one place: the confirm takes the trigger's slot, and the
		// press that armed it carries focus across the swap.
		const confirm = within(renamedRow!).getByRole('button', { name: 'Delete' });
		expect(document.activeElement).toBe(confirm);
		await fireEvent.click(confirm);
		await waitFor(async () => expect((await repository.list()).length).toBe(2));
		await waitFor(() =>
			expect(document.activeElement?.matches('.draft-list__title, .draft-menu > summary')).toBe(
				true
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete all drafts' }));
		expect(await repository.list()).toEqual([]);
	});

	test('cancelling a delete puts the row back the way it was', async () => {
		const base = createTestWorkbench();
		const { controller, repository } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft()]
		});
		await controller.refreshDrafts();
		render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));

		const row = screen.getByText('Second song').closest('li')!;
		await fireEvent.click(within(row).getByRole('button', { name: 'Delete Second song' }));
		await fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }));

		expect(within(row).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
		expect(within(row).getByRole('button', { name: /^Second song/ })).toBeTruthy();
		expect((await repository.list()).length).toBe(2);
	});

	test('arms one row at a time', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft(), thirdDraft()]
		});
		await controller.refreshDrafts();
		render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Drafts' }));

		const second = screen.getByText('Second song').closest('li')!;
		const third = screen.getByText('Third song').closest('li')!;
		await fireEvent.click(within(second).getByRole('button', { name: 'Delete Second song' }));
		await fireEvent.click(within(third).getByRole('button', { name: 'Delete Third song' }));

		expect(within(second).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
		expect(within(third).getByRole('button', { name: 'Delete' })).toBeTruthy();
	});

	test('closes on a press outside, abandoning any pending confirm', async () => {
		const { controller } = createTestWorkbench();
		await controller.refreshDrafts();
		render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: 'Drafts' });
		await fireEvent.click(trigger);
		const menu = trigger.closest('details')!;
		// The native `toggle` event lands a task after the click, and it is what
		// tells the component it is open; wait for the expansion state to say so.
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data…' }));
		expect(screen.getByRole('button', { name: 'Delete all drafts' })).toBeTruthy();

		await fireEvent.pointerDown(document.body);
		await waitFor(() => expect(menu.open).toBe(false));

		// Reopening must not present the confirm the user walked away from.
		await fireEvent.click(trigger);
		expect(screen.queryByRole('button', { name: 'Delete all drafts' })).toBeNull();
	});

	test('keeps the menu open for a press on the summary or inside the popover', async () => {
		const { controller } = createTestWorkbench();
		await controller.refreshDrafts();
		render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: 'Drafts' });
		await fireEvent.click(trigger);
		const menu = trigger.closest('details')!;
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		// The attachment sits on the `<details>`, so the summary counts as inside
		// and the native toggle keeps owning it.
		await fireEvent.pointerDown(trigger);
		await fireEvent.pointerDown(screen.getByText('Saved drafts'));
		expect(menu.open).toBe(true);
	});
});

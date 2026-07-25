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
		await fireEvent.click(within(secondRow!).getByRole('button', { name: 'Export' }));
		expect(exported[0]).toEqual({
			text: '[Chorus]\nAnother line',
			filename: 'Second song.txt'
		});

		await controller.createDraft();
		await waitFor(async () => expect((await repository.list()).length).toBe(3));

		const generatedRow = screen.getByText('Untitled draft').closest('li');
		expect(generatedRow).toBeTruthy();
		await fireEvent.click(within(generatedRow!).getByRole('button', { name: 'Rename' }));
		const titleInput = within(generatedRow!).getByRole('textbox', { name: 'Draft title' });
		await fireEvent.input(titleInput, { target: { value: 'Bridge notes' } });
		await fireEvent.submit(generatedRow!.querySelector('form')!);
		await waitFor(() => expect(screen.getByText('Bridge notes')).toBeTruthy());

		const renamedRow = screen.getByText('Bridge notes').closest('li');
		expect(renamedRow).toBeTruthy();
		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Duplicate' }));
		await waitFor(async () => expect((await repository.list()).length).toBe(4));

		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Export' }));
		expect(exported[1]?.filename).toBe('Bridge notes.txt');

		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Delete' }));
		// The pending confirm is the row's only decision: the other row actions
		// step aside rather than sitting beside it.
		expect(within(renamedRow!).queryByRole('button', { name: 'Rename' })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: 'Duplicate' })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: 'Export' })).toBeNull();
		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Yes' }));
		await waitFor(async () => expect((await repository.list()).length).toBe(3));
		await waitFor(() =>
			expect(document.activeElement?.matches('.draft-list__title, .draft-menu > summary')).toBe(
				true
			)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
		expect(await repository.list()).toEqual([]);
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
		expect(screen.getByRole('button', { name: 'Delete all' })).toBeTruthy();

		await fireEvent.pointerDown(document.body);
		await waitFor(() => expect(menu.open).toBe(false));

		// Reopening must not present the confirm the user walked away from.
		await fireEvent.click(trigger);
		expect(screen.queryByRole('button', { name: 'Delete all' })).toBeNull();
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

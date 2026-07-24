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

	test('creates, opens, renames, duplicates, exports, deletes, and deletes all drafts', async () => {
		const exported: Array<{ text: string; filename: string }> = [];
		const base = createTestWorkbench();
		const { controller, repository } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft()],
			exportLog: exported
		});
		await controller.refreshDrafts();
		render(DraftMenu, { controller });
		await fireEvent.click(screen.getByText('Drafts'));

		await fireEvent.click(screen.getByRole('button', { name: /^Second song/ }));
		expect(controller.draftId).toBe('draft-2');
		const secondRow = screen.getByText('Second song').closest('li');
		expect(secondRow).toBeTruthy();
		await fireEvent.click(within(secondRow!).getByRole('button', { name: 'Export' }));
		expect(exported[0]).toEqual({
			text: '[Chorus]\nAnother line',
			filename: 'Second song.txt'
		});

		await fireEvent.click(screen.getByRole('button', { name: 'New draft' }));
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
		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Yes' }));
		await waitFor(async () => expect((await repository.list()).length).toBe(3));
		await waitFor(() =>
			expect(
				document.activeElement?.matches('.draft-list__title, .draft-menu > summary')
			).toBe(true)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Delete all local data…' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Delete all' }));
		expect(await repository.list()).toEqual([]);
	});
});

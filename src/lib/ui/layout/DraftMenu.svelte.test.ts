import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
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

async function waitForBody(): Promise<void> {
	await waitFor(() => expect(screen.queryByText("Loading saved 'scribes…")).toBeNull());
}

describe('DraftMenu', () => {
	afterEach(cleanup);

	test('can close before the row module arrives without reopening or taking focus', async () => {
		const { controller } = createTestWorkbench();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "'Scribes" });
		await fireEvent.click(trigger);
		expect(screen.getByRole('heading', { name: "Saved 'scribes" })).toBeTruthy();
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
		await fireEvent.keyDown(trigger, { key: 'Escape' });
		await vi.dynamicImportSettled();
		expect(document.querySelector('details')?.open).toBe(false);
		expect(document.activeElement).toBe(trigger);
		await userEvent.click(trigger);
		await waitForBody();
		expect(screen.getByRole('heading', { name: "Saved 'scribes" })).toBeTruthy();
	});

	test('filters a large library and resets the search when the menu closes', async () => {
		const drafts = Array.from({ length: 8 }, (_, index) => ({
			...secondDraft(),
			id: `draft-${index}`,
			title: index === 3 ? 'Summer rain' : `Winter ${index}`
		}));
		const { controller } = createTestWorkbench({ drafts });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "'Scribes" });
		expect(document.querySelector('.draft-menu__popover')).toBeNull();
		await userEvent.click(trigger);
		await waitForBody();
		const popover = document.querySelector('.draft-menu__popover');
		const fileInput = popover?.querySelector('input[type="file"]');
		expect(fileInput).toBeTruthy();
		const search = screen.getByRole('searchbox', {
			name: "Find a saved 'scribe by title or opening lyrics"
		});
		await fireEvent.input(search, { target: { value: 'SUMMER' } });
		expect(screen.getByRole('button', { name: /^Summer rain/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Winter 1/ })).toBeNull();
		await fireEvent.input(search, { target: { value: 'missing' } });
		expect(screen.getByRole('status').textContent).toContain('No saved');
		await fireEvent.keyDown(search, { key: 'Escape' });
		expect(document.querySelector('.draft-menu__popover')).toBe(popover);
		expect(fileInput?.isConnected).toBe(true);
		await userEvent.click(trigger);
		await waitForBody();
		expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
		expect(screen.getByRole('button', { name: /^Winter 1/ })).toBeTruthy();
	});

	test('opens, renames, duplicates, exports, and deletes a draft', async () => {
		const exported: Array<{ text: string; filename: string }> = [];
		const base = createTestWorkbench();
		const { controller, repository } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft()],
			exportLog: exported
		});
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();
		const heading = screen.getByRole('heading', { name: "Saved 'scribes", level: 2 });
		const titlebar = heading.closest('.draft-menu__titlebar');
		const importButton = within(titlebar as HTMLElement).getByRole('button', {
			name: 'Import Scribe…'
		});
		expect(importButton.classList.contains('button')).toBe(true);
		expect(importButton.classList.contains('button--quiet')).toBe(false);

		await userEvent.click(screen.getByRole('button', { name: /^Second song/ }));
		expect(controller.draftId).toBe('draft-2');
		await userEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();
		const secondRow = screen.getByText('Second song').closest('li');
		expect(secondRow).toBeTruthy();
		// The row's commands are glyphs, so the draft's own name is what carries
		// them in the accessible tree.
		await fireEvent.click(within(secondRow!).getByRole('button', { name: 'Export Second song' }));
		await waitFor(() => expect(exported).toHaveLength(1));
		expect(exported[0]).toEqual({
			text: expect.stringContaining('"format": "LYRICLINT_SCRIBE"'),
			filename: 'Second song.lls'
		});

		await fireEvent.click(within(secondRow!).getByRole('button', { name: 'Rename Second song' }));
		const titleInput = within(secondRow!).getByRole('textbox', { name: "'Scribe title" });
		// The field takes the row's place, so it takes its focus too.
		await waitFor(() => expect(document.activeElement).toBe(titleInput));
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
		// press that armed it carries focus across the swap. It keeps the draft in
		// its accessible name, because focus lands on it — a bare "Delete" read out
		// on arrival names nothing.
		const confirm = within(renamedRow!).getByRole('button', { name: 'Delete Bridge notes' });
		expect(confirm.classList.contains('remove-button__confirm')).toBe(true);
		expect(confirm.textContent?.trim()).toBe('Delete');
		expect(document.activeElement).toBe(confirm);
		await fireEvent.click(confirm);
		await waitFor(async () => expect((await repository.list()).length).toBe(2));
		await waitFor(() =>
			expect(document.activeElement?.matches('.list-row__action, .draft-menu > summary')).toBe(true)
		);
	});

	// The menu deletes one 'scribe at a time and offers no way to delete
	// everything. That footer was the whole menu on a fresh install — a sentence
	// saying there is nothing saved yet, under a red button offering to delete it
	// — so the command lives in the tools panel, beside the paragraph that says
	// what local data is. Re-adding it here is the specific regression.
	test('offers no way to delete everything, and a fresh install is one sentence', async () => {
		const { controller } = createTestWorkbench({ drafts: [] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();

		expect(screen.getByText(/No saved 'scribes yet/u)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /delete all/iu })).toBeNull();
	});

	test('a populated menu offers no way to delete everything either', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();

		expect(screen.queryByRole('button', { name: /delete all/iu })).toBeNull();
	});

	test('cancelling a delete puts the row back the way it was', async () => {
		const base = createTestWorkbench();
		const { controller, repository } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft()]
		});
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();

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
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();

		const second = screen.getByText('Second song').closest('li')!;
		const third = screen.getByText('Third song').closest('li')!;
		await fireEvent.click(within(second).getByRole('button', { name: 'Delete Second song' }));
		await fireEvent.click(within(third).getByRole('button', { name: 'Delete Third song' }));

		expect(within(second).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
		expect(within(third).getByRole('button', { name: 'Delete Third song' }).classList).toContain(
			'remove-button__confirm'
		);
	});

	test('closes on a press outside, abandoning any pending confirm', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "'Scribes" });
		await fireEvent.click(trigger);
		await waitForBody();
		const menu = trigger.closest('details')!;
		// The native `toggle` event lands a task after the click, and it is what
		// tells the component it is open; wait for the expansion state to say so.
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		const row = screen.getByText('Second song').closest('li')!;
		await fireEvent.click(within(row).getByRole('button', { name: 'Delete Second song' }));
		expect(within(row).getByRole('button', { name: 'Delete Second song' }).classList).toContain(
			'remove-button__confirm'
		);

		await fireEvent.pointerDown(document.body);
		await waitFor(() => expect(menu.open).toBe(false));

		// Reopening must not present the confirm the user walked away from.
		await fireEvent.click(trigger);
		await waitForBody();
		const reopened = screen.getByText('Second song').closest('li')!;
		expect(within(reopened).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
	});

	// A `<details>` closes on its summary and on an outside press and on nothing
	// else, so this menu had two of the three exits every transient surface here
	// owes — and an armed delete could not be abandoned from the keyboard at all.
	test('closes on Escape, abandoning any pending confirm and returning focus', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "'Scribes" });
		await fireEvent.click(trigger);
		await waitForBody();
		const menu = trigger.closest('details')!;
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		const row = screen.getByText('Second song').closest('li')!;
		await fireEvent.click(within(row).getByRole('button', { name: 'Delete Second song' }));

		await fireEvent.keyDown(menu, { key: 'Escape' });

		await waitFor(() => expect(menu.open).toBe(false));
		// Escape is the path that hands focus back: nothing else named where the
		// user was going.
		expect(document.activeElement).toBe(trigger);

		// And the question the user walked away from is gone rather than primed.
		await fireEvent.click(trigger);
		await waitForBody();
		const reopened = screen.getByText('Second song').closest('li')!;
		expect(reopened.querySelector('.remove-button__confirm')).toBeNull();
		expect(within(reopened).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
	});

	// The armed row used to be a template branch of its own, mounting a *new*
	// `RemoveButton` with `pending` already true — so its live region was born
	// holding the question, which is not an update and is therefore not
	// announced, and focus landed on a confirm named a bare "Delete".
	test('arms the confirm in place, so its live region and its name both land', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();

		const row = screen.getByText('Second song').closest('li')!;
		const region = row.querySelector('[aria-live]')!;
		expect(region.textContent?.trim()).toBe('');

		await fireEvent.click(within(row).getByRole('button', { name: 'Delete Second song' }));

		// The same node, now saying something: a region replaced wholesale reports
		// nothing.
		expect(row.querySelector('[aria-live]')).toBe(region);
		expect(region.textContent?.trim()).toBe('Delete Second song? Confirm or cancel.');

		const confirm = row.querySelector<HTMLButtonElement>('.remove-button__confirm')!;
		expect(confirm.getAttribute('aria-label')).toBe('Delete Second song');
		expect(document.activeElement).toBe(confirm);
	});

	test('keeps the menu open for a press on the summary or inside the popover', async () => {
		const { controller } = createTestWorkbench();
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "'Scribes" });
		await fireEvent.click(trigger);
		await waitForBody();
		const menu = trigger.closest('details')!;
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		// The attachment sits on the `<details>`, so the summary counts as inside
		// and the native toggle keeps owning it.
		await fireEvent.pointerDown(trigger);
		await fireEvent.pointerDown(screen.getByText("Saved 'scribes"));
		expect(menu.open).toBe(true);
	});
});

describe('DraftMenu duplicate titles', () => {
	afterEach(cleanup);
	test('shows lyric openings only for duplicate titles and can find the intended copy by its words', async () => {
		const drafts = [
			{
				...secondDraft(),
				id: 'same-a',
				title: 'Untitled transcription',
				text: '[Verse]\nThe morning sun'
			},
			{
				...secondDraft(),
				id: 'same-b',
				title: 'Untitled transcription',
				text: '\n[Chorus]\nA winter moon'
			},
			{ ...secondDraft(), id: 'unique-a', title: 'Named song', text: '[Verse]\nUnique opening' },
			{ ...secondDraft(), id: 'unique-b', title: 'Another song' },
			{ ...thirdDraft(), id: 'unique-c' }
		];
		const { controller, repository } = createTestWorkbench({ drafts });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await userEvent.click(screen.getByRole('button', { name: "'Scribes" }));
		await waitForBody();
		expect(screen.getByText('The morning sun')).toBeTruthy();
		expect(screen.getByText('A winter moon')).toBeTruthy();
		expect(screen.queryByText('Unique opening')).toBeNull();
		const unique = screen.getByText('Named song').closest('li');
		expect(unique?.querySelector('.draft-menu__preview')).toBeNull();
		const search = screen.getByRole('searchbox', {
			name: "Find a saved 'scribe by title or opening lyrics"
		});
		await fireEvent.input(search, { target: { value: 'WINTER MOON' } });
		expect(screen.queryByText('The morning sun')).toBeNull();
		// A filtered duplicate keeps its identifying preview even when the other copy is hidden.
		await userEvent.click(
			screen.getByRole('button', { name: /Untitled transcription A winter moon/ })
		);
		expect(controller.draftId).toBe('same-b');
		expect(await repository.get('same-b')).not.toHaveProperty('lyricPreview');
	});
});

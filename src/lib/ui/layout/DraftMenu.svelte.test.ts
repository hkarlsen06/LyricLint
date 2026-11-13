import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { DraftRecord } from '#lib/core/types.js';
import { chooseOption, createTestWorkbench } from '../test-utils.js';
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

async function revealActions(row: HTMLElement): Promise<void> {
	const trigger = within(row).getByRole('button', { name: /^Actions for / });
	if (trigger.getAttribute('aria-expanded') !== 'true') await userEvent.click(trigger);
}

describe('DraftMenu', () => {
	afterEach(cleanup);

	test.each([390, 1200])(
		'reviews a text file source format at %i pixels without moving its import trigger',
		async (width) => {
			await page.viewport(width, 844);
			const { controller } = createTestWorkbench();
			const importLyrics = vi.fn(async () => true);
			await render(DraftMenu, {
				controller: { ...controller, profile: 'musixmatch', importLyrics }
			});
			await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
			await waitForBody();
			const trigger = screen.getByRole('button', { name: 'Import…' });
			const before = trigger.getBoundingClientRect();
			const file = new File(['[Literal]\nLyrics'], 'A long lyrics filename '.repeat(8) + '.txt', {
				type: 'text/plain'
			});
			await fireEvent.change(document.querySelector('input[type="file"]')!, {
				target: { files: [file] }
			});
			const source = screen.getByRole('combobox', { name: 'Source format' });
			expect(source.textContent).toContain('Musixmatch');
			expect(trigger.getBoundingClientRect().top).toBe(before.top);
			expect(source.getBoundingClientRect().right).toBeLessThanOrEqual(width);
			expect(parseFloat(getComputedStyle(source).fontSize)).toBeGreaterThanOrEqual(16);
			await chooseOption(source, 'Genius');
			// Choosing from the portalled list is a press on the menu's own control.
			expect(document.querySelector('details')?.open).toBe(true);
			// Escape closes the open list first and leaves the menu standing.
			await userEvent.click(source);
			await userEvent.keyboard('{Escape}');
			await waitFor(() => expect(source.getAttribute('aria-expanded')).toBe('false'));
			expect(document.querySelector('details')?.open).toBe(true);
			expect(document.activeElement).toBe(source);
			await fireEvent.click(screen.getByRole('button', { name: 'Open lyrics' }));
			expect(importLyrics).toHaveBeenCalledWith(file, 'genius');
			await waitFor(() => expect(document.querySelector('details')?.open).toBe(false));
			await page.viewport(800, 600);
		}
	);

	test('can close before the row module arrives without reopening or taking focus', async () => {
		const { controller } = createTestWorkbench();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "Open saved 'scribes" });
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

	test.each(['Escape', 'outside press'])(
		'closes on %s before the native toggle event arrives',
		async (action) => {
			const { controller } = createTestWorkbench();
			await render(DraftMenu, { controller });
			const trigger = screen.getByRole('button', { name: "Open saved 'scribes" });
			const menu = trigger.closest('details')!;
			trigger.click();
			expect(menu.open).toBe(true);
			if (action === 'Escape') {
				trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			} else {
				document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			}
			await waitFor(() => expect(menu.open).toBe(false));
			await vi.dynamicImportSettled();
			expect(menu.open).toBe(false);
			expect(trigger.getAttribute('aria-expanded')).toBe('false');
		}
	);

	test('filters a large library and resets the search when the menu closes', async () => {
		const drafts = Array.from({ length: 8 }, (_, index) => ({
			...secondDraft(),
			id: `draft-${index}`,
			title: index === 3 ? 'Summer rain' : `Winter ${index}`,
			text:
				index === 3
					? `[Verse]\n${'Opening words '.repeat(20)}horizon\n[Outro]\nThe final farewell`
					: 'Another line'
		}));
		const { controller } = createTestWorkbench({ drafts });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "Open saved 'scribes" });
		expect(document.querySelector('.draft-menu__popover')).toBeNull();
		await userEvent.click(trigger);
		await waitForBody();
		const popover = document.querySelector('.draft-menu__popover');
		const fileInput = popover?.querySelector('input[type="file"]');
		expect(fileInput).toBeTruthy();
		const search = screen.getByRole('searchbox', {
			name: "Find a saved 'scribe by title or lyrics"
		});
		await fireEvent.input(search, { target: { value: 'SUMMER' } });
		expect(screen.getByRole('button', { name: /^Summer rain/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: /^Winter 1/ })).toBeNull();
		for (const value of ['HORIZON', 'FINAL FAREWELL', '[OUTRO]']) {
			await fireEvent.input(search, { target: { value } });
			expect(screen.getByRole('button', { name: /^Summer rain/ })).toBeTruthy();
			expect(screen.queryByRole('button', { name: /^Winter 1/ })).toBeNull();
		}
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

	test('names row actions once and keeps disclosure, cancellation and focus local', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft(), thirdDraft()]
		});
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const open = screen.getByRole('button', { name: "Open saved 'scribes" });
		expect(open.textContent).toContain('Open');
		await userEvent.click(open);
		await waitForBody();
		expect(screen.queryByRole('button', { name: /^Rename / })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Duplicate / })).toBeNull();
		const second = screen.getByText('Second song').closest('li')!;
		const third = screen.getByText('Third song').closest('li')!;
		const actions = within(second).getByRole('button', { name: 'Actions for Second song' });
		const before = actions.getBoundingClientRect();
		await revealActions(second);
		expect(actions.getBoundingClientRect().top).toBe(before.top);
		expect(actions.getBoundingClientRect().left).toBe(before.left);
		expect(within(second).getByRole('button', { name: 'Rename Second song' }).textContent).toBe(
			'Rename'
		);
		expect(
			within(second).getByRole('button', { name: 'Delete Second song' }).textContent?.trim()
		).toBe('Delete');
		await revealActions(third);
		expect(actions.getAttribute('aria-expanded')).toBe('false');
		expect(screen.getAllByRole('group', { name: /^Actions for / })).toHaveLength(1);
		await userEvent.click(within(third).getByRole('button', { name: 'Rename Third song' }));
		const input = within(third).getByRole('textbox', { name: "'Scribe title" });
		expect(document.activeElement).toBe(input);
		await userEvent.click(within(third).getByRole('button', { name: 'Cancel' }));
		await waitFor(() =>
			expect(document.activeElement).toBe(
				within(third).getByRole('button', { name: 'Actions for Third song' })
			)
		);
		expect(controller.drafts.find((draft) => draft.id === 'draft-3')?.title).toBe('Third song');
	});

	test.each([390, 1200])(
		'keeps a long-title delete confirmation at its trigger at %i pixels',
		async (width) => {
			await page.viewport(width, 844);
			try {
				const title = 'Silver compass and the lights beyond the harbour '.repeat(3).trim();
				const { controller } = createTestWorkbench({ drafts: [{ ...secondDraft(), title }] });
				await controller.refreshDrafts();
				await render(DraftMenu, { controller });
				await userEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
				await waitForBody();
				const row = screen.getByText(title, { exact: true }).closest('li')!;
				await revealActions(row);
				const trigger = within(row).getByRole('button', { name: `Delete ${title}` });
				const before = trigger.getBoundingClientRect();
				await userEvent.click(trigger);
				const confirm = within(row).getByRole('button', { name: `Delete ${title}` });
				const after = confirm.getBoundingClientRect();
				expect(after.left).toBeCloseTo(before.left, 1);
				expect(after.top).toBeCloseTo(before.top, 1);
				expect(after.width).toBeCloseTo(before.width, 1);
				expect(document.activeElement).toBe(confirm);
				expect(row.querySelector('[aria-live]')?.textContent).toContain(title);
				expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
				await userEvent.click(within(row).getByRole('button', { name: 'Cancel' }));
				await waitFor(() =>
					expect(document.activeElement).toBe(
						within(row).getByRole('button', { name: `Delete ${title}` })
					)
				);
				await userEvent.keyboard('{Escape}');
				expect(document.querySelector('details')?.open).toBe(false);
				expect(document.activeElement).toBe(
					screen.getByRole('button', { name: "Open saved 'scribes" })
				);
			} finally {
				await page.viewport(800, 600);
			}
		}
	);

	test('opens, renames, duplicates, exports, and deletes a draft', async () => {
		const exported: Array<{ text: string; filename: string }> = [];
		const base = createTestWorkbench();
		const { controller, repository } = createTestWorkbench({
			drafts: [base.initialDraft, secondDraft()],
			exportLog: exported
		});
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();
		const heading = screen.getByRole('heading', { name: "Saved 'scribes", level: 2 });
		const titlebar = heading.closest('.draft-menu__titlebar');
		const importButton = within(titlebar as HTMLElement).getByRole('button', {
			name: 'Import…'
		});
		expect(importButton.classList.contains('button')).toBe(true);
		expect(importButton.classList.contains('button--quiet')).toBe(false);

		await userEvent.click(screen.getByRole('button', { name: /^Second song/ }));
		expect(controller.draftId).toBe('draft-2');
		await userEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();
		const secondRow = screen.getByText('Second song').closest('li');
		expect(secondRow).toBeTruthy();
		await revealActions(secondRow!);
		await fireEvent.click(
			within(secondRow!).getByRole('button', { name: 'Export Scribe for Second song' })
		);
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

		let renamedRow = screen.getByText('Bridge notes').closest('li');
		expect(renamedRow).toBeTruthy();
		await revealActions(renamedRow!);
		await fireEvent.click(
			within(renamedRow!).getByRole('button', { name: 'Duplicate Bridge notes' })
		);
		await waitFor(async () => expect((await repository.list()).length).toBe(3));
		await waitFor(() => expect(controller.title).toBe('Bridge notes copy'));
		await userEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();
		renamedRow = screen.getByText('Bridge notes').closest('li');
		await revealActions(renamedRow!);

		await fireEvent.click(within(renamedRow!).getByRole('button', { name: 'Delete Bridge notes' }));
		// The pending confirm is the row's only decision: the other row actions
		// step aside, and the row stops being a way into the draft.
		expect(within(renamedRow!).queryByRole('button', { name: /^Rename/ })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: /^Duplicate/ })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: /^Export/ })).toBeNull();
		expect(within(renamedRow!).queryByRole('button', { name: /^Bridge notes/ })).toBeNull();

		// Two presses in one place: the confirm takes the trigger's slot, and the
		// press that armed it carries focus across the swap. It keeps the draft in
		// its accessible name, because focus lands on it: a bare "Delete" read out
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
	// everything. That footer was the whole menu on a fresh install: a sentence
	// saying there is nothing saved yet, under a red button offering to delete it.
	// So the command lives in the tools panel, beside the paragraph that says
	// what local data is. Re-adding it here is the specific regression.
	test('offers no way to delete everything, and a fresh install is one sentence', async () => {
		const { controller } = createTestWorkbench({ drafts: [] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();

		expect(screen.getByText(/No saved 'scribes yet/u)).toBeTruthy();
		expect(screen.queryByRole('button', { name: /delete all/iu })).toBeNull();
	});

	test('a populated menu offers no way to delete everything either', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
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
		await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();

		const row = screen.getByText('Second song').closest('li')!;
		await revealActions(row);
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
		await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();

		const second = screen.getByText('Second song').closest('li')!;
		const third = screen.getByText('Third song').closest('li')!;
		await revealActions(second);
		await fireEvent.click(within(second).getByRole('button', { name: 'Delete Second song' }));
		await revealActions(third);
		await fireEvent.click(within(third).getByRole('button', { name: 'Delete Third song' }));

		expect(within(second).queryByRole('button', { name: 'Delete Second song' })).toBeNull();
		expect(within(third).getByRole('button', { name: 'Delete Third song' }).classList).toContain(
			'remove-button__confirm'
		);
	});

	test('closes on a press outside, abandoning any pending confirm', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "Open saved 'scribes" });
		await fireEvent.click(trigger);
		await waitForBody();
		const menu = trigger.closest('details')!;
		// The native `toggle` event lands a task after the click, and it is what
		// tells the component it is open; wait for the expansion state to say so.
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		const row = screen.getByText('Second song').closest('li')!;
		await revealActions(row);
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
		await revealActions(reopened);
		expect(within(reopened).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
	});

	// A `<details>` closes on its summary and on an outside press and on nothing
	// else, so this menu had two of the three exits every transient surface here
	// owes, and an armed delete could not be abandoned from the keyboard at all.
	test('closes on Escape, abandoning any pending confirm and returning focus', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		const trigger = screen.getByRole('button', { name: "Open saved 'scribes" });
		await fireEvent.click(trigger);
		await waitForBody();
		const menu = trigger.closest('details')!;
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));

		const row = screen.getByText('Second song').closest('li')!;
		await revealActions(row);
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
		await revealActions(reopened);
		expect(within(reopened).getByRole('button', { name: 'Delete Second song' })).toBeTruthy();
	});

	// The armed row used to be a template branch of its own, mounting a *new*
	// `RemoveButton` with `pending` already true, so its live region was born
	// holding the question, which is not an update and is therefore not
	// announced, and focus landed on a confirm named a bare "Delete".
	test('arms the confirm in place, so its live region and its name both land', async () => {
		const base = createTestWorkbench();
		const { controller } = createTestWorkbench({ drafts: [base.initialDraft, secondDraft()] });
		await controller.refreshDrafts();
		await render(DraftMenu, { controller });
		await fireEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();

		const row = screen.getByText('Second song').closest('li')!;
		await revealActions(row);
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
		const trigger = screen.getByRole('button', { name: "Open saved 'scribes" });
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
		await userEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
		await waitForBody();
		expect(screen.getByText('The morning sun')).toBeTruthy();
		expect(screen.getByText('A winter moon')).toBeTruthy();
		expect(screen.queryByText('Unique opening')).toBeNull();
		const unique = screen.getByText('Named song').closest('li');
		expect(unique?.querySelector('.draft-menu__preview')).toBeNull();
		const search = screen.getByRole('searchbox', {
			name: "Find a saved 'scribe by title or lyrics"
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

	test.each([390, 1200])(
		'names each draft’s format, and its edited export, beside the date at %i pixels',
		async (width) => {
			await page.viewport(width, 844);
			const drafts: DraftRecord[] = [
				{
					...secondDraft(),
					id: 'genius-copy',
					title: 'A long song title that has to give way before the format does',
					writing: {
						schema: 1,
						phase: 'writing',
						profile: 'genius',
						export: { profile: 'musixmatch', text: 'Another line' }
					}
				},
				{
					...secondDraft(),
					id: 'musixmatch-copy',
					title: 'Second song',
					text: 'Another line',
					writing: { schema: 1, phase: 'writing', profile: 'musixmatch' }
				}
			];
			const { controller } = createTestWorkbench({ drafts });
			await controller.refreshDrafts();
			await render(DraftMenu, { controller });
			await userEvent.click(screen.getByRole('button', { name: "Open saved 'scribes" }));
			await waitForBody();

			const genius = screen.getByRole('button', {
				name: /^A long song title.*Genius\s\+ Musixmatch export/
			});
			const musixmatch = screen.getByRole('button', { name: /^Second song Musixmatch/ });
			expect(within(musixmatch).queryByText(/export/)).toBeNull();
			// The format and the date stay whole; the title is what truncates.
			for (const row of [genius, musixmatch]) {
				const chip = row.querySelector<HTMLElement>('.draft-menu__format')!;
				const time = row.querySelector('time')!;
				expect(chip.scrollWidth).toBeLessThanOrEqual(chip.clientWidth);
				expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(
					time.getBoundingClientRect().left
				);
				expect(time.getBoundingClientRect().right).toBeLessThanOrEqual(
					row.getBoundingClientRect().right + 1
				);
			}
		}
	);
});

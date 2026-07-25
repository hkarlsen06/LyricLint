import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import LiveRegion from '../primitives/LiveRegion.svelte';
import { createTestWorkbench } from '../test-utils.js';
import DocumentToolbar from './DocumentToolbar.svelte';
import Workspace from './Workspace.svelte';

describe('Workspace and toolbar', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	test('copies the exact canonical string and announces copy completion', async () => {
		const canonical = '[Chorus: A & B]\r\n<i>歌 é 🎤</i>';
		const writeText = vi.fn(async () => {});
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		const { controller, feedback } = createTestWorkbench({ text: canonical });
		render(DocumentToolbar, { controller });
		render(LiveRegion, { feedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Copy Genius markup' }));
		expect(writeText).toHaveBeenCalledWith(canonical);
		await waitFor(() =>
			expect(screen.getByTestId('live-region').textContent).toContain(
				'Canonical Genius markup copied'
			)
		);
	});

	test('keeps the header to the mockup surface: drafts affordances, copy pill, no edit buttons', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		// The single visible command is the high-contrast copy pill; section
		// insertion, performer assignment, and undo/redo stay reachable through
		// the editor itself (ghost pill, selection card, and Mod+Z shortcuts).
		expect(screen.getByRole('button', { name: 'Copy Genius markup' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Drafts' })).toBeTruthy();
		// The left edge is the brand lockup now, not a second drafts affordance.
		expect(screen.getByRole('img', { name: 'LyricLint' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Open drafts menu' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Insert section' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Assign performer' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Undo document edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Redo document edit' })).toBeNull();
	});

	test('the icon-only drafts trigger toggles the popover and drops its visible label', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const trigger = screen.getByRole('button', { name: 'Drafts' });
		// The word moved into the accessible name; nothing in the header spells it.
		expect(trigger.textContent?.trim()).toBe('');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(trigger);
		// `bind:open` rides the details element's `toggle` event, which lands a
		// frame after the click, so the expansion state settles asynchronously.
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
		expect(screen.getByText('Saved drafts')).toBeTruthy();
	});

	test('reads brand, draft name, then save state across the identity strip', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const identity = document.querySelector('.document-toolbar__identity');
		expect(identity).toBeTruthy();
		expect([...identity!.children].filter((child) => child.tagName !== 'LABEL')).toEqual([
			screen.getByRole('img', { name: 'LyricLint' }),
			screen.getByLabelText('Draft title'),
			screen.getByRole('img', { name: /^Autosave status/ })
		]);
	});

	test('shows save state as a bare glyph until it fails, then spells the failure out', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const status = screen.getByRole('img', { name: /^Autosave status/ });
		// Healthy states are icon-only; the wording lives in the name and tooltip.
		expect(status.textContent?.trim()).toBe('');
		expect(status.getAttribute('title')).toBe('Local draft');

		controller.setSaveStatus('saved');
		await waitFor(() => expect(status.getAttribute('title')).toContain('Saved locally'));
		expect(status.textContent?.trim()).toBe('');

		// A failure must not be carried by red alone, so the label comes back.
		controller.setSaveStatus('failed');
		await waitFor(() => expect(status.textContent).toContain('Save failed'));
		expect(status.classList.contains('failed')).toBe(true);
	});

	test('anchors the right edge with copy, after the language and drafts controls', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const commands = document.querySelector('.document-toolbar__commands');
		expect(commands).toBeTruthy();
		const copy = screen.getByRole('button', { name: 'Copy Genius markup' });
		expect(commands!.lastElementChild).toBe(copy);
		// Copy ends the tab order too, not just the visual row.
		const order = [...commands!.querySelectorAll('button, summary')];
		expect(order.indexOf(copy)).toBe(order.length - 1);
	});

	test('reflects a late autosave failure instead of remaining on saving', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		controller.setSaveStatus('saving');
		await waitFor(() =>
			expect(screen.getByRole('img', { name: /^Autosave status/ }).getAttribute('title')).toContain(
				'Saving'
			)
		);
		controller.setSaveStatus('failed');

		await waitFor(() =>
			expect(screen.getByRole('img', { name: /^Autosave status/ }).textContent).toContain(
				'Save failed'
			)
		);
	});

	test('spans the toolbar across both columns with the panel tabs beneath it', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		render(Workspace, { controller });

		// The toolbar belongs to the window, not to the editor half of it, so it
		// is a child of the workspace grid rather than of the editor region.
		const workspace = screen.getByTestId('workspace');
		const toolbar = screen.getByRole('banner', { name: 'Document controls' });
		expect(toolbar.parentElement).toBe(workspace);
		expect(document.querySelector('.editor-region')?.contains(toolbar)).toBe(false);
		expect(getComputedStyle(toolbar).gridColumnStart).toBe('1');
		expect(getComputedStyle(toolbar).gridColumnEnd).toBe('-1');

		// The tab strip then hangs under it, in the row the two columns share.
		const editorRegion = document.querySelector('.editor-region')!;
		const panel = document.querySelector('.right-panel')!;
		expect(getComputedStyle(editorRegion).gridRowStart).toBe('2');
		expect(getComputedStyle(panel).gridRowStart).toBe('2');
		expect(panel.querySelector('.panel-tabs')).toBeTruthy();
	});

	test('pluralizes the status bar counts, singular at one', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		render(Workspace, { controller });

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).toContain('1 line · 1 section');
		expect(summary.textContent).not.toContain('1 lines');
		expect(summary.textContent).not.toContain('1 sections');
		expect(summary.textContent).toContain('0 performers · 0 voice groups');
	});

	test('re-lints the current document immediately when its language changes', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		render(Workspace, { controller });

		await waitFor(() =>
			expect(
				controller.snapshot.diagnostics.some(
					(diagnostic) => diagnostic.ruleId === 'section.header-language'
				)
			).toBe(false)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: English' }));
		const dialog = screen.getByRole('dialog', { name: 'Lyric language' });
		await fireEvent.input(within(dialog).getByPlaceholderText('Search languages'), {
			target: { value: 'Norwegian' }
		});
		await fireEvent.click(within(dialog).getByRole('button', { name: 'Norwegian' }));
		await waitFor(() => expect(controller.language).toBe('no'));
		await waitFor(() =>
			expect(
				controller.snapshot.diagnostics.some(
					(diagnostic) => diagnostic.ruleId === 'section.header-language'
				)
			).toBe(true)
		);

		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: Norwegian' }));
		await fireEvent.click(
			within(screen.getByRole('dialog', { name: 'Lyric language' })).getByRole('button', {
				name: 'English'
			})
		);
		await waitFor(() =>
			expect(
				controller.snapshot.diagnostics.some(
					(diagnostic) => diagnostic.ruleId === 'section.header-language'
				)
			).toBe(false)
		);
	});

	test('shows and clears a language mismatch issue in the linter panel', async () => {
		const { controller } = createTestWorkbench({
			text: '[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir'
		});
		render(Workspace, { controller });

		const message = 'Lyrics appear to be French, but English is selected.';
		await waitFor(() =>
			expect(
				controller.snapshot.diagnostics.some(
					(diagnostic) => diagnostic.ruleId === 'language.selection-mismatch'
				)
			).toBe(true)
		);
		await waitFor(() => expect(screen.getByText(message)).toBeTruthy());

		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: English' }));
		await fireEvent.click(
			within(screen.getByRole('dialog', { name: 'Lyric language' })).getByRole('button', {
				name: 'French'
			})
		);

		await waitFor(() => expect(controller.language).toBe('fr'));
		await waitFor(() => expect(screen.queryByText(message)).toBeNull());
	});

	test('offers the complete Genius language inventory in the selector', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: English' }));
		const dialog = screen.getByRole('dialog', { name: 'Lyric language' });
		const options = dialog.querySelectorAll('.language-option');
		expect(options).toHaveLength(65);
		expect(within(dialog).getByText('Recent')).toBeTruthy();
		expect(within(dialog).getByText('All languages')).toBeTruthy();
		for (const language of [
			'Arabic',
			'German',
			'Spanish',
			'French',
			'Japanese',
			'Korean',
			'Norwegian',
			'Welsh'
		]) {
			expect(within(dialog).getByRole('button', { name: language })).toBeTruthy();
		}
	});

	test('filters languages and restores focus to the trigger when the dialog closes', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });
		const trigger = screen.getByRole('button', { name: 'Lyric language: English' });

		await fireEvent.click(trigger);
		const dialog = screen.getByRole('dialog', { name: 'Lyric language' });
		const search = within(dialog).getByPlaceholderText('Search languages');
		expect(document.activeElement).toBe(search);

		await fireEvent.input(search, { target: { value: 'norw' } });
		expect(within(dialog).getByRole('button', { name: 'Norwegian' })).toBeTruthy();
		expect(within(dialog).queryByRole('button', { name: 'Spanish' })).toBeNull();
		expect(within(dialog).queryByText('Recent')).toBeNull();
		expect(within(dialog).queryByText('All languages')).toBeNull();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
		expect(document.activeElement).toBe(trigger);
	});

	test('moves used languages to the top of the recent section without duplicates', async () => {
		const { controller } = createTestWorkbench({ recentLanguages: ['fr', 'no'] });
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: English' }));
		let dialog = screen.getByRole('dialog', { name: 'Lyric language' });
		let options = within(dialog)
			.getAllByRole('button')
			.filter((button) => button.classList.contains('language-option'));
		expect(options.slice(0, 3).map((option) => option.getAttribute('aria-label'))).toEqual([
			'English',
			'French',
			'Norwegian'
		]);

		await fireEvent.click(within(dialog).getByRole('button', { name: 'French' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Lyric language: French' }));
		dialog = screen.getByRole('dialog', { name: 'Lyric language' });
		options = within(dialog)
			.getAllByRole('button')
			.filter((button) => button.classList.contains('language-option'));
		expect(options.slice(0, 3).map((option) => option.getAttribute('aria-label'))).toEqual([
			'French',
			'English',
			'Norwegian'
		]);
		expect(options.filter((option) => option.getAttribute('aria-label') === 'French')).toHaveLength(
			1
		);
	});

	test('keeps the panel mounted at a narrow viewport with no way to dismiss it', async () => {
		vi.stubGlobal(
			'matchMedia',
			vi.fn().mockReturnValue({
				matches: true,
				media: '(max-width: 68rem)',
				onchange: null,
				addEventListener: vi.fn(),
				removeEventListener: vi.fn(),
				addListener: vi.fn(),
				removeListener: vi.fn(),
				dispatchEvent: vi.fn()
			})
		);
		const { controller } = createTestWorkbench();
		render(Workspace, { controller });

		const editorRegion = screen.getByTestId('editor-region');
		expect(getComputedStyle(editorRegion).display).not.toBe('none');
		expect(screen.getByRole('tab', { name: /Linter/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Hide right panel' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Show right panel' })).toBeNull();
	});
});

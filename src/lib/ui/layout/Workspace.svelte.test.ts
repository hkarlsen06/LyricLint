import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import LiveRegion from '../primitives/LiveRegion.svelte';
import { createTestWorkbench } from '../test-utils.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
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

		await fireEvent.click(screen.getByRole('button', { name: 'Copy lyrics' }));
		expect(writeText).toHaveBeenCalledWith(canonical);
		await waitFor(() =>
			expect(screen.getByTestId('live-region').textContent).toContain(
				'Canonical Genius markup copied'
			)
		);
	});

	// The contrast tier is the loudest thing on the screen, and on an empty
	// document `Copy lyrics` spends it pointing at the exit. Same slot, same
	// tier, label following the state — and never both at once.
	test('offers the paste end of the work while the document is empty', () => {
		const { controller } = createTestWorkbench({ text: '' });
		render(DocumentToolbar, { controller });

		const paste = screen.getByRole('button', { name: 'Paste lyrics' });
		expect(paste.classList.contains('button--contrast')).toBe(true);
		expect(screen.queryByRole('button', { name: 'Copy lyrics' })).toBeNull();
	});

	test('returns the slot to copy once the document has something in it', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nLine' });
		render(DocumentToolbar, { controller });

		expect(screen.getByRole('button', { name: 'Copy lyrics' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Paste lyrics' })).toBeNull();
	});

	test('pastes the clipboard into the empty document in one edit', async () => {
		const { controller, calls } = createTestWorkbench({
			text: '',
			clipboardText: '[Verse]\nPasted line'
		});
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Paste lyrics' }));

		await waitFor(() => expect(calls.dispatched).toHaveLength(1));
		expect(calls.dispatched[0]!.edits).toEqual([
			{ from: 0, to: 0, insert: '[Verse]\nPasted line' }
		]);
	});

	// Firefox gates a programmatic read behind its own prompt and Safari denies
	// it outright, but the keyboard path is still open in both. Put the caret
	// where that keystroke lands instead of explaining a permission.
	test('hands over to keyboard paste when the clipboard cannot be read', async () => {
		const { controller, calls, feedback } = createTestWorkbench({ text: '' });
		render(DocumentToolbar, { controller });
		render(LiveRegion, { feedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Paste lyrics' }));

		await waitFor(() => expect(calls.focusCount).toBe(1));
		expect(calls.dispatched).toEqual([]);
		expect(screen.getByTestId('live-region').textContent).toContain('paste shortcut');
	});

	test('keeps document creation, navigation, language, and copy in the toolbar', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		// Section insertion, performer assignment, and undo/redo stay reachable
		// through the editor itself (ghost control, selection surface, and Mod+Z).
		expect(screen.getByRole('button', { name: 'New draft' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Copy lyrics' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Drafts' })).toBeTruthy();
		// The left edge is the brand lockup now, and it returns to the marketing home.
		expect(screen.getByRole('link', { name: 'LyricLint home' })).toHaveAttribute('href', '/');
		expect(screen.queryByRole('button', { name: 'Open drafts menu' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Insert section' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Assign performer' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Undo document edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Redo document edit' })).toBeNull();
	});

	// The drafts trigger is the draft name's own disclosure now, not a hamburger
	// at the far end of the command strip.
	test('the drafts disclosure hangs off the title field and stays icon-only', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const trigger = screen.getByRole('button', { name: 'Drafts' });
		const switcher = trigger.closest('.draft-switcher');
		expect(switcher).toBeTruthy();
		// One control: the field you rename in and the chevron that swaps the draft.
		expect(within(switcher as HTMLElement).getByLabelText('Draft title')).toBe(
			screen.getByLabelText('Draft title')
		);
		// The word moved into the accessible name; nothing in the header spells it.
		expect(trigger.textContent?.trim()).toBe('');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(trigger);
		// `bind:open` rides the details element's `toggle` event, which lands a
		// frame after the click, so the expansion state settles asynchronously.
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
		expect(screen.getByText('Saved drafts')).toBeTruthy();
	});

	test('the plus button creates and opens a new draft', async () => {
		const { controller, repository } = createTestWorkbench();
		const initialDraftId = controller.draftId;
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'New draft' }));

		await waitFor(() => expect(controller.draftId).not.toBe(initialDraftId));
		expect(controller.title).toBe('Untitled draft');
		// Nothing is stored for it while it is empty, so the list still holds only
		// the draft that has something in it.
		expect((await repository.list()).map(({ id }) => id)).toEqual([initialDraftId]);
	});

	test('reads brand, draft name, then the new-draft plus across the identity strip', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const identity = document.querySelector('.document-toolbar__identity');
		expect(identity).toBeTruthy();
		expect([...identity!.children].filter((child) => child.tagName !== 'LABEL')).toEqual([
			screen.getByRole('link', { name: 'LyricLint home' }),
			// The name is a control now — the field and its drafts disclosure — so
			// the middle of the strip is the switcher rather than a bare input.
			screen.getByLabelText('Draft title').closest('.draft-switcher'),
			// Creation sits with the draft it creates, in the slot the save glyph
			// used to hold; the save readout trails it, silent unless it fails.
			screen.getByRole('button', { name: 'New draft' }),
			screen.getByRole('img', { name: /^Autosave status/ })
		]);
	});

	test('selects the whole default title on click without overriding a named draft caret', async () => {
		const { controller } = createTestWorkbench();
		await controller.setTitle('Untitled draft');
		render(DocumentToolbar, { controller });

		const title = screen.getByLabelText('Draft title') as HTMLInputElement;
		await fireEvent.click(title);
		expect(title.selectionStart).toBe(0);
		expect(title.selectionEnd).toBe('Untitled draft'.length);

		await controller.setTitle('Test draft');
		await waitFor(() => expect(title.value).toBe('Test draft'));
		const select = vi.spyOn(title, 'select');
		await fireEvent.click(title);
		expect(select).not.toHaveBeenCalled();
	});

	test('draws nothing while saving is going well, then spells the failure out', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const status = screen.getByRole('img', { name: /^Autosave status/ });
		// The healthy states draw nothing at all — no glyph, no words — but stay in
		// the accessible tree through the name and the tooltip.
		expect(status.textContent?.trim()).toBe('');
		expect(status.querySelector('svg')).toBeNull();
		expect(status.classList.contains('sr-only')).toBe(true);
		expect(status.getAttribute('title')).toBe('Local draft');

		controller.setSaveStatus('saved');
		await waitFor(() => expect(status.getAttribute('title')).toContain('Saved locally'));
		expect(status.textContent?.trim()).toBe('');
		expect(status.classList.contains('sr-only')).toBe(true);

		// A failure is the one state that draws, and it must not be carried by red
		// alone, so it comes back with both its label and an alert glyph.
		controller.setSaveStatus('failed');
		await waitFor(() => expect(status.textContent).toContain('Save failed'));
		expect(status.classList.contains('failed')).toBe(true);
		expect(status.classList.contains('sr-only')).toBe(false);
		expect(status.querySelector('svg')).toBeTruthy();
	});

	test('leaves language and copy in the command strip, with drafts and creation out of it', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const commands = document.querySelector('.document-toolbar__commands');
		expect(commands).toBeTruthy();
		const language = screen.getByRole('button', { name: 'Lyric language: English' });
		const copy = screen.getByRole('button', { name: 'Copy lyrics' });
		expect([...commands!.children].filter((child) => child.matches('button, details'))).toEqual([
			language,
			copy
		]);
		// Navigation between drafts left the strip for the draft's own name, and
		// creation followed it — neither acts on the document this strip commands.
		expect(commands!.contains(screen.getByRole('button', { name: 'Drafts' }))).toBe(false);
		expect(commands!.contains(screen.getByRole('button', { name: 'New draft' }))).toBe(false);
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

	test('continues the controller revision when the editor mounts', async () => {
		const { controller } = createTestWorkbench({ text: '“hello”', revision: 5 });
		render(Workspace, { controller });

		await fireEvent.input(screen.getByRole('textbox', { name: 'Lyrics editor' }), {
			target: { value: '"hello”' }
		});

		await waitFor(() => expect(controller.snapshot.revision).toBe(6));
		expect(controller.snapshot.text).toBe('"hello”');
	});

	test('pluralizes the status bar counts, singular at one', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		render(Workspace, { controller });

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).toContain('1 line · 1 section');
		expect(summary.textContent).not.toContain('1 lines');
		expect(summary.textContent).not.toContain('1 sections');
	});

	// A count worth stating is one that could have been otherwise. This document
	// has lines and sections but no performers, so the roster half of the row is
	// absent rather than reporting two zeros.
	test('omits a status bar count until it has something to report', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		render(Workspace, { controller });

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).not.toContain('0 performers');
		expect(summary.textContent).not.toContain('0 voice groups');
	});

	test('states no counts at all for an empty document', () => {
		const { controller } = createTestWorkbench({ text: '' });
		render(Workspace, { controller });

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		// Nothing left in the row counts anything, so nothing left in it is a
		// number — which is a stricter claim than naming the four that went.
		expect(summary.textContent).not.toMatch(/\d/);
		expect(summary.textContent?.trim()).toBe('About LyricLint');
	});

	// The row summarises the document. A claim about the app and a legend for
	// keystrokes nobody asked about are neither of them that, so the end of the
	// row is the one link and nothing else.
	test('carries no shortcut legend or offline claim in the status bar', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		render(Workspace, { controller });

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).not.toContain('next issue');
		expect(summary.textContent).not.toContain('fixes');
		expect(summary.textContent).not.toContain('offline ready');
		expect(summary.querySelector('kbd')).toBeNull();
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

		const setLanguage = screen.getByRole('button', { name: 'Set language to French' });
		expect(setLanguage.classList.contains('button--contrast')).toBe(true);
		expect(screen.getByRole('button', { name: 'Ignore' })).toBeTruthy();
		await fireEvent.click(setLanguage);

		await waitFor(() => expect(controller.language).toBe('fr'));
		await waitFor(() => expect(screen.queryByText(message)).toBeNull());
		await waitFor(() =>
			expect(screen.getByRole('tab', { name: /^Linter/u })).toBe(document.activeElement)
		);
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

	test('puts the way out of the workbench in the status bar, not the toolbar', () => {
		// The toolbar holds commands that act on the document; this acts on nothing,
		// so it lives in the quietest persistent row instead. Anyone already in the
		// app has found the product — what they occasionally need is a URL to hand
		// to someone else.
		const { controller } = createTestWorkbench();
		render(Workspace, { controller });

		const link = screen.getByRole('link', { name: 'About LyricLint' });
		expect(link.getAttribute('href')).toBe('/');
		expect(link.closest('.status-bar')).toBeTruthy();
		expect(link.closest('.document-toolbar')).toBeNull();
	});

	test('keeps the status-bar link off the accent color', () => {
		// The band is the quietest chrome in the window. A saturated blue would be
		// the only saturated thing in it, and in a linter a lone spot of color reads
		// as a finding — so the link is marked by its underline and takes the row's
		// muted color instead.
		const { controller } = createTestWorkbench();
		render(Workspace, { controller });

		const link = screen.getByRole('link', { name: 'About LyricLint' });
		const styles = getComputedStyle(link);
		const row = getComputedStyle(link.closest('.status-bar')!);
		expect(styles.color).toBe(row.color);
		expect(styles.textDecorationLine).toBe('underline');
	});

	// The strip's own control is the only way in, so it has to be findable: a
	// bordered command among the row's quiet glyphs and readouts, not another
	// muted word beside the track's name.
	test('draws the sync control as a command and starts a run from the top of the song', async () => {
		const audio = new StubAudio();
		const feedback = createFeedbackState();
		const player = createMediaPlayer({
			feedback,
			createAudio: () => audio.asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			loadYouTubeApi: createStubYouTubeApi().load,
			scheduleYouTubePoll: createStubPoll().schedule
		});
		const { controller } = createTestWorkbench({
			media: { repository: createInMemoryMediaRepository([]), player }
		});
		// The controller opens the initial draft's media on construction, and that
		// call detaches whatever was loaded before it looks for a record. Attaching
		// inside that window would be undone by it.
		await new Promise((resolve) => setTimeout(resolve, 0));
		await controller.media!.attachFile(new File([''], 'track.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(200);
		render(Workspace, { controller });

		const sync = await screen.findByRole('button', { name: 'Sync lyrics' });
		expect(sync.classList.contains('button')).toBe(true);
		expect(getComputedStyle(sync).borderStyle).toBe('solid');

		player.seek(90);
		await fireEvent.click(sync);

		// One pass over the lyric against one pass of the audio: the editor puts the
		// caret at the top, so the shell rewinds the song to match it.
		expect(player.currentTime).toBe(0);
		expect(player.playing).toBe(true);
		expect(screen.getByRole('button', { name: 'Stop syncing' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Stop syncing' }));
		expect(player.playing).toBe(false);
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

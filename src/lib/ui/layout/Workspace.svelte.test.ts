import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import type { AssistantDraftBridge } from '$lib/assistant/draft-bridge.js';
import type { Diagnostic, TextRange } from '$lib/core/types.js';
import type { HarperDiagnosticProvider } from '$lib/rules/index.js';
import LiveRegion from '../primitives/LiveRegion.svelte';
import { createTestWorkbench, performer } from '../test-utils.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createMediaPlayer, type MediaPlayer } from '../state/media-player.svelte.js';
import type { MediaStore } from '../state/media-store.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
import DocumentToolbar from './DocumentToolbar.svelte';
import MockEditorPane from './MockEditorPane.svelte';
import Workspace from './Workspace.svelte';
import WorkspaceWithAssistant from './WorkspaceWithAssistant.svelte';

const noHarper: HarperDiagnosticProvider = {
	lint: async () => [],
	dispose: async () => {}
};

function renderWorkspace(
	controller: ReturnType<typeof createTestWorkbench>['controller'],
	harperProvider: HarperDiagnosticProvider = noHarper,
	assistant?: AssistantState
) {
	const props = { controller, editorComponent: MockEditorPane, harperProvider };
	// With an assistant, mount through the host that provides the real context —
	// the same door the app layout uses — rather than mocking the module.
	return assistant
		? render(WorkspaceWithAssistant, { assistant, ...props })
		: render(Workspace, props);
}

describe('Workspace and toolbar', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
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

	// The confirmation is the button itself — same slot, same tier, label
	// following the state — and it only says so when the clipboard took it.
	test('confirms a copy in the button, and stays silent when the clipboard refuses', async () => {
		const writeText = vi.fn(async () => {});
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		const { controller } = createTestWorkbench({ text: '[Verse]\nLine' });
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: 'Copy lyrics' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Lyrics copied' })).toBeTruthy());

		writeText.mockRejectedValueOnce(new Error('denied'));
		await fireEvent.click(screen.getByRole('button', { name: 'Lyrics copied' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Copy lyrics' })).toBeTruthy());
	});

	/*
	 * The receipt is the one copy worth interrupting: the next thing the user does
	 * with these lyrics is fill in a Genius song page, and the facts the catalogue
	 * read already paid for are several of its fields. It draws only where there is
	 * something on it besides the word the button says in its own slot — a modal
	 * repeating a press is a surface that opened itself for nothing.
	 */
	test("hands the song's facts over with the copy, and only where there are any", async () => {
		const writeText = vi.fn(async () => {});
		vi.stubGlobal('navigator', { clipboard: { writeText } });
		const { controller } = createTestWorkbench({ text: '[Verse]\nLine' });
		// The toolbar reads one fact off the store — `player.songDetails` — so the
		// double carries exactly that; the workbench under test has no media store
		// of its own to borrow one from.
		const player: Partial<MediaPlayer> = {
			songDetails: { artist: 'Mul', title: 'Sensommer', label: 'Sony', isrc: 'NOA1234' }
		};
		const withSongMedia: Partial<MediaStore> = { player: player as MediaPlayer };
		const withSong: typeof controller = {
			...controller,
			media: withSongMedia as MediaStore
		};

		const { unmount } = render(DocumentToolbar, { controller: withSong });
		await fireEvent.click(screen.getByRole('button', { name: 'Copy lyrics' }));

		const receipt = await waitFor(() => {
			const dialog = document.querySelector('dialog.copy-receipt') as HTMLDialogElement;
			expect(dialog.open).toBe(true);
			return dialog;
		});
		// The fields that form actually asks for: artist and title are on it here and
		// not in the tools panel, which leaves them to the toolbar and the cover
		// band the receipt covers up — and the ISRC is the other way round, because
		// there is nowhere on the page to type it.
		expect([...receipt.querySelectorAll('dt')].map((term) => term.textContent)).toEqual([
			'Artist',
			'Title',
			'Label'
		]);
		// The button keeps its own label, so the copy is not confirmed twice.
		expect(screen.queryByRole('button', { name: 'Lyrics copied' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		await waitFor(() => expect(receipt.open).toBe(false));
		unmount();

		// A source that knows nothing about the song has nothing to hand over, so
		// the button is the whole of the confirmation.
		render(DocumentToolbar, { controller });
		await fireEvent.click(screen.getByRole('button', { name: 'Copy lyrics' }));
		await waitFor(() => expect(screen.getByRole('button', { name: 'Lyrics copied' })).toBeTruthy());
		expect((document.querySelector('dialog.copy-receipt') as HTMLDialogElement).open).toBe(false);
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

		// Section insertion and performer assignment stay reachable through the
		// editor itself (ghost control and selection surface).
		expect(screen.getByRole('button', { name: "New 'scribe" })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Copy lyrics' })).toBeTruthy();
		expect(screen.getByRole('button', { name: "'Scribes" })).toBeTruthy();
		// The left edge is the brand lockup now, and it returns to the marketing home.
		expect(screen.getByRole('link', { name: 'LyricLint home' })).toHaveAttribute('href', '/');
		expect(screen.queryByRole('button', { name: 'Open drafts menu' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Insert section' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Assign performer' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Undo document edit' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Redo document edit' })).toBeNull();
	});

	test('waits for the boot reveal before handing the wordmark into the toolbar', async () => {
		const { controller } = createTestWorkbench();
		const view = render(DocumentToolbar, { controller, brandRevealed: false });
		const wordmark = document.querySelector('.app-wordmark') as HTMLElement;
		const title = screen.getByLabelText("'Scribe title");
		const awayLeft = title.getBoundingClientRect().left;

		expect(wordmark).toHaveAttribute('data-visible', 'false');
		// The lockup reserves nothing while it is away, so the draft's name starts
		// at the head of the toolbar rather than beside a hand of empty chrome.
		expect(wordmark.getBoundingClientRect().width).toBe(0);

		await view.rerender({ controller, brandRevealed: true });
		expect(screen.getByRole('img', { name: 'LyricLint' })).toBe(wordmark);
		expect(wordmark).toHaveAttribute('data-visible', 'true');

		// And the name is pushed along by the arriving word rather than sitting
		// still while it fills a slot that was already open.
		await Promise.all(wordmark.getAnimations().map((animation) => animation.finished));
		const width = wordmark.getBoundingClientRect().width;
		expect(width).toBeGreaterThan(0);
		expect(title.getBoundingClientRect().left).toBeCloseTo(awayLeft + width, 0);
	});

	test('replaces the selection with an unknown lyric marker in one undoable edit', async () => {
		const { controller, calls } = createTestWorkbench({
			text: '[Verse]\nI heard something',
			selection: { anchor: 15, head: 10 }
		});

		controller.insertUnknownMarker();

		expect(calls.dispatched).toEqual([
			{
				baseRevision: 4,
				edits: [{ from: 10, to: 15, insert: '[?]' }],
				selectionAfter: { anchor: 13, head: 13 }
			}
		]);
		expect(calls.focusCount).toBe(1);
	});

	// The drafts trigger is the draft name's own disclosure now, not a hamburger
	// at the far end of the command strip.
	test('the drafts disclosure hangs off the title field and stays icon-only', async () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const trigger = screen.getByRole('button', { name: "'Scribes" });
		const switcher = trigger.closest('.draft-switcher');
		expect(switcher).toBeTruthy();
		// One control: the field you rename in and the chevron that swaps the draft.
		expect(within(switcher as HTMLElement).getByLabelText("'Scribe title")).toBe(
			screen.getByLabelText("'Scribe title")
		);
		// The word moved into the accessible name; nothing in the header spells it.
		expect(trigger.textContent?.trim()).toBe('');
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		await userEvent.click(trigger);
		// `bind:open` rides the details element's `toggle` event, which lands a
		// frame after the click, so the expansion state settles asynchronously.
		await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('true'));
		expect(screen.getByText("Saved 'scribes")).toBeTruthy();
	});

	test('the plus button creates and opens a new draft', async () => {
		const { controller, repository } = createTestWorkbench();
		const initialDraftId = controller.draftId;
		render(DocumentToolbar, { controller });

		await fireEvent.click(screen.getByRole('button', { name: "New 'scribe" }));

		await waitFor(() => expect(controller.draftId).not.toBe(initialDraftId));
		expect(controller.title).toBe('Untitled transcription');
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
			screen.getByLabelText("'Scribe title").closest('.draft-switcher'),
			// Creation sits with the draft it creates, in the slot the save glyph
			// used to hold; the save readout trails it, silent unless it fails.
			screen.getByRole('button', { name: "New 'scribe" }),
			screen.getByRole('img', { name: /^Autosave status/ })
		]);
	});

	test('selects the whole default title on click without overriding a named draft caret', async () => {
		const { controller } = createTestWorkbench();
		await controller.setTitle('Untitled transcription');
		render(DocumentToolbar, { controller });

		const title = screen.getByLabelText("'Scribe title") as HTMLInputElement;
		await fireEvent.click(title);
		expect(title.selectionStart).toBe(0);
		expect(title.selectionEnd).toBe('Untitled transcription'.length);

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
		expect(status.getAttribute('title')).toBe("Local 'scribe");

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

	test('leaves document commands in the command strip, with drafts and creation out of it', () => {
		const { controller } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const commands = document.querySelector('.document-toolbar__commands');
		expect(commands).toBeTruthy();
		const undo = screen.getByRole('button', { name: 'Undo' });
		const redo = screen.getByRole('button', { name: 'Redo' });
		const language = screen.getByRole('button', { name: 'Lyric language: English' });
		// Comparing acts on the whole document, so its trigger belongs to this
		// strip — beside the contrast action whose press it is the review before.
		const compare = screen.getByRole('button', { name: 'Compare' });
		const copy = screen.getByRole('button', { name: 'Copy lyrics' });
		expect([...commands!.children].filter((child) => child.matches('button, details'))).toEqual([
			undo,
			redo,
			language,
			compare,
			copy
		]);
		// Navigation between drafts left the strip for the draft's own name, and
		// creation followed it — neither acts on the document this strip commands.
		expect(commands!.contains(screen.getByRole('button', { name: "'Scribes" }))).toBe(false);
		expect(commands!.contains(screen.getByRole('button', { name: "New 'scribe" }))).toBe(false);
		expect(commands!.lastElementChild).toBe(copy);
		// Copy ends the tab order too, not just the visual row.
		const order = [...commands!.querySelectorAll('button, summary')];
		expect(order.indexOf(copy)).toBe(order.length - 1);
	});

	test('mutes a history command that would do nothing, and follows the snapshot', async () => {
		const { controller, calls } = createTestWorkbench();
		render(DocumentToolbar, { controller });

		const undo = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
		const redo = screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
		expect(undo.disabled).toBe(false);
		expect(redo.disabled).toBe(true);

		await fireEvent.click(undo);
		expect(calls.undoCount).toBe(1);

		// The editor is the only thing that knows what is left in the history, so
		// the muting is read off its snapshot rather than counted here.
		controller.onSnapshot({ ...controller.snapshot, canUndo: false, canRedo: true });
		await waitFor(() => expect(undo.disabled).toBe(true));
		expect(redo.disabled).toBe(false);

		await fireEvent.click(redo);
		expect(calls.redoCount).toBe(1);
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
		renderWorkspace(controller);

		// The toolbar belongs to the window, not to the editor half of it, so it
		// is a child of the workspace grid rather than of the editor region.
		const workspace = screen.getByTestId('workspace');
		const toolbar = screen.getByRole('banner', { name: 'Document controls' });
		expect(toolbar.parentElement).toBe(workspace);
		expect(document.querySelector('.editor-region')?.contains(toolbar)).toBe(false);
		expect(getComputedStyle(toolbar).gridColumnStart).toBe('1');
		expect(getComputedStyle(toolbar).gridColumnEnd).toBe('-1');

		// The tab strip then hangs under it: in the row the two columns share, or —
		// once the columns have folded into one — in the row directly below the
		// editor's. Either way both halves are rows of the same viewport-height
		// grid, so the status bar keeps the floor and neither half scrolls the
		// window. The test runner's own viewport decides which shape is live.
		const stacked = window.matchMedia('(max-width: 68rem)').matches;
		const editorRegion = document.querySelector('.editor-region')!;
		const panel = document.querySelector('.right-panel')!;
		expect(getComputedStyle(editorRegion).gridRowStart).toBe('2');
		expect(getComputedStyle(panel).gridRowStart).toBe(stacked ? '3' : '2');
		expect(getComputedStyle(document.querySelector('.status-bar')!).gridRowStart).toBe(
			stacked ? '4' : '3'
		);
		expect(getComputedStyle(workspace).display).toBe('grid');
		expect(panel.querySelector('.panel-tabs')).toBeTruthy();
	});

	test('continues the controller revision when the editor mounts', async () => {
		const { controller } = createTestWorkbench({ text: '“hello”', revision: 5 });
		renderWorkspace(controller);

		await fireEvent.input(screen.getByRole('textbox', { name: 'Lyrics editor' }), {
			target: { value: '"hello”' }
		});

		await waitFor(() => expect(controller.snapshot.revision).toBe(6));
		expect(controller.snapshot.text).toBe('"hello”');
	});

	test('pluralizes the status bar counts, singular at one', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).toContain('1 line · 1 section');
		expect(summary.textContent).not.toContain('1 lines');
		expect(summary.textContent).not.toContain('1 sections');
	});

	// The counts are one run of facts with interpuncts between them, exactly as
	// a diagnostic's meta line is — the performer count joins the run rather
	// than sitting in a spaced-apart group of its own.
	test('joins the performer count into the one interpunct run', () => {
		const { controller } = createTestWorkbench({
			text: '[Verse]\nA lyric',
			performers: [performer('p1', 'Ari', 0)]
		});
		renderWorkspace(controller);

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).toContain('1 line · 1 section · 1 performer');
	});

	// A count worth stating is one that could have been otherwise. This document
	// has lines and sections but no performers, so the roster half of the row is
	// absent rather than reporting a zero. The voice-group count is gone
	// outright: it summed legend entries over the whole document — offset-keyed,
	// so three identical choruses counted three — which is a number nobody
	// could read anything from. Re-adding it is the specific regression.
	test('omits a status bar count until it has something to report', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).not.toContain('0 performers');
		expect(summary.textContent).not.toContain('voice group');
	});

	// The line count is of sung text only. Blank lines and bracket-shaped lines
	// — headers, an unclosed `[Bridge` — are structure, and the parser keeps
	// them out of `section.lines`; this pins that the status bar inherits the
	// distinction rather than counting rows. A lone `[?]` is the exception the
	// parser makes: it wears the header's brackets but stands where a line
	// nobody could make out was sung, so it counts as the lyric it marks.
	test('counts only lyric lines in the status bar', () => {
		const { controller } = createTestWorkbench({
			text: '[Verse 1]\nOne\nTwo\n\n[Chorus]\nThree\n   \n[?]\n[Bridge'
		});
		renderWorkspace(controller);

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).toContain('4 lines');
	});

	test('states no counts at all for an empty document', () => {
		const { controller } = createTestWorkbench({ text: '' });
		renderWorkspace(controller);

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
		renderWorkspace(controller);

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		expect(summary.textContent).not.toContain('next issue');
		expect(summary.textContent).not.toContain('fixes');
		expect(summary.textContent).not.toContain('offline ready');
		expect(summary.querySelector('kbd')).toBeNull();
	});

	test('re-lints the current document immediately when its language changes', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

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

	/*
	 * A link changes no text, so the editor emits no snapshot when the draft's
	 * links are re-seated onto it at boot — and the suppression that hides an
	 * answered `section.unlinked-repeat` runs on snapshots. It worked by accident
	 * while the only way to make a link was the card, which collapses the
	 * selection on the way out and emits one; a reload came back with the
	 * suggestion still on every linked section, and it went away on the first
	 * press in the document.
	 */
	test('hides a suggestion the draft has already answered, without waiting for a press', async () => {
		// Under 40 characters on purpose: past that the language detector schedules
		// a republish of its own 150ms later, which re-runs the suppression and
		// hides the bug this test is here to catch.
		const song = ['[Chorus]', 'Go', '', '[Verse]', 'Hey', '', '[Chorus 2]', 'Go'].join('\n');
		expect(song.length).toBeLessThan(40);
		const suggested = () =>
			controller.snapshot.diagnostics.some(
				(diagnostic) => diagnostic.ruleId === 'section.unlinked-repeat'
			);

		// Unlinked, the rule points at the repeat: without this the assertion
		// below would pass on a fixture that never produced the finding at all.
		let { controller } = createTestWorkbench({ text: song });
		renderWorkspace(controller);
		await waitFor(() => expect(suggested()).toBe(true));
		cleanup();

		// The draft's own links, re-seated onto the editor exactly as a reload
		// does it. Nothing else publishes a snapshot here, so the diagnostics
		// arriving at all is the hand-off having asked for them.
		({ controller } = createTestWorkbench({ text: song, sectionLinks: [{ lines: [1, 7] }] }));
		renderWorkspace(controller);
		await waitFor(() => expect(controller.snapshot.diagnostics.length).toBeGreaterThan(0));
		expect(suggested()).toBe(false);
	});

	test('reuses diagnostics when only the editor selection changes', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nImma go' });
		const lint = vi.fn(async () => []);
		renderWorkspace(controller, { lint, dispose: async () => {} });
		await waitFor(() => expect(lint).toHaveBeenCalledOnce());
		const editor = screen.getByRole('textbox', { name: 'Lyrics editor' }) as HTMLTextAreaElement;

		editor.setSelectionRange(2, 2);
		await fireEvent.select(editor);
		await waitFor(() => expect(controller.snapshot.selection.anchor).toBe(2));
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(lint).toHaveBeenCalledOnce();
	});

	test('merges revision-matched Harper findings after the native lint pass', async () => {
		const text = '[Verse]\nThis are wrong';
		const from = text.indexOf('are');
		const harperProvider: HarperDiagnosticProvider = {
			lint: vi.fn(async ({ revision }) => [
				{
					from,
					to: from + 3,
					ruleId: 'grammar.harper',
					severity: 'suggestion' as const,
					message: 'Use is here.',
					explanation: 'Grammar detected by Harper.',
					sourceIds: ['G-SECTIONS'],
					fixes: [
						{
							kind: 'preview' as const,
							label: 'Replace with is',
							edit: {
								baseRevision: revision,
								edits: [{ from, to: from + 3, insert: 'is' }]
							}
						}
					]
				}
			]),
			dispose: vi.fn(async () => {})
		};
		const { controller } = createTestWorkbench({ text });
		renderWorkspace(controller, harperProvider);

		await waitFor(() => expect(harperProvider.lint).toHaveBeenCalledOnce());
		await waitFor(() =>
			expect(
				controller.snapshot.diagnostics.some(
					(diagnostic) =>
						diagnostic.ruleId === 'grammar.harper' && diagnostic.message === 'Use is here.'
				)
			).toBe(true)
		);
		expect(screen.getByText('Use is here.')).toBeTruthy();
	});

	test('keeps unaffected Harper findings in place while a normal fix is re-linted', async () => {
		const text = '[Verse]\nok then song';
		let callCount = 0;
		let finishSecondLint: (() => void) | undefined;
		const lint = vi.fn(({ text: requestText, revision }) => {
			callCount += 1;
			const from = requestText.indexOf('song');
			const findings: Diagnostic[] = [
				{
					from,
					to: from + 4,
					ruleId: 'spelling.harper',
					severity: 'suggestion',
					message: 'Keep this Harper finding.',
					explanation: 'Spelling detected by Harper.',
					sourceIds: ['G-SECTIONS'],
					fixes: [
						{
							kind: 'preview',
							label: 'Replace song',
							edit: {
								baseRevision: revision,
								edits: [{ from, to: from + 4, insert: 'track' }]
							}
						}
					]
				}
			];
			if (callCount === 1) return Promise.resolve(findings);
			return new Promise<Diagnostic[]>((resolve) => {
				finishSecondLint = () => resolve(findings);
			});
		});
		const { controller } = createTestWorkbench({ text });
		renderWorkspace(controller, { lint, dispose: async () => {} });

		await waitFor(() => expect(screen.getByText('Keep this Harper finding.')).toBeTruthy());
		await fireEvent.click(
			screen.getByRole('button', { name: 'Go to Use “Okay” instead of “ok”.' })
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Replace with Okay' }));
		await waitFor(() => expect(controller.snapshot.text).toBe('[Verse]\nOkay then song'));
		await waitFor(() => expect(lint).toHaveBeenCalledTimes(2));

		// The second worker result is deliberately still unresolved. The first
		// result remains visible at its rebased range instead of disappearing for
		// the debounce and worker round trip.
		expect(screen.getByText('Keep this Harper finding.')).toBeTruthy();
		const carried = controller.snapshot.diagnostics.find(
			(diagnostic) => diagnostic.message === 'Keep this Harper finding.'
		);
		expect(carried).toMatchObject({
			from: controller.snapshot.text.indexOf('song'),
			to: controller.snapshot.text.indexOf('song') + 4
		});
		expect(carried?.fixes?.[0]?.edit.baseRevision).toBe(controller.snapshot.revision);

		expect(finishSecondLint).toBeDefined();
		finishSecondLint?.();
		await waitFor(() =>
			expect(
				controller.snapshot.diagnostics.some(
					(diagnostic) => diagnostic.message === 'Keep this Harper finding.'
				)
			).toBe(true)
		);
	});

	test('shows and clears a language mismatch issue in the linter panel', async () => {
		const { controller } = createTestWorkbench({
			text: '[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir'
		});
		renderWorkspace(controller);

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
		await waitFor(() => expect(document.activeElement).toBe(search));

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
		renderWorkspace(controller);

		const link = screen.getByRole('link', { name: 'About LyricLint' });
		expect(link.getAttribute('href')).toBe('/');
		expect(link.closest('.status-bar')).toBeTruthy();
		expect(link.closest('.document-toolbar')).toBeNull();
	});

	// The row is a readout, and `Add audio` is its one documented exception. The
	// unknown-marker insert used to sit here as a second control, saying `[?]` at
	// a reader who by definition did not know what `[?]` meant — so it moved to
	// the editor column's own action bar, where the label can explain the mark and
	// where every other command that acts on the document at the caret lives.
	test('keeps the status bar a readout with one control', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

		const summary = screen.getByRole('contentinfo', { name: 'Document summary' });
		// `Add audio` is the row's one exception and draws only where the shell has
		// a media store; nothing else in here is pressable at any state.
		const controls = [...summary.querySelectorAll('button')];
		expect(controls.every((control) => /audio/iu.test(control.textContent ?? ''))).toBe(true);
		expect(summary.textContent).not.toContain('[?]');
		expect(summary.textContent).not.toContain('Insert');
	});

	test('offers the caret commands in the action bar, with the keystrokes that run them', async () => {
		const { controller, calls } = createTestWorkbench({
			text: '[Verse]\nI heard something',
			selection: { anchor: 15, head: 10 }
		});
		renderWorkspace(controller);

		const bar = screen.getByRole('group', { name: 'Document actions' });
		// Level with the panel's tab strip and inside the editor column, not the
		// toolbar and not the status bar.
		expect(bar.closest('.editor-region')).toBeTruthy();
		expect(bar.closest('.document-toolbar')).toBeNull();
		expect(bar.closest('.status-bar')).toBeNull();

		// The control is a glyph, and the whole label is its accessible name — which
		// is what keeps the trade this shape makes off the screen reader: a tooltip
		// is a thing only a pointer can produce, an accessible name is not.
		const unknown = screen.getByRole('button', { name: 'Unknown lyric [?]' });
		expect(unknown.closest('.editor-actions')).toBe(bar);
		expect(unknown.getAttribute('aria-keyshortcuts')).toContain('U');
		expect(unknown.textContent?.trim()).toBe('[?]');

		// Nothing is spelled out at rest — the labels and the keystrokes were 243px
		// of the document's own top row for two commands.
		expect(bar.querySelectorAll('kbd')).toHaveLength(0);
		expect(bar.textContent).not.toContain('Section header');
		expect(screen.queryByRole('button', { name: 'Ask LyricLint' })).toBeNull();

		await fireEvent.click(unknown);
		expect(calls.dispatched).toEqual([
			{
				baseRevision: 4,
				edits: [{ from: 10, to: 15, insert: '[?]' }],
				selectionAfter: { anchor: 13, head: 13 }
			}
		]);
	});

	test('registers the assistant draft bridge for the workspace lifetime', async () => {
		// Keep this test on the bridge seam: an unavailable service hides the pane,
		// but the workspace still registers editor access with the shared store.
		vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', '');
		let bridge: AssistantDraftBridge | undefined;
		const unregister = vi.fn();
		const registerDraftBridge = vi.fn((next: AssistantDraftBridge) => {
			bridge = next;
			return unregister;
		});
		const bridgeOnly: Partial<AssistantState> = { registerDraftBridge };
		const { controller, calls } = createTestWorkbench({ text: '[Verse]\nA lyric', revision: 7 });

		const workspace = renderWorkspace(controller, noHarper, bridgeOnly as AssistantState);
		await waitFor(() => expect(registerDraftBridge).toHaveBeenCalledOnce());

		expect(bridge?.draftId()).toBe('draft-1');
		expect(bridge?.readText()).toBe('[Verse]\nA lyric');
		expect(bridge?.revision()).toBe(7);
		expect(bridge?.apply({ baseRevision: 6, edits: [{ from: 0, to: 0, insert: 'stale' }] })).toBe(
			false
		);
		expect(calls.dispatched).toEqual([]);
		expect(
			bridge?.preview({ baseRevision: 7, edits: [{ from: 8, to: 15, insert: 'Preview' }] })
		).toBe(false);
		expect(
			bridge?.apply({ baseRevision: 7, edits: [{ from: 8, to: 15, insert: 'New lyric' }] })
		).toBe(true);
		expect(controller.snapshot.text).toBe('[Verse]\nNew lyric');
		expect(controller.snapshot.revision).toBe(8);

		const editorHandle = controller.editor;
		const dispatchAtomicOnlyHere = vi.fn();
		editorHandle.dispatchAtomicOnlyHere = dispatchAtomicOnlyHere;
		const localEdit = {
			baseRevision: 8,
			edits: [{ from: 8, to: 11, insert: 'One' }]
		};
		expect(
			bridge?.apply(localEdit, {
				applyTo: 'this_section_only',
				range: { from: 8, to: 17 }
			})
		).toBe(true);
		expect(dispatchAtomicOnlyHere).toHaveBeenCalledWith(localEdit, { from: 8, to: 17 });

		// A hovered proposal selects its span — which is what moves the wash —
		// and then scrolls it into view, against the handle the editor has
		// published rather than the one the workspace started with. The reveal
		// comes last so the selection's own nudge cannot replace it, and neither
		// call focuses: the caret is a location here, not a place to type.
		const order: string[] = [];
		const revealed: TextRange[] = [];
		editorHandle.revealRange = (range) => {
			order.push('reveal');
			revealed.push(range);
		};
		const setSelection = vi.spyOn(editorHandle, 'setSelection').mockImplementation(() => {
			order.push('selection');
		});
		const focus = vi.spyOn(editorHandle, 'focus');
		bridge?.reveal({ from: 8, to: 15 });
		expect(setSelection).toHaveBeenCalledWith({ anchor: 8, head: 15 });
		expect(revealed).toEqual([{ from: 8, to: 15 }]);
		expect(order).toEqual(['selection', 'reveal']);
		expect(focus).not.toHaveBeenCalled();
		// And a span the live document no longer has is refused rather than
		// raised out of a pointer entering a card.
		editorHandle.revealRange = () => {
			throw new RangeError('out of range');
		};
		expect(() => bridge?.reveal({ from: 400, to: 500 })).not.toThrow();

		workspace.unmount();
		expect(unregister).toHaveBeenCalledOnce();
	});

	test('maps assistant link actions from header lines onto editor choices', async () => {
		vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', '');
		let bridge: AssistantDraftBridge | undefined;
		const bridgeOnly: Partial<AssistantState> = {
			registerDraftBridge(next: AssistantDraftBridge) {
				bridge = next;
				return () => {};
			}
		};
		const text = '[Chorus]\nA\n[Chorus]\nB\n[Chorus]\nC\n[Verse]\nD';
		const { controller } = createTestWorkbench({ text });
		renderWorkspace(controller, noHarper, bridgeOnly as AssistantState);
		await waitFor(() => expect(bridge).toBeDefined());

		const editor = controller.editor;
		let links = [{ lines: [1, 3, 5] }];
		editor.getSectionLinks = () => links;
		editor.getLinkDifferences = () => [
			{ index: 0, wordings: [] },
			{ index: 1, wordings: [] }
		];
		const headerOffsets = controller.snapshot.parsed.sections.map(
			(section) => section.header!.from
		);
		const applyChoice = vi.fn((choice: Parameters<NonNullable<typeof editor.linkSections>>[0]) => {
			if (choice.headers.length > 1) {
				links = [{ lines: [1, 3, 5] }];
				return;
			}
			const line = headerOffsets.indexOf(choice.headers[0]!) * 2 + 1;
			links = links
				.map((group) => ({ lines: group.lines.filter((candidate) => candidate !== line) }))
				.filter((group) => group.lines.length >= 2);
		});
		editor.linkSections = applyChoice;

		expect(bridge!.sectionLinks()).toEqual([{ lines: [1, 3, 5] }]);
		expect(bridge!.linkableSections([1, 3])).toBe(true);
		expect(bridge!.linkableSections([1, 7])).toBe(false);
		expect(bridge!.linkSections([1, 3, 5])).toBe(true);
		expect(applyChoice).toHaveBeenLastCalledWith({
			headers: headerOffsets.slice(0, 3),
			keepDifferent: [true, true]
		});
		expect(applyChoice.mock.calls.at(-1)![0]).not.toHaveProperty('replaceFrom');

		applyChoice.mockClear();
		expect(bridge!.unlinkSection(3)).toBe(true);
		expect(applyChoice.mock.calls.map(([choice]) => choice)).toEqual([
			{ headers: [headerOffsets[0]] },
			{ headers: [headerOffsets[1]] }
		]);
		expect(links).toEqual([]);

		editor.linkSections = undefined;
		expect(bridge!.linkSections([1, 3])).toBe(false);
		expect(bridge!.unlinkSection(1)).toBe(false);
	});

	// It is a tray hanging off the toolbar at the right of the column, against the
	// panel — not a band across the column. Drawn full width the row becomes the
	// object and is then mostly empty gutter with two words at one end, so the
	// width is measured rather than trusted to a rule: `width: 100%` or a lost
	// `justify-self` restores the band silently. The right edge is the other half
	// of it, because that is what makes the tray read as the tab strip's chrome
	// carried out over the document rather than as a shape adrift on it.
	test('sizes the action bar to its contents and hangs it at the right of the column', () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

		const bar = screen.getByRole('group', { name: 'Document actions' });
		const barBox = bar.getBoundingClientRect();
		const regionBox = bar.closest('.editor-region')!.getBoundingClientRect();

		expect(barBox.width).toBeGreaterThan(0);
		expect(barBox.width).toBeLessThan(regionBox.width * 0.75);
		expect(barBox.right).toBeCloseTo(regionBox.right, 0);
		expect(barBox.left).toBeGreaterThan(regionBox.left);
	});

	// `Mod-F` opens a whole find-and-replace panel and nothing on screen said so —
	// the same folklore the section-header shortcut was, which is what this tray
	// exists to end. It is the one command here that writes nothing, so it is the
	// one drawn as a pictogram: the other two show the mark they put in the
	// document, and this has no mark to show.
	test('opens find and replace from the tray', async () => {
		const { controller, calls } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

		const find = screen.getByRole('button', { name: 'Find and replace' });
		expect(find.closest('.editor-actions')).toBeTruthy();
		expect(find.querySelector('svg')).toBeTruthy();
		expect(find.textContent?.trim()).toBe('');
		expect(find.getAttribute('aria-keyshortcuts')).toMatch(/\+F$/u);

		await fireEvent.click(find);
		expect(calls.searchOpenCount).toBe(1);

		// The bar runs *under* the tray, so the glyph sitting over its way out has to
		// be one: it is a toggle, and the state is reported by the editor rather than
		// assumed from the press — `Escape` and the bar's own control close it too.
		expect(find.getAttribute('aria-pressed')).toBe('false');
		controller.noteSearchOpen(true);
		await waitFor(() =>
			expect(
				screen.getByRole('button', { name: 'Find and replace' }).getAttribute('aria-pressed')
			).toBe('true')
		);
	});

	// What a control is, and the keystroke that does the same thing, arriving
	// together at the one moment either is being asked for. The keyboard opens it
	// the same way the pointer does, because a control reached by Tab has had its
	// name asked for just as plainly as one under a pointer.
	//
	// It is one box for the whole workbench, rendered by `ControlTooltip` rather
	// than by the surface — which is why it is queried off the document and not off
	// the tray.
	test('names the action and its keystroke on hover and on focus', async () => {
		const { controller } = createTestWorkbench({ text: '[Verse]\nA lyric' });
		renderWorkspace(controller);

		const unknown = screen.getByRole('button', { name: 'Unknown lyric [?]' });
		expect(document.querySelector('.control-tooltip')).toBeNull();

		await fireEvent.pointerEnter(unknown);
		const tooltip = document.querySelector('.control-tooltip')!;
		expect(tooltip.textContent).toContain('Unknown lyric [?]');
		expect(tooltip.textContent).toMatch(/U$/u);
		// The same two facts are already the button's own name and shortcut, so the
		// box is drawn for the pointer and hidden from anything that cannot produce
		// one — otherwise a screen reader hears both twice.
		expect(tooltip.getAttribute('aria-hidden')).toBe('true');

		await fireEvent.pointerLeave(unknown);
		expect(document.querySelector('.control-tooltip')).toBeNull();

		await fireEvent.focus(unknown);
		expect(document.querySelector('.control-tooltip')?.textContent).toContain('Unknown lyric');

		// One box at a time, for the whole application: hover moving to another
		// control replaces it rather than adding a second.
		await fireEvent.pointerEnter(screen.getByRole('button', { name: 'Find and replace' }));
		expect(document.querySelectorAll('.control-tooltip')).toHaveLength(1);
		expect(document.querySelector('.control-tooltip')?.textContent).toContain('Find and replace');
	});

	// A band that appeared on the first keystroke would shove the editor down at
	// the moment somebody started typing — and someone looking at an empty
	// document is exactly the reader who has never met `[?]`.
	test('draws the action bar over an empty document', () => {
		const { controller } = createTestWorkbench();
		renderWorkspace(controller);

		const bar = screen.getByRole('group', { name: 'Document actions' });
		// Three, and four is the ceiling: each glyph costs about 30px of the
		// document's own top row, past which this is the full-width band it
		// replaced, wearing icons.
		expect(bar.querySelectorAll('button')).toHaveLength(3);
		expect(bar.querySelectorAll('button').length).toBeLessThanOrEqual(4);
	});

	test('keeps the status-bar link off the accent color', () => {
		// A quiet app control keeps navigation semantics without a permanent underline.
		const { controller } = createTestWorkbench();
		renderWorkspace(controller);

		const link = screen.getByRole('link', { name: 'About LyricLint' });
		const styles = getComputedStyle(link);
		const row = getComputedStyle(link.closest('.status-bar')!);
		expect(styles.color).toBe(row.color);
		expect(styles.textDecorationLine).toBe('none');
		expect(parseFloat(styles.minHeight)).toBeGreaterThan(0);
	});

	test('opens the one shared audio picker from the Song tab', async () => {
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => new StubAudio().asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			loadYouTubeApi: createStubYouTubeApi().load,
			scheduleYouTubePoll: createStubPoll().schedule
		});
		const { controller } = createTestWorkbench({
			media: { repository: createInMemoryMediaRepository([]), player }
		});
		const { container } = renderWorkspace(controller);

		await fireEvent.click(screen.getByRole('tab', { name: 'Song' }));
		const songPane = screen.getByRole('tabpanel', { name: 'Song' });
		await fireEvent.click(within(songPane).getByRole('button', { name: 'Add audio source' }));

		// The dialog's name follows its trigger's label: a surface announced as
		// something narrower than what was pressed reads as the wrong dialog.
		expect(screen.getByRole('dialog', { name: 'Add audio source' }).hasAttribute('open')).toBe(
			true
		);
		expect(container.querySelectorAll('dialog.media-dialog')).toHaveLength(1);
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
		renderWorkspace(controller);

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

	test('ends sync mode when a draft replaces the editor', async () => {
		const audio = new StubAudio();
		const player = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => audio.asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {},
			loadYouTubeApi: createStubYouTubeApi().load,
			scheduleYouTubePoll: createStubPoll().schedule
		});
		const { controller } = createTestWorkbench({
			media: { repository: createInMemoryMediaRepository([]), player }
		});
		await new Promise((resolve) => setTimeout(resolve, 0));
		await controller.media!.attachFile(new File([''], 'first.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(200);
		renderWorkspace(controller);

		await fireEvent.click(await screen.findByRole('button', { name: 'Sync lyrics' }));
		expect(screen.getByRole('button', { name: 'Stop syncing' })).toBeTruthy();

		const firstDraft = controller.draftId;
		await fireEvent.click(screen.getByRole('button', { name: "New 'scribe" }));
		await waitFor(() => expect(controller.draftId).not.toBe(firstDraft));
		await waitFor(() => expect(player.attached).toBe(false));

		await controller.media!.attachFile(new File([''], 'second.mp3', { type: 'audio/mpeg' }));
		audio.setDuration(200);

		expect(await screen.findByRole('button', { name: 'Sync lyrics' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Stop syncing' })).toBeNull();
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
		renderWorkspace(controller);

		const editorRegion = screen.getByTestId('editor-region');
		expect(getComputedStyle(editorRegion).display).not.toBe('none');
		expect(screen.getByRole('tab', { name: /Linter/ })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Hide right panel' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Show right panel' })).toBeNull();
	});
});

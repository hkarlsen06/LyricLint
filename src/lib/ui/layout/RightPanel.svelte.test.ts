import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { userEvent } from 'vitest/browser';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AssistantState } from '$lib/assistant/assistant.svelte.js';
import LiveRegion from '../primitives/LiveRegion.svelte';
import ToastRegion from '../primitives/ToastRegion.svelte';
import type { DraftRecord } from '$lib/core/types.js';
import { createTestWorkbench, diagnostic } from '../test-utils.js';
import { createFeedbackState } from '../state/feedback.svelte.js';
import { createInMemoryMediaRepository } from '../state/in-memory.js';
import { createMediaPlayer } from '../state/media-player.svelte.js';
import { StubAudio } from '../state/media-test-audio.js';
import { createStubPoll, createStubYouTubeApi } from '../state/media-test-youtube.js';
import RightPanel from './RightPanel.svelte';

function savedDraft(id: string, title: string, text = '[Verse]\nLine'): DraftRecord {
	return {
		id,
		title,
		text,
		language: 'en',
		performers: [],
		createdAt: '2026-07-20T10:00:00.000Z',
		updatedAt: '2026-07-20T10:00:00.000Z',
		ruleSetVersion: '2026.7',
		editorSelection: { anchor: 0, head: 0 }
	};
}

function panelAssistant(): AssistantState {
	return {
		chats: [],
		messages: [],
		quota: undefined,
		failure: undefined,
		challengePending: false,
		busy: false,
		contextDividerIndex: undefined,
		toolSession: undefined,
		draftToolsAvailable: true,
		draftAccessState: undefined,
		send: vi.fn(async () => undefined),
		newChat: vi.fn(async () => undefined),
		retry: vi.fn(async () => undefined),
		submitChallenge: vi.fn(async () => undefined),
		ensureLoaded: vi.fn(async () => undefined),
		revokeDraftAccess: vi.fn(async () => undefined)
	} as unknown as AssistantState;
}

/**
 * A workbench with audio, and nothing behind it: the API loader is a stub whose
 * `loads` count is the number of times the real one would have injected a script
 * tag, and the poll is a function this file would have to call.
 */
function withAudio(options: Parameters<typeof createTestWorkbench>[0] = {}) {
	const feedback = createFeedbackState();
	const youtube = createStubYouTubeApi();
	const poll = createStubPoll();
	const audio = new StubAudio();
	const player = createMediaPlayer({
		feedback,
		createAudio: () => audio.asMediaElement(),
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl: () => {},
		loadYouTubeApi: youtube.load,
		scheduleYouTubePoll: poll.schedule
	});
	const harness = createTestWorkbench({
		...options,
		media: { repository: createInMemoryMediaRepository([]), player }
	});
	return { ...harness, youtube };
}

describe('RightPanel', () => {
	afterEach(() => {
		cleanup();
		vi.unstubAllEnvs();
	});

	// The panes are flex columns so the linter can pin its foot to the bottom of
	// the panel. Bits UI hides the inactive ones with the `hidden` attribute, and
	// a `display` declaration that does not exclude them outranks the rule that
	// honours it — all four panels stack into one column.
	test('draws only the active pane despite the panes being flex columns', async () => {
		const { controller } = createTestWorkbench();
		render(RightPanel, { controller, assistant: panelAssistant() });

		const panes = () => [...document.querySelectorAll('.right-panel__pane')];
		expect(panes().length).toBe(5);
		const shown = () => panes().filter((pane) => getComputedStyle(pane).display !== 'none');
		expect(shown()).toHaveLength(1);
		expect(shown()[0]!.hasAttribute('hidden')).toBe(false);

		// The catch-all tab split: `Local data` is on Preferences now, `Export .txt`
		// on Song.
		await fireEvent.click(screen.getByRole('tab', { name: 'Song' }));
		await waitFor(() => expect(shown()).toHaveLength(1));
		expect(shown()[0]!.textContent).toContain('Export .txt');

		await fireEvent.click(screen.getByRole('tab', { name: 'Preferences' }));
		await waitFor(() => expect(shown()).toHaveLength(1));
		expect(shown()[0]!.textContent).toContain('Local data');

		await fireEvent.click(screen.getByRole('tab', { name: 'Assistant' }));
		await waitFor(() => expect(shown()).toHaveLength(1));
		expect(shown()[0]!.textContent).toContain('What would you like to check?');
	});

	// The pane carries chrome at both ends — the chat tray above, the composer
	// below — so it fits the body rather than growing it. Grown, the body becomes
	// the scroll port for the whole pane and both controls leave the screen: the
	// tray off the top, the composer under the fold.
	test('scrolls the assistant transcript alone and pins the tray and composer', async () => {
		const { controller } = createTestWorkbench();
		controller.setActiveTab('assistant');
		const assistant = panelAssistant();
		Object.defineProperty(assistant, 'messages', {
			value: Array.from({ length: 16 }, (_, index) => ({
				id: `m-${index}`,
				chatId: 'chat-1',
				role: 'user' as const,
				status: 'complete' as const,
				createdAt: '2026-08-02T10:00:00.000Z',
				content: `Question ${index} about how a chorus header is written in a transcription.`
			}))
		});
		render(RightPanel, { controller, assistant });
		const panel = document.querySelector<HTMLElement>('.right-panel')!;
		panel.style.height = '32rem';

		const body = document.querySelector<HTMLElement>('.right-panel__body')!;
		const transcript = document.querySelector<HTMLElement>('.assistant-transcript')!;
		const tray = document.querySelector<HTMLElement>('.assistant-panel__controls')!;
		const composer = document.querySelector<HTMLElement>('.assistant-composer')!;

		await waitFor(() => expect(transcript.scrollHeight).toBeGreaterThan(transcript.clientHeight));
		expect(body.scrollHeight).toBeLessThanOrEqual(body.clientHeight + 1);
		expect(tray.getBoundingClientRect().top).toBeGreaterThanOrEqual(
			panel.getBoundingClientRect().top - 1
		);
		expect(composer.getBoundingClientRect().bottom).toBeLessThanOrEqual(
			panel.getBoundingClientRect().bottom + 1
		);

		// Reading the conversation leaves both of the controls it is driven from
		// exactly where they were.
		const before = [tray.getBoundingClientRect().top, composer.getBoundingClientRect().bottom];
		transcript.scrollTop = transcript.scrollHeight;
		expect(transcript.scrollTop).toBeGreaterThan(0);
		expect([tray.getBoundingClientRect().top, composer.getBoundingClientRect().bottom]).toEqual(
			before
		);
	});

	test('switches tabs with keyboard-operable Bits UI tabs', async () => {
		const { controller } = createTestWorkbench();
		render(RightPanel, { controller, assistant: panelAssistant() });

		// Assistant is a glyph with no text, so tabs are read by accessible name.
		expect(
			screen
				.getAllByRole('tab')
				.map((tab) => tab.getAttribute('aria-label') ?? tab.textContent?.trim())
		).toEqual(['Linter', 'Assistant', 'Performers', 'Song', 'Preferences']);

		const performersTab = screen.getByRole('tab', { name: 'Performers' });
		await fireEvent.click(performersTab);
		expect(controller.activeTab).toBe('performers');
		expect(screen.getByText('Add performer')).toBeTruthy();

		const linterTab = screen.getByRole('tab', { name: /Linter/ });
		linterTab.focus();
		await fireEvent.keyDown(linterTab, { key: 'ArrowRight' });
		await waitFor(() => expect(controller.activeTab).toBe('assistant'));
		expect(document.activeElement?.getAttribute('aria-label')).toBe('Assistant');

		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
		await waitFor(() => expect(controller.activeTab).toBe('performers'));
		expect(document.activeElement?.textContent).toContain('Performers');

		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
		await waitFor(() => expect(controller.activeTab).toBe('song'));
		expect(document.activeElement?.textContent).toContain('Song');

		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
		await waitFor(() => expect(controller.activeTab).toBe('preferences'));
		expect(document.activeElement?.textContent).toContain('Preferences');
	});

	test('keeps the four base tabs and mounts no assistant pane when unavailable', async () => {
		vi.stubEnv('PUBLIC_ASSISTANT_ANSWERS_URL', '');
		const { controller } = createTestWorkbench();
		controller.setActiveTab('assistant');
		render(RightPanel, { controller, assistant: panelAssistant() });

		await waitFor(() => expect(controller.activeTab).toBe('linter'));
		expect(screen.getAllByRole('tab').map((tab) => tab.textContent?.trim())).toEqual([
			'Linter',
			'Performers',
			'Song',
			'Preferences'
		]);
		expect(screen.queryByRole('tab', { name: 'Assistant' })).toBeNull();
		expect(document.querySelectorAll('.right-panel__pane')).toHaveLength(4);
		expect(document.querySelector('.assistant-panel')).toBeNull();
		expect(
			[...document.querySelectorAll('.right-panel__pane')].filter(
				(pane) => getComputedStyle(pane).display !== 'none'
			)
		).toHaveLength(1);
	});

	test('mirrors diagnostics, filters severity, and navigates to the exact editor range', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header',
			from: 0,
			to: 7
		});
		const { controller, calls } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		const diagnosticButtons = screen.getAllByRole('button', { name: /^Go to/ });
		expect(diagnosticButtons[0]?.textContent).toContain('Close this section header');
		const warningButton = screen.getByRole('button', { name: 'Go to Add a section header' });
		await fireEvent.click(warningButton);
		expect(calls.revealed).toEqual([{ from: 9, to: 13 }]);
		expect(calls.selections).toEqual([{ anchor: 9, head: 13 }]);
		expect(calls.navigation).toEqual(['selection', 'reveal']);
		expect(calls.focusCount).toBe(1);
		expect(warningButton.closest('li')?.classList.contains('diagnostic-card--active')).toBe(true);

		controller.navigateToDiagnostic(error);
		await waitFor(() =>
			expect(
				screen
					.getByRole('button', { name: 'Go to Close this section header' })
					.closest('li')
					?.classList.contains('diagnostic-card--active')
			).toBe(true)
		);

		// The filters are on screen, and they took no press to get there.
		expect(screen.getByRole('group', { name: 'Filter diagnostics by severity' })).toBeTruthy();
		const warningChip = screen.getByRole('button', { name: /Warnings/ });
		expect(warningChip.getAttribute('aria-pressed')).toBe('true');
		await fireEvent.click(warningChip);
		expect(warningChip.getAttribute('aria-pressed')).toBe('false');
		expect(screen.queryByText('Add a section header')).toBeNull();
		expect(screen.getByText('Close this section header')).toBeTruthy();
	});

	test('leaves the Linter tab a tab, and the filters where they can be found', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const { controller } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		const linterTab = screen.getByRole('tab', { name: /Linter/ });
		const filters = () => screen.queryByRole('group', { name: 'Filter diagnostics by severity' });

		// The chips used to hang off a second press on this tab from inside the
		// linter — undiscoverable, and three handlers deep to work around Bits UI's
		// activation order. They are simply on screen now.
		expect(filters()).toBeTruthy();

		// So pressing the tab does nothing but come back to the linter, from
		// wherever the user was and by whichever route. A full pointer sequence
		// here, because automatic tab activation runs on focus, before click.
		await userEvent.click(screen.getByRole('tab', { name: 'Performers' }));
		await userEvent.click(linterTab);
		await waitFor(() => expect(controller.activeTab).toBe('linter'));
		expect(filters()).toBeTruthy();

		await fireEvent.click(linterTab);
		await fireEvent.keyDown(linterTab, { key: 'Enter' });
		expect(controller.activeTab).toBe('linter');
		expect(filters()).toBeTruthy();
	});

	test('runs the diagnostics as one gapless column with the selected row set into it', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header',
			from: 0,
			to: 7
		});
		const { controller } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		// No gap and no rounding: the cards read as one run of sections, seamed by
		// a hairline rather than separated by bands of canvas.
		const list = document.querySelector('.diagnostic-list')!;
		const listStyle = getComputedStyle(list);
		expect(listStyle.rowGap).toBe('0px');

		const rows = [...list.children] as HTMLElement[];
		expect(rows).toHaveLength(2);
		expect(getComputedStyle(rows[0]!).borderRadius).toBe('0px');
		expect(getComputedStyle(rows[0]!).borderBottomWidth).toBe('1px');
		expect(getComputedStyle(rows[1]!).borderBottomWidth).toBe('0px');

		// Selection is depth, and the direction is the scheme's own answer — so this
		// asserts whichever branch it is running under rather than one of them. Dark
		// drops the expanded row to the recessed elevation, darker than its
		// neighbour, with an inner shadow so it reads as cut into the column. Light
		// cannot rise by lightness, its resting cards being the paper already, so it
		// keeps the paper and lifts on an outward shadow instead: sunk there, the one
		// card carrying a fix wore the grey this workbench spends on things that are
		// spent. Both halves of the light state matter, and either alone is the bug.
		const expanded = rows.find((row) => row.classList.contains('diagnostic-card--expanded'))!;
		const closed = rows.find((row) => !row.classList.contains('diagnostic-card--expanded'))!;
		const expandedStyle = getComputedStyle(expanded);

		if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
			expect(expandedStyle.backgroundColor).not.toBe(getComputedStyle(closed).backgroundColor);
			expect(expandedStyle.boxShadow).toContain('inset');
		} else {
			expect(expandedStyle.backgroundColor).toBe(getComputedStyle(closed).backgroundColor);
			expect(expandedStyle.boxShadow).not.toBe('none');
			expect(expandedStyle.boxShadow).not.toContain('inset');
			// The seam goes with the lift, and only its color does: the border keeps
			// the 1px asserted above, so opening a card never moves the list.
			expect(expandedStyle.borderBottomColor).toBe('rgba(0, 0, 0, 0)');
		}

		// The severity is a colored glyph and a colored word on the meta line, not
		// a filled badge holding a line of its own above the message.
		const severity = expanded.querySelector('.severity') as HTMLElement;
		const severityStyle = getComputedStyle(severity);
		expect(severityStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
		expect(severityStyle.borderRadius).toBe('0px');
		expect(severity.parentElement?.classList.contains('diagnostic-meta__row')).toBe(true);

		// It leads that line: the title is above it, the line number beside it.
		const title = expanded.querySelector('.diagnostic-list__title') as HTMLElement;
		const line = expanded.querySelector('.diagnostic-meta__line') as HTMLElement;
		const severityBox = severity.getBoundingClientRect();
		const lineBox = line.getBoundingClientRect();
		expect(title.getBoundingClientRect().bottom).toBeLessThanOrEqual(severityBox.top);
		expect(lineBox.left).toBeGreaterThan(severityBox.right);
		const centre = (box: DOMRect) => box.top + box.height / 2;
		expect(Math.abs(centre(lineBox) - centre(severityBox))).toBeLessThan(2);
	});

	test('makes the whole card the target and gives its title no link treatment', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header',
			from: 0,
			to: 7
		});
		const { controller, calls } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		const row = screen
			.getByRole('button', { name: 'Go to Add a section header' })
			.closest('li') as HTMLElement;
		const head = row.querySelector('.diagnostic-list__head') as HTMLElement;
		const control = row.querySelector('.diagnostic-list__navigate') as HTMLElement;

		// The card's inset lives on the head, not on the row, so there is no
		// border of dead space around the heading where a press does nothing.
		expect(getComputedStyle(row).padding).toBe('0px');
		expect(head.getBoundingClientRect().width).toBe(row.getBoundingClientRect().width);

		// The button no longer contains the head — the meta line ends in a link,
		// and an <a> inside a <button> is invalid — so it stretches its hit area
		// over the head instead. A press in the head's padding, well outside the
		// button's own box, still lands on the button.
		const headBox = head.getBoundingClientRect();
		const corner = document.elementFromPoint(headBox.right - 4, headBox.bottom - 4);
		expect(corner).toBe(control);

		// The message is a heading inside a pressable card, not a link out of it:
		// hovering it leaves the title's color and underline alone and moves the
		// whole row instead.
		const title = control.querySelector('.diagnostic-list__title') as HTMLElement;
		const restingColor = getComputedStyle(title).color;
		const restingRowBackground = getComputedStyle(head).backgroundColor;
		await userEvent.hover(title);
		expect(getComputedStyle(title).textDecorationLine).toBe('none');
		expect(getComputedStyle(title).color).toBe(restingColor);
		expect(getComputedStyle(head).backgroundColor).not.toBe(restingRowBackground);

		// The severity and the line number are under that stretched layer, so
		// pressing either opens the diagnostic just as pressing the message does.
		const severity = head.querySelector('.severity') as HTMLElement;
		expect(head.querySelector('.diagnostic-meta__line')).not.toBeNull();
		const severityBox = severity.getBoundingClientRect();
		expect(
			document.elementFromPoint(severityBox.left + 2, severityBox.top + severityBox.height / 2)
		).toBe(control);
		await fireEvent.click(control);
		expect(calls.revealed).toEqual([{ from: 9, to: 13 }]);
	});

	test('takes a press anywhere in the expanded card, and leaves its decisions alone', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 9,
			to: 13
		});
		const { controller } = createTestWorkbench({ diagnostics: [warning] });
		render(RightPanel, { controller });

		const row = screen
			.getByRole('button', { name: 'Go to Add a section header' })
			.closest('li') as HTMLElement;
		const control = row.querySelector('.diagnostic-list__navigate') as HTMLElement;
		const explanation = row.querySelector('.diagnostic-explanation') as HTMLElement;
		const ignore = screen.getByRole('button', { name: 'Ignore' });

		// The card is the control all the way down, so the reasoning under the head
		// hits the same target the message does.
		const explanationBox = explanation.getBoundingClientRect();
		expect(document.elementFromPoint(explanationBox.left + 4, explanationBox.top + 4)).toBe(
			control
		);

		// So does the slack beside the last decision — a lone control in half a row
		// of empty gutter is card, not a dead zone.
		const ignoreBox = ignore.getBoundingClientRect();
		const rowBox = row.getBoundingClientRect();
		expect(document.elementFromPoint(rowBox.right - 4, ignoreBox.top + ignoreBox.height / 2)).toBe(
			control
		);

		// The decisions themselves ride above that layer and take their own press.
		expect(
			document.elementFromPoint(
				ignoreBox.left + ignoreBox.width / 2,
				ignoreBox.top + ignoreBox.height / 2
			)
		).toBe(ignore);
	});

	test('ignores, restores, and undo-restores one diagnostic while announcing each action', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header',
			from: 0,
			to: 0
		});
		const sibling = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add another section header',
			from: 8,
			to: 8
		});
		const { controller, feedback } = createTestWorkbench({
			text: 'Verse 1\nVerse 2',
			diagnostics: [finding, sibling]
		});
		render(RightPanel, { controller });
		render(ToastRegion, { feedback });
		render(LiveRegion, { feedback });

		expect(screen.queryByRole('button', { name: 'Ignore this session' })).toBeNull();
		// The ignored-diagnostics footer stays out of the panel until it has something
		// to list.
		expect(screen.queryByRole('button', { name: /ignored/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));
		expect(controller.ignoredDiagnosticCount).toBe(1);
		expect(screen.queryByText('Add a section header')).toBeNull();
		expect(screen.getByText('Add another section header')).toBeTruthy();
		expect(screen.getByTestId('live-region').textContent).toContain('Ignored');

		const ignoredToggle = screen.getByRole('button', { name: /diagnostic ignored/ });
		await waitFor(() => expect(document.activeElement).toBe(ignoredToggle));
		await fireEvent.click(ignoredToggle);
		await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
		expect(controller.ignoredDiagnosticCount).toBe(0);
		expect(screen.getByText('Add a section header')).toBeTruthy();
		// Restoring the last diagnostic takes the footer with it, so focus lands on the
		// restored diagnostic rather than on a control that no longer exists.
		expect(screen.queryByRole('button', { name: /diagnostic ignored/ })).toBeNull();
		await waitFor(() =>
			expect(document.activeElement).toBe(
				document.querySelector<HTMLButtonElement>('.diagnostic-list__navigate')
			)
		);

		// The toast's dismiss control is a real icon button, not a typeset ×.
		const dismiss = screen.getAllByRole('button', { name: 'Dismiss notification' }).at(-1)!;
		expect(dismiss.querySelector('svg')).not.toBeNull();
		expect(dismiss.textContent?.trim()).toBe('');

		const undoButtons = screen.getAllByRole('button', { name: 'Undo' });
		await fireEvent.click(undoButtons.at(-1)!);
		expect(controller.ignoredDiagnosticCount).toBe(1);
		await waitFor(() =>
			expect(screen.getByTestId('live-region').textContent).toContain(
				'Ignored this diagnostic again'
			)
		);
	});

	test('accepts an unrecognized header as correct for the session', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-unrecognized',
			severity: 'manual-review',
			message: 'Review the custom section header “Chor”.'
		});
		const { controller } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		expect(screen.queryByRole('button', { name: 'Ignore' })).toBeNull();
		const accept = screen.getByRole('button', { name: "It's correct" });
		expect(accept.querySelector('svg')).not.toBeNull();

		await fireEvent.click(accept);
		expect(controller.ignoredDiagnosticCount).toBe(1);
		expect(screen.queryByText('Review the custom section header “Chor”.')).toBeNull();
	});

	test('opens the editor section picker from a missing-header diagnostic', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'This lyric section has no header.',
			from: 14,
			to: 14
		});
		const { controller, calls } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		expect(screen.queryByRole('button', { name: /Preview:/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Choose header' }));

		expect(calls.revealed).toEqual([{ from: 14, to: 14 }]);
		expect(calls.selections).toEqual([{ anchor: 14, head: 14 }]);
		expect(calls.navigation).toEqual(['selection', 'reveal']);
		expect(calls.sectionHeaderRequestCount).toBe(1);
	});

	// The editor now carries the instructions — a ghost transcription where the
	// caret is, and Paste lyrics in the toolbar — so the panel says what it will
	// do rather than repeating how to feed it, and offers the sample instead.
	test('says what it is waiting for, and offers the sample, while the document is empty', () => {
		const { controller } = createTestWorkbench({ text: '   \n\n', diagnostics: [] });
		render(RightPanel, { controller });

		expect(screen.getByText('Nothing to lint yet')).toBeTruthy();
		expect(
			screen.getByText('Findings appear here as soon as the document has something in it.')
		).toBeTruthy();
		expect(screen.getByRole('button', { name: "Load a sample 'scribe" })).toBeTruthy();
		expect(screen.queryByText('No issues found')).toBeNull();
	});

	test('replaces the empty document with the sample transcription in one edit', async () => {
		const { controller, calls } = createTestWorkbench({ text: '', diagnostics: [] });
		render(RightPanel, { controller });

		await fireEvent.click(screen.getByRole('button', { name: "Load a sample 'scribe" }));

		expect(calls.dispatched).toHaveLength(1);
		expect(calls.dispatched[0]!.edits[0]!.insert).toContain('[Verse 1]');
	});

	// English lyrics under another selection would open with a mismatch warning
	// about a document the user never wrote, so the offer is withdrawn rather
	// than made and then apologized for.
	test('withholds the sample when the selected language is not the sample’s', async () => {
		const { controller } = createTestWorkbench({ text: '', diagnostics: [] });
		controller.setLanguage('no');
		render(RightPanel, { controller });

		await waitFor(() => expect(screen.getByText('Nothing to lint yet')).toBeTruthy());
		expect(screen.queryByRole('button', { name: "Load a sample 'scribe" })).toBeNull();
	});

	// A fresh open is only empty because it opened a *new* draft; the work the
	// user came back for should not be hidden behind a menu they have to find.
	test('lists the other saved drafts while the document is empty', async () => {
		const { controller } = createTestWorkbench({
			text: '',
			diagnostics: [],
			drafts: [savedDraft('draft-1', 'Test draft', ''), savedDraft('draft-2', 'Older song')]
		});
		render(RightPanel, { controller });

		await waitFor(() => expect(screen.getByText("Recent 'scribes")).toBeTruthy());
		expect(screen.getByRole('button', { name: /^Older song/ })).toBeTruthy();
		// The draft being looked at is not somewhere to go back to.
		expect(screen.queryByRole('button', { name: /^Test draft/ })).toBeNull();

		// They are the foot of the column, not part of the empty state's message:
		// the sample answers "nothing to lint yet" and stays with it, the drafts
		// come after everything the panel has to say about this document.
		const panel = document.querySelector('.linter-panel')!;
		const drafts = panel.querySelector('.linter-panel__drafts')!;
		expect(panel.lastElementChild).toBe(drafts);
		expect(drafts.contains(screen.getByRole('button', { name: "Load a sample 'scribe" }))).toBe(
			false
		);
		expect(
			drafts.compareDocumentPosition(
				screen.getByRole('button', { name: "Load a sample 'scribe" })
			) & Node.DOCUMENT_POSITION_PRECEDING
		).toBeTruthy();
	});

	// A draft the user wants rid of is most likely one of these, so the way out
	// of it is in the row rather than behind the drafts menu.
	test('deletes a recent draft in two presses without leaving its row', async () => {
		const { controller, repository } = createTestWorkbench({
			text: '',
			diagnostics: [],
			drafts: [savedDraft('draft-1', 'Test draft', ''), savedDraft('draft-2', 'Older song')]
		});
		render(RightPanel, { controller });

		await waitFor(() => expect(screen.getByText("Recent 'scribes")).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Older song' }));

		// The confirm takes the trigger's slot, and the row stops offering the
		// draft while its deletion is the question.
		expect(screen.queryByRole('button', { name: /^Older song/ })).toBeNull();
		await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

		await waitFor(async () =>
			expect((await repository.list()).map(({ id }) => id)).not.toContain('draft-2')
		);
		await waitFor(() => expect(screen.queryByText("Recent 'scribes")).toBeNull());
	});

	test('cancelling a recent draft delete puts the row back', async () => {
		const { controller, repository } = createTestWorkbench({
			text: '',
			diagnostics: [],
			drafts: [savedDraft('draft-1', 'Test draft', ''), savedDraft('draft-2', 'Older song')]
		});
		render(RightPanel, { controller });

		await waitFor(() => expect(screen.getByText("Recent 'scribes")).toBeTruthy());
		await fireEvent.click(screen.getByRole('button', { name: 'Delete Older song' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

		expect(screen.getByRole('button', { name: /^Older song/ })).toBeTruthy();
		expect((await repository.list()).map(({ id }) => id)).toContain('draft-2');
	});

	test('offers nothing to press once the empty state is about filters instead', async () => {
		const finding = diagnostic({
			ruleId: 'quotes.typewriter',
			severity: 'warning',
			message: 'Use a straight typewriter quote in lyric text.'
		});
		const { controller } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		controller.toggleSeverity('warning');

		await waitFor(() => expect(screen.getByText('Hidden by filters')).toBeTruthy());
		expect(screen.queryByRole('button', { name: "Load a sample 'scribe" })).toBeNull();
		expect(screen.queryByText("Recent 'scribes")).toBeNull();
	});

	test('blames the filters for an empty linter list only when they are the cause', async () => {
		const { controller: clean } = createTestWorkbench({ diagnostics: [] });
		render(RightPanel, { controller: clean });
		expect(screen.getByText('No issues found')).toBeTruthy();
		expect(
			screen.getByText("This 'scribe passes every enabled rule. Diagnostics reappear as you edit.")
		).toBeTruthy();
		cleanup();

		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const { controller } = createTestWorkbench({ diagnostics: [finding] });
		render(RightPanel, { controller });

		await fireEvent.click(screen.getByRole('tab', { name: /Linter/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
		expect(screen.getByText('Hidden by filters')).toBeTruthy();
		expect(
			screen.getByText('1 issue is hidden by the severity filters. Re-enable a severity to see it.')
		).toBeTruthy();

		// Ignoring the diagnostic is a separate reason for an empty list, so the copy
		// should stop pointing at the filters once they no longer hide anything.
		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
		controller.ignoreDiagnostic(finding);
		await waitFor(() => expect(screen.getByText('Nothing left to show')).toBeTruthy());
		expect(
			screen.getByText(
				'Every finding here is set aside for this session. Bring any of them back from Ignored diagnostics below.'
			)
		).toBeTruthy();
	});

	// The video is the panel's last band: below the ignored-rules footer, which
	// belongs to the linter alone, and directly above the workspace status bar.
	// Ordering by scope is what keeps it still — a picture placed above a bar that
	// only exists inside one tab would move whenever the user changed tabs.
	test('hangs the video at the foot of the panel and pushes the ignored-rules bar up', async () => {
		const finding = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const { controller, youtube } = withAudio({ diagnostics: [finding] });
		render(RightPanel, { controller, assistant: panelAssistant() });

		// Nothing attached draws nothing, and nothing has been asked of Google.
		expect(document.querySelector('.media-video')).toBeNull();
		expect(youtube.loads).toBe(0);

		await controller.media!.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
		await waitFor(() => expect(document.querySelector('.media-video')).not.toBeNull());

		const column = document.querySelector('.right-panel__tabs-root')!;
		const video = document.querySelector('.media-video')!;
		expect(column.lastElementChild).toBe(video);
		// Chrome, like the tab strip at the other end of the column: `--color-canvas`
		// is spent on the recessed selected diagnostic, so there is no third
		// material for a band hanging outside the run of cards.
		expect(getComputedStyle(video).backgroundColor).toBe(
			getComputedStyle(document.querySelector('.right-panel__header')!).backgroundColor
		);

		// The footer arrives above it rather than under it.
		controller.ignoreDiagnostic(finding);
		await waitFor(() => expect(document.querySelector('.right-panel__footer')).not.toBeNull());
		const footer = document.querySelector('.right-panel__footer')!;
		expect(column.lastElementChild).toBe(video);
		expect(footer.compareDocumentPosition(video) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	// It is outside the panes on purpose. Inside one it would be destroyed and
	// rebuilt on every tab switch — a black flash and a lost playhead each time.
	test('keeps the same video element across a tab switch', async () => {
		const { controller } = withAudio();
		render(RightPanel, { controller, assistant: panelAssistant() });

		await controller.media!.attachYouTube('https://youtu.be/dQw4w9WgXcQ');
		await waitFor(() => expect(document.querySelector('.media-video__frame')).not.toBeNull());
		const frame = document.querySelector('.media-video__frame');

		await fireEvent.click(screen.getByRole('tab', { name: 'Assistant' }));
		await waitFor(() => expect(controller.activeTab).toBe('assistant'));
		expect(document.querySelector('.media-video__frame')).toBe(frame);
	});

	test('ends a populated list deliberately and counts what the filters hide', async () => {
		const warning = diagnostic({
			ruleId: 'section.header-missing',
			severity: 'warning',
			message: 'Add a section header'
		});
		const error = diagnostic({
			ruleId: 'syntax.unbalanced-brackets',
			severity: 'error',
			message: 'Close this section header'
		});
		const { controller } = createTestWorkbench({ diagnostics: [warning, error] });
		render(RightPanel, { controller });

		// With every severity shown, the line after the last card closes the list.
		expect(screen.getByText('No further issues detected.')).toBeTruthy();

		await fireEvent.click(screen.getByRole('tab', { name: /Linter/ }));
		await fireEvent.click(screen.getByRole('button', { name: /Warnings/ }));
		expect(screen.queryByText('No further issues detected.')).toBeNull();
		expect(screen.getByText('1 more issue hidden by the severity filters.')).toBeTruthy();
	});
});

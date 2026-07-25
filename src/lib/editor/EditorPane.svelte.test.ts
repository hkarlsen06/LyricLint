import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type {
	Diagnostic,
	EditorHandle,
	PerformerRecord,
	SourceReference
} from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from './contracts.js';
import EditorPane from './EditorPane.svelte';
import DiagnosticPopover from './overlays/DiagnosticPopover.svelte';
import PerformerPicker from './overlays/PerformerPicker.svelte';

function performers(): PerformerRecord[] {
	return ['Avery', 'Blair'].map((displayName, order) => ({
		id: displayName.toLocaleLowerCase(),
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
		aliases: [],
		colorId: `color-${order}`,
		order
	}));
}

function context(overrides: Partial<EditorDisplayContext> = {}): EditorDisplayContext {
	return {
		language: 'en',
		performers: [],
		ruleSetVersion: 'test',
		...overrides
	};
}

function callbacks(): LyricEditorCallbacks {
	return {
		onSnapshot: vi.fn(),
		onAssignRequest: vi.fn(),
		onSectionHeaderRequest: vi.fn(),
		onDiagnosticActivate: vi.fn(),
		onDiagnosticHighlight: vi.fn(),
		onAnnouncement: vi.fn(),
		onPerformerRenamed: vi.fn()
	};
}

async function mountEditor(options?: {
	text?: string;
	selection?: { anchor: number; head: number };
	revision?: number;
	displayContext?: EditorDisplayContext;
	editorCallbacks?: LyricEditorCallbacks;
}): Promise<{ handle: EditorHandle; editorCallbacks: LyricEditorCallbacks }> {
	const editorCallbacks = options?.editorCallbacks ?? callbacks();
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: options?.text ?? 'First line',
			initialSelection: options?.selection,
			initialRevision: options?.revision,
			context: options?.displayContext ?? context(),
			callbacks: editorCallbacks,
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		}
	});
	await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	if (!handle) {
		throw new Error('Editor did not expose its handle.');
	}
	return { handle, editorCallbacks };
}

function testDiagnostic(overrides: Partial<Diagnostic> = {}): Diagnostic {
	return {
		ruleId: 'test-rule',
		severity: 'warning',
		from: 0,
		to: 5,
		message: 'Test issue',
		explanation: 'This diagnostic needs attention.',
		sourceIds: [],
		...overrides
	};
}

async function pressMod(key: string, shift = false): Promise<void> {
	const modifier = navigator.platform.toLocaleLowerCase().includes('mac') ? 'Meta' : 'Control';
	const shiftDown = shift ? '{Shift>}' : '';
	const shiftUp = shift ? '{/Shift}' : '';
	await userEvent.keyboard(`{${modifier}>}${shiftDown}${key}${shiftUp}{/${modifier}}`);
}

afterEach(() => {
	document.querySelectorAll('[data-test-focus-return]').forEach((node) => node.remove());
});

describe('EditorPane', () => {
	it('mounts CodeMirror in the browser and preserves initial text', async () => {
		const { handle } = await mountEditor({ text: '[Verse]\nHello' });

		expect(handle.getSnapshot().text).toBe('[Verse]\nHello');
		await expect.element(page.getByText('[Verse]')).toBeVisible();
	});

	it('preserves the current revision when the editor remounts', async () => {
		const { handle } = await mountEditor({ text: '“hello”', revision: 5 });

		expect(handle.getSnapshot().revision).toBe(5);
		handle.dispatchAtomic({
			baseRevision: 5,
			edits: [{ from: 0, to: 1, insert: '"' }]
		});
		expect(handle.getSnapshot().text).toBe('"hello”');
		expect(handle.getSnapshot().revision).toBe(6);
	});

	it('reveals a selected line near the upper third of the editor', async () => {
		const lines = Array.from({ length: 80 }, (_, index) => `Line ${index + 1}`);
		const text = lines.join('\n');
		const target = 'Line 60';
		const from = text.indexOf(target);
		const { handle } = await mountEditor({ text });
		const editor = document.querySelector<HTMLElement>('[data-testid="lyric-editor"]');
		if (!editor) {
			throw new Error('Editor host was not mounted.');
		}
		editor.style.height = '600px';
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

		handle.setSelection({ anchor: from, head: from + target.length });
		handle.revealRange({ from, to: from + target.length });
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
		);

		const scroller = editor.querySelector<HTMLElement>('.cm-scroller');
		const activeLine = editor.querySelector<HTMLElement>('.cm-activeLine');
		if (!scroller || !activeLine) {
			throw new Error('CodeMirror did not render the active line.');
		}
		const viewport = scroller.getBoundingClientRect();
		const line = activeLine.getBoundingClientRect();
		const verticalPosition = (line.top - viewport.top) / viewport.height;

		expect(verticalPosition).toBeGreaterThan(0.28);
		expect(verticalPosition).toBeLessThan(0.38);
	});

	it('canonicalizes a CRLF document to LF once, deterministically', async () => {
		const { handle } = await mountEditor({ text: 'First\r\nSecond\r\n' });
		expect(handle.getSnapshot().text).toBe('First\nSecond\n');
	});

	it('keeps an LF document unchanged', async () => {
		const { handle } = await mountEditor({ text: 'First\nSecond\n' });
		expect(handle.getSnapshot().text).toBe('First\nSecond\n');
	});

	it('does not emit snapshots for effects-only context updates', async () => {
		// Regression: context application dispatches CodeMirror effects; emitting
		// snapshots for those transactions forms an infinite shell↔editor cycle
		// (effect_update_depth_exceeded) because the shell re-derives context
		// from every snapshot.
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: '[Verse]\nHello',
				context: context(),
				callbacks: editorCallbacks
			}
		});
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		const snapshotCalls = vi.mocked(editorCallbacks.onSnapshot).mock.calls.length;

		await screen.rerender({
			context: { ...context(), ruleSetVersion: 'context-change-only' }
		});
		await new Promise((resolve) => setTimeout(resolve, 150));

		expect(vi.mocked(editorCallbacks.onSnapshot).mock.calls.length).toBe(snapshotCalls);
	});

	it('sets content language and direction attributes and updates the language', async () => {
		let handle: EditorHandle | undefined;
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: 'مرحبا',
				context: context({ language: 'ar' }),
				callbacks: editorCallbacks,
				onready: (readyHandle: EditorHandle) => {
					handle = readyHandle;
				}
			}
		});
		const textbox = page.getByRole('textbox', { name: 'Lyrics editor' });
		await expect.element(textbox).toHaveAttribute('lang', 'ar');
		await expect.element(textbox).toHaveAttribute('dir', 'auto');

		await screen.rerender({
			initialText: 'مرحبا',
			context: context({ language: 'he' }),
			callbacks: editorCallbacks,
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		});
		await expect.element(textbox).toHaveAttribute('lang', 'he');
		expect(handle).toBeDefined();
	});

	it('applies a multi-change atomic edit as one undo step', async () => {
		const original = 'Verse\nhello world';
		const { handle } = await mountEditor({ text: original, selection: { anchor: 6, head: 11 } });

		handle.dispatchAtomic({
			baseRevision: 0,
			edits: [
				{ from: 0, to: 5, insert: '[Verse: Avery]' },
				{ from: 6, to: 11, insert: '<i>hello</i>' }
			],
			selectionAfter: { anchor: 18, head: 23 }
		});
		expect(handle.getSnapshot().text).toBe('[Verse: Avery]\n<i>hello</i> world');

		handle.undo();
		expect(handle.getSnapshot().text).toBe(original);
		expect(handle.getSnapshot().selection).toEqual({ anchor: 6, head: 11 });

		handle.undo();
		expect(handle.getSnapshot().text).toBe(original);
	});

	it('discards diagnostics tagged with a stale revision', async () => {
		const stale: Diagnostic = {
			ruleId: 'test-rule',
			severity: 'warning',
			from: 0,
			to: 5,
			message: 'Stale issue',
			explanation: 'This result belongs to revision zero.',
			sourceIds: []
		};
		let handle: EditorHandle | undefined;
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: 'hello',
				context: context({ diagnostics: { revision: 0, items: [stale] } }),
				callbacks: editorCallbacks,
				onready: (readyHandle: EditorHandle) => {
					handle = readyHandle;
				}
			}
		});
		// Single diagnostics render as an underlined range (count badges only
		// appear for lines with two or more diagnostics). The underline carries no
		// native tooltip — the hover popover is the tooltip — so it is found by the
		// label it exposes instead.
		await expect.element(page.getByLabelText('warning: Stale issue')).toBeVisible();
		if (!handle) {
			throw new Error('Editor did not expose its handle.');
		}

		handle.dispatchAtomic({
			baseRevision: 0,
			edits: [{ from: 0, to: 0, insert: '!' }]
		});
		await screen.rerender({
			initialText: 'hello',
			context: context({ diagnostics: { revision: 0, items: [stale] } }),
			callbacks: editorCallbacks,
			onready: (readyHandle: EditorHandle) => {
				handle = readyHandle;
			}
		});

		await expect.element(page.getByLabelText('warning: Stale issue')).not.toBeInTheDocument();
		expect(handle.getSnapshot().diagnostics).toEqual([]);
	});

	it('suppresses selection UI and diagnostic refresh during IME composition', async () => {
		const editorCallbacks = callbacks();
		const screen = await render(EditorPane, {
			props: {
				initialText: '日本語',
				initialSelection: { anchor: 0, head: 3 },
				context: context({ performers: performers() }),
				callbacks: editorCallbacks
			}
		});
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		const content = document.querySelector<HTMLElement>('.cm-content');
		if (!content) {
			throw new Error('Missing CodeMirror content element.');
		}
		content.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: 'に' }));

		const pendingDiagnostic: Diagnostic = {
			ruleId: 'ime-rule',
			severity: 'error',
			from: 0,
			to: 1,
			message: 'Incomplete composition',
			explanation: 'Must not appear during composition.',
			sourceIds: []
		};
		await screen.rerender({
			initialText: '日本語',
			initialSelection: { anchor: 0, head: 3 },
			context: context({
				performers: performers(),
				diagnostics: { revision: 0, items: [pendingDiagnostic] }
			}),
			callbacks: editorCallbacks
		});
		await new Promise((resolve) => window.setTimeout(resolve, 100));

		await expect
			.element(page.getByRole('toolbar', { name: 'Assign performers' }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /Incomplete composition/u }))
			.not.toBeInTheDocument();

		content.dispatchEvent(
			new CompositionEvent('compositionend', { bubbles: true, data: '日本語' })
		);
	});

	it('mirrors a performer renamed in one header into the other headers', async () => {
		const text = [
			'[Verse 1: Avery]',
			'Avery opens the song',
			'',
			'[Chorus: Avery & Blair]',
			'Both of them together'
		].join('\n');
		const { handle, editorCallbacks } = await mountEditor({
			text,
			displayContext: context({ performers: performers() })
		});

		handle.setSelection({ anchor: 15, head: 15 });
		handle.focus();
		await userEvent.keyboard('n');

		expect(handle.getSnapshot().text).toBe(
			text.replace('[Verse 1: Avery]', '[Verse 1: Averyn]').replace('Avery &', 'Averyn &')
		);
		expect(editorCallbacks.onPerformerRenamed).toHaveBeenCalledWith(
			expect.objectContaining({
				performerId: 'avery',
				previousName: 'Avery',
				displayName: 'Averyn'
			})
		);
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledWith(
			'Renaming Avery in 1 other header.'
		);

		// The mirrored headers are part of the same history event.
		handle.undo();
		expect(handle.getSnapshot().text).toBe(text);
	});

	it('opens assignment UI only for a user-driven selection', async () => {
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({ performers: performers() })
		});

		handle.setSelection({ anchor: 0, head: 5 });
		await new Promise((resolve) => window.setTimeout(resolve, 100));
		await expect
			.element(page.getByRole('toolbar', { name: 'Assign performers' }))
			.not.toBeInTheDocument();

		handle.setSelection({ anchor: 0, head: 0 });
		handle.focus();
		await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowRight}{/Shift}');
		await expect.element(page.getByRole('toolbar', { name: 'Assign performers' })).toBeVisible();
		// Waited for, not read once. The toolbar is the proxy this test has for the
		// keystrokes having landed, and it is one keystroke early: it appears as soon
		// as the selection is non-empty, which is true after the first ArrowRight. A
		// synchronous read here saw `head: 1` whenever the machine was loaded enough
		// to separate the two.
		await vi.waitFor(() => expect(handle.getSnapshot().selection).toEqual({ anchor: 0, head: 2 }));
	});

	it('still opens assignment explicitly with Alt+P for a programmatic selection', async () => {
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({ performers: performers() })
		});

		handle.setSelection({ anchor: 0, head: 5 });
		handle.focus();
		await userEvent.keyboard('{Alt>}p{/Alt}');

		await expect.element(page.getByRole('toolbar', { name: 'Assign performers' })).toBeVisible();
	});

	it('preselects the performer covering the selection and submits an empty group to remove it', async () => {
		const text = '[Verse: Avery & <i>Blair</i>]\n<i>First line\nSecond line</i>';
		const from = text.indexOf('First line');
		const to = text.indexOf('Second line') + 'Second line'.length;
		const createPerformerEdit = vi.fn();
		const editorCallbacks: LyricEditorCallbacks = {
			...callbacks(),
			createPerformerEdit
		};
		const { handle } = await mountEditor({
			text,
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from,
						to,
						group: { id: 'voice-blair', performerIds: ['blair'], styleSlot: 2 }
					}
				]
			}),
			editorCallbacks
		});

		handle.setSelection({ anchor: from, head: to });
		handle.focus();
		await userEvent.keyboard('{Alt>}p{/Alt}');

		const blair = page.getByRole('button', { name: /Blair/u });
		await expect.element(blair).toHaveAttribute('aria-pressed', 'true');
		await userEvent.keyboard('{ArrowRight} ');
		await expect.element(blair).toHaveAttribute('aria-pressed', 'false');
		await userEvent.click(page.getByRole('button', { name: /Remove formatting/u }));

		expect(createPerformerEdit).toHaveBeenCalledWith({
			range: { from, to },
			performerIds: []
		});
	});

	it('shows that the plain main performer has no formatting to remove', async () => {
		const text = '[Verse: Avery]\nAvery stays plain';
		const from = text.indexOf('Avery stays plain');
		const to = from + 'Avery stays plain'.length;
		const createPerformerEdit = vi.fn();
		const { handle } = await mountEditor({
			text,
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from,
						to,
						group: { id: 'voice-avery', performerIds: ['avery'], styleSlot: 1 }
					}
				]
			}),
			editorCallbacks: {
				...callbacks(),
				createPerformerEdit
			}
		});

		handle.setSelection({ anchor: from, head: to });
		handle.focus();
		await userEvent.keyboard('{Alt>}p{/Alt}');
		await expect.element(page.getByRole('button', { name: /^Apply/u })).toBeDisabled();
		await userEvent.keyboard(' ');

		await expect.element(page.getByRole('button', { name: 'Already plain text' })).toBeDisabled();
		await expect
			.element(page.getByRole('button', { name: /Remove formatting/u }))
			.not.toBeInTheDocument();
		expect(createPerformerEdit).not.toHaveBeenCalled();
	});

	it('keeps F8 diagnostic navigation visible when a performer roster exists', async () => {
		const issue = testDiagnostic();
		const { handle } = await mountEditor({
			text: 'hello world',
			selection: { anchor: 6, head: 6 },
			displayContext: context({
				performers: performers(),
				diagnostics: { revision: 0, items: [issue] }
			})
		});

		handle.focus();
		await userEvent.keyboard('{F8}');

		const popover = page.getByRole('dialog', { name: 'Diagnostic details' });
		await expect.element(popover).toBeVisible();
		await expect.element(popover).toHaveFocus();
		await expect.element(page.getByText('Test issue')).toBeVisible();
		await expect
			.element(page.getByRole('toolbar', { name: 'Assign performers' }))
			.not.toBeInTheDocument();
	});

	it('assigns both the section voice and unresolved styled voice from the diagnostic', async () => {
		const text = '[Verse: Avery]\nAvery leads\n<i>Blair answers</i>';
		const styledFrom = text.indexOf('<i>');
		const styledTo = text.indexOf('</i>') + '</i>'.length;
		const legendFrom = text.indexOf('Avery');
		const createPerformerLegendEdit = vi.fn();
		const issue = testDiagnostic({
			ruleId: 'performer.inline-mismatch',
			from: styledFrom,
			to: styledTo,
			message: 'Inline style has no performer in the section legend.'
		});
		const editorCallbacks: LyricEditorCallbacks = {
			...callbacks(),
			createPerformerLegendEdit
		};
		const { handle } = await mountEditor({
			text,
			displayContext: context({
				performers: performers(),
				diagnostics: { revision: 0, items: [issue] },
				voiceGroups: [
					{
						from: legendFrom,
						to: legendFrom + 'Avery'.length,
						group: { id: 'voice-avery', performerIds: ['avery'], styleSlot: 1 },
						legend: true
					}
				]
			}),
			editorCallbacks
		});

		handle.focus();
		await userEvent.keyboard('{F8}');
		await userEvent.click(page.getByRole('button', { name: 'Assign section performers' }));

		await expect.element(page.getByText('General section voice · 1 of 2')).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Avery/u }))
			.toHaveAttribute('aria-pressed', 'true');
		await userEvent.click(page.getByRole('button', { name: /Next/u }));

		await expect.element(page.getByText('Styled passage · 2 of 2')).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: /Blair/u }));
		await userEvent.click(page.getByRole('button', { name: /^Apply/u }));

		expect(createPerformerLegendEdit).toHaveBeenCalledWith({
			sectionFrom: 0,
			assignments: [
				{ styleSlot: 1, performerIds: ['avery'] },
				{ styleSlot: 2, performerIds: ['blair'] }
			],
			unwrapSlots: []
		});
	});

	it('opens the section picker from the popover, as the linter panel card does', async () => {
		// Parity: a headerless section offers the same guided action wherever its
		// diagnostic is shown, and the popover hands off to the picker in place.
		const text = 'Snow on the wire';
		const issue = testDiagnostic({
			ruleId: 'section.header-missing',
			from: 0,
			to: 0,
			message: 'This lyric section has no header.'
		});
		const { handle } = await mountEditor({
			text,
			displayContext: context({ diagnostics: { revision: 0, items: [issue] } })
		});

		handle.focus();
		await userEvent.keyboard('{F8}');
		await userEvent.click(page.getByRole('button', { name: 'Choose header' }));

		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();
		// The popover made way for the picker rather than stacking behind it.
		await expect
			.element(page.getByRole('dialog', { name: 'Diagnostic details' }))
			.not.toBeInTheDocument();
	});

	it('assigns a styled-only section in one step and drops its formatting', async () => {
		// Nothing in the section is plain, so there is no voice to differentiate
		// from: the styled voice is the section's voice, and keeping the wrappers
		// would only leave an italic legend group with no plain group ahead of it.
		const text = '[Intro]\nSnow keeps falling\n\n[Verse]\n<i>Blair sings through the snow</i>';
		const sectionFrom = text.indexOf('[Verse]');
		const styledFrom = text.indexOf('<i>');
		const styledTo = text.indexOf('</i>') + '</i>'.length;
		const createPerformerLegendEdit = vi.fn();
		const issue = testDiagnostic({
			ruleId: 'performer.inline-mismatch',
			from: styledFrom,
			to: styledTo,
			message: 'Inline style has no performer in the section legend.'
		});
		const editorCallbacks: LyricEditorCallbacks = {
			...callbacks(),
			createPerformerLegendEdit
		};
		const { handle } = await mountEditor({
			text,
			displayContext: context({
				performers: performers(),
				diagnostics: { revision: 0, items: [issue] }
			}),
			editorCallbacks
		});

		handle.focus();
		await userEvent.keyboard('{F8}');
		await userEvent.click(page.getByRole('button', { name: 'Assign section performers' }));

		await expect.element(page.getByText('Section voice · formatting removed')).toBeVisible();
		await expect.element(page.getByText('General section voice · 1 of 2')).not.toBeInTheDocument();
		await userEvent.click(page.getByRole('button', { name: /Blair/u }));
		await userEvent.click(page.getByRole('button', { name: /^Apply/u }));

		expect(createPerformerLegendEdit).toHaveBeenCalledWith({
			sectionFrom,
			assignments: [{ styleSlot: 1, performerIds: ['blair'] }],
			unwrapSlots: [2]
		});
	});

	it('activates a diagnostic when its inline underline is hovered', async () => {
		const issue = testDiagnostic({ from: 0, to: 5 });
		const editorCallbacks = callbacks();
		await mountEditor({
			text: 'hello',
			displayContext: context({
				diagnostics: { revision: 0, items: [issue] }
			}),
			editorCallbacks
		});
		const underline = document.querySelector<HTMLElement>('.ll-diagnostic-range');
		if (!underline) {
			throw new Error('Diagnostic underline was not rendered.');
		}

		await userEvent.hover(underline);

		await expect.element(page.getByText('Test issue', { exact: true })).toBeVisible();
		expect(editorCallbacks.onDiagnosticHighlight).toHaveBeenCalledWith(issue);
		// Highlighting, never navigation: the shell reveals a diagnostic by
		// scrolling its line to the upper third, which under a resting pointer
		// would drag the pointed-at text away.
		expect(editorCallbacks.onDiagnosticActivate).not.toHaveBeenCalled();
	});

	it('edits at the tapped position instead of treating the first tap as a reveal', async () => {
		// Underlined text is still text: one tap puts the caret where it landed,
		// with no intervening step that has to be dismissed or repeated.
		const issue = testDiagnostic({ from: 0, to: 5 });
		const { handle } = await mountEditor({
			text: 'hello',
			displayContext: context({
				diagnostics: { revision: 0, items: [issue] }
			})
		});
		const underline = document.querySelector<HTMLElement>('.ll-diagnostic-range');
		if (!underline) {
			throw new Error('Diagnostic underline was not rendered.');
		}

		await userEvent.click(underline);

		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toHaveFocus();
		const selection = handle.getSnapshot().selection;
		expect(selection.anchor).toBe(selection.head);
		expect(selection.anchor).toBeGreaterThanOrEqual(issue.from);
		expect(selection.anchor).toBeLessThanOrEqual(issue.to);

		await userEvent.keyboard('X');
		expect(handle.getSnapshot().text).toHaveLength(6);
		expect(handle.getSnapshot().text).toContain('X');
	});

	it('activates a one-character underline hovered on its trailing half', async () => {
		// Lyric-line capitalization marks a single letter, so half the underline
		// resolves to the range's end offset rather than an interior position.
		const issue = testDiagnostic({ from: 0, to: 1 });
		const editorCallbacks = callbacks();
		await mountEditor({
			text: 'hello',
			displayContext: context({
				diagnostics: { revision: 0, items: [issue] }
			}),
			editorCallbacks
		});
		const underline = document.querySelector<HTMLElement>('.ll-diagnostic-range');
		if (!underline) {
			throw new Error('Diagnostic underline was not rendered.');
		}
		const box = underline.getBoundingClientRect();

		underline.dispatchEvent(
			new MouseEvent('mousemove', {
				bubbles: true,
				cancelable: true,
				clientX: box.right - 1,
				clientY: box.top + box.height / 2
			})
		);

		await expect
			.poll(() => vi.mocked(editorCallbacks.onDiagnosticHighlight!).mock.calls)
			.toContainEqual([issue]);
	});

	it('waits for the pointer to settle, and drops the reveal if it moves on', async () => {
		// A pointer crossing a lint-heavy verse on its way elsewhere passes over
		// every underline on the line; each one opening a card would strobe.
		const issue = testDiagnostic({ from: 0, to: 5 });
		const editorCallbacks = callbacks();
		await mountEditor({
			text: 'hello world',
			displayContext: context({
				diagnostics: { revision: 0, items: [issue] }
			}),
			editorCallbacks
		});
		const underline = document.querySelector<HTMLElement>('.ll-diagnostic-range');
		const content = document.querySelector<HTMLElement>('.cm-content');
		if (!underline || !content) {
			throw new Error('Diagnostic underline was not rendered.');
		}
		const box = underline.getBoundingClientRect();
		const passThrough = (target: HTMLElement, x: number) =>
			target.dispatchEvent(
				new MouseEvent('mousemove', {
					bubbles: true,
					cancelable: true,
					clientX: x,
					clientY: box.top + box.height / 2
				})
			);

		passThrough(underline, box.left + 1);
		// Off the underline again well inside the wait: nothing was ever revealed.
		passThrough(content, box.right + 200);
		await new Promise((resolve) => setTimeout(resolve, 300));

		expect(editorCallbacks.onDiagnosticHighlight).not.toHaveBeenCalled();
		await expect.element(page.getByText('Test issue', { exact: true })).not.toBeInTheDocument();

		// Settling on it does reveal it, without any further movement.
		passThrough(underline, box.left + 1);

		await expect.element(page.getByText('Test issue', { exact: true })).toBeVisible();
	});

	it('makes the count badge serve the same wait as the underline', async () => {
		// Two diagnostics on one line earn the circled count at the end of it, the
		// other pointer route to a card — and so the same wait.
		const warning = testDiagnostic({ from: 0, to: 5, message: 'The quieter issue' });
		const error = testDiagnostic({
			from: 6,
			to: 11,
			severity: 'error',
			message: 'The louder issue'
		});
		await mountEditor({
			text: 'hello world',
			displayContext: context({
				diagnostics: { revision: 0, items: [warning, error] }
			})
		});
		const badge = document.querySelector<HTMLElement>('.ll-diagnostic-badge');
		if (!badge) {
			throw new Error('Cluster badge was not rendered.');
		}
		// The badge leads with the line's highest severity.
		const led = page.getByText('The louder issue', { exact: true });

		badge.dispatchEvent(new MouseEvent('mouseenter'));
		badge.dispatchEvent(new MouseEvent('mouseleave'));
		await new Promise((resolve) => setTimeout(resolve, 300));

		await expect.element(led).not.toBeInTheDocument();

		badge.dispatchEvent(new MouseEvent('mouseenter'));

		await expect.element(led).toBeVisible();
	});

	it('dismisses a hovered diagnostic when the editor scrolls', async () => {
		// The line stays rendered, so this is the scroll itself closing the card
		// rather than the anchor disappearing from the viewport.
		const issue = testDiagnostic({ from: 0, to: 5 });
		await mountEditor({
			text: 'hello',
			displayContext: context({
				diagnostics: { revision: 0, items: [issue] }
			})
		});
		const underline = document.querySelector<HTMLElement>('.ll-diagnostic-range');
		if (!underline) {
			throw new Error('Diagnostic underline was not rendered.');
		}

		await userEvent.hover(underline);
		await expect.element(page.getByText('Test issue', { exact: true })).toBeVisible();

		const scroller = document.querySelector<HTMLElement>('.cm-scroller');
		if (!scroller) {
			throw new Error('Editor scroller was not rendered.');
		}
		scroller.dispatchEvent(new Event('scroll'));

		await expect.element(page.getByText('Test issue', { exact: true })).not.toBeInTheDocument();
	});

	it('leaves the caret out of the editor when a hovered popover applies a fix', async () => {
		// The shell moves the selection onto whatever finding it leads with next,
		// so the wash marks that finding rather than the caret. Pulling focus back
		// into the editor here would put a live caret on text the pointer user
		// never chose — the same reason a merely-hovered card does not return
		// focus when it closes.
		const issue = testDiagnostic({
			from: 0,
			to: 5,
			fixes: [
				{
					kind: 'safe',
					label: 'Replace greeting',
					edit: { baseRevision: 0, edits: [{ from: 0, to: 5, insert: 'hi' }] }
				}
			]
		});
		const editorCallbacks = callbacks();
		await mountEditor({
			text: 'hello world',
			displayContext: context({ diagnostics: { revision: 0, items: [issue] } }),
			editorCallbacks
		});
		const underline = document.querySelector<HTMLElement>('.ll-diagnostic-range');
		if (!underline) {
			throw new Error('Diagnostic underline was not rendered.');
		}

		await userEvent.hover(underline);
		await userEvent.click(page.getByRole('button', { name: /Replace greeting/u }));

		await expect
			.element(page.getByRole('dialog', { name: 'Diagnostic details' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).not.toHaveFocus();
	});

	it('focuses keyboard-opened diagnostics and closes them with Escape from editor focus', async () => {
		const issue = testDiagnostic({
			fixes: [
				{
					kind: 'safe',
					label: 'Replace greeting',
					edit: {
						baseRevision: 0,
						edits: [{ from: 0, to: 5, insert: 'hi' }]
					}
				}
			]
		});
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({ diagnostics: { revision: 0, items: [issue] } })
		});

		handle.focus();
		await pressMod('.');
		await expect.element(page.getByRole('button', { name: /Replace greeting/u })).toHaveFocus();

		handle.focus();
		await userEvent.keyboard('{Escape}');
		await expect
			.element(page.getByRole('dialog', { name: 'Diagnostic details' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('textbox', { name: 'Lyrics editor' })).toHaveFocus();
	});

	it('merges primary performer gutter runs and tints every voice on a mixed line', async () => {
		const text = 'Mein one\nMein two\nMein with Krissy\nKrissy one\nKrissy two';
		const roster: PerformerRecord[] = [
			{
				id: 'mein',
				displayName: 'Mein',
				normalizedKey: 'mein',
				aliases: [],
				colorId: 'indigo',
				order: 0
			},
			{
				id: 'krissy',
				displayName: 'Krissy',
				normalizedKey: 'krissy',
				aliases: [],
				colorId: 'teal',
				order: 1
			}
		];
		const range = (
			value: string,
			performerId: string,
			styleSlot: 1 | 2,
			from = text.indexOf(value)
		) => ({
			from,
			to: from + value.length,
			group: {
				id: `voice-${performerId}`,
				performerIds: [performerId],
				styleSlot
			}
		});
		await mountEditor({
			text,
			displayContext: context({
				performers: roster,
				voiceGroups: [
					range('Mein one', 'mein', 1),
					range('Mein two', 'mein', 1),
					range('Mein with ', 'mein', 1),
					range('Krissy', 'krissy', 2),
					range('Krissy one', 'krissy', 2),
					range('Krissy two', 'krissy', 2)
				]
			})
		});

		const markers = [...document.querySelectorAll<HTMLElement>('.ll-performer-gutter-marker')];
		expect(markers).toHaveLength(5);
		expect(markers[0]?.classList.contains('ll-performer-gutter-marker--start')).toBe(true);
		expect(markers[0]?.classList.contains('ll-performer-gutter-marker--end')).toBe(false);
		expect(markers[1]?.classList.contains('ll-performer-gutter-marker--start')).toBe(false);
		expect(markers[1]?.classList.contains('ll-performer-gutter-marker--end')).toBe(false);
		expect(markers[2]?.classList.contains('ll-performer-gutter-marker--start')).toBe(false);
		expect(markers[2]?.classList.contains('ll-performer-gutter-marker--end')).toBe(true);
		expect(markers[3]?.classList.contains('ll-performer-gutter-marker--start')).toBe(true);
		expect(markers[4]?.classList.contains('ll-performer-gutter-marker--end')).toBe(true);
		expect(markers[0]?.style.getPropertyValue('--ll-performer-solid')).toBe(
			'var(--performer-indigo)'
		);
		expect(markers[3]?.style.getPropertyValue('--ll-performer-solid')).toBe(
			'var(--performer-teal)'
		);
		const firstMarkerRect = markers[0]!.getBoundingClientRect();
		const firstLineRect = markers[0]!.parentElement!.getBoundingClientRect();
		const middleMarkerRect = markers[1]!.getBoundingClientRect();
		const middleLineRect = markers[1]!.parentElement!.getBoundingClientRect();
		const lastMarkerRect = markers[2]!.getBoundingClientRect();
		const lastLineRect = markers[2]!.parentElement!.getBoundingClientRect();
		const textHeight = Number.parseFloat(getComputedStyle(markers[0]!).fontSize);
		const leadingInset = (firstLineRect.height - textHeight) / 2;
		expect(firstMarkerRect.top - firstLineRect.top).toBeCloseTo(leadingInset);
		expect(middleMarkerRect.top).toBeCloseTo(middleLineRect.top);
		expect(middleMarkerRect.bottom).toBeCloseTo(middleLineRect.bottom);
		expect(lastLineRect.bottom - lastMarkerRect.bottom).toBeCloseTo(leadingInset);
		expect(getComputedStyle(markers[0]!).borderTopLeftRadius).not.toContain('%');
		expect(getComputedStyle(markers[2]!).borderBottomLeftRadius).not.toContain('%');

		await userEvent.hover(markers[1]!);
		const tooltip = document.querySelector<HTMLElement>('.ll-performer-gutter-tooltip');
		expect(tooltip?.textContent).toBe('Performed by Mein');
		expect(tooltip?.getAttribute('aria-hidden')).toBe('true');
		expect(getComputedStyle(tooltip!).position).toBe('fixed');
		markers[1]!.dispatchEvent(new PointerEvent('pointerleave'));
		expect(document.querySelector('.ll-performer-gutter-tooltip')).toBeNull();

		const secondary = [...document.querySelectorAll<HTMLElement>('.ll-performer-secondary')];
		expect(secondary).toHaveLength(1);
		expect(secondary[0]?.textContent).toBe('Krissy');
		expect(secondary[0]?.style.getPropertyValue('--ll-performer-tint')).toBe(
			'var(--performer-teal-tint)'
		);
		const mixed = [...document.querySelectorAll<HTMLElement>('.ll-performer-mixed')];
		expect(mixed.map((highlight) => highlight.textContent)).toEqual(['Mein with ', 'Krissy']);
		expect(mixed[0]?.style.getPropertyValue('--ll-performer-tint')).toBe(
			'var(--performer-indigo-tint)'
		);
		expect(mixed[1]?.style.getPropertyValue('--ll-performer-tint')).toBe(
			'var(--performer-teal-tint)'
		);
		expect(
			[...document.querySelectorAll<HTMLElement>('.ll-performer-highlight')]
				.filter((highlight) => !highlight.classList.contains('ll-performer-mixed'))
				.every((highlight) => getComputedStyle(highlight).backgroundColor === 'rgba(0, 0, 0, 0)')
		).toBe(true);
	});

	it('shows performer title tooltips on legend names but not regular lyric text', async () => {
		const text = '[Verse: Avery]\nRegular lyric';
		const legendFrom = text.indexOf('Avery');
		const lyricFrom = text.indexOf('Regular lyric');
		await mountEditor({
			text,
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from: legendFrom,
						to: legendFrom + 'Avery'.length,
						group: { id: 'voice-a-legend', performerIds: ['avery'], styleSlot: 1 },
						legend: true
					},
					{
						from: lyricFrom,
						to: lyricFrom + 'Regular lyric'.length,
						group: { id: 'voice-a-lyrics', performerIds: ['avery'], styleSlot: 1 }
					}
				]
			})
		});

		const legendName = document.querySelector<HTMLElement>('.ll-performer-legend-name');
		const lyricText = [...document.querySelectorAll<HTMLElement>('.ll-performer-highlight')].find(
			(highlight) => !highlight.classList.contains('ll-performer-legend-name')
		);
		expect(legendName?.getAttribute('title')).toBe('Performed by Avery');
		expect(lyricText?.hasAttribute('title')).toBe(false);
		expect(lyricText?.getAttribute('aria-label')).toBe('Performed by Avery');
	});

	it('announces performer identity only when the caret enters a highlighted range', async () => {
		const editorCallbacks = callbacks();
		const { handle } = await mountEditor({
			text: 'hello x',
			selection: { anchor: 6, head: 6 },
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from: 0,
						to: 5,
						group: { id: 'voice-a', performerIds: ['avery'], styleSlot: 3 }
					}
				]
			}),
			editorCallbacks
		});

		handle.setSelection({ anchor: 1, head: 1 });
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledWith('Performed by Avery');
		handle.setSelection({ anchor: 2, head: 2 });
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledTimes(1);
		handle.setSelection({ anchor: 6, head: 6 });
		handle.setSelection({ anchor: 3, head: 3 });
		expect(editorCallbacks.onAnnouncement).toHaveBeenCalledTimes(2);

		const highlight = document.querySelector<HTMLElement>('.ll-performer-slot-3');
		expect(highlight).not.toBeNull();
		// Slot styling mirrors the markup (bold for slot 3); no underline ornament.
		expect(getComputedStyle(highlight!).fontWeight).toBe('650');
		expect(getComputedStyle(highlight!).borderBottomStyle).toBe('none');
	});

	it('leaves the selection to the native highlight so a mixed-line performer tint cannot hide it', async () => {
		// Regression: with drawSelection the highlight lives in a layer pinned
		// behind inline backgrounds, so a secondary performer tint swallowed it.
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from: 0,
						to: 5,
						group: { id: 'voice-a', performerIds: ['avery'], styleSlot: 1 }
					},
					{
						from: 6,
						to: 11,
						group: { id: 'voice-b', performerIds: ['blair'], styleSlot: 2 }
					}
				]
			})
		});

		handle.focus();
		handle.setSelection({ anchor: 6, head: 11 });

		const highlight = document.querySelector<HTMLElement>('.ll-performer-secondary');
		expect(highlight).not.toBeNull();
		expect(document.querySelector('.cm-selectionLayer')).toBeNull();
		// The browser paints ::selection between an inline background and its glyphs,
		// the only place a selection survives an opaque tint. drawSelection hides it
		// there and repaints it behind the tint, where nothing shows.
		const selectionBackground = getComputedStyle(highlight!, '::selection').backgroundColor;
		expect(selectionBackground).not.toBe('transparent');
		expect(selectionBackground).not.toBe('rgba(0, 0, 0, 0)');
		expect(window.getSelection()?.isCollapsed).toBe(false);
	});

	it('uses the containing section start for the section shortcut and editor handle', async () => {
		const createSectionHeaderEdit = vi.fn(({ range }: { range: { from: number; to: number } }) =>
			range.from === 0
				? {
						baseRevision: 0,
						edits: [{ from: 0, to: 0, insert: '[Verse]\n' }]
					}
				: undefined
		);
		const editorCallbacks: LyricEditorCallbacks = {
			...callbacks(),
			createSectionHeaderEdit
		};
		const languagePack = {
			tag: 'en',
			displayName: 'English',
			policy: 'localized' as const,
			headers: [{ semanticPart: 'verse', terms: ['Verse'] }],
			sourceIds: [],
			reviewed: true
		};
		const { handle } = await mountEditor({
			text: 'first line\nsecond line',
			selection: { anchor: 14, head: 14 },
			displayContext: context({ languagePack }),
			editorCallbacks
		});

		handle.focus();
		await pressMod('h', true);
		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();
		await userEvent.click(page.getByRole('button', { name: 'Verse' }));
		expect(createSectionHeaderEdit).toHaveBeenCalledWith(
			expect.objectContaining({ range: expect.objectContaining({ from: 0 }) })
		);
		expect(handle.getSnapshot().text).toBe('[Verse]\nfirst line\nsecond line');

		handle.undo();
		handle.setSelection({ anchor: 14, head: 14 });
		handle.requestSectionHeader?.();
		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();
	});

	it('shows a non-document ghost row for a headerless section', async () => {
		const { handle } = await mountEditor({ text: 'A lyric line' });

		await expect.element(page.getByRole('button', { name: '+ Add section header' })).toBeVisible();
		expect(handle.getSnapshot().text).toBe('A lyric line');
	});

	it('ranks a pre-chorus first when a headerless section sits between a verse and refrain', async () => {
		const createSectionHeaderEdit = vi.fn();
		const languagePack = {
			tag: 'no',
			displayName: 'Norwegian',
			policy: 'localized' as const,
			headers: [
				{ semanticPart: 'Intro', terms: ['Intro'] },
				{ semanticPart: 'Verse', terms: ['Vers'] },
				{ semanticPart: 'Chorus', terms: ['Chorus', 'Refreng'] },
				{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus'] },
				{ semanticPart: 'Post-Chorus', terms: ['Post-Chorus'] },
				{ semanticPart: 'Bridge', terms: ['Bro'] }
			],
			sourceIds: [],
			reviewed: true
		};
		await mountEditor({
			text: '[Vers 1]\nVerse line\n\nBuild line\n\n[Refreng]\nChorus line\n\n[Vers 2]\nLater verse',
			displayContext: context({ language: 'no', languagePack }),
			editorCallbacks: { ...callbacks(), createSectionHeaderEdit }
		});

		await userEvent.click(page.getByRole('button', { name: '+ Add section header' }));
		await expect.element(page.getByRole('dialog', { name: 'Add section header' })).toBeVisible();

		expect(
			document.querySelector<HTMLElement>('[role="option"]:first-child button')?.textContent?.trim()
		).toBe('Pre-Chorus');
		await expect.element(page.getByRole('button', { name: 'Vers 2' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Vers 3' })).not.toBeInTheDocument();

		await userEvent.click(page.getByRole('button', { name: 'Vers 2' }));
		expect(createSectionHeaderEdit).toHaveBeenCalledWith(
			expect.objectContaining({
				headerName: 'Vers',
				ordinal: 2,
				numberedHeaderTerms: ['Vers']
			})
		);
	});

	it('renders an atomic fix preview in the editor without changing the document', async () => {
		const { handle } = await mountEditor({ text: 'hello!' });

		handle.previewAtomic?.({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 5, insert: 'world' }]
		});

		await expect.element(page.getByText('world', { exact: true })).toBeVisible();
		expect(handle.getSnapshot().text).toBe('hello!');

		handle.clearPreview?.();
		await expect.element(page.getByText('world', { exact: true })).not.toBeInTheDocument();
		expect(handle.getSnapshot().text).toBe('hello!');
	});

	it('renders a replacement as a diff, keeping the outgoing text struck through', async () => {
		const { handle } = await mountEditor({ text: 'hello!' });

		handle.previewAtomic?.({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 0, to: 5, insert: 'world' }]
		});

		// A replacement is not a swap. The text the fix would drop stays where it
		// is, marked for removal, and the replacement sits beside it, so the
		// preview reads as a change rather than as text that already changed.
		const removed = document.querySelector('.ll-fix-preview-remove');
		const added = document.querySelector('.ll-fix-preview-insert');
		expect(removed?.textContent).toBe('hello');
		expect(removed?.getAttribute('aria-label')).toBe('Suggested removal: hello');
		expect(added?.textContent).toBe('world');
		expect(added?.getAttribute('aria-label')).toBe('Suggested addition: world');
		expect(getComputedStyle(removed as Element).textDecorationLine).toContain('line-through');
	});

	it('marks a pure deletion without inventing a replacement', async () => {
		const { handle } = await mountEditor({ text: 'hello!' });

		handle.previewAtomic?.({
			baseRevision: handle.getSnapshot().revision,
			edits: [{ from: 5, to: 6, insert: '' }]
		});

		expect(document.querySelector('.ll-fix-preview-remove')?.textContent).toBe('!');
		expect(document.querySelector('.ll-fix-preview-insert')).toBeNull();
		expect(handle.getSnapshot().text).toBe('hello!');
	});
});

describe('PerformerPicker keyboard flow', () => {
	it('toggles a joint group with Space, applies with Enter, and returns focus', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onApply = vi.fn();
		const onCancel = vi.fn();

		await render(PerformerPicker, {
			performers: performers(),
			onApply,
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		await expect.element(page.getByRole('button', { name: 'Avery' })).toHaveFocus();

		await userEvent.keyboard(' ');
		await userEvent.keyboard('{ArrowRight}');
		await userEvent.keyboard(' ');
		await userEvent.keyboard('{Enter}');

		expect(onApply).toHaveBeenCalledWith(['avery', 'blair']);
		expect(focusTarget).toBe(document.activeElement);
		expect(onCancel).not.toHaveBeenCalled();
	});

	it('holds the focus ring back until the first keyboard navigation', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);

		await render(PerformerPicker, {
			performers: performers(),
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => focusTarget.focus()
		});
		const toolbar = page.getByRole('toolbar', { name: 'Assign performers' });
		await expect.element(page.getByRole('button', { name: 'Avery' })).toHaveFocus();
		await expect.element(toolbar).not.toHaveClass('show-focus');

		await userEvent.keyboard('{ArrowRight}');

		await expect.element(toolbar).toHaveClass('show-focus');
	});

	it('keeps Tab inside the card instead of dropping focus onto the page behind it', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);

		await render(PerformerPicker, {
			performers: performers(),
			initialSelectedIds: ['avery'],
			onApply: vi.fn(),
			onCancel: vi.fn(),
			returnFocus: () => focusTarget.focus()
		});
		await expect.element(page.getByRole('button', { name: 'Avery' })).toHaveFocus();

		// Roving tabindex leaves one stop in the roster, so an untrapped Tab lands
		// on whatever follows the card in the document.
		await userEvent.keyboard('{ArrowRight} ');
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByRole('button', { name: /Apply/ })).toHaveFocus();

		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByRole('button', { name: 'Blair' })).toHaveFocus();

		expect(focusTarget).not.toBe(document.activeElement);
	});

	it('cancels with Escape and returns focus', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onCancel = vi.fn();

		await render(PerformerPicker, {
			performers: performers(),
			onApply: vi.fn(),
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		await userEvent.keyboard('{Escape}');

		expect(onCancel).toHaveBeenCalledOnce();
		expect(focusTarget).toBe(document.activeElement);
	});

	it('opens with an empty roster and adds a performer inline from the + chip', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onApply = vi.fn();
		const onAddPerformer = vi.fn();
		const roster = performers().slice(0, 1);

		const screen = await render(PerformerPicker, {
			performers: [],
			onApply,
			onCancel: vi.fn(),
			returnFocus: () => focusTarget.focus(),
			onAddPerformer
		});
		await expect.element(page.getByText('Add a performer', { exact: true })).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Add a performer' })).toHaveFocus();

		await userEvent.keyboard('{Enter}');
		const nameInput = page.getByRole('textbox', { name: 'New performer name' });
		await expect.element(nameInput).toHaveFocus();
		await userEvent.keyboard('Avery{Enter}');
		expect(onAddPerformer).toHaveBeenCalledWith('Avery');

		// The shell adds the performer to the roster; the new chip arrives
		// pre-selected and focused so Enter immediately applies.
		await screen.rerender({ performers: roster });
		await expect.element(page.getByRole('button', { name: /Avery/u })).toHaveFocus();
		await userEvent.keyboard('{Enter}');
		expect(onApply).toHaveBeenCalledWith(['avery']);
	});

	it('backs out one level per Escape: input, then chips, then closed', async () => {
		const focusTarget = document.createElement('button');
		focusTarget.dataset.testFocusReturn = 'true';
		focusTarget.textContent = 'Editor focus target';
		document.body.append(focusTarget);
		const onCancel = vi.fn();

		const withoutAdd = await render(PerformerPicker, {
			performers: performers(),
			onApply: vi.fn(),
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		// No onAddPerformer means no + chip; with it, the input round-trips.
		await expect
			.element(page.getByRole('button', { name: 'Add a performer' }))
			.not.toBeInTheDocument();
		// One picker at a time, as in the pane: a press inside the second one is a
		// press outside the first, and the first would dismiss itself over it.
		withoutAdd.unmount();

		const screen = await render(PerformerPicker, {
			performers: performers(),
			onApply: vi.fn(),
			onCancel,
			returnFocus: () => focusTarget.focus(),
			onAddPerformer: vi.fn()
		});
		await userEvent.click(page.getByRole('button', { name: 'Add a performer' }));
		await expect.element(page.getByRole('textbox', { name: 'New performer name' })).toHaveFocus();

		await userEvent.keyboard('{Escape}');
		expect(onCancel).not.toHaveBeenCalled();
		await expect
			.element(page.getByRole('textbox', { name: 'New performer name' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Add a performer' })).toHaveFocus();

		await userEvent.keyboard('{Escape}');
		expect(onCancel).toHaveBeenCalledOnce();
		expect(focusTarget).toBe(document.activeElement);
		screen.unmount();
	});
});

describe('DiagnosticPopover fix flow', () => {
	it('previews the fix as soon as it opens and applies it in one click', async () => {
		const previewFix = {
			kind: 'preview' as const,
			label: 'Replace word',
			edit: {
				baseRevision: 0,
				edits: [{ from: 0, to: 5, insert: 'world' }]
			}
		};
		const safeFix = {
			kind: 'safe' as const,
			label: 'Remove mark',
			edit: {
				baseRevision: 0,
				edits: [{ from: 5, to: 6, insert: '' }]
			}
		};
		const onApplyFix = vi.fn();
		const onPreviewFix = vi.fn();
		const onCancelPreview = vi.fn();
		const screen = await render(DiagnosticPopover, {
			diagnostic: testDiagnostic({ to: 6, fixes: [previewFix, safeFix] }),
			onPreviewFix,
			onCancelPreview,
			onApplyFix,
			onIgnore: vi.fn()
		});

		// Opening the card is the preview. Nothing had to be clicked for the
		// editor to show the diff, so the two-step controls are gone.
		expect(onPreviewFix).toHaveBeenCalledWith(previewFix);
		await expect
			.element(page.getByRole('button', { name: 'Cancel preview' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Preview/u })).not.toBeInTheDocument();
		// The one competing decision stays available: there is no pending state
		// left for it to hide behind. It is worded exactly as it is in the linter
		// panel's card, because it is the same control.
		await expect.element(page.getByRole('button', { name: 'Ignore' })).toBeVisible();

		// Each fix is its own label and nothing else — no "Apply" in front of a
		// phrase that already reads as the command.
		const apply = page.getByRole('button', { name: 'Replace word' });
		await expect.element(apply).not.toHaveTextContent('Apply');
		await userEvent.click(apply);
		expect(onApplyFix).toHaveBeenCalledWith(previewFix);

		// A second fix moves the preview onto itself before it can be applied.
		await userEvent.click(page.getByRole('button', { name: 'Remove mark' }));
		expect(onPreviewFix).toHaveBeenCalledWith(safeFix);
		expect(onApplyFix).toHaveBeenCalledWith(safeFix);
		expect(onApplyFix).toHaveBeenCalledTimes(2);

		// Closing the card takes its preview with it.
		screen.unmount();
		expect(onCancelPreview).toHaveBeenCalled();
	});

	it('folds several citations behind one control so the meta line stays one line', async () => {
		const sourceIds = ['primary', 'selected-language', 'supporting-a', 'supporting-b'];
		const sources: SourceReference[] = sourceIds.map((id, index) => ({
			id,
			url: `https://genius.com/${index + 1}`,
			pageTitle: `Source ${id}`,
			sectionTitle: `Section ${id}`,
			retrievedAt: '2026-07-24',
			lastVerifiedAt: '2026-07-24',
			reviewStatus: 'reviewed'
		}));
		const screen = await render(DiagnosticPopover, {
			diagnostic: testDiagnostic({ sourceIds }),
			sources,
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore: vi.fn()
		});

		// Four links would wrap the meta line into four, so none of them is on it.
		expect(screen.container.querySelectorAll('.diagnostic-meta__row a')).toHaveLength(0);
		const disclosure = page.getByRole('button', { name: 'Sources' });
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'false');

		await userEvent.click(disclosure);

		expect(screen.container.querySelectorAll('ul[aria-label="Sources"] li')).toHaveLength(4);
		await expect.element(disclosure).toHaveAttribute('aria-expanded', 'true');
	});

	it('uses the affirmative manual-review action for an unrecognized header', async () => {
		const onIgnore = vi.fn();
		const screen = await render(DiagnosticPopover, {
			diagnostic: testDiagnostic({
				ruleId: 'section.header-unrecognized',
				severity: 'manual-review'
			}),
			onPreviewFix: vi.fn(),
			onCancelPreview: vi.fn(),
			onApplyFix: vi.fn(),
			onIgnore
		});

		const accept = page.getByRole('button', { name: "It's correct" });
		await expect.element(accept).toBeVisible();
		expect(accept.element().querySelector('svg')).not.toBeNull();
		await expect.element(page.getByRole('button', { name: 'Ignore' })).not.toBeInTheDocument();
		expect(
			getComputedStyle(screen.container.querySelector('.diagnostic-actions')!).justifyContent
		).toBe('flex-start');

		await userEvent.click(accept);
		expect(onIgnore).toHaveBeenCalledOnce();
		expect(screen.container.querySelector('.diagnostic-actions__accept')).not.toBeNull();
	});
});

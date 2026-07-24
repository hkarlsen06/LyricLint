import { page, userEvent } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Diagnostic, EditorHandle, PerformerRecord } from '../core/types.js';
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
		onAnnouncement: vi.fn(),
		onPerformerRenamed: vi.fn()
	};
}

async function mountEditor(options?: {
	text?: string;
	selection?: { anchor: number; head: number };
	displayContext?: EditorDisplayContext;
	editorCallbacks?: LyricEditorCallbacks;
}): Promise<{ handle: EditorHandle; editorCallbacks: LyricEditorCallbacks }> {
	const editorCallbacks = options?.editorCallbacks ?? callbacks();
	let handle: EditorHandle | undefined;
	await render(EditorPane, {
		props: {
			initialText: options?.text ?? 'First line',
			initialSelection: options?.selection,
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
		// appear for lines with two or more diagnostics).
		await expect.element(page.getByTitle('Stale issue')).toBeVisible();
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

		await expect.element(page.getByTitle('Stale issue')).not.toBeInTheDocument();
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
		expect(handle.getSnapshot().selection).toEqual({ anchor: 0, head: 2 });
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
		await userEvent.click(page.getByRole('button', { name: /Assign section performers Choose/u }));

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
			]
		});
	});

	it('activates a diagnostic when its inline underline is tapped', async () => {
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

		await userEvent.click(underline);

		expect(editorCallbacks.onDiagnosticActivate).toHaveBeenCalledWith(issue);
	});

	it('activates a one-character underline tapped on its trailing half', async () => {
		// Lyric-line capitalization marks a single letter, so half of every tap
		// lands past the range's midpoint and resolves to its end offset.
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
			new MouseEvent('click', {
				bubbles: true,
				cancelable: true,
				clientX: box.right - 1,
				clientY: box.top + box.height / 2
			})
		);

		expect(editorCallbacks.onDiagnosticActivate).toHaveBeenCalledWith(issue);
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

	it('leaves the selection to the native highlight so performer tints cannot hide it', async () => {
		// Regression: with drawSelection the highlight lives in a layer pinned
		// behind every line background, so an opaque performer tint swallowed it
		// and only untinted lyrics showed a selection at all.
		const { handle } = await mountEditor({
			text: 'hello world',
			displayContext: context({
				performers: performers(),
				voiceGroups: [
					{
						from: 0,
						to: 5,
						group: { id: 'voice-a', performerIds: ['avery'], styleSlot: 1 }
					}
				]
			})
		});

		handle.focus();
		handle.setSelection({ anchor: 0, head: 5 });

		const highlight = document.querySelector<HTMLElement>('.ll-performer-highlight');
		expect(highlight).not.toBeNull();
		expect(document.querySelector('.cm-selectionLayer')).toBeNull();
		// The browser paints ::selection between a line's background and its glyphs,
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
		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByRole('button', { name: /Apply/ })).toHaveFocus();

		await userEvent.keyboard('{Tab}');
		await expect.element(page.getByRole('button', { name: 'Avery' })).toHaveFocus();

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

		await render(PerformerPicker, {
			performers: performers(),
			onApply: vi.fn(),
			onCancel,
			returnFocus: () => focusTarget.focus()
		});
		// No onAddPerformer means no + chip; with it, the input round-trips.
		await expect
			.element(page.getByRole('button', { name: 'Add a performer' }))
			.not.toBeInTheDocument();

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
	it('requires preview fixes to be activated twice and keeps safe fixes one-click', async () => {
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
		await render(DiagnosticPopover, {
			diagnostic: testDiagnostic({ to: 6, fixes: [previewFix, safeFix] }),
			onPreviewFix,
			onCancelPreview,
			onApplyFix,
			onIgnore: vi.fn()
		});

		await userEvent.click(page.getByRole('button', { name: /Replace word Preview/u }));
		expect(onApplyFix).not.toHaveBeenCalled();
		expect(onPreviewFix).toHaveBeenCalledWith(previewFix);
		// The confirm state swaps the fix button in place; no nested preview card.
		await expect.element(page.getByRole('button', { name: 'Cancel preview' })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Ignore for this session' }))
			.not.toBeInTheDocument();

		await userEvent.click(page.getByRole('button', { name: /Apply Replace word Confirm/u }));
		expect(onApplyFix).toHaveBeenCalledWith(previewFix);

		await userEvent.click(page.getByRole('button', { name: /Remove mark Safe fix/u }));
		expect(onApplyFix).toHaveBeenCalledWith(safeFix);
		expect(onApplyFix).toHaveBeenCalledTimes(2);
	});
});

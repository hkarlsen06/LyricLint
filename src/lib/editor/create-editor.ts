import { redo as redoCommand, history, undo as undoCommand } from '@codemirror/commands';
import {
	EditorSelection,
	EditorState,
	StateEffect,
	StateField,
	Transaction
} from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	keymap,
	lineNumbers
} from '@codemirror/view';
import { parseDocument } from '$lib/core/parser.js';
import type {
	EditorHandle,
	EditorSnapshot,
	SerializedSelection,
	TextRange
} from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks, SelectionAnchor } from './contracts.js';
import {
	editorCallbacksField,
	editorComposingField,
	editorContextField,
	editorRevisionField,
	setEditorCallbacksEffect,
	setEditorContextEffect
} from './extensions/editor-state.js';
import {
	documentPlaceholderField,
	documentPlaceholderTheme,
	placeholderGuidance
} from './extensions/document-placeholder.js';
import { fixPreviewField, fixPreviewTheme, setFixPreviewEffect } from './extensions/fix-preview.js';
import {
	headerRenameFilter,
	headerRenameNotifier,
	headerRenameSessionField
} from './extensions/header-rename.js';
import { legendCleanupFilter } from './extensions/legend-cleanup.js';
import {
	anchorSeekOnLineNumber,
	lineAnchors,
	lineAnchorTheme,
	lineAnchorsFor,
	setFollowPlayheadEffect,
	setLineAnchorsEffect,
	setPlayheadEffect
} from './extensions/line-anchors.js';
import { lyricSync, lyricSyncTap, lyricSyncTheme, setLyricSync } from './extensions/lyric-sync.js';
import { invisibleMarks, invisibleMarksTheme } from './extensions/invisible-marks.js';
import { markupDimField, markupDimTheme } from './extensions/markup-dim.js';
import {
	diagnosticRangeHoverHandler,
	lintDecorationField,
	lintDecorationTheme,
	setDiagnosticsEffect
} from './extensions/lint-decorations.js';
import {
	performerDecorationField,
	performerCaretAnnouncementPlugin,
	performerDecorationTheme,
	performerGutter,
	performerGroupsField,
	setVoiceGroupsEffect
} from './extensions/performer-decorations.js';
import {
	sectionGhostField,
	sectionGhostTheme,
	setHeaderlessSectionsEffect
} from './extensions/section-ghosts.js';
import { selectionAnchorPlugin } from './extensions/selection-anchor.js';
import { createUpdateListener, snapshotFromState } from './extensions/update-bridge.js';
import { lyricLintKeymap, requestSectionHeader } from './keymap.js';
import { dispatchAtomicEdit } from './transaction-adapter.js';

export interface CreateLyricEditorOptions {
	initialText: string;
	initialSelection?: SerializedSelection;
	initialRevision?: number;
	context: EditorDisplayContext;
	callbacks: LyricEditorCallbacks;
	onSelectionAnchor?: (anchor: SelectionAnchor | undefined) => void;
	keymapOverrides?: Parameters<typeof lyricLintKeymap>[1];
	selectionSettleDelay?: number;
	/**
	 * Whether a headerless section offers its `+ Add section header` row. On by
	 * default, and the workbench never turns it off: there the ghost is how a
	 * section that has no header gets one, and it costs a row of a document the
	 * reader is free to scroll.
	 *
	 * It is off in the landing page's demo, where the editor is a fixed box a few
	 * lines tall and the row is a quarter of it. Nothing is lost by dropping it
	 * there — the sample's header problem is `section.header-prose`, whose fix
	 * rewrites the line the reader is already looking at, so the repair is on the
	 * line rather than in a control above it.
	 */
	sectionGhosts?: boolean;
	/**
	 * Whether the pane is as tall as its document and grows as the document does.
	 * Off by default: the workbench's editor fills the column it was given and
	 * scrolls inside it. See `autoHeightTheme`.
	 */
	autoHeight?: boolean;
}

export interface LyricEditorInstance {
	view: EditorView;
	handle: EditorHandle;
	updateContext(context: EditorDisplayContext): void;
	updateCallbacks(callbacks: LyricEditorCallbacks): void;
	destroy(): void;
}

function initialSelection(
	selection: SerializedSelection | undefined,
	documentLength: number
): EditorSelection {
	if (
		!selection ||
		!Number.isSafeInteger(selection.anchor) ||
		!Number.isSafeInteger(selection.head) ||
		selection.anchor < 0 ||
		selection.head < 0 ||
		selection.anchor > documentLength ||
		selection.head > documentLength
	) {
		return EditorSelection.single(0);
	}
	return EditorSelection.single(selection.anchor, selection.head);
}

function assertRange(range: TextRange, documentLength: number): void {
	if (
		!Number.isSafeInteger(range.from) ||
		!Number.isSafeInteger(range.to) ||
		range.from < 0 ||
		range.from > range.to ||
		range.to > documentLength
	) {
		throw new RangeError('Editor range is outside the current document.');
	}
}

/*
 * Every value here resolves through a design token, with no literal fallback.
 * A fallback looks like insurance but behaves like a second palette: the ones
 * this file used to carry were left over from an abandoned warm scheme (a hue-48
 * orange caret, hue-78 surfaces), so any token rename would have silently
 * repainted the editor in colors nobody had chosen. If a token is missing the
 * right outcome is a visible break, not a plausible wrong answer.
 *
 * The type in particular has to come from the tokens: hardcoding a monospace
 * stack here is what put the lyric text — the one surface the user reads for
 * hours — in a different typeface from every other mono glyph in the app.
 */
const editorTheme = EditorView.theme({
	'&': {
		height: '100%',
		minHeight: '12rem',
		background: 'var(--color-surface)',
		color: 'var(--color-text)',
		fontFamily: 'var(--font-mono)',
		fontSize: 'var(--font-size-editor)'
	},
	// No focus ring around the editor: the caret and the active-line wash already
	// show where focus is, and a full-height outline dominates the workspace.
	'&.cm-focused': {
		outline: 'none'
	},
	// The one time this editor draws a ring around itself. The focus ring was
	// dropped because a full-height outline dominates the workspace — which is
	// the property wanted here and nowhere else: what will take the file is the
	// whole document, not a well inside it, and a drag lasts a second. So the
	// affordance is the surface's own edge answering, rather than a tinted sheet
	// over the lyrics or a "Drop here" box drawn on top of them. It is the ring
	// width the system already uses to say "this is what your next act lands on",
	// inset so the scroll host cannot clip it.
	//
	// `&.cm-editor` and not the bare `&`, because `&.cm-focused` above is the
	// same specificity and would otherwise decide this by source order.
	'&.cm-editor.ll-audio-drop': {
		outline: 'var(--focus-ring-width) solid var(--color-accent)',
		outlineOffset: 'calc(-1 * var(--focus-ring-width))'
	},
	'.cm-scroller': {
		fontFamily: 'inherit',
		lineHeight: 'var(--line-height-editor)',
		overflow: 'auto'
	},
	'.cm-content': {
		padding: 'var(--space-5) var(--space-4) var(--space-8) var(--space-2)',
		caretColor: 'var(--color-accent)'
	},
	'.cm-line': {
		padding: '0 var(--space-1)',
		// The reading measure. The cap is carried by padding, not by a max-width
		// on `.cm-content` or the line: percentage padding resolves against the
		// content box, so the line's border box still spans the full pane — which
		// keeps the active-line wash (an inset shadow on that box, above) painting
		// edge to edge and keeps clicks anywhere on a row landing in the line —
		// while the text itself wraps at the measure. --measure-editor is the same
		// token the mock editor's textarea caps at in ui/styles/editor.css; `ch`
		// resolves against this element's own mono font, so both surfaces cap at
		// the same character count. The max() keeps the original --space-1 padding
		// as the floor when the pane is narrower than the measure, and the logical
		// property puts the slack on the away-from-text side in RTL documents too.
		paddingInlineEnd: 'max(var(--space-1), calc(100% - var(--measure-editor)))'
	},
	'.cm-gutters': {
		border: 'none',
		background: 'transparent',
		color: 'var(--color-text-muted)',
		fontFamily: 'var(--font-mono)',
		fontSize: 'var(--font-size-2xs)'
	},
	'.cm-lineNumbers .cm-gutterElement': {
		minWidth: 'var(--space-7)',
		padding: 'var(--space-0-5) var(--space-3) 0 var(--space-2)'
	},
	// The caret's row gets a subtle blue-tinted wash.
	'.cm-activeLine': {
		backgroundColor: 'transparent',
		boxShadow: 'inset 0 0 0 62.5rem color-mix(in oklch, var(--color-focus) 9%, transparent)'
	},
	// Except on the empty document. A wash marks the row you are on *among
	// others*, and an empty document has no others for it to pick out — here it
	// would only draw a band across the ghost's first row, cutting the four rows
	// of one placeholder into a lit one and three unlit ones.
	'.cm-activeLine:has(.ll-placeholder)': {
		boxShadow: 'none'
	},
	'.cm-activeLineGutter': {
		backgroundColor: 'transparent',
		color: 'var(--color-text)'
	},
	// The selection is the browser's own, not CodeMirror's drawn one (see
	// `drawSelection` in the extension list): a native highlight is painted over
	// the line's backgrounds and under its glyphs, so it stays visible on
	// secondary performer tints and fix previews. The drawn selection sits in a layer
	// behind every background and vanished under them.
	'.cm-content ::selection, .cm-line::selection': {
		backgroundColor: 'var(--color-text-selection)'
	},
	'.cm-dropCursor': {
		borderLeftColor: 'var(--color-accent)'
	}
});

/*
 * A pane that is as tall as its document instead of a window onto it. Mounted
 * after `editorTheme` so these three win on equal specificity, and only when a
 * caller asks (`autoHeight`).
 *
 * The workbench is the other kind and has to be: its editor is one half of a
 * two-column window, so it fills the column it was given and the document
 * scrolls inside it. The landing page's demo has no column to fill — it sits in
 * an article, at whatever height the verse needs, and typing a fifth line should
 * lengthen it rather than start a scroller inside a box in the middle of a page
 * the reader is already scrolling.
 *
 * The bottom padding comes down with the height, and for the same reason. Forty
 * eight pixels under the last line is room to scroll it clear of the bottom
 * edge; with nothing scrolling it is just the largest empty space on the page.
 * Twenty four matches the space over the first line, so the verse sits in its
 * box rather than at the top of one.
 */
const autoHeightTheme = EditorView.theme({
	// `&.cm-editor` and not the bare `&` that `editorTheme` uses, because a theme
	// mounted later does not reliably come out later in the sheet — CodeMirror's
	// StyleModule decides that — and at equal specificity the loser is whichever
	// one lost the coin toss. Naming the class as well outranks it outright.
	'&.cm-editor': {
		height: 'auto',
		minHeight: '0'
	},
	'&.cm-editor .cm-content': {
		paddingBottom: 'var(--space-5)'
	}
});

export interface PreparedInitialDocument {
	text: string;
}

/**
 * Canonicalize line endings to LF exactly once at load.
 *
 * CodeMirror counts every line break as a single document position, so a
 * multi-code-unit separator in snapshot text would desynchronize every parser,
 * diagnostic, and decoration offset from editor positions. The canonical
 * working document therefore always uses `\n`; the untouched original bytes
 * are preserved separately on the draft record (`originalText`).
 */
export function prepareInitialDocument(text: string): PreparedInitialDocument {
	return { text: text.replace(/\r\n|\r/g, '\n') };
}

function prepareInitialSelection(
	selection: SerializedSelection | undefined,
	sourceText: string,
	prepared: PreparedInitialDocument
): SerializedSelection | undefined {
	if (!selection || prepared.text === sourceText) {
		return selection;
	}
	if (
		selection.anchor < 0 ||
		selection.head < 0 ||
		selection.anchor > sourceText.length ||
		selection.head > sourceText.length
	) {
		return selection;
	}
	const normalizeOffset = (offset: number) =>
		sourceText.slice(0, offset).replace(/\r\n|\r/g, '\n').length;
	return {
		anchor: normalizeOffset(selection.anchor),
		head: normalizeOffset(selection.head)
	};
}

/*
 * Dropping the song onto the lyrics it belongs to is what an expert reaches for
 * instead of hunting for a control in a panel. The editor therefore learns one
 * thing about audio — what a drag carrying it looks like — and hands the file
 * straight out through `onAudioFileDropped`.
 *
 * Everything here is written so the drops that already worked keep working. A
 * selection dragged inside the document, a `.txt` read in at the caret, a URL:
 * CodeMirror handles all three, and it only gets to if this never claims an
 * event it is not handling. `preventDefault` on `dragover` is the trap — called
 * unconditionally it makes the editor the drop target for everything, so it is
 * called only once the drag has been recognized as audio.
 */
const audioFileExtensions = ['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.webm'];

function namedAsAudio(name: string): boolean {
	const lowered = name.toLowerCase();
	return audioFileExtensions.some((extension) => lowered.endsWith(extension));
}

function isAudioFile(file: File): boolean {
	// The extension is a fallback, not decoration: browsers report an empty type
	// for `.flac` and `.opus` often enough that a type-only test would refuse two
	// of the formats a transcriber is most likely to be handed.
	return file.type.startsWith('audio/') || namedAsAudio(file.name);
}

/**
 * Whether a drag still in flight is carrying audio.
 *
 * Mid-drag the browser withholds the bytes and the names — `items` reports
 * `kind` and `type` and nothing else — so this is the type test with the empty
 * type allowed through, and it is deliberately the optimistic half of the pair.
 * The affordance may light for a file whose type the browser would not name;
 * the drop, which can read the name, is where that is settled, and a drop this
 * declined falls through to CodeMirror exactly as an unrecognized one does.
 */
function dragCarriesAudio(transfer: DataTransfer | null): boolean {
	if (!transfer) return false;
	const items = transfer.items;
	if (items && items.length > 0) {
		for (let index = 0; index < items.length; index += 1) {
			const item = items[index];
			// `kind === 'string'` is a selection being dragged within the document
			// or text arriving from another window, and neither is ours.
			if (item.kind === 'file' && (item.type === '' || item.type.startsWith('audio/'))) {
				return true;
			}
		}
		return false;
	}
	// No items at all: an older browser, or a test dispatching a bare event. The
	// file list is usually empty until the drop, but when it is populated it is
	// better evidence than nothing.
	return [...transfer.files].some(isAudioFile);
}

const setAudioDropEffect = StateEffect.define<boolean>();

/** Whether audio is hovering over the document at this moment. */
const audioDropField = StateField.define<boolean>({
	create: () => false,
	update(active, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setAudioDropEffect)) active = effect.value;
		}
		return active;
	}
});

/** Dispatch only on a change: `dragover` fires continuously while the pointer moves. */
function setAudioDrop(view: EditorView, active: boolean): void {
	if (view.state.field(audioDropField) === active) return;
	view.dispatch({
		effects: setAudioDropEffect.of(active),
		annotations: Transaction.addToHistory.of(false)
	});
}

function audioFileDrop(callbacks: LyricEditorCallbacks): Extension {
	return [
		audioDropField,
		EditorView.editorAttributes.compute([audioDropField], (state): Record<string, string> =>
			state.field(audioDropField) ? { class: 'll-audio-drop' } : {}
		),
		EditorView.domEventHandlers({
			dragover(event, view) {
				if (!dragCarriesAudio(event.dataTransfer)) return false;
				// The file is copied into the draft, not moved out of wherever the
				// user dragged it from.
				if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
				setAudioDrop(view, true);
				event.preventDefault();
				return true;
			},
			dragleave(event, view) {
				// A drag crossing from one line to the next leaves a child of the
				// content and enters another, and the affordance may not blink for
				// that. A null `relatedTarget` is the drag leaving the window, or
				// being cancelled, which is a real departure.
				const entered = event.relatedTarget;
				if (entered instanceof Node && view.contentDOM.contains(entered)) return false;
				setAudioDrop(view, false);
				return false;
			},
			drop(event, view) {
				setAudioDrop(view, false);
				const dropped = event.dataTransfer ? [...event.dataTransfer.files] : [];
				const audio = dropped.find(isAudioFile);
				// Nothing audible in it, or a shell with nowhere to put it: hand the
				// event back untouched so CodeMirror's own drop runs as before.
				if (!audio || !callbacks.onAudioFileDropped?.(audio)) return false;
				event.preventDefault();
				return true;
			}
		})
	];
}

function createCallbackProxy(read: () => LyricEditorCallbacks): LyricEditorCallbacks {
	return {
		onSnapshot: (snapshot) => read().onSnapshot(snapshot),
		onAssignRequest: (request) => read().onAssignRequest(request),
		onSectionHeaderRequest: (request) => read().onSectionHeaderRequest(request),
		onDiagnosticActivate: (diagnostic) => read().onDiagnosticActivate(diagnostic),
		onAnnouncement: (message) => read().onAnnouncement(message),
		onDiagnosticActivateIntent: (diagnostic, intent) => {
			const callbacks = read();
			if (callbacks.onDiagnosticActivateIntent) {
				callbacks.onDiagnosticActivateIntent(diagnostic, intent);
			} else {
				callbacks.onDiagnosticActivate(diagnostic);
			}
		},
		onDiagnosticDismiss: () => read().onDiagnosticDismiss?.() ?? false,
		// This object is an explicit allow-list: a hook declared on the contract and
		// left out of here is never called, with nothing to see at either end.
		// `false` when the shell offers none, so the drop falls through to
		// CodeMirror instead of disappearing.
		onAudioFileDropped: (file) => read().onAudioFileDropped?.(file) ?? false,
		// Same allow-list, same trap. The anchor pair is read on every typed
		// transaction and on every press of a gutter marker, so a callback missing
		// from here would look exactly like a feature that silently does nothing.
		onRequestMediaTime: () => read().onRequestMediaTime?.(),
		onSeekMedia: (time) => read().onSeekMedia?.(time),
		onLyricSyncChange: (active, startAt) => read().onLyricSyncChange?.(active, startAt),
		onLineAnchorsChanged: () => read().onLineAnchorsChanged?.()
	};
}

/**
 * Create the browser-owned CodeMirror view. Call only from a browser lifecycle
 * boundary such as Svelte's onMount.
 */
export function createLyricEditor(
	host: HTMLElement,
	options: CreateLyricEditorOptions
): LyricEditorInstance {
	if (typeof window === 'undefined' || typeof document === 'undefined') {
		throw new Error('createLyricEditor can only run in a browser.');
	}

	let activeCallbacks = options.callbacks;
	let pendingContext: EditorDisplayContext | undefined;
	let destroyed = false;
	let contextFlushQueued = false;
	const callbackProxy = createCallbackProxy(() => activeCallbacks);
	const initialRevision = options.initialRevision ?? 0;
	if (!Number.isSafeInteger(initialRevision) || initialRevision < 0) {
		throw new RangeError('Initial editor revision must be a non-negative safe integer.');
	}
	const preparedDocument = prepareInitialDocument(options.initialText);
	const preparedSelection = prepareInitialSelection(
		options.initialSelection,
		options.initialText,
		preparedDocument
	);

	// The field and its theme are one decision, so they are gated by one value:
	// a pane that does not draw the row has nothing to style, and leaving half
	// the pair behind is how a "disabled" feature keeps a foothold in the DOM.
	const sectionGhosts = options.sectionGhosts ?? true;

	// Held rather than passed inline, because the tap is reachable two ways — the
	// `Space` binding inside the extension, and the transport's control through
	// the handle below — and both have to be the same command over the same
	// options or a tap and a press would stop meaning the same thing.
	const syncOptions = {
		currentTime: () => callbackProxy.onRequestMediaTime?.(),
		onChange: (active: boolean, startAt?: number) =>
			callbackProxy.onLyricSyncChange?.(active, startAt),
		announce: (message: string) => callbackProxy.onAnnouncement(message)
	};
	const syncTap = lyricSyncTap(syncOptions);

	const extensions: Extension[] = [
		history(),
		// The line number is a wider, always-drawn target than four characters of
		// muted time, on the side of the document the eye already uses to find a
		// line. It answers only where there is a time to play; see
		// `anchorSeekOnLineNumber`.
		lineNumbers({
			domEventHandlers: {
				mousedown: anchorSeekOnLineNumber({
					onSeek: (time) => callbackProxy.onSeekMedia?.(time),
					currentTime: () => callbackProxy.onRequestMediaTime?.()
				})
			}
		}),
		performerGutter(),
		// Replaces a bare `highlightSpecialChars()`: same control-character
		// handling, plus the invisible characters `text.invisible-characters`
		// reports, so that rule's underlines have something to sit under.
		invisibleMarks,
		// No `drawSelection()`: it hides the native selection and repaints it in a
		// layer pinned behind the content, where performer tints and other
		// color-coded line backgrounds cover it completely. The browser's own
		// highlight paints between a line's background and its glyphs, which is
		// exactly where a selection has to sit to survive a tint. The cost is the
		// drawn cursor and secondary selection ranges, neither of which this
		// single-selection editor uses.
		dropCursor(),
		EditorView.lineWrapping,
		EditorView.contentAttributes.of({
			'aria-label': 'Lyrics editor',
			'aria-multiline': 'true',
			// The visible ghost transcription is `aria-hidden`; this is how its
			// guidance reaches a reader who cannot see it. It is stated
			// unconditionally because ARIA already scopes a placeholder to an empty
			// field, exactly as the visible one is scoped to an empty document.
			'aria-placeholder': placeholderGuidance,
			spellcheck: 'true',
			autocapitalize: 'sentences'
		}),
		editorContextField,
		EditorView.contentAttributes.compute([editorContextField], (state) => ({
			lang: state.field(editorContextField)?.language ?? options.context.language,
			dir: 'auto'
		})),
		editorCallbacksField,
		editorRevisionField.init(() => initialRevision),
		editorComposingField,
		legendCleanupFilter(),
		// Transaction filters run in reverse registration order, so listing the
		// rename filter after legend cleanup makes it run first: it needs the
		// user's own edit, not one already carrying appended cleanup changes.
		// Cleanup then sees the fully mirrored document.
		headerRenameSessionField,
		headerRenameFilter(),
		headerRenameNotifier(),
		fixPreviewField,
		documentPlaceholderField,
		performerGroupsField,
		performerDecorationField,
		lintDecorationField,
		diagnosticRangeHoverHandler(),
		...(sectionGhosts ? [sectionGhostField] : []),
		markupDimField,
		highlightActiveLine(),
		highlightActiveLineGutter(),
		performerDecorationTheme,
		lintDecorationTheme,
		...(sectionGhosts ? [sectionGhostTheme] : []),
		markupDimTheme,
		invisibleMarksTheme,
		fixPreviewTheme,
		documentPlaceholderTheme,
		editorTheme,
		...(options.autoHeight ? [autoHeightTheme] : []),
		audioFileDrop(callbackProxy),
		lineAnchors({
			onSeek: (time) => callbackProxy.onSeekMedia?.(time),
			currentTime: () => callbackProxy.onRequestMediaTime?.(),
			onAnchorsChanged: () => callbackProxy.onLineAnchorsChanged?.()
		}),
		lineAnchorTheme,
		lyricSync(syncOptions),
		lyricSyncTheme,
		keymap.of(lyricLintKeymap(callbackProxy, options.keymapOverrides)),
		selectionAnchorPlugin(
			(anchor) => options.onSelectionAnchor?.(anchor),
			options.selectionSettleDelay
		),
		performerCaretAnnouncementPlugin(),
		createUpdateListener((snapshot) => {
			activeCallbacks.onSnapshot(snapshot);
			if (!pendingContext || contextFlushQueued) {
				return;
			}
			contextFlushQueued = true;
			queueMicrotask(() => {
				contextFlushQueued = false;
				if (!destroyed && pendingContext && !view.state.field(editorComposingField)) {
					const context = pendingContext;
					pendingContext = undefined;
					applyContext(context);
				}
			});
		})
	];

	const state = EditorState.create({
		doc: preparedDocument.text,
		selection: initialSelection(preparedSelection, preparedDocument.text.length),
		extensions
	});
	const view = new EditorView({ state, parent: host });

	function applyContext(context: EditorDisplayContext): void {
		const revision = view.state.field(editorRevisionField);
		const text = view.state.doc.toString();
		const parsed = context.parsed?.text === text ? context.parsed : parseDocument(text);
		view.dispatch({
			effects: [
				setEditorContextEffect.of({ ...context, parsed }),
				setDiagnosticsEffect.of(
					context.diagnostics ?? {
						revision,
						items: []
					}
				),
				setVoiceGroupsEffect.of({
					groups: context.voiceGroups ?? [],
					performers: context.performers
				}),
				setHeaderlessSectionsEffect.of(parsed),
				setEditorCallbacksEffect.of(activeCallbacks)
			],
			annotations: Transaction.addToHistory.of(false)
		});
	}

	const handle: EditorHandle = {
		focus() {
			view.focus();
		},
		getSnapshot(): EditorSnapshot {
			return snapshotFromState(view.state);
		},
		dispatchAtomic(edit) {
			view.dispatch({
				effects: setFixPreviewEffect.of(undefined),
				annotations: Transaction.addToHistory.of(false)
			});
			dispatchAtomicEdit(view, edit);
		},
		previewAtomic(edit) {
			if (edit.baseRevision !== view.state.field(editorRevisionField)) {
				throw new RangeError('Fix preview is stale for the current editor revision.');
			}
			for (const change of edit.edits) {
				assertRange(change, view.state.doc.length);
			}
			// Previewing never scrolls. The diff appears because a diagnostic is
			// selected, and whatever selected it has already brought the range
			// into view; moving the lyrics again here would yank the document
			// out from under a reader who only expanded a card.
			view.dispatch({
				effects: setFixPreviewEffect.of(edit),
				annotations: Transaction.addToHistory.of(false)
			});
		},
		clearPreview() {
			view.dispatch({
				effects: setFixPreviewEffect.of(undefined),
				annotations: Transaction.addToHistory.of(false)
			});
		},
		undo() {
			undoCommand(view);
		},
		redo() {
			redoCommand(view);
		},
		revealRange(range) {
			assertRange(range, view.state.doc.length);
			const upperThirdOffset = view.scrollDOM.clientHeight / 3;
			view.dispatch({
				effects: EditorView.scrollIntoView(range.from, {
					y: 'start',
					yMargin: upperThirdOffset
				})
			});
		},
		setSelection(selection) {
			assertRange(
				{
					from: Math.min(selection.anchor, selection.head),
					to: Math.max(selection.anchor, selection.head)
				},
				view.state.doc.length
			);
			view.dispatch({
				selection: EditorSelection.single(selection.anchor, selection.head),
				scrollIntoView: true,
				annotations: Transaction.addToHistory.of(false)
			});
		},
		requestSectionHeader() {
			requestSectionHeader(view, callbackProxy);
		},
		getLineAnchors() {
			return lineAnchorsFor(view.state);
		},
		setLineAnchors(anchors) {
			view.dispatch({
				effects: setLineAnchorsEffect.of(anchors),
				annotations: Transaction.addToHistory.of(false)
			});
		},
		setMediaPlayhead(time) {
			// Cheap on purpose: this arrives several times a second for the length
			// of a song. The field returns its own previous value when the marked
			// anchor has not changed, so the common tick costs one transaction and
			// no re-render.
			view.dispatch({
				effects: setPlayheadEffect.of(time),
				annotations: Transaction.addToHistory.of(false)
			});
		},
		setLyricSync(active) {
			setLyricSync(view, active);
		},
		// The tap, for a pointer that has no `Space`. It does not focus the editor:
		// the press is already in the transport, and a run driven from there stays
		// there — the caret walks on its own and the document is read-only anyway.
		tapLyricSync() {
			syncTap(view);
		},
		setFollowPlayhead(follow) {
			view.dispatch({
				effects: setFollowPlayheadEffect.of(follow),
				annotations: Transaction.addToHistory.of(false)
			});
		}
	};

	const instance: LyricEditorInstance = {
		view,
		handle,
		updateContext(context) {
			if (view.state.field(editorComposingField) || view.composing) {
				pendingContext = context;
				return;
			}
			applyContext(context);
		},
		updateCallbacks(callbacks) {
			activeCallbacks = callbacks;
			view.dispatch({
				effects: setEditorCallbacksEffect.of(callbacks),
				annotations: Transaction.addToHistory.of(false)
			});
		},
		destroy() {
			if (destroyed) {
				return;
			}
			destroyed = true;
			options.onSelectionAnchor?.(undefined);
			view.destroy();
			host.replaceChildren();
		}
	};

	applyContext(options.context);
	return instance;
}

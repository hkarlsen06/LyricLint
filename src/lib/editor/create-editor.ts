import { redo as redoCommand, history, undo as undoCommand } from '@codemirror/commands';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
	dropCursor,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	highlightSpecialChars,
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
import { fixPreviewField, fixPreviewTheme, setFixPreviewEffect } from './extensions/fix-preview.js';
import {
	headerRenameFilter,
	headerRenameNotifier,
	headerRenameSessionField
} from './extensions/header-rename.js';
import { legendCleanupFilter } from './extensions/legend-cleanup.js';
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
		fontSize: 'var(--font-size-md)'
	},
	// No focus ring around the editor: the caret and the active-line wash already
	// show where focus is, and a full-height outline dominates the workspace.
	'&.cm-focused': {
		outline: 'none'
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
		onDiagnosticDismiss: () => read().onDiagnosticDismiss?.() ?? false
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

	const extensions: Extension[] = [
		history(),
		lineNumbers(),
		performerGutter(),
		highlightSpecialChars(),
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
		performerGroupsField,
		performerDecorationField,
		lintDecorationField,
		diagnosticRangeHoverHandler(),
		sectionGhostField,
		markupDimField,
		highlightActiveLine(),
		highlightActiveLineGutter(),
		performerDecorationTheme,
		lintDecorationTheme,
		sectionGhostTheme,
		markupDimTheme,
		fixPreviewTheme,
		editorTheme,
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

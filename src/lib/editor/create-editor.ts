import { redo as redoCommand, history, undo as undoCommand } from '@codemirror/commands';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
	drawSelection,
	dropCursor,
	EditorView,
	highlightSpecialChars,
	keymap,
	lineNumbers
} from '@codemirror/view';
import { parseDocument } from '../core/parser.js';
import type {
	EditorHandle,
	EditorSnapshot,
	SerializedSelection,
	TextRange
} from '../core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks, SelectionAnchor } from './contracts.js';
import {
	editorCallbacksField,
	editorComposingField,
	editorContextField,
	editorRevisionField,
	setEditorCallbacksEffect,
	setEditorContextEffect
} from './extensions/editor-state.js';
import { legendCleanupFilter } from './extensions/legend-cleanup.js';
import {
	lintDecorationField,
	lintDecorationTheme,
	setDiagnosticsEffect
} from './extensions/lint-decorations.js';
import {
	performerDecorationField,
	performerCaretAnnouncementPlugin,
	performerDecorationTheme,
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

const editorTheme = EditorView.theme({
	'&': {
		height: '100%',
		minHeight: '12rem',
		background: 'var(--color-surface, var(--ll-editor-surface, oklch(0.985 0.006 78)))',
		color: 'var(--color-text, var(--ll-editor-text, oklch(0.24 0.015 70)))',
		fontFamily: 'ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace',
		fontSize: '0.9375rem'
	},
	'&.cm-focused': {
		outline: '2px solid var(--color-focus, var(--ll-focus, oklch(0.58 0.14 55)))',
		outlineOffset: '-2px'
	},
	'.cm-scroller': {
		fontFamily: 'inherit',
		lineHeight: '1.65',
		overflow: 'auto'
	},
	'.cm-content': {
		padding: '1.25rem 1.1rem 4rem 0.5rem',
		caretColor: 'var(--color-accent, var(--ll-editor-caret, oklch(0.47 0.16 48)))'
	},
	'.cm-line': {
		padding: '0 0.25rem'
	},
	'.cm-gutters': {
		border: 'none',
		background: 'transparent',
		color: 'color-mix(in oklch, var(--color-text-muted, oklch(0.44 0.016 65)) 72%, transparent)',
		fontFamily: 'var(--font-mono, ui-monospace, monospace)',
		fontSize: '0.72rem'
	},
	'.cm-lineNumbers .cm-gutterElement': {
		minWidth: '2.6rem',
		padding: '0.22rem 0.7rem 0 0.5rem'
	},
	'.cm-selectionBackground, ::selection': {
		backgroundColor:
			'var(--color-surface-strong, var(--ll-selection, oklch(0.82 0.07 62 / 0.62))) !important'
	},
	'.cm-cursor': {
		borderLeftColor: 'var(--color-accent, var(--ll-editor-caret, oklch(0.47 0.16 48)))'
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
	const preparedDocument = prepareInitialDocument(options.initialText);
	const preparedSelection = prepareInitialSelection(
		options.initialSelection,
		options.initialText,
		preparedDocument
	);

	const extensions: Extension[] = [
		history(),
		lineNumbers(),
		highlightSpecialChars(),
		drawSelection(),
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
		editorRevisionField,
		editorComposingField,
		legendCleanupFilter(),
		performerGroupsField,
		performerDecorationField,
		lintDecorationField,
		sectionGhostField,
		performerDecorationTheme,
		lintDecorationTheme,
		sectionGhostTheme,
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
			dispatchAtomicEdit(view, edit);
		},
		undo() {
			undoCommand(view);
		},
		redo() {
			redoCommand(view);
		},
		revealRange(range) {
			assertRange(range, view.state.doc.length);
			view.dispatch({
				effects: EditorView.scrollIntoView(range.from, { y: 'center' })
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

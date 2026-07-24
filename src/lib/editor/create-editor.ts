import { redo as redoCommand, history, undo as undoCommand } from '@codemirror/commands';
import { EditorSelection, EditorState, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import {
	drawSelection,
	dropCursor,
	EditorView,
	highlightSpecialChars,
	keymap
} from '@codemirror/view';
import { parseDocument } from '../core/parser.js';
import type {
	EditorCallbacks,
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
import {
	lintDecorationField,
	lintDecorationTheme,
	setDiagnosticsEffect
} from './extensions/lint-decorations.js';
import {
	performerDecorationField,
	performerDecorationTheme,
	setVoiceGroupsEffect
} from './extensions/performer-decorations.js';
import {
	sectionGhostField,
	sectionGhostTheme,
	setHeaderlessSectionsEffect
} from './extensions/section-ghosts.js';
import { selectionAnchorPlugin } from './extensions/selection-anchor.js';
import { createUpdateListener, snapshotFromState } from './extensions/update-bridge.js';
import { lyricLintKeymap } from './keymap.js';
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
		background: 'var(--ll-editor-surface, oklch(0.985 0.006 78))',
		color: 'var(--ll-editor-text, oklch(0.24 0.015 70))',
		fontFamily: 'ui-monospace, "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace',
		fontSize: '0.9375rem'
	},
	'&.cm-focused': {
		outline: '2px solid var(--ll-focus, oklch(0.58 0.14 55))',
		outlineOffset: '-2px'
	},
	'.cm-scroller': {
		fontFamily: 'inherit',
		lineHeight: '1.65',
		overflow: 'auto'
	},
	'.cm-content': {
		padding: '1rem 1.1rem 4rem',
		caretColor: 'var(--ll-editor-caret, oklch(0.47 0.16 48))'
	},
	'.cm-line': {
		padding: '0 0.25rem'
	},
	'.cm-selectionBackground, ::selection': {
		backgroundColor: 'var(--ll-selection, oklch(0.82 0.07 62 / 0.62)) !important'
	},
	'.cm-cursor': {
		borderLeftColor: 'var(--ll-editor-caret, oklch(0.47 0.16 48))'
	}
});

function createCallbackProxy(read: () => LyricEditorCallbacks): EditorCallbacks {
	return {
		onSnapshot: (snapshot) => read().onSnapshot(snapshot),
		onAssignRequest: (request) => read().onAssignRequest(request),
		onSectionHeaderRequest: (request) => read().onSectionHeaderRequest(request),
		onDiagnosticActivate: (diagnostic) => read().onDiagnosticActivate(diagnostic),
		onAnnouncement: (message) => read().onAnnouncement(message)
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

	const extensions: Extension[] = [
		history(),
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
		editorCallbacksField,
		editorRevisionField,
		editorComposingField,
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
		doc: options.initialText,
		selection: initialSelection(options.initialSelection, options.initialText.length),
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

import { redoDepth, undoDepth } from '@codemirror/commands';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parseDocument } from '../../core/parser.js';
import type { EditorSnapshot } from '../../core/types.js';
import { diagnosticsForState } from './lint-decorations.js';
import {
	editorComposingField,
	editorContextField,
	editorRevisionField,
	setComposingEffect
} from './editor-state.js';

export function snapshotFromState(state: EditorState): EditorSnapshot {
	const text = state.doc.toString();
	const selection = state.selection.main;
	const context = state.field(editorContextField);
	const parsed = context?.parsed?.text === text ? context.parsed : parseDocument(text);

	return {
		revision: state.field(editorRevisionField),
		text,
		selection: { anchor: selection.anchor, head: selection.head },
		parsed,
		diagnostics: diagnosticsForState(state),
		composing: state.field(editorComposingField),
		canUndo: undoDepth(state) > 0,
		canRedo: redoDepth(state) > 0
	};
}

/**
 * Emit consistent editor snapshots while withholding incomplete IME updates.
 *
 * compositionend is deferred one task so CodeMirror can first commit the DOM
 * composition transaction. The resulting callback therefore observes the
 * final text, selection, diagnostics, and revision from one state.
 */
export function createUpdateListener(callback: (snapshot: EditorSnapshot) => void): Extension {
	return [
		EditorView.domEventHandlers({
			compositionstart(_event, view) {
				view.dispatch({ effects: setComposingEffect.of(true) });
				return false;
			},
			compositionend(_event, view) {
				window.setTimeout(() => {
					if (!view.dom.isConnected) {
						return;
					}
					view.dispatch({ effects: setComposingEffect.of(false) });
				}, 0);
				return false;
			}
		}),
		EditorView.updateListener.of((update) => {
			if (update.state.field(editorComposingField)) {
				return;
			}

			if (
				update.docChanged ||
				update.selectionSet ||
				update.transactions.some((transaction) => transaction.effects.length > 0)
			) {
				callback(snapshotFromState(update.state));
			}
		})
	];
}

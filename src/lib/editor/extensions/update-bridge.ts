import { redoDepth, undoDepth } from '@codemirror/commands';
import type { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { EditorSnapshot } from '$lib/core/types.js';
import { diagnosticsForState } from './lint-decorations.js';
import {
	editorComposingField,
	editorRevisionField,
	parsedDocumentForState,
	setComposingEffect
} from './editor-state.js';

export function snapshotFromState(state: EditorState, atomic = false): EditorSnapshot {
	const text = state.doc.toString();
	const selection = state.selection.main;

	const snapshot: EditorSnapshot = {
		revision: state.field(editorRevisionField),
		text,
		selection: { anchor: selection.anchor, head: selection.head },
		parsed: parsedDocumentForState(state),
		diagnostics: diagnosticsForState(state),
		composing: state.field(editorComposingField),
		canUndo: undoDepth(state) > 0,
		canRedo: redoDepth(state) > 0
	};
	if (atomic) snapshot.atomic = true;
	return snapshot;
}

/**
 * Emit consistent editor snapshots while withholding incomplete IME updates.
 *
 * compositionend is deferred one task so CodeMirror can first commit the DOM
 * composition transaction. The resulting callback therefore observes the
 * final text, selection, diagnostics, and revision from one state.
 */
export function createUpdateListener(callback: (snapshot: EditorSnapshot) => void): Extension {
	let compositionRun = 0;

	const finishComposition = (
		view: EditorView,
		run: number,
		delay: number,
		waitForCodeMirror = false
	): void => {
		window.setTimeout(() => {
			if (
				!view.dom.isConnected ||
				run !== compositionRun ||
				!view.state.field(editorComposingField)
			) {
				return;
			}
			// Extension handlers run before CodeMirror's built-in beforeinput
			// handler, so both dead-key recovery timers are registered for the same
			// instant in that order. Give CodeMirror's already-queued Safari timer one
			// turn, then release only if CodeMirror really ended the composition. Other
			// browsers may legitimately keep a composition open across `insertText`;
			// the fallback signal must never overrule their state.
			if (view.compositionStarted) {
				if (waitForCodeMirror) finishComposition(view, run, 0);
				return;
			}
			view.dispatch({ effects: setComposingEffect.of(false) });
		}, delay);
	};

	return [
		EditorView.domEventHandlers({
			compositionstart(_event, view) {
				compositionRun += 1;
				view.dispatch({ effects: setComposingEffect.of(true) });
				return false;
			},
			compositionend(_event, view) {
				finishComposition(view, compositionRun, 0);
				return false;
			},
			beforeinput(event, view) {
				// Safari occasionally omits compositionend after a dead key. CodeMirror
				// repairs its own composing flag when the finalized `insertText` arrives,
				// but that internal repair emits no DOM event for this separate snapshot
				// gate. Check the same signal here, but let CodeMirror's public
				// `compositionStarted` state decide whether the recovery actually happened.
				if (event.inputType === 'insertText' && view.state.field(editorComposingField)) {
					finishComposition(view, compositionRun, 20, true);
				}
				return false;
			}
		}),
		EditorView.updateListener.of((update) => {
			if (update.state.field(editorComposingField)) {
				return;
			}

			// Emit only for document, selection, or composition-resume changes.
			// Effects-only transactions (context or diagnostics application) must
			// not re-emit: the shell reacts to snapshots by re-applying context,
			// so emitting here would form an infinite update cycle.
			const resumedComposition = update.startState.field(editorComposingField);
			if (update.docChanged || update.selectionSet || resumedComposition) {
				// `input.atomic` is `dispatchAtomicEdit`'s own annotation, so every
				// path that replaces text as one complete edit is covered by the one
				// place that dispatches them. Only a document change can be atomic: a
				// selection moving is not an edit, and reporting it as one would tell
				// the shell a press had landed when nothing had.
				const atomic =
					update.docChanged &&
					update.transactions.some((transaction) => transaction.isUserEvent('input.atomic'));
				callback(snapshotFromState(update.state, atomic));
			}
		})
	];
}

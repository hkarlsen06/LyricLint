import { StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { parseDocument } from '$lib/core/parser.js';
import type { ParsedDocument } from '$lib/core/types.js';
import type { EditorDisplayContext, LyricEditorCallbacks } from '../contracts.js';

export const setEditorContextEffect = StateEffect.define<EditorDisplayContext>();
export const setEditorCallbacksEffect = StateEffect.define<LyricEditorCallbacks>();
export const setComposingEffect = StateEffect.define<boolean>();

// Editor states are immutable, so their document and context parse can never
// become stale. Weak keys let discarded transaction states release the parse.
const parsedDocuments = new WeakMap<EditorState, ParsedDocument>();

export const editorContextField = StateField.define<EditorDisplayContext | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setEditorContextEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});

/**
 * The parse the shell last pushed in, or a fresh one when it is stale.
 *
 * The context effect lands a beat behind the document, so a command that read
 * `editorContextField.parsed` unchecked would answer a question about the text
 * as it stood one keystroke ago. Every editor-side caller wants the same
 * fallback, and two spellings of "is this parse still current" would drift the
 * first time one of them learned about a new invalidation.
 */
export function parsedDocumentForState(state: EditorState): ParsedDocument {
	const memoized = parsedDocuments.get(state);
	if (memoized) return memoized;

	const text = state.doc.toString();
	const parsed = state.field(editorContextField, false)?.parsed;
	const current = parsed?.text === text ? parsed : parseDocument(text);
	parsedDocuments.set(state, current);
	return current;
}

export function parsedDocumentForView(view: EditorView): ParsedDocument {
	return parsedDocumentForState(view.state);
}

export const editorRevisionField = StateField.define<number>({
	create: () => 0,
	update(value, transaction) {
		return transaction.docChanged ? value + 1 : value;
	}
});

export const editorComposingField = StateField.define<boolean>({
	create: () => false,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setComposingEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});

/**
 * Whether this document change is only the browser's provisional IME text.
 *
 * Context-derived presentation must map what it already knows through this
 * change, not clear itself as though the user committed an edit. The shell is
 * deliberately withheld until composition settles, at which point it sends
 * the exact parse, diagnostics, and performer ranges for the committed text.
 */
export function isCompositionChange(transaction: Transaction): boolean {
	return (
		transaction.docChanged && transaction.startState.field(editorComposingField, false) === true
	);
}

export const editorCallbacksField = StateField.define<LyricEditorCallbacks | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setEditorCallbacksEffect)) {
				value = effect.value;
			}
		}
		return value;
	}
});

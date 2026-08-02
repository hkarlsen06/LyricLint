import { EditorState, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { cleanupLegendSlots } from '$lib/performers/legend-cleanup.js';
import { editorComposingField, parsedDocumentForState } from './editor-state.js';

/**
 * Append legend-slot cleanup to the user transaction that made a slot unused.
 *
 * Running inside a transaction filter keeps the rewrite part of the same
 * document edit: one snapshot is emitted, one history event is recorded, and
 * one undo therefore restores the exact previous text. Undo/redo transactions
 * are exempt so history replay always reproduces stored states byte for byte,
 * and IME composition is never interrupted. The domain function is a fixpoint
 * (it returns no edits for an already-clean legend), so this cannot loop.
 */
export function legendCleanupFilter(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		if (!transaction.docChanged) {
			return transaction;
		}
		if (transaction.startState.field(editorComposingField, false)) {
			return transaction;
		}
		const userEvent = transaction.annotation(Transaction.userEvent);
		if (userEvent === 'undo' || userEvent === 'redo') {
			return transaction;
		}
		const edits = cleanupLegendSlots(parsedDocumentForState(transaction.state));
		if (edits.length === 0) {
			return transaction;
		}
		return [
			transaction,
			{ changes: edits.map(({ from, to, insert }) => ({ from, to, insert })), sequential: true }
		];
	});
}

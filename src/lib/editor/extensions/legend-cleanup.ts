import { EditorState, MapMode, Transaction } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import type { StyleSlot } from '#lib/core/types.js';
import { cleanupLegendSlots, usedStyleSlots } from '#lib/performers/legend-cleanup.js';
import { editorComposingField, parsedDocumentForState } from './editor-state.js';

/**
 * Append legend-slot cleanup to the user transaction that made a slot unused.
 * Only that transaction: a slot already unused before it is left alone.
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
		// Each section's slots before the edit, keyed by where its header lands
		// after it, so only a slot this edit stopped using is dropped.
		const before = new Map<number, ReadonlySet<StyleSlot>>();
		for (const section of parsedDocumentForState(transaction.startState).sections) {
			if (!section.header) continue;
			const from = transaction.changes.mapPos(section.header.from, 1, MapMode.TrackDel);
			if (from !== null) before.set(from, usedStyleSlots(section));
		}
		const edits = cleanupLegendSlots(parsedDocumentForState(transaction.state), (section) =>
			section.header ? before.get(section.header.from) : undefined
		);
		if (edits.length === 0) {
			return transaction;
		}
		return [
			transaction,
			{ changes: edits.map(({ from, to, insert }) => ({ from, to, insert })), sequential: true }
		];
	});
}

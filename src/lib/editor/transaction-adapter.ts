import { EditorSelection, Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { AtomicDocumentEdit, TextEdit } from '$lib/core/types.js';
import { editorRevisionField } from './extensions/editor-state.js';

function assertIntegerOffset(value: number, label: string): void {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${label} must be a non-negative safe integer.`);
	}
}

export function validateAtomicEdit(
	edit: AtomicDocumentEdit,
	documentLength: number,
	currentRevision: number
): void {
	if (!Number.isSafeInteger(edit.baseRevision) || edit.baseRevision < 0) {
		throw new RangeError('Atomic edit baseRevision must be a non-negative safe integer.');
	}
	if (edit.baseRevision !== currentRevision) {
		throw new Error(
			`Atomic edit targets revision ${edit.baseRevision}, but the editor is at revision ${currentRevision}.`
		);
	}
	if (edit.edits.length === 0) {
		throw new Error('Atomic document edits must contain at least one text change.');
	}

	let previous: TextEdit | undefined;
	for (const [index, change] of edit.edits.entries()) {
		assertIntegerOffset(change.from, `Edit ${index} from`);
		assertIntegerOffset(change.to, `Edit ${index} to`);
		if (change.from > change.to) {
			throw new RangeError(`Edit ${index} has an inverted range.`);
		}
		if (change.to > documentLength) {
			throw new RangeError(`Edit ${index} extends beyond the document.`);
		}
		if (previous && change.from < previous.from) {
			throw new Error('Atomic edits must be sorted by ascending from offset.');
		}
		if (
			previous &&
			(change.from < previous.to ||
				(change.from === previous.from &&
					change.to === change.from &&
					previous.to === previous.from))
		) {
			throw new Error('Atomic edits must not overlap or contain ambiguous co-located insertions.');
		}
		previous = change;
	}

	if (edit.selectionAfter) {
		assertIntegerOffset(edit.selectionAfter.anchor, 'Selection anchor');
		assertIntegerOffset(edit.selectionAfter.head, 'Selection head');
		const resultingLength =
			documentLength +
			edit.edits.reduce(
				(delta, change) => delta + change.insert.length - (change.to - change.from),
				0
			);
		if (
			edit.selectionAfter.anchor > resultingLength ||
			edit.selectionAfter.head > resultingLength
		) {
			throw new RangeError('Atomic edit selection extends beyond the resulting document.');
		}
	}
}

/**
 * Validate and dispatch a complete domain edit as exactly one CM transaction.
 */
export function dispatchAtomicEdit(view: EditorView, edit: AtomicDocumentEdit): void {
	const currentRevision = view.state.field(editorRevisionField);
	validateAtomicEdit(edit, view.state.doc.length, currentRevision);

	view.dispatch({
		changes: edit.edits.map(({ from, to, insert }) => ({ from, to, insert })),
		selection: edit.selectionAfter
			? EditorSelection.single(edit.selectionAfter.anchor, edit.selectionAfter.head)
			: undefined,
		annotations: [Transaction.userEvent.of('input.atomic'), Transaction.addToHistory.of(true)]
	});
}

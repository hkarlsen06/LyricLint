import { EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import type { ChangeDesc, Extension, TransactionSpec } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { PerformerId, TextEdit, TextRange } from '$lib/core/types.js';
import {
	findHeaderRenameTargets,
	isMirrorableHeaderName,
	nameBreaksHeaderStructure
} from '$lib/performers/header-rename.js';
import { decodeLegendText } from '$lib/performers/import.js';
import {
	editorCallbacksField,
	editorComposingField,
	editorContextField,
	parsedDocumentForState
} from './editor-state.js';

/** The performer name currently being edited and the headers mirroring it. */
interface HeaderRenameSession {
	performerId: PerformerId;
	/** The spelling the performer had when this rename began. */
	previousName: string;
	/** The edited occurrence, in current-document coordinates. */
	source: TextRange;
	/** Every mirrored occurrence, in current-document coordinates. */
	targets: TextRange[];
}

/** One applied step of a header rename, reported to the shell. */
interface HeaderRename {
	performerId: PerformerId;
	previousName: string;
	displayName: string;
	/** Number of other headers kept in sync. */
	occurrences: number;
	/** True only for the first step of a rename. */
	started: boolean;
}

function mapRange(range: TextRange, changes: ChangeDesc): TextRange {
	return { from: changes.mapPos(range.from, -1), to: changes.mapPos(range.to, 1) };
}

// Mapped so a session set by this filter follows changes another filter
// appends to the same transaction (legend cleanup pruning a group, say). The
// specs carrying it are `sequential`, so its positions are already in the
// post-edit document and are only mapped through what comes after.
const setHeaderRenameSessionEffect = StateEffect.define<HeaderRenameSession | undefined>({
	map: (session, changes) =>
		session && {
			...session,
			source: mapRange(session.source, changes),
			targets: session.targets.map((target) => mapRange(target, changes))
		}
});
export const headerRenameEffect = StateEffect.define<HeaderRename>();

/**
 * Track the name being renamed instead of re-deriving it from each keystroke.
 *
 * Diffing every transaction on its own would misread a normal edit as a rename
 * whenever the intermediate text happened to match another header. The session
 * pins the performer identity resolved when the rename began and follows it
 * through the changes until the caret leaves the name or an edit lands
 * elsewhere.
 */
export const headerRenameSessionField = StateField.define<HeaderRenameSession | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setHeaderRenameSessionEffect)) {
				return effect.value;
			}
		}
		// A document change that the filter did not claim (an edit elsewhere,
		// undo, redo, or IME composition) ends the rename.
		if (transaction.docChanged || !value) {
			return undefined;
		}
		if (transaction.selection) {
			const head = transaction.selection.main.head;
			return head >= value.source.from && head <= value.source.to ? value : undefined;
		}
		return value;
	}
});

/**
 * The one contiguous region a transaction changed, if there is exactly one.
 *
 * Adjacent changes are reported as a single range, so replacing a selection
 * counts as one edit. Anything genuinely scattered is left alone: a rename is
 * always one localized edit.
 */
export function singleChangedRange(changes: ChangeDesc): TextRange | undefined {
	let range: TextRange | undefined;
	let count = 0;
	changes.iterChangedRanges((fromA, toA) => {
		count += 1;
		range = { from: fromA, to: toA };
	});
	return count === 1 ? range : undefined;
}

function beginSession(state: EditorState, change: TextRange): HeaderRenameSession | undefined {
	const context = state.field(editorContextField, false);
	const roster = context?.performers ?? [];
	if (roster.length === 0) {
		return undefined;
	}

	return findHeaderRenameTargets(parsedDocumentForState(state), roster, change);
}

/**
 * Mirror a performer-name edit from one section header into every other header
 * that names the same performer.
 *
 * The mirrored edits are appended to the transaction that caused them, so the
 * document is never briefly inconsistent, one snapshot is emitted, and one undo
 * restores every header at once, the same contract `legendCleanupFilter` uses.
 * Undo, redo, and IME composition are exempt so history replays byte for byte
 * and composition is never interrupted.
 */
export function headerRenameFilter(): Extension {
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

		const change = singleChangedRange(transaction.changes);
		if (!change) {
			return transaction;
		}

		const active = transaction.startState.field(headerRenameSessionField, false);
		const continues =
			active !== undefined && active.source.from <= change.from && change.to <= active.source.to;
		const session = continues ? active : beginSession(transaction.startState, change);
		if (!session) {
			return transaction;
		}

		// Insertions at either end of the name belong to the name, so the start
		// maps before and the end maps after the inserted text.
		const source = mapRange(session.source, transaction.changes);
		let name = transaction.newDoc.sliceString(source.from, source.to);
		const targets = session.targets
			.map((target) => mapRange(target, transaction.changes))
			.sort((left, right) => left.from - right.from);

		if (nameBreaksHeaderStructure(name)) {
			// The name was never being renamed if it survives whole beside the
			// structure just typed (`Kim, Mara`: a new group in front of it). Put
			// back what the letters before the comma mirrored, then end the rename.
			const kept = name
				.split(/[[\]<>,\n\r]/u)
				.some((piece) => piece.trim() === session.previousName);
			if (!continues || !kept) {
				return transaction;
			}
			name = session.previousName;
		}

		if (!isMirrorableHeaderName(name)) {
			return [
				transaction,
				{
					effects: setHeaderRenameSessionEffect.of({ ...session, source, targets }),
					sequential: true
				}
			];
		}

		const edits: TextEdit[] = [];
		const nextTargets: TextRange[] = [];
		let delta = 0;
		let sourceShift = 0;

		for (const target of targets) {
			if (transaction.newDoc.sliceString(target.from, target.to) !== name) {
				edits.push({ from: target.from, to: target.to, insert: name });
			}
			const from = target.from + delta;
			nextTargets.push({ from, to: from + name.length });
			const growth = name.length - (target.to - target.from);
			delta += growth;
			if (target.to <= source.from) {
				sourceShift += growth;
			}
		}

		const reverted = name !== transaction.newDoc.sliceString(source.from, source.to);
		const effects = [
			setHeaderRenameSessionEffect.of(
				reverted
					? undefined
					: {
							...session,
							source: { from: source.from + sourceShift, to: source.to + sourceShift },
							targets: nextTargets
						}
			),
			headerRenameEffect.of({
				performerId: session.performerId,
				// The roster holds decoded names; the headers keep their own spelling.
				previousName: decodeLegendText(session.previousName),
				displayName: decodeLegendText(name),
				occurrences: targets.length,
				started: !continues
			})
		];
		const mirrored: TransactionSpec =
			edits.length === 0
				? { effects, sequential: true }
				: { changes: edits, sequential: true, effects };
		return [transaction, mirrored];
	});
}

function renameAnnouncement(rename: HeaderRename): string {
	const headers = rename.occurrences === 1 ? 'header' : 'headers';
	return `Renaming ${rename.previousName} in ${rename.occurrences} other ${headers}.`;
}

/** Report applied header renames so the shell can follow them in the roster. */
export function headerRenameNotifier(): Extension {
	return EditorView.updateListener.of((update) => {
		for (const transaction of update.transactions) {
			for (const effect of transaction.effects) {
				if (!effect.is(headerRenameEffect)) {
					continue;
				}
				const callbacks = update.state.field(editorCallbacksField, false);
				if (effect.value.started) {
					callbacks?.onAnnouncement(renameAnnouncement(effect.value));
				}
				callbacks?.onPerformerRenamed?.(effect.value);
			}
		}
	});
}

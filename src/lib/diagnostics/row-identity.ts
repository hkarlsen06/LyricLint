import { ChangeSet, MapMode } from '@codemirror/state';
import type { Diagnostic, EditorSnapshot, TextRange } from '$lib/core/types.js';
import { diagnosticKey } from './order.js';

type RowSnapshot = Pick<EditorSnapshot, 'revision' | 'text' | 'diagnostics' | 'documentChange'>;

interface DiagnosticRowReconciliation {
	keys: ReadonlyMap<string, string>;
	remapped: ReadonlyMap<string, string>;
	mapRange: (range: TextRange) => TextRange | undefined;
}

/** Presentation identity only. Diagnostic/fix keys still name their current ranges. */
export function diagnosticRowSignature(diagnostic: Diagnostic): string {
	return `${diagnosticKey(diagnostic)}:${diagnostic.message}`;
}

/**
 * Keep a row only when the actual transaction carries its unchanged text to a
 * current finding with the same message. Text-search/ordinal matching could
 * give a newly inserted chorus the controls belonging to the original chorus.
 * Missing change metadata deliberately starts fresh on a different document.
 */
export function reconcileDiagnosticRows(
	previous: RowSnapshot,
	next: RowSnapshot,
	previousKeys: ReadonlyMap<string, string>,
	allocate: () => string
): DiagnosticRowReconciliation {
	const change = next.documentChange;
	const changes =
		previous.text !== next.text && change?.baseRevision === previous.revision
			? ChangeSet.of(change.edits, previous.text.length)
			: undefined;
	const mapRange = (range: TextRange): TextRange | undefined => {
		if (previous.text === next.text) return range;
		if (!changes || range.from < 0 || range.to > previous.text.length) return undefined;
		const from = changes.mapPos(range.from, 1, MapMode.TrackAfter);
		const to = range.from === range.to ? from : changes.mapPos(range.to, -1, MapMode.TrackBefore);
		if (
			from === null ||
			to === null ||
			to < from ||
			previous.text.slice(range.from, range.to) !== next.text.slice(from, to)
		)
			return undefined;
		return { from, to };
	};
	const candidates = new Map<string, { id: string; key: string }>();
	for (const diagnostic of previous.diagnostics) {
		const id = previousKeys.get(diagnosticRowSignature(diagnostic));
		if (id === undefined) continue;
		const range = mapRange(diagnostic);
		if (range) {
			candidates.set(diagnosticRowSignature({ ...diagnostic, ...range }), {
				id,
				key: diagnosticKey(diagnostic)
			});
		}
	}
	const keys = new Map<string, string>();
	const remapped = new Map<string, string>();
	for (const diagnostic of next.diagnostics) {
		const signature = diagnosticRowSignature(diagnostic);
		const candidate = candidates.get(signature);
		keys.set(signature, candidate?.id ?? allocate());
		if (candidate) remapped.set(candidate.key, diagnosticKey(diagnostic));
	}
	return { keys, remapped, mapRange };
}

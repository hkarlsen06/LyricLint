import type {
	AtomicDocumentEdit,
	Diagnostic,
	DiagnosticFix,
	EditorSnapshot,
	SerializedSelection,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import { isHarperRuleId } from '$lib/rules/harper-ids.js';

interface ContiguousChange {
	from: number;
	oldTo: number;
	newTo: number;
}

/**
 * Describe one completed edit from the text on either side of it.
 *
 * A normal diagnostic fix is one contiguous replacement. A batch can contain
 * several, in which case this deliberately treats the text between the first
 * and last replacement as changed too: dropping a possibly affected finding
 * is safer than carrying it at a guessed range, while findings outside the
 * batch can still stay put until Harper answers again.
 */
function contiguousChange(previous: string, next: string): ContiguousChange | undefined {
	if (previous === next) return undefined;

	let from = 0;
	const sharedLength = Math.min(previous.length, next.length);
	while (from < sharedLength && previous[from] === next[from]) from += 1;

	let suffix = 0;
	while (
		suffix < previous.length - from &&
		suffix < next.length - from &&
		previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
	) {
		suffix += 1;
	}

	return {
		from,
		oldTo: previous.length - suffix,
		newTo: next.length - suffix
	};
}

function mapRange(range: TextRange, change: ContiguousChange): TextRange | undefined {
	if (range.to <= change.from) return { ...range };
	if (range.from >= change.oldTo) {
		const delta = change.newTo - change.oldTo;
		return { from: range.from + delta, to: range.to + delta };
	}
	return undefined;
}

function mapPoint(point: number, change: ContiguousChange): number | undefined {
	if (point <= change.from) return point;
	if (point >= change.oldTo) return point + change.newTo - change.oldTo;
	return undefined;
}

function mapUnchangedRange(
	range: TextRange,
	change: ContiguousChange,
	previousText: string,
	nextText: string
): TextRange | undefined {
	const mapped = mapRange(range, change);
	if (
		!mapped ||
		previousText.slice(range.from, range.to) !== nextText.slice(mapped.from, mapped.to)
	) {
		return undefined;
	}
	return mapped;
}

function mapSelection(
	selection: SerializedSelection | undefined,
	change: ContiguousChange
): SerializedSelection | undefined {
	if (!selection) return undefined;
	const anchor = mapPoint(selection.anchor, change);
	const head = mapPoint(selection.head, change);
	return anchor === undefined || head === undefined ? undefined : { anchor, head };
}

function mapFix(
	fix: DiagnosticFix,
	change: ContiguousChange,
	revision: number,
	previousText: string,
	nextText: string
): DiagnosticFix | undefined {
	const edits: TextEdit[] = [];
	for (const edit of fix.edit.edits) {
		const mapped = mapUnchangedRange(edit, change, previousText, nextText);
		if (!mapped) return undefined;
		edits.push({ ...mapped, insert: edit.insert });
	}
	const selectionAfter = mapSelection(fix.edit.selectionAfter, change);
	if (fix.edit.selectionAfter && !selectionAfter) return undefined;
	const edit: AtomicDocumentEdit = { ...fix.edit, baseRevision: revision, edits };
	if (selectionAfter) edit.selectionAfter = selectionAfter;
	return { ...fix, edit };
}

/**
 * Keep unaffected Harper findings visible across a completed atomic edit.
 *
 * Native rules answer synchronously, while Harper waits behind its debounce and
 * worker. Without this bridge every fix briefly publishes the native-only list.
 * Findings touched by the edit are dropped; the rest are moved to their new
 * offsets and their fixes are retargeted to the new revision until Harper's
 * authoritative replacement result arrives.
 */
export function carryHarperDiagnosticsAcrossEdit(
	previous: Pick<EditorSnapshot, 'revision' | 'text'>,
	next: Pick<EditorSnapshot, 'revision' | 'text'>,
	diagnostics: readonly Diagnostic[]
): Diagnostic[] {
	const change = contiguousChange(previous.text, next.text);
	if (!change || next.revision <= previous.revision) return [];

	const carried: Diagnostic[] = [];
	diagnosticLoop: for (const diagnostic of diagnostics) {
		if (!isHarperRuleId(diagnostic.ruleId)) continue;
		const range = mapUnchangedRange(diagnostic, change, previous.text, next.text);
		if (!range) continue;

		const sourceRelatedRanges = diagnostic.relatedRanges;
		const relatedRanges: TextRange[] = [];
		for (const related of sourceRelatedRanges ?? []) {
			const mapped = mapUnchangedRange(related, change, previous.text, next.text);
			if (!mapped) continue diagnosticLoop;
			relatedRanges.push(mapped);
		}
		const fixes = diagnostic.fixes
			?.map((fix) => mapFix(fix, change, next.revision, previous.text, next.text))
			.filter((fix): fix is DiagnosticFix => fix !== undefined);

		const moved: Diagnostic = { ...diagnostic, ...range };
		if (sourceRelatedRanges) moved.relatedRanges = relatedRanges;
		if (diagnostic.fixes) moved.fixes = fixes;
		carried.push(moved);
	}
	return carried;
}

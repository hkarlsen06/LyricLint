import { lineNumberAt } from './line-numbers.js';

/** Exact text plus optional exact adjacent context used to identify one range. */
interface TextAnchor {
	exact: string;
	before: string;
	after: string;
	/** 1-based line the exact text begins on, where the author knows one. */
	line?: number | null;
}

type AnchorResolution =
	{ ok: true; from: number; to: number } | { ok: false; reason: 'not-found' | 'ambiguous' };

/**
 * Which copy of an anchor's exact text it resolved to when the anchor was
 * first read, and how many copies there were then. This is our own
 * measurement rather than anything the author said, which is what makes it
 * outrank `line`: a line number is a claim about a document that may since
 * have moved, and the commonest way it moves is an earlier proposal in the
 * same batch being applied above it.
 */
export interface AnchorOccurrence {
	index: number;
	total: number;
}

/** Every occurrence of `exact`, overlapping ones included, in document order. */
function occurrencesOf(document: string, exact: string): Array<{ from: number; to: number }> {
	const occurrences: Array<{ from: number; to: number }> = [];
	let searchFrom = 0;
	while (searchFrom <= document.length - exact.length) {
		const from = document.indexOf(exact, searchFrom);
		if (from === -1) break;
		occurrences.push({ from, to: from + exact.length });
		searchFrom = from + 1;
	}
	return occurrences;
}

/**
 * Pin a resolved anchor to the copy it landed on, so the same anchor can be
 * resolved again later against a document that has moved underneath it.
 */
export function occurrenceAt(
	document: string,
	exact: string,
	from: number
): AnchorOccurrence | undefined {
	if (exact.length === 0) return undefined;
	const occurrences = occurrencesOf(document, exact);
	const index = occurrences.findIndex((occurrence) => occurrence.from === from);
	return index === -1 ? undefined : { index, total: occurrences.length };
}

/**
 * Resolve an anchor without normalizing any part of the document. Context is
 * compared directly beside each exact occurrence and exists only to
 * disambiguate; it never turns a near match into a match — and it never
 * vetoes one either. The model writes `before`/`after` from its reading of
 * the draft and gets a character wrong often enough that consulting context
 * against a unique occurrence turned real edits into "not found", costing a
 * whole extra tool round for a target the exact text had already pinned.
 *
 * `line` is consulted before context and is the only thing that can separate
 * repeated copies of a chorus: a copy repeats its neighbours as well as its
 * words, so `before` and `after` are identical in every copy and the anchor is
 * refused as ambiguous however much context is quoted. A line that narrows to
 * nothing is a number the author got wrong, and falls back to context rather
 * than vetoing — the same rule context itself already follows.
 *
 * `pinned` outranks even the line, and it is what makes a batch of proposals
 * survive its own approvals. A line number is measured against the document
 * the author read; applying the first proposal in a batch moves every line
 * below it, so the second proposal's number narrows to nothing, falls back to
 * context, and — between repeated verses, whose neighbours are identical — is
 * refused as ambiguous. That refusal was the linter invalidating edits it had
 * itself just made correct. The k-th copy is still the k-th copy while there
 * are still the same number of them, so the pin is trusted exactly that far:
 * a changed total means copies were added or removed and the ordinal no
 * longer names the same place, which falls back to the line as before.
 */
export function resolveAnchor(
	document: string,
	anchor: TextAnchor,
	pinned?: AnchorOccurrence
): AnchorResolution {
	// An empty document has exactly one zero-width range. That is the anchor used
	// when the assistant offers to put conversation text into a fresh 'scribe.
	// The same anchor in a non-empty document would name every boundary, so keep
	// refusing it there instead of guessing where an insertion belongs.
	if (anchor.exact.length === 0) {
		return document.length === 0
			? { ok: true, from: 0, to: 0 }
			: { ok: false, reason: 'not-found' };
	}

	const occurrences = occurrencesOf(document, anchor.exact);

	if (occurrences.length === 0) return { ok: false, reason: 'not-found' };
	if (occurrences.length === 1) return { ok: true, ...occurrences[0]! };

	if (pinned && pinned.total === occurrences.length) {
		const copy = occurrences[pinned.index];
		if (copy) return { ok: true, ...copy };
	}

	const onLine =
		typeof anchor.line === 'number'
			? occurrences.filter(({ from }) => lineNumberAt(document, from) === anchor.line)
			: [];
	const candidates = onLine.length > 0 ? onLine : occurrences;
	if (candidates.length === 1) return { ok: true, ...candidates[0]! };

	const disambiguated = candidates.filter(({ from, to }) => {
		const beforeMatches =
			anchor.before.length === 0 ||
			document.slice(Math.max(0, from - anchor.before.length), from) === anchor.before;
		const afterMatches =
			anchor.after.length === 0 || document.slice(to, to + anchor.after.length) === anchor.after;
		return beforeMatches && afterMatches;
	});
	if (disambiguated.length === 1) return { ok: true, ...disambiguated[0]! };
	// Several occurrences and neither the line nor the context picked one of
	// them: the anchor does not name one place, which is what 'ambiguous' means.
	return { ok: false, reason: 'ambiguous' };
}

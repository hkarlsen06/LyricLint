/** Exact text plus optional exact adjacent context used to identify one range. */
export interface TextAnchor {
	exact: string;
	before: string;
	after: string;
	/** 1-based line the exact text begins on, where the author knows one. */
	line?: number | null;
}

export type AnchorResolution =
	{ ok: true; from: number; to: number } | { ok: false; reason: 'not-found' | 'ambiguous' };

/** The 1-based line an offset falls on, counting `\n`, `\r\n`, and a lone `\r`. */
function lineNumberAt(document: string, offset: number): number {
	let line = 1;
	for (let index = 0; index < offset; index++) {
		const code = document.charCodeAt(index);
		if (code === 10) line += 1;
		else if (code === 13 && document.charCodeAt(index + 1) !== 10) line += 1;
	}
	return line;
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
 */
export function resolveAnchor(document: string, anchor: TextAnchor): AnchorResolution {
	if (anchor.exact.length === 0) return { ok: false, reason: 'not-found' };

	const occurrences: Array<{ from: number; to: number }> = [];
	let searchFrom = 0;
	while (searchFrom <= document.length - anchor.exact.length) {
		const from = document.indexOf(anchor.exact, searchFrom);
		if (from === -1) break;
		occurrences.push({ from, to: from + anchor.exact.length });
		searchFrom = from + 1;
	}

	if (occurrences.length === 0) return { ok: false, reason: 'not-found' };
	if (occurrences.length === 1) return { ok: true, ...occurrences[0]! };

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

/** Exact text plus optional exact adjacent context used to identify one range. */
export interface TextAnchor {
	exact: string;
	before: string;
	after: string;
}

export type AnchorResolution =
	{ ok: true; from: number; to: number } | { ok: false; reason: 'not-found' | 'ambiguous' };

/**
 * Resolve an anchor without normalizing any part of the document. Context is
 * compared directly beside each exact occurrence and exists only to
 * disambiguate; it never turns a near match into a match.
 */
export function resolveAnchor(document: string, anchor: TextAnchor): AnchorResolution {
	if (anchor.exact.length === 0) return { ok: false, reason: 'not-found' };

	const matches: Array<{ from: number; to: number }> = [];
	let searchFrom = 0;
	while (searchFrom <= document.length - anchor.exact.length) {
		const from = document.indexOf(anchor.exact, searchFrom);
		if (from === -1) break;
		const to = from + anchor.exact.length;
		const beforeMatches =
			anchor.before.length === 0 ||
			document.slice(from - anchor.before.length, from) === anchor.before;
		const afterMatches =
			anchor.after.length === 0 || document.slice(to, to + anchor.after.length) === anchor.after;
		if (beforeMatches && afterMatches) matches.push({ from, to });
		searchFrom = from + 1;
	}

	if (matches.length === 0) return { ok: false, reason: 'not-found' };
	if (matches.length > 1) return { ok: false, reason: 'ambiguous' };
	return { ok: true, ...matches[0]! };
}

import { alignBodies } from './link-shape.js';
import type { TextEdit } from './types.js';

/**
 * A word-level comparison in document order. Shared segments carry context;
 * changed segments keep the deletion and insertion together so a renderer can
 * draw the same del/ins pair that becomes one `TextEdit`.
 */
export type WordDiffSegment =
	{ kind: 'shared'; text: string } | { kind: 'change'; deleted: string; inserted: string };

function divergentRuns(oldText: string, newText: string) {
	const [oldRuns = [], newRuns = []] = alignBodies([oldText, newText]);
	return { oldRuns, newRuns };
}

/**
 * Compare two strings using the chorus-link aligner's word-and-newline LCS.
 * Divergent runs become replacement edits at offsets in `oldText`.
 */
export function diffWords(oldText: string, newText: string): TextEdit[] {
	const { oldRuns, newRuns } = divergentRuns(oldText, newText);
	return oldRuns.map((range, index) => {
		const replacement = newRuns[index];
		return {
			from: range.from,
			to: range.to,
			insert: replacement ? newText.slice(replacement.from, replacement.to) : ''
		};
	});
}

/** The same comparison expanded with the shared text needed around each edit. */
export function wordDiffSegments(oldText: string, newText: string): WordDiffSegment[] {
	const { oldRuns, newRuns } = divergentRuns(oldText, newText);
	if (oldRuns.length === 0) {
		return oldText.length === 0 ? [] : [{ kind: 'shared', text: oldText }];
	}

	const segments: WordDiffSegment[] = [];
	let oldEnd = 0;
	for (let index = 0; index < oldRuns.length; index += 1) {
		const oldRun = oldRuns[index];
		const newRun = newRuns[index];
		if (!oldRun || !newRun) continue;
		const shared = oldText.slice(oldEnd, oldRun.from);
		if (shared) segments.push({ kind: 'shared', text: shared });
		segments.push({
			kind: 'change',
			deleted: oldText.slice(oldRun.from, oldRun.to),
			inserted: newText.slice(newRun.from, newRun.to)
		});
		oldEnd = oldRun.to;
	}
	const trailing = oldText.slice(oldEnd);
	if (trailing) segments.push({ kind: 'shared', text: trailing });

	// The alignment invariant says the shared text is identical in both members.
	// Reading the second member here makes a broken invariant fail locally rather
	// than letting a UI render a comparison that cannot reconstruct its input.
	const reconstructedNew = segments
		.map((segment) => (segment.kind === 'shared' ? segment.text : segment.inserted))
		.join('');
	if (reconstructedNew !== newText) {
		return [{ kind: 'change', deleted: oldText, inserted: newText }];
	}
	return segments;
}

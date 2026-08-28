import { alignBodies } from './link-shape.js';
import type { TextEdit } from './types.js';

/*
 * The chorus-link aligner's word-and-newline LCS, exposed as replacement
 * edits. Rendering diffs live in `char-diff.ts` — one flat character
 * comparison is what the Compare dialog and the assistant's cards draw — but
 * the assistant's applied edits stay word-run shaped: the aligner already
 * owns "which words changed", and an edit does not need to be minimal to be
 * correct, only value-equal after applying.
 */

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

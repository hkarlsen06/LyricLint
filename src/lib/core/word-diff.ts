import { alignBodies } from './link-shape.js';
import type { TextEdit } from './types.js';

/**
 * A comparison in document order. Shared segments carry context; changed
 * segments keep the deletion and insertion together so a renderer can draw
 * them as one del/ins pair. Segments are character-precise: the word-run
 * alignment finds where the texts diverge, and each divergent run is then
 * trimmed to the characters that actually differ — `Lyne` against `Line`
 * reads `L[y→i]ne`, not two whole words. That is the diff Genius draws in
 * its own compare view, and the granularity transcribers read.
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

function isHighSurrogate(code: number): boolean {
	return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
	return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Length of the common prefix, never ending inside a surrogate pair: two
 * emoji sharing a high surrogate differ as whole characters, so the trim
 * backs off rather than splitting one between shared and changed text.
 */
function commonPrefixLength(oldText: string, newText: string): number {
	const max = Math.min(oldText.length, newText.length);
	let length = 0;
	while (length < max && oldText.charCodeAt(length) === newText.charCodeAt(length)) {
		length += 1;
	}
	if (length > 0 && isHighSurrogate(oldText.charCodeAt(length - 1))) length -= 1;
	return length;
}

/** The suffix twin, over the text past the already-claimed prefix. */
function commonSuffixLength(oldText: string, newText: string): number {
	const max = Math.min(oldText.length, newText.length);
	let length = 0;
	while (
		length < max &&
		oldText.charCodeAt(oldText.length - 1 - length) ===
			newText.charCodeAt(newText.length - 1 - length)
	) {
		length += 1;
	}
	if (length > 0 && isLowSurrogate(oldText.charCodeAt(oldText.length - length))) length -= 1;
	return length;
}

/**
 * Trim a divergent run to the characters that differ. Edges only: a run that
 * still differs after the trim is a rewrite, and hunting shared letters
 * inside one ("lov[e]" aligned to "fri[e]nd") is confetti, not a diff.
 * Whitespace the aligner left on a run's edge is handed back to shared text
 * by the same trim, since a space is a character like any other.
 */
function refineChange(deleted: string, inserted: string): WordDiffSegment[] {
	const prefix = commonPrefixLength(deleted, inserted);
	const suffix = commonSuffixLength(deleted.slice(prefix), inserted.slice(prefix));
	const segments: WordDiffSegment[] = [];
	if (prefix > 0) segments.push({ kind: 'shared', text: deleted.slice(0, prefix) });
	const midDeleted = deleted.slice(prefix, deleted.length - suffix);
	const midInserted = inserted.slice(prefix, inserted.length - suffix);
	if (midDeleted.length > 0 || midInserted.length > 0) {
		segments.push({ kind: 'change', deleted: midDeleted, inserted: midInserted });
	}
	if (suffix > 0) segments.push({ kind: 'shared', text: deleted.slice(deleted.length - suffix) });
	return segments;
}

/** The same comparison expanded with the shared text needed around each edit. */
export function wordDiffSegments(oldText: string, newText: string): WordDiffSegment[] {
	const { oldRuns, newRuns } = divergentRuns(oldText, newText);
	if (oldRuns.length === 0) {
		return oldText.length === 0 ? [] : [{ kind: 'shared', text: oldText }];
	}

	const segments: WordDiffSegment[] = [];
	const push = (segment: WordDiffSegment): void => {
		const previous = segments[segments.length - 1];
		if (segment.kind === 'shared' && previous?.kind === 'shared') {
			previous.text += segment.text;
			return;
		}
		segments.push(segment);
	};
	let oldEnd = 0;
	for (let index = 0; index < oldRuns.length; index += 1) {
		const oldRun = oldRuns[index];
		const newRun = newRuns[index];
		if (!oldRun || !newRun) continue;
		const shared = oldText.slice(oldEnd, oldRun.from);
		if (shared) push({ kind: 'shared', text: shared });
		for (const refined of refineChange(
			oldText.slice(oldRun.from, oldRun.to),
			newText.slice(newRun.from, newRun.to)
		)) {
			push(refined);
		}
		oldEnd = oldRun.to;
	}
	const trailing = oldText.slice(oldEnd);
	if (trailing) push({ kind: 'shared', text: trailing });

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

/*
 * One flat character comparison over whole texts, newlines included — the
 * shape Genius draws its edit diffs in, which is the display transcribers
 * reviewing lyrics already read fluently. Aligning lines first and comparing
 * within them was the tempting substitute, and it drew a different picture at
 * every altitude: a varied refrain line became a struck line plus an added
 * line, and a split line became a removal — where the flat pass shows the
 * ad-lib struck in place and the split as words that simply moved down a row.
 *
 * The pipeline is the classic one: trim the common ends, Myers over the
 * middle, then two cleanups. Edits slide to the friendliest boundary (a line
 * break beats the middle of a word), and shared scraps too short to mean
 * anything fold back into the changes around them, so a rewrite reads as one
 * strike and one insertion rather than confetti of coincidental letters.
 */

/**
 * A comparison in document order. Shared segments carry context; changed
 * segments keep the deletion and insertion together so a renderer can draw
 * them as one del/ins pair. Either half of a change may be empty.
 */
export type DiffSegment =
	{ kind: 'shared'; text: string } | { kind: 'change'; deleted: string; inserted: string };

type DiffOp = 'eq' | 'del' | 'ins';

interface DiffRun {
	op: DiffOp;
	text: string;
}

/**
 * Myers gives up past this many edited characters and the middle reports as
 * whole lines instead — with a full replacement as the last resort, which is
 * also the honest answer for a paste of something else entirely. The bound is
 * what keeps the backtrack trace's memory finite.
 */
const MAX_EDIT_DISTANCE = 1500;

/** Past this many characters in the trimmed middle, diff lines, not characters. */
const MAX_CHAR_TEXT = 40_000;

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
 * Shortest-edit-script ops via Myers' greedy algorithm, or undefined past
 * `maxD`. Generic over indices so the line fallback rides the same
 * implementation as the character pass.
 */
function myersOps(
	oldLength: number,
	newLength: number,
	equal: (oldIndex: number, newIndex: number) => boolean,
	maxD: number
): DiffOp[] | undefined {
	const max = Math.min(oldLength + newLength, maxD);
	const offset = max;
	const v = new Int32Array(2 * max + 1);
	const trace: Int32Array[] = [];
	let found = -1;
	for (let d = 0; d <= max && found < 0; d += 1) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x =
				k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1])
					? v[offset + k + 1]
					: v[offset + k - 1] + 1;
			let y = x - k;
			while (x < oldLength && y < newLength && equal(x, y)) {
				x += 1;
				y += 1;
			}
			v[offset + k] = x;
			if (x >= oldLength && y >= newLength) {
				found = d;
				break;
			}
		}
	}
	if (found < 0) return undefined;

	const ops: DiffOp[] = [];
	let x = oldLength;
	let y = newLength;
	for (let d = found; d > 0; d -= 1) {
		// trace[d] is the frontier after depth d-1 — the state the forward pass
		// decided from, so the backtrack re-decides identically.
		const previous = trace[d];
		const k = x - y;
		const cameDown = k === -d || (k !== d && previous[offset + k - 1] < previous[offset + k + 1]);
		const previousK = cameDown ? k + 1 : k - 1;
		const previousX = previous[offset + previousK];
		const previousY = previousX - previousK;
		while (x > previousX && y > previousY) {
			ops.push('eq');
			x -= 1;
			y -= 1;
		}
		if (cameDown) {
			ops.push('ins');
			y -= 1;
		} else {
			ops.push('del');
			x -= 1;
		}
	}
	while (x > 0 && y > 0) {
		ops.push('eq');
		x -= 1;
		y -= 1;
	}
	ops.reverse();
	return ops;
}

/** Batch per-index ops into text runs over the two source strings. */
function opsToCharRuns(ops: readonly DiffOp[], oldText: string, newText: string): DiffRun[] {
	const runs: DiffRun[] = [];
	let oldIndex = 0;
	let newIndex = 0;
	let runStartOld = 0;
	let runStartNew = 0;
	let runOp: DiffOp | undefined;
	const flush = (): void => {
		if (!runOp) return;
		const text =
			runOp === 'ins' ? newText.slice(runStartNew, newIndex) : oldText.slice(runStartOld, oldIndex);
		if (text.length > 0) runs.push({ op: runOp, text });
	};
	for (const op of ops) {
		if (op !== runOp) {
			flush();
			runOp = op;
			runStartOld = oldIndex;
			runStartNew = newIndex;
		}
		if (op !== 'ins') oldIndex += 1;
		if (op !== 'del') newIndex += 1;
	}
	flush();
	return runs;
}

/** Lines with their newlines attached, so joining tokens reconstructs exactly. */
function splitKeepingNewlines(text: string): string[] {
	return text.length === 0 ? [] : text.split(/(?<=\n)/);
}

/**
 * Merge adjacent runs and normalise every change cluster to deletion before
 * insertion — the reading order of a change, and what pairs the two halves
 * into one del/ins segment later.
 */
function mergeRuns(runs: readonly DiffRun[]): DiffRun[] {
	const merged: DiffRun[] = [];
	let deleted = '';
	let inserted = '';
	const flush = (): void => {
		if (deleted.length > 0) merged.push({ op: 'del', text: deleted });
		if (inserted.length > 0) merged.push({ op: 'ins', text: inserted });
		deleted = '';
		inserted = '';
	};
	for (const run of runs) {
		if (run.op === 'eq') {
			flush();
			const previous = merged[merged.length - 1];
			if (previous?.op === 'eq') previous.text += run.text;
			else if (run.text.length > 0) merged.push({ op: 'eq', text: run.text });
		} else if (run.op === 'del') {
			deleted += run.text;
		} else {
			inserted += run.text;
		}
	}
	flush();
	return merged;
}

/**
 * Fold equalities shorter than the changes on both sides of them back into
 * those changes (diff-match-patch's semantic cleanup). This is what turns a
 * rewrite's coincidental shared letters — the "e" that "love" and "friend"
 * happen to agree on — back into one strike and one insertion.
 */
function semanticCleanup(runs: DiffRun[]): DiffRun[] {
	let current = runs;
	let folded = true;
	while (folded) {
		folded = false;
		const next: DiffRun[] = [];
		for (let index = 0; index < current.length; index += 1) {
			const run = current[index];
			if (run.op !== 'eq') {
				next.push(run);
				continue;
			}
			let deletedBefore = 0;
			let insertedBefore = 0;
			for (let back = next.length - 1; back >= 0 && next[back].op !== 'eq'; back -= 1) {
				if (next[back].op === 'del') deletedBefore += next[back].text.length;
				else insertedBefore += next[back].text.length;
			}
			let deletedAfter = 0;
			let insertedAfter = 0;
			for (
				let ahead = index + 1;
				ahead < current.length && current[ahead].op !== 'eq';
				ahead += 1
			) {
				if (current[ahead].op === 'del') deletedAfter += current[ahead].text.length;
				else insertedAfter += current[ahead].text.length;
			}
			const before = Math.max(deletedBefore, insertedBefore);
			const after = Math.max(deletedAfter, insertedAfter);
			if (before > 0 && after > 0 && run.text.length <= before && run.text.length <= after) {
				next.push({ op: 'del', text: run.text }, { op: 'ins', text: run.text });
				folded = true;
			} else {
				next.push(run);
			}
		}
		current = mergeRuns(next);
	}
	return current;
}

/**
 * How good a cut between these two texts is, after diff-match-patch's
 * boundary scoring: edges beat blank lines beat line breaks beat sentence
 * ends beat whitespace beat punctuation beat the middle of a word.
 */
function boundaryScore(one: string, two: string): number {
	if (one.length === 0 || two.length === 0) return 6;
	const charBefore = one[one.length - 1];
	const charAfter = two[0];
	const nonAlphaBefore = /[^\p{L}\p{N}]/u.test(charBefore);
	const nonAlphaAfter = /[^\p{L}\p{N}]/u.test(charAfter);
	const whitespaceBefore = nonAlphaBefore && /\s/.test(charBefore);
	const whitespaceAfter = nonAlphaAfter && /\s/.test(charAfter);
	const lineBreakBefore = whitespaceBefore && charBefore === '\n';
	const lineBreakAfter = whitespaceAfter && charAfter === '\n';
	if ((lineBreakBefore && /\n\s*\n$/.test(one)) || (lineBreakAfter && /^\n\s*\n/.test(two))) {
		return 5;
	}
	if (lineBreakBefore || lineBreakAfter) return 4;
	if (nonAlphaBefore && !whitespaceBefore && whitespaceAfter) return 3;
	if (whitespaceBefore || whitespaceAfter) return 2;
	if (nonAlphaBefore || nonAlphaAfter) return 1;
	return 0;
}

/**
 * Slide each single-sided edit between two equalities to its best-scoring
 * position (diff-match-patch's lossless cleanup). This is what turns
 * "One\nT[wo\nT]hree" — a correct diff nobody can read — into "[Two\n]",
 * a whole added line.
 */
function shiftRuns(runs: DiffRun[]): DiffRun[] {
	for (let index = 1; index < runs.length - 1; index += 1) {
		const previous = runs[index - 1];
		const run = runs[index];
		const following = runs[index + 1];
		if (previous.op !== 'eq' || run.op === 'eq' || following.op !== 'eq') continue;

		let before = previous.text;
		let middle = run.text;
		let after = following.text;
		while (before.length > 0 && before[before.length - 1] === middle[middle.length - 1]) {
			after = before[before.length - 1] + after;
			middle = before[before.length - 1] + middle.slice(0, -1);
			before = before.slice(0, -1);
		}
		let bestBefore = before;
		let bestMiddle = middle;
		let bestAfter = after;
		let bestScore = boundaryScore(before, middle) + boundaryScore(middle, after);
		while (after.length > 0 && middle[0] === after[0]) {
			const shifted = middle[0];
			before += shifted;
			middle = middle.slice(1) + shifted;
			after = after.slice(1);
			const score = boundaryScore(before, middle) + boundaryScore(middle, after);
			if (score >= bestScore) {
				bestScore = score;
				bestBefore = before;
				bestMiddle = middle;
				bestAfter = after;
			}
		}
		previous.text = bestBefore;
		run.text = bestMiddle;
		following.text = bestAfter;
	}
	return mergeRuns(runs);
}

/** Pair del/ins clusters into change segments, equalities into shared text. */
function runsToSegments(runs: readonly DiffRun[]): DiffSegment[] {
	const segments: DiffSegment[] = [];
	let deleted = '';
	let inserted = '';
	const flush = (): void => {
		if (deleted.length > 0 || inserted.length > 0) {
			segments.push({ kind: 'change', deleted, inserted });
			deleted = '';
			inserted = '';
		}
	};
	for (const run of runs) {
		if (run.op === 'eq') {
			flush();
			segments.push({ kind: 'shared', text: run.text });
		} else if (run.op === 'del') {
			deleted += run.text;
		} else {
			inserted += run.text;
		}
	}
	flush();
	return segments;
}

/**
 * A character diff can legally split a surrogate pair — two emoji share their
 * high surrogate — and a shared half-character renders as garbage. Move the
 * stranded half into the neighbouring change, where it exists on both sides.
 */
function fixSurrogateBoundaries(segments: DiffSegment[]): DiffSegment[] {
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (segment.kind !== 'change') continue;
		const previous = segments[index - 1];
		if (
			previous?.kind === 'shared' &&
			isHighSurrogate(previous.text.charCodeAt(previous.text.length - 1))
		) {
			const moved = previous.text[previous.text.length - 1];
			previous.text = previous.text.slice(0, -1);
			segment.deleted = moved + segment.deleted;
			segment.inserted = moved + segment.inserted;
		}
		const following = segments[index + 1];
		if (following?.kind === 'shared' && isLowSurrogate(following.text.charCodeAt(0))) {
			const moved = following.text[0];
			following.text = following.text.slice(1);
			segment.deleted += moved;
			segment.inserted += moved;
		}
	}
	return segments.filter((segment) => segment.kind === 'change' || segment.text.length > 0);
}

/** Runs over the trimmed middle: characters, then lines, then a replacement. */
function middleRuns(oldText: string, newText: string): DiffRun[] {
	if (oldText.length === 0 && newText.length === 0) return [];
	if (oldText.length === 0) return [{ op: 'ins', text: newText }];
	if (newText.length === 0) return [{ op: 'del', text: oldText }];

	if (oldText.length + newText.length <= MAX_CHAR_TEXT) {
		const ops = myersOps(
			oldText.length,
			newText.length,
			(oldIndex, newIndex) => oldText.charCodeAt(oldIndex) === newText.charCodeAt(newIndex),
			MAX_EDIT_DISTANCE
		);
		if (ops) return opsToCharRuns(ops, oldText, newText);
	}

	const oldLines = splitKeepingNewlines(oldText);
	const newLines = splitKeepingNewlines(newText);
	const ops = myersOps(
		oldLines.length,
		newLines.length,
		(oldIndex, newIndex) => oldLines[oldIndex] === newLines[newIndex],
		MAX_EDIT_DISTANCE
	);
	if (ops) {
		const runs: DiffRun[] = [];
		let oldIndex = 0;
		let newIndex = 0;
		for (const op of ops) {
			const text = op === 'ins' ? newLines[newIndex] : oldLines[oldIndex];
			runs.push({ op, text });
			if (op !== 'ins') oldIndex += 1;
			if (op !== 'del') newIndex += 1;
		}
		return runs;
	}

	return [
		{ op: 'del', text: oldText },
		{ op: 'ins', text: newText }
	];
}

/** The flat character comparison, cleaned up for reading. */
export function charDiffSegments(oldText: string, newText: string): DiffSegment[] {
	if (oldText === newText) {
		return oldText.length === 0 ? [] : [{ kind: 'shared', text: oldText }];
	}
	const prefix = commonPrefixLength(oldText, newText);
	const suffix = commonSuffixLength(oldText.slice(prefix), newText.slice(prefix));
	const runs: DiffRun[] = [];
	if (prefix > 0) runs.push({ op: 'eq', text: oldText.slice(0, prefix) });
	runs.push(
		...middleRuns(
			oldText.slice(prefix, oldText.length - suffix),
			newText.slice(prefix, newText.length - suffix)
		)
	);
	if (suffix > 0) runs.push({ op: 'eq', text: oldText.slice(oldText.length - suffix) });
	return fixSurrogateBoundaries(runsToSegments(shiftRuns(semanticCleanup(mergeRuns(runs)))));
}

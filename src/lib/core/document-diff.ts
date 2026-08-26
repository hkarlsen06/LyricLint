import { scanAnnotations } from './annotations.js';
import { INVISIBLE_CHARACTERS } from './invisible-characters.js';
import { isSectionHeaderLine } from './parser.js';
import { wordDiffSegments, type WordDiffSegment } from './word-diff.js';

/*
 * The comparison behind the toolbar's Compare dialog: the page's lyrics as the
 * user pasted them against the document as it stands. It lives in `core`
 * because it is arithmetic over two strings — no CodeMirror, no shell — and
 * because the intra-line half is `wordDiffSegments`, which is already here.
 *
 * Two consumers have to agree about what a difference *is*: the dialog that
 * draws a hunk, and the press that selects the hunk's range in the editor. So
 * every hunk carries its own current-document offsets, computed here where the
 * line walk already knows them, rather than re-derived by the surface.
 */

/**
 * One row of a hunk's display, in reading order. Every row except `gap`
 * carries `at`, the current-document offset a press on it parks the caret at —
 * computed here, where the line walk already knows the offsets, so the dialog
 * and the editor cannot disagree about where a line is.
 */
export type DiffRow =
	/**
	 * An unchanged current-document line shown for orientation: the section
	 * header the change sings under, one neighbouring line to each side, and
	 * any kept line between two coalesced changes. This is a lyric diff, and a
	 * bare changed line with no header over it answers "what changed" while
	 * refusing "where in the song".
	 */
	| { kind: 'context'; text: string; line: number; at: number }
	/** Lines omitted between the section header and the nearest neighbour. */
	| { kind: 'gap' }
	/** A line the baseline has and the current document does not. */
	| { kind: 'removed'; text: string; at: number }
	/** A line the current document has and the baseline does not. */
	| { kind: 'added'; text: string; line: number; at: number }
	/** A line present in both, rewritten in part: word-level del/ins pairs. */
	| { kind: 'changed'; segments: readonly WordDiffSegment[]; line: number; at: number };

interface DiffHunk {
	/** 1-based line number in the current document where the hunk sits. */
	line: number;
	/**
	 * Offsets into the current document for the press that reveals the hunk.
	 * A hunk that only removes lines has nothing of its own in the current
	 * document, so the range collapses to the point the removal left behind.
	 */
	from: number;
	to: number;
	rows: readonly DiffRow[];
	/**
	 * Sentences for differences the rows cannot show at reading size — trailing
	 * whitespace, doubled spaces, invisible characters, quote marks that fold to
	 * the same glyph. A red line and a green line that render identically read
	 * as a broken diff; the sentence is what carries those changes.
	 */
	notes: readonly string[];
}

interface DocumentDiff {
	/** The two texts are byte-identical; `hunks` is empty. */
	identical: boolean;
	hunks: readonly DiffHunk[];
	/** Line counts for the dialog's summary, in the hunks' own terms. */
	changedLines: number;
	addedLines: number;
	removedLines: number;
}

type LineOp = 'same' | 'removed' | 'added';

/**
 * Past this many lines on both sides of the trimmed middle, the LCS table stops
 * being worth its memory and the whole region is reported as one replacement —
 * which is also the honest answer for a paste of something else entirely.
 */
const LCS_LIMIT = 3000;

/** Ops over baseline and current lines, in document order. */
function diffLines(baseline: readonly string[], current: readonly string[]): LineOp[] {
	// Common prefix and suffix come off first: an ordinary review changes a
	// handful of lines in a song, and the table should only cover the middle.
	let start = 0;
	while (start < baseline.length && start < current.length && baseline[start] === current[start]) {
		start += 1;
	}
	let baseEnd = baseline.length;
	let currentEnd = current.length;
	while (
		baseEnd > start &&
		currentEnd > start &&
		baseline[baseEnd - 1] === current[currentEnd - 1]
	) {
		baseEnd -= 1;
		currentEnd -= 1;
	}

	const midBase = baseline.slice(start, baseEnd);
	const midCurrent = current.slice(start, currentEnd);
	const ops: LineOp[] = new Array(start).fill('same');

	if (midBase.length > LCS_LIMIT && midCurrent.length > LCS_LIMIT) {
		ops.push(...new Array<LineOp>(midBase.length).fill('removed'));
		ops.push(...new Array<LineOp>(midCurrent.length).fill('added'));
	} else {
		ops.push(...lcsOps(midBase, midCurrent));
	}

	ops.push(...new Array<LineOp>(baseline.length - baseEnd).fill('same'));
	return ops;
}

/** Standard LCS backtrack, removals before insertions inside a changed region. */
function lcsOps(baseline: readonly string[], current: readonly string[]): LineOp[] {
	const rows = baseline.length + 1;
	const cols = current.length + 1;
	const table = new Uint32Array(rows * cols);
	for (let i = baseline.length - 1; i >= 0; i -= 1) {
		for (let j = current.length - 1; j >= 0; j -= 1) {
			table[i * cols + j] =
				baseline[i] === current[j]
					? table[(i + 1) * cols + j + 1] + 1
					: Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
		}
	}

	const ops: LineOp[] = [];
	let i = 0;
	let j = 0;
	while (i < baseline.length && j < current.length) {
		if (baseline[i] === current[j]) {
			ops.push('same');
			i += 1;
			j += 1;
		} else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
			ops.push('removed');
			i += 1;
		} else {
			ops.push('added');
			j += 1;
		}
	}
	while (i < baseline.length) {
		ops.push('removed');
		i += 1;
	}
	while (j < current.length) {
		ops.push('added');
		j += 1;
	}
	return ops;
}

const QUOTE_FOLDS = new Map<string, string>([
	['‘', "'"],
	['’', "'"],
	['‚', "'"],
	['“', '"'],
	['”', '"'],
	['„', '"']
]);

function foldQuotes(text: string): string {
	return text.replace(/[‘’‚“”„]/g, (mark) => QUOTE_FOLDS.get(mark) ?? mark);
}

function hasTypographicQuote(text: string): boolean {
	return /[‘’‚“”„]/.test(text);
}

function capitalize(sentence: string): string {
	return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

function stripInvisibles(text: string): string {
	let out = text;
	for (const character of INVISIBLE_CHARACTERS.keys()) {
		out = out.split(character).join('');
	}
	return out;
}

/**
 * Sentences for one changed segment. Each detector covers a difference the
 * rendered del/ins pair cannot show at reading size; a segment that rewrites
 * real words says nothing here, because the rows already show it.
 *
 * Whether a whitespace-only change is trailing depends on where the segment
 * sits, so the caller says whether this one closes the line. The aligner hands
 * whitespace common to both sides back to the shared text, which is why the
 * comparison here is on emptiness rather than on collapsing runs — by the time
 * a doubled space reaches a segment, the shared single space is already gone
 * from both sides of it.
 */
function describeSegment(deleted: string, inserted: string, closesLine: boolean): string[] {
	const notes: string[] = [];

	for (const [character, entry] of INVISIBLE_CHARACTERS) {
		const wasThere = deleted.includes(character);
		const isThere = inserted.includes(character);
		if (wasThere && !isThere) {
			// A clean swap for the character's own replacement is the commonest
			// shape — it is what the safe fix writes — and "removed" would leave
			// the space it became unaccounted for.
			const swapped = deleted.split(character).join(entry.replacement);
			notes.push(
				entry.replacement && swapped === inserted
					? `${capitalize(entry.description)} became a normal space`
					: `Removed ${entry.description}`
			);
		}
		if (!wasThere && isThere) notes.push(`Added ${entry.description}`);
	}
	// An invisible character is the whole story of its segment: what is left
	// after stripping it is spacing the notes above already account for, and
	// comparing the leftovers would report a space nobody added.
	if (notes.length > 0) return notes;

	const deletedVisible = stripInvisibles(deleted);
	const insertedVisible = stripInvisibles(inserted);
	if (deletedVisible === insertedVisible) return notes;

	if (foldQuotes(deletedVisible) === foldQuotes(insertedVisible)) {
		notes.push(
			hasTypographicQuote(insertedVisible)
				? 'Straight quote marks became typographic ones'
				: 'Typographic quote marks became straight ones'
		);
	}

	// The aligner is greedy at run edges, so a spacing change can arrive
	// wearing the words around it — " world again" against "world again" —
	// which is why the comparison strips every space rather than testing for
	// whitespace-only segments.
	const deletedWords = deletedVisible.replace(/\s+/g, '');
	const insertedWords = insertedVisible.replace(/\s+/g, '');
	if (deletedWords === insertedWords) {
		const tightened =
			deletedVisible.length - deletedWords.length > insertedVisible.length - insertedWords.length;
		if (deletedWords === '' && closesLine) {
			notes.push(tightened ? 'Trailing whitespace removed' : 'Trailing whitespace added');
		} else {
			notes.push(
				tightened ? 'Extra space between words removed' : 'Extra space between words added'
			);
		}
	}

	return notes;
}

/** Sentences for a changed line pair. */
function describePair(baseline: string, current: string): string[] {
	const notes: string[] = [];
	const segments = wordDiffSegments(baseline, current);
	for (let index = 0; index < segments.length; index += 1) {
		const segment = segments[index];
		if (segment.kind !== 'change') continue;
		notes.push(
			...describeSegment(segment.deleted, segment.inserted, index === segments.length - 1)
		);
	}
	return notes;
}

/**
 * Changes this close together share one hunk. A hunk draws one unchanged
 * neighbour to each side, so two changes separated by up to this many kept
 * lines would draw the entire gap anyway — split across two cards, with the
 * section header and its ellipsis printed a second time over the lower one.
 * Coalesced, the kept lines appear once, as context between the changes.
 */
const COALESCE_GAP = 2;

/** One contiguous changed region inside a hunk. */
interface ChangePart {
	kind: 'change';
	removed: string[];
	added: string[];
	/** Index into `currentStarts` of the first current line the part covers. */
	firstCurrentLine: number;
}

/** A kept line between two changed regions close enough to share a hunk. */
interface ContextPart {
	kind: 'context';
	lineIndex: number;
}

interface PendingHunk {
	/** In document order; always opens and closes with a change. */
	parts: (ChangePart | ContextPart)[];
	/** Index into `currentStarts` of the first current line the hunk covers. */
	firstCurrentLine: number;
}

/** Compare the pasted baseline against the current document, hunk by hunk. */
export function diffDocuments(baseline: string, current: string): DocumentDiff {
	if (baseline === current) {
		return { identical: true, hunks: [], changedLines: 0, addedLines: 0, removedLines: 0 };
	}

	const baselineLines = baseline.split('\n');
	const currentLines = current.split('\n');
	// Start offset of each current line, plus one past the end so a removal
	// after the last line still has a point to collapse to.
	const currentStarts: number[] = [0];
	for (const line of currentLines) {
		currentStarts.push(currentStarts[currentStarts.length - 1] + line.length + 1);
	}
	// A multi-line annotation's opening line reads as a header from its own
	// text alone; the spans are what let the orientation walk skip it.
	const currentAnnotations = scanAnnotations(current);

	const ops = diffLines(baselineLines, currentLines);
	const hunks: DiffHunk[] = [];
	let changedLines = 0;
	let addedLines = 0;
	let removedLines = 0;

	let pending: PendingHunk | undefined;
	let baseIndex = 0;
	let currentIndex = 0;

	const closePending = (): void => {
		if (!pending) return;
		const { parts, firstCurrentLine } = pending;
		pending = undefined;
		// The parts open and close with a change: kept lines only enter when
		// another change follows them, and the run past the last change stays in
		// the gap buffer, which is never flushed here.
		const lastChange = parts[parts.length - 1];
		if (lastChange?.kind !== 'change') return;

		const lineEnd = (lineIndex: number): number =>
			currentStarts[lineIndex] + (currentLines[lineIndex]?.length ?? 0);
		const collapsePoint = (lineIndex: number): number =>
			Math.min(currentStarts[lineIndex] ?? current.length, current.length);
		const from = collapsePoint(firstCurrentLine);
		const to =
			lastChange.added.length === 0
				? collapsePoint(lastChange.firstCurrentLine)
				: Math.min(
						lineEnd(lastChange.firstCurrentLine + lastChange.added.length - 1),
						current.length
					);

		const rows: DiffRow[] = [];
		const notes: string[] = [];
		const contextRow = (lineIndex: number): DiffRow => ({
			kind: 'context',
			text: currentLines[lineIndex],
			line: lineIndex + 1,
			at: currentStarts[lineIndex]
		});

		// Above the change: the section header it sings under, an ellipsis where
		// lyrics are skipped, and the immediate neighbour. Where the neighbour is
		// the header, one row is all three.
		//
		// A blank neighbour is dropped rather than drawn: "(blank line)" as
		// orientation orients nobody, and the placeholder is only owed where a
		// blank line is itself the change. Blank lines do not earn the ellipsis
		// either — an ⋯ standing for nothing but the spacing between sections
		// reads as lyrics being hidden.
		const isBlank = (lineIndex: number): boolean => currentLines[lineIndex].trim().length === 0;
		const neighbourAbove = firstCurrentLine - 1;
		if (neighbourAbove >= 0) {
			let headerIndex = -1;
			for (let lineIndex = neighbourAbove; lineIndex >= 0; lineIndex -= 1) {
				if (
					isSectionHeaderLine(currentLines[lineIndex], {
						annotations: currentAnnotations,
						lineFrom: currentStarts[lineIndex] ?? 0
					})
				) {
					headerIndex = lineIndex;
					break;
				}
			}
			const neighbourShown = !isBlank(neighbourAbove) && headerIndex !== neighbourAbove;
			if (headerIndex >= 0) {
				rows.push(contextRow(headerIndex));
				const boundary = neighbourShown ? neighbourAbove : firstCurrentLine;
				let skippedLyrics = false;
				for (let lineIndex = headerIndex + 1; lineIndex < boundary; lineIndex += 1) {
					if (!isBlank(lineIndex)) skippedLyrics = true;
				}
				if (skippedLyrics) rows.push({ kind: 'gap' });
			}
			if (neighbourShown) rows.push(contextRow(neighbourAbove));
		}

		for (const part of parts) {
			if (part.kind === 'context') {
				// A kept line between two coalesced changes. A blank one is dropped
				// like a blank neighbour — the line numbers carry the skip.
				if (!isBlank(part.lineIndex)) rows.push(contextRow(part.lineIndex));
				continue;
			}
			// The added lines of a part are consecutive current lines from its
			// first — removals advance no current index — so the k-th pair and the
			// k-th leftover addition both know exactly which line they describe.
			const partFrom = collapsePoint(part.firstCurrentLine);
			const pairCount = Math.min(part.removed.length, part.added.length);
			for (let index = 0; index < pairCount; index += 1) {
				const lineIndex = part.firstCurrentLine + index;
				rows.push({
					kind: 'changed',
					segments: wordDiffSegments(part.removed[index], part.added[index]),
					line: lineIndex + 1,
					at: currentStarts[lineIndex]
				});
				notes.push(...describePair(part.removed[index], part.added[index]));
			}
			for (let index = pairCount; index < part.removed.length; index += 1) {
				rows.push({ kind: 'removed', text: part.removed[index], at: partFrom });
			}
			for (let index = pairCount; index < part.added.length; index += 1) {
				const lineIndex = part.firstCurrentLine + index;
				rows.push({
					kind: 'added',
					text: part.added[index],
					line: lineIndex + 1,
					at: currentStarts[lineIndex]
				});
			}

			changedLines += pairCount;
			removedLines += part.removed.length - pairCount;
			addedLines += part.added.length - pairCount;
		}

		const neighbourBelow =
			lastChange.added.length === 0
				? lastChange.firstCurrentLine
				: lastChange.firstCurrentLine + lastChange.added.length;
		if (neighbourBelow < currentLines.length && !isBlank(neighbourBelow)) {
			rows.push(contextRow(neighbourBelow));
		}

		hunks.push({
			line: Math.min(firstCurrentLine, Math.max(currentLines.length - 1, 0)) + 1,
			from,
			to,
			rows,
			notes: [...new Set(notes)]
		});
	};

	// Kept lines seen since the last change, still undecided: a short run is a
	// bridge to the next change and joins the hunk as context; a long one ends
	// the hunk, and the run reverts to being the surroundings.
	let gapRun: number[] = [];

	for (const op of ops) {
		if (op === 'same') {
			if (pending) {
				gapRun.push(currentIndex);
				if (gapRun.length > COALESCE_GAP) {
					closePending();
					gapRun = [];
				}
			}
			baseIndex += 1;
			currentIndex += 1;
			continue;
		}
		if (!pending) {
			pending = { parts: [], firstCurrentLine: currentIndex };
		} else if (gapRun.length > 0) {
			for (const lineIndex of gapRun) pending.parts.push({ kind: 'context', lineIndex });
			gapRun = [];
		}
		const tail = pending.parts[pending.parts.length - 1];
		let part: ChangePart;
		if (tail?.kind === 'change') {
			part = tail;
		} else {
			part = { kind: 'change', removed: [], added: [], firstCurrentLine: currentIndex };
			pending.parts.push(part);
		}
		if (op === 'removed') {
			part.removed.push(baselineLines[baseIndex]);
			baseIndex += 1;
		} else {
			part.added.push(currentLines[currentIndex]);
			currentIndex += 1;
		}
	}
	closePending();

	return { identical: false, hunks, changedLines, addedLines, removedLines };
}

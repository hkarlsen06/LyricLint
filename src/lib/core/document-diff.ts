import { scanAnnotations } from './annotations.js';
import { charDiffSegments, type DiffSegment } from './char-diff.js';
import { INVISIBLE_CHARACTERS } from './invisible-characters.js';
import { isSectionHeaderLine } from './parser.js';

/*
 * The comparison behind the toolbar's Compare dialog: the page's lyrics as the
 * user pasted them against the document as it stands. It lives in `core`
 * because it is arithmetic over two strings — no CodeMirror, no shell.
 *
 * The comparison itself is `charDiffSegments`, one flat character diff over
 * the whole text with newlines as ordinary characters — the shape Genius
 * draws, which is the diff transcribers already read. This module's job is
 * folding that flat stream into display rows and hunks, and writing the
 * sentences for what a row cannot show at reading size.
 *
 * Two consumers have to agree about what a difference *is*: the dialog that
 * draws a hunk, and the press that selects the hunk's range in the editor. So
 * every hunk carries its own current-document offsets, computed here where the
 * walk already knows them, rather than re-derived by the surface.
 */

/**
 * One row of a hunk's display, in reading order. Every row except `gap`
 * carries `at`, the current-document offset a press on it parks the caret at —
 * computed here, where the walk already knows the offsets, so the dialog
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
	/** A line carrying both kept and changed text: character-level del/ins pairs. */
	| { kind: 'changed'; segments: readonly DiffSegment[]; line: number; at: number };

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
 * sits, so the caller says whether this one closes the line. The character
 * diff hands text common to both sides back to shared context, which is why
 * the comparison here is on emptiness rather than on collapsing runs — by the
 * time a doubled space reaches a segment, the shared single space is already
 * gone from both sides of it.
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

	// A spacing change can still arrive wearing words around it, so the
	// comparison strips every space rather than testing for whitespace-only
	// segments.
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

/** Sentences for a changed row's segments. */
function describeRow(segments: readonly DiffSegment[]): string[] {
	const notes: string[] = [];
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

/** A change-bearing row plus the current line index it starts in. */
interface ChangeRowInfo {
	row: Exclude<DiffRow, { kind: 'context' } | { kind: 'gap' }>;
	line: number;
}

/**
 * Fold the flat character diff into display rows, keeping only the rows that
 * carry a change. Rows break at every newline whichever side it came from — a
 * deleted newline ends a struck row without advancing the current document,
 * which is how wholly removed lines fall out of a flat stream — and a row's
 * segments carry the shared text of its own line, so a changed row is
 * self-contained for the dialog.
 */
function buildChangeRows(
	segments: readonly DiffSegment[],
	currentStarts: readonly number[]
): ChangeRowInfo[] {
	// The current line a removal collapses into: the first line starting at or
	// past the collapse point. Past the last line this lands one line beyond
	// the document, which is what puts an end-of-document removal below its
	// neighbour rather than above it.
	const removedLine = (offset: number): number => {
		let low = 0;
		let high = currentStarts.length - 1;
		while (low < high) {
			const mid = (low + high) >> 1;
			if (currentStarts[mid] >= offset) high = mid;
			else low = mid + 1;
		}
		return low;
	};

	const rows: ChangeRowInfo[] = [];
	let at = 0;
	let line = 0;
	let rowAt = 0;
	let rowLine = 0;
	let rowSegments: DiffSegment[] = [];
	let hasShared = false;
	let hasDeleted = false;
	let hasInserted = false;

	const pushShared = (text: string): void => {
		const previous = rowSegments[rowSegments.length - 1];
		if (previous?.kind === 'shared') previous.text += text;
		else rowSegments.push({ kind: 'shared', text });
		hasShared = true;
	};
	const pushChange = (deleted: string, inserted: string): void => {
		const previous = rowSegments[rowSegments.length - 1];
		if (previous?.kind === 'change') {
			previous.deleted += deleted;
			previous.inserted += inserted;
		} else {
			rowSegments.push({ kind: 'change', deleted, inserted });
		}
		if (deleted.length > 0) hasDeleted = true;
		if (inserted.length > 0) hasInserted = true;
	};

	const closeRow = (cause: 'shared' | 'deleted' | 'inserted'): void => {
		if (rowSegments.length === 0) {
			// An empty row exists only because a newline alone was deleted or
			// inserted here: a blank line removed or added.
			if (cause === 'deleted') {
				rows.push({ row: { kind: 'removed', text: '', at: rowAt }, line: removedLine(rowAt) });
			} else if (cause === 'inserted') {
				rows.push({
					row: { kind: 'added', text: '', line: rowLine + 1, at: rowAt },
					line: rowLine
				});
			}
		} else if (hasDeleted || hasInserted) {
			if (hasDeleted && !hasInserted && !hasShared) {
				const text = rowSegments
					.map((segment) => (segment.kind === 'change' ? segment.deleted : ''))
					.join('');
				rows.push({ row: { kind: 'removed', text, at: rowAt }, line: removedLine(rowAt) });
			} else if (hasInserted && !hasDeleted && !hasShared) {
				const text = rowSegments
					.map((segment) => (segment.kind === 'change' ? segment.inserted : ''))
					.join('');
				rows.push({ row: { kind: 'added', text, line: rowLine + 1, at: rowAt }, line: rowLine });
			} else {
				rows.push({
					row: { kind: 'changed', segments: rowSegments, line: rowLine + 1, at: rowAt },
					line: rowLine
				});
			}
		}
		rowSegments = [];
		hasShared = false;
		hasDeleted = false;
		hasInserted = false;
	};

	for (const segment of segments) {
		if (segment.kind === 'shared') {
			const parts = segment.text.split('\n');
			for (let index = 0; index < parts.length; index += 1) {
				if (index > 0) {
					closeRow('shared');
					at += 1;
					line += 1;
					rowAt = at;
					rowLine = line;
				}
				if (parts[index].length > 0) {
					pushShared(parts[index]);
					at += parts[index].length;
				}
			}
			continue;
		}
		// A change reads deletion first, then insertion.
		const deletedParts = segment.deleted.split('\n');
		for (let index = 0; index < deletedParts.length; index += 1) {
			if (index > 0) {
				closeRow('deleted');
				rowAt = at;
				rowLine = line;
			}
			if (deletedParts[index].length > 0) pushChange(deletedParts[index], '');
		}
		const insertedParts = segment.inserted.split('\n');
		for (let index = 0; index < insertedParts.length; index += 1) {
			if (index > 0) {
				closeRow('inserted');
				at += 1;
				line += 1;
				rowAt = at;
				rowLine = line;
			}
			if (insertedParts[index].length > 0) {
				pushChange('', insertedParts[index]);
				at += insertedParts[index].length;
			}
		}
	}
	closeRow('shared');
	return rows;
}

/** Compare the pasted baseline against the current document, hunk by hunk. */
export function diffDocuments(baseline: string, current: string): DocumentDiff {
	if (baseline === current) {
		return { identical: true, hunks: [], changedLines: 0, addedLines: 0, removedLines: 0 };
	}

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

	const changeRows = buildChangeRows(charDiffSegments(baseline, current), currentStarts);

	let changedLines = 0;
	let addedLines = 0;
	let removedLines = 0;
	for (const info of changeRows) {
		if (info.row.kind === 'changed') changedLines += 1;
		else if (info.row.kind === 'added') addedLines += 1;
		else removedLines += 1;
	}

	// Rows this close together share one hunk; the kept lines between them
	// (blank or not) are the gap the coalescing rule measures.
	const clusters: ChangeRowInfo[][] = [];
	for (const info of changeRows) {
		const cluster = clusters[clusters.length - 1];
		if (cluster) {
			const previous = cluster[cluster.length - 1];
			const previousNext = previous.row.kind === 'removed' ? previous.line : previous.line + 1;
			if (info.line - previousNext <= COALESCE_GAP) {
				cluster.push(info);
				continue;
			}
		}
		clusters.push([info]);
	}

	const isBlank = (lineIndex: number): boolean =>
		(currentLines[lineIndex] ?? '').trim().length === 0;
	const lineEnd = (lineIndex: number): number =>
		(currentStarts[lineIndex] ?? current.length) + (currentLines[lineIndex]?.length ?? 0);
	const contextRow = (lineIndex: number): DiffRow => ({
		kind: 'context',
		text: currentLines[lineIndex],
		line: lineIndex + 1,
		at: currentStarts[lineIndex]
	});

	const hunks: DiffHunk[] = clusters.map((cluster) => {
		const firstLine = cluster[0].line;
		const rows: DiffRow[] = [];
		const notes: string[] = [];

		// Above the change: the section header it sings under, an ellipsis where
		// lyrics are skipped, and the immediate neighbour. Where the neighbour is
		// the header, one row is all three.
		//
		// A blank neighbour is dropped rather than drawn: "(blank line)" as
		// orientation orients nobody, and the placeholder is only owed where a
		// blank line is itself the change. Blank lines do not earn the ellipsis
		// either — an ⋯ standing for nothing but the spacing between sections
		// reads as lyrics being hidden.
		const neighbourAbove = firstLine - 1;
		if (neighbourAbove >= 0 && neighbourAbove < currentLines.length) {
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
				const boundary = neighbourShown ? neighbourAbove : firstLine;
				let skippedLyrics = false;
				for (let lineIndex = headerIndex + 1; lineIndex < boundary; lineIndex += 1) {
					if (!isBlank(lineIndex)) skippedLyrics = true;
				}
				if (skippedLyrics) rows.push({ kind: 'gap' });
			}
			if (neighbourShown) rows.push(contextRow(neighbourAbove));
		}

		let previousNext = firstLine;
		for (const info of cluster) {
			// Kept lines between two coalesced changes. Blank ones are dropped
			// like a blank neighbour — the line numbers carry the skip.
			for (let lineIndex = previousNext; lineIndex < info.line; lineIndex += 1) {
				if (!isBlank(lineIndex)) rows.push(contextRow(lineIndex));
			}
			rows.push(info.row);
			if (info.row.kind === 'changed') notes.push(...describeRow(info.row.segments));
			previousNext = Math.max(
				previousNext,
				info.row.kind === 'removed' ? info.line : info.line + 1
			);
		}

		if (previousNext < currentLines.length && !isBlank(previousNext)) {
			rows.push(contextRow(previousNext));
		}

		const last = cluster[cluster.length - 1];
		const from = cluster[0].row.at;
		const to =
			last.row.kind === 'removed' ? last.row.at : Math.min(lineEnd(last.line), current.length);
		return {
			line: Math.min(firstLine, Math.max(currentLines.length - 1, 0)) + 1,
			from,
			to,
			rows,
			notes: [...new Set(notes)]
		};
	});

	return { identical: false, hunks, changedLines, addedLines, removedLines };
}

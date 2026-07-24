import type {
	AssignmentRequest,
	AtomicDocumentEdit,
	InsertSectionHeaderRequest,
	LyricLine,
	RemoveDifferentiationRequest,
	Section,
	SerializedSelection,
	StyleSlot,
	SupportedStyleSpan,
	TextEdit,
	TextRange
} from '../core/types.js';
import { serializeLegend, wrapVoiceSpan } from '../serialization/genius-markup.js';
import { allocateStyleSlot } from './allocation.js';
import { makeVoiceGroupKey } from './identity.js';
import { extractPerformers } from './import.js';
import {
	TOO_MANY_GROUP_OPTIONS,
	type AssignmentResult,
	type DocumentTransformResult
} from './types.js';

interface StyledPiece {
	text: string;
	slot: StyleSlot;
	selected: boolean;
}

interface RenderedLine {
	text: string;
	selectedFrom?: number;
	selectedTo?: number;
}

interface LineTransform {
	edit?: TextEdit;
	selectedFrom: number;
	selectedTo: number;
}

function orderedSelection(selection: SerializedSelection): TextRange {
	return {
		from: Math.min(selection.anchor, selection.head),
		to: Math.max(selection.anchor, selection.head)
	};
}

function trimWhitespaceRange(text: string, range: TextRange): TextRange {
	let from = range.from;
	let to = range.to;
	while (from < to && /\s/u.test(text[from] ?? '')) {
		from += 1;
	}
	while (to > from && /\s/u.test(text[to - 1] ?? '')) {
		to -= 1;
	}
	return { from, to };
}

function expandToGraphemeBoundaries(text: string, range: TextRange): TextRange {
	const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	let expandedFrom = 0;
	let expandedTo = text.length;

	for (const segment of segmenter.segment(text)) {
		const start = segment.index;
		const end = start + segment.segment.length;
		if (start <= range.from && range.from < end) {
			expandedFrom = start;
		}
		if (start < range.to && range.to <= end) {
			expandedTo = end;
			break;
		}
		if (range.from === start) {
			expandedFrom = start;
		}
		if (range.to === start) {
			expandedTo = start;
			break;
		}
	}

	if (range.from === text.length) {
		expandedFrom = text.length;
	}
	if (range.to === text.length) {
		expandedTo = text.length;
	}
	return { from: expandedFrom, to: expandedTo };
}

function lyricBounds(section: Section): TextRange | undefined {
	const first = section.lines[0];
	const last = section.lines.at(-1);
	return first && last ? { from: first.from, to: last.to } : undefined;
}

function sectionForRange(sections: readonly Section[], range: TextRange): Section | undefined {
	return sections.find((section) => {
		const bounds = lyricBounds(section);
		return bounds && bounds.from <= range.from && range.to <= bounds.to;
	});
}

function lineAtCaret(section: Section, offset: number): LyricLine | undefined {
	return section.lines.find((line) => line.from <= offset && offset <= line.to);
}

function supportedSpans(line: LyricLine): SupportedStyleSpan[] {
	return line.styleSpans.filter((span): span is SupportedStyleSpan => !('unsupported' in span));
}

function appendSplitPiece(
	pieces: StyledPiece[],
	text: string,
	sourceRange: TextRange,
	slot: StyleSlot,
	selection: TextRange
): void {
	const selectedFrom = Math.max(sourceRange.from, selection.from);
	const selectedTo = Math.min(sourceRange.to, selection.to);

	if (selectedFrom >= selectedTo) {
		pieces.push({ text, slot, selected: false });
		return;
	}

	const localFrom = selectedFrom - sourceRange.from;
	const localTo = selectedTo - sourceRange.from;
	if (localFrom > 0) {
		pieces.push({ text: text.slice(0, localFrom), slot, selected: false });
	}
	pieces.push({ text: text.slice(localFrom, localTo), slot, selected: true });
	if (localTo < text.length) {
		pieces.push({ text: text.slice(localTo), slot, selected: false });
	}
}

function buildLinePieces(text: string, line: LyricLine, selection: TextRange): StyledPiece[] {
	const pieces: StyledPiece[] = [];
	let cursor = line.from;

	for (const span of supportedSpans(line)) {
		if (cursor < span.from) {
			appendSplitPiece(
				pieces,
				text.slice(cursor, span.from),
				{ from: cursor, to: span.from },
				1,
				selection
			);
		}
		appendSplitPiece(
			pieces,
			text.slice(span.contentFrom, span.contentTo),
			{ from: span.contentFrom, to: span.contentTo },
			span.slot,
			selection
		);
		cursor = span.to;
	}

	if (cursor < line.to) {
		appendSplitPiece(
			pieces,
			text.slice(cursor, line.to),
			{ from: cursor, to: line.to },
			1,
			selection
		);
	}
	return pieces;
}

function renderPieces(pieces: readonly StyledPiece[]): RenderedLine {
	const runs: { slot: StyleSlot; pieces: StyledPiece[] }[] = [];
	for (const piece of pieces) {
		if (piece.text.length === 0) {
			continue;
		}
		const previous = runs.at(-1);
		if (previous?.slot === piece.slot) {
			previous.pieces.push(piece);
		} else {
			runs.push({ slot: piece.slot, pieces: [piece] });
		}
	}

	let text = '';
	let selectedFrom: number | undefined;
	let selectedTo: number | undefined;

	for (const run of runs) {
		const content = run.pieces.map((piece) => piece.text).join('');
		const wrapped = wrapVoiceSpan(content, run.slot);
		const openingLength = run.slot === 1 ? 0 : run.slot === 4 ? '<i><b>'.length : '<i>'.length;
		let contentOffset = text.length + openingLength;

		for (const piece of run.pieces) {
			if (piece.selected) {
				selectedFrom ??= contentOffset;
				selectedTo = contentOffset + piece.text.length;
			}
			contentOffset += piece.text.length;
		}
		text += wrapped;
	}

	return { text, selectedFrom, selectedTo };
}

function transformLine(
	text: string,
	line: LyricLine,
	selection: TextRange,
	styleSlot: StyleSlot
): LineTransform | undefined {
	if (line.styleSpans.some((span) => 'unsupported' in span)) {
		return undefined;
	}
	// Rewriting only one physical line cannot safely preserve an outer wrapper
	// whose opening or closing tag lives on another line. Keep the source
	// lossless until a section-aware transform can normalize the whole wrapper.
	if (
		supportedSpans(line).some((span) => span.continuedFromPreviousLine || span.continuesToNextLine)
	) {
		return undefined;
	}

	const pieces = buildLinePieces(text, line, selection).map((piece) =>
		piece.selected ? { ...piece, slot: styleSlot } : piece
	);
	const rendered = renderPieces(pieces);
	if (rendered.selectedFrom === undefined || rendered.selectedTo === undefined) {
		return undefined;
	}

	return {
		edit:
			rendered.text === line.text
				? undefined
				: { from: line.from, to: line.to, insert: rendered.text },
		selectedFrom: line.from + rendered.selectedFrom,
		selectedTo: line.from + rendered.selectedTo
	};
}

function serializeRawGroupsWithNew(rawGroups: readonly string[], newGroup: string): string {
	const allGroups = [...rawGroups, newGroup];
	if (allGroups.length < 2) {
		return allGroups[0] ?? '';
	}
	return `${allGroups.slice(0, -1).join(', ')} & ${allGroups.at(-1)}`;
}

function headerLegendEdit(
	section: Section,
	newGroup: string,
	existingRawGroups = section.header?.legendGroups.map((group) => group.raw) ?? []
): TextEdit | undefined {
	const header = section.header;
	if (!header) {
		return undefined;
	}

	if (header.legendRange) {
		return {
			from: header.legendRange.from,
			to: header.legendRange.to,
			insert: serializeRawGroupsWithNew(existingRawGroups, newGroup)
		};
	}

	const insertionPoint = header.closed ? header.to - 1 : header.to;
	return { from: insertionPoint, to: insertionPoint, insert: `: ${newGroup}` };
}

function compareEdits(left: TextEdit, right: TextEdit): number {
	return left.from - right.from || left.to - right.to;
}

function makeAtomicEdit(
	baseRevision: number,
	textLength: number,
	edits: readonly TextEdit[],
	selectionAfter?: SerializedSelection
): AtomicDocumentEdit {
	const sorted = [...edits].sort(compareEdits);
	let previousTo = 0;
	let outputLength = textLength;

	for (const edit of sorted) {
		if (
			!Number.isInteger(edit.from) ||
			!Number.isInteger(edit.to) ||
			edit.from < previousTo ||
			edit.from < 0 ||
			edit.to < edit.from ||
			edit.to > textLength
		) {
			throw new RangeError('Performer transform produced an invalid or overlapping edit set.');
		}
		previousTo = edit.to;
		outputLength += edit.insert.length - (edit.to - edit.from);
	}
	if (
		selectionAfter &&
		(selectionAfter.anchor < 0 ||
			selectionAfter.head < 0 ||
			selectionAfter.anchor > outputLength ||
			selectionAfter.head > outputLength)
	) {
		throw new RangeError('Performer transform produced an invalid mapped selection.');
	}

	return {
		baseRevision,
		edits: sorted,
		...(selectionAfter ? { selectionAfter } : {})
	};
}

function mapOriginalOffset(offset: number, edits: readonly TextEdit[]): number {
	let mapped = offset;
	for (const edit of edits) {
		if (edit.to <= offset) {
			mapped += edit.insert.length - (edit.to - edit.from);
		}
	}
	return mapped;
}

function insertedOffset(edit: TextEdit, localOffset: number, edits: readonly TextEdit[]): number {
	let mapped = edit.from + localOffset;
	for (const previous of edits) {
		if (previous === edit) {
			break;
		}
		mapped += previous.insert.length - (previous.to - previous.from);
	}
	return mapped;
}

function dominantLineEnding(text: string): string {
	const counts = new Map<string, number>();
	for (const match of text.matchAll(/\r\n|\r|\n/gu)) {
		const ending = match[0];
		counts.set(ending, (counts.get(ending) ?? 0) + 1);
	}

	return (
		[...counts.entries()].sort(
			([leftEnding, leftCount], [rightEnding, rightCount]) =>
				rightCount - leftCount || text.indexOf(leftEnding) - text.indexOf(rightEnding)
		)[0]?.[0] ?? '\n'
	);
}

function lineEndingForInsertion(text: string, offset: number): string {
	let nearest: { ending: string; distance: number; preceding: boolean } | undefined;

	for (const match of text.matchAll(/\r\n|\r|\n/gu)) {
		const from = match.index;
		const to = from + match[0].length;
		const preceding = to <= offset;
		const following = from >= offset;
		if (!preceding && !following) {
			continue;
		}
		const distance = preceding ? offset - to : from - offset;
		if (
			!nearest ||
			distance < nearest.distance ||
			(distance === nearest.distance && preceding && !nearest.preceding)
		) {
			nearest = { ending: match[0], distance, preceding };
		}
	}

	return nearest?.ending ?? dominantLineEnding(text);
}

/**
 * Build one atomic edit containing the header legend update, every affected
 * lyric-line rewrite, and a direction-preserving semantic selection.
 */
export function assignVoiceGroup(request: AssignmentRequest): AssignmentResult {
	if (
		request.selection.anchor < 0 ||
		request.selection.head < 0 ||
		request.selection.anchor > request.text.length ||
		request.selection.head > request.text.length ||
		request.document.text !== request.text
	) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	let selection = orderedSelection(request.selection);
	if (selection.from === selection.to) {
		const caretSection = request.document.sections.find((section) =>
			lineAtCaret(section, selection.from)
		);
		const line = caretSection && lineAtCaret(caretSection, selection.from);
		if (!line) {
			return { status: 'blocked', reason: 'empty-selection' };
		}
		selection = { from: line.from, to: line.to };
	}

	selection = trimWhitespaceRange(request.text, selection);
	if (selection.from === selection.to) {
		return { status: 'blocked', reason: 'whitespace-selection' };
	}
	selection = expandToGraphemeBoundaries(request.text, selection);

	const section = sectionForRange(request.document.sections, selection);
	if (!section) {
		return { status: 'blocked', reason: 'cross-section' };
	}
	if (!section.header || request.performerIds.length === 0) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const selectedPerformers = [...new Set(request.performerIds)]
		.map((id) => request.roster.find((performer) => performer.id === id))
		.filter((performer) => performer !== undefined)
		.sort((left, right) => left.order - right.order);
	if (selectedPerformers.length !== new Set(request.performerIds).size) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const extraction = extractPerformers(request.document, request.roster);
	const resolvedGroups = extraction.voiceGroups
		.filter((group) => group.sectionFrom === section.from && !group.unresolved)
		.map((group) => ({
			id: group.groupKey,
			performerIds: group.performerIds,
			styleSlot: group.styleSlot,
			rawNameText: group.rawNameText,
			sourceRange: group.sourceRange
		}));
	const resolvedSection: Section = { ...section, voiceGroups: resolvedGroups };
	const groupKey = makeVoiceGroupKey(selectedPerformers.map((performer) => performer.id));
	const allocation = allocateStyleSlot(resolvedSection, groupKey);

	if (allocation.status === 'unavailable') {
		return {
			status: 'blocked',
			reason: 'too-many-groups',
			blocked: 'too-many-groups',
			options: TOO_MANY_GROUP_OPTIONS
		};
	}

	const lineTransforms: { line: LyricLine; transform: LineTransform }[] = [];
	for (const line of section.lines) {
		const lineSelection = trimWhitespaceRange(request.text, {
			from: Math.max(selection.from, line.from),
			to: Math.min(selection.to, line.to)
		});
		if (lineSelection.from >= lineSelection.to) {
			continue;
		}
		const transform = transformLine(request.text, line, lineSelection, allocation.styleSlot);
		if (!transform) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		lineTransforms.push({ line, transform });
	}

	if (lineTransforms.length === 0) {
		return { status: 'blocked', reason: 'whitespace-selection' };
	}

	const edits: TextEdit[] = [];
	if (allocation.status === 'available') {
		const newLegendGroup = serializeLegend([
			{ styleSlot: allocation.styleSlot, members: selectedPerformers }
		]);
		const existingRawGroups = extraction.voiceGroups
			.filter((group) => group.sectionFrom === section.from && !group.unresolved)
			.sort((left, right) => (left.sourceRange?.from ?? 0) - (right.sourceRange?.from ?? 0))
			.map((group) =>
				group.sourceRange
					? request.text.slice(group.sourceRange.from, group.sourceRange.to)
					: (group.rawNameText ?? '')
			);
		const edit = headerLegendEdit(section, newLegendGroup, existingRawGroups);
		if (!edit) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		edits.push(edit);
	}
	for (const { transform } of lineTransforms) {
		if (transform.edit) {
			edits.push(transform.edit);
		}
	}
	edits.sort(compareEdits);
	if (edits.length === 0) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const first = lineTransforms[0];
	const last = lineTransforms.at(-1);
	if (!first || !last) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const mappedFrom = first.transform.edit
		? insertedOffset(
				first.transform.edit,
				first.transform.selectedFrom - first.transform.edit.from,
				edits
			)
		: mapOriginalOffset(first.transform.selectedFrom, edits);
	const mappedTo = last.transform.edit
		? insertedOffset(
				last.transform.edit,
				last.transform.selectedTo - last.transform.edit.from,
				edits
			)
		: mapOriginalOffset(last.transform.selectedTo, edits);
	const forwards = request.selection.anchor <= request.selection.head;

	return {
		status: 'applied',
		styleSlot: allocation.styleSlot,
		edit: makeAtomicEdit(
			request.revision,
			request.text.length,
			edits,
			forwards ? { anchor: mappedFrom, head: mappedTo } : { anchor: mappedTo, head: mappedFrom }
		)
	};
}

/** Insert a chosen section header as one undoable atomic edit. */
export function insertSectionHeader(request: InsertSectionHeaderRequest): DocumentTransformResult {
	if (request.document.text !== request.text) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	const section = request.document.sections.find(
		(candidate) => candidate.from === request.sectionFrom
	);
	const headerName = request.headerName.trim();
	if (!section || section.header || headerName.length === 0) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const ordinal = request.ordinal === undefined ? '' : ` ${request.ordinal}`;
	return {
		status: 'applied',
		edit: makeAtomicEdit(request.revision, request.text.length, [
			{
				from: section.from,
				to: section.from,
				insert: `[${headerName}${ordinal}]${lineEndingForInsertion(request.text, section.from)}`
			}
		])
	};
}

/** Remove supported header/body differentiation without touching malformed markup. */
export function removeDifferentiation(
	request: RemoveDifferentiationRequest
): DocumentTransformResult {
	if (request.document.text !== request.text) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	const section = request.document.sections.find(
		(candidate) => candidate.from === request.sectionFrom
	);
	if (!section) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const edits: TextEdit[] = [];
	const header = section.header;
	if (header?.legendRange) {
		const colon = request.text.lastIndexOf(':', header.legendRange.from);
		if (colon >= header.from) {
			edits.push({ from: colon, to: header.legendRange.to, insert: '' });
		}
	}

	for (const line of section.lines) {
		for (const span of supportedSpans(line)) {
			edits.push({
				from: span.from,
				to: span.to,
				insert: request.text.slice(span.contentFrom, span.contentTo)
			});
		}
	}
	edits.sort(compareEdits);

	return {
		status: 'applied',
		edit: makeAtomicEdit(request.revision, request.text.length, edits)
	};
}

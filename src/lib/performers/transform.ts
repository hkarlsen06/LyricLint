import type {
	AssignmentRequest,
	AtomicDocumentEdit,
	InsertSectionHeaderRequest,
	LegendAssignmentRequest,
	LyricLine,
	ParsedDocument,
	PerformerId,
	PerformerRecord,
	RemoveDifferentiationRequest,
	Section,
	SectionHeader,
	SerializedSelection,
	StyleSlot,
	SupportedStyleSpan,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import { headerNameIsEmpty } from '$lib/core/parser.js';
import { serializeLegend, styleTags, wrapVoiceSpan } from '$lib/serialization/genius-markup.js';
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

const STYLE_SLOTS: readonly StyleSlot[] = [1, 2, 3, 4];

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

function supportedStyleChains(section: Section): SupportedStyleSpan[][] {
	const chains: SupportedStyleSpan[][] = [];
	const active = new Map<StyleSlot, SupportedStyleSpan[]>();

	for (const line of section.lines) {
		for (const span of supportedSpans(line)) {
			let chain = span.continuedFromPreviousLine === true ? active.get(span.slot) : undefined;
			if (!chain) {
				chain = [];
			}
			chain.push(span);

			if (span.continuesToNextLine) {
				active.set(span.slot, chain);
			} else {
				active.delete(span.slot);
				chains.push(chain);
			}
		}
	}

	return chains;
}

function removeSelectedDifferentiation(
	request: AssignmentRequest,
	section: Section,
	selection: TextRange
): AssignmentResult {
	if (
		section.lines.some(
			(line) =>
				line.from < selection.to &&
				selection.from < line.to &&
				line.styleSpans.some((span) => 'unsupported' in span)
		)
	) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const selectedChains: SupportedStyleSpan[][] = [];
	for (const chain of supportedStyleChains(section)) {
		const overlaps = chain.some((span) => span.from < selection.to && selection.from < span.to);
		if (!overlaps) {
			continue;
		}
		const fullySelected = chain.every(
			(span) =>
				span.contentFrom === span.contentTo ||
				(selection.from <= span.contentFrom && span.contentTo <= selection.to)
		);
		if (!fullySelected) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		selectedChains.push(chain);
	}

	const edits = selectedChains
		.flatMap((chain) =>
			chain.flatMap((span) => {
				const tagEdits: TextEdit[] = [];
				if (span.from < span.contentFrom) {
					tagEdits.push({ from: span.from, to: span.contentFrom, insert: '' });
				}
				if (span.contentTo < span.to) {
					tagEdits.push({ from: span.contentTo, to: span.to, insert: '' });
				}
				return tagEdits;
			})
		)
		.sort(compareEdits);
	const firstSpan = selectedChains[0]?.[0];
	if (edits.length === 0 || !firstSpan) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const mappedFrom = mapOriginalOffset(selection.from, edits);
	const mappedTo = mapOriginalOffset(selection.to, edits);
	const forwards = request.selection.anchor <= request.selection.head;
	return {
		status: 'applied',
		styleSlot: firstSpan.slot,
		edit: makeAtomicEdit(
			request.revision,
			request.text.length,
			edits,
			forwards ? { anchor: mappedFrom, head: mappedTo } : { anchor: mappedTo, head: mappedFrom }
		)
	};
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

function retainedStyleSlots(text: string, section: Section, selection: TextRange): Set<StyleSlot> {
	const retained = new Set<StyleSlot>();
	for (const line of section.lines) {
		const lineSelection = trimWhitespaceRange(text, {
			from: Math.max(selection.from, line.from),
			to: Math.min(selection.to, line.to)
		});
		for (const piece of buildLinePieces(text, line, lineSelection)) {
			if (!piece.selected && piece.text.trim().length > 0) {
				retained.add(piece.slot);
			}
		}
	}
	return retained;
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

function combineLineTransforms(
	text: string,
	lineTransforms: readonly { line: LyricLine; transform: LineTransform }[],
	styleSlot: StyleSlot
): LineTransform | undefined {
	if (lineTransforms.length < 2 || styleSlot === 1) {
		return undefined;
	}
	const first = lineTransforms[0];
	const last = lineTransforms.at(-1);
	if (!first || !last) {
		return undefined;
	}

	const { opening, closing } = styleTags(styleSlot);
	let insert = '';
	let selectedFrom: number | undefined;
	let selectedTo: number | undefined;

	for (const [index, entry] of lineTransforms.entries()) {
		let rendered = entry.transform.edit?.insert ?? entry.line.text;
		let localFrom = entry.transform.selectedFrom - entry.line.from;
		let localTo = entry.transform.selectedTo - entry.line.from;

		if (
			rendered.slice(localFrom - opening.length, localFrom) !== opening ||
			rendered.slice(localTo, localTo + closing.length) !== closing
		) {
			return undefined;
		}

		if (index > 0) {
			rendered = rendered.slice(0, localFrom - opening.length) + rendered.slice(localFrom);
			localFrom -= opening.length;
			localTo -= opening.length;
		}
		if (index < lineTransforms.length - 1) {
			rendered = rendered.slice(0, localTo) + rendered.slice(localTo + closing.length);
		}

		if (index > 0) {
			const previous = lineTransforms[index - 1];
			if (!previous) {
				return undefined;
			}
			insert += text.slice(previous.line.to, entry.line.from);
		}
		const outputFrom = insert.length;
		if (index === 0) {
			selectedFrom = first.line.from + outputFrom + localFrom;
		}
		if (index === lineTransforms.length - 1) {
			selectedTo = first.line.from + outputFrom + localTo;
		}
		insert += rendered;
	}

	if (selectedFrom === undefined || selectedTo === undefined) {
		return undefined;
	}
	return {
		edit: { from: first.line.from, to: last.line.to, insert },
		selectedFrom,
		selectedTo
	};
}

interface RawLegendGroup {
	raw: string;
	styleSlot: StyleSlot;
}

function serializeRawGroups(groups: readonly RawLegendGroup[]): string {
	const orderedGroups = [...groups].sort((left, right) => left.styleSlot - right.styleSlot);
	if (orderedGroups.length < 2) {
		return orderedGroups[0]?.raw ?? '';
	}
	return `${orderedGroups
		.slice(0, -1)
		.map((group) => group.raw)
		.join(', ')} & ${orderedGroups.at(-1)?.raw ?? ''}`;
}

function headerLegendEdit(
	section: Section,
	groups: readonly RawLegendGroup[]
): TextEdit | undefined {
	const header = section.header;
	if (!header) {
		return undefined;
	}

	const legend = serializeRawGroups(groups);
	if (header.legendRange) {
		return {
			from: header.legendRange.from,
			to: header.legendRange.to,
			insert: legend
		};
	}

	const insertionPoint = header.closed ? header.to - 1 : header.to;
	return { from: insertionPoint, to: insertionPoint, insert: `: ${legend}` };
}

/**
 * The range an assignment actually acts on: a collapsed caret grows to its whole
 * line, surrounding whitespace comes off, and the ends land on grapheme
 * boundaries. Shared with `assignmentNeedsSectionVoice`, so the question the
 * picker asks is asked about the same text the edit would rewrite.
 */
function normalizeSelection(
	document: ParsedDocument,
	selection: SerializedSelection
): TextRange | 'empty-selection' | 'whitespace-selection' {
	let range = orderedSelection(selection);
	if (range.from === range.to) {
		const caretSection = document.sections.find((section) => lineAtCaret(section, range.from));
		const line = caretSection && lineAtCaret(caretSection, range.from);
		if (!line) {
			return 'empty-selection';
		}
		range = { from: line.from, to: line.to };
	}

	range = trimWhitespaceRange(document.text, range);
	if (range.from === range.to) {
		return 'whitespace-selection';
	}
	return expandToGraphemeBoundaries(document.text, range);
}

/**
 * Whether a range could take a voice-group assignment at all.
 *
 * This is the question the selection picker asks before opening itself over a
 * selection nobody invited it to, so it has to be the transform's own answer
 * rather than a second opinion: it runs the three checks `assignVoiceGroup`
 * opens with, through the same helpers. The range has to normalize to real
 * text; it has to sit inside one section's lyric bounds, which is what rules
 * out a header, the legend inside it, a drag that crosses two sections, and a
 * document with no sections at all; and that section needs a header for the
 * legend to be written into.
 *
 * What it deliberately does not ask about is the roster. An empty one is
 * answered by the card's own inline add, and `too-many-groups` depends on which
 * performers are chosen — which is the question the card is open to ask.
 */
export function canAssignVoiceGroup(
	document: ParsedDocument,
	selection: SerializedSelection
): boolean {
	const range = normalizeSelection(document, selection);
	if (typeof range === 'string') {
		return false;
	}
	return sectionForRange(document.sections, range)?.header !== undefined;
}

/**
 * Whether assigning here would write a legend that does not begin at the plain
 * slot, because unstyled lyrics stay behind with nobody named for them.
 *
 * That document is invalid the moment it is written and `performer.style-order`
 * cannot repair it: the only reorder available to one group is moving it down
 * into plain, which would hand it the very lyrics it was meant to be
 * distinguished from. The missing fact is who sings the rest, so the picker asks
 * for it and `sectionPerformerIds` carries the answer back into the same edit.
 */
export function assignmentNeedsSectionVoice(
	document: ParsedDocument,
	selection: SerializedSelection
): boolean {
	const range = normalizeSelection(document, selection);
	if (typeof range === 'string') {
		return false;
	}
	const section = sectionForRange(document.sections, range);
	if (!section?.header || section.header.legendGroups.length > 0) {
		return false;
	}
	return retainedStyleSlots(document.text, section, range).has(1);
}

/** Roster records for a set of ids, in roster order, or `undefined` if any is unknown. */
function resolveMembers(
	roster: readonly PerformerRecord[],
	performerIds: readonly PerformerId[]
): PerformerRecord[] | undefined {
	const unique = [...new Set(performerIds)];
	const members = unique
		.map((id) => roster.find((performer) => performer.id === id))
		.filter((performer) => performer !== undefined)
		.sort((left, right) => left.order - right.order);
	return members.length === unique.length ? members : undefined;
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

	const normalized = normalizeSelection(request.document, request.selection);
	if (typeof normalized === 'string') {
		return { status: 'blocked', reason: normalized };
	}
	const selection = normalized;

	const section = sectionForRange(request.document.sections, selection);
	if (!section) {
		return { status: 'blocked', reason: 'cross-section' };
	}
	if (!section.header) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	if (request.performerIds.length === 0) {
		return removeSelectedDifferentiation(request, section, selection);
	}

	const selectedPerformers = resolveMembers(request.roster, request.performerIds);
	const sectionPerformers = resolveMembers(request.roster, request.sectionPerformerIds ?? []);
	if (!selectedPerformers || !sectionPerformers) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	const selectedKey = makeVoiceGroupKey(selectedPerformers.map((performer) => performer.id));

	// The same voice on both sides of the question is one voice: it sings the
	// selection and it sings everything around it, so there is nothing to tell
	// apart. Name it in the plain slot and leave the lyrics alone — wrapping a
	// passage to distinguish a performer from themselves is `Frikk & <i>Frikk</i>`,
	// two legend groups for one singer.
	if (
		sectionPerformers.length > 0 &&
		makeVoiceGroupKey(sectionPerformers.map((performer) => performer.id)) === selectedKey
	) {
		const plainEdit = headerLegendEdit(section, [
			{ styleSlot: 1, raw: serializeLegend([{ styleSlot: 1, members: selectedPerformers }]) }
		]);
		if (!plainEdit) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		const edits = [plainEdit];
		const forwardSelection = request.selection.anchor <= request.selection.head;
		const from = mapOriginalOffset(selection.from, edits);
		const to = mapOriginalOffset(selection.to, edits);
		return {
			status: 'applied',
			styleSlot: 1,
			edit: makeAtomicEdit(
				request.revision,
				request.text.length,
				edits,
				forwardSelection ? { anchor: from, head: to } : { anchor: to, head: from }
			)
		};
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
	const retainedSlots = retainedStyleSlots(request.text, section, selection);
	let allocation = allocateStyleSlot(resolvedSection, selectedKey);
	if (allocation.status !== 'existing') {
		const reusableSlot = STYLE_SLOTS.find((slot) => !retainedSlots.has(slot));
		allocation = reusableSlot
			? { status: 'available', styleSlot: reusableSlot }
			: { status: 'unavailable' };
	}

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

	const combinedTransform = combineLineTransforms(
		request.text,
		lineTransforms,
		allocation.styleSlot
	);
	const appliedTransforms = combinedTransform
		? [combinedTransform]
		: lineTransforms.map(({ transform }) => transform);
	const edits: TextEdit[] = [];
	if (allocation.status === 'available') {
		const newLegendGroup = serializeLegend([
			{ styleSlot: allocation.styleSlot, members: selectedPerformers }
		]);
		const retainedLegendGroups = extraction.voiceGroups
			.filter((group) => group.sectionFrom === section.from && !group.unresolved)
			.sort((left, right) => (left.sourceRange?.from ?? 0) - (right.sourceRange?.from ?? 0))
			.filter((group) => retainedSlots.has(group.styleSlot))
			.map((group) => ({
				styleSlot: group.styleSlot,
				raw: group.sourceRange
					? request.text.slice(group.sourceRange.from, group.sourceRange.to)
					: (group.rawNameText ?? '')
			}));
		// The picker's second step, when it ran: the unstyled lyrics get their own
		// group so the legend begins at plain, instead of opening with the italic
		// group this assignment just created. Nothing to add when the section
		// already names a plain voice, or when the user chose to name one later.
		const plainVoiceGroup: RawLegendGroup[] =
			sectionPerformers.length > 0 &&
			allocation.styleSlot !== 1 &&
			!retainedLegendGroups.some((group) => group.styleSlot === 1)
				? [
						{
							styleSlot: 1,
							raw: serializeLegend([{ styleSlot: 1, members: sectionPerformers }])
						}
					]
				: [];
		const edit = headerLegendEdit(section, [
			...plainVoiceGroup,
			...retainedLegendGroups,
			{ styleSlot: allocation.styleSlot, raw: newLegendGroup }
		]);
		if (!edit) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		edits.push(edit);
	}
	for (const transform of appliedTransforms) {
		if (transform.edit) {
			edits.push(transform.edit);
		}
	}
	edits.sort(compareEdits);
	if (edits.length === 0) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const first = appliedTransforms[0];
	const last = appliedTransforms.at(-1);
	if (!first || !last) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const mappedFrom = first.edit
		? insertedOffset(first.edit, first.selectedFrom - first.edit.from, edits)
		: mapOriginalOffset(first.selectedFrom, edits);
	const mappedTo = last.edit
		? insertedOffset(last.edit, last.selectedTo - last.edit.from, edits)
		: mapOriginalOffset(last.selectedTo, edits);
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

/**
 * Assign performers to existing section-local style slots.
 *
 * This is used when imported inline formatting is valid but its header legend
 * is missing the performer identities. The lyric body is left alone except for
 * the slots named in `unwrapSlots`, whose wrappers are removed while their
 * text stays exactly as written.
 */
export function assignVoiceLegend(request: LegendAssignmentRequest): DocumentTransformResult {
	if (request.document.text !== request.text || request.assignments.length === 0) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	const section = request.document.sections.find(
		(candidate) => candidate.from === request.sectionFrom
	);
	const header = section?.header;
	if (
		!section ||
		!header ||
		!header.closed ||
		header.legendGroups.some((group) => !group.markupSupported)
	) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const unwrapped = new Set(request.unwrapSlots ?? []);
	// Touching the body is only safe when every wrapper in it parses, and a slot
	// cannot both receive a legend group and lose its markup in the same edit.
	if (
		unwrapped.size > 0 &&
		section.lines.some((line) => line.styleSpans.some((span) => 'unsupported' in span))
	) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	if (request.assignments.some((assignment) => unwrapped.has(assignment.styleSlot))) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const replacements = new Map<StyleSlot, RawLegendGroup>();
	for (const assignment of request.assignments) {
		if (replacements.has(assignment.styleSlot) || assignment.performerIds.length === 0) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		const uniqueIds = [...new Set(assignment.performerIds)];
		const members = uniqueIds
			.map((id) => request.roster.find((performer) => performer.id === id))
			.filter((performer) => performer !== undefined)
			.sort((left, right) => left.order - right.order);
		if (members.length !== uniqueIds.length) {
			return { status: 'blocked', reason: 'invalid-range' };
		}
		replacements.set(assignment.styleSlot, {
			styleSlot: assignment.styleSlot,
			raw: serializeLegend([{ styleSlot: assignment.styleSlot, members }])
		});
	}

	const groups = new Map<StyleSlot, RawLegendGroup>();
	for (const group of header.legendGroups) {
		// A slot losing its wrappers loses its legend group with them, otherwise
		// the legend would name a style the body no longer uses.
		if (unwrapped.has(group.styleSlot)) {
			continue;
		}
		groups.set(group.styleSlot, { styleSlot: group.styleSlot, raw: group.raw });
	}
	for (const [styleSlot, group] of replacements) {
		groups.set(styleSlot, group);
	}

	const edits: TextEdit[] = [];
	const headerEdit = headerLegendEdit(section, [...groups.values()]);
	if (
		headerEdit &&
		!(headerEdit.from === headerEdit.to && headerEdit.insert.length === 0) &&
		request.text.slice(headerEdit.from, headerEdit.to) !== headerEdit.insert
	) {
		edits.push(headerEdit);
	}
	for (const line of section.lines) {
		for (const span of supportedSpans(line)) {
			if (!unwrapped.has(span.slot)) {
				continue;
			}
			// A wrapper spanning several lines is projected onto each of them, so
			// the middle lines carry no marker and produce no edit.
			const content = request.text.slice(span.contentFrom, span.contentTo);
			if (request.text.slice(span.from, span.to) !== content) {
				edits.push({ from: span.from, to: span.to, insert: content });
			}
		}
	}
	if (edits.length === 0) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	return {
		status: 'applied',
		edit: makeAtomicEdit(request.revision, request.text.length, edits)
	};
}

/**
 * The span a chosen name is written into: the empty header's own brackets.
 *
 * `[]` is a header the user has opened and not named, and the one thing they
 * asked for by typing it is that the header goes *here* — so filling it is the
 * edit, not opening a second header line above it. The slot stops at the colon
 * where there is one, because a legend is a decision about voices that has
 * nothing to do with the part being named: `[: Ari]` becomes `[Chorus: Ari]`.
 */
function emptyHeaderNameSlot(text: string, header: SectionHeader): TextRange | undefined {
	if (!header.closed || !headerNameIsEmpty(header)) {
		return undefined;
	}
	const from = header.from + 1;
	const to = header.legendRange ? text.lastIndexOf(':', header.legendRange.from) : header.to - 1;
	return to >= from ? { from, to } : undefined;
}

/** Insert a chosen section header as one undoable atomic edit. */
export function insertSectionHeader(request: InsertSectionHeaderRequest): DocumentTransformResult {
	if (request.document.text !== request.text) {
		return { status: 'blocked', reason: 'invalid-range' };
	}
	const sectionIndex = request.document.sections.findIndex(
		(candidate) => candidate.from === request.sectionFrom
	);
	const section = request.document.sections[sectionIndex];
	const headerName = request.headerName.trim();
	const nameSlot = section?.header ? emptyHeaderNameSlot(request.text, section.header) : undefined;
	const targetIsLineStart =
		request.sectionFrom === 0 ||
		(request.sectionFrom > 0 &&
			(request.text[request.sectionFrom - 1] === '\n' ||
				(request.text[request.sectionFrom - 1] === '\r' &&
					request.text[request.sectionFrom] !== '\n')));
	// A section that already names its part is not something a picker overwrites.
	// An empty one is the exception. When no section begins at the target, a line
	// boundary creates one: empty documents and blank lines do not exist in the
	// parsed section list, while a lyric line inside an already headed section
	// needs to be split out before it can receive its own header.
	if (
		(section?.header && !nameSlot) ||
		(!section &&
			(!Number.isInteger(request.sectionFrom) ||
				request.sectionFrom < 0 ||
				request.sectionFrom > request.text.length ||
				!targetIsLineStart)) ||
		headerName.length === 0
	) {
		return { status: 'blocked', reason: 'invalid-range' };
	}

	const ordinal = request.ordinal === undefined ? '' : ` ${request.ordinal}`;
	const insertionFrom = section?.from ?? request.sectionFrom;
	const edits: TextEdit[] = [
		nameSlot
			? { from: nameSlot.from, to: nameSlot.to, insert: `${headerName}${ordinal}` }
			: {
					from: insertionFrom,
					to: insertionFrom,
					insert: `[${headerName}${ordinal}]${lineEndingForInsertion(request.text, insertionFrom)}`
				}
	];
	if (request.ordinal !== undefined && request.numberedHeaderTerms?.length) {
		const matchingTerms = new Set(
			request.numberedHeaderTerms.map((term) => term.trim().toLocaleLowerCase())
		);
		for (const followingSection of request.document.sections.filter(
			(candidate) => candidate.from > insertionFrom
		)) {
			const header = followingSection.header;
			if (
				!header?.ordinalRange ||
				header.ordinal === undefined ||
				header.ordinal < request.ordinal ||
				!matchingTerms.has(header.namePart.trim().toLocaleLowerCase())
			) {
				continue;
			}
			edits.push({
				from: header.ordinalRange.from,
				to: header.ordinalRange.to,
				insert: String(header.ordinal + 1)
			});
		}
	}

	return {
		status: 'applied',
		edit: makeAtomicEdit(request.revision, request.text.length, edits)
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

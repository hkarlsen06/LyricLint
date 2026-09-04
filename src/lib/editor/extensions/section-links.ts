// Decision record: docs/subsystems/section-links.md — read it before changing this file, and update it with any behavior change.
import { invertedEffects, isolateHistory } from '@codemirror/commands';
import {
	Annotation,
	EditorState,
	RangeSet,
	RangeValue,
	StateEffect,
	StateField
} from '@codemirror/state';
import type { ChangeDesc, Extension, Range, TransactionSpec } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { randomId } from '$lib/core/random-id.js';
import { parseDocument } from '$lib/core/parser.js';
import type {
	AtomicDocumentEdit,
	LinkDifference,
	LinkHole,
	ParsedDocument,
	SectionHeader,
	SectionLink,
	SectionLinkChoice,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import {
	alignBodies,
	expandOverHoles,
	holeContaining,
	translateSpan,
	widenToRuns
} from '$lib/core/link-shape.js';
import { narrowEdit } from '$lib/performers/transform.js';
import type { SectionLinkOrigin } from '../contracts.js';
import { sectionBodyRange } from '../section-links.js';
import {
	editorCallbacksField,
	editorComposingField,
	parsedDocumentForState
} from './editor-state.js';
import { singleChangedRange } from './header-rename.js';
import { HoverIntent } from './hover-intent.js';
import { pressed } from './widget-press.js';

/**
 * Membership in one link group, carried on a range over the header's own line.
 *
 * A range over the line's text rather than a point at its start, which is the
 * distinction `line-anchors.ts` documents at length: a point sits on the
 * *boundary* of the deletion that removes the line, and a boundary is not
 * inside anything, so a deleted section would leave its membership behind to
 * be inherited by whatever line moved up into its place.
 */
class LinkValue extends RangeValue {
	constructor(readonly group: string) {
		super();
	}

	override eq(other: RangeValue): boolean {
		return other instanceof LinkValue && other.group === this.group;
	}
}

/** Replace every link, for a draft being opened. */
export const setSectionLinksEffect = StateEffect.define<readonly SectionLink[]>();

/**
 * Make these header positions one group, in the coordinates of the document
 * *before* this transaction's changes.
 *
 * Before, because the effect travels in the same transaction as any edit it
 * comes with — one press has to be one undo — and the picker chose its headers
 * against the document it was looking at. The field maps them.
 *
 * One effect covers linking, re-linking and unlinking: every named header
 * leaves whatever group it was in first, and fewer than two survivors is not a
 * link, so a lone header simply comes loose.
 */
export const setSectionLinkEffect = StateEffect.define<{ headers: readonly number[] }>();

/**
 * Replace every divergent run in the document, in pre-change coordinates.
 *
 * The whole list rather than one group's, because the caller already holds the
 * state it needs to compute it and a field that had to work out which runs
 * belonged to the group being changed would have to parse the document to find
 * out — twice, once here and once in the caller.
 */
export const setLinkHolesEffect = StateEffect.define<readonly TextRange[]>();

/**
 * Keep this programmatic edit in the addressed linked copy. Unlike the
 * one-shot UI mode, the span travels on the edit itself, so resolving a model
 * proposal and applying it cannot be split by a selection change.
 */
export const applyOnlyHereAnnotation = Annotation.define<TextRange>();

/**
 * The linked section the user is editing independently.
 *
 * This is a working mode rather than draft content: its header maps through
 * edits, survives caret movement, and is deliberately not persisted.
 */
interface TypeOnlyHereState {
	header: number;
}

const setTypeOnlyHereEffect = StateEffect.define<TypeOnlyHereState | undefined>();

/** Marks the transaction that consumed `Type only here` and changed link shape. */
const typeOnlyHereAppliedEffect = StateEffect.define<null>();

/**
 * Put the groups and their divergent runs back exactly as they were, in the
 * coordinates of the document the effect lands in.
 *
 * This is the history's, not the picker's. Undo restores the *words* by
 * reversing changes, and a `StateField` reversed nothing — so deleting a linked
 * section and pressing undo brought the section back with the link silently
 * gone, which is a half-reversal and the worst kind. The runs travel with the
 * membership for the same reason: undoing the press that made two lines agree
 * has to bring back the difference it closed.
 *
 * The `map` is not optional decoration: an effect stored in the history with no
 * `map` is **dropped** the moment it has to be mapped through a later change,
 * which is most of the time and fails silently.
 */
const restoreSectionLinksEffect = StateEffect.define<{
	groups: readonly (readonly number[])[];
	holes: readonly TextRange[];
}>({
	map: (value, changes) => ({
		groups: value.groups.map((group) => group.map((pos) => changes.mapPos(pos, 1))),
		holes: value.holes.map((hole) => ({
			from: changes.mapPos(hole.from, -1),
			to: changes.mapPos(hole.to, 1)
		}))
	})
});

function clamp(state: EditorState, pos: number): number {
	return Math.min(Math.max(pos, 0), state.doc.length);
}

function rebuild(
	state: EditorState,
	groups: Iterable<[string, Iterable<number>]>
): RangeSet<LinkValue> {
	const ranges: Range<LinkValue>[] = [];
	for (const [group, positions] of groups) {
		const starts = new Set<number>();
		for (const position of positions) {
			starts.add(state.doc.lineAt(clamp(state, position)).from);
		}
		if (starts.size < 2) {
			continue;
		}
		const value = new LinkValue(group);
		for (const start of starts) {
			const line = state.doc.lineAt(start);
			ranges.push(value.range(line.from, line.to));
		}
	}
	return RangeSet.of(ranges, true);
}

function groupsOf(links: RangeSet<LinkValue>): Map<string, number[]> {
	const groups = new Map<string, number[]>();
	const cursor = links.iter();
	while (cursor.value) {
		const positions = groups.get(cursor.value.group) ?? [];
		positions.push(cursor.from);
		groups.set(cursor.value.group, positions);
		cursor.next();
	}
	return groups;
}

/**
 * Drop the members whose header line was wholly erased, before anything is
 * mapped. Map the start forward and the end backward: if they meet, every
 * character the membership described is gone. See `dropErasedAnchors`.
 */
function dropErased(links: RangeSet<LinkValue>, changes: ChangeDesc): RangeSet<LinkValue> {
	const survivors: Range<LinkValue>[] = [];
	const cursor = links.iter();
	while (cursor.value) {
		const erased =
			cursor.to > cursor.from && changes.mapPos(cursor.from, 1) >= changes.mapPos(cursor.to, -1);
		if (!erased) {
			survivors.push(cursor.value.range(cursor.from, cursor.to));
		}
		cursor.next();
	}
	return RangeSet.of(survivors, true);
}

function linksFromLines(state: EditorState, links: readonly SectionLink[]): RangeSet<LinkValue> {
	const groups: [string, number[]][] = [];
	for (const link of links) {
		const positions = (link.lines ?? [])
			.filter((line) => Number.isInteger(line) && line >= 1 && line <= state.doc.lines)
			.map((line) => state.doc.line(line).from);
		if (positions.length >= 2) {
			groups.push([randomId(), positions]);
		}
	}
	return rebuild(state, groups);
}

export const sectionLinkField = StateField.define<RangeSet<LinkValue>>({
	create: () => RangeSet.empty,
	update(value, transaction) {
		let links = transaction.docChanged
			? rebuild(
					transaction.state,
					groupsOf(dropErased(value, transaction.changes).map(transaction.changes))
				)
			: value;

		for (const effect of transaction.effects) {
			if (effect.is(setSectionLinksEffect)) {
				links = linksFromLines(transaction.state, effect.value);
			} else if (effect.is(restoreSectionLinksEffect)) {
				// Already in this document's coordinates: the history mapped it on the
				// way here, which is exactly what the effect's own `map` is for.
				links = rebuild(
					transaction.state,
					effect.value.groups.map((group): [string, readonly number[]] => [randomId(), group])
				);
			} else if (effect.is(setSectionLinkEffect)) {
				const seated = effect.value.headers.map(
					(header) =>
						transaction.state.doc.lineAt(
							clamp(transaction.state, transaction.changes.mapPos(header, 1))
						).from
				);
				const claimed = new Set(seated);
				const groups: [string, number[]][] = [];
				for (const [group, positions] of groupsOf(links)) {
					const kept = positions.filter((position) => !claimed.has(position));
					if (kept.length > 0) {
						groups.push([group, kept]);
					}
				}
				groups.push([randomId(), seated]);
				links = rebuild(transaction.state, groups);
			}
		}

		return links;
	}
});

/**
 * Carry the divergent runs through an edit, dropping the ones the edit wrote
 * over.
 *
 * The rule is one line and it is the whole invariant: a run survives a change
 * that is **contained** in it and dies to a change that merely **overlaps** it.
 *
 * Contained is the user editing the words they had already set aside — the run
 * absorbs it and nothing is carried to the peers. Overlapping is an edit that
 * reached across the run's edge, which is the user writing over a difference,
 * and `expandOverHoles` has already widened the mirrored span to swallow the
 * same run in every other copy. So the two rules name the same set from
 * opposite ends, and the counts stay equal without anything having to be
 * counted.
 *
 * The ends map outwards, `from` backwards and `to` forwards, so a run is greedy
 * at its edges: typing at the end of a word that was deliberately this copy's
 * own leaves it this copy's own.
 */
function carryHoles(holes: readonly TextRange[], changes: ChangeDesc): TextRange[] {
	if (holes.length === 0) {
		return [];
	}
	const doomed = new Set<number>();
	changes.iterChangedRanges((fromA, toA) => {
		holes.forEach((hole, index) => {
			const overlaps = fromA < hole.to && hole.from < toA;
			const contained = hole.from <= fromA && toA <= hole.to;
			if (overlaps && !contained) {
				doomed.add(index);
			}
		});
	});
	return holes
		.filter((_, index) => !doomed.has(index))
		.map((hole) => ({
			from: changes.mapPos(hole.from, -1),
			to: changes.mapPos(hole.to, 1)
		}))
		.filter((hole) => hole.from <= hole.to);
}

function sortHoles(holes: readonly TextRange[]): TextRange[] {
	return [...holes].sort((left, right) => left.from - right.from || left.to - right.to);
}

/** Every run this document's linked sections do not keep in step, in document order. */
export const linkHolesField = StateField.define<readonly TextRange[]>({
	create: () => [],
	update(value, transaction) {
		let holes = transaction.docChanged ? carryHoles(value, transaction.changes) : value;
		for (const effect of transaction.effects) {
			if (effect.is(setSectionLinksEffect)) {
				holes = holesFromRecords(transaction.state, effect.value);
			} else if (effect.is(restoreSectionLinksEffect)) {
				holes = sortHoles(effect.value.holes);
			} else if (effect.is(setLinkHolesEffect)) {
				holes = sortHoles(
					effect.value.map((hole) => ({
						from: transaction.changes.mapPos(hole.from, -1),
						to: transaction.changes.mapPos(hole.to, 1)
					}))
				);
			}
		}
		return holes;
	}
});

/** The linked section currently being edited independently, if any. */
export const typeOnlyHereField = StateField.define<TypeOnlyHereState | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setTypeOnlyHereEffect)) {
				return effect.value;
			}
			if (effect.is(setSectionLinksEffect) || effect.is(setSectionLinkEffect)) {
				return undefined;
			}
		}
		if (!value) {
			return undefined;
		}
		return transaction.docChanged
			? { header: transaction.changes.mapPos(value.header, -1) }
			: value;
	}
});

/**
 * Make undo reverse the links along with the words.
 *
 * Every history event carries the groups and their runs as they stood before
 * it, so undoing anything — a deleted section, a difference closed, an unlink
 * that moved no text at all — puts the shape back with the text. Redo works out
 * of the same machinery: the undo transaction records its own before-state on
 * the way past.
 *
 * Emitted whenever links exist or a link effect is in flight, rather than only
 * where the field actually changed. Comparing would mean reading the new state
 * from inside the facet the new state is still being built for; a handful of
 * numbers per history event is the cheaper certainty.
 */
export const sectionLinkHistory = invertedEffects.of((transaction) => {
	const before = transaction.startState.field(sectionLinkField, false);
	const holes = transaction.startState.field(linkHolesField, false) ?? [];
	const linkEffect = transaction.effects.some(
		(effect) =>
			effect.is(setSectionLinkEffect) ||
			effect.is(setLinkHolesEffect) ||
			effect.is(restoreSectionLinksEffect)
	);
	if (!before || (before.size === 0 && !linkEffect)) {
		return [];
	}
	if (!transaction.docChanged && !linkEffect) {
		return [];
	}
	return [restoreSectionLinksEffect.of({ groups: [...groupsOf(before).values()], holes })];
});

/** One member of a group: where its body is, and which parts of it are its own. */
interface MemberShape {
	header: number;
	body: TextRange;
	/** Divergent runs, body-relative and in order. */
	holes: TextRange[];
}

function memberShape(
	parsed: ParsedDocument,
	holes: readonly TextRange[],
	header: number
): MemberShape | undefined {
	const body = sectionBodyRange(parsed, header);
	if (!body) {
		return undefined;
	}
	return {
		header,
		body,
		holes: holes
			.filter((hole) => body.from <= hole.from && hole.to <= body.to)
			.map((hole) => ({ from: hole.from - body.from, to: hole.to - body.from }))
	};
}

/**
 * Header offsets in every group, read off the membership ranges.
 *
 * Takes the parse rather than reaching for one, so a caller that already holds
 * it — which is every caller on a hot path — pays for one.
 */
function memberGroups(state: EditorState, parsed: ParsedDocument): number[][] {
	const links = state.field(sectionLinkField, false);
	if (!links || links.size === 0) {
		return [];
	}
	const groups: number[][] = [];
	for (const positions of groupsOf(links).values()) {
		const headers = positions.flatMap((position) => {
			const line = state.doc.lineAt(clamp(state, position));
			const header = parsed.sections.find(
				(section) =>
					section.header && section.header.from >= line.from && section.header.to <= line.to
			)?.header;
			return header ? [header.from] : [];
		});
		if (headers.length >= 2) {
			groups.push(headers.sort((left, right) => left - right));
		}
	}
	return groups;
}

/**
 * The other members of this header's group, in document order.
 *
 * Exported for sync mode, which needs to know that the section a run has just
 * walked into is the same words as one it has already timed. It answers off the
 * membership ranges alone and never looks at the divergent runs: a peer whose
 * last line is its own is still a peer whose *first* lines were typed once, and
 * a run copying its timings is copying a rhythm rather than any text.
 *
 * Takes the parse rather than reaching for one, like `memberGroups` itself, so
 * a caller on the tap path pays for one.
 */
export function linkedPeerHeaders(
	state: EditorState,
	parsed: ParsedDocument,
	headerFrom: number
): number[] {
	const group = memberGroups(state, parsed).find((headers) => headers.includes(headerFrom));
	return group ? group.filter((header) => header !== headerFrom) : [];
}

/**
 * How far down two linked members a run may pair lines by position.
 *
 * `linkedFill` dates a repeat's lines from a peer's by index, and that
 * arithmetic assumes the two copies share a line structure — which the merge
 * model deliberately does not require: a chorus carrying a line its peer lacks
 * is the shape the whole feature was rebuilt for. Every line at or after such a
 * difference pairs with the wrong peer line, and the time it would take is
 * plausible and wrong by an amount nobody can see — the automatic anchor
 * stamp's failure, arriving through the link. Nothing downstream can catch it:
 * the derived times still increase, so the monotonicity guard passes.
 *
 * A shared run is byte-identical in every member by construction, so pairing is
 * provably safe up to the first divergent run that moves a line boundary — one
 * whose text, in either member, contains a line break. A word-level difference
 * (`my love` against `my friend`) moves nothing and pairs on, which is the
 * common case the fill must keep.
 *
 * It aligns the pair afresh rather than reading the stored runs, and that is
 * the semantics rather than caution. Stored intent is the mirror's question —
 * a mistake against a decision — and the fill is not asking it: what pairs a
 * line with a line is the text as it stands, and a record written without runs
 * (`{ lines: [...] }`, every draft from before differences existed) describes
 * exactly the group this most needs to be true of.
 *
 * Returns each member's own document position for that run's start: line starts
 * strictly *before* it pair one-to-one. `Infinity` where nothing in either copy
 * moves a line boundary, and `undefined` where the pair's shape cannot be
 * described at all, which is a peer no fill should trust.
 */
export function linePairingLimits(
	state: EditorState,
	parsed: ParsedDocument,
	headerFrom: number,
	peerFrom: number
): { own: number; peer: number } | undefined {
	const shapes = groupShape(state, parsed, [headerFrom, peerFrom], { realign: true });
	const own = shapes?.[0];
	const peer = shapes?.[1];
	if (!own || !peer || own.holes.length !== peer.holes.length) {
		return undefined;
	}
	for (let index = 0; index < own.holes.length; index += 1) {
		const ownHole = own.holes[index];
		const peerHole = peer.holes[index];
		if (!ownHole || !peerHole) {
			return undefined;
		}
		const moved = [
			{ member: own, hole: ownHole },
			{ member: peer, hole: peerHole }
		].some(({ member, hole }) =>
			state.doc.sliceString(member.body.from + hole.from, member.body.from + hole.to).includes('\n')
		);
		if (moved) {
			return { own: own.body.from + ownHole.from, peer: peer.body.from + peerHole.from };
		}
	}
	return { own: Infinity, peer: Infinity };
}

/**
 * The shape of one group, re-derived from the words if what is stored cannot
 * describe it.
 *
 * Stored intent wins wherever it is coherent, because an alignment recomputed
 * on every edit cannot tell a mistake from a decision. Re-derivation is for the
 * cases where there is no intent to honour: a group loaded from a draft written
 * before differences existed, or one whose members somehow ended up with
 * different numbers of runs, where every translation downstream would refuse
 * anyway.
 */
function groupShape(
	state: EditorState,
	parsed: ParsedDocument,
	headers: readonly number[],
	options: { realign?: boolean } = {}
): MemberShape[] | undefined {
	const holes = state.field(linkHolesField, false) ?? [];
	const shapes = headers.map((header) => memberShape(parsed, holes, header));
	const members = shapes.filter((shape): shape is MemberShape => shape !== undefined);
	if (members.length !== shapes.length) {
		return undefined;
	}
	// A set that is not already a group has no stored intent to honour, so it is
	// aligned afresh — which is what lets the card show two unlinked choruses what
	// they would disagree on before anything is tied together.
	const existing = memberGroups(state, parsed).find(
		(group) => group.length === headers.length && headers.every((header) => group.includes(header))
	);
	const realign = options.realign ?? !existing;
	const coherent = new Set(members.map((member) => member.holes.length)).size <= 1;
	if (coherent && !realign) {
		return members;
	}
	const bodies = members.map((member) => state.doc.sliceString(member.body.from, member.body.to));
	const aligned = alignBodies(bodies);
	return members.map((member, index) => ({ ...member, holes: aligned[index] ?? [] }));
}

function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
	let cursor = 0;
	let output = '';
	for (const edit of edits) {
		output += text.slice(cursor, edit.from);
		output += edit.insert;
		cursor = edit.to;
	}
	return output + text.slice(cursor);
}

/** Make one peer header carry the source header's exact performer legend. */
function mirroredLegendEdit(
	text: string,
	header: SectionHeader,
	legend: string | undefined
): TextEdit | undefined {
	if (legend === undefined) {
		if (!header.legendRange) return undefined;
		const colon = text.lastIndexOf(':', header.legendRange.from);
		return colon >= header.from
			? { from: colon, to: header.legendRange.to, insert: '' }
			: undefined;
	}
	if (header.legendRange) {
		if (text.slice(header.legendRange.from, header.legendRange.to) === legend) return undefined;
		return { from: header.legendRange.from, to: header.legendRange.to, insert: legend };
	}
	const at = header.closed ? header.to - 1 : header.to;
	return { from: at, to: at, insert: `: ${legend}` };
}

/**
 * Expand a validated performer assignment across one linked section group.
 *
 * The ordinary mirror deliberately refuses scattered edits. Performer
 * assignment is the exception whose meaning is known: its header edit names
 * the slots used by its body edits. Leaving either half local creates markup a
 * linked peer cannot interpret, so every peer receives both halves in the same
 * atomic edit and therefore in the same undo step.
 *
 * Body edits are copied only while they sit wholly in shared text. A passage
 * stored as a deliberate difference stays local, exactly as it does under the
 * ordinary mirror; the legend is still shared because it is the section-wide
 * key for every styled passage that is shared.
 */
export function expandLinkedPerformerEdit(
	state: EditorState,
	edit: AtomicDocumentEdit,
	anchor: number
): AtomicDocumentEdit {
	const parsed = parsedDocumentForState(state);
	const sourceSection = parsed.sections.find(
		(section) =>
			section.header &&
			(section.from === anchor ||
				section.header.from === anchor ||
				(section.from <= anchor && anchor <= section.to))
	);
	const sourceHeader = sourceSection?.header;
	if (!sourceSection || !sourceHeader) return edit;
	if (isTypeOnlyHere(state, sourceHeader.from)) return edit;

	const group = memberGroups(state, parsed).find((headers) => headers.includes(sourceHeader.from));
	if (!group) return edit;
	const ordered = [sourceHeader.from, ...group.filter((header) => header !== sourceHeader.from)];
	const members = groupShape(state, parsed, ordered);
	const source = members?.[0];
	if (!members || !source) return edit;

	const changedText = applyTextEdits(state.doc.toString(), edit.edits);
	const changedSourceHeader = parseDocument(changedText).sections.find(
		(section) => section.header?.from === sourceHeader.from
	)?.header;
	if (!changedSourceHeader) return edit;

	const additions: TextEdit[] = [];
	for (const peer of members.slice(1)) {
		const peerHeader = parsed.sections.find(
			(section) => section.header?.from === peer.header
		)?.header;
		if (!peerHeader) continue;
		const headerEdit = mirroredLegendEdit(
			state.doc.toString(),
			peerHeader,
			changedSourceHeader.legend
		);
		if (headerEdit) additions.push(headerEdit);
	}

	const bodyEdits = edit.edits.filter(
		(change) => source.body.from <= change.from && change.to <= source.body.to
	);
	const sourceLength = source.body.to - source.body.from;
	for (const change of bodyEdits) {
		const relative = {
			from: change.from - source.body.from,
			to: change.to - source.body.from
		};
		if (holeContaining(source.holes, relative.from, relative.to) !== undefined) continue;
		const span = expandOverHoles(source.holes, relative.from, relative.to);
		// Crossing a deliberate difference has no one byte-identical operation to
		// repeat. Preserve the different words instead of turning formatting into a
		// lyric rewrite.
		if (
			span.firstHole !== span.lastHole ||
			span.from !== relative.from ||
			span.to !== relative.to
		) {
			continue;
		}
		for (const peer of members.slice(1)) {
			const target = translateSpan(
				{ holes: source.holes, length: sourceLength },
				{ holes: peer.holes, length: peer.body.to - peer.body.from },
				span
			);
			if (!target) continue;
			const from = peer.body.from + target.from;
			const to = peer.body.from + target.to;
			if (state.doc.sliceString(from, to) === change.insert) continue;
			additions.push({ from, to, insert: change.insert });
		}
	}

	if (additions.length === 0) return edit;
	const edits = [...edit.edits, ...additions].sort(
		(left, right) => left.from - right.from || left.to - right.to
	);
	const precedingDelta = additions
		.filter((change) => change.to <= sourceHeader.from)
		.reduce((delta, change) => delta + change.insert.length - (change.to - change.from), 0);
	const expanded: AtomicDocumentEdit = { ...edit, edits };
	if (edit.selectionAfter) {
		expanded.selectionAfter = {
			anchor: edit.selectionAfter.anchor + precedingDelta,
			head: edit.selectionAfter.head + precedingDelta
		};
	}
	return expanded;
}

/** Body-relative runs put back into document coordinates. */
function absoluteHoles(members: readonly MemberShape[]): TextRange[] {
	return sortHoles(
		members.flatMap((member) =>
			member.holes.map((hole) => ({
				from: member.body.from + hole.from,
				to: member.body.from + hole.to
			}))
		)
	);
}

/** Every hole outside these members, which another group's shape may still need. */
function holesOutside(state: EditorState, members: readonly MemberShape[]): TextRange[] {
	const holes = state.field(linkHolesField, false) ?? [];
	return holes.filter(
		(hole) => !members.some((member) => member.body.from <= hole.from && hole.to <= member.body.to)
	);
}

/** Whether this header still belongs to a coherent linked group. */
export function canTypeOnlyHere(state: EditorState, headerFrom: number): boolean {
	const parsed = parsedDocumentForState(state);
	const group = memberGroups(state, parsed).find((headers) => headers.includes(headerFrom));
	return !!group && !!groupShape(state, parsed, group);
}

export function isTypeOnlyHere(state: EditorState, headerFrom: number): boolean {
	return state.field(typeOnlyHereField, false)?.header === headerFrom;
}

/** Toggle independent editing for one linked section. */
export function typeOnlyHere(view: EditorView, headerFrom: number): boolean {
	if (!canTypeOnlyHere(view.state, headerFrom)) {
		return false;
	}
	const active = isTypeOnlyHere(view.state, headerFrom);
	view.dispatch({
		effects: setTypeOnlyHereEffect.of(active ? undefined : { header: headerFrom }),
		annotations: Transaction.addToHistory.of(false)
	});
	return true;
}

/** Escape's first claim while a local linked-section edit is waiting. */
export function cancelTypeOnlyHere(view: EditorView): boolean {
	if (!view.state.field(typeOnlyHereField, false)) {
		return false;
	}
	view.dispatch({
		effects: setTypeOnlyHereEffect.of(undefined),
		annotations: Transaction.addToHistory.of(false)
	});
	view.state
		.field(editorCallbacksField, false)
		?.onAnnouncement('Editing only this section turned off.');
	return true;
}

/**
 * Close the difference under the caret, so its words are shared again.
 *
 * The former way back from `Type only here`: `Mod-Shift-L` pressed while the
 * old caret marker stood collapsed the one run the caret was
 * in, exactly as the card's replace does per difference — so from the next
 * keystroke the mirror carries edits here again. This copy's wording wins,
 * unless it is empty, in which case the first copy with words does
 * (`winningWording`'s own rule): an erased run rejoined has nothing to offer,
 * and emptying every peer to match it is the one thing rejoining must never do.
 *
 * One transaction, one undo: `sectionLinkHistory` carries the runs back with
 * the words, so undo restores the difference exactly as it stood.
 *
 * The caret stays put where this copy's words did not change, and lands after
 * the arriving words where they did — either way it ends in shared text, which
 * is what retires the marker that taught the press.
 */
export function rejoinLinkedWordsAt(view: EditorView): boolean {
	const state = view.state;
	const caret = state.selection.main;
	if (!caret.empty) return false;
	const pos = caret.head;
	const parsed = parsedDocumentForState(state);
	const group = memberGroups(state, parsed).find((headers) =>
		headers.some((header) => {
			const body = sectionBodyRange(parsed, header);
			return body !== undefined && body.from <= pos && pos <= body.to;
		})
	);
	if (!group) return false;
	const members = groupShape(state, parsed, group);
	if (!members || members.length < 2) return false;
	const member = members.find((shape) => shape.body.from <= pos && pos <= shape.body.to);
	if (!member) return false;
	// The marker's own containment: a run's ends map outwards, so both edges are
	// inside, and a zero-width run at the caret is exactly the case the press is
	// for.
	const index = member.holes.findIndex(
		(hole) => member.body.from + hole.from <= pos && pos <= member.body.from + hole.to
	);
	if (index < 0) return false;

	const text = winningWording(state, members, index, member.header);
	const changes: TextEdit[] = [];
	for (const shape of members) {
		const hole = shape.holes[index];
		if (!hole) continue;
		const from = shape.body.from + hole.from;
		const to = shape.body.from + hole.to;
		if (state.doc.sliceString(from, to) !== text) {
			changes.push({ from, to, insert: text });
		}
	}
	changes.sort((left, right) => left.from - right.from);
	const surviving = members.map((shape) => ({
		...shape,
		holes: shape.holes.filter((_, holeIndex) => holeIndex !== index)
	}));

	// Where the caret ends up, computed the way `linkSections` computes its own
	// landing: edits earlier in the document shift it, and words arriving in
	// this copy put it after them.
	const own = member.holes[index];
	const ownFrom = member.body.from + (own?.from ?? 0);
	const ownTo = member.body.from + (own?.to ?? 0);
	// Not the own change: a zero-width run's own fill sits exactly at `ownFrom`
	// and would otherwise count itself into the shift it is the target of.
	const shift = changes
		.filter((change) => change.to <= ownFrom && !(change.from === ownFrom && change.to === ownTo))
		.reduce((sum, change) => sum + change.insert.length - (change.to - change.from), 0);
	const ownChanged = changes.some((change) => change.from === ownFrom && change.to === ownTo);
	const anchor = ownChanged ? ownFrom + shift + text.length : pos + shift;

	const spec: TransactionSpec = {
		selection: { anchor },
		// Its own history event on both sides, or it is not its own undo: pressed
		// right after typing — which is exactly when it is pressed — the history
		// joined it into the typing's group, and one undo silently took the local
		// words along with the rejoin they had just been shared by.
		annotations: isolateHistory.of('full'),
		effects: [
			// Pre-change coordinates, exactly as `linkSections` emits them: the
			// field maps the list through this transaction's own changes.
			setLinkHolesEffect.of([...holesOutside(state, members), ...absoluteHoles(surviving)]),
			// Rides the notifier every other shape change rides, so the shell's
			// save hears about a difference that closed without the text moving.
			typeOnlyHereAppliedEffect.of(null)
		]
	};
	if (changes.length > 0) spec.changes = changes;
	view.dispatch(spec);
	state
		.field(editorCallbacksField, false)
		?.onAnnouncement(
			'These words are shared with the other linked sections again. Undo brings the difference back.'
		);
	return true;
}

/** Every link, as header line numbers and the runs each member keeps its own. */
export function sectionLinksFor(state: EditorState): SectionLink[] {
	const field = state.field(sectionLinkField, false);
	if (!field) {
		return [];
	}
	const holes = state.field(linkHolesField, false) ?? [];
	const parsed = parsedDocumentForState(state);
	return memberGroups(state, parsed)
		.map((headers) => {
			const lines = headers
				.map((header) => state.doc.lineAt(clamp(state, header)).number)
				.sort((left, right) => left - right);
			const own: LinkHole[] = [];
			for (const header of headers) {
				const body = sectionBodyRange(parsed, header);
				if (!body) continue;
				for (const hole of holes) {
					if (body.from <= hole.from && hole.to <= body.to) {
						const start = state.doc.lineAt(clamp(state, hole.from));
						const end = state.doc.lineAt(clamp(state, hole.to));
						own.push({
							line: start.number,
							column: hole.from - start.from,
							endLine: end.number,
							endColumn: hole.to - end.from
						});
					}
				}
			}
			return own.length > 0 ? { lines, holes: own } : { lines };
		})
		.filter((link) => link.lines.length >= 2)
		.sort((left, right) => (left.lines[0] ?? 0) - (right.lines[0] ?? 0));
}

/** Stored runs put back on the document, dropping any the text no longer has room for. */
function holesFromRecords(state: EditorState, links: readonly SectionLink[]): TextRange[] {
	const holes: TextRange[] = [];
	for (const link of links) {
		for (const hole of link.holes ?? []) {
			if (
				!Number.isInteger(hole.line) ||
				hole.line < 1 ||
				hole.line > state.doc.lines ||
				!Number.isInteger(hole.endLine) ||
				hole.endLine < 1 ||
				hole.endLine > state.doc.lines
			) {
				continue;
			}
			const start = state.doc.line(hole.line);
			const end = state.doc.line(hole.endLine);
			const from = Math.min(start.from + Math.max(0, hole.column), start.to);
			const to = Math.min(end.from + Math.max(0, hole.endColumn), end.to);
			if (from <= to) {
				holes.push({ from, to });
			}
		}
	}
	return sortHoles(holes);
}

/** What the picker shows in its second list, read off the group's shape. */
export function linkDifferencesFor(
	state: EditorState,
	headers: readonly number[],
	options: { realign?: boolean } = {}
): LinkDifference[] {
	const members = groupShape(state, parsedDocumentForState(state), headers, options);
	if (!members || members.length < 2) {
		return [];
	}
	const count = members[0]?.holes.length ?? 0;
	return Array.from({ length: count }, (_, index) => ({
		index,
		wordings: members.map((member) => {
			const hole = member.holes[index];
			const from = member.body.from + (hole?.from ?? 0);
			const to = member.body.from + (hole?.to ?? 0);
			// The **shared runs** either side, not the rest of the line.
			//
			// Clipped to the line, the context stopped at whatever line boundary each
			// copy happened to have — and a run that spans lines ends on a different
			// line in each copy, so the text drawn beside it was different text. On
			// screen that put a word inside one copy's run and in another copy's
			// context, with the insertion caret sitting in front of a word the other
			// copy was showing as shared. A shared run is identical in every member
			// by construction, which is the only thing that makes the versions line
			// up under one another.
			const previous = index === 0 ? 0 : (member.holes[index - 1]?.to ?? 0);
			const next = member.holes[index + 1]?.from ?? member.body.to - member.body.from;
			return {
				headerFrom: member.header,
				text: hole ? state.doc.sliceString(from, to) : '',
				before: state.doc.sliceString(member.body.from + previous, from),
				after: state.doc.sliceString(to, member.body.from + next)
			};
		})
	}));
}

/**
 * The wording a difference collapses to when the user stops keeping it.
 *
 * The source's, because that is the copy the card was opened from and the words
 * the user is looking at — unless the source has nothing there, which is the one
 * case where the section in front of the user cannot win: an untyped
 * `[Chorus 3]` is a request to be *filled*, and letting its emptiness win would
 * answer it by emptying the chorus that had the words. The group, never the
 * document, because a copy the user did not tick is not part of what they asked
 * for.
 */
function winningWording(
	state: EditorState,
	members: readonly MemberShape[],
	index: number,
	replaceFrom?: number
): string {
	const textFor = (member: MemberShape): string => {
		const hole = member.holes[index];
		return hole
			? state.doc.sliceString(member.body.from + hole.from, member.body.from + hole.to)
			: '';
	};
	// Whichever copy the user named, and the opened one only as the default.
	const source = members.find((member) => member.header === replaceFrom) ?? members[0];
	const own = source ? textFor(source) : '';
	if (own.trim().length > 0 || !source) {
		return own;
	}
	return members.map(textFor).find((text) => text.trim().length > 0) ?? own;
}

/**
 * Tie these sections together, keeping every word they already disagree on.
 *
 * This is the correction the whole feature turned on. A group used to be one
 * body repeated, so linking meant overwriting every copy from the one in front
 * of the user — which made a chorus that differed by a single line unlinkable,
 * because the only offer on the table destroyed the difference the user meant
 * to keep. Linking now writes nothing at all by default: `alignBodies` works
 * out which words the copies already share, those become the shared runs, and
 * everything else is set aside as each copy's own.
 *
 * Making copies agree is still available and is now expressed in the same call
 * — `keepDifferent[i] === false` collapses difference `i` to one wording — so
 * the destructive act is something the user asks for per difference rather than
 * the price of linking at all.
 */
export function linkSections(view: EditorView, choice: SectionLinkChoice): number {
	const { headers } = choice;
	const parsed = parsedDocumentForState(view.state);
	if (headers.length < 2) {
		view.dispatch({
			selection: { anchor: headers[0] ?? view.state.selection.main.head },
			effects: [
				setSectionLinkEffect.of({ headers: [...headers] }),
				setLinkHolesEffect.of(
					holesOutside(view.state, groupShape(view.state, parsed, headers) ?? [])
				)
			]
		});
		return headers.length;
	}

	// `groupShape` decides for itself whether this set already has a shape worth
	// honouring: a membership that is changing is aligned afresh, while a group
	// answering only for its own differences keeps the intent it carries.
	const members = groupShape(view.state, parsed, headers);
	if (!members) {
		return 0;
	}

	const shaped = members.map((member) => ({ ...member, holes: [...member.holes] }));

	// The answer about existing differences is resolved against the shape the
	// card was showing, *before* a new one is added — inserting first would shift
	// every index the user's ticks were given against, silently, and collapse the
	// wrong difference.
	const changes: TextEdit[] = [];
	const keep = choice.keepDifferent;
	const surviving: MemberShape[] = shaped.map((member) => ({ ...member, holes: [] }));
	const count = shaped[0]?.holes.length ?? 0;
	for (let index = 0; index < count; index += 1) {
		const kept = keep?.[index] ?? true;
		if (kept) {
			shaped.forEach((member, position) => {
				const hole = member.holes[index];
				if (hole) surviving[position]?.holes.push(hole);
			});
			continue;
		}
		const text = winningWording(view.state, shaped, index, choice.replaceFrom);
		for (const member of shaped) {
			const hole = member.holes[index];
			if (!hole) continue;
			const from = member.body.from + hole.from;
			const to = member.body.from + hole.to;
			if (view.state.doc.sliceString(from, to) !== text) {
				changes.push({ from, to, insert: text });
			}
		}
	}
	changes.sort((left, right) => left.from - right.from);

	// Translated against the shape as it stood, because that is the layout the
	// selection's offsets were measured in; the run then joins the survivors and
	// the effect carries it in the same pre-change coordinates every other run is
	// carried in, so closing a neighbouring difference shifts it correctly.
	if (choice.makeDifferent) {
		addDifference(shaped, surviving, choice.makeDifferent);
	}

	// The header stops being selected, and that is load-bearing rather than
	// tidiness: the card opened *because* the header was selected whole, and the
	// selection survives the edit, so leaving it there would reopen the card the
	// user just answered on the next settled anchor report. A collapsed selection
	// reports no anchor at all.
	const opened = headers[0] ?? 0;
	const caret =
		opened +
		changes
			.filter((change) => change.to <= opened)
			.reduce((shift, change) => shift + change.insert.length - (change.to - change.from), 0);

	const spec: TransactionSpec = {
		selection: { anchor: caret },
		effects: [
			setSectionLinkEffect.of({ headers: [...headers] }),
			setLinkHolesEffect.of([...holesOutside(view.state, shaped), ...absoluteHoles(surviving)])
		]
	};
	if (changes.length > 0) spec.changes = changes;
	view.dispatch(spec);
	return headers.length;
}

/**
 * Set a span of the source aside as its own, and the words facing it in every
 * peer with it.
 *
 * The span is translated rather than searched for, through the same arithmetic
 * the mirror uses: a position in shared text is the same distance from the
 * nearest difference in every copy, so "these five characters" means the same
 * five characters everywhere without a word of either copy being compared.
 */
function addDifference(
	members: MemberShape[],
	into: MemberShape[],
	span: TextRange,
	allowEmpty = false
): boolean {
	const source = members[0];
	if (!source) {
		return false;
	}
	const relative = { from: span.from - source.body.from, to: span.to - source.body.from };
	if (
		relative.from < 0 ||
		relative.to > source.body.to - source.body.from ||
		(allowEmpty ? relative.from > relative.to : relative.from >= relative.to) ||
		holeContaining(source.holes, relative.from, relative.to) !== undefined
	) {
		return false;
	}
	let widenedFrom = relative.from;
	let widenedTo = relative.to;
	for (const hole of source.holes) {
		if (hole.to >= widenedFrom && hole.from <= widenedTo) {
			widenedFrom = Math.min(widenedFrom, hole.from);
			widenedTo = Math.max(widenedTo, hole.to);
		}
	}
	let firstHole = 0;
	while (firstHole < source.holes.length && (source.holes[firstHole]?.to ?? 0) < widenedFrom) {
		firstHole += 1;
	}
	let lastHole = firstHole;
	while (lastHole < source.holes.length && (source.holes[lastHole]?.from ?? 0) <= widenedTo) {
		lastHole += 1;
	}
	const widened = { from: widenedFrom, to: widenedTo, firstHole, lastHole };
	if (widened.firstHole !== widened.lastHole) {
		// The selection reached across a difference that is already there, so what
		// it names is not one new run but a rewrite of several. Left alone.
		return false;
	}
	const sourceLength = source.body.to - source.body.from;
	const added = members.map((member) =>
		member === source
			? relative
			: translateSpan(
					{ holes: source.holes, length: sourceLength },
					{ holes: member.holes, length: member.body.to - member.body.from },
					widened
				)
	);
	// All or none. A run that landed in some copies and not others would leave the
	// group with different counts, which every translation downstream refuses —
	// the link would go quiet rather than fail, which is the worse failure.
	if (added.some((range) => !range)) {
		return false;
	}
	added.forEach((range, position) => {
		const member = into[position];
		if (!range || !member) return;
		member.holes.push(range);
		member.holes.sort((left, right) => left.from - right.from || left.to - right.to);
	});
	return true;
}

/**
 * Repeat an edit made in one linked section in every other section of its group.
 *
 * Appended to the transaction that caused it, the way `headerRenameFilter`
 * mirrors a performer's name: the document is never briefly inconsistent, one
 * snapshot is emitted, and one undo restores every section at once. Undo, redo
 * and IME composition are exempt so history replays byte for byte.
 *
 * What is carried is a span of *shared* text, not the whole body. An edit that
 * lands wholly inside one of the copy's own runs is left where it was made —
 * that is what makes two choruses differing by a line linkable at all. An edit
 * that reaches across such a run's edge takes the run with it, in every copy,
 * because writing over a difference is how a difference is ended.
 *
 * Only a single contiguous edit inside exactly one member's body is mirrored.
 * An edit that reaches a header, spans two sections, or arrives scattered across
 * the document is a restructuring rather than a rewrite of the words, and
 * guessing at those is how a link would eat work the user meant to keep.
 */
/**
 * Turn the edited span into one local run in every member.
 *
 * Existing runs touched by the edit are folded into it; untouched runs and the
 * shared words between them remain separate. This is the smallest coherent
 * shape the edit can leave behind, including insertions represented by an
 * initially zero-width run.
 */
function localizeSpan(members: readonly MemberShape[], span: TextRange): MemberShape[] | undefined {
	const source = members[0];
	if (!source) return undefined;
	const relative = { from: span.from - source.body.from, to: span.to - source.body.from };
	if (
		relative.from < 0 ||
		relative.from > relative.to ||
		relative.to > source.body.to - source.body.from
	) {
		return undefined;
	}
	if (holeContaining(source.holes, relative.from, relative.to) !== undefined) {
		return members.map((member) => ({ ...member, holes: [...member.holes] }));
	}
	const widened = expandOverHoles(source.holes, relative.from, relative.to);
	const sourceLength = source.body.to - source.body.from;
	const additions = members.map((member) =>
		member === source
			? { from: widened.from, to: widened.to }
			: translateSpan(
					{ holes: source.holes, length: sourceLength },
					{ holes: member.holes, length: member.body.to - member.body.from },
					widened
				)
	);
	if (additions.some((addition) => !addition)) return undefined;
	return members.map((member, index) => ({
		...member,
		holes: [
			...member.holes.slice(0, widened.firstHole),
			additions[index]!,
			...member.holes.slice(widened.lastHole)
		]
	}));
}

interface BoundaryExtension {
	members: readonly MemberShape[];
	text: string;
	sourceRange: TextRange;
	local: boolean;
	finalHole?: number;
	typeOnlyHere: boolean;
}

/**
 * A lyric appended after Enter first left the old body's right edge.
 *
 * The bare terminal line break is structural and stays local: until something
 * is written after it, it may be the gap before the next section. If ordinary
 * lyric text follows, the post-change parse extends the same section across
 * that gap. At that point the intent is no longer ambiguous, so the whole new
 * tail can become shared in one edit to every peer.
 *
 * A header opening does not qualify because it makes a new parsed section; the
 * old body's end stays where it was. A boundary inside a final divergent run
 * also stays local, preserving the ordinary greedy-edge rule for differences.
 */
function boundaryExtension(
	transaction: Transaction,
	parsed: ParsedDocument,
	change: TextRange
): BoundaryExtension | undefined {
	if (change.from !== change.to) return undefined;
	const after = parsedDocumentForState(transaction.state);
	const groups = memberGroups(transaction.startState, parsed);
	for (const group of groups) {
		for (const header of group) {
			const body = sectionBodyRange(parsed, header);
			if (!body || body.to >= change.from) continue;
			const gap = transaction.startState.doc.sliceString(body.to, change.from);
			if (!/[\r\n]/u.test(gap) || !/^[\t\r\n ]+$/u.test(gap)) continue;

			const mappedHeader = transaction.changes.mapPos(header, -1);
			const nextBody = sectionBodyRange(after, mappedHeader);
			const mappedEnd = transaction.changes.mapPos(body.to, -1);
			const changedEnd = transaction.changes.mapPos(change.to, 1);
			if (!nextBody || nextBody.to <= mappedEnd || nextBody.to < changedEnd) continue;

			const ordered = [header, ...group.filter((candidate) => candidate !== header)];
			const members = groupShape(transaction.startState, parsed, ordered);
			const source = members?.[0];
			if (!members || !source) continue;
			const sourceLength = source.body.to - source.body.from;
			const finalHole = holeContaining(source.holes, sourceLength, sourceLength);
			const typeOnly = isTypeOnlyHere(transaction.startState, header);

			const text = transaction.newDoc.sliceString(mappedEnd, nextBody.to);
			if (text.length > 0) {
				return {
					members,
					text,
					// Pre-change coordinates, like every `setLinkHolesEffect` value.
					// Mapping its right edge forward takes in the text being inserted.
					sourceRange: { from: body.to, to: change.to },
					local: typeOnly || finalHole !== undefined,
					finalHole,
					typeOnlyHere: typeOnly
				};
			}
		}
	}
	return undefined;
}

/** Carry a shared extension, or record a local one without touching its peers. */
function mirrorBoundaryExtension(
	transaction: Transaction,
	extension: BoundaryExtension
): TransactionSpec | undefined {
	if (extension.local) {
		const holes = extension.members.flatMap((member, memberIndex) => {
			const mapped = member.holes.map((hole) => ({
				from: member.body.from + hole.from,
				to: member.body.from + hole.to
			}));
			if (extension.finalHole !== undefined) {
				if (memberIndex === 0 && mapped[extension.finalHole]) {
					mapped[extension.finalHole] = {
						...mapped[extension.finalHole],
						to: extension.sourceRange.to
					};
				}
				return mapped;
			}
			const at = member.body.to;
			mapped.push(memberIndex === 0 ? extension.sourceRange : { from: at, to: at });
			return mapped;
		});
		const outside = holesOutside(transaction.startState, extension.members);
		return {
			effects: [
				setLinkHolesEffect.of([...outside, ...holes]),
				...(extension.typeOnlyHere ? [typeOnlyHereAppliedEffect.of(null)] : [])
			]
		};
	}
	const edits = extension.members.slice(1).map((member) => {
		const at = transaction.changes.mapPos(member.body.to, 1);
		return { from: at, to: at, insert: extension.text };
	});
	if (edits.length === 0) return undefined;
	edits.sort((left, right) => left.from - right.from);
	return { changes: edits, sequential: true };
}

export function sectionLinkMirror(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		if (!transaction.docChanged) {
			return transaction;
		}
		const links = transaction.startState.field(sectionLinkField, false);
		if (!links || links.size === 0) {
			return transaction;
		}
		const userEvent = transaction.annotation(Transaction.userEvent);
		if (userEvent === 'undo' || userEvent === 'redo') {
			return transaction;
		}
		const onlyHere = transaction.annotation(applyOnlyHereAnnotation);
		const change = singleChangedRange(transaction.changes);
		const parsed = parsedDocumentForState(transaction.startState);
		if (!onlyHere && !change) {
			const active = transaction.startState.field(typeOnlyHereField, false);
			if (!active) return transaction;
			const group = memberGroups(transaction.startState, parsed).find((headers) =>
				headers.includes(active.header)
			);
			const section = parsed.sections.find((candidate) => candidate.header?.from === active.header);
			if (!group || !section) return transaction;
			const ordered = [active.header, ...group.filter((header) => header !== active.header)];
			const members = groupShape(transaction.startState, parsed, ordered);
			const source = members?.[0];
			if (!members || !source) return transaction;
			const changes: TextRange[] = [];
			let insideSection = true;
			transaction.changes.iterChangedRanges((from, to) => {
				if (from < section.from || to > section.to) insideSection = false;
				if (source.body.from <= from && to <= source.body.to) changes.push({ from, to });
			});
			if (!insideSection || changes.length === 0) return transaction;
			let localMembers: MemberShape[] = members;
			for (const range of changes) {
				const localized = localizeSpan(localMembers, range);
				if (!localized) return transaction;
				localMembers = localized;
			}
			return [
				transaction,
				{
					effects: [
						setLinkHolesEffect.of([
							...holesOutside(transaction.startState, members),
							...absoluteHoles(localMembers)
						]),
						typeOnlyHereAppliedEffect.of(null)
					]
				}
			];
		}
		const addressed = onlyHere ?? change!;
		if (
			onlyHere &&
			(!Number.isSafeInteger(onlyHere.from) ||
				!Number.isSafeInteger(onlyHere.to) ||
				onlyHere.from < 0 ||
				onlyHere.from > onlyHere.to ||
				onlyHere.to > transaction.startState.doc.length)
		) {
			throw new RangeError('The local linked-section edit has an invalid range.');
		}
		if (onlyHere) {
			let insideAddressedRange = true;
			transaction.changes.iterChangedRanges((from, to) => {
				if (from < onlyHere.from || to > onlyHere.to) insideAddressedRange = false;
			});
			if (!insideAddressedRange) {
				throw new RangeError('The local linked-section edit leaves its addressed range.');
			}
		}

		if (!onlyHere && !transaction.startState.field(editorComposingField, false)) {
			const extension = boundaryExtension(transaction, parsed, change!);
			const mirrored = extension ? mirrorBoundaryExtension(transaction, extension) : undefined;
			if (mirrored) return [transaction, mirrored];
		}

		const group = memberGroups(transaction.startState, parsed).find((headers) =>
			headers.some((header) => {
				const body = sectionBodyRange(parsed, header);
				return body && body.from <= addressed.from && addressed.to <= body.to;
			})
		);
		if (!group) {
			if (onlyHere) {
				const changedInsideLinkedMember = memberGroups(transaction.startState, parsed).some(
					(headers) =>
						headers.some((header) => {
							const body = sectionBodyRange(parsed, header);
							if (!body) return false;
							let inside = false;
							transaction.changes.iterChangedRanges((from, to) => {
								if (body.from <= from && to <= body.to) inside = true;
							});
							return inside;
						})
				);
				if (changedInsideLinkedMember) {
					throw new RangeError('A local edit must address one linked section body.');
				}
			}
			return transaction;
		}
		// The edited copy leads, because every offset below is measured from it.
		const ordered = [
			...group.filter((header) => {
				const body = sectionBodyRange(parsed, header);
				return body && body.from <= addressed.from && addressed.to <= body.to;
			}),
			...group.filter((header) => {
				const body = sectionBodyRange(parsed, header);
				return !(body && body.from <= addressed.from && addressed.to <= body.to);
			})
		];
		const members = groupShape(transaction.startState, parsed, ordered);
		const source = members?.[0];
		if (!members || !source) {
			return transaction;
		}

		if (onlyHere) {
			const relative = {
				from: onlyHere.from - source.body.from,
				to: onlyHere.to - source.body.from
			};
			// It is already local. The marker effect still makes the shell persist
			// any positions mapped by the edit.
			if (holeContaining(source.holes, relative.from, relative.to) !== undefined) {
				return [transaction, { effects: typeOnlyHereAppliedEffect.of(null) }];
			}
			const localMembers = members.map((member) => ({
				...member,
				holes: [...member.holes]
			}));
			if (!addDifference(members, localMembers, onlyHere, true)) {
				throw new RangeError('The proposal cannot become one linked-section difference.');
			}
			return [
				transaction,
				{
					effects: [
						setLinkHolesEffect.of([
							...holesOutside(transaction.startState, members),
							...absoluteHoles(localMembers)
						]),
						typeOnlyHereAppliedEffect.of(null)
					]
				}
			];
		}

		const normalChange = change!;
		if (normalChange.from === source.body.to && normalChange.to === source.body.to) {
			const after = parsedDocumentForState(transaction.state);
			const nextBody = sectionBodyRange(after, transaction.changes.mapPos(source.header, -1));
			const oldEnd = transaction.changes.mapPos(source.body.to, -1);
			// A body that did not grow past its old end says the insertion belongs
			// after this section. Most importantly, this is the first Enter used to
			// make room for the next header; carrying it adds stray blank lines to
			// every earlier copy.
			if (!nextBody || nextBody.to <= oldEnd) return transaction;
		}
		const relative = {
			from: normalChange.from - source.body.from,
			to: normalChange.to - source.body.from
		};
		const local = transaction.startState.field(typeOnlyHereField, false);
		if (local?.header === source.header) {
			if (holeContaining(source.holes, relative.from, relative.to) !== undefined) {
				return transaction;
			}
			const localMembers = localizeSpan(members, normalChange);
			if (localMembers) {
				return [
					transaction,
					{
						effects: [
							setLinkHolesEffect.of([
								...holesOutside(transaction.startState, members),
								...absoluteHoles(localMembers)
							]),
							typeOnlyHereAppliedEffect.of(null)
						]
					}
				];
			}
		}
		if (transaction.startState.field(editorComposingField, false)) {
			return transaction;
		}
		if (holeContaining(source.holes, relative.from, relative.to) !== undefined) {
			return transaction;
		}
		const sourceLength = source.body.to - source.body.from;
		// The whole run, not the handful of characters that changed. See
		// `widenToRuns`: a run is identical in every member by definition, so
		// writing all of it cannot drift and repairs a group that already has.
		const span = widenToRuns(
			source.holes,
			sourceLength,
			expandOverHoles(source.holes, relative.from, relative.to)
		);
		const text = transaction.newDoc.sliceString(
			transaction.changes.mapPos(source.body.from + span.from, -1),
			transaction.changes.mapPos(source.body.from + span.to, 1)
		);

		const edits: TextEdit[] = [];
		for (const member of members.slice(1)) {
			const target = translateSpan(
				{ holes: source.holes, length: sourceLength },
				{ holes: member.holes, length: member.body.to - member.body.from },
				span
			);
			if (!target) {
				continue;
			}
			const from = member.body.from + target.from;
			const to = member.body.from + target.to;
			const original = transaction.startState.doc.sliceString(from, to);
			if (original === text) {
				continue;
			}
			// The *span* is still the whole run — that is what makes the write
			// idempotent where the group is in step and a repair where it is not —
			// but the *edit* dispatched is trimmed to where the two texts actually
			// differ, because a change's range is a claim other features read. A
			// line wholly inside a replacement reads as rewritten in
			// `line-anchors.ts`: its anchor survives only through the rescue,
			// re-seated at a position `mapPos` cannot explain, so the playhead
			// follow took every mirrored keystroke for the mark moving and
			// scrolled the reader away from the line they were typing. Old prefix
			// + trimmed slice + old suffix is the run's new text by construction,
			// so the document comes out byte for byte the same; only the claim
			// stops overstating.
			const narrowed = narrowEdit(from, original, text);
			edits.push({
				from: transaction.changes.mapPos(narrowed.from, 1),
				to: transaction.changes.mapPos(narrowed.to, 1),
				insert: narrowed.insert
			});
		}
		if (edits.length === 0) {
			return transaction;
		}
		edits.sort((left, right) => left.from - right.from);
		const mirrored: TransactionSpec = { changes: edits, sequential: true };
		return [transaction, mirrored];
	});
}

/** Keep the shell's persisted copy of link ranges current after apply and undo. */
export function typeOnlyHereNotifier(): Extension {
	return EditorView.updateListener.of((update) => {
		const changed = update.transactions.some((transaction) =>
			transaction.effects.some(
				(effect) => effect.is(typeOnlyHereAppliedEffect) || effect.is(restoreSectionLinksEffect)
			)
		);
		if (changed) {
			update.state.field(editorCallbacksField, false)?.onSectionLinksChanged?.();
		}
	});
}

class SectionLinkMarker extends WidgetType {
	/** The wait a pointer serves before this marker opens its card. */
	private readonly hover = new HoverIntent<() => void>((open) => open());

	constructor(
		readonly headerFrom: number,
		readonly local: boolean
	) {
		super();
	}

	eq(other: SectionLinkMarker): boolean {
		return other.headerFrom === this.headerFrom && other.local === this.local;
	}

	toDOM(view: EditorView): HTMLElement {
		const marker = document.createElement('button');
		marker.type = 'button';
		marker.className = `ll-section-link-marker${this.local ? ' ll-section-link-marker--local' : ''}`;
		marker.textContent = '⇄';
		if (this.local) {
			const status = document.createElement('span');
			status.className = 'll-section-only-status';
			status.textContent = 'Editing this section only';
			status.setAttribute('aria-hidden', 'true');
			marker.append(status);
		}
		marker.setAttribute(
			'aria-label',
			this.local ? 'Edit linked sections, editing only this section' : 'Edit linked sections'
		);
		marker.setAttribute('aria-haspopup', 'dialog');
		// No `aria-keyshortcuts`: `Mod-Shift-L` arms Type only here rather than
		// opening this card, so the marker has no keyboard twin to claim. And no
		// `describeControl` box either, because a hover here is already serving
		// `HoverIntent` toward opening the card itself, and a tooltip racing the
		// surface it names would lose to it or cover it.
		const open = (origin: SectionLinkOrigin) => {
			const line = view.state.doc.lineAt(clamp(view.state, this.headerFrom));
			view.state.field(editorCallbacksField, false)?.onSectionLinkRequest?.(
				{
					range: { from: line.from, to: line.to },
					prefer: 'above'
				},
				origin
			);
		};
		/**
		 * A press, from either device. `aria-haspopup="dialog"` promises exactly
		 * this, and the card it opens takes the focus and hands it back here —
		 * which is what the attribute is a promise of.
		 */
		const byPress: SectionLinkOrigin = {
			takesFocus: true,
			returnFocus: () => {
				if (!marker.isConnected) {
					return false;
				}
				marker.focus();
				return true;
			}
		};
		// Armed with one stable value: `HoverIntent` compares targets by identity,
		// so a fresh closure per `pointerenter` would re-arm the wait forever and a
		// pointer that came to a complete stop would never open anything.
		const openByHover = () => open({ takesFocus: false });
		// Pointing serves the editor's one hover wait and opens a card nobody
		// asked for, so it takes no focus.
		marker.addEventListener('pointerenter', () => this.hover.arm(openByHover));
		marker.addEventListener('pointerleave', () => this.hover.cancel());
		// Bare `focus` opened it once, and that made a document with linked
		// sections untraversable: Tab reached the marker, the card took the focus,
		// Escape gave it to the editor, and the next Tab was back on the same
		// marker. Arriving somewhere is not asking for anything — a press is, from
		// either device. The click path is safe now for the same reason: nothing
		// opens behind it, so there is no card already being answered for a second
		// `open()` to reset.
		marker.addEventListener('click', () => {
			this.hover.cancel();
			open(byPress);
		});
		pressed(marker, () => {
			this.hover.cancel();
			open(byPress);
		});
		return marker;
	}

	// The marker is rebuilt whenever its header moves or the group changes; a
	// wait armed against the old one must not fire against the new.
	destroy(): void {
		this.hover.cancel();
	}
}

/**
 * Mark linked headers, and the words inside them that are each copy's own.
 *
 * A divergent run is a `Decoration.mark` and never a widget, for the reason the
 * `⇄` on a header is a widget only because it sits outside the text: clean
 * lyrics on the clipboard are this application's entire output, and a mark adds
 * nothing to a copy. It is drawn as a dotted underline because every other
 * underline in the editor is wavy and belongs to a diagnostic — this is not a
 * finding, it is a note about what an edit here will and will not reach.
 *
 * A run that is empty in this copy draws nothing, because there is nothing
 * there to draw on. The explicit section-only mode is instead named on the
 * header, where it stays visible regardless of the caret or the width of any
 * one divergent run.
 */
export const sectionLinkDecorations = EditorView.decorations.compute(
	['selection', sectionLinkField, linkHolesField, typeOnlyHereField],
	(state): DecorationSet => {
		const field = state.field(sectionLinkField, false);
		if (!field || field.size === 0) {
			return Decoration.none;
		}
		const marks: Range<Decoration>[] = [];
		const local = state.field(typeOnlyHereField, false);
		const cursor = field.iter();
		while (cursor.value) {
			const localHeader = local?.header === cursor.from;
			if (localHeader) {
				marks.push(Decoration.line({ class: 'll-section-only-header' }).range(cursor.from));
			}
			marks.push(
				Decoration.widget({
					widget: new SectionLinkMarker(cursor.from, localHeader),
					side: 1
				}).range(cursor.to)
			);
			cursor.next();
		}
		// Nothing further to draw, and — since this runs on every keystroke in a
		// document that has links — nothing to parse either. A group whose copies
		// agree throughout is the common case and costs this compute the header
		// marks and no more.
		const holes = state.field(linkHolesField, false) ?? [];
		if (holes.length === 0) {
			return Decoration.set(marks, true);
		}
		// One parse, shared with `memberGroups`. A run is only drawn inside a body
		// that is still in a group: unlinking leaves the ex-peer's runs behind in the
		// field, and words underlined by a link that no longer exists are worse than
		// the residue itself.
		const parsed = parsedDocumentForState(state);
		const bodies = memberGroups(state, parsed)
			.flat()
			.flatMap((header) => {
				const body = sectionBodyRange(parsed, header);
				return body ? [body] : [];
			});
		const divergent = Decoration.mark({ class: 'll-link-divergent' });
		for (const hole of holes) {
			if (
				hole.to > hole.from &&
				bodies.some((body) => body.from <= hole.from && hole.to <= body.to)
			) {
				marks.push(divergent.range(hole.from, hole.to));
			}
		}
		return Decoration.set(marks, true);
	}
);

export const sectionLinkTheme = EditorView.baseTheme({
	'.ll-section-link-marker': {
		marginInlineStart: '0.35em',
		padding: '0',
		border: '0',
		appearance: 'none',
		background: 'transparent',
		color: 'var(--color-text-muted)',
		fontFamily: 'inherit',
		fontSize: 'var(--font-size-xs)',
		lineHeight: 'inherit',
		cursor: 'pointer'
	},
	'.ll-section-link-marker:hover, .ll-section-link-marker:focus-visible': {
		color: 'var(--color-text)'
	},
	'.ll-section-link-marker--local': {
		color: 'var(--color-text)',
		fontFamily: 'var(--font-ui)',
		fontWeight: 'var(--font-weight-semibold)'
	},
	'.ll-section-only-status': {
		marginInlineStart: 'var(--space-1-5)',
		color: 'var(--color-danger)',
		whiteSpace: 'nowrap'
	},
	'.ll-section-only-header': {
		background: 'var(--color-danger-surface)',
		boxShadow: 'inset var(--space-1) 0 0 var(--color-danger)'
	},
	// The ordinary caret-row wash is a large inset shadow, so it would otherwise
	// cover both the danger surface and its rail when the caret is on the header.
	'.ll-section-only-header.cm-activeLine': {
		backgroundColor: 'var(--color-danger-surface)',
		boxShadow: 'inset var(--space-1) 0 0 var(--color-danger)'
	},
	'.ll-link-divergent': {
		textDecorationLine: 'underline',
		textDecorationStyle: 'dotted',
		textDecorationThickness: '1px',
		textDecorationColor: 'var(--color-border-strong)',
		textUnderlineOffset: '0.25em'
	}
});

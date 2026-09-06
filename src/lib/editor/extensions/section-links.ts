// Decision record: docs/subsystems/section-links.md — read it before changing this file, and update it with any behavior change.
import { invertedEffects } from '@codemirror/commands';
import {
	Annotation,
	ChangeSet,
	EditorState,
	findClusterBreak,
	RangeSet,
	RangeValue,
	StateEffect,
	StateField
} from '@codemirror/state';
import type { ChangeDesc, Extension, Range, TransactionSpec } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { randomId } from '$lib/core/random-id.js';
import { parseDocument } from '$lib/core/parser.js';
import type {
	AtomicDocumentEdit,
	LinkDifference,
	LinkConnectionPreview,
	LinkPassageOccurrence,
	ParsedDocument,
	SectionHeader,
	SectionLink,
	SectionLinkChoice,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import { alignBodies, holeContaining, translateSpan } from '$lib/core/link-shape.js';
import { narrowEdit } from '$lib/performers/transform.js';
import {
	alignPassages,
	coalescePassages,
	type PassageMember,
	type SharedPassage
} from '$lib/core/link-passages.js';
import { extendPassages } from '$lib/core/link-passage-extension.js';
import { validateLinkPassages } from '$lib/core/link-record.js';
import {
	applyPassageTransfer,
	clearPassageExclusions,
	detachPassageRange,
	mapPassageState,
	passageTargets,
	type PassageState
} from '../link-passage-edits.js';
import { linkingSectionNames, sectionBodyRange } from '../section-links.js';
import {
	editorCallbacksField,
	editorComposingField,
	setComposingEffect,
	parsedDocumentForState
} from './editor-state.js';
import { SectionLinkMarker, type SectionLinkScope } from './section-link-marker.js';
export { sectionLinkTheme } from './section-link-marker.js';

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
export const setSectionLinkEffect = StateEffect.define<{
	headers: readonly number[];
	record?: SectionLink;
	refresh?: boolean;
}>();

const transferPassageEffect = StateEffect.define<readonly PassageMember[]>();
const reconnectPassageEffect = StateEffect.define<readonly PassageMember[]>();
const detachPassageEffect = StateEffect.define<PassageMember>();
/** Complete replacement in the resulting document's coordinates (composition commit). */
const replacePassageStateEffect = StateEffect.define<PassageState>();

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
	passages: PassageState;
}>({
	map: (value, changes) => ({
		groups: value.groups.map((group) => group.map((pos) => changes.mapPos(pos, 1))),
		holes: value.holes.map((hole) => ({
			from: changes.mapPos(hole.from, -1),
			to: changes.mapPos(hole.to, 1)
		})),
		passages: {
			passages: value.passages.passages.map((passage) => ({
				members: passage.members.map((member) => ({
					header: changes.mapPos(member.header, 1),
					from: changes.mapPos(member.from, -1),
					to: changes.mapPos(member.to, 1)
				}))
			})),
			detached: value.passages.detached.map((member) => ({
				header: changes.mapPos(member.header, 1),
				from: changes.mapPos(member.from, -1),
				to: changes.mapPos(member.to, 1)
			}))
		}
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

function emptyPassages(): PassageState {
	return { passages: [], detached: [] };
}

/** A stored passage may cross a temporary blank line, but never another header. */
function passageBounds(parsed: ParsedDocument, header: number): TextRange | undefined {
	const section = parsed.sections.find((candidate) => candidate.header?.from === header);
	if (!section?.header) return undefined;
	const next = parsed.sections.find(
		(candidate) => candidate.header && candidate.header.from > header
	);
	return { from: section.header.to, to: next?.header?.from ?? parsed.text.length };
}

function validPassages(state: EditorState, value: PassageState): PassageState {
	const parsed = parsedDocumentForState(state);
	const groups = memberGroups(state, parsed);
	const ownGroup = new Map(
		groups.flatMap((headers, index) => headers.map((header) => [header, index] as const))
	);
	const valid = (member: PassageMember) => {
		const bounds = passageBounds(parsed, member.header);
		return (
			ownGroup.has(member.header) &&
			bounds &&
			member.from >= bounds.from &&
			member.to <= bounds.to &&
			member.from <= member.to
		);
	};
	const passages: SharedPassage[] = [];
	for (const passage of value.passages) {
		const parts = new Map<number, PassageMember[]>();
		for (const member of passage.members) {
			if (!valid(member)) continue;
			const group = ownGroup.get(member.header)!;
			const members = parts.get(group) ?? [];
			members.push(member);
			parts.set(group, members);
		}
		for (const members of parts.values()) {
			if (
				members.length >= 2 &&
				members.every(
					(member) =>
						state.doc.sliceString(member.from, member.to) ===
						state.doc.sliceString(members[0]!.from, members[0]!.to)
				)
			) {
				passages.push({ members });
			}
		}
	}
	return {
		passages: coalescePassages(passages, value.detached),
		detached: value.detached.filter(valid)
	};
}

function passageRecordFor(state: EditorState, member: PassageMember): LinkPassageOccurrence {
	const from = state.doc.lineAt(clamp(state, member.from));
	const to = state.doc.lineAt(clamp(state, member.to));
	return {
		headerLine: state.doc.lineAt(clamp(state, member.header)).number,
		line: from.number,
		column: member.from - from.from,
		endLine: to.number,
		endColumn: member.to - to.from
	};
}

function passagesFromRecords(state: EditorState, records: readonly SectionLink[]): PassageState {
	const result = emptyPassages();
	const parsed = parsedDocumentForState(state);
	const lineTexts = state.doc.toString().split('\n');
	for (const record of records) {
		const headers = record.lines
			.filter((line) => Number.isInteger(line) && line >= 1 && line <= state.doc.lines)
			.map((line) => state.doc.line(line).from);
		if (headers.length < 2) continue;
		const checked = validateLinkPassages(record, record.lines, lineTexts);
		if (checked.passages !== undefined) {
			const read = (member: LinkPassageOccurrence): PassageMember => ({
				header: state.doc.line(member.headerLine).from,
				from: state.doc.line(member.line).from + member.column,
				to: state.doc.line(member.endLine).from + member.endColumn
			});
			result.passages.push(
				...checked.passages.map((passage) => ({ members: passage.members.map(read) }))
			);
			result.detached.push(...(checked.detached ?? []).map(read));
			continue;
		}
		// Old holes cannot distinguish detected variation from an explicit local
		// edit. Preserve them as exclusions, including deliberately equal wording.
		const holes = holesFromRecords(state, [record]);
		const members = headers.map((header) => memberShape(parsed, holes, header));
		if (members.some((member) => !member)) continue;
		// SAFETY: the preceding guard rejects every missing member.
		const shapes = members as MemberShape[];
		const bodies = shapes.map((member) => state.doc.sliceString(member.body.from, member.body.to));
		if (!record.holes) {
			const aligned = alignBodies(bodies);
			shapes.forEach((member, index) => {
				member.holes = aligned[index] ?? [];
			});
		}
		if (new Set(shapes.map((member) => member.holes.length)).size !== 1) {
			result.detached.push(...shapes.map((member) => ({ header: member.header, ...member.body })));
			continue;
		}
		const count = shapes[0]!.holes.length;
		for (let slot = 0; slot <= count; slot++) {
			const shared = shapes.map((member) => ({
				header: member.header,
				from: member.body.from + (slot === 0 ? 0 : member.holes[slot - 1]!.to),
				to: slot === count ? member.body.to : member.body.from + member.holes[slot]!.from
			}));
			if (
				shared.every(
					(member) =>
						member.from <= member.to &&
						state.doc.sliceString(member.from, member.to) ===
							state.doc.sliceString(shared[0]!.from, shared[0]!.to)
				) &&
				(shared[0]!.from < shared[0]!.to || count === 0)
			)
				result.passages.push({ members: shared });
		}
		result.detached.push(
			...shapes.flatMap((member) =>
				member.holes.map((hole) => ({
					header: member.header,
					from: member.body.from + hole.from,
					to: member.body.from + hole.to
				}))
			)
		);
	}
	return result;
}

/** The editing model; the legacy holes remain only a wording-comparison adapter. */
export const sectionPassageField = StateField.define<PassageState>({
	create: emptyPassages,
	update(value, transaction) {
		const edits: TextEdit[] = [];
		transaction.changes.iterChanges((from, to, _fromB, _toB, insert) => {
			edits.push({ from, to, insert: insert.toString() });
		});
		let next = transaction.docChanged
			? mapPassageState(
					value,
					transaction.changes,
					edits,
					transaction.startState.doc.toString(),
					transaction.newDoc.toString()
				)
			: value;
		const parsed = parsedDocumentForState(transaction.state);
		for (const effect of transaction.effects) {
			if (effect.is(setSectionLinksEffect)) {
				next = passagesFromRecords(transaction.state, effect.value);
			} else if (effect.is(replacePassageStateEffect)) {
				next = effect.value;
			} else if (effect.is(restoreSectionLinksEffect)) {
				next = effect.value.passages;
			} else if (effect.is(setSectionLinkEffect)) {
				const headers = effect.value.headers.map((header) => transaction.changes.mapPos(header, 1));
				const inGroup = (member: PassageMember) => headers.includes(member.header);
				if (effect.value.record) {
					const restored = passagesFromRecords(transaction.state, [effect.value.record]);
					next = {
						passages: [
							...next.passages.map((passage) => ({
								members: passage.members.filter((member) => !inGroup(member))
							})),
							...restored.passages
						],
						detached: [...next.detached.filter((member) => !inGroup(member)), ...restored.detached]
					};
					continue;
				}
				const bodies = headers.flatMap((header) => {
					const body = sectionBodyRange(parsed, header);
					return body
						? [
								{
									header,
									from: body.from,
									text: transaction.state.doc.sliceString(body.from, body.to)
								}
							]
						: [];
				});
				let candidates: PassageState = { passages: alignPassages(bodies), detached: [] };
				if (!effect.value.refresh) {
					for (const detached of next.detached.filter(inGroup))
						candidates = detachPassageRange(candidates, detached);
				}
				const oldGroups = memberGroups(
					transaction.startState,
					parsedDocumentForState(transaction.startState)
				).map((group) => group.map((header) => transaction.changes.mapPos(header, 1)));
				const extended = extendPassages(
					next.passages,
					candidates.passages,
					effect.value.refresh ? [] : oldGroups,
					effect.value.refresh ? [] : next.detached
				);
				next = {
					passages: extended,
					detached: effect.value.refresh
						? clearPassageExclusions(
								next.detached,
								extended.flatMap((passage) => passage.members.filter(inGroup))
							)
						: next.detached
				};
			} else if (effect.is(transferPassageEffect) || effect.is(reconnectPassageEffect)) {
				next = applyPassageTransfer(
					next,
					transaction.changes,
					effect.value,
					effect.is(reconnectPassageEffect)
				);
			} else if (effect.is(detachPassageEffect)) {
				const member = effect.value;
				next = detachPassageRange(next, {
					header: transaction.changes.mapPos(member.header, 1),
					from: transaction.changes.mapPos(member.from, -1),
					to: transaction.changes.mapPos(member.to, 1)
				});
			}
		}
		return validPassages(transaction.state, next);
	}
});

interface LinkComposition {
	base: EditorState;
	changes: ChangeSet;
}

/** Hold the settled correspondence while the browser rewrites provisional IME text. */
export const sectionLinkCompositionField = StateField.define<LinkComposition | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setComposingEffect)) {
				if (!effect.value) return undefined;
				if (!value) return { base: transaction.startState, changes: transaction.changes };
			}
		}
		return value && transaction.docChanged
			? { ...value, changes: value.changes.compose(transaction.changes) }
			: value;
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
	const passages = transaction.startState.field(sectionPassageField, false) ?? emptyPassages();
	const linkEffect = transaction.effects.some(
		(effect) =>
			effect.is(setSectionLinkEffect) ||
			effect.is(setLinkHolesEffect) ||
			effect.is(replacePassageStateEffect) ||
			effect.is(restoreSectionLinksEffect)
	);
	if (!before || (before.size === 0 && !linkEffect)) {
		return [];
	}
	if (!transaction.docChanged && !linkEffect) {
		return [];
	}
	return [
		restoreSectionLinksEffect.of({ groups: [...groupsOf(before).values()], holes, passages })
	];
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

/** Current wording comparison for review; stored passages alone govern mirroring. */
function groupShape(
	state: EditorState,
	parsed: ParsedDocument,
	headers: readonly number[],
	options: { realign?: boolean } = {}
): MemberShape[] | undefined {
	const shapes = headers.map((header) => memberShape(parsed, [], header));
	if (shapes.some((shape) => !shape)) return undefined;
	// SAFETY: the preceding guard rejects every missing shape.
	const members = shapes as MemberShape[];
	const bodies = members.map((member) => state.doc.sliceString(member.body.from, member.body.to));
	const aligned = alignBodies(bodies);
	members.forEach((member, index) => {
		member.holes = aligned[index] ?? [];
	});
	// A comparison explains current wording. Explicit exclusions that happen to
	// have equal text remain reviewable, but never drive automatic mirroring.
	if (!options.realign) {
		for (const detached of state.field(sectionPassageField, false)?.detached ?? []) {
			const source = members.find((member) => member.header === detached.header);
			if (!source) continue;
			const ordered = [source, ...members.filter((member) => member !== source)];
			addDifference(ordered, ordered, detached, true);
		}
	}
	return members;
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
	const passages = state.field(sectionPassageField, false) ?? emptyPassages();
	for (const change of bodyEdits) {
		for (const target of passageTargets(
			passages,
			state.doc.toString(),
			sourceHeader.from,
			change
		)) {
			if (state.doc.sliceString(target.from, target.to) !== change.insert) {
				additions.push({ from: target.from, to: target.to, insert: change.insert });
			}
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

/** Persist exact passage intent, with a local-only fallback for older applications. */
export function sectionLinksFor(state: EditorState): SectionLink[] {
	const value = state.field(sectionPassageField, false) ?? emptyPassages();
	const parsed = parsedDocumentForState(state);
	return memberGroups(state, parsed).map((headers) => {
		const lines = headers.map((header) => state.doc.lineAt(header).number);
		const passages = value.passages.flatMap((passage) => {
			const members = passage.members.filter((member) => headers.includes(member.header));
			return members.length >= 2
				? [{ members: members.map((member) => passageRecordFor(state, member)) }]
				: [];
		});
		// An older tab ignores passages. Whole-body holes ensure it never treats
		// this richer link as permission to replace every version with one body.
		const holes = headers.flatMap((header) => {
			const body = sectionBodyRange(parsed, header);
			if (!body) return [];
			const range = passageRecordFor(state, { header, ...body });
			return [
				{
					line: range.line,
					column: range.column,
					endLine: range.endLine,
					endColumn: range.endColumn
				}
			];
		});
		const detached = value.detached
			.filter((member) => headers.includes(member.header))
			.map((member) => passageRecordFor(state, member));
		const record: SectionLink = { lines, holes, passages };
		if (detached.length) record.detached = detached;
		return record;
	});
}

/** Preview exactly the compatible connections an explicit refresh can establish. */
export function linkConnectionsFor(
	state: EditorState,
	headers: readonly number[]
): LinkConnectionPreview[] {
	const parsed = parsedDocumentForState(state);
	const current = state.field(sectionPassageField, false) ?? emptyPassages();
	const bodies = headers.flatMap((header) => {
		const body = sectionBodyRange(parsed, header);
		return body
			? [{ header, from: body.from, text: state.doc.sliceString(body.from, body.to) }]
			: [];
	});
	return extendPassages(current.passages, alignPassages(bodies)).flatMap((passage) => {
		const members = passage.members.filter((member) => headers.includes(member.header));
		const source = members[0];
		if (!source || members.length < 2) return [];
		const text = state.doc.sliceString(source.from, source.to);
		if (!text.trim()) return [];
		const existing = passageTargets(current, state.doc.toString(), source.header, source);
		return [
			{
				text,
				from: source.from,
				headers: members.map((member) => member.header),
				added: members
					.slice(1)
					.some(
						(member) =>
							!existing.some(
								(peer) =>
									peer.header === member.header &&
									peer.from === member.from &&
									peer.to === member.to
							)
					)
			}
		];
	});
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
				from,
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
 * The chosen copy's, including an absent phrase. Only a wholly empty body is the one
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
	if (
		own.trim().length > 0 ||
		!source ||
		state.doc.sliceString(source.body.from, source.body.to).trim().length > 0
	) {
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
	const reconnected: PassageMember[][] = [];
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
		const text = winningWording(
			view.state,
			shaped,
			index,
			choice.replaceFromByDifference?.[index] ?? choice.replaceFrom
		);
		reconnected.push(
			shaped.flatMap((member) => {
				const hole = member.holes[index];
				return hole
					? [
							{
								header: member.header,
								from: member.body.from + hole.from,
								to: member.body.from + hole.to
							}
						]
					: [];
			})
		);
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
			setSectionLinkEffect.of({ headers: [...headers], refresh: choice.refreshConnections }),
			setLinkHolesEffect.of([...holesOutside(view.state, shaped), ...absoluteHoles(surviving)]),
			...reconnected.map((members) => reconnectPassageEffect.of(members)),
			...(choice.makeDifferent
				? [detachPassageEffect.of({ header: headers[0]!, ...choice.makeDifferent })]
				: [])
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

/** Find the linked owner, retaining a body split temporarily by an internal blank line. */
function passageSource(state: EditorState, range: TextRange): number | undefined {
	const parsed = parsedDocumentForState(state);
	const passages = state.field(sectionPassageField, false)?.passages ?? [];
	for (const header of memberGroups(state, parsed).flat()) {
		const body = sectionBodyRange(parsed, header);
		if (!body) continue;
		const end = Math.max(
			body.to,
			...passages.flatMap((passage) =>
				passage.members.filter((member) => member.header === header).map((member) => member.to)
			)
		);
		if (body.from <= range.from && range.to <= end) return header;
	}
	return undefined;
}

function commitLinkedComposition(transaction: Transaction): TransactionSpec | undefined {
	if (!transaction.effects.some((effect) => effect.is(setComposingEffect) && !effect.value))
		return undefined;
	const composing = transaction.startState.field(sectionLinkCompositionField, false);
	if (!composing) return undefined;
	const base = composing.base;
	const value = base.field(sectionPassageField, false);
	if (!value) return undefined;
	if (base.doc.eq(transaction.newDoc)) {
		return {
			effects: replacePassageStateEffect.of(value),
			userEvent: 'input.type.compose',
			sequential: true
		};
	}
	const change = narrowEdit(0, base.doc.toString(), transaction.newDoc.toString());
	const header = passageSource(base, change);
	if (header === undefined) return undefined;
	const local = isTypeOnlyHere(base, header);
	const targets = local ? [] : passageTargets(value, base.doc.toString(), header, change);
	// Preedit may have replaced a whole word several times. Its historical
	// ChangeSet does not describe the size of the final correction honestly;
	// use the minimal NET edit for both source and peer coordinates.
	const composed = ChangeSet.of(change, base.doc.length);
	const additions = targets.map((member) => ({
		from: composed.mapPos(member.from, 1),
		to: composed.mapPos(member.to, 1),
		insert: change.insert
	}));
	const peerChanges = ChangeSet.of(additions, transaction.newDoc.length);
	const complete = composed.compose(peerChanges);
	const after = peerChanges.apply(transaction.newDoc);
	const edits: TextEdit[] = [];
	complete.iterChanges((from, to, _fromB, _toB, insert) => {
		edits.push({ from, to, insert: insert.toString() });
	});
	let next = mapPassageState(value, complete, edits, base.doc.toString(), after.toString());
	if (targets.length)
		next = applyPassageTransfer(next, complete, [
			{ header, from: change.from, to: change.to },
			...targets
		]);
	if (local)
		next = detachPassageRange(next, {
			header: complete.mapPos(header, 1),
			from: complete.mapPos(change.from, -1),
			to: complete.mapPos(change.to, 1)
		});
	return {
		changes: peerChanges,
		effects: replacePassageStateEffect.of(next),
		// CodeMirror deliberately joins a compose commit to its provisional edits,
		// even after a long pause choosing a character. One composition, one undo.
		userEvent: 'input.type.compose',
		sequential: true
	};
}

export function sectionLinkMirror(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		const composition = commitLinkedComposition(transaction);
		if (composition) return [transaction, composition];
		if (
			!transaction.docChanged ||
			transaction.isUserEvent('undo') ||
			transaction.isUserEvent('redo')
		)
			return transaction;
		if (
			transaction.effects.some(
				(effect) => effect.is(setSectionLinkEffect) || effect.is(setSectionLinksEffect)
			)
		)
			return transaction;
		const before = transaction.startState;
		const value = before.field(sectionPassageField, false);
		if (!value || before.field(editorComposingField, false)) return transaction;
		const onlyHere = transaction.annotation(applyOnlyHereAnnotation);
		if (
			onlyHere &&
			(!Number.isSafeInteger(onlyHere.from) ||
				!Number.isSafeInteger(onlyHere.to) ||
				onlyHere.from < 0 ||
				onlyHere.from > onlyHere.to ||
				onlyHere.to > before.doc.length)
		) {
			throw new RangeError('The local linked-section edit has an invalid range.');
		}
		const changes: TextEdit[] = [];
		transaction.changes.iterChanges((from, to, _fromB, _toB, insert) => {
			if (onlyHere && (from < onlyHere.from || to > onlyHere.to))
				throw new RangeError('The local linked-section edit leaves its addressed range.');
			changes.push({ from, to, insert: insert.toString() });
		});
		const source = passageSource(
			before,
			onlyHere ?? { from: changes[0]!.from, to: changes.at(-1)!.to }
		);
		const parsed = parsedDocumentForState(before);
		if (source === undefined) {
			// Enter at the terminal edge first creates space outside the body.
			// Once lyrics fill it, the same parsed section has demonstrably grown.
			if (onlyHere || changes.length !== 1 || changes[0]!.from !== changes[0]!.to)
				return transaction;
			const change = changes[0]!;
			const after = parsedDocumentForState(transaction.state);
			for (const header of memberGroups(before, parsed).flat()) {
				const body = sectionBodyRange(parsed, header);
				if (!body || body.to >= change.from || isTypeOnlyHere(before, header)) continue;
				const gap = before.doc.sliceString(body.to, change.from);
				if (!/^[\t\r\n ]+$/u.test(gap) || !gap.includes('\n')) continue;
				const grown = sectionBodyRange(after, transaction.changes.mapPos(header, 1));
				if (!grown || grown.to < transaction.changes.mapPos(change.from, 1)) continue;
				const own = { header, from: body.to, to: change.from };
				const targets = passageTargets(value, before.doc.toString(), header, {
					from: body.to,
					to: body.to
				});
				if (!targets.length) continue;
				const insert = transaction.newDoc.sliceString(
					transaction.changes.mapPos(body.to, -1),
					grown.to
				);
				const edits = targets.map((member) => ({
					from: transaction.changes.mapPos(member.from, 1),
					to: transaction.changes.mapPos(member.to, 1),
					insert
				}));
				return [
					transaction,
					{ changes: edits, effects: transferPassageEffect.of([own, ...targets]), sequential: true }
				];
			}
			return transaction;
		}
		if (onlyHere || isTypeOnlyHere(before, source)) {
			const ranges = (onlyHere ? [onlyHere] : changes).filter(
				(range) =>
					!value.detached.some(
						(member) =>
							member.header === source && member.from <= range.from && range.to <= member.to
					)
			);
			if (!ranges.length) return transaction;
			return [
				transaction,
				{
					effects: [
						...ranges.map((range) =>
							detachPassageEffect.of({ header: source, from: range.from, to: range.to })
						),
						typeOnlyHereAppliedEffect.of(null)
					]
				}
			];
		}
		const additions: TextEdit[] = [];
		const transfers: PassageMember[][] = [];
		for (const change of changes) {
			const body = sectionBodyRange(parsed, source);
			if (body && change.from === body.to && change.to === body.to) {
				const grown = sectionBodyRange(
					parsedDocumentForState(transaction.state),
					transaction.changes.mapPos(source, 1)
				);
				if (!grown || grown.to <= transaction.changes.mapPos(body.to, -1)) continue;
			}
			const targets = passageTargets(value, before.doc.toString(), source, change);
			for (const target of targets)
				additions.push({ from: target.from, to: target.to, insert: change.insert });
			if (targets.length)
				transfers.push([{ header: source, from: change.from, to: change.to }, ...targets]);
		}
		if (!additions.length) return transaction;
		additions.sort((a, b) => a.from - b.from || a.to - b.to);
		// Every destination is planned from one snapshot. Refuse an inconsistent
		// mapping as a unit rather than apply overlapping edits to another copy.
		if (additions.some((edit, index) => index > 0 && additions[index - 1]!.to > edit.from))
			return transaction;
		return [
			transaction,
			{
				changes: additions.map((edit) => ({
					...edit,
					from: transaction.changes.mapPos(edit.from, 1),
					to: transaction.changes.mapPos(edit.to, 1)
				})),
				effects: transfers.map((members) => transferPassageEffect.of(members)),
				sequential: true
			}
		];
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
		if (update.selectionSet && !update.state.field(editorComposingField, false)) {
			const before = sectionLinkScope(update.startState);
			const after = sectionLinkScope(update.state);
			if (after && (before?.header !== after.header || before.scope.label !== after.scope.label)) {
				update.state.field(editorCallbacksField, false)?.onAnnouncement(after.scope.label);
			}
		}
	});
}

/** The same complete-operation planner supplies both the header and actual mirroring. */
export function sectionLinkScope(
	state: EditorState
): { header: number; scope: SectionLinkScope } | undefined {
	const composition = state.field(sectionLinkCompositionField, false);
	if (composition) {
		const settled = sectionLinkScope(composition.base);
		return settled
			? { ...settled, header: composition.changes.mapPos(settled.header, 1) }
			: undefined;
	}
	const range = state.selection.main;
	const header = passageSource(state, range);
	if (header === undefined) return undefined;
	const value = state.field(sectionPassageField, false);
	if (!value) return undefined;
	if (isTypeOnlyHere(state, header))
		return { header, scope: { label: 'Editing this section only' } };
	const names = linkingSectionNames(parsedDocumentForState(state));
	const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });
	const peersFor = (span: TextRange) =>
		passageTargets(value, state.doc.toString(), header, span).map((peer) => peer.header);
	const describe = (peers: number[]) =>
		peers.length
			? `Also edits ${list.format(peers.map((peer) => names.get(peer) ?? 'linked section'))}`
			: 'Only this section';
	const peers = peersFor(range);
	let label = describe(peers);
	const detail: string[] = [];
	if (range.empty) {
		const text = state.doc.toString();
		const backward = peersFor({ from: findClusterBreak(text, range.from, false), to: range.from });
		const forward = peersFor({ from: range.from, to: findClusterBreak(text, range.from, true) });
		if (backward.join(',') !== peers.join(',') || forward.join(',') !== peers.join(',')) {
			label = peers.length
				? `Typing also edits ${list.format(peers.map((peer) => names.get(peer) ?? 'linked section'))}`
				: 'Typing only in this section';
			detail.push(`Backspace: ${describe(backward)}. Delete: ${describe(forward)}.`);
		}
	} else if (!peers.length) {
		detail.push('The selection includes wording that is independent in the other sections.');
	}
	const scope: SectionLinkScope = { label };
	if (detail.length) scope.detail = detail.join(' ');
	return { header, scope };
}

/** Headers carry scope; only text with no shared occurrence is marked independent. */
export const sectionLinkDecorations = EditorView.decorations.compute(
	[
		'selection',
		sectionLinkField,
		sectionPassageField,
		typeOnlyHereField,
		sectionLinkCompositionField
	],
	(state): DecorationSet => {
		const field = state.field(sectionLinkField, false);
		if (!field || field.size === 0) return Decoration.none;
		const marks: Range<Decoration>[] = [];
		const local = state.field(typeOnlyHereField, false);
		const scope = sectionLinkScope(state);
		const cursor = field.iter();
		while (cursor.value) {
			const localHeader = local?.header === cursor.from;
			if (localHeader)
				marks.push(Decoration.line({ class: 'll-section-only-header' }).range(cursor.from));
			marks.push(
				Decoration.widget({
					widget: new SectionLinkMarker(
						cursor.from,
						localHeader,
						typeOnlyHere,
						scope?.header === cursor.from ? scope.scope : undefined
					),
					side: 1
				}).range(cursor.to)
			);
			cursor.next();
		}
		const parsed = parsedDocumentForState(state);
		const passages = state.field(sectionPassageField, false)?.passages ?? [];
		const divergent = Decoration.mark({ class: 'll-link-divergent' });
		for (const header of memberGroups(state, parsed).flat()) {
			const body = sectionBodyRange(parsed, header);
			if (!body) continue;
			let at = body.from;
			const shared = passages
				.flatMap((passage) =>
					passage.members.filter((member) => member.header === header && member.from < member.to)
				)
				.sort((a, b) => a.from - b.from);
			for (const member of shared) {
				if (at < member.from && at < body.to)
					marks.push(divergent.range(at, Math.min(member.from, body.to)));
				at = Math.max(at, member.to);
			}
			if (at < body.to) marks.push(divergent.range(at, body.to));
		}
		return Decoration.set(marks, true);
	}
);

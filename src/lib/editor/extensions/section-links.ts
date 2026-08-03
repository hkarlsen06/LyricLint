import { invertedEffects } from '@codemirror/commands';
import { EditorState, RangeSet, RangeValue, StateEffect, StateField } from '@codemirror/state';
import type { ChangeDesc, Extension, Range, TransactionSpec } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { randomId } from '$lib/core/random-id.js';
import type {
	LinkDifference,
	LinkHole,
	ParsedDocument,
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
import { sectionBodyRange } from '../section-links.js';
import {
	editorCallbacksField,
	editorComposingField,
	parsedDocumentForState
} from './editor-state.js';
import { singleChangedRange } from './header-rename.js';
import { HoverIntent } from './hover-intent.js';

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
 * The one edit the user has asked to keep in this copy.
 *
 * The range is the editor selection at the moment `Type only here` is pressed:
 * a point for an insertion or deletion, and a span for a replacement. It is a
 * mode only until the next edit (or until the selection moves), so it is editor
 * state rather than anything persisted on the draft.
 */
interface TypeOnlyHereState {
	header: number;
	range: TextRange;
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
					effect.value.groups.map((group) => [randomId(), group] as [string, number[]])
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

/** The one local edit currently armed, if any. */
export const typeOnlyHereField = StateField.define<TypeOnlyHereState | undefined>({
	create: () => undefined,
	update(value, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setTypeOnlyHereEffect)) {
				return effect.value;
			}
		}
		if (!value) {
			return undefined;
		}
		// The edit itself consumes the mode. The filter adds the difference before
		// this field is updated, in the same transaction and therefore the same undo.
		if (transaction.docChanged) {
			return undefined;
		}
		// "At the caret" is literal. Moving the caret or changing the selection
		// retires the promise rather than applying it somewhere else later.
		if (transaction.selection) {
			const selection = transaction.selection.main;
			const from = Math.min(selection.anchor, selection.head);
			const to = Math.max(selection.anchor, selection.head);
			if (from !== value.range.from || to !== value.range.to) {
				return undefined;
			}
		}
		return value;
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
export function groupShape(
	state: EditorState,
	parsed: ParsedDocument,
	headers: readonly number[],
	options: { realign?: boolean } = {}
): MemberShape[] | undefined {
	const holes = state.field(linkHolesField, false) ?? [];
	const shapes = headers.map((header) => memberShape(parsed, holes, header));
	if (shapes.some((shape) => !shape)) {
		return undefined;
	}
	const members = shapes as MemberShape[];
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

/** Whether the current selection can become the next local edit in this member. */
export function canTypeOnlyHere(state: EditorState, headerFrom: number): boolean {
	const parsed = parsedDocumentForState(state);
	const group = memberGroups(state, parsed).find((headers) => headers.includes(headerFrom));
	if (!group) {
		return false;
	}
	// The named copy leads so the selection and every translated range are read
	// from the same member, regardless of where that copy falls in the song.
	const ordered = [headerFrom, ...group.filter((header) => header !== headerFrom)];
	const members = groupShape(state, parsed, ordered);
	const source = members?.[0];
	if (!members || !source) {
		return false;
	}
	const selection = state.selection.main;
	const range = {
		from: Math.min(selection.anchor, selection.head),
		to: Math.max(selection.anchor, selection.head)
	};
	if (range.from < source.body.from || range.to > source.body.to) {
		return false;
	}
	const relative = {
		from: range.from - source.body.from,
		to: range.to - source.body.from
	};
	// It already types only here inside a stored difference. Offering a mode for
	// a fact that is standing true would make the button appear to do nothing.
	if (holeContaining(source.holes, relative.from, relative.to) !== undefined) {
		return false;
	}
	const probe = members.map((member) => ({ ...member, holes: [...member.holes] }));
	return addDifference(members, probe, range, true);
}

/** Arm one local edit at the editor's current caret or selection. */
export function typeOnlyHere(view: EditorView, headerFrom: number): boolean {
	if (!canTypeOnlyHere(view.state, headerFrom)) {
		return false;
	}
	const selection = view.state.selection.main;
	view.dispatch({
		effects: setTypeOnlyHereEffect.of({
			header: headerFrom,
			range: {
				from: Math.min(selection.anchor, selection.head),
				to: Math.max(selection.anchor, selection.head)
			}
		}),
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
	view.state.field(editorCallbacksField, false)?.onAnnouncement('Typing only here cancelled.');
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

	view.dispatch({
		...(changes.length > 0 ? { changes } : {}),
		selection: { anchor: caret },
		effects: [
			setSectionLinkEffect.of({ headers: [...headers] }),
			setLinkHolesEffect.of([...holesOutside(view.state, shaped), ...absoluteHoles(surviving)])
		]
	});
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
	const widened = expandOverHoles(source.holes, relative.from, relative.to);
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
function changeTouchesArmedRange(change: TextRange, armed: TextRange): boolean {
	if (armed.from !== armed.to) {
		return armed.from <= change.from && change.to <= armed.to;
	}
	// Insert, Backspace and Delete describe the three useful shapes around a
	// caret: a point, a range ending at it, and a range beginning at it.
	return change.from === armed.from || change.to === armed.from;
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
		const change = singleChangedRange(transaction.changes);
		if (!change) {
			return transaction;
		}

		const parsed = parsedDocumentForState(transaction.startState);
		const group = memberGroups(transaction.startState, parsed).find((headers) =>
			headers.some((header) => {
				const body = sectionBodyRange(parsed, header);
				return body && body.from <= change.from && change.to <= body.to;
			})
		);
		if (!group) {
			return transaction;
		}
		// The edited copy leads, because every offset below is measured from it.
		const ordered = [
			...group.filter((header) => {
				const body = sectionBodyRange(parsed, header);
				return body && body.from <= change.from && change.to <= body.to;
			}),
			...group.filter((header) => {
				const body = sectionBodyRange(parsed, header);
				return !(body && body.from <= change.from && change.to <= body.to);
			})
		];
		const members = groupShape(transaction.startState, parsed, ordered);
		const source = members?.[0];
		if (!members || !source) {
			return transaction;
		}

		const relative = { from: change.from - source.body.from, to: change.to - source.body.from };
		const local = transaction.startState.field(typeOnlyHereField, false);
		if (local?.header === source.header && changeTouchesArmedRange(change, local.range)) {
			// If this range was already its own, the requested outcome already holds.
			// Still mark the edit as consumed so the shell refreshes the persisted
			// mapped range after the words change.
			if (holeContaining(source.holes, relative.from, relative.to) !== undefined) {
				return [transaction, { effects: typeOnlyHereAppliedEffect.of(null) }];
			}
			const localMembers = members.map((member) => ({
				...member,
				holes: [...member.holes]
			}));
			if (addDifference(members, localMembers, change, true)) {
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
			if (transaction.startState.doc.sliceString(from, to) === text) {
				continue;
			}
			edits.push({
				from: transaction.changes.mapPos(from, 1),
				to: transaction.changes.mapPos(to, 1),
				insert: text
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

class TypeOnlyHereMarker extends WidgetType {
	eq(other: TypeOnlyHereMarker): boolean {
		return other instanceof TypeOnlyHereMarker;
	}

	toDOM(): HTMLElement {
		const marker = document.createElement('span');
		marker.className = 'll-type-only-here';
		marker.textContent = 'Typing only here';
		marker.setAttribute('aria-hidden', 'true');
		return marker;
	}

	ignoreEvent(): boolean {
		return true;
	}
}

class SectionLinkMarker extends WidgetType {
	/** The wait a pointer serves before this marker opens its card. */
	private readonly hover = new HoverIntent<() => void>((open) => open());

	constructor(readonly headerFrom: number) {
		super();
	}

	eq(other: SectionLinkMarker): boolean {
		return other.headerFrom === this.headerFrom;
	}

	toDOM(view: EditorView): HTMLElement {
		const marker = document.createElement('button');
		marker.type = 'button';
		marker.className = 'll-section-link-marker';
		marker.textContent = '⇄';
		marker.setAttribute('aria-label', 'Edit linked sections');
		marker.setAttribute('aria-haspopup', 'dialog');
		const open = () => {
			const line = view.state.doc.lineAt(clamp(view.state, this.headerFrom));
			view.state.field(editorCallbacksField, false)?.onSectionLinkRequest?.({
				range: { from: line.from, to: line.to },
				prefer: 'above'
			});
		};
		// Pointing serves the editor's one hover wait; reaching the marker with the
		// keyboard is a decision already made and opens at once. There is no click
		// path because a press focuses the button, and a second `open()` behind the
		// first would reset a card the user had already started answering.
		marker.addEventListener('pointerenter', () => this.hover.arm(open));
		marker.addEventListener('pointerleave', () => this.hover.cancel());
		marker.addEventListener('focus', () => {
			this.hover.cancel();
			open();
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
 * there to draw on. The card is where those are named.
 */
export const sectionLinkDecorations = EditorView.decorations.compute(
	[sectionLinkField, linkHolesField, typeOnlyHereField],
	(state): DecorationSet => {
		const field = state.field(sectionLinkField, false);
		if (!field || field.size === 0) {
			return Decoration.none;
		}
		const marks: Range<Decoration>[] = [];
		const cursor = field.iter();
		while (cursor.value) {
			marks.push(
				Decoration.widget({
					widget: new SectionLinkMarker(cursor.from),
					side: 1
				}).range(cursor.to)
			);
			cursor.next();
		}
		const local = state.field(typeOnlyHereField, false);
		if (local) {
			marks.push(
				Decoration.widget({
					widget: new TypeOnlyHereMarker(),
					side: 1
				}).range(clamp(state, local.range.to))
			);
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
	'.ll-link-divergent': {
		textDecorationLine: 'underline',
		textDecorationStyle: 'dotted',
		textDecorationThickness: '1px',
		textDecorationColor: 'var(--color-border-strong)',
		textUnderlineOffset: '0.25em'
	},
	'.ll-type-only-here': {
		marginInlineStart: '0.55em',
		color: 'var(--color-text-muted)',
		fontFamily: 'var(--font-ui)',
		fontSize: 'var(--font-size-xs)',
		fontStyle: 'italic',
		fontWeight: 'var(--font-weight-medium)',
		pointerEvents: 'none',
		whiteSpace: 'nowrap'
	}
});

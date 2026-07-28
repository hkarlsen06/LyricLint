import { invertedEffects } from '@codemirror/commands';
import { EditorState, RangeSet, RangeValue, StateEffect, StateField } from '@codemirror/state';
import type { ChangeDesc, Extension, Range, TransactionSpec } from '@codemirror/state';
import { Transaction } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { parseDocument } from '$lib/core/parser.js';
import { randomId } from '$lib/core/random-id.js';
import type { SectionLink, TextEdit } from '$lib/core/types.js';
import { sectionBodyRange } from '../section-links.js';
import {
	editorCallbacksField,
	editorComposingField,
	parsedDocumentForState
} from './editor-state.js';
import { singleChangedRange } from './header-rename.js';

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
 * Before, because the effect travels in the same transaction as the edit that
 * overwrites the bodies — one press has to be one undo — and the picker chose
 * its headers against the document it was looking at. The field maps them.
 *
 * One effect covers linking, re-linking and unlinking: every named header
 * leaves whatever group it was in first, and fewer than two survivors is not a
 * link, so a lone header simply comes loose.
 */
export const setSectionLinkEffect = StateEffect.define<{ headers: readonly number[] }>();

/**
 * Put the groups back exactly as they were, in the coordinates of the document
 * the effect lands in.
 *
 * This is the history's, not the picker's. Undo restores the *words* by
 * reversing changes, and a `StateField` reversed nothing — so deleting a linked
 * section and pressing undo brought the section back with the link silently
 * gone, which is a half-reversal and the worst kind.
 *
 * The `map` is not optional decoration: an effect stored in the history with no
 * `map` is **dropped** the moment it has to be mapped through a later change,
 * which is most of the time and fails silently.
 */
const restoreSectionLinksEffect = StateEffect.define<readonly (readonly number[])[]>({
	map: (groups, changes) => groups.map((group) => group.map((pos) => changes.mapPos(pos, 1)))
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
					effect.value.map((group) => [randomId(), group] as [string, number[]])
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
 * Make undo reverse the links along with the words.
 *
 * Every history event carries the groups as they stood before it, so undoing
 * anything — a deleted section, the link's own overwrite, an unlink that moved
 * no text at all — puts the membership back with the text. Redo works out of
 * the same machinery: the undo transaction records its own before-state on the
 * way past.
 *
 * Emitted whenever links exist or a link effect is in flight, rather than only
 * where the field actually changed. Comparing would mean reading the new state
 * from inside the facet the new state is still being built for; a handful of
 * numbers per history event is the cheaper certainty.
 */
export const sectionLinkHistory = invertedEffects.of((transaction) => {
	const before = transaction.startState.field(sectionLinkField, false);
	const linkEffect = transaction.effects.some(
		(effect) => effect.is(setSectionLinkEffect) || effect.is(restoreSectionLinksEffect)
	);
	if (!before || (before.size === 0 && !linkEffect)) {
		return [];
	}
	if (!transaction.docChanged && !linkEffect) {
		return [];
	}
	return [restoreSectionLinksEffect.of([...groupsOf(before).values()])];
});

/** Every link, as header line numbers, ready to be written down. */
export function sectionLinksFor(state: EditorState): SectionLink[] {
	const field = state.field(sectionLinkField, false);
	if (!field) {
		return [];
	}
	return [...groupsOf(field).values()]
		.map((positions) => ({
			lines: positions.map((position) => state.doc.lineAt(position).number).sort((a, b) => a - b)
		}))
		.filter((link) => link.lines.length >= 2)
		.sort((left, right) => (left.lines[0] ?? 0) - (right.lines[0] ?? 0));
}

/**
 * Tie these sections together and overwrite every one of them from the source.
 *
 * The source is the section the picker was opened from, which is the whole
 * arbitration: the user is looking at the words they want kept, so those are
 * the words that win. Changes and membership travel in one transaction, so one
 * undo puts the song back exactly as it was.
 *
 * **Unless that section has no words**, which is the one case where the section
 * in front of the user cannot be the one that wins: adding `[Chorus 3]` at the
 * foot of a draft and linking it to the chorus above is a request to *fill* it,
 * and an empty source would answer it by emptying the chorus that had the
 * words. A section with nothing in it has nothing to give, so the words come
 * from the first member of the group that has any — the group, never the
 * document, because a peer the user did not tick is not part of what they
 * asked for. All of them empty is the harmless case and writes nothing.
 */
export function linkSections(view: EditorView, headers: readonly number[]): number {
	const parsed = parsedDocumentForState(view.state);
	const opened = headers[0] ?? 0;
	const bodyText = (header: number): string => {
		const range = sectionBodyRange(parsed, header);
		return range ? view.state.doc.sliceString(range.from, range.to) : '';
	};
	const source =
		[...headers].sort((left, right) => left - right).find((header) => bodyText(header).trim()) ??
		opened;
	const text = bodyText(source);
	const changes: TextEdit[] = [];
	for (const target of headers) {
		const range = target === source ? undefined : sectionBodyRange(parsed, target);
		if (range && view.state.doc.sliceString(range.from, range.to) !== text) {
			changes.push({ from: range.from, to: range.to, insert: text });
		}
	}
	changes.sort((left, right) => left.from - right.from);
	// The header stops being selected, and that is load-bearing rather than
	// tidiness: the card opened *because* the header was selected whole, and the
	// selection survives the edit, so leaving it there would reopen the card the
	// user just answered on the next settled anchor report. A collapsed selection
	// reports no anchor at all. It follows the *opened* header rather than the
	// source, which are the same offset except when an empty section was filled
	// from a peer — and there it is still the header the selection sits on.
	// Bodies never contain a header, so that offset only moves by what the
	// earlier replacements added or took away.
	const caret =
		opened +
		changes
			.filter((change) => change.to <= opened)
			.reduce((shift, change) => shift + change.insert.length - (change.to - change.from), 0);
	view.dispatch({
		...(changes.length > 0 ? { changes } : {}),
		selection: { anchor: caret },
		effects: setSectionLinkEffect.of({ headers: [...headers] })
	});
	return headers.length;
}

/**
 * Repeat an edit made in one linked section in every other section of its group.
 *
 * Appended to the transaction that caused it, the way `headerRenameFilter`
 * mirrors a performer's name: the document is never briefly inconsistent, one
 * snapshot is emitted, and one undo restores every section at once. Undo, redo
 * and IME composition are exempt so history replays byte for byte.
 *
 * Only a single contiguous edit inside exactly one member's body is mirrored.
 * An edit that reaches a header, spans two sections, or arrives scattered across
 * the document is a restructuring rather than a rewrite of the words, and
 * guessing at those is how a link would eat work the user meant to keep.
 */
export function sectionLinkMirror(): Extension {
	return EditorState.transactionFilter.of((transaction) => {
		if (!transaction.docChanged) {
			return transaction;
		}
		const links = transaction.startState.field(sectionLinkField, false);
		if (!links || links.size === 0) {
			return transaction;
		}
		if (transaction.startState.field(editorComposingField, false)) {
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

		const before = parsedDocumentForState(transaction.startState);
		let source: { from: number; group: string } | undefined;
		const cursor = links.iter();
		while (cursor.value && !source) {
			const header = before.sections.find(
				(section) =>
					section.header && section.header.from >= cursor.from && section.header.to <= cursor.to
			)?.header;
			const body = header ? sectionBodyRange(before, header.from) : undefined;
			if (body && body.from <= change.from && change.to <= body.to) {
				source = { from: header?.from ?? 0, group: cursor.value.group };
			}
			cursor.next();
		}
		if (!source) {
			return transaction;
		}

		const peers: number[] = [];
		const scan = links.iter();
		while (scan.value) {
			if (scan.value.group === source.group) {
				const header = before.sections.find(
					(section) =>
						section.header && section.header.from >= scan.from && section.header.to <= scan.to
				)?.header;
				if (header && header.from !== source.from) {
					peers.push(header.from);
				}
			}
			scan.next();
		}
		if (peers.length === 0) {
			return transaction;
		}

		const after = parseDocument(transaction.newDoc.toString());
		const sourceBody = sectionBodyRange(after, transaction.changes.mapPos(source.from, 1));
		if (!sourceBody) {
			return transaction;
		}
		const text = transaction.newDoc.sliceString(sourceBody.from, sourceBody.to);
		const edits: TextEdit[] = [];
		for (const peer of peers) {
			const body = sectionBodyRange(after, transaction.changes.mapPos(peer, 1));
			if (body && transaction.newDoc.sliceString(body.from, body.to) !== text) {
				edits.push({ from: body.from, to: body.to, insert: text });
			}
		}
		if (edits.length === 0) {
			return transaction;
		}
		edits.sort((left, right) => left.from - right.from);
		const mirrored: TransactionSpec = { changes: edits, sequential: true };
		return [transaction, mirrored];
	});
}

class SectionLinkMarker extends WidgetType {
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
		marker.addEventListener('pointerenter', open);
		marker.addEventListener('focus', open);
		return marker;
	}
}

/** Mark linked headers and open their existing picker directly from the mark. */
export const sectionLinkDecorations = EditorView.decorations.compute(
	[sectionLinkField],
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
	}
});

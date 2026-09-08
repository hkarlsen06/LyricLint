// Decision record: docs/subsystems/section-links.md.
import { ChangeSet } from '@codemirror/state';
import { alignPassages } from '$lib/core/link-passages.js';
import { bodiesAreSimilarEnoughToLink } from '$lib/core/link-shape.js';
import type { ParsedDocument, TextEdit } from '$lib/core/types.js';
import {
	applyPassageTransfer,
	mapPassageState,
	passageTargets,
	type PassageState
} from './link-passage-edits.js';

function sections(parsed: ParsedDocument) {
	return parsed.sections.flatMap((section) => {
		const header = section.header;
		return header
			? [
					{
						header: header.from,
						key: header.namePart.toLowerCase(),
						from: header.to,
						text: parsed.text.slice(header.to, section.to)
					}
				]
			: [];
	});
}

/** Recover existing intent across a replacement paste; never discover new peers. */
export function recoverPastedSectionLinks(
	before: ParsedDocument,
	after: ParsedDocument,
	groups: readonly (readonly number[])[],
	value: PassageState
) {
	const oldSections = sections(before);
	const newSections = sections(after);
	const pairs = oldSections.flatMap((old) => {
		const previous = oldSections.filter((section) => section.key === old.key);
		const candidates = newSections.filter((section) => section.key === old.key);
		// A stable occurrence count identifies repeated choruses by order. If it
		// changed, only a unique exact body identifies which performance survived.
		const exact = candidates.filter((section) => section.text === old.text);
		const uniqueExact =
			exact.length === 1 && previous.filter((section) => section.text === old.text).length === 1;
		const next = uniqueExact
			? exact[0]
			: previous.length === candidates.length
				? candidates[previous.indexOf(old)]
				: undefined;
		return next && (old.text === next.text || bodiesAreSimilarEnoughToLink(old.text, next.text))
			? [{ old, next }]
			: [];
	});
	// Reordering with conflicting evidence has no monotonic correspondence.
	const ordered = pairs.filter((pair, index) =>
		pairs.every(
			(other, j) =>
				j === index ||
				(j < index ? other.next.header < pair.next.header : other.next.header > pair.next.header)
		)
	);
	const headers = new Map(ordered.map(({ old, next }) => [old.header, next.header]));
	const keptGroups = groups
		.map((group) => group.filter((header) => headers.has(header)))
		.filter((group) => group.length >= 2);
	if (!keptGroups.length) return undefined;
	const kept = new Set(keptGroups.flat());
	const prior: PassageState = {
		passages: value.passages
			.map((passage) => ({
				members: passage.members.filter((member) => kept.has(member.header))
			}))
			.filter((passage) => passage.members.length >= 2),
		detached: value.detached.filter((member) => kept.has(member.header))
	};

	// This finer mapping is metadata-only. The actual paste remains one edit,
	// so no correction in the incoming text can be mirrored into another copy.
	const edits: TextEdit[] = [];
	let from = 0;
	let insertedFrom = 0;
	const anchor = (oldFrom: number, newFrom: number, length: number) => {
		if (before.text.slice(from, oldFrom) !== after.text.slice(insertedFrom, newFrom))
			edits.push({ from, to: oldFrom, insert: after.text.slice(insertedFrom, newFrom) });
		from = oldFrom + length;
		insertedFrom = newFrom + length;
	};
	for (const { old, next } of ordered) {
		// Every parsed header begins with '['; retaining it seats membership even
		// when its ordinal or performer legend changed.
		anchor(old.header, next.header, 1);
		anchor(old.from, next.from, 0);
		for (const passage of alignPassages([
			{ ...old, header: 0 },
			{ ...next, header: 1 }
		])) {
			const [left, right] = passage.members;
			anchor(left.from, right.from, left.to - left.from);
		}
		anchor(old.from + old.text.length, next.from + next.text.length, 0);
	}
	anchor(before.text.length, after.text.length, 0);
	const changes = ChangeSet.of(edits, before.text.length);
	let passages = mapPassageState(prior, changes, edits, before.text, after.text);
	// The same correction in corresponding old shared spans remains shared.
	// Crossing a local boundary has no passageTargets and cannot reconnect it.
	for (const edit of edits) {
		const source = ordered.find(
			({ old }) => old.from <= edit.from && edit.to <= old.from + old.text.length
		);
		if (!source || !kept.has(source.old.header)) continue;
		const peers = passageTargets(prior, before.text, source.old.header, edit).filter((peer) =>
			edits.some(
				(other) => other.from === peer.from && other.to === peer.to && other.insert === edit.insert
			)
		);
		if (peers.length)
			passages = applyPassageTransfer(passages, changes, [
				{ header: source.old.header, from: edit.from, to: edit.to },
				...peers
			]);
	}
	return {
		groups: keptGroups.map((group) => group.map((header) => headers.get(header)!)),
		passages
	};
}

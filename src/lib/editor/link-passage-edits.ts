// Decision record: docs/subsystems/section-links.md.
import type { ChangeDesc } from '@codemirror/state';
import type { TextEdit, TextRange } from '$lib/core/types.js';
import {
	coalescePassages,
	type PassageMember,
	type SharedPassage
} from '$lib/core/link-passages.js';

export interface PassageState {
	passages: SharedPassage[];
	detached: PassageMember[];
}

const wordBefore = /[\p{L}\p{M}\p{N}]$/u;
const wordAfter = /^[\p{L}\p{M}\p{N}]/u;

/** One insertion boundary has one owner, including the end of a shared word. */
export function insertionPassage(
	passages: readonly SharedPassage[],
	text: string,
	header: number,
	at: number
): SharedPassage | undefined {
	const candidates = passages.flatMap((passage) => {
		const own = passage.members.find((member) => member.header === header);
		return own && own.from <= at && at <= own.to ? [{ passage, own }] : [];
	});
	const empty = candidates.filter(({ own }) => own.from === own.to);
	if (empty.length === 1) return empty[0]?.passage;
	if (empty.length > 1) return undefined;
	const inside = candidates.find(({ own }) => own.from < at && at < own.to);
	if (inside) return inside.passage;
	// Appending a letter to a linked word keeps editing that word, even when
	// the following comma/ad-lib belongs only to this performance.
	if (wordBefore.test(text.slice(0, at))) {
		return candidates.find(({ own }) => own.to === at)?.passage;
	}
	if (wordAfter.test(text.slice(at, at + 2))) {
		return candidates.find(({ own }) => own.from === at)?.passage;
	}
	const left = candidates.find(({ own }) => own.to === at);
	const right = candidates.find(({ own }) => own.from === at);
	return right?.passage ?? left?.passage;
}

/**
 * Translate the complete operation, never just the shared pieces of a replacement.
 * A peer qualifies only if every character and intervening boundary maps contiguously.
 */
export function passageTargets(
	value: PassageState,
	text: string,
	header: number,
	range: TextRange
): PassageMember[] {
	const { passages, detached } = value;
	const crossesLocal = (header: number, range: TextRange) =>
		detached.some(
			(member) =>
				member.header === header &&
				((member.from <= range.from && range.to <= member.to) ||
					(range.from < member.to && member.from < range.to))
		);
	if (crossesLocal(header, range)) return [];
	if (range.from === range.to) {
		const passage = insertionPassage(passages, text, header, range.from);
		const own = passage?.members.find((member) => member.header === header);
		if (!passage || !own) return [];
		return passage.members
			.filter((member) => member.header !== header)
			.map((member) => ({
				header: member.header,
				from: member.from + range.from - own.from,
				to: member.from + range.from - own.from
			}))
			.filter((member) => !crossesLocal(member.header, member));
	}
	const pieces = passages
		.flatMap((passage) => {
			const own = passage.members.find((member) => member.header === header);
			return own && own.from < range.to && range.from < own.to ? [{ passage, own }] : [];
		})
		.sort((a, b) => a.own.from - b.own.from);
	const first = pieces[0];
	if (!first || first.own.from > range.from) return [];
	const peers = first.passage.members.filter((member) => member.header !== header);
	const targets: PassageMember[] = [];
	for (const peer of peers) {
		let cursor = range.from;
		let targetFrom: number | undefined;
		let targetTo: number | undefined;
		for (const { passage, own } of pieces) {
			if (own.from > cursor) break;
			const other = passage.members.find((member) => member.header === peer.header);
			if (!other) break;
			const start = Math.max(range.from, own.from);
			const end = Math.min(range.to, own.to);
			const from = other.from + start - own.from;
			const to = other.from + end - own.from;
			if (targetTo !== undefined && targetTo !== from) break;
			targetFrom ??= from;
			targetTo = to;
			cursor = end;
			if (cursor === range.to) break;
		}
		if (
			cursor === range.to &&
			targetFrom !== undefined &&
			targetTo !== undefined &&
			text.slice(targetFrom, targetTo) === text.slice(range.from, range.to) &&
			!crossesLocal(peer.header, { from: targetFrom, to: targetTo })
		) {
			targets.push({ header: peer.header, from: targetFrom, to: targetTo });
		}
	}
	return targets;
}

/**
 * Map stored intent through any edit, splitting only where the operation touched it.
 * Never infer a new connection between passages. Copies of one old passage may
 * separate into smaller groups; untouched copies remain connected to each other.
 */
export function mapPassageState(
	value: PassageState,
	changes: ChangeDesc,
	edits: readonly TextEdit[],
	before: string,
	after: string
): PassageState {
	const passages: SharedPassage[] = [];
	const groupEqual = (members: PassageMember[]) => {
		const versions = new Map<string, PassageMember[]>();
		for (const member of members) {
			if (member.from > member.to) continue;
			const text = after.slice(member.from, member.to);
			const version = versions.get(text) ?? [];
			version.push(member);
			versions.set(text, version);
		}
		for (const members of versions.values()) {
			if (members.length >= 2) passages.push({ members });
		}
	};
	for (const passage of value.passages) {
		const length = passage.members[0]!.to - passage.members[0]!.from;
		const cuts = new Set([0, length]);
		const insertions = new Set<number>();
		for (const member of passage.members) {
			for (const edit of edits) {
				if (member.to < edit.from || edit.to < member.from) continue;
				cuts.add(Math.max(0, Math.min(length, edit.from - member.from)));
				cuts.add(Math.max(0, Math.min(length, edit.to - member.from)));
				if (
					edit.from === edit.to &&
					insertionPassage(value.passages, before, member.header, edit.from) === passage
				) {
					insertions.add(edit.from - member.from);
				}
			}
		}
		const points = [...cuts].sort((a, b) => a - b);
		for (let index = 1; index < points.length; index++) {
			const start = points[index - 1]!;
			const end = points[index]!;
			groupEqual(
				passage.members.flatMap((member) => {
					const from = member.from + start;
					const to = member.from + end;
					// A replacement reaching outside this chunk cannot be apportioned
					// between it and its neighbours by guessing at replacement lengths.
					if (
						edits.some(
							(edit) => edit.from < to && from < edit.to && (edit.from < from || edit.to > to)
						)
					)
						return [];
					return [
						{
							header: changes.mapPos(member.header, 1),
							from: changes.mapPos(from, 1),
							to: changes.mapPos(to, -1)
						}
					];
				})
			);
		}
		if (length === 0) insertions.add(0);
		for (const offset of insertions) {
			groupEqual(
				passage.members.map((member) => {
					const at = member.from + offset;
					return {
						header: changes.mapPos(member.header, 1),
						from: changes.mapPos(at, -1),
						to: changes.mapPos(at, 1)
					};
				})
			);
		}
	}
	const detached = value.detached.map((member) => ({
		header: changes.mapPos(member.header, 1),
		from: changes.mapPos(member.from, -1),
		to: changes.mapPos(member.to, 1)
	}));
	return {
		passages: excludeDetachedPoints(coalescePassages(passages, detached), detached),
		detached
	};
}

/** An explicit local insertion point keeps ownership when nearby text is deleted. */
function excludeDetachedPoints(
	passages: readonly SharedPassage[],
	detached: readonly PassageMember[]
): SharedPassage[] {
	return passages
		.map((passage) => ({
			members: passage.members.filter(
				(member) =>
					member.from !== member.to ||
					!detached.some(
						(local) =>
							local.header === member.header && local.from <= member.from && member.to <= local.to
					)
			)
		}))
		.filter((passage) => passage.members.length >= 2);
}

/** Remove only the addressed occurrence and retain its peers and both shared sides. */
function removeOccurrence(stored: readonly SharedPassage[], range: PassageMember): SharedPassage[] {
	const passages: SharedPassage[] = [];
	for (const passage of stored) {
		const own = passage.members.find((member) => member.header === range.header);
		if (
			!own ||
			own.to < range.from ||
			range.to < own.from ||
			(range.from !== range.to && (own.to === range.from || own.from === range.to))
		) {
			passages.push(passage);
			continue;
		}
		const start = Math.max(0, range.from - own.from);
		const end = Math.min(own.to - own.from, range.to - own.from);
		if (start > 0)
			passages.push({
				members: passage.members.map((member) => ({ ...member, to: member.from + start }))
			});
		const others = passage.members
			.filter((member) => member.header !== range.header)
			.map((member) => ({ ...member, from: member.from + start, to: member.from + end }));
		if (others.length >= 2) passages.push({ members: others });
		if (end < own.to - own.from)
			passages.push({
				members: passage.members.map((member) => ({ ...member, from: member.from + end }))
			});
	}
	return passages;
}

export function detachPassageRange(value: PassageState, range: PassageMember): PassageState {
	const passages = removeOccurrence(value.passages, range);
	const detached = [...value.detached, range].sort(
		(a, b) => a.header - b.header || a.from - b.from
	);
	const merged: PassageMember[] = [];
	for (const member of detached) {
		const previous = merged.at(-1);
		if (previous?.header === member.header && previous.to >= member.from)
			previous.to = Math.max(previous.to, member.to);
		else merged.push({ ...member });
	}
	return { passages: coalescePassages(passages, merged), detached: merged };
}

/**
 * Complete one known mirrored operation after mapping the transaction. A replacement
 * crossing several old passages becomes one new passage for exactly its recipients.
 * Member ranges describe the operation before the changes; value is already mapped.
 */
export function applyPassageTransfer(
	value: PassageState,
	changes: ChangeDesc,
	members: readonly PassageMember[],
	reconnect = false
): PassageState {
	if (members.length < 2) return value;
	const mapped = members.map((member) => ({
		header: changes.mapPos(member.header, 1),
		from: changes.mapPos(member.from, -1),
		to: changes.mapPos(member.to, 1)
	}));
	let passages = value.passages;
	for (const member of mapped) {
		// Keep these cuts until the replacement is installed; merging now would
		// close a zero-width cut made for an earlier recipient.
		passages = removeOccurrence(passages, member);
		// An emptied old passage at the replacement boundary has been subsumed
		// by this operation. Keeping both would give a later insertion two owners.
		passages = passages
			.map((passage) => ({
				members: passage.members.filter(
					(own) =>
						own.header !== member.header ||
						own.from !== own.to ||
						own.from < member.from ||
						own.from > member.to
				)
			}))
			.filter((passage) => passage.members.length >= 2);
	}
	// Detaching a zero-width occurrence can leave an empty position for its
	// other peers. Remove these after EVERY recipient has been processed, so a
	// later recipient cannot recreate a subset placeholder beside the full one.
	passages = passages
		.map((passage) => ({
			members: passage.members.filter(
				(member) =>
					member.from !== member.to ||
					!mapped.some(
						(range) =>
							range.header === member.header && range.from <= member.from && member.to <= range.to
					)
			)
		}))
		.filter((passage) => passage.members.length >= 2);
	let detached = value.detached;
	if (reconnect) {
		detached = clearPassageExclusions(detached, mapped);
	}
	return {
		passages: excludeDetachedPoints(
			coalescePassages([...passages, { members: mapped }], detached),
			detached
		),
		detached
	};
}

/** An explicit reconnection retires only the local exceptions it actually covers. */
export function clearPassageExclusions(
	detached: readonly PassageMember[],
	ranges: readonly PassageMember[]
): PassageMember[] {
	let kept = [...detached];
	for (const range of ranges) {
		kept = kept.flatMap((member) => {
			if (member.header !== range.header || member.to < range.from || range.to < member.from)
				return [member];
			return [
				...(member.from < range.from ? [{ ...member, to: range.from }] : []),
				...(range.to < member.to ? [{ ...member, from: range.to }] : [])
			];
		});
	}
	return kept;
}

// Decision record: docs/subsystems/section-links.md — membership changes preserve existing intent.
import { coalescePassages, type PassageMember, type SharedPassage } from './link-passages.js';

function slice(passage: SharedPassage, from: number, to: number): SharedPassage {
	return {
		members: passage.members.map((member) => ({
			header: member.header,
			from: member.from + from,
			to: member.from + to
		}))
	};
}

function equalRange(left: PassageMember, right: PassageMember): boolean {
	return left.from === right.from && left.to === right.to;
}

function covers(container: PassageMember, member: PassageMember): boolean {
	// A paired empty position is its own connection, not a claim on surrounding text.
	return member.from === member.to
		? container.from === member.from && container.to === member.to
		: container.from <= member.from && container.to >= member.to;
}

function order(left: PassageMember, right: PassageMember): number {
	if (left.from === left.to && equalRange(left, right)) return 0;
	if (left.to <= right.from) return -1;
	if (left.from >= right.to) return 1;
	return 0;
}

/** A new member can add recipients, never reinterpret a previously local passage. */
function preservesIndependence(
	members: PassageMember[],
	existing: readonly SharedPassage[],
	groups: readonly (readonly number[])[]
): boolean {
	for (let i = 0; i < members.length; i++) {
		for (let j = i + 1; j < members.length; j++) {
			const left = members[i];
			const right = members[j];
			if (!groups.some((group) => group.includes(left.header) && group.includes(right.header)))
				continue;
			const alreadyConnected = existing.some((passage) => {
				const a = passage.members.find((member) => member.header === left.header);
				const b = passage.members.find((member) => member.header === right.header);
				return (
					a &&
					b &&
					covers(a, left) &&
					covers(b, right) &&
					left.from - a.from === right.from - b.from
				);
			});
			if (!alreadyConnected) return false;
		}
	}
	return true;
}

function preservesOrder(members: PassageMember[], passages: SharedPassage[]): boolean {
	for (const passage of passages) {
		let relativeOrder = 0;
		for (const member of members) {
			const previous = passage.members.find((other) => other.header === member.header);
			if (!previous) continue;
			const next = order(member, previous);
			if (next && relativeOrder && next !== relativeOrder) return false;
			if (next) relativeOrder = next;
		}
	}
	return true;
}

/**
 * Extend stored correspondence using new alignment evidence. Seeded connections
 * have priority: candidates split at their boundaries, inherit all their peers,
 * and are refused if those peers imply contradictory positions or old local text.
 * No text is needed here: candidates and seeds already promise exact equality.
 */
export function extendPassages(
	existing: readonly SharedPassage[],
	candidates: readonly SharedPassage[],
	existingGroups: readonly (readonly number[])[] = [],
	local: readonly PassageMember[] = []
): SharedPassage[] {
	const seeds = coalescePassages(existing, local);
	let result = seeds;
	for (const candidate of coalescePassages(candidates, local)) {
		const length = candidate.members[0].to - candidate.members[0].from;
		if (
			length < 0 ||
			candidate.members.some((member) => member.to - member.from !== length) ||
			new Set(candidate.members.map((member) => member.header)).size !== candidate.members.length
		)
			continue;
		const boundaries = new Set([0, length]);
		for (const member of candidate.members) {
			for (const passage of result) {
				const seed = passage.members.find((other) => other.header === member.header);
				if (!seed) continue;
				for (const position of [seed.from, seed.to]) {
					if (position > member.from && position < member.to)
						boundaries.add(position - member.from);
				}
			}
		}
		const cuts = [...boundaries].sort((a, b) => a - b);
		if (!length) cuts.push(0);
		for (let index = 1; index < cuts.length; index++) {
			const proposed = slice(candidate, cuts[index - 1], cuts[index]);
			const size = cuts[index] - cuts[index - 1];
			const members = new Map(proposed.members.map((member) => [member.header, member]));
			const used = new Map<SharedPassage, number>();
			let conflict = false;
			for (const member of proposed.members) {
				for (const passage of result) {
					const seed = passage.members.find((other) => other.header === member.header);
					if (!seed || !covers(seed, member)) continue;
					const offset = member.from - seed.from;
					if (used.has(passage) && used.get(passage) !== offset) conflict = true;
					used.set(passage, offset);
					for (const peer of slice(passage, offset, offset + size).members) {
						const previous = members.get(peer.header);
						if (previous && !equalRange(previous, peer)) conflict = true;
						members.set(peer.header, peer);
					}
				}
			}
			const union = [...members.values()].sort((a, b) => a.header - b.header);
			if (
				conflict ||
				!preservesIndependence(union, seeds, existingGroups) ||
				!preservesOrder(union, result)
			)
				continue;
			const next: SharedPassage[] = [];
			for (const passage of result) {
				const offset = used.get(passage);
				if (offset === undefined) {
					next.push(passage);
					continue;
				}
				const fullLength = passage.members[0].to - passage.members[0].from;
				if (offset > 0) next.push(slice(passage, 0, offset));
				if (offset + size < fullLength) next.push(slice(passage, offset + size, fullLength));
			}
			next.push({ members: union });
			result = next;
		}
	}
	return coalescePassages(result, local);
}

import type { LinkDifference, TextRange } from './types.js';

/** Format an aligned comparison without changing stored editing intent. */
export function describeLinkDifferences(
	text: string,
	members: readonly { header: number; body: TextRange; holes: readonly TextRange[] }[]
): LinkDifference[] {
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
			// copy happened to have, and a run that spans lines ends on a different
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
				text: hole ? text.slice(from, to) : '',
				before: text.slice(member.body.from + previous, from),
				after: text.slice(to, member.body.from + next)
			};
		})
	}));
}

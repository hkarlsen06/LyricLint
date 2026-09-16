import type {
	LegendVoiceGroup,
	ParsedDocument,
	PerformerRecord,
	Section
} from '$lib/core/types.js';
import { decodeLegendText } from '$lib/core/legend.js';
import { findExactPerformer } from './identity.js';

export function exactMembers(
	rawNameText: string,
	roster: readonly PerformerRecord[]
): PerformerRecord[] | undefined {
	const name = decodeLegendText(rawNameText);
	const whole = findExactPerformer(name, roster);
	if (whole) {
		return [whole];
	}

	const pieces = rawNameText.split(/\s+&\s+/u);
	if (pieces.length < 2) {
		return undefined;
	}

	const members = pieces.map((piece) => findExactPerformer(decodeLegendText(piece), roster));
	return members.every((member): member is PerformerRecord => member !== undefined)
		? members
		: undefined;
}

export function logicalHeaderGroups(
	document: ParsedDocument,
	section: Section,
	knownRoster: readonly PerformerRecord[]
): LegendVoiceGroup[] {
	const groups = section.header?.legendGroups ?? [];
	const logical: LegendVoiceGroup[] = [];
	let index = 0;

	while (index < groups.length) {
		const first = groups[index];
		if (!first || first.styleSlot !== 1) {
			if (first) {
				logical.push(first);
			}
			index += 1;
			continue;
		}

		let combined: LegendVoiceGroup | undefined;
		let combinedTo = index + 1;
		for (let end = groups.length; end > index + 1; end -= 1) {
			const slice = groups.slice(index, end);
			if (slice.some((group) => group.styleSlot !== 1 || !group.markupSupported)) {
				continue;
			}
			const last = slice.at(-1);
			if (!last) {
				continue;
			}
			const name = decodeLegendText(document.text.slice(first.nameRange.from, last.nameRange.to));
			if (!findExactPerformer(name, knownRoster)) {
				continue;
			}

			combined = {
				from: first.from,
				to: last.to,
				styleSlot: 1,
				raw: document.text.slice(first.from, last.to),
				rawNameText: document.text.slice(first.nameRange.from, last.nameRange.to),
				nameRange: { from: first.nameRange.from, to: last.nameRange.to },
				ambiguousAmpersands: slice.flatMap((group) => group.ambiguousAmpersands),
				markupSupported: true,
				separatorBefore: first.separatorBefore
			};
			combinedTo = end;
			break;
		}

		logical.push(combined ?? first);
		index = combined ? combinedTo : index + 1;
	}

	return logical;
}

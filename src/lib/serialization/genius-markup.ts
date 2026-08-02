import type { PerformerRecord, StyleSlot } from '$lib/performers/types.js';

export type LegendMember = string | Pick<PerformerRecord, 'displayName'>;

export interface SerializableLegendGroup {
	styleSlot: StyleSlot;
	/**
	 * Supplying members is the unambiguous safe path: separators are generated
	 * outside escaped performer names.
	 */
	members?: readonly LegendMember[];
	/** Compatibility input for a single performer name. */
	rawNameText?: string;
}

/** Escape untrusted performer text for literal inclusion in Genius markup. */
export function escapeLegendText(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

function memberName(member: LegendMember): string {
	return typeof member === 'string' ? member : member.displayName;
}

function serializeGroup(group: SerializableLegendGroup): string {
	const members = group.members;
	const name =
		members && members.length > 0
			? members.map((member) => escapeLegendText(memberName(member))).join(' & ')
			: escapeLegendText(group.rawNameText ?? '');

	return wrapVoiceSpan(name, group.styleSlot);
}

/**
 * Serialize canonical group separators. A member ampersand is generated inside
 * its group's wrapper, while ampersands belonging to names are escaped.
 */
export function serializeLegend(groups: readonly SerializableLegendGroup[]): string {
	const serialized = groups.map(serializeGroup);
	if (serialized.length < 2) {
		return serialized[0] ?? '';
	}

	return `${serialized.slice(0, -1).join(', ')} & ${serialized.at(-1)}`;
}

/** Wrap exact lyric content in one of Genius' four supported style slots. */
export function wrapVoiceSpan(text: string, styleSlot: StyleSlot): string {
	switch (styleSlot) {
		case 1:
			return text;
		case 2:
			return `<i>${text}</i>`;
		case 3:
			return `<b>${text}</b>`;
		case 4:
			return `<i><b>${text}</b></i>`;
	}
}

/**
 * The exact opening and closing markers one style slot wraps content in.
 *
 * Derived from `wrapVoiceSpan` rather than tabulated separately, so the four
 * slots keep one definition. Slot 1 yields two empty strings.
 */
export function styleTags(styleSlot: StyleSlot): { opening: string; closing: string } {
	const marker = '\u{E000}';
	const wrapped = wrapVoiceSpan(marker, styleSlot);
	const markerFrom = wrapped.indexOf(marker);
	return {
		opening: wrapped.slice(0, markerFrom),
		closing: wrapped.slice(markerFrom + marker.length)
	};
}

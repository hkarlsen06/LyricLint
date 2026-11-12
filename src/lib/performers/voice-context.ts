import type { SerializedSelection } from '#lib/core/types.js';
import type { VoiceGroupRange } from '#lib/editor/contracts.js';

/** Range containment shared by the caret announcer and shell context. */
export function performerRangeAtCaret(
	groups: readonly VoiceGroupRange[],
	selection: SerializedSelection,
	includeRangeEnd = false
): VoiceGroupRange | undefined {
	if (selection.anchor !== selection.head) return undefined;
	return (
		groups.find((group) => group.from <= selection.head && selection.head < group.to) ??
		(includeRangeEnd ? groups.find((group) => group.to === selection.head) : undefined)
	);
}

/** Retain separate passages: a joint group is one range, never a union of singers. */
export function performerRangesInSelection(
	groups: readonly VoiceGroupRange[],
	selection: SerializedSelection
): readonly VoiceGroupRange[] {
	if (selection.anchor === selection.head) {
		const range = performerRangeAtCaret(groups, selection, true);
		return range ? [range] : [];
	}
	const from = Math.min(selection.anchor, selection.head);
	const to = Math.max(selection.anchor, selection.head);
	return groups.filter((group) => !group.legend && group.from < to && group.to > from);
}

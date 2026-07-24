import type {
	Section,
	StyleSlot,
	StyleSlotAllocation,
	VoiceGroup,
	VoiceGroupKey
} from '../core/types.js';
import { makeVoiceGroupKey } from './identity.js';
import type { SlotOrderIssue } from './types.js';

const STYLE_SLOTS: readonly StyleSlot[] = [1, 2, 3, 4];

function identityOf(group: VoiceGroup): VoiceGroupKey {
	return group.performerIds.length > 0 ? makeVoiceGroupKey(group.performerIds) : group.id;
}

/**
 * Recover an established slot or allocate the first unused one. Existing
 * section-local assignments are never recounted or reformatted.
 */
export function allocateStyleSlot(section: Section, groupKey: VoiceGroupKey): StyleSlotAllocation {
	const existing = section.voiceGroups.find((group) => identityOf(group) === groupKey);
	if (existing) {
		return { status: 'existing', styleSlot: existing.styleSlot };
	}

	const used = new Set(section.voiceGroups.map((group) => group.styleSlot));
	const available = STYLE_SLOTS.find((slot) => !used.has(slot));
	return available ? { status: 'available', styleSlot: available } : { status: 'unavailable' };
}

/**
 * Report source-order deviations and retain a distinct issue for every group
 * beyond the four representable differentiation slots.
 */
export function analyzeSlotOrder(section: Section): SlotOrderIssue[] {
	const issues: SlotOrderIssue[] = [];
	const seenGroups = new Set<VoiceGroupKey>();
	let expectedIndex = 0;

	for (const group of section.voiceGroups) {
		const identity = identityOf(group);
		if (seenGroups.has(identity)) {
			continue;
		}
		seenGroups.add(identity);

		if (expectedIndex >= STYLE_SLOTS.length) {
			issues.push({
				kind: 'unavailable',
				groupId: group.id,
				actual: group.styleSlot,
				expected: group.styleSlot,
				range: group.sourceRange,
				reason: 'unavailable-fifth-slot'
			});
			expectedIndex += 1;
			continue;
		}

		const expected = STYLE_SLOTS[expectedIndex];
		if (group.styleSlot !== expected) {
			issues.push({
				kind: 'style-order',
				groupId: group.id,
				actual: group.styleSlot,
				expected,
				range: group.sourceRange
			});
		}
		expectedIndex += 1;
	}

	return issues;
}

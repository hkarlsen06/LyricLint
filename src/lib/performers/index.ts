import type { PerformerRecord, PerformerRoster } from '../core/types.js';
import { findExactPerformer } from './identity.js';

/** Create immutable exact-match roster operations over the supplied records. */
export function createPerformerRoster(records: readonly PerformerRecord[]): PerformerRoster {
	const roster = [...records];
	const byId = new Map(roster.map((performer) => [performer.id, performer]));
	return {
		list: () => roster,
		get: (id) => byId.get(id),
		findExact: (displayNameOrAlias) => findExactPerformer(displayNameOrAlias, roster)
	};
}

export {
	findExactPerformer,
	makeVoiceGroupKey,
	normalizePerformerKey,
	suggestPerformerMatches
} from './identity.js';
export { extractPerformers } from './import.js';
export { allocateStyleSlot, analyzeSlotOrder } from './allocation.js';
export { assignVoiceGroup, insertSectionHeader, removeDifferentiation } from './transform.js';
export { TOO_MANY_GROUP_OPTIONS } from './types.js';
export type {
	AppliedAssignmentResult,
	AssignmentBlockReason,
	AssignmentResult,
	BlockedAssignmentResult,
	DocumentTransformResult,
	ImportedVoiceGroup,
	ImportExtraction,
	ImportSuggestion,
	SlotOrderDeviation,
	SlotOrderIssue,
	TooManyGroupOption,
	UnavailableSlotIssue
} from './types.js';

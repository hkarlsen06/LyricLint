import type {
	AtomicDocumentEdit,
	ImportSuggestion as CoreImportSuggestion,
	PerformerColorId,
	PerformerId,
	PerformerRecord,
	SerializedSelection,
	StyleSlot,
	TextRange,
	VoiceGroup,
	VoiceGroupKey
} from '$lib/core/types.js';

export type {
	AtomicDocumentEdit,
	PerformerColorId,
	PerformerId,
	PerformerRecord,
	SerializedSelection,
	StyleSlot,
	TextRange,
	VoiceGroup,
	VoiceGroupKey
};

export type ImportSuggestion = CoreImportSuggestion;

/** A header group resolved without changing the parser's lossless syntax model. */
export interface ImportedVoiceGroup extends VoiceGroup {
	groupKey: VoiceGroupKey;
	sectionFrom: number;
	inlineRanges: TextRange[];
	unresolved?: boolean;
}

/** Non-destructive performer information derived from canonical source markup. */
export interface ImportExtraction {
	rosterAdditions: PerformerRecord[];
	unresolvedVoiceGroups: VoiceGroup[];
	suggestions: ImportSuggestion[];
	voiceGroups: ImportedVoiceGroup[];
}

export type AssignmentBlockReason =
	| 'empty-selection'
	| 'whitespace-selection'
	| 'cross-section'
	| 'invalid-range'
	| 'grapheme-boundary'
	| 'too-many-groups';

export const TOO_MANY_GROUP_OPTIONS = [
	'merge',
	'split',
	'remove-differentiation',
	'cancel'
] as const;

type TooManyGroupOption = (typeof TOO_MANY_GROUP_OPTIONS)[number];

interface AppliedAssignmentResult {
	status: 'applied';
	edit: AtomicDocumentEdit;
	styleSlot: StyleSlot;
}

interface BlockedAssignmentResult {
	status: 'blocked';
	reason: AssignmentBlockReason;
	blocked?: AssignmentBlockReason;
	options?: readonly TooManyGroupOption[];
}

export type AssignmentResult = AppliedAssignmentResult | BlockedAssignmentResult;

export type DocumentTransformResult =
	| { status: 'applied'; edit: AtomicDocumentEdit }
	| { status: 'blocked'; reason: Exclude<AssignmentBlockReason, 'too-many-groups'> };

interface SlotOrderDeviation {
	kind: 'style-order';
	groupId: string;
	actual: StyleSlot;
	expected: StyleSlot;
	range?: TextRange;
}

interface UnavailableSlotIssue {
	kind: 'unavailable';
	groupId: string;
	actual: StyleSlot;
	expected: StyleSlot;
	range?: TextRange;
	reason: 'unavailable-fifth-slot';
}

export type SlotOrderIssue = SlotOrderDeviation | UnavailableSlotIssue;

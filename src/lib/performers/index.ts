import type {
	AssignmentRequest,
	AssignmentResult,
	ImportExtraction,
	InsertSectionHeaderRequest,
	ParsedDocument,
	PerformerRecord,
	PerformerRoster,
	RemoveDifferentiationRequest,
	Section,
	StyleSlotAllocation,
	StyleSlotOrderIssue,
	VoiceGroupKey
} from '../core/types.js';

function performerWorker(): never {
	throw new Error('not implemented: performer worker');
}

/** Create exact-match roster operations without rewriting performer display names. */
export function createPerformerRoster(_records: readonly PerformerRecord[]): PerformerRoster {
	void _records;
	return performerWorker();
}

/** Extract exact header candidates, unresolved voices, and non-destructive suggestions. */
export function extractPerformers(
	_document: ParsedDocument,
	_knownRoster: readonly PerformerRecord[]
): ImportExtraction {
	void _document;
	void _knownRoster;
	return performerWorker();
}

/** Allocate or recover a stable section-local style slot for one voice-group key. */
export function allocateStyleSlot(
	_section: Section,
	_groupKey: VoiceGroupKey
): StyleSlotAllocation {
	void _section;
	void _groupKey;
	return performerWorker();
}

/** Report legend groups whose ordering conflicts with the four canonical slots. */
export function analyzeSlotOrder(_section: Section): StyleSlotOrderIssue[] {
	void _section;
	return performerWorker();
}

/** Build one atomic header-and-selection edit for a performer assignment. */
export function assignVoiceGroup(_request: AssignmentRequest): AssignmentResult {
	void _request;
	return performerWorker();
}

/** Build one atomic insertion for a chosen localized or custom section header. */
export function insertSectionHeader(_request: InsertSectionHeaderRequest): AssignmentResult {
	void _request;
	return performerWorker();
}

/** Build one explicit atomic edit that removes differentiation from a section. */
export function removeDifferentiation(_request: RemoveDifferentiationRequest): AssignmentResult {
	void _request;
	return performerWorker();
}

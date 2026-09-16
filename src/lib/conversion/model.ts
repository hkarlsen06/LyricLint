import type {
	LineAnchor,
	PerformerRecord,
	SectionLink,
	SerializedSelection,
	StyleSlot,
	TextEdit,
	TextRange
} from '$lib/core/types.js';
import type { ProfileId } from '$lib/profiles/types.js';
import type { InstrumentalIntervalFacts, QuantityFacts } from '$lib/profiles/decisions.js';

export const CONVERSION_SCHEMA = 1 as const;
export const CONVERTER_VERSION = '1' as const;
/** Checked before scanning. These ceilings describe work, never elapsed time. */
export const CONVERSION_LIMITS = { text: 1_000_000, records: 100_000, edits: 10_000 } as const;
export type ContentKind = 'original' | 'translation' | 'romanization' | 'unknown';
export type EngineRefusalCode =
	| 'invalid-input'
	| 'unsupported-version'
	| 'operation-limit'
	| 'stale-basis'
	| 'invariant-failure'
	| 'unavailable-capability';
export interface EngineRefusal {
	code: EngineRefusalCode;
	message: string;
}
export type EngineResult<T> = { ok: true; value: T } | { ok: false; refusal: EngineRefusal };
export function refuse<T>(code: EngineRefusalCode, message: string): EngineResult<T> {
	return { ok: false, refusal: { code, message } };
}

export interface ContentOwner extends TextRange {
	id: string;
	revision: number;
	authoredProfile: ProfileId;
}
export interface ContentLine extends TextRange {
	id: string;
	time?: number;
}
export interface SectionRecord {
	id: string;
	at: number;
	order: number;
	header: string;
	name: string;
	explicitEmpty: boolean;
	headerVisible?: false;
	literalHeaderRange?: TextRange;
	type?: 'Intro' | 'Verse' | 'PreChorus' | 'Chorus' | 'Hook' | 'Bridge' | 'Outro';
}
export interface WrapperRecord extends TextRange {
	id: string;
	kind: 'annotation' | 'voice';
	profile: ProfileId;
	open: string;
	close: string;
	openOrder: number;
	closeOrder: number;
	annotationId?: string;
	styleSlot?: StyleSlot;
}
export interface AuthoredForm extends TextRange {
	id: string;
	profile: ProfileId;
	text: string;
	ownerId: string;
	ownerRevision: number;
}
export interface LanguageRange extends TextRange {
	id: string;
	language: string;
}
export interface VoiceAssignment extends TextRange {
	id: string;
	sectionId: string;
	performerIds: string[];
	anonymous?: true;
	styleSlot?: StyleSlot;
	wrapperId?: string;
	rawNameText?: string;
}
export interface LinkMember extends TextRange {
	sectionId: string;
}
export interface LinkRecord {
	id: string;
	sectionIds: string[];
	holes: TextRange[];
	passages?: { members: LinkMember[] }[];
	detached?: LinkMember[];
}
export interface MarkerRecord {
	id: string;
	at: number;
	order: number;
	profile: 'musixmatch';
	/** Exact marker and one following blank line, including authored line endings. */
	text: string;
	decisionId: string;
}
export type ConversionDecision =
	| { id: string; kind: 'keep-form'; profile: ProfileId; ownerId: string; ownerRevision: number }
	| {
			id: string;
			kind: 'censored-token';
			profile: ProfileId;
			ownerId: string;
			ownerRevision: number;
			from: number;
			to: number;
			heardPrefix: string;
	  }
	| {
			id: string;
			kind: 'quantity';
			profile: ProfileId;
			ownerId: string;
			ownerRevision: number;
			from: number;
			to: number;
			facts: QuantityFacts;
	  }
	| {
			id: string;
			kind: 'instrumental-interval';
			profile: 'musixmatch';
			ownerId: string;
			ownerRevision: number;
			from: number;
			to: number;
			facts: InstrumentalIntervalFacts;
	  };

/** One shared string. Syntax records contain delimiters, never copies of enclosed lyrics. */
export interface ConversionDocument {
	schema: typeof CONVERSION_SCHEMA;
	converterVersion: typeof CONVERTER_VERSION;
	contentKind: ContentKind;
	/** Authoritative default for rich documents; DraftRecord.language is its compatibility view. */
	defaultLanguage: string;
	recordingId?: string;
	content: string;
	/** Monotonic allocator high-water mark; history integrations must retain its maximum. */
	nextId: number;
	owners: ContentOwner[];
	lines: ContentLine[];
	sections: SectionRecord[];
	wrappers: WrapperRecord[];
	forms: AuthoredForm[];
	languageRanges: LanguageRange[];
	voices: VoiceAssignment[];
	markers: MarkerRecord[];
	links: LinkRecord[];
	decisions: ConversionDecision[];
}

export interface ProjectionSegment extends TextRange {
	kind: 'copied' | 'transformed' | 'generated';
	contentFrom: number;
	contentTo: number;
	recordId?: string;
	/** Identifies the exact visible delimiter for structural edit reconciliation. */
	part?: 'header' | 'open' | 'close' | 'marker';
}
export interface HiddenRecord {
	recordId: string;
	at: number;
	contentAt: number;
	contentTo?: number;
}
export interface ProjectedSection {
	id: string;
	at: number;
	headerFrom?: number;
	headerTo?: number;
	name: string;
	type?: SectionRecord['type'];
}
export interface ConversionFinding {
	code: string;
	recordId: string;
	message: string;
	range?: TextRange;
}
export interface Projection {
	profile: ProfileId;
	text: string;
	segments: ProjectionSegment[];
	hidden: HiddenRecord[];
	sections: ProjectedSection[];
	lineAnchors: LineAnchor[];
	sectionLinks: SectionLink[];
	findings: ConversionFinding[];
}
export interface ImportInput {
	text: string;
	profile: ProfileId;
	language?: string;
	contentKind?: ContentKind;
	lineAnchors?: readonly LineAnchor[];
	sectionLinks?: readonly SectionLink[];
	performers?: readonly PerformerRecord[];
	nextId?: number;
}
export interface CommittedEdit {
	changes: readonly TextEdit[];
	/** Existing editor mirror has already expanded these changes. */ mirror?: boolean;
	onlySectionId?: string;
	performers?: readonly PerformerRecord[];
}
export interface ReconciledDocument {
	document: ConversionDocument;
	projection: Projection;
	/** Includes mirrored peer edits; all against the supplied projection. */ changes: TextEdit[];
}
export interface SwitchRequest {
	from: ProfileId;
	to: ProfileId;
	selection?: SerializedSelection;
}
export interface SwitchPlan {
	document: ConversionDocument;
	projection: Projection;
	selection?: SerializedSelection;
}

export function hasConversionContent(document: ConversionDocument): boolean {
	return (
		document.content.trim().length > 0 ||
		document.sections.length > 0 ||
		document.wrappers.length > 0 ||
		document.voices.length > 0 ||
		document.markers.length > 0 ||
		document.decisions.length > 0 ||
		document.links.length > 0 ||
		document.lines.some((line) => line.time !== undefined)
	);
}

export function allocateId(document: ConversionDocument, kind: string): string {
	return `${kind}:${document.nextId++}`;
}

/**
 * A UTF-16 code-unit offset into the canonical document string.
 *
 * This is the same indexing scheme used by JavaScript strings and CodeMirror.
 */
export type Offset = number;

/** A half-open UTF-16 range whose `from` is inclusive and `to` is exclusive. */
export interface TextRange {
	from: Offset;
	to: Offset;
}

/** One of the four section-local Genius performer differentiation styles. */
export type StyleSlot = 1 | 2 | 3 | 4;

/** The line ending that followed a parsed physical line. */
export type LineEndingKind = 'lf' | 'crlf' | 'cr' | 'none';

/** An exact ampersand whose meaning requires roster-aware interpretation. */
export interface AmbiguousAmpersand extends TextRange {
	raw: '&';
}

/**
 * A losslessly parsed performer-legend candidate.
 *
 * `rawNameText` is never normalized. Ampersands within the same style run are
 * retained in the name and exposed separately for roster-aware resolution.
 */
export interface LegendVoiceGroup extends TextRange {
	styleSlot: StyleSlot;
	raw: string;
	rawNameText: string;
	nameRange: TextRange;
	ambiguousAmpersands: AmbiguousAmpersand[];
	markupSupported: boolean;
	separatorBefore?: string;
}

/**
 * A resolved section-local voice group.
 *
 * Joint performers share one group and therefore consume one style slot.
 */
export interface VoiceGroup {
	id: string;
	performerIds: string[];
	styleSlot: StyleSlot;
	rawNameText?: string;
	sourceRange?: TextRange;
	ambiguousAmpersands?: AmbiguousAmpersand[];
}

/** A canonical supported performer-style wrapper within one lyric line. */
export interface SupportedStyleSpan extends TextRange {
	slot: StyleSlot;
	rawTag: string;
	contentFrom: Offset;
	contentTo: Offset;
	closingTag: string;
}

/** A literal tag or malformed markup fragment that LyricLint cannot interpret. */
export interface UnsupportedStyleSpan extends TextRange {
	unsupported: true;
	rawTag: string;
	reason: 'unsupported-tag' | 'malformed-markup';
}

/** A supported voice span or an exact unsupported markup fragment. */
export type VoiceSpan = SupportedStyleSpan | UnsupportedStyleSpan;

/** A lyric line and its exact canonical-document ranges. */
export interface LyricLine extends TextRange {
	text: string;
	lineEnding: LineEndingKind;
	lineEndingRange: TextRange;
	styleSpans: VoiceSpan[];
}

/** A parsed bracketed section header, including its raw legend syntax. */
export interface SectionHeader extends TextRange {
	raw: string;
	name: string;
	namePart: string;
	nameRange: TextRange;
	rawNamePart: string;
	ordinal?: number;
	ordinalRange?: TextRange;
	legend?: string;
	legendRange?: TextRange;
	legendGroups: LegendVoiceGroup[];
	closed: boolean;
}

/** A recoverable syntax problem with an exact canonical-document range. */
export interface ParseIssue extends TextRange {
	code: 'unbalanced-section-bracket' | 'unsupported-markup' | 'malformed-markup';
	message: string;
	raw: string;
}

/** A header-delimited or blank-line-delimited portion of the lyric document. */
export interface Section extends TextRange {
	header?: SectionHeader;
	language: string;
	voiceGroups: VoiceGroup[];
	lines: LyricLine[];
}

/** A lossless derived view of the canonical lyric string. */
export interface ParsedDocument {
	text: string;
	sections: Section[];
	syntaxIssues: ParseIssue[];
}

/** Review status for bundled Genius guideline metadata. */
export type SourceReviewStatus = 'reviewed' | 'needs-review' | 'retired';

/** Versioned provenance for one bundled Genius guideline source. */
export interface SourceReference {
	id: string;
	url: string;
	annotationId?: number;
	pageTitle: string;
	sectionTitle: string;
	retrievedAt: string;
	lastVerifiedAt: string;
	contentHash?: string;
	reviewStatus: SourceReviewStatus;
}

/** Diagnostic importance, ordered from errors through manual review. */
export type Severity = 'error' | 'warning' | 'suggestion' | 'manual-review';

/** Whether a rule's fixes can be applied directly, previewed, or not offered. */
export type Fixability = 'safe' | 'preview' | 'none';

/** One replacement against a half-open range in a single base document. */
export interface TextEdit extends TextRange {
	insert: string;
}

/** A serializable contiguous editor selection. */
export interface SerializedSelection {
	anchor: Offset;
	head: Offset;
}

/** A validated set of edits that must be dispatched as one editor transaction. */
export interface AtomicDocumentEdit {
	baseRevision: number;
	edits: TextEdit[];
	selectionAfter?: SerializedSelection;
}

/** A labeled safe or preview-only diagnostic fix. */
export interface DiagnosticFix {
	kind: Exclude<Fixability, 'none'>;
	label: string;
	edit: AtomicDocumentEdit;
}

/** A source-backed finding against the same revision as its parsed document. */
export interface Diagnostic extends TextRange {
	ruleId: string;
	severity: Severity;
	message: string;
	explanation: string;
	sourceIds: string[];
	/**
	 * Labeled fixes for this diagnostic. Only `kind: 'safe'` fixes are eligible
	 * for bulk application; `preview` fixes require explicit confirmation. Each
	 * fix carries one atomic edit so it applies as a single undoable transaction.
	 */
	fixes?: DiagnosticFix[];
}

/** Immutable inputs made available to framework-independent lint rules. */
export interface RuleContext {
	language: string;
	performers: readonly PerformerRecord[];
	sources: ReadonlyMap<string, SourceReference>;
	ruleSetVersion: string;
	/**
	 * Revision of the snapshot the rules run against. Fix edits must carry this
	 * as their `baseRevision` so stale fixes are rejected instead of misapplied.
	 */
	revision?: number;
}

/** A versioned, source-backed lint rule. */
export interface RuleDefinition {
	id: string;
	version: number;
	defaultSeverity: Severity;
	sourceIds: string[];
	fixability?: Fixability;
	check(document: ParsedDocument, context: RuleContext): Diagnostic[];
}

/** Metadata identifying a bundled, reviewed rule-set snapshot. */
export interface RuleSetManifest {
	version: string;
	publishedAt: string;
	sourceIds: string[];
	ruleIds: string[];
}

/** Stable opaque performer identifier. */
export type PerformerId = string;

/** Stable accessible palette identifier stored with a draft. */
export type PerformerColorId = string;

/** Stable identity key for one ordered roster-independent voice group. */
export type VoiceGroupKey = string;

/** One exact performer identity in a draft-local roster. */
export interface PerformerRecord {
	id: PerformerId;
	displayName: string;
	normalizedKey: string;
	aliases: string[];
	colorId: PerformerColorId;
	order: number;
}

/** A locally persisted lyric draft. All dates are ISO strings. */
export interface DraftRecord {
	id: string;
	title: string;
	text: string;
	originalText?: string;
	language: string;
	performers: PerformerRecord[];
	createdAt: string;
	updatedAt: string;
	ruleSetVersion: string;
	editorSelection?: SerializedSelection;
}

/** Lightweight metadata used to list drafts without opening their text. */
export interface DraftSummary {
	id: string;
	title: string;
	language: string;
	createdAt: string;
	updatedAt: string;
}

/** A revision-tagged, serializable draft state accepted by autosave. */
export interface AutosaveSnapshot {
	revision: number;
	draft: DraftRecord;
}

/** Application metadata persisted separately from lyric drafts. */
export interface AppMetadataRecord {
	key: string;
	value: string;
	updatedAt: string;
}

/** Policy used by a language pack when evaluating section headers. */
export type HeaderPolicy = 'localized' | 'english-preferred' | 'contextual' | 'unreviewed';

/** Reviewed spellings for one semantic section-header concept. */
export interface HeaderVocabulary {
	semanticPart: string;
	terms: string[];
}

/** One untrusted language-to-annotation entry from the source inventory. */
export interface LanguageInventoryEntry {
	language: string;
	annotationId: number;
}

/** A source-backed language header vocabulary or non-enforcing fallback. */
export interface LanguagePack {
	tag: string;
	displayName: string;
	policy: HeaderPolicy;
	headers: HeaderVocabulary[];
	sourceIds: string[];
	reviewed: boolean;
}

/** Read-only operations required from a draft-local performer roster. */
export interface PerformerRoster {
	list(): readonly PerformerRecord[];
	get(id: PerformerId): PerformerRecord | undefined;
	findExact(displayNameOrAlias: string): PerformerRecord | undefined;
}

/** A non-destructive possible match discovered while importing performer names. */
export interface ImportSuggestion {
	importedName: string;
	importedRange: TextRange;
	performerId: PerformerId;
	reason: 'case' | 'normalized-key' | 'alias';
}

/** Performer identities and unresolved styled voices extracted from a document. */
export interface ImportExtraction {
	rosterAdditions: PerformerRecord[];
	unresolvedVoiceGroups: VoiceGroup[];
	suggestions: ImportSuggestion[];
}

/** Inputs for assigning one joint or solo group to an exact text selection. */
export interface AssignmentRequest {
	revision: number;
	text: string;
	document: ParsedDocument;
	selection: SerializedSelection;
	performerIds: PerformerId[];
	roster: readonly PerformerRecord[];
}

/** A reason a performer or section transformation made no document edit. */
export type AssignmentBlockReason =
	| 'empty-selection'
	| 'whitespace-selection'
	| 'cross-section'
	| 'invalid-range'
	| 'grapheme-boundary'
	| 'too-many-groups';

/** Result of a performer transform, including explicit non-mutating blocks. */
export type AssignmentResult =
	| { status: 'applied'; edit: AtomicDocumentEdit; styleSlot: StyleSlot }
	| { status: 'blocked'; reason: AssignmentBlockReason };

/** Inputs for inserting a header into an exact headerless section. */
export interface InsertSectionHeaderRequest {
	revision: number;
	text: string;
	document: ParsedDocument;
	sectionFrom: Offset;
	headerName: string;
	ordinal?: number;
}

/** Inputs for explicitly removing supported differentiation from one section. */
export interface RemoveDifferentiationRequest {
	revision: number;
	text: string;
	document: ParsedDocument;
	sectionFrom: Offset;
}

/** Result of section-local style allocation without source mutation. */
export type StyleSlotAllocation =
	| { status: 'available'; styleSlot: StyleSlot }
	| { status: 'existing'; styleSlot: StyleSlot }
	| { status: 'unavailable' };

/** A voice group whose position conflicts with its assigned slot order. */
export interface StyleSlotOrderIssue {
	groupId: string;
	actual: StyleSlot;
	expected: StyleSlot;
	range?: TextRange;
}

/** Serializable storage boundary for draft creation and lifecycle operations. */
export interface DraftRepository {
	list(): Promise<DraftSummary[]>;
	get(id: string): Promise<DraftRecord | undefined>;
	create(draft: DraftRecord): Promise<DraftRecord>;
	save(draft: DraftRecord): Promise<void>;
	rename(id: string, title: string): Promise<void>;
	duplicate(id: string, newId: string): Promise<DraftRecord>;
	delete(id: string): Promise<void>;
	deleteAll(): Promise<void>;
	setCurrent(id: string | undefined): Promise<void>;
	getCurrent(): Promise<string | undefined>;
}

/** State exposed by the revision-ordered autosave controller. */
export type AutosaveStatus = 'idle' | 'scheduled' | 'saving' | 'saved' | 'failed';

/** Revision-ordered draft autosave operations. */
export interface AutosaveController {
	schedule(snapshot: AutosaveSnapshot): void;
	flush(): Promise<void>;
	cancel(): void;
	/** Drop any pending write for one draft so a deleted draft cannot be resurrected. */
	cancelDraft?(draftId: string): void;
	status(): AutosaveStatus;
}

/** Draft-and-rule keyed session-only ignore operations. */
export interface SessionIgnoreStore {
	isIgnored(draftId: string, ruleId: string): boolean;
	ignore(draftId: string, ruleId: string): void;
	restore(draftId: string, ruleId: string): void;
	list(draftId: string): string[];
	clearDraft(draftId: string): void;
}

/** Internally consistent state emitted by the editor boundary. */
export interface EditorSnapshot {
	revision: number;
	text: string;
	selection: SerializedSelection;
	parsed: ParsedDocument;
	diagnostics: Diagnostic[];
	composing: boolean;
	canUndo: boolean;
	canRedo: boolean;
}

/** Shell-safe control surface for the CodeMirror-owned editor. */
export interface EditorHandle {
	focus(): void;
	getSnapshot(): EditorSnapshot;
	dispatchAtomic(edit: AtomicDocumentEdit): void;
	undo(): void;
	redo(): void;
	revealRange(range: TextRange): void;
	setSelection(selection: SerializedSelection): void;
	/**
	 * Open the section-header picker for the section containing the cursor, as
	 * if the user pressed the insert-section shortcut. Optional so headless
	 * handles can omit it.
	 */
	requestSectionHeader?(): void;
}

/** Immutable editor inputs owned by the application shell. */
export interface EditorContext {
	language: string;
	performers: readonly PerformerRecord[];
	ruleSetVersion: string;
}

/** Screen-coordinate request for an editor-owned source range. */
export interface EditorAnchorRequest {
	range: TextRange;
	prefer: 'above' | 'below';
}

/** Events emitted by the editor without exposing CodeMirror state objects. */
export interface EditorCallbacks {
	onSnapshot(snapshot: EditorSnapshot): void;
	onAssignRequest(request: EditorAnchorRequest): void;
	onSectionHeaderRequest(request: EditorAnchorRequest): void;
	onDiagnosticActivate(diagnostic: Diagnostic): void;
	onAnnouncement(message: string): void;
}

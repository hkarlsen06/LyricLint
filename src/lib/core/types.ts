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

/**
 * A canonical supported performer-style wrapper segment within one lyric line.
 *
 * A wrapper may span several physical lines. In that case each affected line
 * receives one segment so line-oriented editor and transform code can reason
 * about the styled content without treating normal multi-line Genius markup as
 * malformed.
 */
export interface SupportedStyleSpan extends TextRange {
	slot: StyleSlot;
	rawTag: string;
	contentFrom: Offset;
	contentTo: Offset;
	closingTag: string;
	continuedFromPreviousLine?: boolean;
	continuesToNextLine?: boolean;
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

/** A language inferred from the document that the shell can select directly. */
export interface DetectedDiagnosticLanguage {
	tag: string;
	displayName: string;
}

/**
 * When a finding's answer stops being able to change from typing.
 *
 * A rule runs against a whole parsed document on every keystroke, so a document
 * mid-composition is linted as if it were finished — and for most of what this
 * catalog checks, that is a claim the text to the right of the caret is about to
 * refute. `[` is an unbalanced bracket for as long as it takes to type `Verse`;
 * `thoug` is one character from `though`; a song has one distinct verse until
 * the second one exists. Every one of those is a card that appears, argues with
 * the transcriber, and retracts itself.
 *
 * The axis is not time and it is not the line — it is how far to the right a
 * change can still reach:
 *
 * - `character` — a fact about text already committed, whose *message* as well as
 *   whose existence is settled. Drawn at once, wherever the caret is.
 * - `caret` — provisional while the caret is on its line, typing or not. Every
 *   space between two words is trailing whitespace for a moment, and a
 *   transcriber pausing to listen must not be told about the one they are
 *   standing in.
 * - `line` — the rule reads a whole line, so its answer is provisional while that
 *   line is being written. This is the default, because most of the catalog
 *   matches words and line shapes. Unlike `caret` it needs live typing as well:
 *   a caret parked at the end of a finished song is not composing anything, and
 *   holding its line forever hides findings from the panel and from the bulk-fix
 *   batch that plans over what is visible.
 * - `document` — the rule is a claim about the shape of the song, which is not
 *   finished until typing stops.
 *
 * `filterForEditorState` is where this is spent; `deferActiveLineTrailingWhitespace`
 * was the one hand-rolled instance of it.
 */
export type SettlesOn = 'character' | 'caret' | 'line' | 'document';

/** A source-backed finding against the same revision as its parsed document. */
export interface Diagnostic extends TextRange {
	ruleId: string;
	severity: Severity;
	message: string;
	explanation: string;
	sourceIds: string[];
	/**
	 * Overrides the rule's own tier for this one finding.
	 *
	 * A rule can report findings that settle differently: `text.invisible-characters`
	 * flags a zero-width space, which is wrong the moment it exists, and a trailing
	 * run of spaces, which is only trailing until the next character. Carried on the
	 * diagnostic rather than split into two rules, for the same reason
	 * `presumedCorrect` is.
	 */
	settlesOn?: SettlesOn;
	/** Additional document ranges described by this same finding. */
	relatedRanges?: readonly TextRange[];
	/** Present when resolving the finding means selecting an inferred language. */
	detectedLanguage?: DetectedDiagnosticLanguage;
	/**
	 * The finding is a guess about intent whose likeliest answer is that the text
	 * is already right, so a shell leads with accepting it rather than with the
	 * change. It is carried here rather than read off the rule id because a rule
	 * can report both kinds: `adlib.parentheses` says a parenthesized ad-lib is
	 * miscapitalized, which is a fact, and that an unparenthesized one may want
	 * brackets, which is a question about how it was sung.
	 */
	presumedCorrect?: true;
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
	revision: number;
}

/** A versioned, source-backed lint rule. */
export interface RuleDefinition {
	id: string;
	version: number;
	defaultSeverity: Severity;
	sourceIds: string[];
	fixability?: Fixability;
	/**
	 * How far right a change can still reach and alter this rule's answer.
	 *
	 * Defaults to `line`, which is the safe reading: a rule that matches a word or
	 * a line shape is provisional until the caret leaves. Declare `character` only
	 * where a finding is about text that cannot be extended into something else,
	 * and `document` where the rule is a claim about the whole song.
	 */
	settlesOn?: SettlesOn;
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
	/**
	 * Lines tied to moments in the audio they were transcribed from.
	 *
	 * On the draft rather than beside the attached audio, because an anchor
	 * describes a *line* — it is written by typing, it moves when the text moves,
	 * and it is saved by the same autosave that saves the words. Keeping it here
	 * also means a duplicated draft keeps its anchors, and detaching the audio
	 * does not throw away work that is still correct for the same song.
	 *
	 * Plain JSON, so `copyDraft` and `exportDraft` are undisturbed.
	 */
	lineAnchors?: LineAnchor[];
	/**
	 * Repeated sections the user has tied together, so editing one edits them all.
	 *
	 * On the draft for the same reason the anchors are: a link describes *lines* of
	 * this document, it moves when they move, and it is saved by the autosave that
	 * saves the words.
	 */
	sectionLinks?: SectionLink[];
}

/**
 * Two or more sections of the same kind that are kept in step, apart from the
 * words they are each allowed to sing their own way.
 *
 * Written down as header line numbers rather than offsets, exactly as
 * `LineAnchor` is and for the same reason: an offset shifts on every keystroke
 * earlier in the document, while a line keeps its identity through anything
 * typed inside it. Inside the editor the live truth is a mapped range over each
 * header line; this is only how it is written down.
 */
export interface SectionLink {
	/** 1-based header lines, in document order. Fewer than two is not a link. */
	lines: number[];
	/**
	 * Every run of every member that is deliberately not kept in step, in
	 * document order.
	 *
	 * Flat rather than nested per member, because a run already says which member
	 * it is in by where it sits — and what makes two runs correspond is their
	 * ordinal within their own member, which nesting would have to restate. Two
	 * choruses differing by one line have one run each, and those two are the
	 * same difference.
	 *
	 * Absent means what it meant before differences existed: the members are kept
	 * identical throughout.
	 */
	holes?: LinkHole[];
}

/**
 * One run of one section that its link leaves alone, as a line and a column at
 * each end.
 *
 * A column as well as a line, because a difference can be part of a line —
 * `there tonight` against `there again` — which is the case the whole feature
 * was rebuilt for. Zero width is meaningful and is kept: it is where one copy
 * simply has nothing, and it is where the words the other copy has go.
 */
export interface LinkHole {
	/** 1-based line the run starts on. */
	line: number;
	/** Characters into that line. */
	column: number;
	/** 1-based line the run ends on, the same line for a run inside one. */
	endLine: number;
	/** Characters into the ending line. */
	endColumn: number;
}

/**
 * One difference inside a link group, with each member's own wording — the row
 * the link card's second list draws.
 */
export interface LinkDifference {
	/** Position in the group's shape, which is what an answer names. */
	index: number;
	/** One entry per member, in document order, however it reads today. */
	wordings: LinkWording[];
}

/**
 * One copy's version of one difference, with enough of its own line either side
 * to be read as a diff rather than as a floating fragment.
 *
 * `før, du kunne spørt meg` on its own says nothing about where in the chorus it
 * sits, or that the other copies simply stop at that point. The line around it
 * says both, and the shared halves are identical in every copy by construction —
 * which is what makes the versions line up under each other on screen.
 */
export interface LinkWording {
	headerFrom: number;
	/** The divergent run itself. Empty where this copy has nothing there. */
	text: string;
	/** Shared text before it, back to the start of its line. */
	before: string;
	/** Shared text after it, on to the end of its line. */
	after: string;
}

/** What the user answered in the link card. */
export interface SectionLinkChoice {
	/** The sections to tie together, the one the card was opened from first. */
	headers: readonly number[];
	/**
	 * Per difference of the resulting shape, whether the copies go on keeping
	 * their own words. Omitted keeps every one of them, which is what linking
	 * does on its own — collapsing one is the destructive answer and has to be
	 * asked for.
	 */
	keepDifferent?: readonly boolean[];
	/** A span of the opened section to set aside as its own, from a selection. */
	makeDifferent?: TextRange;
	/**
	 * Whose words win where a difference is collapsed, as a header offset.
	 *
	 * Any member of the group, not necessarily the one the card was opened from:
	 * noticing that the *third* chorus has the wording you meant to keep is the
	 * ordinary case, and hard-wiring the opened section would make the repair
	 * "close the card, open it again from the right copy". Defaults to the opened
	 * section, and an empty wording never wins — see `winningWording`.
	 */
	replaceFrom?: number;
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
	/**
	 * Who sings the section's unstyled lyrics, written into the plain slot by the
	 * same edit. Without it a first legend group landing in italic is a legend
	 * that does not begin at plain — the state `performer.style-order` flags and
	 * cannot fix, because naming those lyrics is not in the document to be found.
	 * See `assignmentNeedsSectionVoice`.
	 */
	sectionPerformerIds?: readonly PerformerId[];
}

/** One performer group to write into an exact section-local legend slot. */
export interface LegendGroupAssignment {
	styleSlot: StyleSlot;
	performerIds: PerformerId[];
}

/** Inputs for assigning existing styled and plain voices without rewriting lyrics. */
export interface LegendAssignmentRequest {
	revision: number;
	text: string;
	document: ParsedDocument;
	sectionFrom: Offset;
	assignments: LegendGroupAssignment[];
	roster: readonly PerformerRecord[];
	/**
	 * Style slots whose wrappers are stripped from the section body as part of
	 * the same edit, their legend groups dropped with them. This is what lets a
	 * section styled all the way through name its single voice: the slot moves
	 * to plain, so the legend does not start at italic with no plain group
	 * before it. Lyric text itself is preserved — only the markers go.
	 */
	unwrapSlots?: readonly StyleSlot[];
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

/**
 * Inputs for inserting a header at a section boundary.
 *
 * `sectionFrom` is either the start of an existing headerless section (including
 * an empty `[]` header) or the start of a physical line where a new section is
 * being created. The latter is what lets the editor command work in a blank
 * document and split an already headed section at the caret.
 */
export interface InsertSectionHeaderRequest {
	revision: number;
	text: string;
	document: ParsedDocument;
	sectionFrom: Offset;
	headerName: string;
	ordinal?: number;
	/** Localized terms identifying later headers that share this numbered part. */
	numberedHeaderTerms?: readonly string[];
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
	getRecentLanguages(): Promise<string[]>;
	/**
	 * A small, durable UI preference, by key.
	 *
	 * A generic pair rather than a method each, because the alternative is two more
	 * methods on this contract every time a control learns to remember itself. It
	 * lives in the same `appMetadata` table as the current draft and the recent
	 * languages — which matters beyond tidiness: that table is what the workspace
	 * backup copies and what `Delete all local data` clears, and a preference kept
	 * in `localStorage` instead would quietly escape both of those promises.
	 */
	getPreference(key: string): Promise<string | undefined>;
	setPreference(key: string, value: string): Promise<void>;
	rememberLanguage(language: string): Promise<void>;
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

/** Draft-and-diagnostic keyed session-only ignore operations. */
export interface SessionIgnoreStore {
	isIgnored(draftId: string, diagnosticKey: string): boolean;
	ignore(draftId: string, diagnosticKey: string): void;
	restore(draftId: string, diagnosticKey: string): void;
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
	/**
	 * This snapshot's document change arrived as one complete edit rather than as
	 * composition: a fix, a bulk fix, an inserted marker or header, a performer
	 * assignment, a whole document replaced.
	 *
	 * The shell cannot infer this and used to guess at it from how much text
	 * changed, which is wrong in both directions — `Fix all 2 · Replace with '`
	 * rewrites two characters in different verses for a net delta of zero, and a
	 * single-occurrence fix inserts one character at the caret exactly as typing
	 * one there would. `dispatchAtomicEdit` has always annotated its transaction
	 * `input.atomic`; this is that annotation reaching the shell, so `settlesOn`
	 * can tell a press from a keystroke instead of estimating.
	 *
	 * Absent on a selection-only snapshot, which changes no text.
	 */
	atomic?: true;
}

/** Shell-safe control surface for the CodeMirror-owned editor. */
export interface EditorHandle {
	focus(): void;
	getSnapshot(): EditorSnapshot;
	dispatchAtomic(edit: AtomicDocumentEdit): void;
	/** Render an atomic edit as a non-mutating editor decoration. */
	previewAtomic?(edit: AtomicDocumentEdit): void;
	/** Remove the current non-mutating edit preview. */
	clearPreview?(): void;
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
	/**
	 * Open the link picker for the repeated section containing the cursor, as if
	 * the user pressed the link shortcut. The same command over the same
	 * predicate, so the two ways in cannot come to mean different things.
	 */
	requestSectionLink?(): void;
	/**
	 * Show or hide find and replace, as if the user pressed `Mod-F`.
	 *
	 * The keystroke is bound to the *window* rather than to the editor, because
	 * the panel it opens is worth reaching from outside the document — so this is
	 * the second way in rather than the only one, and both run CodeMirror's own
	 * `openSearchPanel`. It focuses the find field itself, which is the one place
	 * in the workbench where a command moving focus is the whole point of it.
	 */
	toggleSearch?(): void;
	/** Open the guided performer-legend assignment for an inline mismatch. */
	requestPerformerLegendAssignment?(diagnostic: Diagnostic): void;
	/** Every section link, for the shell to write down. */
	getSectionLinks?(): SectionLink[];
	/** Replace every section link, for a draft being opened. */
	setSectionLinks?(links: readonly SectionLink[]): void;
	/**
	 * Tie these sections together, keeping every word they already disagree on.
	 *
	 * Linking writes nothing on its own: the words the copies already share
	 * become the shared runs and the rest is set aside as each copy's own, which
	 * is what makes two choruses differing by a line linkable at all. Making a
	 * difference agree is asked for per difference, through `keepDifferent`.
	 *
	 * `headers` leads with the section the picker was opened from, which is the
	 * copy whose wording wins wherever one has to. Fewer than two takes the named
	 * one out of whatever group it was in.
	 *
	 * Header offsets rather than line numbers, because the caller resolved them
	 * against the parse it is holding.
	 */
	linkSections?(choice: SectionLinkChoice): void;
	/**
	 * Every difference in the group these headers would form, with each copy's
	 * own wording — what the picker's second list is built from.
	 */
	getLinkDifferences?(headerOffsets: readonly number[]): LinkDifference[];
	/** Every line anchor, for the shell to write down. */
	getLineAnchors?(): LineAnchor[];
	/** Replace every line anchor, for a draft being opened. */
	setLineAnchors?(anchors: readonly LineAnchor[]): void;
	/**
	 * Tell the editor where the audio is, or `undefined` when nothing is attached.
	 *
	 * This marks one cell of the timestamp column and does nothing else. It is not
	 * permitted to scroll, and there is no follow mode behind it: a document that
	 * moves under the hands of someone typing into it is the single fastest way
	 * to make a transcription tool unusable.
	 *
	 * `undefined` also takes the column away entirely, which is the honest
	 * reading — with no audio there is nothing to show a time for and nothing to
	 * anchor a line to.
	 */
	setMediaPlayhead?(time: number | undefined): void;
	/**
	 * Enter or leave sync mode, where the document stops taking typing and a tap
	 * anchors the caret's line before moving to the next one.
	 *
	 * The editor owns the mode; this only asks. What actually happened comes back
	 * through `onLyricSyncChange`, which also fires when the editor ends it by
	 * itself — on `Escape`, or on running out of lines.
	 */
	setLyricSync?(active: boolean): void;
	/**
	 * One tap of a run, for a pointer with no `Space` to press.
	 *
	 * The same command the key is bound to, not a synthesised key event, so the
	 * two paths cannot come to mean different things. A no-op outside a run, like
	 * the binding.
	 */
	tapLyricSync?(): void;
	/** Whether the document scrolls to keep the playing line at the reading line. */
	setFollowPlayhead?(follow: boolean): void;
}

/**
 * A lyric line tied to a moment in the audio it was transcribed from.
 *
 * Serialized against the line *number* rather than a character offset: offsets
 * shift on every keystroke earlier in the document, while a line keeps its
 * identity through anything typed inside it. Inside the editor the live truth is
 * a mapped range over the line's text; this is only how it is written down.
 */
export interface LineAnchor {
	/** 1-based, matching CodeMirror's own line numbering. */
	line: number;
	/** Seconds into the attached audio. */
	time: number;
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
	/**
	 * Words the user had selected when they asked, for a card that can offer
	 * something about them.
	 *
	 * Only the link card reads it, and only from the keyboard path: selecting
	 * lyrics and pressing the shortcut is how a difference is created by hand.
	 * The pointer path deliberately does not report one, because widening what a
	 * bare selection opens is how an uninvited card starts arriving on the most
	 * common gesture in a text editor.
	 */
	selection?: TextRange;
}

/** Events emitted by the editor without exposing CodeMirror state objects. */
export interface EditorCallbacks {
	onSnapshot(snapshot: EditorSnapshot): void;
	onAssignRequest(request: EditorAnchorRequest): void;
	onSectionHeaderRequest(request: EditorAnchorRequest): void;
	onDiagnosticActivate(diagnostic: Diagnostic): void;
	onAnnouncement(message: string): void;
}

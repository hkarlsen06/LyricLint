import type {
	AtomicDocumentEdit,
	Diagnostic,
	DiagnosticFix,
	EditorCallbacks,
	EditorContext,
	EditorHandle,
	LanguagePack,
	LegendGroupAssignment,
	ParsedDocument,
	PerformerId,
	SourceReference,
	SerializedSelection,
	StyleSlot,
	TextRange,
	VoiceGroup
} from '$lib/core/types.js';

/** Diagnostics are accepted only when their source revision is explicit. */
export interface RevisionedDiagnostics {
	revision: number;
	items: readonly Diagnostic[];
}

/** One resolved voice group and the lyric range it decorates. */
export interface VoiceGroupRange extends TextRange {
	group: VoiceGroup;
	/** True for a performer name inside a section-header legend: it keeps an
	 * inline tint but never contributes to a lyric-line gutter segment. */
	legend?: boolean;
}

/**
 * Optional derived display data supplied by the shell.
 *
 * The committed foundation's `EditorContext` remains the stable minimum
 * contract. These additions are optional so the editor can integrate before
 * the rule, language, and performer workers are connected.
 */
export interface EditorDisplayContext extends EditorContext {
	parsed?: ParsedDocument;
	diagnostics?: RevisionedDiagnostics;
	voiceGroups?: readonly VoiceGroupRange[];
	languagePack?: LanguagePack;
	reducedMotion?: boolean;
	sources?: readonly SourceReference[];
}

export interface PerformerAssignmentChoice {
	range: TextRange;
	performerIds: PerformerId[];
}

export interface PerformerLegendAssignmentChoice {
	sectionFrom: number;
	assignments: LegendGroupAssignment[];
	/** Style slots whose wrappers the assignment removes from the section body. */
	unwrapSlots?: readonly StyleSlot[];
}

export interface SectionHeaderChoice {
	range: TextRange;
	headerName: string;
	ordinal?: number;
	numberedHeaderTerms?: readonly string[];
}

/**
 * Optional overlay hooks missing from the frozen foundation callbacks.
 *
 * Returning an edit lets the editor dispatch the domain-produced transform as
 * one transaction. Returning nothing leaves source text unchanged.
 */
export interface EditorOverlayCallbacks {
	createPerformerEdit?(
		choice: PerformerAssignmentChoice
	): AtomicDocumentEdit | undefined | Promise<AtomicDocumentEdit | undefined>;
	createPerformerLegendEdit?(
		choice: PerformerLegendAssignmentChoice
	): AtomicDocumentEdit | undefined | Promise<AtomicDocumentEdit | undefined>;
	createSectionHeaderEdit?(
		choice: SectionHeaderChoice
	): AtomicDocumentEdit | undefined | Promise<AtomicDocumentEdit | undefined>;
	onApplyDiagnosticFix?(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	onIgnoreDiagnostic?(diagnostic: Diagnostic): void;
	/** Select a language offered directly by a language diagnostic. */
	onSetLanguage?(language: string): void;
	/** Add a performer to the draft roster from the floating assignment card. */
	onAddPerformer?(displayName: string): void;
	/**
	 * A performer's name was edited in one section header and mirrored into the
	 * others. The shell follows this in the roster; the document edit itself is
	 * already applied and owns undo.
	 */
	onPerformerRenamed?(rename: {
		performerId: PerformerId;
		previousName: string;
		displayName: string;
	}): void;
	onDiagnosticActivateIntent?(diagnostic: Diagnostic, intent: 'navigate' | 'fix'): void;
	/**
	 * The pointer is resting on a diagnostic's underline.
	 *
	 * Deliberately not `onDiagnosticActivate`: pointing is not navigation. The
	 * shell may mark the matching card, but nothing here may move the caret or
	 * scroll the document — the line has to stay exactly where the pointer
	 * found it. Only choosing a diagnostic outright travels to it.
	 */
	onDiagnosticHighlight?(diagnostic: Diagnostic): void;
	onDiagnosticDismiss?(): boolean;
}

export type LyricEditorCallbacks = EditorCallbacks & EditorOverlayCallbacks;

export interface EditorPaneProps {
	initialText: string;
	initialSelection?: SerializedSelection;
	/** Revision of the snapshot used to mount or remount this editor instance. */
	initialRevision?: number;
	context: EditorDisplayContext;
	callbacks: LyricEditorCallbacks;
	handle?: EditorHandle;
	onready?: (handle: EditorHandle) => void;
	ondestroyed?: () => void;
}

export interface EditorPaneEvents {
	ready: EditorHandle;
	destroyed: undefined;
}

export interface ScreenRect {
	left: number;
	top: number;
	right: number;
	bottom: number;
	width: number;
	height: number;
}

export interface SelectionAnchor {
	range: TextRange;
	rect: ScreenRect;
	prefer: 'above' | 'below';
	/** True only for a CodeMirror selection transaction annotated as user selection. */
	userDriven: boolean;
}

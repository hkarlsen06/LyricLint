import type {
	AtomicDocumentEdit,
	Diagnostic,
	DiagnosticFix,
	EditorCallbacks,
	EditorContext,
	EditorHandle,
	LanguagePack,
	ParsedDocument,
	PerformerId,
	SourceReference,
	SerializedSelection,
	TextRange,
	VoiceGroup
} from '../core/types.js';

/** Diagnostics are accepted only when their source revision is explicit. */
export interface RevisionedDiagnostics {
	revision: number;
	items: readonly Diagnostic[];
}

/** One resolved voice group and the lyric range it decorates. */
export interface VoiceGroupRange extends TextRange {
	group: VoiceGroup;
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

export interface SectionHeaderChoice {
	range: TextRange;
	headerName: string;
	ordinal?: number;
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
	createSectionHeaderEdit?(
		choice: SectionHeaderChoice
	): AtomicDocumentEdit | undefined | Promise<AtomicDocumentEdit | undefined>;
	onApplyDiagnosticFix?(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	onIgnoreDiagnostic?(diagnostic: Diagnostic): void;
	onDiagnosticActivateIntent?(diagnostic: Diagnostic, intent: 'navigate' | 'fix'): void;
	onDiagnosticDismiss?(): boolean;
}

export type LyricEditorCallbacks = EditorCallbacks & EditorOverlayCallbacks;

export interface EditorPaneProps {
	initialText: string;
	initialSelection?: SerializedSelection;
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

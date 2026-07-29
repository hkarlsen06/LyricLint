import type {
	AtomicDocumentEdit,
	Diagnostic,
	DiagnosticFix,
	EditorAnchorRequest,
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
	/** Who sings the section's unstyled lyrics, when the picker asked for them. */
	sectionPerformerIds?: readonly PerformerId[];
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
	/**
	 * How many findings one fix would settle across the document, counting the
	 * one it came from.
	 *
	 * The editor does not answer this itself. The batch has to be exactly the
	 * one the linter panel would apply — same diagnostics, same arbitration —
	 * and only the shell knows which diagnostics are visible, so a popover that
	 * counted its own would offer a different number for the same fix.
	 */
	countDiagnosticFixBatch?(diagnostic: Diagnostic, fix: DiagnosticFix): number;
	onApplyDiagnosticFixBatch?(diagnostic: Diagnostic, fix: DiagnosticFix): void;
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
	 * An audio file was dropped on the document.
	 *
	 * The editor recognizes the drag and nothing more: it does not know what a
	 * draft's audio is, whether one is already attached, or where the bytes are
	 * kept. Returning false — or leaving the hook off — means the drop was not
	 * taken, and CodeMirror's own drop handling runs as if nothing here existed.
	 * That fallback is the whole safety net for the drops that were already
	 * working, so nothing on this path may claim an event it did not handle.
	 */
	onAudioFileDropped?(file: File): boolean;
	/**
	 * Where the audio is now, for the line about to be anchored.
	 *
	 * Read from a deliberate stamp — `Ctrl-Alt-M`, the timestamp column's control,
	 * or a tap in sync mode — so it must never throw. `undefined` means nothing is
	 * attached, and no anchor is recorded.
	 */
	onRequestMediaTime?(): number | undefined;
	/**
	 * Play from a line's anchored moment.
	 *
	 * Called from a press on a timestamp and from the jump command, and from
	 * nothing else. Moving the caret past an anchored line must never reach this:
	 * an editor whose audio jumps because the arrow key moved is an editor nobody
	 * can type in.
	 */
	onSeekMedia?(time: number): void;
	/**
	 * A line anchor was written, corrected, or cleared without the text changing.
	 *
	 * A sync tap writes an anchor and moves the caret, and `Ctrl-Alt-M` and the
	 * timestamp column's own control move nothing, so `onSnapshot` never hears
	 * about any of them. A shell that saved only on a document change would lose
	 * every anchor that was not a side effect of typing — which is all of them.
	 */
	onLineAnchorsChanged?(): void;
	/**
	 * Sync mode turned on or off.
	 *
	 * The editor owns the mode, so this reports rather than asks — and it fires
	 * for every cause, including the ones the shell did not start: `Escape`, and
	 * running out of lines to time. The shell answers it by starting or stopping
	 * playback, so those two never disagree about whether a run is under way.
	 *
	 * `startAt` is where the audio has to be for the run to line up with the
	 * caret: 0 for a fresh pass, and the resumed line's own time when a half-timed
	 * song picks up where it was left. The editor decides it, because the anchors
	 * are the editor's.
	 */
	onLyricSyncChange?(active: boolean, startAt?: number): void;
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
	/**
	 * A repeated section's header was aimed at, by selecting it whole or by
	 * pressing the link shortcut on it.
	 *
	 * Handled inside the pane and deliberately not forwarded to the shell: the
	 * whole of linking — which sections, which words win, and keeping them in
	 * step afterwards — lives in the editor, because it is one document edit
	 * repeated, not a domain transform the shell has to arbitrate.
	 */
	onSectionLinkRequest?(request: EditorAnchorRequest): void;
	/**
	 * A link was made, changed, or dropped without the text necessarily changing.
	 *
	 * Unlinking moves nothing, so `onSnapshot` never hears about it, and a shell
	 * that saved only on a document change would keep writing a link the user
	 * had just taken off. The same trap `onLineAnchorsChanged` exists for.
	 */
	onSectionLinksChanged?(): void;
	/**
	 * `[?]` was asked for at the caret — by the action bar, or by its shortcut.
	 *
	 * The shell owns the edit rather than the editor writing three characters
	 * itself: the insertion is an `AtomicDocumentEdit` against the session's own
	 * revision, which is the bookkeeping every fix already goes through. An
	 * editor that dispatched it directly would hand the user an edit the session
	 * never saw.
	 *
	 * `false` when no shell is listening, so the key falls through instead of
	 * being swallowed — which is why its binding carries no `preventDefault`.
	 */
	onUnknownMarkerRequest?(): boolean;
	/**
	 * Find and replace opened or closed.
	 *
	 * The shell needs telling rather than asking, because three things open this
	 * panel and only one of them is the shell's own control: `Mod-F` is bound to
	 * the window, and `Escape` and the panel's own `✕` close it. A tray glyph that
	 * only knew about its own presses would go on burning accent over a closed
	 * panel the first time either of the other two was used.
	 */
	onSearchOpenChange?(open: boolean): void;
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
	/** See `CreateLyricEditorOptions.sectionGhosts`. Defaults to on. */
	sectionGhosts?: boolean;
	/** See `CreateLyricEditorOptions.autoHeight`. Defaults to off. */
	autoHeight?: boolean;
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
	/**
	 * Whether this selection is one the performer picker may open itself over,
	 * which takes both a gesture that asked for nothing else (`select.pointer`)
	 * and a range the assignment could actually be written to
	 * (`canAssignVoiceGroup`). One flag rather than two, because the overlay layer
	 * has one decision to make and no use for which half said no.
	 *
	 * The geometry beside it is reported for every settled selection either way:
	 * it is the anchor cache every overlay positions against, including the ones
	 * that were never opened from a selection.
	 */
	offersAssignment: boolean;
	/**
	 * The repeated-section header this selection names whole, when it names one,
	 * and the offer the link picker opens itself on.
	 *
	 * A second field rather than a second reading of `offersAssignment`: these are
	 * two surfaces, not two halves of one decision, and they are mutually
	 * exclusive by construction — a header is never a range an assignment could be
	 * written to. It carries the header's own range rather than a bare flag,
	 * because the picker is keyed to the header while the anchor is keyed to the
	 * selection, and re-deriving one from the other in the overlay layer is how the
	 * two would come to disagree.
	 *
	 * Short-circuited on the same gesture as `offersAssignment`, for the same
	 * reason.
	 */
	linkHeader?: TextRange;
}

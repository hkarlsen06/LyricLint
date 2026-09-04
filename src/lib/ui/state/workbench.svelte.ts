import type {
	AutosaveController,
	AutosaveStatus,
	CompareBaselineRecord,
	Diagnostic,
	DiagnosticFix,
	DraftRecord,
	DraftRepository,
	DraftSummary,
	EditorHandle,
	EditorSnapshot,
	LineAnchor,
	PerformerRecord,
	RuleSetManifest,
	SectionLink,
	DraftIgnoreStore,
	Severity,
	SourceReference
} from '$lib/core/types.js';
import { SvelteDate, SvelteMap } from 'svelte/reactivity';
import { resolveLanguageTag } from '$lib/languages/registry.js';
import { randomId } from '$lib/core/random-id.js';
import type { TimedLyricsFormat } from '$lib/core/timed-lyrics.js';
import { formatTimedLyrics, timedLyricsExtensions } from '$lib/core/timed-lyrics.js';
import { copyCanonicalMarkup, downloadUtf8Text, readClipboardText } from '../clipboard.js';
import { sampleDraftLanguage, sampleDraftText } from '../sample-draft.js';
import { createDraftStore, safeFilename } from './draft-store.svelte.js';
import { createEditorSession } from './editor-session.svelte.js';
import type { FeedbackState, ToastMessage } from './feedback.svelte.js';
import { createFeedbackState } from './feedback.svelte.js';
import type { BulkFixPlan } from '$lib/rules/bulk-fix.js';
import type { RightPanelTab } from './panel-view.svelte.js';
import { createPanelView } from './panel-view.svelte.js';
import type { RosterMergeSuggestion } from './roster-store.svelte.js';
import { createRosterStore } from './roster-store.svelte.js';
import type { MediaRepository } from '$lib/persistence/media-repository.js';
import type { MediaPlayer } from './media-player.svelte.js';
import type { MediaStore } from './media-store.svelte.js';
import { createMediaStore } from './media-store.svelte.js';
import { WorkspaceBackupError, type WorkspaceBackupController } from '$lib/persistence/backup.js';
import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';
import { headerNameAtoms, isMirrorableHeaderName } from '$lib/performers/index.js';
import { buildRuleContext } from './wiring.js';
import {
	maxScribeBytes,
	parseScribe,
	serializeScribe,
	ScribeFormatError
} from '$lib/scribe/format.js';

/**
 * The whole of what a `.lls` file carries, read off the serializer rather than
 * restated here — a field added there is then a compile error in this one place
 * rather than a project quietly exported without it.
 */
type ScribeProjectInput = Parameters<typeof serializeScribe>[0];

export { performerColorIds } from './roster-store.svelte.js';
export type { RosterMergeSuggestion } from './roster-store.svelte.js';
export type { RightPanelTab } from './panel-view.svelte.js';

interface WorkbenchDependencies {
	editor: EditorHandle;
	initialSnapshot: EditorSnapshot;
	initialDraft: DraftRecord;
	initialRecentLanguages?: readonly string[];
	repository: DraftRepository;
	/** Omitted in tests and on the contract harness: the workbench runs without audio. */
	mediaRepository?: MediaRepository;
	/**
	 * The transport the media store should drive, when it must not be the real
	 * one. Only a test supplies this: the default player builds an `<audio>`
	 * element and knows how to fetch Google's IFrame API, and a test asserting
	 * that nothing has contacted Google needs a stub in that position.
	 */
	mediaPlayer?: MediaPlayer;
	/** Omitted by contract tests that do not open IndexedDB. */
	backup?: WorkspaceBackupController;
	autosave: AutosaveController;
	ignoreStore: DraftIgnoreStore;
	feedback?: FeedbackState;
	sources?: readonly SourceReference[];
	ruleSet?: RuleSetManifest;
	copy?: (text: string) => Promise<void>;
	readClipboard?: () => Promise<string>;
	exportText?: (text: string, filename: string, mimeType?: string) => void;
	idFactory?: () => string;
	now?: () => string;
	onOpenDraft?: (draft: DraftRecord) => EditorSnapshot | void;
	initialActiveTab?: RightPanelTab;
	onActiveTabChange?: (tab: RightPanelTab) => void;
	onBackupRestored?: () => void;
}

export interface WorkbenchController {
	readonly editor: EditorHandle;
	readonly snapshot: EditorSnapshot;
	/**
	 * Whether the document holds nothing worth acting on yet. Several surfaces
	 * change shape on this — the toolbar's one contrast action, the linter's
	 * empty state, the status bar's counts — so they read it from here rather
	 * than each deciding what "empty" means.
	 */
	readonly isEmpty: boolean;
	/**
	 * Whether the bundled sample is worth offering: there is nothing to lose and
	 * its language is the one selected, so loading it cannot open with a
	 * mismatch warning about lyrics the user never wrote.
	 */
	readonly canLoadSample: boolean;
	readonly draftId: string;
	readonly title: string;
	readonly language: string;
	readonly recentLanguages: readonly string[];
	readonly performers: readonly PerformerRecord[];
	readonly activeTab: RightPanelTab;
	readonly activeDiagnosticKey?: string;
	readonly severityFilter: readonly Severity[];
	readonly unignoredDiagnostics: readonly Diagnostic[];
	readonly visibleDiagnostics: readonly Diagnostic[];
	readonly bulkFixPlan: BulkFixPlan;
	readonly ignoredDiagnosticKeys: readonly string[];
	readonly ignoredDiagnosticCount: number;
	readonly saveStatus: AutosaveStatus;
	/** The Compare dialog's stored baseline for the current draft, if any. */
	readonly compareBaseline: CompareBaselineRecord | undefined;
	setCompareBaseline(text: string): void;
	readonly drafts: readonly DraftSummary[];
	readonly feedback: FeedbackState;
	readonly toasts: readonly ToastMessage[];
	readonly sources: ReadonlyMap<string, SourceReference>;
	readonly ruleSet?: RuleSetManifest;
	readonly rosterSuggestions: readonly RosterMergeSuggestion[];
	/**
	 * The audio this draft is transcribed from, or undefined in a build with no
	 * media repository behind it. Surfaces read `media?.player.attached` rather
	 * than deciding for themselves whether audio exists.
	 */
	readonly media?: MediaStore;
	readonly backup?: WorkspaceBackupController;
	/**
	 * Publish the editor handle bound by the workspace. Svelte clears a bound
	 * component prop during keyed teardown, so the hand-off can briefly carry
	 * `undefined` before the replacement editor publishes its handle.
	 */
	setEditorHandle(handle: EditorHandle | undefined): void;
	setSaveStatus(status: AutosaveStatus): void;
	/** Store the latest editor snapshot and its currently visible diagnostics. */
	onSnapshot(snapshot: EditorSnapshot): void;
	/**
	 * A line anchor was written, corrected, or cleared.
	 *
	 * Anchors are saved with the draft, but no way of setting one changes any text
	 * — a sync tap writes an anchor and moves the caret, and `Ctrl-Alt-M` and
	 * the timestamp column's own control move nothing. `onSnapshot` therefore
	 * never hears about them, and for a while a whole synced song was lost on
	 * reload because the only anchors that survived were the ones the automatic
	 * stamp happened to write alongside a keystroke.
	 */
	onLineAnchorsChanged(): void;
	/**
	 * A section link was made, changed, or dropped.
	 *
	 * Here for the same reason the anchors are: unlinking moves no text, so
	 * `onSnapshot` never hears about it, and a save that only followed the words
	 * would keep writing a link the user had just taken off.
	 */
	onSectionLinksChanged(): void;
	/** Current groups, addressed by their persisted 1-based header lines. */
	readonly sectionLinks: readonly SectionLink[];
	/**
	 * How many lines in this draft are timed. Read by the two surfaces that act on
	 * them — the delete and the timed-lyrics export — so each draws only where
	 * there is something to act on.
	 */
	readonly lineAnchorCount: number;
	/** Drop every line timing on this draft. The words are untouched. */
	clearLineAnchors(): void;
	/** Save this draft's line timings as a timed-lyrics file a player can read. */
	exportTimedLyrics(format: TimedLyricsFormat): void;
	setActiveTab(tab: RightPanelTab): void;
	/**
	 * Whether Harper, the English grammar proofreader, runs alongside the reviewed
	 * rules. A preference rather than a per-finding ignore because it is a stance
	 * on a whole provider — Harper cites itself and knows nothing about lyrics — so
	 * turning it off is one decision, not fifty. Default on; persisted through the
	 * repository like every other preference, so it survives a reload and is
	 * covered by the workspace backup and by `Delete all local data`.
	 */
	readonly grammarCheckEnabled: boolean;
	setGrammarCheckEnabled(enabled: boolean): void;
	toggleSeverity(severity: Severity): void;
	setTitle(title: string): Promise<void>;
	setLanguage(language: string): void;
	undo(): void;
	redo(): void;
	navigateToDiagnostic(diagnostic: Diagnostic): void;
	/** Mark a diagnostic's card without moving the editor to it. */
	highlightDiagnostic(diagnostic: Diagnostic): void;
	chooseSectionHeader(diagnostic: Diagnostic): void;
	canAssignDiagnosticPerformers(diagnostic: Diagnostic): boolean;
	assignDiagnosticPerformers(diagnostic: Diagnostic): void;
	linkDiagnosticSections(diagnostic: Diagnostic): void;
	previewFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	clearFixPreview(): void;
	applyFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	fixBatchSize(diagnostic: Diagnostic, fix: DiagnosticFix): number;
	applyFixBatch(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	applyBulkFix(): void;
	ignoreDiagnostic(diagnostic: Diagnostic): void;
	/** Store an acceptance already answered elsewhere; see `PanelView`'s own doc. */
	recordAcceptedOccurrence(key: string): void;
	restoreDiagnostic(diagnosticKey: string): void;
	copyCanonical(): Promise<boolean>;
	pasteLyrics(): Promise<void>;
	insertUnknownMarker(): void;
	/** Replace an empty document with the bundled sample transcription. */
	loadSample(): void;
	insertSection(): void;
	readonly searchOpen: boolean;
	toggleSearch(): void;
	noteSearchOpen(open: boolean): void;
	addPerformer(displayName: string): void;
	renamePerformer(id: string, displayName: string): void;
	adoptHeaderRename(id: string, previousName: string, displayName: string): void;
	mergePerformers(sourceId: string, targetId: string): void;
	removePerformer(id: string): void;
	refreshDrafts(): Promise<void>;
	createDraft(): Promise<void>;
	openDraft(id: string): Promise<void>;
	renameDraft(id: string, title: string): Promise<void>;
	duplicateDraft(id: string): Promise<void>;
	exportDraft(id?: string): Promise<void>;
	/** Save the current editable project, including its LyricLint-only state. */
	exportScribe(id?: string): Promise<void>;
	/** Validate and import a Scribe as a new local draft, without overwriting this one. */
	importScribe(file: File): Promise<boolean>;
	deleteDraft(id: string): Promise<void>;
	deleteAllDrafts(): Promise<void>;
	backupWorkspace(): Promise<void>;
	allowBackupAccess(): Promise<void>;
	restoreWorkspaceBackup(file: File): Promise<boolean>;
	flushAutosave(): Promise<void>;
}

const largePasteThreshold = 32;

/** The preference keys this controller owns. */
const grammarCheckPreference = 'grammarCheck';

/**
 * Compose the workbench from its four stores — editor session, draft, roster,
 * and right-panel view — and expose them behind one flat controller. Anything
 * that has to cross store boundaries (opening a draft, adopting a snapshot)
 * is orchestrated here; everything else delegates.
 */
export function createWorkbenchController(deps: WorkbenchDependencies): WorkbenchController {
	const feedback = deps.feedback ?? createFeedbackState();
	const sources = new SvelteMap((deps.sources ?? []).map((source) => [source.id, source]));
	const copy = deps.copy ?? copyCanonicalMarkup;
	const readClipboard = deps.readClipboard ?? readClipboardText;
	const exportText = deps.exportText ?? downloadUtf8Text;
	const now = deps.now ?? (() => new SvelteDate().toISOString());
	const idFactory = deps.idFactory ?? randomId;

	const editorSession = createEditorSession({
		editor: deps.editor,
		initialSnapshot: deps.initialSnapshot,
		feedback,
		copy,
		readClipboard,
		// `panel` is declared below and only read when a replacement actually
		// dispatches, which is long after this module has finished evaluating.
		onBeforeReplace: () => panel.leadOnNextSnapshot()
	});

	// The anchors this draft is known to have — not a one-shot hand-off. Every
	// editor remount (a draft switch, but also HMR) starts blank, and a blank
	// editor's `getLineAnchors()` is `[]`, which the next save writes straight over
	// the draft. So this is kept and re-seated onto any capable editor that has
	// none, and refreshed whenever the editor reports a change.
	// State rather than a plain binding, because the tools panel draws its
	// delete control only while there is something to delete.
	let knownLineAnchors = $state<readonly LineAnchor[]>(deps.initialDraft.lineAnchors ?? []);
	// The same hand-off, for the same reason: a freshly mounted editor holds no
	// links, and a save landing in that window would write the blank over the
	// draft's own.
	let knownSectionLinks: readonly SectionLink[] = deps.initialDraft.sectionLinks ?? [];

	const draft = createDraftStore({
		initialDraft: deps.initialDraft,
		initialRecentLanguages: deps.initialRecentLanguages,
		repository: deps.repository,
		autosave: deps.autosave,
		feedback,
		ruleSet: deps.ruleSet,
		exportText,
		idFactory,
		now,
		// Read on every save, not just the one attaching triggers: the document is
		// still wordless on the next snapshot, and without this the record the
		// attachment created would be swept a keystroke later.
		hasAttachment: () => media?.player.attached === true || media?.pendingName !== undefined,
		// A deleted or discarded draft's rows leave the table directly, so the
		// in-session ignore mirror has to be told or it answers for a draft that
		// no longer has a record — and loses the ignores on reload.
		ignoreStore: deps.ignoreStore,
		bindings: {
			get snapshot() {
				return editorSession.snapshot;
			},
			get performers() {
				return roster.performers;
			},
			get lineAnchors() {
				// Falling back to the known set rather than to nothing. The page boots
				// with a headless handle that cannot answer this, and any save that
				// landed in that window — a rename is enough — would write an empty
				// list over the draft's own timings.
				return editorSession.editor.getLineAnchors?.() ?? knownLineAnchors;
			},
			get sectionLinks() {
				return editorSession.editor.getSectionLinks?.() ?? knownSectionLinks;
			},
			onDraftLoaded(nextDraft) {
				roster.reset(nextDraft.performers);
				panel.refreshIgnoredDiagnostics();
				// The song is the draft, so the audio travels with it: switching
				// drafts stops whatever was playing and offers the new draft's own
				// track. Deleting drafts arrives here too, by way of the empty draft
				// that replaces them, which is what clears the strip.
				void media?.openFor(nextDraft.id);
				// Held rather than applied. Opening a draft remounts the keyed editor,
				// so the handle reading this line is the outgoing one and anything
				// dispatched into it dies with it. `setEditorHandle` applies them when
				// the replacement publishes itself, which is the same hand-off the fix
				// preview already waits for.
				knownLineAnchors = nextDraft.lineAnchors ?? [];
				knownSectionLinks = nextDraft.sectionLinks ?? [];
				editorSession.resetRevisionGuard();
				const openedSnapshot = deps.onOpenDraft?.(nextDraft);
				if (openedSnapshot) {
					editorSession.replaceSnapshot(openedSnapshot);
					roster.importFromSnapshot(openedSnapshot);
				}
			}
		}
	});

	const roster = createRosterStore({
		initialPerformers: deps.initialDraft.performers,
		feedback,
		idFactory,
		scheduleSave: draft.scheduleSave
	});

	// Grammar checking is on by default: the feedback that prompted the toggle
	// called the corrections nice and only wanted a way out. The stored value
	// arrives a tick later and flips the flag if the user turned it off; Workspace
	// watches the flag and re-lints, so a stored `false` drops Harper's findings
	// without a keystroke.
	let grammarCheckEnabled = $state(true);
	void deps.repository
		.getPreference(grammarCheckPreference)
		.then((stored) => {
			if (stored !== undefined) grammarCheckEnabled = stored === 'true';
		})
		.catch(() => {
			// A preference that cannot be read is a preference at its default.
		});

	/**
	 * Let the song name the draft, but only while nothing else has.
	 *
	 * Attaching audio to a fresh draft says what the transcription is *of*, and
	 * that is nearly always what it should be called — so a draft still carrying
	 * the placeholder takes the source's own name. `Untitled transcription` is the whole
	 * of the condition: a title the user typed, or one an earlier source already
	 * supplied, is a decision, and a later attachment must not overwrite it.
	 *
	 * The store has already decided what counts as a name worth having — a pasted
	 * link's own URL is not one, and neither is a long filename — so there is
	 * nothing to second-guess here.
	 */
	async function nameDraftAfterSource(title: string): Promise<void> {
		if (draft.title !== DEFAULT_DRAFT_TITLE) return;
		await draft.setTitle(title);
	}

	function buildMediaStore(repository: MediaRepository): MediaStore {
		const storeDeps: Parameters<typeof createMediaStore>[0] = {
			repository,
			feedback,
			draftId: () => draft.draftId,
			// Attaching audio is what makes a wordless draft worth keeping, and
			// the draft store reads the answer back through `hasAttachment` on
			// every later save. Both directions are lazy closures because the two
			// stores need each other and only one of them can be built first.
			onAttached: () => draft.keepDraft(),
			onTitleSuggestion: (title) => void nameDraftAfterSource(title)
		};
		// Absent rather than undefined: the store builds its own player where no
		// key is supplied, and a present `undefined` would be a null transport.
		if (deps.mediaPlayer) storeDeps.player = deps.mediaPlayer;
		return createMediaStore(storeDeps);
	}

	const media = deps.mediaRepository ? buildMediaStore(deps.mediaRepository) : undefined;

	const panel = createPanelView({
		editor: () => editorSession.editor,
		snapshot: () => editorSession.snapshot,
		ruleContext: () =>
			buildRuleContext(
				draft.language,
				roster.performers,
				deps.ruleSet?.version ?? 'unavailable',
				editorSession.snapshot.revision
			),
		draftId: () => draft.draftId,
		ignoreStore: deps.ignoreStore,
		feedback,
		initialActiveTab: deps.initialActiveTab,
		onActiveTabChange: deps.onActiveTabChange,
		onIgnoredDiagnosticsChange: deps.backup?.schedule
	});

	/**
	 * Rename a performer from the roster, carrying the new spelling into every
	 * section header that names them.
	 *
	 * The mirror already runs the other way — editing a name inside one header
	 * rewrites the others and the roster adopts it — so a roster rename that
	 * stopped at the record left the workbench contradicting itself: the toast
	 * said renamed, the legend went on reading the old name, and the new name
	 * appeared nowhere in the document. Keeping the headers in step is the one
	 * job a roster rename exists for.
	 *
	 * The rewrite is one atomic edit over every header occurrence, so it is one
	 * editor undo, exactly as a mirrored header edit is. The roster half goes
	 * through `adoptHeaderRename` rather than the plain rename, so the old
	 * spelling survives as an alias and an editor undo of the rewrite still
	 * resolves the headers to this performer instead of importing a duplicate.
	 * The roster is adopted *before* the dispatch, because the re-lint arrives
	 * from inside it: a large enough rename crosses the import threshold, and an
	 * extraction run against the old roster would read the freshly written name
	 * as a stranger.
	 *
	 * The toast's Undo is the same rename run in reverse. It recomputes against
	 * the document as it stands, so pressed after further edits it reverses the
	 * rename and nothing else.
	 */
	function renamePerformer(id: string, displayName: string): void {
		const trimmed = displayName.trim();
		const current = roster.performers.find((performer) => performer.id === id);
		if (!current || !trimmed || current.displayName === trimmed) return;
		const previousName = current.displayName;
		const snapshot = editorSession.snapshot;
		const occurrences = headerNameAtoms(snapshot.parsed, roster.performers).filter(
			(atom) => atom.performerId === id && atom.text !== trimmed
		);
		if (occurrences.length === 0) {
			// Named in no header: the record is the whole of the rename.
			roster.renamePerformer(id, trimmed);
			return;
		}
		if (!isMirrorableHeaderName(trimmed)) {
			// A name that would change how a header parses is kept out of the
			// document, exactly as the header-side mirror refuses to spread one.
			// The alias is what keeps the untouched headers resolving.
			roster.adoptHeaderRename(id, previousName, trimmed);
			roster.recolorPerformer(id);
			const message = `Renamed ${previousName} to ${trimmed}. The headers keep ${previousName}, because the new name cannot be written inside one.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => renamePerformer(id, previousName)
			});
			return;
		}
		roster.adoptHeaderRename(id, previousName, trimmed);
		roster.recolorPerformer(id);
		editorSession.editor.dispatchAtomic({
			baseRevision: snapshot.revision,
			edits: occurrences.map(({ from, to }) => ({ from, to, insert: trimmed }))
		});
		const headers = occurrences.length === 1 ? 'header' : 'headers';
		const message = `Renamed ${previousName} to ${trimmed} in ${occurrences.length} ${headers}.`;
		feedback.announce(message);
		feedback.addToast({
			message,
			actionLabel: 'Undo',
			action: () => renamePerformer(id, previousName)
		});
	}

	const controller: WorkbenchController = {
		get editor() {
			return editorSession.editor;
		},
		get snapshot() {
			return editorSession.snapshot;
		},
		get isEmpty() {
			return editorSession.snapshot.text.trim().length === 0;
		},
		get canLoadSample() {
			return (
				editorSession.snapshot.text.trim().length === 0 &&
				resolveLanguageTag(draft.language) === sampleDraftLanguage
			);
		},
		get draftId() {
			return draft.draftId;
		},
		get title() {
			return draft.title;
		},
		get language() {
			return draft.language;
		},
		get recentLanguages() {
			return draft.recentLanguages;
		},
		get performers() {
			return roster.performers;
		},
		get activeTab() {
			return panel.activeTab;
		},
		get activeDiagnosticKey() {
			return panel.activeDiagnosticKey;
		},
		get severityFilter() {
			return panel.severityFilter;
		},
		get unignoredDiagnostics() {
			return panel.unignoredDiagnostics;
		},
		get visibleDiagnostics() {
			return panel.visibleDiagnostics;
		},
		get bulkFixPlan() {
			return panel.bulkFixPlan;
		},
		get ignoredDiagnosticKeys() {
			return panel.ignoredDiagnosticKeys;
		},
		get ignoredDiagnosticCount() {
			return panel.ignoredDiagnosticKeys.length;
		},
		get saveStatus() {
			return draft.saveStatus;
		},
		get compareBaseline() {
			return draft.compareBaseline;
		},
		setCompareBaseline: (text: string) => draft.setCompareBaseline(text),
		get drafts() {
			return draft.drafts;
		},
		get feedback() {
			return feedback;
		},
		get toasts() {
			return feedback.toasts;
		},
		get sources() {
			return sources;
		},
		get ruleSet() {
			return deps.ruleSet;
		},
		get rosterSuggestions() {
			return roster.suggestions;
		},
		get media() {
			return media;
		},
		get backup() {
			return deps.backup;
		},
		setEditorHandle(handle) {
			// Keep the last usable handle through the keyed editor's teardown.
			// Reactive diagnostic cleanup can still run during that hand-off, and
			// replacing the handle with `undefined` would make even an optional
			// editor capability such as `previewAtomic` unsafe to inspect.
			if (!handle) return;
			editorSession.setEditorHandle(handle);
			// Re-seat the draft's anchors on any editor that can hold them and has
			// none. The capability is *checked* rather than optional-called: the
			// first handle this ever sees is the page's headless placeholder, which
			// implements no anchors, so `handle.setLineAnchors?.(…)` dropped a whole
			// song's timings into a no-op. And it runs on every handle, not just the
			// first, because a remount (HMR, a keyed rebuild) otherwise leaves the
			// editor blank and the next save writes that blank over the draft.
			if (
				knownLineAnchors.length > 0 &&
				handle.setLineAnchors &&
				handle.getLineAnchors?.().length === 0
			) {
				handle.setLineAnchors(knownLineAnchors);
			}
			if (
				knownSectionLinks.length > 0 &&
				handle.setSectionLinks &&
				handle.getSectionLinks?.().length === 0
			) {
				handle.setSectionLinks(knownSectionLinks);
			}
			// The card that starts expanded asks for its preview before the real
			// editor exists to draw it. Now that one does, show it.
			panel.retryFixPreview();
		},
		setSaveStatus: draft.setSaveStatus,
		onSnapshot(nextSnapshot) {
			const change = editorSession.adoptSnapshot(nextSnapshot);
			if (!change) return;
			panel.pruneActiveDiagnostic(nextSnapshot.diagnostics);
			// A fix's own re-lint arrives here. Drop its active card before the
			// panel leads with the next one.
			panel.leadAfterFix(nextSnapshot.diagnostics);
			if (change.unchanged) return;
			if (change.textDelta >= largePasteThreshold) roster.importFromSnapshot(nextSnapshot);
			draft.scheduleSave();
		},
		onLineAnchorsChanged() {
			knownLineAnchors = editorSession.editor.getLineAnchors?.() ?? knownLineAnchors;
			draft.scheduleSave();
		},
		onSectionLinksChanged() {
			knownSectionLinks = editorSession.editor.getSectionLinks?.() ?? knownSectionLinks;
			draft.scheduleSave();
		},
		get lineAnchorCount() {
			return knownLineAnchors.length;
		},
		get sectionLinks() {
			return editorSession.editor.getSectionLinks?.() ?? knownSectionLinks;
		},
		clearLineAnchors() {
			// Both halves, in this order: the editor's own field is what the next
			// save reads, and `knownLineAnchors` is what it falls back to while no
			// capable editor is mounted. Setting one and not the other puts the
			// timings back on the following save.
			knownLineAnchors = [];
			editorSession.editor.setLineAnchors?.([]);
			draft.scheduleSave();
			feedback.announce('Line timings deleted.');
		},
		exportTimedLyrics(format) {
			// The editor's own field first, for the reason `bindings.lineAnchors`
			// gives: the known set is the fallback, not the truth.
			const anchors = editorSession.editor.getLineAnchors?.() ?? knownLineAnchors;
			const content = formatTimedLyrics(editorSession.snapshot.text, anchors, format);
			if (content.length === 0) {
				feedback.announce('There are no line timings to export.');
				return;
			}
			exportText(content, safeFilename(draft.title, timedLyricsExtensions[format]));
			feedback.announce(`Exported ${draft.title} as ${format.toUpperCase()}.`);
		},
		setActiveTab: panel.setActiveTab,
		get grammarCheckEnabled() {
			return grammarCheckEnabled;
		},
		setGrammarCheckEnabled(enabled) {
			grammarCheckEnabled = enabled;
			void deps.repository.setPreference(grammarCheckPreference, String(enabled)).catch(() => {});
		},
		toggleSeverity: panel.toggleSeverity,
		setTitle: draft.setTitle,
		setLanguage: draft.setLanguage,
		undo: editorSession.undo,
		redo: editorSession.redo,
		navigateToDiagnostic: panel.navigateToDiagnostic,
		highlightDiagnostic: panel.highlightDiagnostic,
		chooseSectionHeader: panel.chooseSectionHeader,
		canAssignDiagnosticPerformers: panel.canAssignDiagnosticPerformers,
		assignDiagnosticPerformers: panel.assignDiagnosticPerformers,
		linkDiagnosticSections: panel.linkDiagnosticSections,
		previewFix: panel.previewFix,
		clearFixPreview: panel.clearFixPreview,
		applyFix: panel.applyFix,
		fixBatchSize: panel.fixBatchSize,
		applyFixBatch: panel.applyFixBatch,
		applyBulkFix: panel.applyBulkFix,
		ignoreDiagnostic: panel.ignoreDiagnostic,
		recordAcceptedOccurrence: panel.recordAcceptedOccurrence,
		restoreDiagnostic: panel.restoreDiagnostic,
		copyCanonical: editorSession.copyCanonical,
		pasteLyrics: editorSession.pasteLyrics,
		insertUnknownMarker: editorSession.insertUnknownMarker,
		loadSample() {
			editorSession.replaceDocument(
				sampleDraftText,
				"Sample transcription loaded. Undo replaces it with an empty 'scribe."
			);
		},
		insertSection: editorSession.insertSection,
		get searchOpen() {
			return editorSession.searchOpen;
		},
		toggleSearch: editorSession.toggleSearch,
		noteSearchOpen: editorSession.noteSearchOpen,
		addPerformer: roster.addPerformer,
		renamePerformer,
		adoptHeaderRename: roster.adoptHeaderRename,
		mergePerformers: roster.mergePerformers,
		removePerformer: roster.removePerformer,
		refreshDrafts: draft.refreshDrafts,
		createDraft: draft.createDraft,
		openDraft: draft.openDraft,
		renameDraft: draft.renameDraft,
		duplicateDraft: draft.duplicateDraft,
		exportDraft: draft.exportDraft,
		async exportScribe(id = draft.draftId) {
			let exported: DraftRecord | undefined;
			try {
				exported = id === draft.draftId ? draft.draftFromSnapshot() : await deps.repository.get(id);
			} catch {
				exported = undefined;
			}
			if (!exported) {
				const message = "That 'scribe could not be exported.";
				feedback.announce(message);
				feedback.addToast({ message });
				return;
			}

			let song = id === draft.draftId ? media?.clipboardSource() : undefined;
			if (!song && deps.mediaRepository) {
				try {
					const stored = await deps.mediaRepository.get(id);
					const source = stored?.source;
					const sourceId =
						source === 'youtube'
							? stored?.videoId
							: source === 'spotify'
								? stored?.trackId
								: source === 'apple'
									? stored?.songId
									: undefined;
					if (source && source !== 'file' && sourceId) {
						song = { kind: source, id: sourceId, name: stored.name };
					}
				} catch {
					// The project is still useful without an unavailable media reference.
				}
			}
			const project: ScribeProjectInput = {
				title: exported.title,
				language: exported.language,
				lyrics: exported.text,
				performers: exported.performers,
				sectionLinks: exported.sectionLinks ?? [],
				lineAnchors: exported.lineAnchors ?? [],
				ignoredDiagnostics: deps.ignoreStore.list(id)
			};
			// Each of these four is absent rather than present-and-undefined: the
			// Scribe file is JSON, and a key written as `null` is a claim the
			// record never made.
			if (exported.originalText !== undefined) project.originalText = exported.originalText;
			if (exported.editorSelection !== undefined) project.selection = exported.editorSelection;
			if (exported.compareBaseline !== undefined) {
				project.compareBaseline = exported.compareBaseline;
			}
			if (song !== undefined) project.song = song;

			exportText(
				serializeScribe(project),
				safeFilename(exported.title, 'lls'),
				'application/vnd.lyriclint.scribe+json;charset=utf-8'
			);
			feedback.announce(`Exported ${exported.title} as a LyricLint Scribe.`);
		},
		async importScribe(file) {
			if (!file.name.toLocaleLowerCase().endsWith('.lls')) {
				const message = 'Choose a LyricLint Scribe file ending in .lls.';
				feedback.announce(message);
				feedback.addToast({ message });
				return false;
			}
			// Refused on its size rather than after the browser has decoded it, the
			// way the workspace backup's own restore is: this is the one path where
			// a shared file becomes workspace state, and `file.text()` is what
			// spends the memory.
			if (file.size > maxScribeBytes) {
				const message = 'This Scribe file is too large to import.';
				feedback.announce(message);
				feedback.addToast({ message });
				return false;
			}

			let project;
			try {
				project = parseScribe(await file.text());
			} catch (error) {
				const message =
					error instanceof ScribeFormatError ? error.message : 'This Scribe could not be read.';
				feedback.announce(message);
				feedback.addToast({ message });
				return false;
			}

			const timestamp = now();
			const imported: DraftRecord = {
				id: idFactory(),
				title: project.document.title.trim() || DEFAULT_DRAFT_TITLE,
				text: project.document.lyrics,
				language: project.document.language,
				performers: project.performers,
				createdAt: timestamp,
				updatedAt: timestamp,
				ruleSetVersion: deps.ruleSet?.version ?? deps.initialDraft.ruleSetVersion
			};
			// Each of these stays absent where the file said nothing, and the two
			// lists stay absent where they are empty — a record is compared field by
			// field on its way to disk, and a key nobody set is not a value.
			const scribed = project.document;
			if (scribed.originalText !== undefined) imported.originalText = scribed.originalText;
			if (scribed.selection !== undefined) imported.editorSelection = scribed.selection;
			if (scribed.compareBaseline !== undefined) {
				imported.compareBaseline = scribed.compareBaseline;
			}
			if (project.lineAnchors.length > 0) imported.lineAnchors = project.lineAnchors;
			if (project.sectionLinks.length > 0) imported.sectionLinks = project.sectionLinks;

			try {
				await draft.flushAutosave();
				await deps.repository.create(imported);
				for (const key of project.ignoredDiagnostics) deps.ignoreStore.ignore(imported.id, key);
				if (project.song && deps.mediaRepository) {
					const source = project.song;
					const attachment: Parameters<MediaRepository['attach']>[0] = {
						draftId: imported.id,
						name: source.name ?? `${source.kind}:${source.id}`,
						source: source.kind
					};
					// One id field, named for the source's own alphabet — a record that
					// confused them would fail as a 404 a long way from here.
					if (source.kind === 'youtube') attachment.videoId = source.id;
					if (source.kind === 'spotify') attachment.trackId = source.id;
					if (source.kind === 'apple') attachment.songId = source.id;
					await deps.mediaRepository.attach(attachment);
				}
				await draft.openDraft(imported.id);
				feedback.announce(`Imported ${imported.title}.`);
				return true;
			} catch {
				const message = 'The Scribe could not be imported into local storage.';
				feedback.announce(message);
				feedback.addToast({ message });
				return false;
			}
		},
		deleteDraft: draft.deleteDraft,
		async deleteAllDrafts() {
			// The order is load-bearing: unlinking first stops the backup mirror
			// from writing the freshly emptied workspace over the one file that
			// could undo this press. The file itself stays on the user's disk.
			await deps.backup?.unlink();
			await draft.deleteAllDrafts();
			// A reset returns the running session to its defaults too — the stored
			// rows are already gone, and a switch still showing the old choice would
			// be reporting a preference that no longer exists.
			grammarCheckEnabled = true;
		},
		async backupWorkspace() {
			if (!deps.backup) return;
			try {
				if (deps.backup.state().supported) {
					const chosen = await deps.backup.chooseFile(() => draft.flushAutosave());
					if (chosen) {
						feedback.announce('Workspace backup connected and saved.');
					}
					return;
				}
				await draft.flushAutosave();
				exportText(await deps.backup.serialize(), 'LyricLint backup.json');
				feedback.announce('Workspace backup downloaded.');
			} catch {
				feedback.announce('The workspace backup could not be saved.');
			}
		},
		async allowBackupAccess() {
			if (!deps.backup) return;
			try {
				const granted = await deps.backup.requestPermission(() => draft.flushAutosave());
				feedback.announce(
					granted
						? 'Workspace backup access granted and the latest data was saved.'
						: 'Workspace backup access was not granted.'
				);
			} catch {
				feedback.announce('Workspace backup access could not be requested.');
			}
		},
		async restoreWorkspaceBackup(file) {
			if (!deps.backup) return false;
			try {
				await draft.flushAutosave();
				const count = await deps.backup.restore(file);
				feedback.announce(
					`${count} ${count === 1 ? "'scribe" : "'scribes"} imported. Reloading the workbench.`
				);
				deps.onBackupRestored?.();
				return true;
			} catch (error) {
				feedback.announce(
					error instanceof WorkspaceBackupError
						? error.message
						: 'The workspace backup could not be imported.'
				);
				return false;
			}
		},
		flushAutosave: draft.flushAutosave
	};

	roster.importFromSnapshot(deps.initialSnapshot);
	void controller.refreshDrafts().catch(() => {});
	// The draft the page boots with never travels through `onDraftLoaded` — that
	// hook fires on a *switch* — so without this a reload came back to a workbench
	// with no audio and no sign there had been any.
	//
	// The sign-in is picked up *after* it, and the order matters: a load returning
	// from Spotify is a load that has already restored this draft's remembered
	// track as pending, and re-attaching it is exactly what the resumed intent
	// does. The other way round, `openFor` would arrive second and detach what the
	// user had just signed in to hear.
	void media
		?.openFor(deps.initialDraft.id)
		.then(() => media?.resumeSignIn())
		.catch((error) => console.error('Could not restore draft media.', error));
	return controller;
}

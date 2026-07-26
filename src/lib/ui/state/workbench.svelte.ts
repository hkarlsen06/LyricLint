import type {
	AutosaveController,
	AutosaveStatus,
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
	SessionIgnoreStore,
	Severity,
	SourceReference,
	VoiceGroup
} from '$lib/core/types.js';
import { SvelteDate, SvelteMap } from 'svelte/reactivity';
import { resolveLanguageTag } from '$lib/languages/registry.js';
import { copyCanonicalMarkup, downloadUtf8Text, readClipboardText } from '../clipboard.js';
import { sampleDraftLanguage, sampleDraftText } from '../sample-draft.js';
import { createDraftStore } from './draft-store.svelte.js';
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

export { performerColorIds } from './roster-store.svelte.js';
export type { RosterMergeSuggestion } from './roster-store.svelte.js';
export type { RightPanelTab } from './panel-view.svelte.js';

export interface WorkbenchDependencies {
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
	autosave: AutosaveController;
	ignoreStore: SessionIgnoreStore;
	feedback?: FeedbackState;
	sources?: readonly SourceReference[];
	ruleSet?: RuleSetManifest;
	copy?: (text: string) => Promise<void>;
	readClipboard?: () => Promise<string>;
	exportText?: (text: string, filename: string) => void;
	idFactory?: () => string;
	now?: () => string;
	onOpenDraft?: (draft: DraftRecord) => EditorSnapshot | void;
	initialActiveTab?: RightPanelTab;
	onActiveTabChange?: (tab: RightPanelTab) => void;
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
	readonly severityFiltersOpen: boolean;
	readonly visibleDiagnostics: readonly Diagnostic[];
	readonly bulkFixPlan: BulkFixPlan;
	readonly ignoredRuleIds: readonly string[];
	readonly ignoredRuleCount: number;
	readonly saveStatus: AutosaveStatus;
	readonly drafts: readonly DraftSummary[];
	readonly feedback: FeedbackState;
	readonly toasts: readonly ToastMessage[];
	readonly sources: ReadonlyMap<string, SourceReference>;
	readonly ruleSet?: RuleSetManifest;
	readonly rosterSuggestions: readonly RosterMergeSuggestion[];
	readonly unresolvedVoiceGroups: readonly VoiceGroup[];
	/**
	 * The audio this draft is transcribed from, or undefined in a build with no
	 * media repository behind it. Surfaces read `media?.player.attached` rather
	 * than deciding for themselves whether audio exists.
	 */
	readonly media?: MediaStore;
	/**
	 * Publish the editor handle bound by the workspace. Svelte clears a bound
	 * component prop during keyed teardown, so the hand-off can briefly carry
	 * `undefined` before the replacement editor publishes its handle.
	 */
	setEditorHandle(handle: EditorHandle | undefined): void;
	setSaveStatus(status: AutosaveStatus): void;
	onSnapshot(snapshot: EditorSnapshot): void;
	/**
	 * A line anchor was written, corrected, or cleared.
	 *
	 * Anchors are saved with the draft, but most of the ways one is set change no
	 * text at all — sync mode holds the document read-only, and `Ctrl-Alt-M` and
	 * the timestamp column's own control move nothing. `onSnapshot` therefore
	 * never hears about them, and for a while a whole synced song was lost on
	 * reload because the only anchors that survived were the ones the automatic
	 * stamp happened to write alongside a keystroke.
	 */
	onLineAnchorsChanged(): void;
	setActiveTab(tab: RightPanelTab): void;
	toggleSeverity(severity: Severity): void;
	toggleSeverityFilters(): boolean;
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
	previewFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	clearFixPreview(): void;
	applyFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	fixBatchSize(diagnostic: Diagnostic, fix: DiagnosticFix): number;
	applyFixBatch(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	applyBulkFix(): void;
	ignoreRule(ruleId: string): void;
	restoreRule(ruleId: string): void;
	copyCanonical(): Promise<void>;
	pasteLyrics(): Promise<void>;
	/** Replace an empty document with the bundled sample transcription. */
	loadSample(): void;
	insertSection(): void;
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
	deleteDraft(id: string): Promise<void>;
	deleteAllDrafts(): Promise<void>;
	flushAutosave(): Promise<void>;
}

const largePasteThreshold = 32;

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
	const idFactory =
		deps.idFactory ??
		(() =>
			typeof crypto !== 'undefined' && 'randomUUID' in crypto
				? crypto.randomUUID()
				: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`);

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

	// A loaded draft's anchors, waiting for an editor that can hold them. Declared
	// ahead of `bindings` because the getter below falls back to it.
	let pendingLineAnchors: readonly LineAnchor[] | undefined = deps.initialDraft.lineAnchors;

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
		bindings: {
			get snapshot() {
				return editorSession.snapshot;
			},
			get performers() {
				return roster.performers;
			},
			get lineAnchors() {
				// Falling back to the anchors still waiting rather than to nothing.
				// The page boots with a headless handle that cannot answer this, and
				// any save that landed in that window — a rename is enough — would
				// write an empty list over the draft's own timings.
				return editorSession.editor.getLineAnchors?.() ?? pendingLineAnchors ?? [];
			},
			onDraftLoaded(nextDraft) {
				roster.reset(nextDraft.performers);
				panel.refreshIgnoredRules();
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
				pendingLineAnchors = nextDraft.lineAnchors ?? [];
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

	const media = deps.mediaRepository
		? createMediaStore({
				repository: deps.mediaRepository,
				feedback,
				draftId: () => draft.draftId,
				...(deps.mediaPlayer ? { player: deps.mediaPlayer } : {})
			})
		: undefined;

	const panel = createPanelView({
		editor: () => editorSession.editor,
		snapshot: () => editorSession.snapshot,
		draftId: () => draft.draftId,
		ignoreStore: deps.ignoreStore,
		feedback,
		initialActiveTab: deps.initialActiveTab,
		onActiveTabChange: deps.onActiveTabChange
	});

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
		get severityFiltersOpen() {
			return panel.severityFiltersOpen;
		},
		get visibleDiagnostics() {
			return panel.visibleDiagnostics;
		},
		get bulkFixPlan() {
			return panel.bulkFixPlan;
		},
		get ignoredRuleIds() {
			return panel.ignoredRuleIds;
		},
		get ignoredRuleCount() {
			return panel.ignoredRuleIds.length;
		},
		get saveStatus() {
			return draft.saveStatus;
		},
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
		get unresolvedVoiceGroups() {
			return roster.unresolvedVoiceGroups;
		},
		get media() {
			return media;
		},
		setEditorHandle(handle) {
			// Keep the last usable handle through the keyed editor's teardown.
			// Reactive diagnostic cleanup can still run during that hand-off, and
			// replacing the handle with `undefined` would make even an optional
			// editor capability such as `previewAtomic` unsafe to inspect.
			if (!handle) return;
			editorSession.setEditorHandle(handle);
			// The anchors wait for a handle that can actually take them, and the
			// capability is *checked* rather than optional-called. The first handle
			// this ever sees is the page's headless placeholder — it holds no
			// document and implements no anchors — so `handle.setLineAnchors?.(…)`
			// dropped a whole song's timings into a no-op and then cleared the
			// pending list, every reload, before CodeMirror had mounted. `?.` is safe
			// for a fire-and-forget notification and wrong for a one-shot hand-off:
			// there is no second chance to deliver this.
			if (pendingLineAnchors && handle.setLineAnchors) {
				handle.setLineAnchors(pendingLineAnchors);
				pendingLineAnchors = undefined;
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
			// A fix's own re-lint arrives here. Prune first so the card the fix
			// emptied is gone before the panel leads with the next one.
			panel.leadAfterFix(nextSnapshot.diagnostics);
			if (change.unchanged) return;
			if (change.textDelta >= largePasteThreshold) roster.importFromSnapshot(nextSnapshot);
			draft.scheduleSave();
		},
		onLineAnchorsChanged() {
			draft.scheduleSave();
		},
		setActiveTab: panel.setActiveTab,
		toggleSeverity: panel.toggleSeverity,
		toggleSeverityFilters: panel.toggleSeverityFilters,
		setTitle: draft.setTitle,
		setLanguage: draft.setLanguage,
		undo: editorSession.undo,
		redo: editorSession.redo,
		navigateToDiagnostic: panel.navigateToDiagnostic,
		highlightDiagnostic: panel.highlightDiagnostic,
		chooseSectionHeader: panel.chooseSectionHeader,
		canAssignDiagnosticPerformers: panel.canAssignDiagnosticPerformers,
		assignDiagnosticPerformers: panel.assignDiagnosticPerformers,
		previewFix: panel.previewFix,
		clearFixPreview: panel.clearFixPreview,
		applyFix: panel.applyFix,
		fixBatchSize: panel.fixBatchSize,
		applyFixBatch: panel.applyFixBatch,
		applyBulkFix: panel.applyBulkFix,
		ignoreRule: panel.ignoreRule,
		restoreRule: panel.restoreRule,
		copyCanonical: editorSession.copyCanonical,
		pasteLyrics: editorSession.pasteLyrics,
		loadSample() {
			editorSession.replaceDocument(
				sampleDraftText,
				'Sample transcription loaded. Undo replaces it with an empty draft.'
			);
		},
		insertSection: editorSession.insertSection,
		addPerformer: roster.addPerformer,
		renamePerformer: roster.renamePerformer,
		adoptHeaderRename: roster.adoptHeaderRename,
		mergePerformers: roster.mergePerformers,
		removePerformer: roster.removePerformer,
		refreshDrafts: draft.refreshDrafts,
		createDraft: draft.createDraft,
		openDraft: draft.openDraft,
		renameDraft: draft.renameDraft,
		duplicateDraft: draft.duplicateDraft,
		exportDraft: draft.exportDraft,
		deleteDraft: draft.deleteDraft,
		deleteAllDrafts: draft.deleteAllDrafts,
		flushAutosave: draft.flushAutosave
	};

	roster.importFromSnapshot(deps.initialSnapshot);
	void controller.refreshDrafts();
	// The draft the page boots with never travels through `onDraftLoaded` — that
	// hook fires on a *switch* — so without this a reload came back to a workbench
	// with no audio and no sign there had been any.
	void media?.openFor(deps.initialDraft.id);
	return controller;
}

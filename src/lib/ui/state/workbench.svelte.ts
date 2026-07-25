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
	PerformerRecord,
	RuleSetManifest,
	SessionIgnoreStore,
	Severity,
	SourceReference,
	VoiceGroup
} from '$lib/core/types.js';
import { SvelteDate, SvelteMap } from 'svelte/reactivity';
import { copyCanonicalMarkup, downloadUtf8Text } from '../clipboard.js';
import { createDraftStore } from './draft-store.svelte.js';
import { createEditorSession } from './editor-session.svelte.js';
import type { FeedbackState, ToastMessage } from './feedback.svelte.js';
import { createFeedbackState } from './feedback.svelte.js';
import type { BulkFixPlan } from '$lib/rules/bulk-fix.js';
import type { RightPanelTab } from './panel-view.svelte.js';
import { createPanelView } from './panel-view.svelte.js';
import type { RosterMergeSuggestion } from './roster-store.svelte.js';
import { createRosterStore } from './roster-store.svelte.js';

export { performerColorIds } from './roster-store.svelte.js';
export type { RosterMergeSuggestion } from './roster-store.svelte.js';
export type { RightPanelTab } from './panel-view.svelte.js';

export interface WorkbenchDependencies {
	editor: EditorHandle;
	initialSnapshot: EditorSnapshot;
	initialDraft: DraftRecord;
	initialRecentLanguages?: readonly string[];
	repository: DraftRepository;
	autosave: AutosaveController;
	ignoreStore: SessionIgnoreStore;
	feedback?: FeedbackState;
	sources?: readonly SourceReference[];
	ruleSet?: RuleSetManifest;
	copy?: (text: string) => Promise<void>;
	exportText?: (text: string, filename: string) => void;
	idFactory?: () => string;
	now?: () => string;
	onOpenDraft?: (draft: DraftRecord) => EditorSnapshot | void;
}

export interface WorkbenchController {
	readonly editor: EditorHandle;
	readonly snapshot: EditorSnapshot;
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
	setEditorHandle(handle: EditorHandle): void;
	setSaveStatus(status: AutosaveStatus): void;
	onSnapshot(snapshot: EditorSnapshot): void;
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
		copy
	});

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
			onDraftLoaded(nextDraft) {
				roster.reset(nextDraft.performers);
				panel.refreshIgnoredRules();
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

	const panel = createPanelView({
		editor: () => editorSession.editor,
		snapshot: () => editorSession.snapshot,
		draftId: () => draft.draftId,
		ignoreStore: deps.ignoreStore,
		feedback
	});

	const controller: WorkbenchController = {
		get editor() {
			return editorSession.editor;
		},
		get snapshot() {
			return editorSession.snapshot;
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
		setEditorHandle(handle) {
			editorSession.setEditorHandle(handle);
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
	return controller;
}

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
	ImportSuggestion,
	PerformerRecord,
	RuleSetManifest,
	SessionIgnoreStore,
	Severity,
	SourceReference,
	VoiceGroup
} from '$lib/core/types.js';
import { extractPerformers } from '$lib/performers/index.js';
import { SvelteDate, SvelteMap } from 'svelte/reactivity';
import { copyCanonicalMarkup, downloadUtf8Text } from '../clipboard.js';
import type { FeedbackState, ToastMessage } from './feedback.svelte.js';
import { createFeedbackState } from './feedback.svelte.js';

export type RightPanelTab = 'linter' | 'performers' | 'tools';

export interface RosterMergeSuggestion {
	sourceId: string;
	targetId: string;
	sourceName: string;
	targetName: string;
	reason: 'case' | 'normalized-key' | 'alias';
}

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
	readonly visibleDiagnostics: readonly Diagnostic[];
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
	setTitle(title: string): Promise<void>;
	setLanguage(language: string): void;
	undo(): void;
	redo(): void;
	navigateToDiagnostic(diagnostic: Diagnostic): void;
	chooseSectionHeader(diagnostic: Diagnostic): void;
	assignDiagnosticPerformers(diagnostic: Diagnostic): void;
	previewFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
	clearFixPreview(): void;
	applyFix(diagnostic: Diagnostic, fix: DiagnosticFix): void;
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

const allSeverities: Severity[] = ['error', 'warning', 'suggestion', 'manual-review'];
const largePasteThreshold = 32;
const maxRecentLanguages = 5;
/**
 * Roster allocation order for performer colors. Green then violet lead so the
 * first two performers match the approved mockup (Mara green, Jun violet);
 * the remaining hues stay mutually distinguishable.
 */
export const performerColorIds = [
	'olive',
	'indigo',
	'teal',
	'ochre',
	'rose',
	'plum',
	'copper',
	'slate'
] as const;

function normalizedKey(displayName: string): string {
	return displayName.trim().toLocaleLowerCase();
}

function safeFilename(title: string): string {
	const withoutControls = [...title.trim()]
		.map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
		.join('');
	const filename = withoutControls.replace(/[<>:"/\\|?*]/g, '_') || 'Untitled draft';
	return `${filename}.txt`;
}

function cloneRoster(roster: readonly PerformerRecord[]): PerformerRecord[] {
	return roster.map((performer) => ({ ...performer, aliases: [...performer.aliases] }));
}

function prependRecentLanguage(languages: readonly string[], language: string): string[] {
	const normalized = language.trim();
	const unique = languages.filter(
		(candidate, index) =>
			candidate.trim().length > 0 &&
			candidate !== normalized &&
			languages.indexOf(candidate) === index
	);
	return normalized ? [normalized, ...unique].slice(0, maxRecentLanguages) : unique;
}

export function createWorkbenchController(deps: WorkbenchDependencies): WorkbenchController {
	let editor = $state(deps.editor);
	let snapshot = $state(deps.initialSnapshot);
	let draftId = $state(deps.initialDraft.id);
	let title = $state(deps.initialDraft.title);
	let language = $state(deps.initialDraft.language);
	let recentLanguages = $state(
		prependRecentLanguage(deps.initialRecentLanguages ?? [], deps.initialDraft.language)
	);
	let createdAt = $state(deps.initialDraft.createdAt);
	let originalText = $state(deps.initialDraft.originalText);
	let performers = $state<PerformerRecord[]>(cloneRoster(deps.initialDraft.performers));
	let activeTab = $state<RightPanelTab>('linter');
	let activeDiagnosticKey = $state<string | undefined>();
	let severityFilter = $state<Severity[]>([...allSeverities]);
	let ignoredRuleIds = $state<string[]>(deps.ignoreStore.list(deps.initialDraft.id));
	let saveStatus = $state<AutosaveStatus>(deps.autosave.status());
	let drafts = $state<DraftSummary[]>([]);
	let importSuggestions = $state<ImportSuggestion[]>([]);
	let unresolvedVoiceGroups = $state<VoiceGroup[]>([]);
	let lastEditorRevision: number | undefined;
	let statusRefreshTimer: ReturnType<typeof setTimeout> | undefined;

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

	function diagnosticKey(diagnostic: Diagnostic): string {
		return `${diagnostic.ruleId}:${diagnostic.from}:${diagnostic.to}`;
	}

	function draftFromSnapshot(currentSnapshot = snapshot): DraftRecord {
		return {
			id: draftId,
			title,
			text: currentSnapshot.text,
			language,
			performers: cloneRoster(performers),
			createdAt,
			updatedAt: now(),
			ruleSetVersion: deps.ruleSet?.version ?? deps.initialDraft.ruleSetVersion,
			editorSelection: { ...currentSnapshot.selection },
			...(originalText === undefined ? {} : { originalText })
		};
	}

	function scheduleSave(): void {
		deps.autosave.schedule({ revision: snapshot.revision, draft: draftFromSnapshot() });
		saveStatus = deps.autosave.status();
		if (statusRefreshTimer) clearTimeout(statusRefreshTimer);
		const refreshStatus = () => {
			saveStatus = deps.autosave.status();
			statusRefreshTimer =
				saveStatus === 'scheduled' || saveStatus === 'saving'
					? setTimeout(refreshStatus, 250)
					: undefined;
		};
		statusRefreshTimer = setTimeout(refreshStatus, 250);
	}

	function setRoster(next: readonly PerformerRecord[]): void {
		performers = next
			.map((performer, index) => ({ ...performer, aliases: [...performer.aliases], order: index }))
			.sort((left, right) => left.order - right.order);
		scheduleSave();
	}

	function commitRoster(next: readonly PerformerRecord[], message: string): void {
		const previous = cloneRoster(performers);
		setRoster(next);
		feedback.announce(message);
		feedback.addToast({
			message,
			actionLabel: 'Undo',
			action: () => {
				setRoster(previous);
				feedback.announce('Roster change undone.');
			}
		});
	}

	function importPerformers(currentSnapshot: EditorSnapshot): void {
		const extraction = extractPerformers(currentSnapshot.parsed, performers);
		importSuggestions = extraction.suggestions.map((suggestion) => ({
			...suggestion,
			importedRange: { ...suggestion.importedRange }
		}));
		unresolvedVoiceGroups = extraction.unresolvedVoiceGroups.map((group) => ({
			...group,
			performerIds: [...group.performerIds],
			...(group.sourceRange ? { sourceRange: { ...group.sourceRange } } : {})
		}));

		if (extraction.rosterAdditions.length === 0) return;
		const additions = extraction.rosterAdditions.map((performer, index) => ({
			...performer,
			aliases: [...performer.aliases],
			colorId: performerColorIds[(performers.length + index) % performerColorIds.length] ?? 'olive',
			order: performers.length + index
		}));
		const names = additions.map((performer) => performer.displayName);
		const message =
			names.length === 1
				? `Imported ${names[0]} into the roster.`
				: `Imported ${names.length} performers into the roster.`;
		commitRoster([...performers, ...additions], message);
	}

	function setIgnored(ruleId: string, ignored: boolean): void {
		if (ignored) deps.ignoreStore.ignore(draftId, ruleId);
		else deps.ignoreStore.restore(draftId, ruleId);
		ignoredRuleIds = deps.ignoreStore.list(draftId);
	}

	function rememberLanguage(nextLanguage: string): void {
		recentLanguages = prependRecentLanguage(recentLanguages, nextLanguage);
		void deps.repository.rememberLanguage(nextLanguage).catch(() => {
			feedback.announce('Recent languages could not be saved locally.');
		});
	}

	function loadDraft(nextDraft: DraftRecord): void {
		draftId = nextDraft.id;
		title = nextDraft.title;
		language = nextDraft.language;
		rememberLanguage(nextDraft.language);
		createdAt = nextDraft.createdAt;
		originalText = nextDraft.originalText;
		performers = cloneRoster(nextDraft.performers);
		ignoredRuleIds = deps.ignoreStore.list(nextDraft.id);
		lastEditorRevision = undefined;
		const openedSnapshot = deps.onOpenDraft?.(nextDraft);
		if (openedSnapshot) {
			snapshot = openedSnapshot;
			importPerformers(openedSnapshot);
		}
	}

	function emptyTransientDraft(): DraftRecord {
		const timestamp = now();
		return {
			id: idFactory(),
			title: 'Untitled draft',
			text: '',
			language,
			performers: [],
			createdAt: timestamp,
			updatedAt: timestamp,
			ruleSetVersion: deps.ruleSet?.version ?? deps.initialDraft.ruleSetVersion,
			editorSelection: { anchor: 0, head: 0 }
		};
	}

	const controller: WorkbenchController = {
		get editor() {
			return editor;
		},
		get snapshot() {
			return snapshot;
		},
		get draftId() {
			return draftId;
		},
		get title() {
			return title;
		},
		get language() {
			return language;
		},
		get recentLanguages() {
			return recentLanguages;
		},
		get performers() {
			return performers;
		},
		get activeTab() {
			return activeTab;
		},
		get activeDiagnosticKey() {
			return activeDiagnosticKey;
		},
		get severityFilter() {
			return severityFilter;
		},
		get visibleDiagnostics() {
			return snapshot.diagnostics.filter(
				(diagnostic) =>
					severityFilter.includes(diagnostic.severity) &&
					!ignoredRuleIds.includes(diagnostic.ruleId)
			);
		},
		get ignoredRuleIds() {
			return ignoredRuleIds;
		},
		get ignoredRuleCount() {
			return ignoredRuleIds.length;
		},
		get saveStatus() {
			return saveStatus;
		},
		get drafts() {
			return drafts;
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
			const suggestions = new SvelteMap<string, RosterMergeSuggestion>();
			for (let sourceIndex = 0; sourceIndex < performers.length; sourceIndex += 1) {
				for (let targetIndex = 0; targetIndex < sourceIndex; targetIndex += 1) {
					const source = performers[sourceIndex];
					const target = performers[targetIndex];
					if (!source || !target || source.normalizedKey !== target.normalizedKey) continue;
					const suggestion: RosterMergeSuggestion = {
						sourceId: source.id,
						targetId: target.id,
						sourceName: source.displayName,
						targetName: target.displayName,
						reason:
							source.displayName.toLocaleLowerCase() === target.displayName.toLocaleLowerCase()
								? 'case'
								: 'normalized-key'
					};
					suggestions.set(`${suggestion.sourceId}:${suggestion.targetId}`, suggestion);
				}
			}
			for (const imported of importSuggestions) {
				const source = performers.find(
					(performer) =>
						performer.displayName === imported.importedName && performer.id !== imported.performerId
				);
				const target = performers.find((performer) => performer.id === imported.performerId);
				if (!source || !target) continue;
				const suggestion: RosterMergeSuggestion = {
					sourceId: source.id,
					targetId: target.id,
					sourceName: source.displayName,
					targetName: target.displayName,
					reason: imported.reason
				};
				suggestions.set(`${suggestion.sourceId}:${suggestion.targetId}`, suggestion);
			}
			return [...suggestions.values()];
		},
		get unresolvedVoiceGroups() {
			return unresolvedVoiceGroups;
		},
		setEditorHandle(handle) {
			editor = handle;
		},
		setSaveStatus(status) {
			saveStatus = status;
		},
		onSnapshot(nextSnapshot) {
			if (lastEditorRevision !== undefined && nextSnapshot.revision < lastEditorRevision) return;
			const textDelta = nextSnapshot.text.length - snapshot.text.length;
			// The editor emits once at mount so loaded drafts get linted. That
			// snapshot matches the persisted state byte for byte, so store it
			// (for its diagnostics) without dirtying the draft.
			const unchanged =
				nextSnapshot.text === snapshot.text &&
				nextSnapshot.selection.anchor === snapshot.selection.anchor &&
				nextSnapshot.selection.head === snapshot.selection.head;
			lastEditorRevision = nextSnapshot.revision;
			snapshot = nextSnapshot;
			if (
				activeDiagnosticKey &&
				!nextSnapshot.diagnostics.some(
					(diagnostic) => diagnosticKey(diagnostic) === activeDiagnosticKey
				)
			) {
				activeDiagnosticKey = undefined;
			}
			if (unchanged) return;
			if (textDelta >= largePasteThreshold) importPerformers(nextSnapshot);
			scheduleSave();
		},
		setActiveTab(tab) {
			activeTab = tab;
		},
		toggleSeverity(severity) {
			severityFilter = severityFilter.includes(severity)
				? severityFilter.filter((candidate) => candidate !== severity)
				: allSeverities.filter(
						(candidate) => candidate === severity || severityFilter.includes(candidate)
					);
		},
		async setTitle(nextTitle) {
			const trimmed = nextTitle.trim() || 'Untitled draft';
			title = trimmed;
			try {
				await deps.repository.rename(draftId, trimmed);
				scheduleSave();
				await controller.refreshDrafts();
			} catch {
				saveStatus = 'failed';
				feedback.announce('Draft title could not be saved locally.');
			}
		},
		setLanguage(nextLanguage) {
			language = nextLanguage;
			rememberLanguage(nextLanguage);
			scheduleSave();
		},
		undo() {
			editor.undo();
		},
		redo() {
			editor.redo();
		},
		navigateToDiagnostic(diagnostic) {
			editor.clearPreview?.();
			// Activating a diagnostic from the editor has to reveal its card, so
			// pull the panel back to the linter tab whatever was showing before.
			activeTab = 'linter';
			activeDiagnosticKey = diagnosticKey(diagnostic);
			const range = { from: diagnostic.from, to: diagnostic.to };
			editor.setSelection({ anchor: diagnostic.from, head: diagnostic.to });
			// CodeMirror applies queued scroll requests during its measure phase.
			// Reveal last so selection's nearest-edge scroll cannot replace the
			// deliberate upper-third placement.
			editor.revealRange(range);
			editor.focus();
		},
		chooseSectionHeader(diagnostic) {
			editor.clearPreview?.();
			activeTab = 'linter';
			activeDiagnosticKey = diagnosticKey(diagnostic);
			editor.setSelection({ anchor: diagnostic.from, head: diagnostic.to });
			editor.revealRange({ from: diagnostic.from, to: diagnostic.to });
			if (editor.requestSectionHeader) {
				editor.requestSectionHeader();
			} else {
				feedback.announce('The section-header picker is unavailable.');
			}
		},
		assignDiagnosticPerformers(diagnostic) {
			editor.clearPreview?.();
			activeTab = 'linter';
			activeDiagnosticKey = diagnosticKey(diagnostic);
			editor.setSelection({ anchor: diagnostic.from, head: diagnostic.to });
			editor.revealRange({ from: diagnostic.from, to: diagnostic.to });
			if (editor.requestPerformerLegendAssignment) {
				editor.requestPerformerLegendAssignment(diagnostic);
			} else {
				feedback.announce('The performer picker is unavailable.');
			}
		},
		previewFix(diagnostic, fix) {
			if (fix.edit.baseRevision !== snapshot.revision) {
				feedback.announce('This preview is stale. Review the current diagnostic again.');
				return;
			}
			try {
				editor.previewAtomic?.(fix.edit);
				editor.revealRange({ from: diagnostic.from, to: diagnostic.to });
				feedback.announce(`${fix.label} previewed in the editor.`);
			} catch {
				feedback.announce('The fix could not be previewed in the editor.');
			}
		},
		clearFixPreview() {
			editor.clearPreview?.();
			feedback.announce('Fix preview cancelled.');
		},
		applyFix(diagnostic, fix) {
			editor.clearPreview?.();
			activeDiagnosticKey = undefined;
			if (fix.edit.baseRevision !== snapshot.revision) {
				feedback.announce('This fix is stale. Review the current diagnostic before applying it.');
				return;
			}
			editor.dispatchAtomic(fix.edit);
			feedback.announce(`${fix.label} applied for ${diagnostic.message}.`);
		},
		ignoreRule(ruleId) {
			editor.clearPreview?.();
			activeDiagnosticKey = undefined;
			if (ignoredRuleIds.includes(ruleId)) return;
			setIgnored(ruleId, true);
			const message = `Ignored ${ruleId} for this session.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => {
					setIgnored(ruleId, false);
					feedback.announce(`Restored ${ruleId}.`);
				}
			});
		},
		restoreRule(ruleId) {
			if (!ignoredRuleIds.includes(ruleId)) return;
			setIgnored(ruleId, false);
			const message = `Restored ${ruleId}.`;
			feedback.announce(message);
			feedback.addToast({
				message,
				actionLabel: 'Undo',
				action: () => {
					setIgnored(ruleId, true);
					feedback.announce(`Ignored ${ruleId} again.`);
				}
			});
		},
		async copyCanonical() {
			try {
				await copy(snapshot.text);
				feedback.announce('Canonical Genius markup copied.');
			} catch {
				feedback.announce('Copy failed. Check browser clipboard permission and try again.');
			}
		},
		insertSection() {
			if (editor.requestSectionHeader) {
				editor.requestSectionHeader();
			} else {
				feedback.announce('Place the cursor in a lyric section before inserting a header.');
			}
		},
		addPerformer(displayName) {
			const trimmed = displayName.trim();
			if (!trimmed) return;
			const next: PerformerRecord = {
				id: idFactory(),
				displayName: trimmed,
				normalizedKey: normalizedKey(trimmed),
				aliases: [],
				colorId: performerColorIds[performers.length % performerColorIds.length] ?? 'olive',
				order: performers.length
			};
			commitRoster([...performers, next], `Added ${trimmed} to the roster.`);
		},
		renamePerformer(id, displayName) {
			const trimmed = displayName.trim();
			const current = performers.find((performer) => performer.id === id);
			if (!current || !trimmed || current.displayName === trimmed) return;
			commitRoster(
				performers.map((performer) =>
					performer.id === id
						? {
								...performer,
								displayName: trimmed,
								normalizedKey: normalizedKey(trimmed)
							}
						: performer
				),
				`Renamed ${current.displayName} to ${trimmed}.`
			);
		},
		adoptHeaderRename(id, previousName, displayName) {
			const trimmed = displayName.trim();
			const current = performers.find((performer) => performer.id === id);
			if (!current || !trimmed) return;
			// The previous spelling stays as an alias so undoing the document edit,
			// or a header the user has not retyped yet, still resolves to this
			// performer instead of importing a duplicate.
			const aliases = [...current.aliases, previousName].filter(
				(alias, index, allAliases) =>
					alias.length > 0 && alias !== trimmed && allAliases.indexOf(alias) === index
			);
			if (
				current.displayName === trimmed &&
				aliases.length === current.aliases.length &&
				aliases.every((alias, index) => alias === current.aliases[index])
			) {
				return;
			}
			// The header edit already lives in editor undo, so this roster update
			// deliberately carries no toast of its own.
			setRoster(
				performers.map((performer) =>
					performer.id === id
						? {
								...performer,
								displayName: trimmed,
								normalizedKey: normalizedKey(trimmed),
								aliases
							}
						: performer
				)
			);
		},
		mergePerformers(sourceId, targetId) {
			if (sourceId === targetId) return;
			const source = performers.find((performer) => performer.id === sourceId);
			const target = performers.find((performer) => performer.id === targetId);
			if (!source || !target) return;
			const aliases = [...target.aliases, source.displayName, ...source.aliases].filter(
				(alias, index, allAliases) =>
					alias !== target.displayName && allAliases.indexOf(alias) === index
			);
			commitRoster(
				performers
					.filter((performer) => performer.id !== sourceId)
					.map((performer) => (performer.id === targetId ? { ...performer, aliases } : performer)),
				`Merged ${source.displayName} into ${target.displayName}.`
			);
		},
		removePerformer(id) {
			const performer = performers.find((candidate) => candidate.id === id);
			if (!performer) return;
			commitRoster(
				performers.filter((candidate) => candidate.id !== id),
				`Removed ${performer.displayName} from the roster.`
			);
		},
		async refreshDrafts() {
			drafts = await deps.repository.list();
		},
		async createDraft() {
			await deps.autosave.flush();
			const timestamp = now();
			const rememberedLanguage = language;
			const draft: DraftRecord = {
				id: idFactory(),
				title: 'Untitled draft',
				text: '',
				language: rememberedLanguage,
				performers: [],
				createdAt: timestamp,
				updatedAt: timestamp,
				ruleSetVersion: deps.ruleSet?.version ?? deps.initialDraft.ruleSetVersion,
				editorSelection: { anchor: 0, head: 0 }
			};
			const created = await deps.repository.create(draft);
			await deps.repository.setCurrent(created.id);
			loadDraft(created);
			await controller.refreshDrafts();
			feedback.announce('New draft created.');
		},
		async openDraft(id) {
			await deps.autosave.flush();
			if (id === draftId) return;
			const draft = await deps.repository.get(id);
			if (!draft) {
				feedback.announce('That draft is no longer available.');
				return;
			}
			await deps.repository.setCurrent(id);
			loadDraft(draft);
			await controller.refreshDrafts();
			feedback.announce(`Opened ${draft.title}.`);
		},
		async renameDraft(id, nextTitle) {
			const trimmed = nextTitle.trim() || 'Untitled draft';
			await deps.repository.rename(id, trimmed);
			if (id === draftId) {
				title = trimmed;
				scheduleSave();
			}
			await controller.refreshDrafts();
			feedback.announce(`Renamed draft to ${trimmed}.`);
		},
		async duplicateDraft(id) {
			await deps.autosave.flush();
			const duplicate = await deps.repository.duplicate(id, idFactory());
			await controller.refreshDrafts();
			feedback.announce(`Duplicated ${duplicate.title.replace(/ copy$/, '')}.`);
		},
		async exportDraft(id = draftId) {
			const draft = id === draftId ? draftFromSnapshot() : await deps.repository.get(id);
			if (!draft) {
				feedback.announce('That draft could not be exported.');
				return;
			}
			exportText(draft.text, safeFilename(draft.title));
			feedback.announce(`Exported ${draft.title} as UTF-8 text.`);
		},
		async deleteDraft(id) {
			const deleted = await deps.repository.get(id);
			if (deps.autosave.cancelDraft) {
				deps.autosave.cancelDraft(id);
			} else if (id === draftId) {
				deps.autosave.cancel();
			}
			await deps.repository.delete(id);
			if (id === draftId) {
				const remaining = await deps.repository.list();
				const next = remaining[0] ? await deps.repository.get(remaining[0].id) : undefined;
				if (next) {
					await deps.repository.setCurrent(next.id);
					loadDraft(next);
				} else {
					loadDraft(emptyTransientDraft());
				}
			}
			await controller.refreshDrafts();
			feedback.announce(`Deleted ${deleted?.title ?? 'draft'}.`);
		},
		async deleteAllDrafts() {
			deps.autosave.cancel();
			await deps.repository.deleteAll();
			drafts = [];
			loadDraft(emptyTransientDraft());
			feedback.announce('All local drafts deleted.');
		},
		async flushAutosave() {
			saveStatus = 'saving';
			try {
				await deps.autosave.flush();
				saveStatus = deps.autosave.status();
			} catch {
				saveStatus = 'failed';
				feedback.announce('Local save failed. Keep this tab open and try again.');
			}
		}
	};

	importPerformers(deps.initialSnapshot);
	rememberLanguage(deps.initialDraft.language);
	void controller.refreshDrafts();
	return controller;
}

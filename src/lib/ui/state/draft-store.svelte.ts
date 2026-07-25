import type {
	AutosaveController,
	AutosaveStatus,
	DraftRecord,
	DraftRepository,
	DraftSummary,
	EditorSnapshot,
	PerformerRecord,
	RuleSetManifest
} from '$lib/core/types.js';
import type { FeedbackState } from './feedback.svelte.js';
import { cloneRoster } from './roster-store.svelte.js';

const maxRecentLanguages = 5;

function safeFilename(title: string): string {
	const withoutControls = [...title.trim()]
		.map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
		.join('');
	const filename = withoutControls.replace(/[<>:"/\\|?*]/g, '_') || 'Untitled draft';
	return `${filename}.txt`;
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

/**
 * The parts of a loaded draft the draft store does not own itself. Switching
 * drafts has to move the roster, the session ignores, and the editor along with
 * the draft identity, so the composing controller supplies that step.
 */
export interface DraftStoreBindings {
	readonly snapshot: EditorSnapshot;
	readonly performers: readonly PerformerRecord[];
	onDraftLoaded(draft: DraftRecord): void;
}

export interface DraftStoreDependencies {
	initialDraft: DraftRecord;
	initialRecentLanguages?: readonly string[];
	repository: DraftRepository;
	autosave: AutosaveController;
	feedback: FeedbackState;
	ruleSet?: RuleSetManifest;
	exportText: (text: string, filename: string) => void;
	idFactory: () => string;
	now: () => string;
	bindings: DraftStoreBindings;
}

export interface DraftStore {
	readonly draftId: string;
	readonly title: string;
	readonly language: string;
	readonly recentLanguages: readonly string[];
	readonly drafts: readonly DraftSummary[];
	readonly saveStatus: AutosaveStatus;
	/** The shared save seam: the current draft as it would be persisted now. */
	draftFromSnapshot(currentSnapshot?: EditorSnapshot): DraftRecord;
	scheduleSave(): void;
	setSaveStatus(status: AutosaveStatus): void;
	flushAutosave(): Promise<void>;
	setTitle(title: string): Promise<void>;
	setLanguage(language: string): void;
	refreshDrafts(): Promise<void>;
	createDraft(): Promise<void>;
	openDraft(id: string): Promise<void>;
	renameDraft(id: string, title: string): Promise<void>;
	duplicateDraft(id: string): Promise<void>;
	exportDraft(id?: string): Promise<void>;
	deleteDraft(id: string): Promise<void>;
	deleteAllDrafts(): Promise<void>;
}

export function createDraftStore(deps: DraftStoreDependencies): DraftStore {
	let draftId = $state(deps.initialDraft.id);
	let title = $state(deps.initialDraft.title);
	let language = $state(deps.initialDraft.language);
	let recentLanguages = $state(
		prependRecentLanguage(deps.initialRecentLanguages ?? [], deps.initialDraft.language)
	);
	let createdAt = $state(deps.initialDraft.createdAt);
	let originalText = $state(deps.initialDraft.originalText);
	let drafts = $state<DraftSummary[]>([]);
	let saveStatus = $state<AutosaveStatus>(deps.autosave.status());
	let statusRefreshTimer: ReturnType<typeof setTimeout> | undefined;
	// Whether this draft has a record in the repository. A draft with no text
	// never does — see `scheduleSave` — so blankness and persistence track each
	// other, and startup recovery has already swept any blank record an older
	// build left behind.
	let persisted = deps.initialDraft.text.trim().length > 0;

	const feedback = deps.feedback;
	const bindings = deps.bindings;

	function draftFromSnapshot(currentSnapshot = bindings.snapshot): DraftRecord {
		return {
			id: draftId,
			title,
			text: currentSnapshot.text,
			language,
			performers: cloneRoster(bindings.performers),
			createdAt,
			updatedAt: deps.now(),
			ruleSetVersion: deps.ruleSet?.version ?? deps.initialDraft.ruleSetVersion,
			editorSelection: { ...currentSnapshot.selection },
			...(originalText === undefined ? {} : { originalText })
		};
	}

	/**
	 * Drop the record of a draft the user has emptied, and forget any write
	 * still queued for it. Undo puts the text back and the next save writes the
	 * same id again, so nothing is lost by letting the empty version go.
	 */
	function discardEmptyDraft(): void {
		if (deps.autosave.cancelDraft) {
			deps.autosave.cancelDraft(draftId);
		} else {
			deps.autosave.cancel();
		}
		saveStatus = deps.autosave.status();
		if (!persisted) return;
		persisted = false;
		const discardedId = draftId;
		void deps.repository
			.delete(discardedId)
			.then(() => store.refreshDrafts())
			.catch(() => {
				feedback.announce('Local storage could not be updated.');
			});
	}

	function scheduleSave(): void {
		const draft = draftFromSnapshot();

		// An empty document is not a draft. It has nothing to recover and shows up
		// as one more "Untitled draft" among the real ones, so it is never
		// written — and a draft emptied out gives up the record it had.
		if (draft.text.trim().length === 0) {
			discardEmptyDraft();
			return;
		}

		deps.autosave.schedule({ revision: bindings.snapshot.revision, draft });
		if (!persisted) {
			// The first text is what creates the record, so it is also what makes
			// this the draft a reload comes back to.
			persisted = true;
			void deps.repository.setCurrent(draftId).catch(() => {});
		}
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

	function rememberLanguage(nextLanguage: string): void {
		recentLanguages = prependRecentLanguage(recentLanguages, nextLanguage);
		void deps.repository.rememberLanguage(nextLanguage).catch(() => {
			feedback.announce('Recent languages could not be saved locally.');
		});
	}

	/** `isPersisted` is false for a draft that exists only in memory so far. */
	function loadDraft(nextDraft: DraftRecord, isPersisted: boolean): void {
		persisted = isPersisted;
		draftId = nextDraft.id;
		title = nextDraft.title;
		language = nextDraft.language;
		rememberLanguage(nextDraft.language);
		createdAt = nextDraft.createdAt;
		originalText = nextDraft.originalText;
		bindings.onDraftLoaded(nextDraft);
	}

	function emptyTransientDraft(): DraftRecord {
		const timestamp = deps.now();
		return {
			id: deps.idFactory(),
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

	const store: DraftStore = {
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
		get drafts() {
			return drafts;
		},
		get saveStatus() {
			return saveStatus;
		},
		draftFromSnapshot,
		scheduleSave,
		setSaveStatus(status) {
			saveStatus = status;
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
		},
		async setTitle(nextTitle) {
			const trimmed = nextTitle.trim() || 'Untitled draft';
			title = trimmed;
			// An empty draft has no record to rename. The title rides along with the
			// first save that gives it one.
			if (!persisted) return;
			try {
				await deps.repository.rename(draftId, trimmed);
				scheduleSave();
				await store.refreshDrafts();
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
		async refreshDrafts() {
			drafts = await deps.repository.list();
		},
		async createDraft() {
			await deps.autosave.flush();
			// Nothing is written here. A new draft is empty by definition, and the
			// first save with text in it is what creates the record and takes over
			// the current-draft pointer — so a new draft abandoned untouched leaves
			// nothing behind, and a reload before the first keystroke comes back to
			// the draft that still has the user's work in it.
			loadDraft(emptyTransientDraft(), false);
			await store.refreshDrafts();
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
			loadDraft(draft, true);
			await store.refreshDrafts();
			feedback.announce(`Opened ${draft.title}.`);
		},
		async renameDraft(id, nextTitle) {
			const trimmed = nextTitle.trim() || 'Untitled draft';
			if (id === draftId && !persisted) {
				// Same as `setTitle`: an empty draft has no record to rename yet.
				title = trimmed;
				feedback.announce(`Renamed draft to ${trimmed}.`);
				return;
			}
			await deps.repository.rename(id, trimmed);
			if (id === draftId) {
				title = trimmed;
				scheduleSave();
			}
			await store.refreshDrafts();
			feedback.announce(`Renamed draft to ${trimmed}.`);
		},
		async duplicateDraft(id) {
			await deps.autosave.flush();
			const duplicate = await deps.repository.duplicate(id, deps.idFactory());
			await store.refreshDrafts();
			feedback.announce(`Duplicated ${duplicate.title.replace(/ copy$/, '')}.`);
		},
		async exportDraft(id = draftId) {
			const draft = id === draftId ? draftFromSnapshot() : await deps.repository.get(id);
			if (!draft) {
				feedback.announce('That draft could not be exported.');
				return;
			}
			deps.exportText(draft.text, safeFilename(draft.title));
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
					loadDraft(next, true);
				} else {
					loadDraft(emptyTransientDraft(), false);
				}
			}
			await store.refreshDrafts();
			feedback.announce(`Deleted ${deleted?.title ?? 'draft'}.`);
		},
		async deleteAllDrafts() {
			deps.autosave.cancel();
			await deps.repository.deleteAll();
			drafts = [];
			loadDraft(emptyTransientDraft(), false);
			feedback.announce('All local drafts deleted.');
		}
	};

	// The seeded list already leads with the opened draft's language; this call
	// is what persists it for the next session.
	rememberLanguage(deps.initialDraft.language);

	return store;
}

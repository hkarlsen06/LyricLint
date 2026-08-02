import { copySectionLinks } from '$lib/persistence/copy.js';
import type {
	AutosaveController,
	AutosaveStatus,
	DraftRecord,
	LineAnchor,
	DraftRepository,
	DraftSummary,
	EditorSnapshot,
	PerformerRecord,
	RuleSetManifest,
	SectionLink
} from '$lib/core/types.js';
import type { FeedbackState } from './feedback.svelte.js';
import { cloneRoster } from './roster-store.svelte.js';
import { DEFAULT_DRAFT_TITLE } from '$lib/persistence/draft-repository.js';

const maxRecentLanguages = 5;

/**
 * A draft's title as a filename, with whatever extension the export wants —
 * one sanitiser for all of them, because a second copy is one edit away from
 * disagreeing about which characters a disk will take.
 */
export function safeFilename(title: string, extension = 'txt'): string {
	const withoutControls = [...title.trim()]
		.map((character) => (character.charCodeAt(0) < 32 ? '_' : character))
		.join('');
	const filename = withoutControls.replace(/[<>:"/\\|?*]/g, '_') || DEFAULT_DRAFT_TITLE;
	return `${filename}.${extension}`;
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
	/** The editor's live anchors, saved with the text they describe. */
	readonly lineAnchors: readonly LineAnchor[];
	/** The editor's live section links, saved with the sections they tie together. */
	readonly sectionLinks: readonly SectionLink[];
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
	/**
	 * Whether this draft has audio attached, and therefore something to recover
	 * even with no words in it.
	 *
	 * "An empty document is not a draft" is right about text and wrong about a
	 * song: choosing what a draft is transcribed *from* is deliberate work, and
	 * without this it was thrown away on reload — the media record kept pointing
	 * at a transient id that no draft would ever carry again.
	 */
	hasAttachment?: () => boolean;
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
	/**
	 * Give a wordless draft a record anyway, because something other than its
	 * text is now worth keeping. Attaching audio is the one caller.
	 */
	keepDraft(): void;
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
	// Whether a save has been scheduled since the list was last re-read. See
	// `noteSaveStatus`.
	let sawPendingSave = false;
	// Whether this draft has a record in the repository. A draft with no text
	// never does — see `scheduleSave` — so blankness and persistence track each
	// other, and startup recovery has already swept any blank record an older
	// build left behind.
	let persisted = deps.initialDraft.text.trim().length > 0;

	const feedback = deps.feedback;
	const bindings = deps.bindings;

	/**
	 * A refused draft operation draws a toast *and* announces. The toast region
	 * is not a live region and the live region draws nothing, so either alone
	 * loses an audience — the same split `report` makes in the editor session.
	 * Successes keep announcing only: the change on screen is the confirmation.
	 */
	function reportFailure(message: string): void {
		feedback.announce(message);
		feedback.addToast({ message });
	}

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
			lineAnchors: bindings.lineAnchors.map((anchor) => ({ ...anchor })),
			sectionLinks: copySectionLinks(bindings.sectionLinks),
			...(originalText === undefined ? {} : { originalText })
		};
	}

	/**
	 * Take a save status, and re-read the drafts list whenever a save has landed.
	 *
	 * **A landed save is what puts a draft in the list.** The list was otherwise
	 * read once at boot and then only by the operations that change it, so a
	 * draft's *first* save — the one that creates its record — left `drafts` at
	 * the empty value it booted with, and the menu went on saying "No saved
	 * 'scribes yet. This one will appear after its first local save" over a
	 * record already on disk, for the rest of the session. That is the only
	 * question that menu exists to answer, and the toolbar deliberately draws
	 * nothing while saving is going well, so it was the only answer on screen and
	 * it was the wrong one.
	 *
	 * **Every landed save, not only the first.** The row carries the draft's own
	 * `updatedAt` and the list is ordered by it, so a list re-read once would go
	 * on reporting `Yesterday` under a draft being typed into now — the same lie
	 * with a smaller radius.
	 *
	 * `sawPendingSave` is what keeps that to one read per save rather than one
	 * per report: a settle is heard twice, once from this store's own poll and
	 * once from the autosave controller's `onStatusChange`, which the page wires
	 * to `setSaveStatus`. A status that has not passed through a pending state
	 * since the last read has nothing new to show.
	 *
	 * A failed read is silent. The list simply stays as it was, and a message
	 * about a menu nobody has opened is noise.
	 */
	function noteSaveStatus(status: AutosaveStatus): void {
		saveStatus = status;
		if (status === 'scheduled' || status === 'saving') {
			sawPendingSave = true;
			return;
		}
		if (status !== 'saved' || !sawPendingSave) return;
		sawPendingSave = false;
		void store.refreshDrafts().catch(() => {});
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
		noteSaveStatus(deps.autosave.status());
		if (!persisted) return;
		persisted = false;
		const discardedId = draftId;
		void deps.repository
			.delete(discardedId)
			.then(() => store.refreshDrafts())
			.catch(() => {
				reportFailure('Local storage could not be updated.');
			});
	}

	function scheduleSave(keepEmpty = false): void {
		const draft = draftFromSnapshot();

		// An empty document is not a draft. It has nothing to recover and shows up
		// as one more "Untitled transcription" among the real ones, so it is never
		// written — and a draft emptied out gives up the record it had.
		//
		// Attached audio is the exception, and it has to be checked on *every*
		// save rather than only at the moment of attaching: the document is still
		// wordless on the next snapshot, so without this the draft the attachment
		// just created would be discarded again a keystroke later.
		if (draft.text.trim().length === 0 && !keepEmpty && !(deps.hasAttachment?.() ?? false)) {
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
		noteSaveStatus(deps.autosave.status());
		if (statusRefreshTimer) clearTimeout(statusRefreshTimer);
		const refreshStatus = () => {
			noteSaveStatus(deps.autosave.status());
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
			title: DEFAULT_DRAFT_TITLE,
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
		scheduleSave: () => scheduleSave(),
		keepDraft: () => scheduleSave(true),
		setSaveStatus(status) {
			noteSaveStatus(status);
		},
		async flushAutosave() {
			noteSaveStatus('saving');
			try {
				await deps.autosave.flush();
				noteSaveStatus(deps.autosave.status());
			} catch {
				noteSaveStatus('failed');
				reportFailure('Local save failed. Keep this tab open and try again.');
			}
		},
		async setTitle(nextTitle) {
			const trimmed = nextTitle.trim() || DEFAULT_DRAFT_TITLE;
			title = trimmed;
			// An empty draft has no record to rename. The title rides along with the
			// first save that gives it one.
			if (!persisted) return;
			try {
				await deps.repository.rename(draftId, trimmed);
				scheduleSave();
				await store.refreshDrafts();
			} catch {
				noteSaveStatus('failed');
				reportFailure("'Scribe title could not be saved locally.");
			}
		},
		setLanguage(nextLanguage) {
			language = nextLanguage;
			rememberLanguage(nextLanguage);
			scheduleSave();
		},
		async refreshDrafts() {
			// A failed read is deliberately quiet: the list simply stays as it was,
			// and a message about a menu nobody has opened is noise. Not rejecting
			// also keeps an operation that already landed — a delete, a rename —
			// from reading as failed because the re-read after it did.
			try {
				drafts = await deps.repository.list();
			} catch {
				// Keep the previous list.
			}
		},
		async createDraft() {
			try {
				await deps.autosave.flush();
			} catch {
				// Swapping to a fresh draft over a failed flush would abandon the
				// unsaved work; keep the user where their words still are.
				noteSaveStatus('failed');
				reportFailure('Local save failed. Keep this tab open and try again.');
				return;
			}
			// Nothing is written here. A new draft is empty by definition, and the
			// first save with text in it is what creates the record and takes over
			// the current-draft pointer — so a new draft abandoned untouched leaves
			// nothing behind, and a reload before the first keystroke comes back to
			// the draft that still has the user's work in it.
			loadDraft(emptyTransientDraft(), false);
			await store.refreshDrafts();
			feedback.announce("New 'scribe created.");
		},
		async openDraft(id) {
			try {
				await deps.autosave.flush();
				if (id === draftId) return;
				const draft = await deps.repository.get(id);
				if (!draft) {
					feedback.announce("That 'scribe is no longer available.");
					return;
				}
				await deps.repository.setCurrent(id);
				loadDraft(draft, true);
				await store.refreshDrafts();
				feedback.announce(`Opened ${draft.title}.`);
			} catch {
				reportFailure("That 'scribe could not be opened.");
			}
		},
		async renameDraft(id, nextTitle) {
			const trimmed = nextTitle.trim() || DEFAULT_DRAFT_TITLE;
			if (id === draftId && !persisted) {
				// Same as `setTitle`: an empty draft has no record to rename yet.
				title = trimmed;
				feedback.announce(`Renamed 'scribe to ${trimmed}.`);
				return;
			}
			try {
				await deps.repository.rename(id, trimmed);
			} catch {
				reportFailure("'Scribe title could not be saved locally.");
				return;
			}
			if (id === draftId) {
				title = trimmed;
				scheduleSave();
			}
			await store.refreshDrafts();
			feedback.announce(`Renamed 'scribe to ${trimmed}.`);
		},
		async duplicateDraft(id) {
			try {
				await deps.autosave.flush();
				const duplicate = await deps.repository.duplicate(id, deps.idFactory());
				await store.refreshDrafts();
				feedback.announce(`Duplicated ${duplicate.title.replace(/ copy$/, '')}.`);
			} catch {
				reportFailure("The 'scribe could not be duplicated.");
			}
		},
		async exportDraft(id = draftId) {
			let draft: DraftRecord | undefined;
			try {
				draft = id === draftId ? draftFromSnapshot() : await deps.repository.get(id);
			} catch {
				draft = undefined;
			}
			if (!draft) {
				reportFailure("That 'scribe could not be exported.");
				return;
			}
			deps.exportText(draft.text, safeFilename(draft.title));
			feedback.announce(`Exported ${draft.title} as UTF-8 text.`);
		},
		async deleteDraft(id) {
			try {
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
				feedback.announce(`Deleted ${deleted?.title ?? "'scribe"}.`);
			} catch {
				reportFailure("The 'scribe could not be deleted.");
			}
		},
		async deleteAllDrafts() {
			try {
				deps.autosave.cancel();
				await deps.repository.deleteAll();
				drafts = [];
				loadDraft(emptyTransientDraft(), false);
				feedback.announce("All local 'scribes deleted.");
			} catch {
				reportFailure("Local 'scribes could not be deleted.");
			}
		}
	};

	// The seeded list already leads with the opened draft's language; this call
	// is what persists it for the next session.
	rememberLanguage(deps.initialDraft.language);

	return store;
}

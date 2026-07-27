import type {
	AutosaveController,
	AutosaveSnapshot,
	DraftRecord,
	DraftRepository,
	DraftSummary,
	SessionIgnoreStore
} from '$lib/core/types.js';
import type {
	MediaHandleRecord,
	MediaRepository,
	SessionStorageLike
} from '$lib/persistence/index.js';

function cloneDraft(draft: DraftRecord): DraftRecord {
	return {
		...draft,
		performers: draft.performers.map((performer) => ({
			...performer,
			aliases: [...performer.aliases]
		})),
		editorSelection: draft.editorSelection ? { ...draft.editorSelection } : undefined
	};
}

function toSummary(draft: DraftRecord): DraftSummary {
	return {
		id: draft.id,
		title: draft.title,
		language: draft.language,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt
	};
}

export function createInMemoryDraftRepository(
	initialDrafts: readonly DraftRecord[] = []
): DraftRepository {
	const drafts = new Map(initialDrafts.map((draft) => [draft.id, cloneDraft(draft)]));
	let currentId: string | undefined = initialDrafts[0]?.id;
	let recentLanguages: string[] = [];
	const preferences = new Map<string, string>();

	return {
		async list() {
			return [...drafts.values()]
				.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
				.map(toSummary);
		},
		async get(id) {
			const draft = drafts.get(id);
			return draft ? cloneDraft(draft) : undefined;
		},
		async create(draft) {
			if (drafts.has(draft.id)) {
				throw new Error(`Draft ${draft.id} already exists.`);
			}
			const stored = cloneDraft(draft);
			drafts.set(stored.id, stored);
			return cloneDraft(stored);
		},
		async save(draft) {
			drafts.set(draft.id, cloneDraft(draft));
		},
		async rename(id, title) {
			const draft = drafts.get(id);
			if (!draft) throw new Error(`Draft ${id} was not found.`);
			drafts.set(id, { ...draft, title });
		},
		async duplicate(id, newId) {
			const source = drafts.get(id);
			if (!source) throw new Error(`Draft ${id} was not found.`);
			const now = new Date().toISOString();
			const duplicate = {
				...cloneDraft(source),
				id: newId,
				title: `${source.title} copy`,
				createdAt: now,
				updatedAt: now
			};
			drafts.set(newId, duplicate);
			return cloneDraft(duplicate);
		},
		async delete(id) {
			drafts.delete(id);
			if (currentId === id) currentId = undefined;
		},
		async deleteAll() {
			drafts.clear();
			currentId = undefined;
		},
		async setCurrent(id) {
			currentId = id;
		},
		async getCurrent() {
			return currentId;
		},
		async getPreference(key) {
			return preferences.get(key);
		},
		async setPreference(key, value) {
			preferences.set(key, value);
		},
		async getRecentLanguages() {
			return [...recentLanguages];
		},
		async rememberLanguage(language) {
			const normalized = language.trim();
			if (!normalized) return;
			recentLanguages = [
				normalized,
				...recentLanguages.filter((candidate) => candidate !== normalized)
			].slice(0, 5);
		}
	};
}

/**
 * Attached-audio storage with no IndexedDB behind it.
 *
 * Tests and the contract harness use this; nothing here holds a real file
 * handle, which is exactly right — the browser is the only thing that can mint
 * one, so a fake that pretended to would be testing itself.
 */
export function createInMemoryMediaRepository(
	initialRecords: readonly MediaHandleRecord[] = []
): MediaRepository {
	const records = new Map(initialRecords.map((record) => [record.draftId, { ...record }]));

	return {
		async get(draftId) {
			const record = records.get(draftId);
			return record ? { ...record } : undefined;
		},
		/**
		 * Spread, never destructured field by field.
		 *
		 * This used to list the fields it kept, and it silently dropped `trackId`
		 * the day a third source was added — a test double that quietly loses a
		 * field is worse than no double at all, because it makes the suite agree
		 * with the bug. The real repository has to enumerate (it stamps
		 * `attachedAt` and Dexie wants a clean record); this one has no such
		 * excuse.
		 */
		async attach({ draftId, ...rest }) {
			const record: MediaHandleRecord = {
				draftId,
				attachedAt: new Date().toISOString(),
				...rest
			};
			records.set(draftId, record);
			return { ...record };
		},
		async savePosition(draftId, position) {
			const record = records.get(draftId);
			if (!record) return;
			records.set(draftId, { ...record, position });
		},
		async saveName(draftId, name) {
			const record = records.get(draftId);
			if (!record) return;
			records.set(draftId, { ...record, name });
		},
		async detach(draftId) {
			records.delete(draftId);
		},
		async clear() {
			records.clear();
		}
	};
}

export function createInMemoryAutosaveController(
	repository: DraftRepository,
	options: {
		debounceMs?: number;
		onStatusChange?: (status: ReturnType<AutosaveController['status']>) => void;
	} = {}
): AutosaveController {
	let pending: AutosaveSnapshot | undefined;
	let latestSavedRevision = -1;
	let currentStatus: ReturnType<AutosaveController['status']> = 'idle';
	let timer: ReturnType<typeof setTimeout> | undefined;

	function setStatus(status: ReturnType<AutosaveController['status']>): void {
		currentStatus = status;
		options.onStatusChange?.(status);
	}

	const controller: AutosaveController = {
		schedule(snapshot) {
			if (!pending || snapshot.revision >= pending.revision) pending = snapshot;
			setStatus('scheduled');
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = undefined;
				void controller.flush();
			}, options.debounceMs ?? 150);
		},
		async flush() {
			if (timer) {
				clearTimeout(timer);
				timer = undefined;
			}
			const snapshot = pending;
			if (!snapshot || snapshot.revision < latestSavedRevision) return;
			setStatus('saving');
			try {
				await repository.save(snapshot.draft);
				latestSavedRevision = snapshot.revision;
				if (pending?.revision === snapshot.revision) pending = undefined;
				setStatus('saved');
			} catch (error) {
				setStatus('failed');
				throw error;
			}
		},
		cancel() {
			if (timer) clearTimeout(timer);
			timer = undefined;
			pending = undefined;
			setStatus('idle');
		},
		status() {
			return currentStatus;
		}
	};
	return controller;
}

export function createMemorySessionStorage(): SessionStorageLike {
	const entries = new Map<string, string>();
	return {
		get length() {
			return entries.size;
		},
		key(index) {
			return Array.from(entries.keys())[index] ?? null;
		},
		getItem(key) {
			return entries.get(key) ?? null;
		},
		setItem(key, value) {
			entries.set(key, value);
		},
		removeItem(key) {
			entries.delete(key);
		}
	};
}

export function createContractSessionIgnoreStore(storage: SessionStorageLike): SessionIgnoreStore {
	const key = (draftId: string) => `lyriclint:ignored-diagnostics:${draftId}`;

	function read(draftId: string): string[] {
		const raw = storage.getItem(key(draftId));
		if (!raw) return [];
		try {
			const value: unknown = JSON.parse(raw);
			return Array.isArray(value)
				? value.filter((ruleId): ruleId is string => typeof ruleId === 'string')
				: [];
		} catch {
			return [];
		}
	}

	function write(draftId: string, diagnosticKeys: readonly string[]): void {
		if (diagnosticKeys.length === 0) {
			storage.removeItem(key(draftId));
			return;
		}
		storage.setItem(key(draftId), JSON.stringify([...new Set(diagnosticKeys)].sort()));
	}

	return {
		isIgnored(draftId, diagnosticKey) {
			return read(draftId).includes(diagnosticKey);
		},
		ignore(draftId, diagnosticKey) {
			write(draftId, [...read(draftId), diagnosticKey]);
		},
		restore(draftId, diagnosticKey) {
			write(
				draftId,
				read(draftId).filter((candidate) => candidate !== diagnosticKey)
			);
		},
		list(draftId) {
			return read(draftId);
		},
		clearDraft(draftId) {
			storage.removeItem(key(draftId));
		}
	};
}

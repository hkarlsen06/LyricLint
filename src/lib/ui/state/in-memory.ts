import type {
	AutosaveController,
	AutosaveSnapshot,
	DraftRecord,
	DraftRepository,
	DraftSummary,
	SessionIgnoreStore
} from '$lib/core/types.js';
import type { SessionStorageLike } from '$lib/persistence/index.js';

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
	const key = (draftId: string) => `lyriclint:ignored-rules:${draftId}`;

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

	function write(draftId: string, rules: readonly string[]): void {
		if (rules.length === 0) {
			storage.removeItem(key(draftId));
			return;
		}
		storage.setItem(key(draftId), JSON.stringify([...new Set(rules)].sort()));
	}

	return {
		isIgnored(draftId, ruleId) {
			return read(draftId).includes(ruleId);
		},
		ignore(draftId, ruleId) {
			write(draftId, [...read(draftId), ruleId]);
		},
		restore(draftId, ruleId) {
			write(
				draftId,
				read(draftId).filter((candidate) => candidate !== ruleId)
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

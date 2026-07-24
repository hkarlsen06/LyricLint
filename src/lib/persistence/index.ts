import type {
	AutosaveController,
	DraftRecord,
	DraftRepository,
	SessionIgnoreStore
} from '../core/types.js';

/** Minimal storage surface required by session-scoped rule ignores. */
export interface SessionStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Timing hooks accepted by the revision-ordered autosave implementation. */
export interface AutosaveOptions {
	debounceMs?: number;
}

function persistenceWorker(): never {
	throw new Error('not implemented: persistence worker');
}

/** Create the serializable draft repository backed by the local database. */
export function createDraftRepository(): DraftRepository {
	return persistenceWorker();
}

/** Create a debounced controller whose flush always commits its newest revision. */
export function createAutosaveController(
	_repository: DraftRepository,
	_options: AutosaveOptions = {}
): AutosaveController {
	void _repository;
	void _options;
	return persistenceWorker();
}

/** Recover the current or newest draft, creating a blank one only when necessary. */
export function recoverStartupDraft(_repository: DraftRepository): Promise<DraftRecord> {
	void _repository;
	return persistenceWorker();
}

/** Create draft-and-rule keyed ignore state in the provided session storage. */
export function createSessionIgnoreStore(_storage: SessionStorageLike): SessionIgnoreStore {
	void _storage;
	return persistenceWorker();
}

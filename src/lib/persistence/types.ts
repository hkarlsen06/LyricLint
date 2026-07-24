import type {
	AppMetadataRecord,
	AutosaveController,
	AutosaveSnapshot,
	AutosaveStatus,
	DraftRecord,
	DraftRepository as CoreDraftRepository,
	DraftSummary,
	PerformerRecord,
	SerializedSelection,
	SessionIgnoreStore
} from '../core/types.js';

export type {
	AppMetadataRecord,
	AutosaveController,
	AutosaveSnapshot,
	AutosaveStatus,
	DraftRecord,
	DraftSummary,
	PerformerRecord,
	SerializedSelection,
	SessionIgnoreStore
};

/** Fields accepted when creating a new local draft. Missing fields receive local defaults. */
export type DraftCreateInput = Partial<DraftRecord>;

/**
 * The persistence implementation broadens the frozen repository contract by
 * accepting partial creates and generating duplicate IDs when one is omitted.
 */
export type DraftRepository = Omit<CoreDraftRepository, 'create' | 'duplicate'> & {
	create(draft: DraftCreateInput): Promise<DraftRecord>;
	duplicate(id: string, newId?: string): Promise<DraftRecord>;
};

/** Minimal browser-compatible storage surface used by session ignores. */
export interface SessionStorageLike {
	readonly length: number;
	getItem(key: string): string | null;
	key(index: number): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

/** Timing configuration for local autosave. */
export interface AutosaveOptions {
	debounceMs?: number;
	onStatusChange?(status: AutosaveStatus): void;
}

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
} from '$lib/core/types.js';

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
 * The audio a draft is transcribed from, remembered between sessions.
 *
 * `handle` is a `FileSystemFileHandle` where the browser has one, which is what
 * lets a reopened draft offer the same file back in a single press. Where it
 * does not (Firefox and Safari have no `showOpenFilePicker`), only `name` and
 * `size` survive, and reconnecting means picking the file again — so the type
 * carries the name whether or not it carries a handle, and nothing downstream
 * may assume a handle is present.
 *
 * A YouTube source is none of that: it is an eleven-character id and nothing
 * else. `source` is the discriminant, and it is **optional on purpose** —
 * every record written before YouTube existed is a local file, so absence reads
 * as `'file'` and the live `version(2)` table needs no migration and no new
 * index. The union is spelled out here rather than imported from the transport,
 * because persistence does not depend on the shell; `MediaSourceKind` in
 * `media-player.svelte.ts` is the same two words.
 */
export interface MediaHandleRecord {
	draftId: string;
	name: string;
	size?: number;
	/** Absent means `'file'`. */
	source?: 'file' | 'youtube' | 'spotify';
	/** The YouTube video id, and the whole of what a video source needs. */
	videoId?: string;
	/**
	 * The Spotify track id, and the whole of what that source needs.
	 *
	 * A field of its own rather than a reused `videoId`, because the two are
	 * different lengths and different alphabets and a record that mixed them up
	 * would fail as a 404 somewhere far from here.
	 */
	trackId?: string;
	/** Structured-cloneable, so Dexie stores it directly. Never serialized to JSON. */
	handle?: FileSystemFileHandle;
	/**
	 * Where the playhead was, in seconds.
	 *
	 * Transcription is not listening: a draft is left at the line being worked on
	 * and picked up there tomorrow, so coming back to 0:00 means scrubbing through
	 * a song already transcribed to find the place. Kept beside the file rather
	 * than on the draft for the same reason as everything else here — the draft
	 * record stays JSON.
	 */
	position?: number;
	attachedAt: string;
}

/** Browser-local capability for the workspace backup file. Never exported. */
export interface BackupHandleRecord {
	key: 'workspace';
	name: string;
	handle: FileSystemFileHandle;
	linkedAt: string;
}

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

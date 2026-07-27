import Dexie, { type EntityTable } from 'dexie';

import type {
	AppMetadataRecord,
	BackupHandleRecord,
	DraftRecord,
	MediaHandleRecord
} from './types.js';

export const DEFAULT_DATABASE_NAME = 'lyriclint';

/** Dexie schema for durable, browser-local LyricLint state. */
export class LyricLintDatabase extends Dexie {
	drafts!: EntityTable<DraftRecord, 'id'>;
	appMetadata!: EntityTable<AppMetadataRecord, 'key'>;
	/**
	 * The audio attached to a draft, as a file handle rather than as bytes.
	 *
	 * It is a table of its own and not a field on `DraftRecord` for two separate
	 * reasons, and both have to hold. A `FileSystemFileHandle` is structured
	 * cloneable but not JSON — putting one on the draft would break `exportDraft`
	 * and `copyDraft`, which walk the record field by field. And a draft's audio
	 * is a 60MB file: storing the bytes would spend the origin's whole quota on
	 * one song, so nothing here ever holds the audio itself.
	 */
	mediaHandles!: EntityTable<MediaHandleRecord, 'draftId'>;
	/** The user-granted destination for full-workspace autosaves. */
	backupHandles!: EntityTable<BackupHandleRecord, 'key'>;

	constructor(name = DEFAULT_DATABASE_NAME) {
		super(name);

		this.version(1).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key'
		});

		this.version(2).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key',
			mediaHandles: 'draftId'
		});

		this.version(3).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key',
			mediaHandles: 'draftId',
			backupHandles: 'key'
		});
	}
}

/** Open an isolated database instance. Passing a name is useful for tests. */
export async function openDatabase(name = DEFAULT_DATABASE_NAME): Promise<LyricLintDatabase> {
	const database = new LyricLintDatabase(name);
	await database.open();
	return database;
}

/** Close a database instance without deleting its durable contents. */
export function closeDatabase(database: LyricLintDatabase): void {
	database.close();
}

import Dexie, { type EntityTable } from 'dexie';

import type {
	AppMetadataRecord,
	AssistantChatRecord,
	AssistantMessageRecord,
	BackupHandleRecord,
	DraftIgnoreRecord,
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
	/**
	 * Rules-assistant conversations. Browser-local like everything else here:
	 * they are never uploaded anywhere, the workspace backup deliberately leaves
	 * them out (it is a transcription backup), and `Delete all local data`
	 * clears them along with the drafts.
	 */
	assistantChats!: EntityTable<AssistantChatRecord, 'id'>;
	assistantMessages!: EntityTable<AssistantMessageRecord, 'id'>;
	/**
	 * The diagnostics set aside per 'scribe. Durable for the same reason the
	 * playhead is: a decision made about this draft should be there when the
	 * draft comes back. `delete` and `deleteAll` clear it in their own
	 * transactions, exactly as they clear `mediaHandles`.
	 */
	draftIgnores!: EntityTable<DraftIgnoreRecord, 'draftId'>;

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

		this.version(4).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key',
			mediaHandles: 'draftId',
			backupHandles: 'key',
			assistantChats: 'id, updatedAt',
			assistantMessages: 'id, chatId, createdAt'
		});

		this.version(5).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key',
			mediaHandles: 'draftId',
			backupHandles: 'key',
			assistantChats: 'id, updatedAt',
			assistantMessages: 'id, chatId, createdAt',
			draftIgnores: 'draftId'
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

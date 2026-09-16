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
export type DatabaseStorageState = 'opening' | 'ready' | 'blocked' | 'version-changed';

/** Dexie schema for durable, browser-local LyricLint state. */
export class LyricLintDatabase extends Dexie {
	storageState: DatabaseStorageState = 'opening';
	private storageListeners = new Set<(state: DatabaseStorageState) => void>();

	subscribeStorageState(listener: (state: DatabaseStorageState) => void): () => void {
		this.storageListeners.add(listener);
		listener(this.storageState);
		return () => this.storageListeners.delete(listener);
	}

	private publishStorageState(state: DatabaseStorageState): void {
		this.storageState = state;
		for (const listener of this.storageListeners) listener(state);
	}
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

		// An older build must close before any rich record can be committed. With
		// the same schema number its field-by-field copier could erase the model.
		this.version(6)
			.stores({
				drafts: 'id, updatedAt',
				appMetadata: 'key',
				mediaHandles: 'draftId',
				backupHandles: 'key',
				assistantChats: 'id, updatedAt',
				assistantMessages: 'id, chatId, createdAt',
				draftIgnores: 'draftId',
				draftsV6: 'id, updatedAt',
				appMetadataV6: 'key',
				mediaHandlesV6: 'draftId',
				draftIgnoresV6: 'draftId'
			})
			.upgrade(async (transaction) => {
				// Dexie retries VersionError without a version, so an old bundle can
				// reopen a newer database. Physical stores, not a version number alone,
				// isolate rich drafts and their side records from its field-by-field writes.
				for (const name of ['drafts', 'appMetadata', 'mediaHandles', 'draftIgnores']) {
					const records = await transaction.table(name).toArray();
					if (records.length > 0) await transaction.table(`${name}V6`).bulkAdd(records);
				}
			});
		this.drafts = this.table('draftsV6');
		this.appMetadata = this.table('appMetadataV6');
		this.mediaHandles = this.table('mediaHandlesV6');
		this.draftIgnores = this.table('draftIgnoresV6');
		this.on('blocked', () => this.publishStorageState('blocked'));
		this.on('ready', () => this.publishStorageState('ready'));
		this.on('versionchange', () => {
			this.publishStorageState('version-changed');
			// Explicit close disables automatic reopening. Pending editor snapshots
			// remain in the autosave queue and fail visibly; they never reach a newer schema.
			this.close();
			// Stop Dexie's default versionchange handler: it closes again with
			// disableAutoOpen:false, undoing the explicit write barrier above.
			return false;
		});
	}
}

/** Open an isolated database instance. Passing a name is useful for tests. */
export async function openDatabase(
	name = DEFAULT_DATABASE_NAME,
	onStorageState?: (state: DatabaseStorageState) => void
): Promise<LyricLintDatabase> {
	const database = new LyricLintDatabase(name);
	if (onStorageState) database.subscribeStorageState(onStorageState);
	await database.open();
	return database;
}

/** Close a database instance without deleting its durable contents. */
export function closeDatabase(database: LyricLintDatabase): void {
	database.close();
}

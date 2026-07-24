import Dexie, { type EntityTable } from 'dexie';

import type { AppMetadataRecord, DraftRecord } from './types.js';

export const DEFAULT_DATABASE_NAME = 'lyriclint';

/** Dexie schema for durable, browser-local LyricLint state. */
export class LyricLintDatabase extends Dexie {
	drafts!: EntityTable<DraftRecord, 'id'>;
	appMetadata!: EntityTable<AppMetadataRecord, 'key'>;

	constructor(name = DEFAULT_DATABASE_NAME) {
		super(name);

		this.version(1).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key'
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

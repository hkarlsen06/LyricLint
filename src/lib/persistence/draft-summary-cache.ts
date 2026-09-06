import Dexie, { cmp, type ObservabilitySet } from 'dexie';
import type { LyricLintDatabase } from './database.js';
import { summarizeDraft } from './draft-summary.js';
import { mutatedKeys } from './mutation-keys.js';
import type { DraftSummary } from './types.js';

/** Derived metadata only. Every committed writer, including imports and other tabs, invalidates it. */
export function createDraftSummaryReader(
	database: LyricLintDatabase
): () => Promise<DraftSummary[]> {
	const table = `idb://${database.name}/drafts/`;
	const summaries = new Map<string, DraftSummary>();
	const changed = new Set<string>();
	let readAll = true;
	let subscribed = false;
	let reading: Promise<void> | undefined;

	function invalidate(parts: ObservabilitySet): void {
		if (!parts.all && !Object.keys(parts).some((part) => part.startsWith(table))) return;
		const keys = parts.all ? undefined : mutatedKeys(parts, table);
		if (keys === undefined) {
			readAll = true;
			changed.clear();
		} else {
			for (const key of keys) changed.add(key);
		}
	}

	async function refresh(): Promise<void> {
		while (readAll || changed.size > 0) {
			const full = readAll;
			const keys = [...changed];
			readAll = false;
			changed.clear();
			try {
				const records = full
					? await database.drafts.orderBy('updatedAt').reverse().toArray()
					: await database.drafts.bulkGet(keys);
				if (full) summaries.clear();
				else for (const key of keys) summaries.delete(key);
				for (const record of records) {
					// Match the updatedAt index: unreadable index keys never joined the old list.
					if (record && !Number.isNaN(cmp(record.updatedAt, record.updatedAt))) {
						summaries.set(record.id, summarizeDraft(record));
					}
				}
			} catch (error) {
				readAll = true;
				throw error;
			}
		}
	}

	database.on('close', () => {
		Dexie.on.storagemutated.unsubscribe(invalidate);
		subscribed = false;
		readAll = true;
		changed.clear();
		summaries.clear();
	});

	return async () => {
		if (!subscribed) {
			Dexie.on.storagemutated.subscribe(invalidate);
			subscribed = true;
		}
		reading ??= refresh().finally(() => {
			reading = undefined;
		});
		await reading;
		// A reverse index uses reverse primary-key order to break timestamp ties.
		return [...summaries.values()]
			.sort((left, right) => cmp(right.updatedAt, left.updatedAt) || cmp(right.id, left.id))
			.map((summary) => ({ ...summary }));
	};
}

import type { LyricLintDatabase } from './database.js';
import type { DraftIgnoreStore } from './types.js';

/**
 * Create the durable, draft-and-diagnostic keyed ignore store.
 *
 * Ignores used to live in `sessionStorage`, which made setting one aside a
 * decision the browser forgot with the tab — while the lyrics, the timings and
 * the links it was made about all came back. They live in the same database as
 * everything else now: a row per 'scribe, deleted inside the same transactions
 * that delete the 'scribe (`draft-repository.ts`), copied by the workspace
 * backup, and cleared by `Delete all local data`.
 *
 * The interface stays synchronous because every reader is — the panel filters
 * findings against it on every snapshot. So the factory hydrates an in-memory
 * mirror once, before the workbench exists to ask, and every write answers
 * from the mirror and persists behind it, the way preferences answer at once
 * and write after. A failed write costs the ignore its durability, not its
 * session — which is exactly what the store promised before.
 */
export async function createDraftIgnoreStore(
	database: LyricLintDatabase
): Promise<DraftIgnoreStore> {
	const rows = await database.draftIgnores.toArray();
	const ignores = new Map<string, Set<string>>(rows.map((row) => [row.draftId, new Set(row.keys)]));

	function persist(draftId: string): void {
		const keys = [...(ignores.get(draftId) ?? [])].sort();
		const write: Promise<unknown> =
			keys.length === 0
				? database.draftIgnores.delete(draftId)
				: database.draftIgnores.put({ draftId, keys, updatedAt: new Date().toISOString() });
		void write.catch(() => {
			// The mirror already answered; durability is retried by the next write.
		});
	}

	return {
		isIgnored(draftId, diagnosticKey) {
			return ignores.get(draftId)?.has(diagnosticKey) ?? false;
		},

		ignore(draftId, diagnosticKey) {
			const keys = ignores.get(draftId) ?? new Set<string>();
			keys.add(diagnosticKey);
			ignores.set(draftId, keys);
			persist(draftId);
		},

		restore(draftId, diagnosticKey) {
			ignores.get(draftId)?.delete(diagnosticKey);
			persist(draftId);
		},

		list(draftId) {
			return [...(ignores.get(draftId) ?? [])].sort();
		},

		clearDraft(draftId) {
			ignores.delete(draftId);
			persist(draftId);
		}
	};
}

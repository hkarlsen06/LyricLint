import type { LyricLintDatabase } from '$lib/persistence/database.js';

export const ASSISTANT_DRAFT_ACCESS_PREFIX = 'assistantDraftAccess:';

export type DraftAccessDecision = 'granted' | 'denied';

interface StoredDraftAccess {
	decision: DraftAccessDecision;
	decidedAt: string;
}

/** Shared with draft deletion so a draft cannot leave its permission behind. */
export function assistantDraftAccessKey(draftId: string): string {
	return `${ASSISTANT_DRAFT_ACCESS_PREFIX}${draftId}`;
}

function isStoredDraftAccess(value: unknown): value is StoredDraftAccess {
	if (typeof value !== 'object' || value === null) return false;
	if (!('decision' in value) || !('decidedAt' in value)) return false;
	if (value.decision !== 'granted' && value.decision !== 'denied') return false;
	return typeof value.decidedAt === 'string';
}

function parseDraftAccess(value: string | undefined): StoredDraftAccess | undefined {
	if (!value) return undefined;
	try {
		const parsed: unknown = JSON.parse(value);
		if (!isStoredDraftAccess(parsed)) return undefined;
		return { decision: parsed.decision, decidedAt: parsed.decidedAt };
	} catch {
		return undefined;
	}
}

async function withDatabase<T>(operation: (database: LyricLintDatabase) => Promise<T>): Promise<T> {
	// Permission storage is touched only after the assistant asks to read a
	// draft. Keep Dexie out of every page that merely provides the closed
	// assistant state; the operation is async already, so loading its database
	// implementation here changes no caller contract.
	const { closeDatabase, openDatabase } = await import('$lib/persistence/database.js');
	const database = await openDatabase();
	try {
		return await operation(database);
	} finally {
		closeDatabase(database);
	}
}

/** Read the persistent decision for one draft, if the user has made one. */
export async function getDraftAccess(draftId: string): Promise<DraftAccessDecision | undefined> {
	return await withDatabase(async (database) => {
		const record = await database.appMetadata.get(assistantDraftAccessKey(draftId));
		return parseDraftAccess(record?.value)?.decision;
	});
}

/** Remember either answer. A denial is a decision too and must not ask again. */
export async function setDraftAccess(
	draftId: string,
	decision: DraftAccessDecision
): Promise<void> {
	await withDatabase(async (database) => {
		const decidedAt = new Date().toISOString();
		await database.appMetadata.put({
			key: assistantDraftAccessKey(draftId),
			value: JSON.stringify({ decision, decidedAt } satisfies StoredDraftAccess),
			updatedAt: decidedAt
		});
	});
}

/** Revoke the stored answer so this draft asks again on its next read. */
export async function clearDraftAccess(draftId: string): Promise<void> {
	await withDatabase(async (database) => {
		await database.appMetadata.delete(assistantDraftAccessKey(draftId));
	});
}

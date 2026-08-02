import { closeDatabase, openDatabase, type LyricLintDatabase } from '$lib/persistence/database.js';

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

function parseDraftAccess(value: string | undefined): StoredDraftAccess | undefined {
	if (!value) return undefined;
	try {
		const parsed: unknown = JSON.parse(value);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('decision' in parsed) ||
			!('decidedAt' in parsed) ||
			(parsed.decision !== 'granted' && parsed.decision !== 'denied') ||
			typeof parsed.decidedAt !== 'string'
		) {
			return undefined;
		}
		return { decision: parsed.decision, decidedAt: parsed.decidedAt };
	} catch {
		return undefined;
	}
}

async function withDatabase<T>(operation: (database: LyricLintDatabase) => Promise<T>): Promise<T> {
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

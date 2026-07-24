import type { DraftRecord, DraftRepository } from './types.js';

/** Restore the current recoverable draft, then newest draft, then create blank. */
export async function recoverStartupDraft(repository: DraftRepository): Promise<DraftRecord> {
	const currentId = await repository.getCurrent();
	if (currentId !== undefined) {
		const current = await repository.get(currentId);
		if (current !== undefined) {
			return current;
		}
	}

	const drafts = await repository.list();
	for (const summary of drafts) {
		const draft = await repository.get(summary.id);
		if (draft !== undefined) {
			await repository.setCurrent(draft.id);
			return draft;
		}
	}

	const blank = await repository.create({});
	await repository.setCurrent(blank.id);
	return blank;
}

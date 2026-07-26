import { randomId } from '../core/random-id.js';
import type { DraftRecord, DraftRepository } from './types.js';

const DEFAULT_TITLE = 'Untitled draft';
const DEFAULT_LANGUAGE = 'en';

/**
 * A draft that exists only in memory. Nothing is written for it: a document
 * with no text has nothing to recover, and a record for it would come back as
 * one more row called "Untitled draft" in the drafts list. The first save with
 * something in it is what gives this draft a record (see the draft store).
 */
function blankDraft(): DraftRecord {
	const timestamp = new Date().toISOString();
	return {
		id: randomId(),
		title: DEFAULT_TITLE,
		text: '',
		language: DEFAULT_LANGUAGE,
		performers: [],
		createdAt: timestamp,
		updatedAt: timestamp,
		ruleSetVersion: '',
		editorSelection: { anchor: 0, head: 0 }
	};
}

/**
 * Restore the current recoverable draft, then the newest draft, then a blank
 * one that is not persisted.
 *
 * Blank records are swept on the way through. Earlier builds wrote one for
 * every new draft, so a session of "new draft, changed my mind" left the list
 * full of empty rows the user never wrote; they carry nothing to recover, so
 * startup is where they go.
 */
export async function recoverStartupDraft(repository: DraftRepository): Promise<DraftRecord> {
	const summaries = await repository.list();
	const recoverable: DraftRecord[] = [];
	for (const summary of summaries) {
		const draft = await repository.get(summary.id);
		if (draft === undefined) continue;
		if (draft.text.trim().length === 0) {
			await repository.delete(draft.id);
			continue;
		}
		recoverable.push(draft);
	}

	// `delete` drops the current-draft pointer when it names the deleted record,
	// so this reads whatever survived the sweep.
	const currentId = await repository.getCurrent();
	const current = recoverable.find((draft) => draft.id === currentId);
	if (current !== undefined) {
		return current;
	}

	// `list` is ordered newest first.
	const newest = recoverable[0];
	if (newest !== undefined) {
		await repository.setCurrent(newest.id);
		return newest;
	}

	await repository.setCurrent(undefined);
	return blankDraft();
}

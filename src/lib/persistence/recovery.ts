import { randomId } from '../core/random-id.js';
import type { MediaRepository } from './media-repository.js';
import type { DraftRecord, DraftRepository } from './types.js';
import { DEFAULT_DRAFT_TITLE } from './draft-repository.js';

const DEFAULT_TITLE = DEFAULT_DRAFT_TITLE;
const DEFAULT_LANGUAGE = 'en';

/** A stored row whose id and transcription really are the strings it claims. */
type ReadableDraft = DraftRecord & { id: string; text: string };

/**
 * A draft that exists only in memory. Nothing is written for it: a document
 * with no text has nothing to recover, and a record for it would come back as
 * one more row called "Untitled transcription" in the drafts list. The first save with
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
 * The two fields a draft cannot be guessed at without.
 *
 * `id` is how every later call names the record, and `text` is the
 * transcription itself — a draft with no text is not a draft to invent one for,
 * and one with no id has nothing the current-draft pointer, the media table or
 * the ignore store could be keyed against. Everything else a record carries is
 * either optional already or defaulted by `copyDraft`, so a row that clears
 * this pair is a row worth recovering whatever else it is missing.
 *
 * A predicate rather than a plain boolean because the record's type is what a
 * row was written as, not what came back: a database somebody else's build —
 * or a failed write — left a half-row in hands back a `DraftRecord` whose id
 * and text are whatever IndexedDB stored, so the check is the only thing that
 * makes the declared type true.
 */
function isReadableDraft(draft: DraftRecord): draft is ReadableDraft {
	return typeof draft.id === 'string' && draft.id.length > 0 && typeof draft.text === 'string';
}

/**
 * Restore the current recoverable draft, then the newest draft, then a blank
 * one that is not persisted.
 *
 * Blank records are swept on the way through. Earlier builds wrote one for
 * every new draft, so a session of "new draft, changed my mind" left the list
 * full of empty rows the user never wrote; they carry nothing to recover, so
 * startup is where they go.
 *
 * A record that cannot be read is neither recovered nor swept. `listRecords`
 * has already left out the rows it could not copy at all; this drops the ones
 * that copied without carrying an id or the transcription itself, and neither
 * kind is deleted or repaired — deleting somebody's work because we could not
 * parse it is the worse failure by a long way. That covers the record the
 * current-draft pointer names as well: it simply never joins the recoverable
 * list, so the boot falls through to the newest draft exactly as it does for a
 * pointer at a record that is gone.
 */
export async function recoverStartupDraft(
	repository: DraftRepository,
	media?: Pick<MediaRepository, 'get'>
): Promise<DraftRecord> {
	// `listRecords` rather than a `list` followed by a `get` per row: this runs
	// before anything is on screen, and the whole record is what the sweep reads.
	const records = await repository.listRecords();
	const recoverable: DraftRecord[] = [];
	for (const draft of records) {
		if (!isReadableDraft(draft)) continue;
		// A draft with a song attached and no words yet is not one of the empty
		// rows this sweep exists to clear — it is a transcription about to start,
		// and deleting it takes the attachment with it, because `delete` clears
		// the media record in the same transaction.
		if (draft.text.trim().length === 0 && (await media?.get(draft.id)) === undefined) {
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

	// `listRecords` is ordered newest first.
	const newest = recoverable[0];
	if (newest !== undefined) {
		await repository.setCurrent(newest.id);
		return newest;
	}

	await repository.setCurrent(undefined);
	return blankDraft();
}

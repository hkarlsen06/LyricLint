import { newWriting, CREATION_PROFILE_PREFERENCE } from './writing.js';
import { randomId } from '../core/random-id.js';
import type { MediaRepository } from './media-repository.js';
import type { DraftRecord, DraftRepository } from './types.js';
import { DEFAULT_DRAFT_TITLE, textRecoveryTitle } from './draft-repository.js';
import { isReadableDraft } from './readable-draft.js';
import { hasConversionMetadata } from './conversion.js';

const DEFAULT_TITLE = DEFAULT_DRAFT_TITLE;
const DEFAULT_LANGUAGE = 'en';

/**
 * A draft that exists only in memory. Nothing is written for it: a document
 * with no text has nothing to recover, and a record for it would come back as
 * one more row called "Untitled transcription" in the drafts list. The first save with
 * something in it is what gives this draft a record (see the draft store).
 */
function blankDraft(
	profile: 'genius' | 'musixmatch',
	id = randomId(),
	language = DEFAULT_LANGUAGE
): DraftRecord {
	const timestamp = new Date().toISOString();
	return {
		writing: newWriting(profile),
		id,
		title: DEFAULT_TITLE,
		text: '',
		language,
		performers: [],
		createdAt: timestamp,
		updatedAt: timestamp,
		ruleSetVersion: '',
		editorSelection: { anchor: 0, head: 0 }
	};
}

/**
 * Restore the current recoverable draft, then a new draft the user opened and
 * has not written in yet, then the newest draft, then a blank one that is not
 * persisted.
 *
 * Blank records are swept on the way through. Earlier builds wrote one for
 * every new draft, so a session of "new draft, changed my mind" left the list
 * full of empty rows the user never wrote; they carry nothing to recover, so
 * startup is where they go.
 *
 * A record that cannot be read is neither recovered nor swept. `listRecords`
 * has already left out the rows it could not copy at all; this drops the ones
 * that copied without carrying an id or the transcription itself, and neither
 * kind is deleted or repaired: deleting somebody's work because we could not
 * parse it is the worse failure by a long way. That covers the record the
 * current-draft pointer names as well: it simply never joins the recoverable
 * list, so the boot falls through to the newest draft exactly as it does for a
 * pointer at a record that is gone.
 *
 * A text recovery is the stand-in made for such a record. When a later build
 * reads the record again, a stand-in nobody wrote in holds nothing its source
 * lacks, so it is removed here and its source opens in its place. One that was
 * edited, renamed or given performers is somebody's work and stays.
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
		// rows this sweep exists to clear. It is a transcription about to start,
		// and deleting it takes the attachment with it, because `delete` clears
		// the media record in the same transaction.
		if (
			draft.storageGeneration === undefined &&
			draft.text.trim().length === 0 &&
			!hasConversionMetadata(draft.conversion) &&
			draft.conversionRecovery === undefined &&
			draft.originalRecovery === undefined &&
			// Stored partial records can violate DraftRecord; preserve any nonempty link without trusting its runtime type.
			!(typeof draft.geniusUrl === 'string' && draft.geniusUrl.trim().length > 0) &&
			(await media?.get(draft.id)) === undefined
		) {
			if (repository.deleteIfUnchanged) {
				if (!(await repository.deleteIfUnchanged(draft.id, 0))) {
					const changed = await repository.get(draft.id);
					if (changed && isReadableDraft(changed)) recoverable.push(changed);
				}
			} else await repository.delete(draft.id);
			continue;
		}
		recoverable.push(draft);
	}

	const pointed = await repository.getCurrent();
	for (const copy of [...recoverable]) {
		const sourceId = (copy.conversionRecovery ?? copy.originalRecovery)?.localSourceDraftId;
		const source = sourceId ? recoverable.find((draft) => draft.id === sourceId) : undefined;
		if (
			!source ||
			source.conversionRecovery !== undefined ||
			source.originalRecovery !== undefined ||
			copy.text !== source.text ||
			copy.title !== textRecoveryTitle(source.title) ||
			copy.language !== source.language ||
			copy.performers.length > 0
		)
			continue;
		if (repository.deleteIfUnchanged) {
			if (!(await repository.deleteIfUnchanged(copy.id, copy.storageGeneration ?? 0))) continue;
		} else await repository.delete(copy.id);
		recoverable.splice(recoverable.indexOf(copy), 1);
		if (pointed === copy.id) await repository.setCurrent(source.id);
	}

	// `delete` drops the current-draft pointer when it names the deleted record,
	// so this reads whatever survived the sweeps.
	const currentId = await repository.getCurrent();
	const current = recoverable.find((draft) => draft.id === currentId);
	if (current !== undefined) {
		return current;
	}
	if (currentId !== undefined && repository.recoverUnreadable) {
		const recovery = await repository.recoverUnreadable(currentId).catch(() => undefined);
		if (recovery) {
			await repository.setCurrent(recovery.id);
			return recovery;
		}
	}

	const preference = await repository
		.getPreference(CREATION_PROFILE_PREFERENCE)
		.catch(() => undefined);
	const profile = preference === 'musixmatch' ? 'musixmatch' : 'genius';
	const unsavedId = await repository.getUnsavedCurrent();
	if (unsavedId !== undefined) {
		// The new draft took the language last in use, which is the most recent one.
		const [language] = await repository.getRecentLanguages().catch(() => []);
		return blankDraft(profile, unsavedId, language);
	}

	// `listRecords` is ordered newest first.
	const newest = recoverable[0];
	if (newest !== undefined) {
		await repository.setCurrent(newest.id);
		return newest;
	}

	await repository.setCurrent(undefined);
	return blankDraft(profile);
}

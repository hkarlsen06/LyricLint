import type { DraftRecord } from './types.js';

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
export function isReadableDraft(
	draft: DraftRecord
): draft is DraftRecord & { id: string; text: string } {
	return typeof draft.id === 'string' && draft.id.length > 0 && typeof draft.text === 'string';
}

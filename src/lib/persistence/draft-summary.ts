// Decision record: docs/subsystems/drafts.md — summary metadata is derived, never persisted.
import { isLyricLine } from '../core/parser.js';
import type { DraftRecord, DraftSummary } from '../core/types.js';
import { isReadableDraft } from './readable-draft.js';

/** Both repositories expose the same bounded lyric opening without a second record field. */
export function summarizeDraft(draft: DraftRecord): DraftSummary {
	const opening = isReadableDraft(draft)
		? draft.text
				.split(/\r?\n/u)
				.find((line) => isLyricLine(line))
				?.trim()
				.replace(/\s+/gu, ' ')
		: undefined;
	const characters = Array.from(opening ?? '');
	const lyricPreview = characters.length > 96 ? `${characters.slice(0, 96).join('')}…` : opening;
	const summary: DraftSummary = {
		id: draft.id,
		title: draft.title,
		language: draft.language,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt
	};
	if (lyricPreview) summary.lyricPreview = lyricPreview;
	return summary;
}

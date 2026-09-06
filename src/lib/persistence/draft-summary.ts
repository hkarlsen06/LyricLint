// Decision record: docs/subsystems/drafts.md — summary metadata is derived, never persisted.
import { parseDocument } from '../core/parser.js';
import type { DraftRecord, DraftSummary } from '../core/types.js';
import { DEFAULT_DRAFT_TITLE } from './draft-defaults.js';
import { isReadableDraft } from './readable-draft.js';

function isUsableDraftTitle(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

/** Both repositories expose the same bounded lyric opening without a second record field. */
export function summarizeDraft(draft: DraftRecord): DraftSummary {
	const opening = isReadableDraft(draft)
		? parseDocument(draft.text)
				.sections.flatMap((section) => section.lines)[0]
				?.text.trim()
				.replace(/\s+/gu, ' ')
		: undefined;
	const characters = Array.from(opening ?? '');
	const lyricPreview = characters.length > 96 ? `${characters.slice(0, 96).join('')}…` : opening;
	const summary: DraftSummary = {
		id: draft.id,
		title: isUsableDraftTitle(draft.title) ? draft.title : DEFAULT_DRAFT_TITLE,
		language: draft.language,
		createdAt: draft.createdAt,
		updatedAt: draft.updatedAt
	};
	if (lyricPreview) summary.lyricPreview = lyricPreview;
	return summary;
}

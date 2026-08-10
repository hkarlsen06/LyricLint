import { randomId } from '../core/random-id.js';
import { assistantDraftAccessKey } from '../assistant/permissions.js';
import { copyCompareBaseline, copySectionLinks } from './copy.js';
import type { AppMetadataRecord, DraftCreateInput, DraftRecord, DraftRepository } from './types.js';
import type { LyricLintDatabase } from './database.js';

const CURRENT_DRAFT_KEY = 'currentDraftId';
const RECENT_LANGUAGES_KEY = 'recentLanguages';

/**
 * Preferences share the metadata table with the keys above, so they are
 * namespaced rather than trusted not to collide: this is a generic setter, and
 * a caller passing `currentDraft` would otherwise overwrite the pointer to the
 * draft the user is in.
 */
function preferenceKey(key: string): string {
	return `preference:${key}`;
}
const MAX_RECENT_LANGUAGES = 5;

/**
 * What a draft is called before anything has named it.
 *
 * Exported because it is a value three other modules compare against rather than
 * merely write: the startup sweep, the draft store's own fallback, and the
 * workbench's rule about letting an attached song name an untouched draft. It
 * had been spelled out by hand in each of them, which is one edit away from a
 * rule that silently stops matching.
 */
export const DEFAULT_DRAFT_TITLE = 'Untitled transcription';
const DEFAULT_TITLE = DEFAULT_DRAFT_TITLE;
const DEFAULT_LANGUAGE = 'en';

function now(): string {
	return new Date().toISOString();
}

function copyDraft(record: DraftRecord): DraftRecord {
	const copy: DraftRecord = {
		id: record.id,
		title: record.title,
		text: record.text,
		language: record.language,
		performers: record.performers.map((performer) => ({
			id: performer.id,
			displayName: performer.displayName,
			normalizedKey: performer.normalizedKey,
			aliases: [...performer.aliases],
			colorId: performer.colorId,
			order: performer.order
		})),
		createdAt: record.createdAt,
		updatedAt: record.updatedAt,
		ruleSetVersion: record.ruleSetVersion
	};

	if (record.originalText !== undefined) {
		copy.originalText = record.originalText;
	}

	if (record.editorSelection !== undefined) {
		copy.editorSelection = {
			anchor: record.editorSelection.anchor,
			head: record.editorSelection.head
		};
	}

	if (record.lineAnchors !== undefined) {
		copy.lineAnchors = record.lineAnchors.map((anchor) => ({
			line: anchor.line,
			time: anchor.time
		}));
	}

	if (record.sectionLinks !== undefined) {
		copy.sectionLinks = copySectionLinks(record.sectionLinks);
	}

	if (record.compareBaseline !== undefined) {
		copy.compareBaseline = copyCompareBaseline(record.compareBaseline);
	}

	return copy;
}

function createRecord(input: DraftCreateInput): DraftRecord {
	const timestamp = now();
	const record: DraftRecord = {
		id: input.id ?? randomId(),
		title: input.title ?? DEFAULT_TITLE,
		text: input.text ?? '',
		language: input.language ?? DEFAULT_LANGUAGE,
		performers: input.performers ?? [],
		createdAt: input.createdAt ?? timestamp,
		updatedAt: input.updatedAt ?? timestamp,
		ruleSetVersion: input.ruleSetVersion ?? ''
	};

	if (input.originalText !== undefined) {
		record.originalText = input.originalText;
	}

	if (input.editorSelection !== undefined) {
		record.editorSelection = input.editorSelection;
	}

	if (input.lineAnchors !== undefined) {
		record.lineAnchors = input.lineAnchors;
	}

	if (input.sectionLinks !== undefined) {
		record.sectionLinks = copySectionLinks(input.sectionLinks);
	}

	if (input.compareBaseline !== undefined) {
		record.compareBaseline = copyCompareBaseline(input.compareBaseline);
	}

	return copyDraft(record);
}

function currentDraftMetadata(id: string): AppMetadataRecord {
	return {
		key: CURRENT_DRAFT_KEY,
		value: id,
		updatedAt: now()
	};
}

function parseRecentLanguages(value: string | undefined): string[] {
	if (!value) return [];
	try {
		const parsed: unknown = JSON.parse(value);
		if (!Array.isArray(parsed)) return [];
		return [
			...new Set(
				parsed.flatMap((language) =>
					typeof language === 'string' && language.trim().length > 0 ? [language.trim()] : []
				)
			)
		].slice(0, MAX_RECENT_LANGUAGES);
	} catch {
		return [];
	}
}

/** Create a serializable draft repository backed by the supplied Dexie database. */
export function createDraftRepository(database: LyricLintDatabase): DraftRepository {
	return {
		async list() {
			const records = await database.drafts.orderBy('updatedAt').reverse().toArray();
			return records.map(({ id, title, language, createdAt, updatedAt }) => ({
				id,
				title,
				language,
				createdAt,
				updatedAt
			}));
		},

		async get(id) {
			const record = await database.drafts.get(id);
			return record === undefined ? undefined : copyDraft(record);
		},

		async create(input) {
			const record = createRecord(input);
			await database.drafts.add(record);
			return copyDraft(record);
		},

		async save(input) {
			await database.transaction('rw', database.drafts, async () => {
				const existing = await database.drafts.get(input.id);
				const record = copyDraft(input);

				if (existing !== undefined) {
					record.createdAt = existing.createdAt;
					if (existing.originalText !== undefined) {
						record.originalText = existing.originalText;
					}
				}

				await database.drafts.put(record);
			});
		},

		async rename(id, title) {
			await database.drafts.where('id').equals(id).modify({ title, updatedAt: now() });
		},

		async duplicate(id, newId = randomId()) {
			const source = await database.drafts.get(id);
			if (source === undefined) {
				throw new Error("'Scribe not found.");
			}

			const timestamp = now();
			const duplicate = copyDraft({
				...source,
				id: newId,
				createdAt: timestamp,
				updatedAt: timestamp
			});
			await database.drafts.add(duplicate);
			return copyDraft(duplicate);
		},

		// Deleting a draft takes its attached audio, its ignored diagnostics and its
		// assistant permission with it, here rather than in the caller. A cleanup
		// promise kept by every call site remembering to make a second call is one
		// that will eventually be broken.
		async delete(id) {
			await database.transaction(
				'rw',
				database.drafts,
				database.appMetadata,
				database.mediaHandles,
				database.draftIgnores,
				async () => {
					await database.drafts.delete(id);
					await database.mediaHandles.delete(id);
					await database.draftIgnores.delete(id);
					await database.appMetadata.delete(assistantDraftAccessKey(id));
					const current = await database.appMetadata.get(CURRENT_DRAFT_KEY);
					if (current?.value === id) {
						await database.appMetadata.delete(CURRENT_DRAFT_KEY);
					}
				}
			);
		},

		async deleteAll() {
			// This is the Preferences panel's "Reset LyricLint": a return to the
			// initial state, so the whole metadata table goes — preferences, recent
			// languages, assistant permissions and the current-draft pointer — along
			// with the content. It used to sweep appMetadata selectively, which left
			// `pref:` rows standing behind a control that promised all local data.
			// The backup link is not this table's to clear: the controller unlinks
			// it *before* calling here, which both severs it and stops the backup
			// mirror from writing an empty workspace over the one file that could
			// undo the press.
			await database.transaction(
				'rw',
				[
					database.drafts,
					database.appMetadata,
					database.mediaHandles,
					database.draftIgnores,
					database.assistantChats,
					database.assistantMessages
				],
				async () => {
					await database.drafts.clear();
					await database.mediaHandles.clear();
					await database.draftIgnores.clear();
					await database.assistantChats.clear();
					await database.assistantMessages.clear();
					await database.appMetadata.clear();
				}
			);
		},

		async setCurrent(id) {
			if (id === undefined) {
				await database.appMetadata.delete(CURRENT_DRAFT_KEY);
				return;
			}

			await database.appMetadata.put(currentDraftMetadata(id));
		},

		async getCurrent() {
			return (await database.appMetadata.get(CURRENT_DRAFT_KEY))?.value;
		},

		async getPreference(key) {
			return (await database.appMetadata.get(preferenceKey(key)))?.value;
		},

		async setPreference(key, value) {
			await database.appMetadata.put({ key: preferenceKey(key), value, updatedAt: now() });
		},

		async getRecentLanguages() {
			const metadata = await database.appMetadata.get(RECENT_LANGUAGES_KEY);
			return parseRecentLanguages(metadata?.value);
		},

		async rememberLanguage(language) {
			const normalized = language.trim();
			if (!normalized) return;
			await database.transaction('rw', database.appMetadata, async () => {
				const current = parseRecentLanguages(
					(await database.appMetadata.get(RECENT_LANGUAGES_KEY))?.value
				);
				const recent = [
					normalized,
					...current.filter((candidate) => candidate !== normalized)
				].slice(0, MAX_RECENT_LANGUAGES);
				await database.appMetadata.put({
					key: RECENT_LANGUAGES_KEY,
					value: JSON.stringify(recent),
					updatedAt: now()
				});
			});
		}
	};
}

import type { AppMetadataRecord, DraftCreateInput, DraftRecord, DraftRepository } from './types.js';
import type { LyricLintDatabase } from './database.js';

const CURRENT_DRAFT_KEY = 'currentDraftId';
const RECENT_LANGUAGES_KEY = 'recentLanguages';
const MAX_RECENT_LANGUAGES = 5;
const DEFAULT_TITLE = 'Untitled draft';
const DEFAULT_LANGUAGE = 'en';

function createId(): string {
	return globalThis.crypto.randomUUID();
}

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

	return copy;
}

function createRecord(input: DraftCreateInput): DraftRecord {
	const timestamp = now();
	const record: DraftRecord = {
		id: input.id ?? createId(),
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

		async duplicate(id, newId = createId()) {
			const source = await database.drafts.get(id);
			if (source === undefined) {
				throw new Error('Draft not found.');
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

		async delete(id) {
			await database.transaction('rw', database.drafts, database.appMetadata, async () => {
				await database.drafts.delete(id);
				const current = await database.appMetadata.get(CURRENT_DRAFT_KEY);
				if (current?.value === id) {
					await database.appMetadata.delete(CURRENT_DRAFT_KEY);
				}
			});
		},

		async deleteAll() {
			await database.transaction('rw', database.drafts, database.appMetadata, async () => {
				await database.drafts.clear();
				await database.appMetadata.delete(CURRENT_DRAFT_KEY);
			});
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

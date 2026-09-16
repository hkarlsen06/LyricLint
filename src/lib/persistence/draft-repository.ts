// Decision record: docs/subsystems/drafts.md — read it before changing this file, and update it with any behavior change.
import { createDraftSummaryReader } from './draft-summary-cache.js';
import { randomId } from '../core/random-id.js';
import { assistantDraftAccessKey } from '../assistant/permissions.js';
import { copyCompareBaseline, copySectionLinks, copyConversionFields } from './copy.js';
import {
	MAX_RECENT_LANGUAGES,
	RECENT_LANGUAGES_KEY,
	parseRecentLanguages
} from './recent-languages.js';
import type { AppMetadataRecord, DraftCreateInput, DraftRecord, DraftRepository } from './types.js';
import type { LyricLintDatabase } from './database.js';
import { DEFAULT_DRAFT_TITLE } from './draft-defaults.js';
import { createConversionEnvelope } from './conversion.js';
import { importDocument } from '../conversion/import.js';
import { profilePolicyVersions } from '../profiles/versions.js';

export { DEFAULT_DRAFT_TITLE } from './draft-defaults.js';

export class DraftSaveConflictError extends Error {
	constructor() {
		super('This draft changed in another tab. Its newer saved version was preserved.');
		this.name = 'DraftSaveConflictError';
	}
}

const CURRENT_DRAFT_KEY = 'currentDraftId';

/**
 * Preferences share the metadata table with the keys above, so they are
 * namespaced rather than trusted not to collide: this is a generic setter, and
 * a caller passing `currentDraft` would otherwise overwrite the pointer to the
 * draft the user is in.
 */
function preferenceKey(key: string): string {
	return `preference:${key}`;
}

/**
 * What a draft is called before anything has named it.
 *
 * Exported because it is a value three other modules compare against rather than
 * merely write: the startup sweep, the draft store's own fallback, and the
 * workbench's rule about letting an attached song name an untouched draft. It
 * had been spelled out by hand in each of them, which is one edit away from a
 * rule that silently stops matching.
 */
const DEFAULT_TITLE = DEFAULT_DRAFT_TITLE;
const DEFAULT_LANGUAGE = 'en';

function now(): string {
	return new Date().toISOString();
}

/**
 * A field-by-field copy of a draft record.
 *
 * The three list-shaped fields tolerate a value that is not a list, and that is
 * a decision about what a row's absence costs rather than defensiveness. A
 * record read back off the disk may be a partial write, a hand edit, or a
 * schema slip, and for these three the honest answer is the one `backup.ts`
 * already gives a run whose numbers cannot be read: drop what cannot be read
 * and keep the draft. An absent roster is an empty roster — which is what every
 * new draft has — and absent timings or links cost a re-sync or a re-tick,
 * where refusing the record costs the whole transcription.
 *
 * The fields with no safe default are not answered here. `recovery.ts` decides
 * which records are readable at all; this copier keeps its field-list
 * discipline, and every field a `DraftRecord` gains still has to be added to it
 * by hand.
 */
function copyDraft(record: DraftRecord): DraftRecord {
	const copy: DraftRecord = {
		id: record.id,
		title: record.title,
		text: record.text,
		language: record.language,
		performers: (record.performers ?? []).map((performer) => ({
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

	if (record.geniusUrl !== undefined) {
		copy.geniusUrl = record.geniusUrl;
	}

	if (record.originalText !== undefined) {
		copy.originalText = record.originalText;
	}

	if (record.editorSelection !== undefined) {
		copy.editorSelection = {
			anchor: record.editorSelection.anchor,
			head: record.editorSelection.head
		};
	}

	if (Array.isArray(record.lineAnchors)) {
		copy.lineAnchors = record.lineAnchors.map((anchor) => ({
			line: anchor.line,
			time: anchor.time
		}));
	}

	if (Array.isArray(record.sectionLinks)) {
		copy.sectionLinks = copySectionLinks(record.sectionLinks);
	}

	if (record.compareBaseline !== undefined) {
		copy.compareBaseline = copyCompareBaseline(record.compareBaseline);
	}
	copyConversionFields(record, copy);

	return copy;
}

function createRecord(input: DraftCreateInput): DraftRecord {
	const timestamp = now();
	const record: DraftRecord = {
		id: input.id ?? randomId(),
		title: input.title ?? DEFAULT_TITLE,
		text: input.text ?? '',
		language: input.conversion?.model.defaultLanguage ?? input.language ?? DEFAULT_LANGUAGE,
		performers: input.performers ?? [],
		createdAt: input.createdAt ?? timestamp,
		updatedAt: input.updatedAt ?? timestamp,
		ruleSetVersion: input.ruleSetVersion ?? ''
	};

	if (input.geniusUrl !== undefined) {
		record.geniusUrl = input.geniusUrl;
	}

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
	if (input.conversion !== undefined) record.conversion = input.conversion;
	if (input.conversionRecovery !== undefined) record.conversionRecovery = input.conversionRecovery;
	if (input.originalRecovery !== undefined) record.originalRecovery = input.originalRecovery;
	if (input.storageGeneration !== undefined) record.storageGeneration = input.storageGeneration;

	return copyDraft(record);
}

function currentDraftMetadata(id: string): AppMetadataRecord {
	return {
		key: CURRENT_DRAFT_KEY,
		value: id,
		updatedAt: now()
	};
}

/** Create a serializable draft repository backed by the supplied Dexie database. */
export function createDraftRepository(database: LyricLintDatabase): DraftRepository {
	const list = createDraftSummaryReader(database);
	async function recoverUnreadable(id: string): Promise<DraftRecord | undefined> {
		return database.transaction(
			'rw',
			database.drafts,
			database.appMetadata,
			database.mediaHandles,
			database.draftIgnores,
			async () => {
				const source = await database.drafts.get(id);
				if (!source || typeof source.text !== 'string' || source.conversion === undefined)
					return undefined;
				try {
					return copyDraft(source);
				} catch {
					/* Preserve the raw row and make a new recovery. */
				}
				const key = `conversionRecovery:${id}`;
				const remembered = await database.appMetadata.get(key);
				const previous = remembered && (await database.drafts.get(remembered.value));
				if (
					previous?.text === source.text &&
					(previous.conversionRecovery || previous.originalRecovery)
				)
					return copyDraft(previous);
				const imported = importDocument({
					text: source.text,
					language: typeof source.language === 'string' ? source.language : DEFAULT_LANGUAGE,
					profile: source.conversion?.profile === 'musixmatch' ? 'musixmatch' : 'genius'
				});
				const conversion = imported.ok
					? createConversionEnvelope(
							imported.value,
							source.conversion?.profile === 'musixmatch' ? 'musixmatch' : 'genius',
							profilePolicyVersions
						)
					: undefined;
				const timestamp = now();
				const reason =
					'The saved conversion data could not be read. The original draft is preserved unchanged; this copy contains its exact visible lyrics.';
				const record = createRecord({
					id: randomId(),
					title: `${typeof source.title === 'string' ? source.title : DEFAULT_TITLE} (text recovery)`,
					text: source.text,
					language: typeof source.language === 'string' ? source.language : DEFAULT_LANGUAGE,
					originalText: typeof source.originalText === 'string' ? source.originalText : source.text,
					createdAt: timestamp,
					updatedAt: timestamp,
					conversion,
					...(conversion
						? {
								conversionRecovery: {
									text: source.text,
									checkpoint: conversion,
									reason,
									sourceDraftId: id
								}
							}
						: { originalRecovery: { sourceDraftId: id, reason } })
				});
				const [media, ignores] = await Promise.all([
					database.mediaHandles.get(id),
					database.draftIgnores.get(id)
				]);
				await database.drafts.add(record);
				if (media) await database.mediaHandles.add({ ...media, draftId: record.id });
				if (ignores) await database.draftIgnores.add({ ...ignores, draftId: record.id });
				await database.appMetadata.put({ key, value: record.id, updatedAt: timestamp });
				return copyDraft(record);
			}
		);
	}
	// Cleanup and explicit deletion share one atomic side-record removal.
	async function deleteRecord(id: string, expectedGeneration?: number): Promise<boolean> {
		return database.transaction(
			'rw',
			[
				database.drafts,
				database.appMetadata,
				database.mediaHandles,
				database.draftIgnores,
				database.table('drafts'),
				database.table('appMetadata'),
				database.table('mediaHandles'),
				database.table('draftIgnores')
			],
			async () => {
				if (expectedGeneration !== undefined) {
					const existing = await database.drafts.get(id);
					if (existing && (existing.storageGeneration ?? 0) !== expectedGeneration) return false;
				}
				await database.drafts.delete(id);
				await database.mediaHandles.delete(id);
				await database.draftIgnores.delete(id);
				await database.appMetadata.delete(assistantDraftAccessKey(id));
				await database.table('drafts').delete(id);
				await database.table('mediaHandles').delete(id);
				await database.table('draftIgnores').delete(id);
				await database.table('appMetadata').delete(assistantDraftAccessKey(id));
				const current = await database.appMetadata.get(CURRENT_DRAFT_KEY);
				if (current?.value === id) {
					await database.appMetadata.delete(CURRENT_DRAFT_KEY);
				}
				return true;
			}
		);
	}

	return {
		list,
		recoverUnreadable,
		async exportRawDraft(id) {
			const record = await database.drafts.get(id);
			return record === undefined ? undefined : `${JSON.stringify(record, null, 2)}\n`;
		},

		// A record this cannot copy is left out rather than thrown. This runs at
		// boot, ahead of anything on screen, and a throw here reaches the lint
		// page's single catch — which reports local storage as unavailable for the
		// entire workbench, so one bad row would cost every healthy 'scribe. The
		// row itself is untouched on disk: a later build that can read it will
		// find it still there.
		async listRecords() {
			const records = await database.drafts.orderBy('updatedAt').reverse().toArray();
			const readable: DraftRecord[] = [];
			for (const record of records) {
				try {
					readable.push(copyDraft(record));
				} catch {
					const recovery = await recoverUnreadable(record.id).catch(() => undefined);
					if (recovery && !readable.some((entry) => entry.id === recovery.id))
						readable.push(recovery);
				}
			}
			return [...new Map(readable.map((record) => [record.id, record])).values()];
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
				if ((existing?.storageGeneration ?? 0) !== (input.storageGeneration ?? 0)) {
					throw new DraftSaveConflictError();
				}
				if (existing?.conversion !== undefined && input.conversion === undefined) {
					throw new Error('A rich draft cannot be replaced by a plain-text snapshot.');
				}
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

		async compareAndSave(input, expectedGeneration, sideRecords) {
			if (!Number.isSafeInteger(expectedGeneration) || expectedGeneration < 0) {
				throw new Error('Invalid expected draft generation.');
			}
			return database.transaction(
				'rw',
				database.drafts,
				database.appMetadata,
				database.mediaHandles,
				database.draftIgnores,
				async () => {
					const existing = await database.drafts.get(input.id);
					const conflicted =
						(existing?.storageGeneration ?? 0) !== expectedGeneration ||
						(existing === undefined && expectedGeneration > 0);
					if (!conflicted && existing?.conversion !== undefined && input.conversion === undefined) {
						throw new Error('A rich draft cannot be replaced by a plain-text snapshot.');
					}
					const record = copyDraft(input);
					if (conflicted) {
						record.id = randomId();
						record.title = `${input.title} (conflict copy)`;
						record.storageGeneration = 1;
						const media =
							sideRecords?.media === undefined
								? await database.mediaHandles.get(input.id)
								: sideRecords.media;
						const keys =
							sideRecords?.ignoredDiagnostics ??
							(await database.draftIgnores.get(input.id))?.keys ??
							[];
						await database.drafts.add(record);
						if (media) await database.mediaHandles.add({ ...media, draftId: record.id });
						if (keys.length > 0)
							await database.draftIgnores.add({
								draftId: record.id,
								keys: [...new Set(keys)].sort(),
								updatedAt: now()
							});
						await database.appMetadata.put(currentDraftMetadata(record.id));
					} else {
						if (existing) {
							record.createdAt = existing.createdAt;
							if (existing.originalText !== undefined) record.originalText = existing.originalText;
						}
						record.storageGeneration = expectedGeneration + 1;
						if (!Number.isSafeInteger(record.storageGeneration))
							throw new Error('Draft generation exhausted.');
						await database.drafts.put(record);
						if (sideRecords?.media !== undefined) {
							if (sideRecords.media === null) await database.mediaHandles.delete(record.id);
							else await database.mediaHandles.put({ ...sideRecords.media, draftId: record.id });
						}
						if (sideRecords?.ignoredDiagnostics !== undefined) {
							const keys = [...new Set(sideRecords.ignoredDiagnostics)].sort();
							if (keys.length === 0) await database.draftIgnores.delete(record.id);
							else await database.draftIgnores.put({ draftId: record.id, keys, updatedAt: now() });
						}
					}
					return { sourceId: input.id, draft: copyDraft(record), conflicted };
				}
			);
		},

		async rename(id, title) {
			await database.drafts
				.where('id')
				.equals(id)
				.modify((record) => {
					record.title = title;
					record.updatedAt = now();
					record.storageGeneration = (record.storageGeneration ?? 0) + 1;
				});
		},

		async duplicate(id, newId = randomId()) {
			const source = await database.drafts.get(id);
			if (source === undefined) {
				throw new Error("'Scribe not found.");
			}

			const timestamp = now();
			// The copy says so in its name. Two rows carrying one title is the
			// drafts menu offering the same word twice with no way to tell which
			// press opens which 'scribe — and the announcement after a duplicate
			// already strips this suffix to name what was copied.
			const duplicate = copyDraft({
				...source,
				id: newId,
				title: `${source.title} copy`,
				createdAt: timestamp,
				updatedAt: timestamp
			});
			delete duplicate.storageGeneration;
			await database.transaction(
				'rw',
				database.drafts,
				database.mediaHandles,
				database.draftIgnores,
				async () => {
					const [media, ignores] = await Promise.all([
						database.mediaHandles.get(id),
						database.draftIgnores.get(id)
					]);
					await database.drafts.add(duplicate);
					if (media) await database.mediaHandles.add({ ...media, draftId: newId });
					if (ignores) await database.draftIgnores.add({ ...ignores, draftId: newId });
				}
			);
			return copyDraft(duplicate);
		},

		async delete(id) {
			await deleteRecord(id);
		},
		deleteIfUnchanged: deleteRecord,

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
					database.assistantMessages,
					database.table('drafts'),
					database.table('appMetadata'),
					database.table('mediaHandles'),
					database.table('draftIgnores')
				],
				async () => {
					await database.drafts.clear();
					await database.mediaHandles.clear();
					await database.draftIgnores.clear();
					await database.assistantChats.clear();
					await database.assistantMessages.clear();
					await database.appMetadata.clear();
					for (const name of ['drafts', 'appMetadata', 'mediaHandles', 'draftIgnores']) {
						await database.table(name).clear();
					}
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
			return parseRecentLanguages(metadata?.value).slice(0, MAX_RECENT_LANGUAGES);
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

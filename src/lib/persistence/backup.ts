import Dexie, { type ObservabilitySet } from 'dexie';

import { randomId } from '../core/random-id.js';
import { ASSISTANT_DRAFT_ACCESS_PREFIX } from '../assistant/permissions.js';
import {
	MAX_RECENT_LANGUAGES,
	RECENT_LANGUAGES_KEY,
	parseRecentLanguages
} from './recent-languages.js';
import type { LyricLintDatabase } from './database.js';
import type {
	AppMetadataRecord,
	BackupHandleRecord,
	DraftRecord,
	MediaHandleRecord,
	PerformerRecord,
	DraftIgnoreStore
} from './types.js';

const FORMAT = 'lyriclint-workspace';
const VERSION = 1;
const HANDLE_KEY = 'workspace';
const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
const AUTOSAVE_DELAY_MS = 750;
const CURRENT_DRAFT_KEY = 'currentDraftId';

type SerializableMediaRecord = Omit<MediaHandleRecord, 'handle'>;
type FilePermission = 'granted' | 'prompt' | 'denied';
type BackupStatus = 'idle' | 'saving' | 'saved' | 'failed';

interface WritableFileHandle extends FileSystemFileHandle {
	createWritable(): Promise<FileSystemWritableFileStream>;
	queryPermission(options: { mode: 'readwrite' }): Promise<FilePermission>;
	requestPermission(options: { mode: 'readwrite' }): Promise<FilePermission>;
}

type SaveFilePicker = (options: {
	suggestedName: string;
	types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<WritableFileHandle>;

declare global {
	interface Window {
		/**
		 * The File System Access picker, which the DOM types do not declare and
		 * Firefox does not implement — hence optional, and read through a
		 * presence check before it is ever called.
		 */
		showSaveFilePicker?: SaveFilePicker;
	}
}

/** One draft's suppressed occurrences, as the backup carries them. */
interface IgnoredDiagnosticsRecord {
	draftId: string;
	keys: string[];
}

interface WorkspaceBackupFile {
	format: typeof FORMAT;
	version: typeof VERSION;
	createdAt: string;
	drafts: DraftRecord[];
	appMetadata: AppMetadataRecord[];
	media: SerializableMediaRecord[];
	ignoredDiagnostics: IgnoredDiagnosticsRecord[];
}

export interface WorkspaceBackupState {
	supported: boolean;
	linkedFileName?: string;
	permission?: FilePermission;
	status: BackupStatus;
}

export interface WorkspaceBackupController {
	state(): WorkspaceBackupState;
	subscribe(listener: (state: WorkspaceBackupState) => void): () => void;
	serialize(): Promise<string>;
	restore(file: File): Promise<number>;
	chooseFile(beforeWrite: () => Promise<void>): Promise<boolean>;
	requestPermission(beforeWrite: () => Promise<void>): Promise<boolean>;
	unlink(): Promise<void>;
	schedule(): void;
	flush(): Promise<void>;
	destroy(): void;
}

interface WorkspaceBackupOptions {
	showSaveFilePicker?: SaveFilePicker;
	now?: () => string;
	ignoreStore?: DraftIgnoreStore;
}

export class WorkspaceBackupError extends Error {}

/**
 * Anything `JSON.parse` can hand back. A backup file is somebody else's bytes
 * until every field below has been read out of it, so this is the only thing
 * the parsers may say about their input before they have checked it.
 */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** A JSON object, which is the shape every record in a backup has to be. */
type JsonObject = { [key: string]: Json };

function isRecord(value: Json | undefined): value is JsonObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: Json | undefined): value is string {
	return typeof value === 'string';
}

function isNumber(value: Json | undefined): value is number {
	return typeof value === 'number';
}

/** `Number.isInteger` as a narrowing, since it answers false for every non-number. */
function isInteger(value: Json | undefined): value is number {
	return Number.isInteger(value);
}

/** A link's membership is 1-based header lines, so zero and below name nothing. */
function isHeaderLine(value: Json | undefined): value is number {
	return isInteger(value) && value >= 1;
}

function stringField(record: JsonObject, key: string): string {
	const value = record[key];
	if (!isString(value)) throw new WorkspaceBackupError(`Invalid ${key} in backup.`);
	return value;
}

function optionalStringField(record: JsonObject, key: string): string | undefined {
	const value = record[key];
	if (value !== undefined && !isString(value)) {
		throw new WorkspaceBackupError(`Invalid ${key} in backup.`);
	}
	return value;
}

function optionalNumberField(record: JsonObject, key: string): number | undefined {
	const value = record[key];
	if (value !== undefined && (!isNumber(value) || !Number.isFinite(value) || value < 0)) {
		throw new WorkspaceBackupError(`Invalid ${key} in backup.`);
	}
	return value;
}

function parsePerformer(value: Json): PerformerRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError('Invalid performer in backup.');
	const aliases = value.aliases;
	if (!Array.isArray(aliases) || !aliases.every(isString)) {
		throw new WorkspaceBackupError('Invalid performer aliases in backup.');
	}
	if (!isNumber(value.order) || !Number.isInteger(value.order) || value.order < 0) {
		throw new WorkspaceBackupError('Invalid performer order in backup.');
	}
	return {
		id: stringField(value, 'id'),
		displayName: stringField(value, 'displayName'),
		normalizedKey: stringField(value, 'normalizedKey'),
		aliases: [...aliases],
		colorId: stringField(value, 'colorId'),
		order: value.order
	};
}

function parseDraft(value: Json): DraftRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError("Invalid 'scribe in backup.");
	if (!Array.isArray(value.performers)) {
		throw new WorkspaceBackupError("Invalid 'scribe performers in backup.");
	}
	const text = stringField(value, 'text');
	const draft: DraftRecord = {
		id: stringField(value, 'id'),
		title: stringField(value, 'title'),
		text,
		language: stringField(value, 'language'),
		performers: value.performers.map(parsePerformer),
		createdAt: stringField(value, 'createdAt'),
		updatedAt: stringField(value, 'updatedAt'),
		ruleSetVersion: stringField(value, 'ruleSetVersion')
	};

	const originalText = optionalStringField(value, 'originalText');
	if (originalText !== undefined) draft.originalText = originalText;

	if (value.editorSelection !== undefined) {
		if (!isRecord(value.editorSelection)) {
			throw new WorkspaceBackupError('Invalid editor selection in backup.');
		}
		const { anchor, head } = value.editorSelection;
		if (
			!isInteger(anchor) ||
			!isInteger(head) ||
			anchor < 0 ||
			head < 0 ||
			anchor > text.length ||
			head > text.length
		) {
			throw new WorkspaceBackupError('Invalid editor selection in backup.');
		}
		draft.editorSelection = { anchor, head };
	}

	if (value.lineAnchors !== undefined) {
		if (!Array.isArray(value.lineAnchors)) {
			throw new WorkspaceBackupError('Invalid line anchors in backup.');
		}
		draft.lineAnchors = value.lineAnchors.map((anchor) => {
			if (
				!isRecord(anchor) ||
				!isInteger(anchor.line) ||
				anchor.line < 1 ||
				!isNumber(anchor.time) ||
				!Number.isFinite(anchor.time) ||
				anchor.time < 0
			) {
				throw new WorkspaceBackupError('Invalid line anchor in backup.');
			}
			return { line: anchor.line, time: anchor.time };
		});
	}

	if (value.sectionLinks !== undefined) {
		if (!Array.isArray(value.sectionLinks)) {
			throw new WorkspaceBackupError('Invalid section links in backup.');
		}
		draft.sectionLinks = value.sectionLinks.map((link) => {
			if (!isRecord(link) || !Array.isArray(link.lines)) {
				throw new WorkspaceBackupError('Invalid section link in backup.');
			}
			const lines = link.lines;
			if (lines.length < 2 || !lines.every(isHeaderLine)) {
				throw new WorkspaceBackupError('Invalid section link in backup.');
			}
			if (link.holes !== undefined && !Array.isArray(link.holes)) {
				throw new WorkspaceBackupError('Invalid section link in backup.');
			}
			// A run whose numbers cannot be read is dropped rather than throwing: the
			// link itself is still good, and losing a difference costs the user one
			// re-tick, while refusing the whole backup costs them the draft.
			const holes = (link.holes ?? []).flatMap((hole) =>
				isRecord(hole) &&
				isInteger(hole.line) &&
				isInteger(hole.column) &&
				isInteger(hole.endLine) &&
				isInteger(hole.endColumn)
					? [
							{
								line: hole.line,
								column: hole.column,
								endLine: hole.endLine,
								endColumn: hole.endColumn
							}
						]
					: []
			);
			return holes.length > 0 ? { lines, holes } : { lines };
		});
	}

	// A baseline that cannot be read is dropped rather than throwing: it is a
	// paste the user can repeat in one press, while refusing the whole backup
	// costs them the draft.
	if (isRecord(value.compareBaseline)) {
		const { text: baselineText, pastedAt } = value.compareBaseline;
		if (isString(baselineText) && isString(pastedAt)) {
			draft.compareBaseline = { text: baselineText, pastedAt };
		}
	}

	return draft;
}

function parseMetadata(value: Json): AppMetadataRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError('Invalid application metadata in backup.');
	return {
		key: stringField(value, 'key'),
		value: stringField(value, 'value'),
		updatedAt: stringField(value, 'updatedAt')
	};
}

const mediaSources = new Set<string>(['file', 'youtube', 'spotify', 'apple']);

/**
 * One of the four kinds a remembered source can be.
 *
 * A set rather than a chain of inequalities: a fourth source made the chain
 * long enough to read wrong, and a fifth would make it longer.
 */
function isMediaSource(value: string): value is NonNullable<SerializableMediaRecord['source']> {
	return mediaSources.has(value);
}

function parseMedia(value: Json): SerializableMediaRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError('Invalid remembered media in backup.');
	const source = optionalStringField(value, 'source');
	const videoId = optionalStringField(value, 'videoId');
	const trackId = optionalStringField(value, 'trackId');
	const songId = optionalStringField(value, 'songId');
	const size = optionalNumberField(value, 'size');
	const position = optionalNumberField(value, 'position');
	if (source !== undefined && !isMediaSource(source)) {
		throw new WorkspaceBackupError('Invalid media source in backup.');
	}
	const record: SerializableMediaRecord = {
		draftId: stringField(value, 'draftId'),
		name: stringField(value, 'name'),
		attachedAt: stringField(value, 'attachedAt')
	};
	if (source !== undefined) record.source = source;
	if (videoId !== undefined) record.videoId = videoId;
	if (trackId !== undefined) record.trackId = trackId;
	if (songId !== undefined) record.songId = songId;
	if (size !== undefined) record.size = size;
	if (position !== undefined) record.position = position;
	return record;
}

/**
 * An imported metadata row rewritten for the id its draft actually landed
 * under, or nothing where it describes a draft this import does not carry.
 *
 * `assistantDraftAccess:<id>` names a draft, and a colliding id is remapped on
 * the way in — so imported verbatim the decision would answer for whichever
 * local draft happens to hold the old id. A decision whose draft is not in the
 * import at all is an orphan nothing ever clears, because deleting a draft
 * sweeps only its own key.
 */
function remapImportedMetadata(
	record: AppMetadataRecord,
	idMap: ReadonlyMap<string, string>
): AppMetadataRecord | undefined {
	if (!record.key.startsWith(ASSISTANT_DRAFT_ACCESS_PREFIX)) return record;
	const importedId = idMap.get(record.key.slice(ASSISTANT_DRAFT_ACCESS_PREFIX.length));
	return importedId === undefined
		? undefined
		: { ...record, key: `${ASSISTANT_DRAFT_ACCESS_PREFIX}${importedId}` };
}

function unique(values: readonly string[], label: string): void {
	if (new Set(values).size !== values.length) {
		throw new WorkspaceBackupError(`Duplicate ${label} in backup.`);
	}
}

function parseIgnoredDiagnostics(value: Json): IgnoredDiagnosticsRecord {
	if (!isRecord(value) || !Array.isArray(value.keys)) {
		throw new WorkspaceBackupError('Invalid ignored diagnostics in backup.');
	}
	const keys = value.keys;
	if (!keys.every(isString)) {
		throw new WorkspaceBackupError('Invalid ignored diagnostic in backup.');
	}
	return {
		draftId: stringField(value, 'draftId'),
		keys: [...new Set(keys)].sort()
	};
}

export function parseWorkspaceBackup(text: string): WorkspaceBackupFile {
	let value: Json;
	try {
		value = JSON.parse(text);
	} catch {
		throw new WorkspaceBackupError('This is not a valid LyricLint backup file.');
	}
	if (!isRecord(value) || value.format !== FORMAT || value.version !== VERSION) {
		throw new WorkspaceBackupError('This LyricLint backup version is not supported.');
	}
	if (
		!Array.isArray(value.drafts) ||
		!Array.isArray(value.appMetadata) ||
		!Array.isArray(value.media) ||
		!Array.isArray(value.ignoredDiagnostics)
	) {
		throw new WorkspaceBackupError('This LyricLint backup is incomplete.');
	}

	const drafts = value.drafts.map(parseDraft);
	const appMetadata = value.appMetadata.map(parseMetadata);
	const media = value.media.map(parseMedia);
	const ignoredDiagnostics = value.ignoredDiagnostics.map(parseIgnoredDiagnostics);
	unique(
		drafts.map((draft) => draft.id),
		"'scribe IDs"
	);
	unique(
		appMetadata.map((metadata) => metadata.key),
		'metadata keys'
	);
	unique(
		media.map((record) => record.draftId),
		'media records'
	);
	unique(
		ignoredDiagnostics.map((record) => record.draftId),
		'ignored-diagnostic records'
	);
	const draftIds = new Set(drafts.map((draft) => draft.id));
	if (
		media.some((record) => !draftIds.has(record.draftId)) ||
		ignoredDiagnostics.some((record) => !draftIds.has(record.draftId))
	) {
		throw new WorkspaceBackupError("Backup data refers to a missing 'scribe.");
	}

	return {
		format: FORMAT,
		version: VERSION,
		createdAt: stringField(value, 'createdAt'),
		drafts,
		appMetadata,
		media,
		ignoredDiagnostics
	};
}

async function createBackupFile(
	database: LyricLintDatabase,
	now: () => string,
	ignoreStore?: DraftIgnoreStore
): Promise<WorkspaceBackupFile> {
	const [drafts, appMetadata, media] = await database.transaction(
		'r',
		database.drafts,
		database.appMetadata,
		database.mediaHandles,
		() =>
			Promise.all([
				database.drafts.toArray(),
				database.appMetadata.toArray(),
				database.mediaHandles.toArray()
			])
	);
	return {
		format: FORMAT,
		version: VERSION,
		createdAt: now(),
		drafts,
		appMetadata,
		media: media.map((record) => {
			const copy = { ...record };
			delete copy.handle;
			return copy;
		}),
		ignoredDiagnostics: drafts.flatMap((draft) => {
			const keys = ignoreStore?.list(draft.id) ?? [];
			return keys.length > 0 ? [{ draftId: draft.id, keys }] : [];
		})
	};
}

/**
 * The browser's own save-file picker, where there is a browser carrying one.
 *
 * `window` is guaranteed by the DOM types rather than by the runtime — this
 * module is loaded on the server too — so the optional chain is what stands in
 * for the environment check the types cannot express.
 */
function nativeSaveFilePicker(): SaveFilePicker | undefined {
	const picker = globalThis.window?.showSaveFilePicker;
	return picker === undefined ? undefined : picker.bind(window);
}

export function createWorkspaceBackup(
	database: LyricLintDatabase,
	options: WorkspaceBackupOptions = {}
): WorkspaceBackupController {
	const now = options.now ?? (() => new Date().toISOString());
	const ignoreStore = options.ignoreStore;
	const picker = options.showSaveFilePicker ?? nativeSaveFilePicker();
	let currentState: WorkspaceBackupState = {
		supported: picker !== undefined,
		status: 'idle'
	};
	let handle: WritableFileHandle | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let dirty = false;
	let writing: Promise<void> | undefined;
	let destroyed = false;
	const listeners = new Set<(state: WorkspaceBackupState) => void>();

	function publish(update: Partial<WorkspaceBackupState>): void {
		currentState = { ...currentState, ...update };
		for (const listener of listeners) listener({ ...currentState });
	}

	async function permissionFor(candidate: WritableFileHandle): Promise<FilePermission> {
		try {
			return await candidate.queryPermission({ mode: 'readwrite' });
		} catch {
			return 'denied';
		}
	}

	const ready = database.backupHandles
		.get(HANDLE_KEY)
		.then(async (record) => {
			if (!record || destroyed) return;
			// SAFETY: the only writer of this row is `chooseFile`, which stores the
			// handle the save-file picker returned — and a picker handle carries
			// `createWritable` and the permission pair the record's type omits.
			handle = record.handle as WritableFileHandle;
			publish({
				linkedFileName: record.name,
				permission: await permissionFor(handle)
			});
		})
		.catch(() => {
			// IndexedDB can refuse the boot read (notably in private browsing). Treat
			// that exactly like an absent remembered handle so autosaves stay local.
			handle = undefined;
		});

	const databasePrefix = `idb://${database.name}/`;
	const mutationListener = (parts: ObservabilitySet) => {
		if (
			Object.keys(parts).some((part) =>
				['drafts', 'appMetadata', 'mediaHandles'].some((table) =>
					part.startsWith(`${databasePrefix}${table}/`)
				)
			)
		) {
			controller.schedule();
		}
	};
	Dexie.on.storagemutated.subscribe(mutationListener);

	async function writeUntilClean(): Promise<void> {
		while (dirty && handle && currentState.permission === 'granted') {
			dirty = false;
			publish({ status: 'saving' });
			try {
				const writable = await handle.createWritable();
				await writable.write(await controller.serialize());
				await writable.close();
				publish({ status: 'saved' });
			} catch {
				dirty = true;
				publish({
					status: 'failed',
					permission: handle ? await permissionFor(handle) : undefined
				});
				break;
			}
		}
	}

	const controller: WorkspaceBackupController = {
		state() {
			return { ...currentState };
		},
		subscribe(listener) {
			listeners.add(listener);
			listener({ ...currentState });
			return () => listeners.delete(listener);
		},
		async serialize() {
			return `${JSON.stringify(await createBackupFile(database, now, ignoreStore), null, 2)}\n`;
		},
		async restore(file) {
			if (file.size > MAX_BACKUP_BYTES) {
				throw new WorkspaceBackupError('This backup file is too large to import.');
			}
			const backup = parseWorkspaceBackup(await file.text());
			const draftIdMap = await database.transaction(
				'rw',
				database.drafts,
				database.appMetadata,
				database.mediaHandles,
				database.draftIgnores,
				async () => {
					const [localDrafts, localMetadata] = await Promise.all([
						database.drafts.toArray(),
						database.appMetadata.toArray()
					]);
					const occupiedIds = new Set(localDrafts.map((draft) => draft.id));
					const idMap = new Map<string, string>();
					const importedDrafts = backup.drafts.map((draft) => {
						let id = draft.id;
						while (occupiedIds.has(id)) id = randomId();
						occupiedIds.add(id);
						idMap.set(draft.id, id);
						return id === draft.id ? draft : { ...draft, id };
					});
					// SAFETY: `parseWorkspaceBackup` refuses a backup whose media names a
					// draft it does not carry, and the loop above mapped every draft it
					// carries — so every one of these ids is in `idMap`.
					const importedMedia = backup.media.map((media) => ({
						...media,
						draftId: idMap.get(media.draftId) as string
					}));

					if (importedDrafts.length > 0) await database.drafts.bulkAdd(importedDrafts);
					if (importedMedia.length > 0) await database.mediaHandles.bulkAdd(importedMedia);

					// The ignores go in here rather than after the transaction commits.
					// The caller reloads the page the moment this resolves, so a write
					// left queued behind it is a write the unload aborts — and one put
					// per key rewrote the whole row every time.
					// SAFETY: the same refusal covers the ignored diagnostics, so each of
					// these draft ids was mapped with its draft above.
					const importedIgnores = backup.ignoredDiagnostics.map(({ draftId, keys }) => ({
						draftId: idMap.get(draftId) as string,
						keys
					}));
					if (importedIgnores.length > 0) {
						const localIgnores = await database.draftIgnores.bulkGet(
							importedIgnores.map((record) => record.draftId)
						);
						await database.draftIgnores.bulkPut(
							importedIgnores.map((record, index) => ({
								draftId: record.draftId,
								// Merged and sorted, exactly as the in-memory mirror keeps a
								// row, so the two cannot disagree about what was imported.
								keys: [...new Set([...(localIgnores[index]?.keys ?? []), ...record.keys])].sort(),
								updatedAt: now()
							}))
						);
					}

					const metadata = new Map(localMetadata.map((record) => [record.key, record]));
					const backupMetadata = new Map(backup.appMetadata.map((record) => [record.key, record]));
					const additions = backup.appMetadata.flatMap((record) => {
						if (record.key === CURRENT_DRAFT_KEY || record.key === RECENT_LANGUAGES_KEY) return [];
						const remapped = remapImportedMetadata(record, idMap);
						return remapped === undefined || metadata.has(remapped.key) ? [] : [remapped];
					});
					if (additions.length > 0) await database.appMetadata.bulkAdd(additions);

					const localCurrent = metadata.get(CURRENT_DRAFT_KEY);
					if (!localCurrent || !localDrafts.some((draft) => draft.id === localCurrent.value)) {
						const importedCurrent = backupMetadata.get(CURRENT_DRAFT_KEY);
						const mappedCurrent = importedCurrent && idMap.get(importedCurrent.value);
						if (importedCurrent && mappedCurrent) {
							await database.appMetadata.put({ ...importedCurrent, value: mappedCurrent });
						}
					}

					const recentLanguages = [
						...new Set([
							...parseRecentLanguages(metadata.get(RECENT_LANGUAGES_KEY)?.value),
							...parseRecentLanguages(backupMetadata.get(RECENT_LANGUAGES_KEY)?.value)
						])
					].slice(0, MAX_RECENT_LANGUAGES);
					if (recentLanguages.length > 0) {
						await database.appMetadata.put({
							key: RECENT_LANGUAGES_KEY,
							value: JSON.stringify(recentLanguages),
							updatedAt: now()
						});
					}

					return idMap;
				}
			);
			// The rows are already written; this is the mirror the doomed pre-reload
			// session goes on answering from, so a restore made with no reload behind
			// it still reads back what it imported.
			if (ignoreStore) {
				for (const { draftId, keys } of backup.ignoredDiagnostics) {
					// SAFETY: the parse refused any ignored-diagnostics row naming a draft
					// this backup does not carry, and the transaction mapped every draft.
					const importedDraftId = draftIdMap.get(draftId) as string;
					for (const key of keys) ignoreStore.ignore(importedDraftId, key);
				}
			}
			return backup.drafts.length;
		},
		async chooseFile(beforeWrite) {
			if (!picker) return false;
			let chosen: WritableFileHandle;
			try {
				chosen = await picker({
					suggestedName: 'LyricLint backup.json',
					types: [
						{
							description: 'LyricLint workspace backup',
							accept: { 'application/json': ['.json'] }
						}
					]
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') return false;
				throw error;
			}
			await beforeWrite();
			handle = chosen;
			const permission = await permissionFor(chosen);
			const record: BackupHandleRecord = {
				key: HANDLE_KEY,
				name: chosen.name,
				handle: chosen,
				linkedAt: now()
			};
			await database.backupHandles.put(record);
			publish({ linkedFileName: chosen.name, permission });
			if (permission === 'granted') {
				dirty = true;
				await controller.flush();
			}
			return true;
		},
		async requestPermission(beforeWrite) {
			if (!handle) return false;
			const permissionPromise = handle.requestPermission({ mode: 'readwrite' });
			const permission = await permissionPromise;
			publish({ permission });
			if (permission !== 'granted') return false;
			await beforeWrite();
			dirty = true;
			await controller.flush();
			return true;
		},
		async unlink() {
			if (timer) clearTimeout(timer);
			timer = undefined;
			dirty = false;
			handle = undefined;
			await database.backupHandles.delete(HANDLE_KEY);
			currentState = { supported: currentState.supported, status: 'idle' };
			publish({});
		},
		schedule() {
			void ready.then(() => {
				if (destroyed || !handle || currentState.permission !== 'granted' || timer !== undefined) {
					return;
				}
				dirty = true;
				timer = setTimeout(() => {
					timer = undefined;
					void controller.flush();
				}, AUTOSAVE_DELAY_MS);
			});
		},
		async flush() {
			await ready;
			if (timer) clearTimeout(timer);
			timer = undefined;
			if (!handle || currentState.permission !== 'granted' || destroyed) return;
			dirty = true;
			if (!writing) {
				writing = writeUntilClean().finally(() => {
					writing = undefined;
				});
			}
			await writing;
		},
		destroy() {
			destroyed = true;
			if (timer) clearTimeout(timer);
			Dexie.on.storagemutated.unsubscribe(mutationListener);
			listeners.clear();
		}
	};

	return controller;
}

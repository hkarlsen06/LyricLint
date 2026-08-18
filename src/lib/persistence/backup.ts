import Dexie from 'dexie';

import { randomId } from '../core/random-id.js';
import { ASSISTANT_DRAFT_ACCESS_PREFIX } from '../assistant/permissions.js';
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
const RECENT_LANGUAGES_KEY = 'recentLanguages';
const MAX_RECENT_LANGUAGES = 5;

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

interface WorkspaceBackupFile {
	format: typeof FORMAT;
	version: typeof VERSION;
	createdAt: string;
	drafts: DraftRecord[];
	appMetadata: AppMetadataRecord[];
	media: SerializableMediaRecord[];
	ignoredDiagnostics: Array<{ draftId: string; keys: string[] }>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== 'string') throw new WorkspaceBackupError(`Invalid ${key} in backup.`);
	return value;
}

function optionalStringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	if (value !== undefined && typeof value !== 'string') {
		throw new WorkspaceBackupError(`Invalid ${key} in backup.`);
	}
	return value;
}

function optionalNumberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
		throw new WorkspaceBackupError(`Invalid ${key} in backup.`);
	}
	return value;
}

function parsePerformer(value: unknown): PerformerRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError('Invalid performer in backup.');
	const aliases = value.aliases;
	if (!Array.isArray(aliases) || !aliases.every((alias) => typeof alias === 'string')) {
		throw new WorkspaceBackupError('Invalid performer aliases in backup.');
	}
	if (typeof value.order !== 'number' || !Number.isInteger(value.order) || value.order < 0) {
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

function parseDraft(value: unknown): DraftRecord {
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
			!Number.isInteger(anchor) ||
			!Number.isInteger(head) ||
			(anchor as number) < 0 ||
			(head as number) < 0 ||
			(anchor as number) > text.length ||
			(head as number) > text.length
		) {
			throw new WorkspaceBackupError('Invalid editor selection in backup.');
		}
		draft.editorSelection = { anchor: anchor as number, head: head as number };
	}

	if (value.lineAnchors !== undefined) {
		if (!Array.isArray(value.lineAnchors)) {
			throw new WorkspaceBackupError('Invalid line anchors in backup.');
		}
		draft.lineAnchors = value.lineAnchors.map((anchor) => {
			if (
				!isRecord(anchor) ||
				!Number.isInteger(anchor.line) ||
				(anchor.line as number) < 1 ||
				typeof anchor.time !== 'number' ||
				!Number.isFinite(anchor.time) ||
				anchor.time < 0
			) {
				throw new WorkspaceBackupError('Invalid line anchor in backup.');
			}
			return { line: anchor.line as number, time: anchor.time };
		});
	}

	if (value.sectionLinks !== undefined) {
		if (!Array.isArray(value.sectionLinks)) {
			throw new WorkspaceBackupError('Invalid section links in backup.');
		}
		draft.sectionLinks = value.sectionLinks.map((link) => {
			if (
				!isRecord(link) ||
				!Array.isArray(link.lines) ||
				link.lines.length < 2 ||
				link.lines.some((line) => !Number.isInteger(line) || (line as number) < 1)
			) {
				throw new WorkspaceBackupError('Invalid section link in backup.');
			}
			if (link.holes !== undefined && !Array.isArray(link.holes)) {
				throw new WorkspaceBackupError('Invalid section link in backup.');
			}
			// A run whose numbers cannot be read is dropped rather than throwing: the
			// link itself is still good, and losing a difference costs the user one
			// re-tick, while refusing the whole backup costs them the draft.
			const holes = ((link.holes ?? []) as unknown[]).flatMap((hole) =>
				isRecord(hole) &&
				Number.isInteger(hole.line) &&
				Number.isInteger(hole.column) &&
				Number.isInteger(hole.endLine) &&
				Number.isInteger(hole.endColumn)
					? [
							{
								line: hole.line as number,
								column: hole.column as number,
								endLine: hole.endLine as number,
								endColumn: hole.endColumn as number
							}
						]
					: []
			);
			return holes.length > 0
				? { lines: link.lines as number[], holes }
				: { lines: link.lines as number[] };
		});
	}

	// A baseline that cannot be read is dropped rather than throwing: it is a
	// paste the user can repeat in one press, while refusing the whole backup
	// costs them the draft.
	if (isRecord(value.compareBaseline)) {
		const { text: baselineText, pastedAt } = value.compareBaseline;
		if (typeof baselineText === 'string' && typeof pastedAt === 'string') {
			draft.compareBaseline = { text: baselineText, pastedAt };
		}
	}

	return draft;
}

function parseMetadata(value: unknown): AppMetadataRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError('Invalid application metadata in backup.');
	return {
		key: stringField(value, 'key'),
		value: stringField(value, 'value'),
		updatedAt: stringField(value, 'updatedAt')
	};
}

const mediaSources = new Set<string>(['file', 'youtube', 'spotify', 'apple']);

function parseMedia(value: unknown): SerializableMediaRecord {
	if (!isRecord(value)) throw new WorkspaceBackupError('Invalid remembered media in backup.');
	const source = optionalStringField(value, 'source');
	const videoId = optionalStringField(value, 'videoId');
	const trackId = optionalStringField(value, 'trackId');
	const songId = optionalStringField(value, 'songId');
	const size = optionalNumberField(value, 'size');
	const position = optionalNumberField(value, 'position');
	// A set rather than a chain of inequalities: a fourth source made the chain
	// long enough to read wrong, and a fifth would make it longer.
	if (source !== undefined && !mediaSources.has(source)) {
		throw new WorkspaceBackupError('Invalid media source in backup.');
	}
	return {
		draftId: stringField(value, 'draftId'),
		name: stringField(value, 'name'),
		attachedAt: stringField(value, 'attachedAt'),
		...(source === undefined ? {} : { source: source as SerializableMediaRecord['source'] }),
		...(videoId === undefined ? {} : { videoId }),
		...(trackId === undefined ? {} : { trackId }),
		...(songId === undefined ? {} : { songId }),
		...(size === undefined ? {} : { size }),
		...(position === undefined ? {} : { position })
	};
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

function parseIgnoredDiagnostics(value: unknown): { draftId: string; keys: string[] } {
	if (!isRecord(value) || !Array.isArray(value.keys)) {
		throw new WorkspaceBackupError('Invalid ignored diagnostics in backup.');
	}
	if (!value.keys.every((key) => typeof key === 'string')) {
		throw new WorkspaceBackupError('Invalid ignored diagnostic in backup.');
	}
	return {
		draftId: stringField(value, 'draftId'),
		keys: [...new Set(value.keys)].sort()
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
					typeof language === 'string' && language.trim() ? [language.trim()] : []
				)
			)
		];
	} catch {
		return [];
	}
}

export function parseWorkspaceBackup(text: string): WorkspaceBackupFile {
	let value: unknown;
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

export function createWorkspaceBackup(
	database: LyricLintDatabase,
	options: WorkspaceBackupOptions = {}
): WorkspaceBackupController {
	const now = options.now ?? (() => new Date().toISOString());
	const ignoreStore = options.ignoreStore;
	const browserWindow =
		typeof window === 'undefined' ? undefined : (window as unknown as Record<string, unknown>);
	const picker =
		options.showSaveFilePicker ??
		(typeof browserWindow?.showSaveFilePicker === 'function'
			? (browserWindow.showSaveFilePicker as SaveFilePicker).bind(window)
			: undefined);
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
	const mutationListener = (parts: Record<string, unknown>) => {
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

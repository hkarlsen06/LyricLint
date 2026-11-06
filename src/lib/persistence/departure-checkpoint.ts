import { copyConversionFields } from './copy.js';
import { parseWorkspaceBackup } from './backup.js';
import { createDraftRepository, resolveLocalRecoveryReferences } from './draft-repository.js';
import type { LyricLintDatabase } from './database.js';
import type { DepartureCheckpoint, DepartureSnapshot, SessionStorageLike } from './types.js';

export const DEPARTURE_KEY = 'lyriclint:departure:v1';
// Session storage is a bounded bridge across navigation, not a second database.
const MAX_CHARACTERS = 2 * 1024 * 1024;
const MAX_SNAPSHOTS = 16;

interface CheckpointInput {
	format?: unknown;
	version?: unknown;
	snapshots?: unknown;
	draft?: unknown;
	sideRecords?: unknown;
	precedingWrite?: unknown;
	id?: unknown;
	generation?: unknown;
	media?: unknown;
	ignoredDiagnostics?: unknown;
}
function object(value: unknown): value is CheckpointInput {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseDepartureCheckpoint(text: string): DepartureSnapshot[] {
	if (text.length > MAX_CHARACTERS) throw new Error('The departure recovery file is too large.');
	const value: unknown = JSON.parse(text);
	if (
		!object(value) ||
		value.format !== 'lyriclint-departure' ||
		value.version !== 1 ||
		!Array.isArray(value.snapshots) ||
		value.snapshots.length > MAX_SNAPSHOTS
	)
		throw new Error('The departure recovery file cannot be read by this version.');
	const ids = new Set<string>();
	const writes = new Set<string>();
	return value.snapshots.map((snapshot: unknown) => {
		if (
			!object(snapshot) ||
			!object(snapshot.draft) ||
			(snapshot.sideRecords !== undefined && !object(snapshot.sideRecords))
		)
			throw new Error('Invalid departure snapshot.');
		const sides = snapshot.sideRecords;
		// Reuse the file boundary, including exact rich projection and model validation.
		const parsed = parseWorkspaceBackup(
			JSON.stringify({
				format: 'lyriclint-workspace',
				version: 2,
				createdAt: '',
				drafts: [snapshot.draft],
				appMetadata: [],
				media: sides?.media === undefined || sides.media === null ? [] : [sides.media],
				ignoredDiagnostics:
					sides?.ignoredDiagnostics === undefined
						? []
						: [{ draftId: snapshot.draft.id, keys: sides.ignoredDiagnostics }]
			})
		);
		const draft = parsed.drafts[0];
		if (!draft?.storageWriteId || !draft.id) throw new Error('Missing departure write identity.');
		if (ids.has(draft.id) || writes.has(draft.storageWriteId))
			throw new Error('Duplicate departure snapshot.');
		ids.add(draft.id);
		writes.add(draft.storageWriteId);
		const result: DepartureSnapshot = { draft };
		if (snapshot.precedingWrite !== undefined) {
			const preceding = snapshot.precedingWrite;
			if (
				!object(preceding) ||
				typeof preceding.id !== 'string' ||
				typeof preceding.generation !== 'number' ||
				preceding.id === draft.storageWriteId ||
				preceding.generation !== (draft.storageGeneration ?? 0)
			)
				throw new Error('Invalid preceding write.');
			copyConversionFields(
				{ ...draft, storageWriteId: preceding.id, storageGeneration: preceding.generation },
				{ ...draft }
			);
			result.precedingWrite = { id: preceding.id, generation: preceding.generation };
		}
		if (sides) {
			result.sideRecords = {};
			if (sides.media !== undefined)
				result.sideRecords.media = sides.media === null ? null : parsed.media[0];
			if (sides.ignoredDiagnostics !== undefined)
				result.sideRecords.ignoredDiagnostics = parsed.ignoredDiagnostics[0]?.keys;
		}
		return result;
	});
}

export function createDepartureCheckpoint(
	storage: () => SessionStorageLike
): DepartureCheckpoint & {
	read(): DepartureSnapshot[];
} {
	return {
		read() {
			const text = storage().getItem(DEPARTURE_KEY);
			return text === null ? [] : parseDepartureCheckpoint(text);
		},
		write(snapshots) {
			if (snapshots.length === 0) {
				storage().removeItem(DEPARTURE_KEY);
				return;
			}
			if (snapshots.length > MAX_SNAPSHOTS) throw new Error('Too many pending drafts.');
			const text = JSON.stringify({
				format: 'lyriclint-departure',
				version: 1,
				snapshots: snapshots.map(({ draft, sideRecords, precedingWrite }) => ({
					draft,
					precedingWrite,
					sideRecords: sideRecords && {
						...sideRecords,
						media: sideRecords.media && { ...sideRecords.media, handle: undefined }
					}
				}))
			});
			if (text.length > MAX_CHARACTERS) throw new Error('The pending draft is too large.');
			storage().setItem(DEPARTURE_KEY, text);
		},
		clear() {
			storage().removeItem(DEPARTURE_KEY);
		}
	};
}

/** Replay atomically, then acknowledge synchronously. A crash between the two is idempotent. */
export async function recoverDepartureCheckpoint(
	database: LyricLintDatabase,
	checkpoint: ReturnType<typeof createDepartureCheckpoint>
): Promise<{ recovered: number; conflicted: boolean }> {
	const snapshots = checkpoint.read();
	const repository = createDraftRepository(database);
	const save = repository.compareAndSave;
	if (!save) throw new Error('Guarded departure recovery is unavailable.');
	const result = await database.transaction(
		'rw',
		database.drafts,
		database.appMetadata,
		database.mediaHandles,
		database.draftIgnores,
		async () => {
			let conflicted = false;
			for (const snapshot of snapshots) {
				const sourceId = snapshot.draft.id;
				let draft = await resolveLocalRecoveryReferences(database, snapshot.draft);
				if (snapshot.precedingWrite) {
					const preceding = snapshot.precedingWrite;
					const fork = await database.drafts.get(`autosave:${preceding.id}`);
					const original = await database.drafts.get(sourceId);
					if (fork) draft = { ...draft, id: fork.id, title: fork.title, storageGeneration: 1 };
					else if (original?.storageWriteId === preceding.id)
						draft = { ...draft, storageGeneration: preceding.generation + 1 };
				}
				const sides = snapshot.sideRecords;
				const media = sides?.media;
				if (media) {
					const stored = await database.mediaHandles.get(draft.id);
					// JSON cannot carry a file capability. Retain only this recording's existing
					// capability, without asking for permission or borrowing another file's handle.
					if (
						stored &&
						stored.recordingId === media.recordingId &&
						stored.name === media.name &&
						stored.attachedAt === media.attachedAt &&
						stored.size === media.size &&
						stored.source === media.source &&
						stored.handle
					)
						media.handle = stored.handle;
				}
				const saved = await save(draft, draft.storageGeneration ?? 0, sides);
				conflicted ||= saved.conflicted;
				await repository.setCurrent(saved.draft.id);
			}
			return { recovered: snapshots.length, conflicted };
		}
	);
	checkpoint.clear();
	return result;
}

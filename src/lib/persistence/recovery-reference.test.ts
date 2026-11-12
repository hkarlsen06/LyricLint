import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, expect, test } from 'vitest';
import { openDatabase, closeDatabase, type LyricLintDatabase } from './database.js';
import { createDraftRepository } from './draft-repository.js';
import { createWorkspaceBackup } from './backup.js';
import { createConversionEnvelope } from './conversion.js';
import { importDocument } from '../conversion/import.js';
import { profilePolicyVersions } from '../profiles/versions.js';
import {
	createDepartureCheckpoint,
	parseDepartureCheckpoint,
	recoverDepartureCheckpoint
} from './departure-checkpoint.js';
import { serializeScribe, parseScribe } from '../scribe/format.js';
import type { DepartureSnapshot, DraftRecord } from './types.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
const databases: LyricLintDatabase[] = [];
const backups: ReturnType<typeof createWorkspaceBackup>[] = [];
async function database() {
	const db = await openDatabase(`recovery-reference-test-${crypto.randomUUID()}`);
	databases.push(db);
	return db;
}
function draft(id: string, text = '[Verse]\nExact latest lyric'): DraftRecord {
	return {
		id,
		text,
		title: id,
		language: 'en',
		performers: [],
		createdAt: '2026-11-06T05:00:00.000Z',
		updatedAt: '2026-11-06T05:00:00.000Z',
		ruleSetVersion: ''
	};
}
function legacyRecovery(kind: 'conversionRecovery' | 'originalRecovery'): DraftRecord {
	const row = draft('legacy-recovery');
	const reference = { sourceDraftId: 'original', reason: 'Protected legacy recovery' };
	if (kind === 'originalRecovery') return { ...row, originalRecovery: reference };
	const model = importDocument({ text: row.text, profile: 'genius', language: 'en' });
	if (!model.ok) throw new Error(model.refusal.message);
	const checkpoint = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
	return {
		...row,
		conversion: checkpoint,
		conversionRecovery: { ...reference, text: row.text, checkpoint }
	};
}
afterEach(async () => {
	for (const backup of backups.splice(0)) backup.destroy();
	for (const db of databases.splice(0)) {
		closeDatabase(db);
		await Dexie.delete(db.name);
	}
});

test.each(['conversionRecovery', 'originalRecovery'] as const)(
	'%s keeps local ownership through copies and remaps only carried originals',
	async (kind) => {
		const source = await database();
		const repo = createDraftRepository(source);
		const original = draft('original');
		const model = importDocument({ text: original.text, profile: 'genius', language: 'en' });
		if (!model.ok) throw new Error(model.refusal.message);
		const conversion = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
		await repo.create(original);
		const reason = 'Unreadable original retained';
		const recovery: DraftRecord = {
			...draft('recovery'),
			...(kind === 'conversionRecovery'
				? {
						conversion,
						conversionRecovery: {
							text: original.text,
							checkpoint: conversion,
							reason,
							sourceDraftId: original.id,
							localSourceDraftId: original.id
						}
					}
				: {
						originalRecovery: {
							reason,
							sourceDraftId: original.id,
							localSourceDraftId: original.id
						}
					})
		};
		await repo.create(recovery);
		await source.appMetadata.put({
			key: `conversionRecovery:${original.id}`,
			value: recovery.id,
			updatedAt: ''
		});
		const foreign = {
			...recovery,
			id: 'foreign-recovery',
			[kind]: { ...recovery[kind], localSourceDraftId: null }
		};
		await repo.create(foreign);
		const duplicate = await repo.duplicate(recovery.id);
		expect(duplicate[kind]).toEqual(recovery[kind]);
		if (!repo.compareAndSave) throw new Error('Missing CAS');
		const saved = await repo.compareAndSave(recovery, 0);
		const conflict = await repo.compareAndSave({ ...saved.draft, text: recovery.text }, 0);
		expect(conflict.conflicted).toBe(true);
		expect(conflict.draft[kind]).toEqual(recovery[kind]);
		expect((await createDraftRepository(source).get(duplicate.id))?.[kind]).toEqual(recovery[kind]);
		const scribe = JSON.parse(
			serializeScribe({
				title: recovery.title,
				lyrics: recovery.text,
				language: 'en',
				performers: [],
				lineAnchors: [],
				sectionLinks: [],
				ignoredDiagnostics: [],
				conversion: recovery.conversion,
				conversionRecovery: recovery.conversionRecovery,
				originalRecovery: recovery.originalRecovery
			})
		);
		// Even a file hand-edited to carry a local field has no local authority.
		scribe.document[kind].localSourceDraftId = original.id;
		expect(parseScribe(JSON.stringify(scribe)).document[kind]).toEqual({
			...recovery[kind],
			localSourceDraftId: null
		});
		const checkpoint = parseDepartureCheckpoint(
			JSON.stringify({
				format: 'lyriclint-departure',
				version: 1,
				snapshots: [{ draft: { ...saved.draft, storageWriteId: crypto.randomUUID() } }]
			})
		);
		expect(checkpoint[0]?.draft[kind]).toEqual(recovery[kind]);
		const backup = createWorkspaceBackup(source);
		backups.push(backup);
		const serialized = await backup.serialize();
		const destination = await database();
		const destinationRepo = createDraftRepository(destination);
		const unrelated = await destinationRepo.create(draft(original.id, 'UNRELATED DESTINATION'));
		const restore = createWorkspaceBackup(destination);
		backups.push(restore);
		await restore.restore(new File([serialized], 'workspace.json'));
		const imported = await destinationRepo.get(recovery.id);
		const ref = imported?.[kind]?.localSourceDraftId;
		expect((await destinationRepo.get('foreign-recovery'))?.[kind]?.localSourceDraftId).toBeNull();
		expect((await destination.appMetadata.get(`conversionRecovery:${ref}`))?.value).toBe(
			recovery.id
		);
		expect(ref).toBeTruthy();
		expect(ref).not.toBe(original.id);
		expect(JSON.parse((await destinationRepo.exportRawDraft?.(ref!))!)).toMatchObject({
			text: original.text,
			id: ref
		});
		expect(await destination.drafts.get(original.id)).toEqual(unrelated);
		const dangling = JSON.parse(serialized);
		dangling.drafts = dangling.drafts.filter((row: DraftRecord) => row.id !== original.id);
		const isolated = await database();
		const danglingRestore = createWorkspaceBackup(isolated);
		backups.push(danglingRestore);
		await danglingRestore.restore(new File([JSON.stringify(dangling)], 'dangling.json'));
		expect((await createDraftRepository(isolated).get(recovery.id))?.[kind]).toEqual({
			...recovery[kind],
			localSourceDraftId: null
		});
	}
);

test('legacy local recovery ownership requires the remembered association', async () => {
	const db = await database();
	const repo = createDraftRepository(db);
	await repo.create(draft('source'));
	const recovery = {
		...draft('legacy'),
		originalRecovery: { sourceDraftId: 'source', reason: 'Retained original' }
	};
	await db.drafts.add(recovery);
	expect((await repo.get('legacy'))?.originalRecovery?.localSourceDraftId).toBeNull();
	await db.appMetadata.put({ key: 'conversionRecovery:source', value: 'legacy', updatedAt: '' });
	expect((await repo.get('legacy'))?.originalRecovery?.localSourceDraftId).toBe('source');
	expect((await repo.duplicate('legacy')).originalRecovery?.localSourceDraftId).toBe('source');
	await db.drafts.delete('source');
	expect((await repo.get('legacy'))?.originalRecovery?.localSourceDraftId).toBeNull();
});

test.each(['conversionRecovery', 'originalRecovery'] as const)(
	'%s legacy backup needs archive ownership before remapping either ID',
	async (kind) => {
		for (const owned of [false, true]) {
			const source = await database();
			const repo = createDraftRepository(source);
			await repo.create(draft('original', owned ? 'Genuine original' : 'Unrelated carried row'));
			const recovery = legacyRecovery(kind);
			await repo.create(recovery);
			if (owned)
				await source.appMetadata.put({
					key: 'conversionRecovery:original',
					value: recovery.id,
					updatedAt: ''
				});
			const backup = createWorkspaceBackup(source);
			backups.push(backup);
			const serialized = await backup.serialize();
			const destination = await database();
			const target = createDraftRepository(destination);
			const originalCollision = await target.create(draft('original', 'Destination original'));
			const recoveryCollision = await target.create(draft(recovery.id, 'Destination recovery'));
			const restore = createWorkspaceBackup(destination);
			backups.push(restore);
			await restore.restore(new File([serialized], 'legacy.json'));
			const row = (await destination.drafts.toArray()).find(
				(candidate) => candidate.id !== recovery.id && candidate.title === recovery.title
			);
			if (!row) throw new Error('Missing imported recovery');
			const imported = await target.get(row.id);
			const sourceId = imported?.[kind]?.localSourceDraftId;
			if (owned) {
				expect(sourceId).toBeTruthy();
				expect(sourceId).not.toBe('original');
				expect(JSON.parse((await target.exportRawDraft?.(sourceId!))!).text).toBe(
					'Genuine original'
				);
			} else expect(sourceId).toBeNull();
			expect(await destination.drafts.get('original')).toEqual(originalCollision);
			expect(await destination.drafts.get(recovery.id)).toEqual(recoveryCollision);
		}
	}
);

test.each(['conversionRecovery', 'originalRecovery'] as const)(
	'%s resolves legacy checkpoint ownership before fresh, predecessor and committed forks',
	async (kind) => {
		for (const owned of [false, true]) {
			for (const mode of ['fresh', 'predecessor', 'committed']) {
				const db = await database();
				const repo = createDraftRepository(db);
				const original = await repo.create(draft('original', 'Genuine original'));
				const recovery = legacyRecovery(kind);
				const competing = await repo.create({ ...recovery, storageGeneration: 2 });
				if (owned)
					await db.appMetadata.put({
						key: 'conversionRecovery:original',
						value: recovery.id,
						updatedAt: ''
					});
				const writeId = crypto.randomUUID();
				const precedingId = crypto.randomUUID();
				if (mode !== 'fresh') {
					const committedId = mode === 'committed' ? writeId : precedingId;
					await db.drafts.add({
						...recovery,
						id: `autosave:${committedId}`,
						storageWriteId: committedId,
						storageGeneration: 1
					});
				}
				const values = new Map<string, string>();
				const session = {
					get length() {
						return values.size;
					},
					key(index: number) {
						return [...values.keys()][index] ?? null;
					},
					getItem(key: string) {
						return values.get(key) ?? null;
					},
					setItem(key: string, value: string) {
						values.set(key, value);
					},
					removeItem(key: string) {
						values.delete(key);
					}
				};
				const checkpoint = createDepartureCheckpoint(() => session);
				const pending: DepartureSnapshot = {
					draft: { ...recovery, storageGeneration: 1, storageWriteId: writeId }
				};
				if (mode === 'predecessor') pending.precedingWrite = { id: precedingId, generation: 1 };
				checkpoint.write([pending]);
				const bytes = session.getItem('lyriclint:departure:v2');
				if (!bytes) throw new Error('Missing checkpoint');
				await recoverDepartureCheckpoint(db, checkpoint);
				const id = await repo.getCurrent();
				if (!id) throw new Error('Missing recovered selection');
				const actual = await repo.get(id);
				expect(actual?.text).toBe(recovery.text);
				expect(actual?.[kind]).toEqual({
					...recovery[kind],
					localSourceDraftId: owned ? 'original' : null
				});
				expect(await db.drafts.get('original')).toEqual(original);
				expect(await db.drafts.get(recovery.id)).toEqual(competing);
				const first = await db.drafts.toArray();
				session.setItem('lyriclint:departure:v1', bytes);
				await recoverDepartureCheckpoint(db, checkpoint);
				expect(await db.drafts.toArray()).toEqual(first);
			}
		}
	}
);

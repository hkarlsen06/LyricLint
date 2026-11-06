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
import { parseDepartureCheckpoint } from './departure-checkpoint.js';
import { serializeScribe, parseScribe } from '../scribe/format.js';
import type { DraftRecord } from './types.js';

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

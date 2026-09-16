import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { importDocument } from '../conversion/import.js';
import { renderProfile } from '../conversion/projection.js';
import { profilePolicyVersions } from '../profiles/versions.js';
import { parseScribe, serializeScribe } from '../scribe/format.js';
import { createAutosaveController } from './autosave.js';
import { createWorkspaceBackup, parseWorkspaceBackup } from './backup.js';
import { createConversionEnvelope, parseConversionEnvelope } from './conversion.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from './database.js';
import { createDraftRepository } from './draft-repository.js';
import { recoverStartupDraft } from './recovery.js';
import type { DraftRecord, DraftSaveResult } from './types.js';

const databases: LyricLintDatabase[] = [];
async function setup(name: string) {
	const database = await openDatabase(`conversion-${name}-${crypto.randomUUID()}`);
	databases.push(database);
	return { database, repository: createDraftRepository(database) };
}
afterEach(async () => {
	for (const database of databases.splice(0)) {
		closeDatabase(database);
		await Dexie.delete(database.name);
	}
});
function rich(text = '[Verse]\nA [moon](123)\n\n[Chorus]\nStill here'): DraftRecord {
	const imported = importDocument({ text, profile: 'genius', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const conversion = createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions);
	return {
		id: 'draft',
		title: 'Night',
		text: conversion.projectionText,
		language: 'en',
		performers: [],
		createdAt: '2026-09-16T00:00:00Z',
		updatedAt: '2026-09-16T00:00:00Z',
		ruleSetVersion: 'test',
		conversion,
		storageGeneration: 0
	};
}

describe('lossless conversion durability', () => {
	it('reports blocked upgrades before opening and closes a superseded connection without losing its rows', async () => {
		const name = `conversion-blocked-${crypto.randomUUID()}`;
		const old = new Dexie(name);
		old.version(5).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key',
			mediaHandles: 'draftId',
			backupHandles: 'key',
			assistantChats: 'id, updatedAt',
			assistantMessages: 'id, chatId, createdAt',
			draftIgnores: 'draftId'
		});
		await old.open();
		old.on('versionchange', () => false);
		const notices: string[] = [];
		const database = await openDatabase(name, (state) => {
			notices.push(state);
			if (state === 'blocked') old.close();
		});
		databases.push(database);
		expect(notices).toContain('blocked');
		expect(notices.at(-1)).toBe('ready');
		await createDraftRepository(database).create(rich());
		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(name, database.backendDB().version + 10);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				request.result.close();
				resolve();
			};
		});
		expect(notices.at(-1)).toBe('version-changed');
		expect(database.isOpen()).toBe(false);
		await expect(database.drafts.get('draft')).rejects.toThrow();
	});

	it('migrates schema 5 and isolates rich drafts and attachments from a reopened old Dexie writer', async () => {
		const name = `conversion-old-writer-${crypto.randomUUID()}`;
		const old = new Dexie(name);
		old.version(5).stores({
			drafts: 'id, updatedAt',
			appMetadata: 'key',
			mediaHandles: 'draftId',
			backupHandles: 'key',
			assistantChats: 'id, updatedAt',
			assistantMessages: 'id, chatId, createdAt',
			draftIgnores: 'draftId'
		});
		await old.open();
		const original = rich();
		await old.table('drafts').add(original);
		await old
			.table('mediaHandles')
			.add({ draftId: original.id, name: 'original.wav', attachedAt: original.createdAt });
		await old
			.table('draftIgnores')
			.add({ draftId: original.id, keys: ['original'], updatedAt: original.updatedAt });
		old.close();
		const current = await openDatabase(name);
		databases.push(current);
		const repository = createDraftRepository(current);
		expect(current.drafts.name).toBe('draftsV6');
		expect(await repository.get(original.id)).toEqual(original);
		await old.open();
		try {
			await old.table('drafts').put({ ...original, text: 'stale', conversion: undefined });
			await old.table('mediaHandles').clear();
			await old.table('draftIgnores').clear();
			expect(await repository.get(original.id)).toEqual(original);
			expect((await current.mediaHandles.get(original.id))?.name).toBe('original.wav');
			expect((await current.draftIgnores.get(original.id))?.keys).toEqual(['original']);
			await repository.deleteAll();
			expect(await old.table('drafts').count()).toBe(0);
		} finally {
			old.close();
		}
	});

	it('retains hidden structure through autosave, reopen, duplicate, backup, and Scribe', async () => {
		const { database, repository } = await setup('round-trip');
		const original = rich();
		await repository.create(original);
		const autosave = createAutosaveController(repository);
		autosave.schedule({ revision: 0, draft: original });
		await autosave.flush();
		const saved = (await repository.get(original.id))!;
		expect(saved.storageGeneration).toBe(1);
		expect(saved.conversion).toEqual(original.conversion);
		expect(saved).not.toHaveProperty('lineAnchors');
		expect(saved).not.toHaveProperty('sectionLinks');
		await database.mediaHandles.put({
			draftId: original.id,
			name: 'song.wav',
			recordingId: 'file:roundtrip-fixture',
			attachedAt: original.createdAt
		});
		await database.draftIgnores.put({
			draftId: original.id,
			keys: ['genius:kept'],
			updatedAt: original.updatedAt
		});
		const duplicate = await repository.duplicate(original.id, 'copy');
		expect(duplicate.conversion).toEqual(original.conversion);
		expect((await database.mediaHandles.get('copy'))?.name).toBe('song.wav');
		expect((await database.draftIgnores.get('copy'))?.keys).toEqual(['genius:kept']);
		const backup = createWorkspaceBackup(database);
		const parsed = parseWorkspaceBackup(await backup.serialize());
		expect(parsed.version).toBe(2);
		expect(parsed.drafts.find((draft) => draft.id === original.id)).toEqual(saved);
		expect(parsed.media.find((media) => media.draftId === original.id)?.recordingId).toBe(
			'file:roundtrip-fixture'
		);
		backup.destroy();
		const source = serializeScribe({
			title: saved.title,
			language: saved.language,
			lyrics: saved.text,
			conversion: saved.conversion,
			performers: saved.performers,
			lineAnchors: [],
			sectionLinks: [],
			ignoredDiagnostics: []
		});
		const scribe = parseScribe(source);
		expect(scribe.version).toBe(2);
		expect(scribe.document.conversion).toEqual(original.conversion);
		closeDatabase(database);
		await database.open();
		const reopened = (await createDraftRepository(database).get(original.id))!;
		const genius = renderProfile(reopened.conversion!.model, 'genius');
		expect(genius.ok && genius.value.text).toBe('[Verse]\nA [moon](123)\n\n[Chorus]\nStill here');
	});

	it('preserves metadata-only drafts whose active profile renders no text', async () => {
		const { repository } = await setup('empty');
		const draft = rich('[Verse]');
		expect(draft.text).toBe('');
		await repository.create(draft);
		await repository.setCurrent(draft.id);
		expect((await recoverStartupDraft(repository)).id).toBe(draft.id);
		expect((await repository.get(draft.id))?.conversion).toEqual(draft.conversion);
	});

	it('uses the fresh generation when reopening a draft changed after this session last saved it', async () => {
		const { repository } = await setup('reload-generation');
		const draft = rich();
		await repository.create(draft);
		const autosave = createAutosaveController(repository);
		autosave.schedule({ revision: 0, draft });
		await autosave.flush();
		const saved = (await repository.get(draft.id))!;
		const external = await repository.compareAndSave!({ ...saved, title: 'Another tab' }, 1);
		autosave.schedule({ revision: 1, draft: { ...external.draft, title: 'Reopened' } });
		await autosave.flush();
		expect(await repository.list()).toHaveLength(1);
		expect(await repository.get(draft.id)).toMatchObject({
			title: 'Reopened',
			storageGeneration: 3
		});
	});

	it('forks a stale save with its local ignores and media atomically without changing the original', async () => {
		const { database, repository } = await setup('conflict');
		const draft = rich();
		await repository.create(draft);
		const first = await repository.compareAndSave!(draft, 0);
		await database.mediaHandles.put({
			draftId: draft.id,
			name: 'remote.wav',
			attachedAt: draft.createdAt
		});
		await database.draftIgnores.put({
			draftId: draft.id,
			keys: ['remote'],
			updatedAt: draft.updatedAt
		});
		const local = { ...draft, title: 'Local title' };
		const result = await repository.compareAndSave!(local, 0, {
			ignoredDiagnostics: ['local'],
			media: { draftId: draft.id, name: 'local.wav', attachedAt: draft.createdAt }
		});
		expect(result.conflicted).toBe(true);
		expect(await repository.get(draft.id)).toEqual(first.draft);
		expect(result.draft.id).not.toBe(draft.id);
		expect(result.draft.conversion).toEqual(local.conversion);
		expect((await database.mediaHandles.get(draft.id))?.name).toBe('remote.wav');
		expect((await database.mediaHandles.get(result.draft.id))?.name).toBe('local.wav');
		expect((await database.draftIgnores.get(draft.id))?.keys).toEqual(['remote']);
		expect((await database.draftIgnores.get(result.draft.id))?.keys).toEqual(['local']);
		expect(await repository.getCurrent()).toBe(result.draft.id);
	});

	it('continues saving a conflict copy without producing another fork for every edit', async () => {
		const { repository } = await setup('conflict-queue');
		const draft = rich();
		await repository.create(draft);
		await repository.compareAndSave!(draft, 0);
		const autosave = createAutosaveController(repository);
		const results: DraftSaveResult[] = [];
		autosave.subscribeSaved!((result) => results.push(result));
		autosave.schedule({ revision: 1, draft: { ...draft, title: 'Local' } });
		await autosave.flush();
		const fork = results[0]!.draft;
		autosave.schedule({ revision: 2, draft: { ...fork, title: 'Continuing' } });
		await autosave.flush();
		expect(results.map((result) => result.conflicted)).toEqual([true, false]);
		expect((await repository.get(fork.id))?.title).toBe('Continuing');
		expect(await repository.list()).toHaveLength(2);
	});

	it('rebases an in-flight queued edit onto the conflict copy generation', async () => {
		const { repository } = await setup('conflict-in-flight');
		const draft = { ...rich(), storageGeneration: 42 };
		await repository.create(draft);
		await repository.compareAndSave!(draft, 42);
		let release: () => void = () => {};
		let started: () => void = () => {};
		const hold = new Promise<void>((resolve) => {
			release = resolve;
		});
		const writing = new Promise<void>((resolve) => {
			started = resolve;
		});
		const autosave = createAutosaveController(
			{
				save: repository.save,
				async compareAndSave(input, generation, sideRecords) {
					const result = await repository.compareAndSave!(input, generation, sideRecords);
					if (input.id === draft.id) {
						started();
						await hold;
					}
					return result;
				}
			},
			{ debounceMs: 60_000 }
		);
		const results: DraftSaveResult[] = [];
		autosave.subscribeSaved!((result) => results.push(result));
		autosave.schedule({ revision: 1, draft });
		const flushing = autosave.flush();
		await writing;
		const latest = { ...rich('[Verse]\nLatest local words'), storageGeneration: 42 };
		autosave.schedule({ revision: 2, draft: latest });
		release();
		await flushing;
		await autosave.flush();
		expect(results.map((result) => result.conflicted)).toEqual([true, false]);
		expect(await repository.list()).toHaveLength(2);
		expect((await repository.get(results[0]!.draft.id))?.text).toBe(latest.text);
		expect((await repository.get(draft.id))?.storageGeneration).toBe(43);
	});

	it('retains a failed conflict transaction in memory and reports no saved copy', async () => {
		const { database, repository } = await setup('failed-conflict');
		const draft = rich();
		await repository.create(draft);
		await repository.compareAndSave!(draft, 0);
		const original = await repository.get(draft.id);
		const reject = () => {
			throw new Error('Quota exhausted');
		};
		database.mediaHandles.hook('creating', reject);
		const autosave = createAutosaveController(repository);
		const results: DraftSaveResult[] = [];
		autosave.subscribeSaved!((result) => results.push(result));
		autosave.schedule({
			revision: 1,
			draft,
			sideRecords: { media: { draftId: draft.id, name: 'song.wav', attachedAt: draft.createdAt } }
		});
		await autosave.flush();
		expect(autosave.status()).toBe('failed');
		expect(results).toEqual([]);
		expect(await repository.list()).toHaveLength(1);
		expect(await repository.get(draft.id)).toEqual(original);
		database.mediaHandles.hook('creating').unsubscribe(reject);
		await autosave.flush();
		expect(autosave.status()).toBe('saved');
		expect(results).toHaveLength(1);
	});

	it('refuses corrupt, mismatched, and unavailable rich versions instead of losing the model', async () => {
		const draft = rich();
		for (const bad of [
			{ ...draft.conversion, schema: 99 },
			{
				...draft.conversion,
				policyVersions: { ...profilePolicyVersions, musixmatch: 'unavailable' }
			},
			{ ...draft.conversion, projectionText: 'different' },
			{ ...draft.conversion, model: { ...draft.conversion!.model, sections: null } }
		])
			expect(() => parseConversionEnvelope(bad, draft.text)).toThrow();
		const { database, repository } = await setup('recovery');
		const unavailable = {
			...draft,
			conversion: { ...draft.conversion!, schema: 99 }
		};
		// Simulate a future writer through its physical store, outside today's typed boundary.
		await database.table(database.drafts.name).add(unavailable);
		await expect(repository.get(draft.id)).rejects.toThrow();
		const recovered = await recoverStartupDraft(repository);
		expect(recovered.id).not.toBe(draft.id);
		expect(recovered.text).toBe(draft.text);
		expect(recovered.conversionRecovery?.sourceDraftId).toBe(draft.id);
		expect(await database.drafts.get(draft.id)).toEqual(unavailable);
		expect(JSON.parse((await repository.exportRawDraft!(draft.id))!)).toEqual(unavailable);
		expect((await recoverStartupDraft(repository)).id).toBe(recovered.id);
		expect(await database.drafts.count()).toBe(2);
	});

	it('stores failed reconciliation text alongside its last valid model', async () => {
		const { repository } = await setup('reconciliation-recovery');
		const draft = rich();
		const recovery = {
			...draft,
			text: 'Latest input',
			conversionRecovery: {
				text: 'Latest input',
				checkpoint: draft.conversion!,
				reason: 'Unmappable structural edit'
			}
		};
		await repository.create(recovery);
		expect(await repository.get(draft.id)).toEqual(recovery);
		expect(() => parseConversionEnvelope(draft.conversion, recovery.text)).toThrow();
	});
});

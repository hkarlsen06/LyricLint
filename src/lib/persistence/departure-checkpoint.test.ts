import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { allocateId } from '../conversion/model.js';
import { importDocument } from '../conversion/import.js';
import { profilePolicyVersions } from '../profiles/versions.js';
import { createAutosaveController } from './autosave.js';
import { createConversionEnvelope } from './conversion.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from './database.js';
import { createDraftRepository } from './draft-repository.js';
import {
	createDepartureCheckpoint,
	DEPARTURE_KEY,
	parseDepartureCheckpoint,
	recoverDepartureCheckpoint
} from './departure-checkpoint.js';
import { recoverStartupDraft } from './recovery.js';
import type { DraftRecord, SessionStorageLike } from './types.js';

const databases: LyricLintDatabase[] = [];
const controllers: ReturnType<typeof createAutosaveController>[] = [];
afterEach(async () => {
	for (const controller of controllers.splice(0)) controller.cancel();
	for (const db of databases.splice(0)) {
		closeDatabase(db);
		await Dexie.delete(db.name);
	}
});
function storage(): SessionStorageLike {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		key(i) {
			return [...values.keys()][i] ?? null;
		},
		getItem(key) {
			return values.get(key) ?? null;
		},
		setItem(key, value) {
			values.set(key, value);
		},
		removeItem(key) {
			values.delete(key);
		}
	};
}
function rich(text = '[Verse: Mira]\nSilver [moon](123)\n\n[Chorus]\nSilver moon'): DraftRecord {
	const imported = importDocument({ text, profile: 'genius', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const conversion = createConversionEnvelope(imported.value, 'musixmatch', profilePolicyVersions);
	return {
		id: 'draft',
		title: 'Night',
		text: conversion.projectionText,
		language: 'en',
		performers: [],
		createdAt: '2026-11-01T00:00:00Z',
		updatedAt: '2026-11-01T00:00:00Z',
		ruleSetVersion: 'test',
		conversion,
		editorSelection: {
			anchor: Math.min(2, conversion.projectionText.length),
			head: Math.min(5, conversion.projectionText.length)
		}
	};
}
async function setup() {
	const db = await openDatabase(`departure-${crypto.randomUUID()}`);
	databases.push(db);
	const repository = createDraftRepository(db);
	const session = storage();
	const checkpoint = createDepartureCheckpoint(() => session);
	const controller = createAutosaveController(repository, { debounceMs: 60_000, checkpoint });
	controllers.push(controller);
	return { db, repository, session, checkpoint, controller };
}

describe('departure durability', () => {
	it('recovers a complete rich snapshot before debounce, including side records, and remains idempotent', async () => {
		const { db, repository, session, checkpoint, controller } = await setup();
		const draft = rich();
		controller.schedule({
			revision: 1,
			draft,
			sideRecords: {
				ignoredDiagnostics: ['mine'],
				media: {
					draftId: draft.id,
					name: 'Track',
					source: 'youtube',
					videoId: 'dQw4w9WgXcQ',
					attachedAt: draft.createdAt,
					position: 12
				}
			}
		});
		expect(controller.status()).toBe('scheduled');
		expect(controller.checkpoint?.()).toBe(true);
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		session.setItem(DEPARTURE_KEY, raw);
		expect(await recoverDepartureCheckpoint(db, checkpoint)).toEqual({
			recovered: 1,
			conflicted: false
		});
		const recovered = await recoverStartupDraft(repository);
		expect(recovered).toEqual({
			...draft,
			storageGeneration: 1,
			storageWriteId: expect.any(String)
		});
		expect((await db.mediaHandles.get('draft'))?.position).toBe(12);
		expect((await db.draftIgnores.get('draft'))?.keys).toEqual(['mine']);
		// Simulate destruction after the commit but before session acknowledgement.
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect(await repository.listRecords()).toEqual([recovered]);
		expect(session.getItem(DEPARTURE_KEY)).toBeNull();
	});

	it('keeps timings, links, decisions, selection and allocator state together across recovery', async () => {
		const { db, repository, session, checkpoint, controller } = await setup();
		const imported = importDocument({
			text: '[Verse]\nSilver moon\n\n[Chorus]\nSilver moon',
			profile: 'genius',
			language: 'en',
			nextId: 100,
			lineAnchors: [
				{ line: 2, time: 1.2 },
				{ line: 5, time: 4.5 }
			],
			sectionLinks: [{ lines: [1, 4] }]
		});
		if (!imported.ok) throw new Error(imported.refusal.message);
		const model = imported.value;
		const owner = model.owners[0];
		if (!owner) throw new Error('missing owner');
		model.decisions.push({
			id: allocateId(model, 'decision'),
			kind: 'keep-form',
			profile: 'genius',
			ownerId: owner.id,
			ownerRevision: owner.revision
		});
		const conversion = createConversionEnvelope(model, 'musixmatch', profilePolicyVersions);
		const draft = { ...rich(), text: conversion.projectionText, conversion };
		controller.schedule({ revision: 2, draft });
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		const recovered = await recoverStartupDraft(repository);
		expect(recovered.conversion).toEqual(conversion);
		expect(recovered.editorSelection).toEqual(draft.editorSelection);
		expect(recovered.conversion?.model.links).toHaveLength(1);
		expect(
			recovered.conversion?.model.lines.filter((line) => line.time !== undefined)
		).toHaveLength(2);
		expect(recovered.conversion?.model.nextId).toBeGreaterThan(100);
	});

	it('recovers more than one draft without mixing format or model', async () => {
		const { db, repository, session, checkpoint, controller } = await setup();
		const first = rich();
		const second = { ...rich('[Verse]\nOther words'), id: 'second' };
		if (!second.conversion) throw new Error('missing model');
		second.conversion = createConversionEnvelope(
			second.conversion.model,
			'genius',
			profilePolicyVersions
		);
		second.text = second.conversion.projectionText;
		controller.schedule({ revision: 1, draft: first });
		controller.schedule({ revision: 1, draft: second });
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect((await repository.get(first.id))?.conversion).toEqual(first.conversion);
		expect((await repository.get(second.id))?.conversion).toEqual(second.conversion);
		expect((await recoverStartupDraft(repository)).id).toBe(second.id);
	});

	it('does not replay an already landed normal save or overwrite its side records', async () => {
		const { db, repository, session, checkpoint, controller } = await setup();
		controller.schedule({
			revision: 1,
			draft: rich(),
			sideRecords: { ignoredDiagnostics: ['mine'] }
		});
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		await controller.flush();
		expect(session.getItem(DEPARTURE_KEY)).toBeNull();
		const saved = await repository.get('draft');
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect(await repository.listRecords()).toEqual([saved]);
		expect((await db.draftIgnores.get('draft'))?.keys).toEqual(['mine']);
	});

	it('retains a failed transaction and atomically recovers a stale writer into one conflict copy', async () => {
		const { db, repository, session, checkpoint, controller } = await setup();
		const original = await repository.create({ ...rich(), storageGeneration: 1 });
		const local = rich('[Verse]\nLocal tonight');
		local.storageGeneration = 1;
		controller.schedule({
			revision: 1,
			draft: local,
			sideRecords: { ignoredDiagnostics: ['local'], media: null }
		});
		const newer = await repository.compareAndSave?.(
			{ ...rich('[Verse]\nOther tab'), storageGeneration: 1 },
			1,
			{
				ignoredDiagnostics: ['other'],
				media: { draftId: 'draft', name: 'Other source', attachedAt: original.createdAt }
			}
		);
		const fail = () => {
			throw new Error('disk full');
		};
		db.drafts.hook('creating', fail);
		await controller.flush();
		expect(controller.status()).toBe('failed');
		expect(controller.checkpoint?.()).toBe(true);
		const raw = session.getItem(DEPARTURE_KEY)!;
		db.drafts.hook('creating').unsubscribe(fail);
		controller.cancel();
		session.setItem(DEPARTURE_KEY, raw);
		expect((await recoverDepartureCheckpoint(db, checkpoint)).conflicted).toBe(true);
		const fork = await recoverStartupDraft(repository);
		expect(fork.text).toBe(local.text);
		expect(fork.conversion).toEqual(local.conversion);
		expect(fork.id).not.toBe(original.id);
		expect(await repository.get(original.id)).toEqual(newer?.draft);
		expect((await db.draftIgnores.get(original.id))?.keys).toEqual(['other']);
		expect((await db.draftIgnores.get(fork.id))?.keys).toEqual(['local']);
		expect(await db.mediaHandles.get(fork.id)).toBeUndefined();
		expect((await db.mediaHandles.get(original.id))?.name).toBe('Other source');
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect(await db.drafts.count()).toBe(2);
	});

	for (const landed of [false, true]) {
		it(`compacts an in-flight predecessor and its latest edit when predecessor landed=${landed}`, async () => {
			const { db, repository, session, checkpoint } = await setup();
			let enter = () => {};
			let finish = () => {};
			const entered = new Promise<void>((resolve) => {
				enter = resolve;
			});
			const gate = new Promise<void>((resolve) => {
				finish = resolve;
			});
			const controller = createAutosaveController(
				{
					...repository,
					async compareAndSave(draft, generation, sides) {
						enter();
						await gate;
						if (!landed) throw new Error('interrupted');
						const saved = await repository.compareAndSave?.(draft, generation, sides);
						if (!saved) throw new Error('missing CAS');
						return saved;
					}
				},
				{ debounceMs: 60_000, checkpoint }
			);
			controllers.push(controller);
			controller.schedule({ revision: 1, draft: rich('[Verse]\nFirst') });
			const flushing = controller.flush();
			await entered;
			controller.schedule({ revision: 2, draft: rich('[Verse]\nLatest tonight') });
			controller.checkpoint?.();
			const raw = session.getItem(DEPARTURE_KEY)!;
			expect(checkpoint.read()).toHaveLength(1);
			expect(checkpoint.read()[0]?.precedingWrite).toBeDefined();
			controller.cancelDraft?.('draft');
			finish();
			await flushing;
			session.setItem(DEPARTURE_KEY, raw);
			await recoverDepartureCheckpoint(db, checkpoint);
			const recovered = await recoverStartupDraft(repository);
			expect(recovered.text).toContain('Latest tonight');
			expect(await db.drafts.count()).toBe(1);
			session.setItem(DEPARTURE_KEY, raw);
			await recoverDepartureCheckpoint(db, checkpoint);
			expect(await db.drafts.count()).toBe(1);
			expect(await repository.get(recovered.id)).toEqual(recovered);
		});
	}

	it('continues an in-flight conflict fork without overwriting the competing original', async () => {
		const { db, repository, session, checkpoint } = await setup();
		const original = await repository.create({ ...rich(), storageGeneration: 1 });
		const newer = await repository.compareAndSave?.(
			{ ...rich('[Verse]\nOther tab'), storageGeneration: 1 },
			1
		);
		let entered = () => {};
		let finish = () => {};
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		const controller = createAutosaveController(
			{
				...repository,
				async compareAndSave(draft, generation, sides) {
					const result = await repository.compareAndSave?.(draft, generation, sides);
					if (!result) throw new Error('missing CAS');
					entered();
					await gate;
					return result;
				}
			},
			{ debounceMs: 60_000, checkpoint }
		);
		controllers.push(controller);
		controller.schedule({
			revision: 1,
			draft: { ...original, ...rich('[Verse]\nFirst local'), storageGeneration: 1 }
		});
		const flushing = controller.flush();
		await started;
		controller.schedule({
			revision: 2,
			draft: { ...rich('[Verse]\nLatest local tonight'), storageGeneration: 1 }
		});
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		finish();
		await flushing;
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		const recovered = await recoverStartupDraft(repository);
		expect(recovered.text).toContain('Latest local tonight');
		expect(await repository.get(original.id)).toEqual(newer?.draft);
		expect(await db.drafts.count()).toBe(2);
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect(await db.drafts.count()).toBe(2);
	});

	it('recovers pending media and words after their in-flight predecessor forks into a conflict copy', async () => {
		const { db, repository, session, checkpoint } = await setup();
		const original = await repository.create({ ...rich(), storageGeneration: 1 });
		const competing = await repository.compareAndSave?.(
			{ ...rich('[Verse]\nOther tab'), storageGeneration: 1 },
			1
		);
		let releaseFirst = () => {};
		let releaseSecond = () => {};
		let firstEntered = () => {};
		let secondEntered = () => {};
		const firstReady = new Promise<void>((resolve) => {
			firstEntered = resolve;
		});
		const secondReady = new Promise<void>((resolve) => {
			secondEntered = resolve;
		});
		const firstGate = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const secondGate = new Promise<void>((resolve) => {
			releaseSecond = resolve;
		});
		let writes = 0;
		const controller = createAutosaveController(
			{
				...repository,
				async compareAndSave(draft, generation, sides) {
					if (writes++ === 0) {
						const result = await repository.compareAndSave?.(draft, generation, sides);
						if (!result) throw Error('Missing guarded save');
						firstEntered();
						await firstGate;
						return result;
					}
					secondEntered();
					await secondGate;
					throw Error('Simulated document destruction before pending write committed');
				}
			},
			{ debounceMs: 60_000, checkpoint }
		);
		controllers.push(controller);
		const media = {
			draftId: original.id,
			name: 'Track',
			source: 'youtube' as const,
			videoId: 'dQw4w9WgXcQ',
			attachedAt: original.createdAt,
			position: 12
		};
		controller.schedule({ revision: 1, draft: original, sideRecords: { media } });
		const flushing = controller.flush();
		await firstReady;
		controller.schedule({
			revision: 2,
			draft: { ...rich('[Verse]\nLatest tonight'), storageGeneration: 1 },
			sideRecords: { media: { ...media, position: 16 } }
		});
		releaseFirst();
		await secondReady;
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		releaseSecond();
		await flushing;
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		const recovered = await recoverStartupDraft(repository);
		expect(recovered.text).toContain('Latest tonight');
		expect((await db.mediaHandles.get(recovered.id))?.position).toBe(16);
		expect((await db.mediaHandles.get(recovered.id))?.draftId).toBe(recovered.id);
		expect(await repository.get(original.id)).toEqual(competing?.draft);
		expect(await db.drafts.count()).toBe(2);
	});

	it('preserves the checkpoint when recovery storage or acknowledgement fails', async () => {
		const { db, session, checkpoint, controller } = await setup();
		controller.schedule({
			revision: 1,
			draft: rich(),
			sideRecords: { ignoredDiagnostics: ['mine'] }
		});
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		session.setItem(DEPARTURE_KEY, raw);
		const fail = () => {
			throw new Error('storage rejected');
		};
		db.draftIgnores.hook('creating', fail);
		await expect(recoverDepartureCheckpoint(db, checkpoint)).rejects.toThrow();
		expect(session.getItem(DEPARTURE_KEY)).toBe(raw);
		expect(await db.drafts.count()).toBe(0);
		db.draftIgnores.hook('creating').unsubscribe(fail);
		await expect(recoverDepartureCheckpoint(db, { ...checkpoint, clear: fail })).rejects.toThrow();
		expect(session.getItem(DEPARTURE_KEY)).toBe(raw);
		expect(await db.drafts.count()).toBe(1);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect(await db.drafts.count()).toBe(1);
		expect(session.getItem(DEPARTURE_KEY)).toBeNull();
	});

	for (const draft of [
		rich('[Verse]'),
		{
			...rich(),
			text: '',
			conversion: undefined,
			storageGeneration: 1,
			editorSelection: { anchor: 0, head: 0 }
		}
	]) {
		it(`recovers an empty projection with rich metadata=${!!draft.conversion}`, async () => {
			const { db, repository, session, checkpoint, controller } = await setup();
			if (!draft.conversion) await repository.create({ ...draft, text: 'Previously saved words' });
			controller.schedule({ revision: 2, draft });
			controller.checkpoint?.();
			const raw = session.getItem(DEPARTURE_KEY)!;
			controller.cancel();
			session.setItem(DEPARTURE_KEY, raw);
			await recoverDepartureCheckpoint(db, checkpoint);
			const recovered = await recoverStartupDraft(repository);
			expect(recovered.text).toBe('');
			expect(recovered.conversion).toEqual(draft.conversion);
			expect(recovered.id).toBe(draft.id);
		});
	}

	it('retains unreadable rich originals and a valid blocked reconciliation snapshot', async () => {
		const { db, repository, session, checkpoint, controller } = await setup();
		const unreadable = { ...rich(), conversion: { ...rich().conversion, schema: 999 } };
		await db.table(db.drafts.name).put(unreadable);
		const recovery = await repository.recoverUnreadable?.('draft');
		expect(recovery?.conversionRecovery).toBeDefined();
		if (!recovery?.conversion) throw new Error('missing recovery');
		const text = 'Unreconciled latest tonight';
		const local = {
			...recovery,
			text,
			conversionRecovery: { text, checkpoint: recovery.conversion, reason: 'Unreconciled edit' }
		};
		controller.schedule({ revision: 2, draft: local });
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		controller.cancel();
		session.setItem(DEPARTURE_KEY, raw);
		await recoverDepartureCheckpoint(db, checkpoint);
		expect((await recoverStartupDraft(repository)).conversionRecovery).toEqual(
			local.conversionRecovery
		);
		expect(await db.drafts.get('draft')).toEqual(unreadable);
	});

	it('refuses malformed, oversized, mismatched and duplicate checkpoints without consuming the original bytes', async () => {
		const { db, session, checkpoint, controller } = await setup();
		controller.schedule({ revision: 1, draft: rich() });
		controller.checkpoint?.();
		const raw = session.getItem(DEPARTURE_KEY)!;
		const valid = JSON.parse(raw);
		const badProjection = structuredClone(valid);
		badProjection.snapshots[0].draft.text = 'wrong';
		const badGeneration = structuredClone(valid);
		badGeneration.snapshots[0].draft.storageGeneration = -1;
		const badIdentity = structuredClone(valid);
		badIdentity.snapshots[0].draft.storageWriteId = 'arbitrary';
		const badPredecessor = structuredClone(valid);
		badPredecessor.snapshots[0].precedingWrite = { id: crypto.randomUUID(), generation: 10 };
		const duplicate = structuredClone(valid);
		duplicate.snapshots.push(duplicate.snapshots[0]);
		for (const text of [
			'{',
			'x'.repeat(2 * 1024 * 1024 + 1),
			JSON.stringify({ ...valid, version: 99 }),
			JSON.stringify(badProjection),
			JSON.stringify(badGeneration),
			JSON.stringify(badIdentity),
			JSON.stringify(badPredecessor),
			JSON.stringify(duplicate)
		]) {
			session.setItem(DEPARTURE_KEY, text);
			await expect(recoverDepartureCheckpoint(db, checkpoint)).rejects.toThrow();
			expect(session.getItem(DEPARTURE_KEY)).toBe(text);
			expect(await db.drafts.count()).toBe(0);
		}
		expect(() => parseDepartureCheckpoint(raw)).not.toThrow();
	});

	it('warns when synchronous storage refuses or the checkpoint exceeds its bound', async () => {
		const { repository } = await setup();
		const onCheckpointFailure = vi.fn();
		const checkpoint = createDepartureCheckpoint(() => {
			throw new Error('SecurityError');
		});
		const controller = createAutosaveController(repository, {
			debounceMs: 60_000,
			checkpoint,
			onCheckpointFailure
		});
		controllers.push(controller);
		controller.schedule({ revision: 1, draft: rich() });
		expect(controller.checkpoint?.()).toBe(false);
		expect(onCheckpointFailure).toHaveBeenCalledOnce();
		await controller.flush();
		expect(controller.status()).toBe('saved');
		const bounded = createDepartureCheckpoint(storage);
		expect(() =>
			bounded.write([{ draft: { ...rich(), text: 'x'.repeat(2 * 1024 * 1024) } }])
		).toThrow('too large');
	});
});

import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from '#lib/core/parser.js';
import type { DraftRecord, EditorHandle, EditorSnapshot } from '#lib/core/types.js';
import { importDocument } from '#lib/conversion/import.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { createDepartureCheckpoint } from '#lib/persistence/departure-checkpoint.js';
import { createMemorySessionStorage } from './in-memory.js';
import { createAutosaveController } from '#lib/persistence/autosave.js';
import { createWorkspaceBackup, parseWorkspaceBackup } from '#lib/persistence/backup.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from '#lib/persistence/database.js';
import { createDraftRepository } from '#lib/persistence/draft-repository.js';
import { createDraftIgnoreStore } from '#lib/persistence/draft-ignores.js';
import { createMediaRepository } from '#lib/persistence/media-repository.js';
import { recoverStartupDraft } from '#lib/persistence/recovery.js';
import { createFeedbackState } from './feedback.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { createWorkbenchController } from './workbench.svelte.js';

const databases: LyricLintDatabase[] = [];
afterEach(async () => {
	for (const database of databases.splice(0)) {
		closeDatabase(database);
		await Dexie.delete(database.name);
	}
});
function record(text: string): DraftRecord {
	const imported = importDocument({ text, profile: 'genius', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	const conversion = createConversionEnvelope(imported.value, 'genius', profilePolicyVersions);
	return {
		id: 'song',
		title: 'Song',
		text,
		language: 'en',
		performers: [],
		createdAt: '2026-09-16T00:00:00Z',
		updatedAt: '2026-09-16T00:00:00Z',
		ruleSetVersion: 'test',
		conversion
	};
}
function snapshot(draft: DraftRecord, revision = 0): EditorSnapshot {
	return {
		revision,
		text: draft.text,
		conversion: draft.conversion,
		selection: { anchor: 0, head: 0 },
		parsed: parseDocument(draft.text),
		diagnostics: [],
		composing: false,
		canUndo: revision > 0,
		canRedo: false
	};
}
async function setup() {
	const database = await openDatabase(`workbench-conflicts-${crypto.randomUUID()}`);
	databases.push(database);
	const repository = createDraftRepository(database);
	const initial = await repository.create(record('[Verse]\nOriginal'));
	const ignores = await createDraftIgnoreStore(database);
	const mediaRepository = createMediaRepository(database);
	const storage = createMemorySessionStorage();
	const checkpoint = createDepartureCheckpoint(() => storage);
	const autosave = createAutosaveController(repository, { debounceMs: 60_000, checkpoint });
	let current = snapshot(initial);
	const editor: EditorHandle = {
		focus() {},
		getSnapshot: () => current,
		dispatchAtomic() {},
		undo() {},
		redo() {},
		revealRange() {},
		setSelection() {}
	};
	const audio = new StubAudio();
	const player = createMediaPlayer({
		feedback: createFeedbackState(),
		createAudio: () => audio,
		createObjectUrl: () => 'blob:test',
		revokeObjectUrl() {}
	});
	const controller = createWorkbenchController({
		initialDraft: initial,
		initialSnapshot: current,
		editor,
		repository,
		autosave,
		ignoreStore: ignores,
		mediaRepository,
		mediaPlayer: player,
		onOpenDraft(draft) {
			current = snapshot(draft);
			return current;
		}
	});
	await vi.waitFor(() => expect(controller.media?.restoring).toBe(false));
	return {
		database,
		autosave,
		checkpoint,
		repository,
		controller,
		ignores,
		mediaRepository,
		player,
		audio,
		edit(text: string) {
			current = snapshot(record(text), current.revision + 1);
			controller.onSnapshot(current);
		},
		async remoteSave() {
			const draft = record('[Chorus]\nNewer work');
			const result = await repository.compareAndSave!(draft, 0, {
				media: { draftId: draft.id, name: 'newer.wav', attachedAt: draft.createdAt },
				ignoredDiagnostics: ['remote-ignore']
			});
			return result.draft;
		}
	};
}

describe('actual workbench mutation order across competing writers', () => {
	it.each(['reset', 'delete', 'mixed', 'failed-reset'] as const)(
		'preserves rich pending work through overlapping refused %s operations',
		async (operation) => {
			const run = await setup();
			const entered = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			let attempts = 0;
			const refuse = async () => {
				attempts++;
				entered.resolve();
				await release.promise;
				throw new Error('deletion refused');
			};
			vi.spyOn(run.repository, 'deleteAll').mockImplementation(refuse);
			vi.spyOn(run.repository, 'delete').mockImplementation(refuse);
			await run.controller.media?.attachFile(new File(['local'], 'local.wav'));
			run.ignores.ignore('song', 'local-ignore');
			const latest = '[Verse]\nLatest pending';
			run.edit(latest);
			const other = await run.repository.create({
				...record('[Chorus]\nOther pending'),
				id: 'other'
			});
			run.autosave.schedule({
				revision: 1,
				draft: other,
				sideRecords: { ignoredDiagnostics: ['other-ignore'] }
			});
			if (operation === 'failed-reset') {
				vi.spyOn(run.repository, 'compareAndSave').mockRejectedValue(new Error('write refused'));
				await run.autosave.flush();
				expect(run.autosave.status()).toBe('failed');
				vi.mocked(run.repository.compareAndSave!).mockRestore();
			}
			expect(run.autosave.checkpoint?.()).toBe(true);
			const first =
				operation === 'delete'
					? run.controller.deleteDraft('song')
					: run.controller.deleteAllDrafts();
			await entered.promise;
			const second =
				operation === 'reset' || operation === 'failed-reset'
					? run.controller.deleteAllDrafts()
					: run.controller.deleteDraft('song');
			// Allow both confirmation handlers to reach their first asynchronous boundary.
			await new Promise<void>((resolve) => setTimeout(resolve, 10));
			release.resolve();
			await Promise.all([first, second]);
			expect(attempts).toBe(2);
			expect(run.autosave.checkpoint?.()).toBe(true);
			expect(
				run.checkpoint
					.read()
					.map(({ draft }) => draft.text)
					.sort()
			).toEqual([latest, other.text].sort());
			await run.autosave.flush();
			expect((await run.repository.get('song'))?.text).toBe(latest);
			expect((await run.repository.get('song'))?.conversion).toEqual(
				run.controller.snapshot.conversion
			);
			expect((await run.mediaRepository.get('song'))?.name).toBe('local.wav');
			expect((await run.database.draftIgnores.get('song'))?.keys).toEqual(['local-ignore']);
			expect((await run.database.draftIgnores.get('other'))?.keys).toEqual(['other-ignore']);
			run.autosave.cancel();
			run.player.destroy();
		}
	);

	it.each(['none', 'edit', 'before-fork', 'after-restore', 'cancel'] as const)(
		'restores suspended S2 to the real conflict fork, later edit=%s',
		async (laterEdit) => {
			const run = await setup();
			const remote = await run.remoteSave();
			await run.controller.media?.attachFile(new File(['local'], 'local.wav'));
			const compare = run.repository.compareAndSave!.bind(run.repository);
			const started = Promise.withResolvers<void>();
			const releaseSave = Promise.withResolvers<void>();
			vi.spyOn(run.repository, 'compareAndSave').mockImplementationOnce(async (...args) => {
				started.resolve();
				await releaseSave.promise;
				return compare(...args);
			});
			const deleting = Promise.withResolvers<void>();
			const refuse = Promise.withResolvers<void>();
			vi.spyOn(run.repository, 'deleteAll').mockImplementation(async () => {
				deleting.resolve();
				await refuse.promise;
				throw new Error('reset refused');
			});
			run.edit('[Verse]\nS1');
			const saving = run.autosave.flush();
			await started.promise;
			run.edit('[Verse]\nS2');
			const resetting = run.controller.deleteAllDrafts();
			await deleting.promise;
			if (laterEdit === 'before-fork') run.edit('[Verse]\nS3');
			releaseSave.resolve();
			await saving;
			const forkId = run.controller.draftId;
			expect(forkId).not.toBe('song');
			if (laterEdit === 'edit') run.edit('[Verse]\nS3');
			if (laterEdit === 'cancel') run.autosave.cancel();
			refuse.resolve();
			await resetting;
			expect(run.autosave.checkpoint?.()).toBe(true);
			if (laterEdit === 'none' || laterEdit === 'after-restore') {
				const [resumed] = run.checkpoint.read();
				expect(resumed?.draft.id).toBe(forkId);
				expect(resumed?.draft.text).toBe('[Verse]\nS2');
				expect(resumed?.sideRecords?.media?.draftId).toBe(forkId);
			}
			if (laterEdit === 'after-restore') run.edit('[Verse]\nS3');
			await run.autosave.flush();
			// Also exercise the originally reported later S3, after S2 has resumed.
			if (laterEdit === 'none') {
				expect((await run.repository.get(forkId))?.text).toBe('[Verse]\nS2');
				run.edit('[Verse]\nS3');
				await run.autosave.flush();
			}
			expect(await run.repository.get('song')).toEqual(remote);
			expect((await run.repository.list()).length).toBe(2);
			expect((await run.repository.get(forkId))?.text).toBe(
				laterEdit === 'cancel' ? '[Verse]\nS1' : '[Verse]\nS3'
			);
			expect((await run.mediaRepository.get(forkId))?.draftId).toBe(forkId);
			expect((await run.mediaRepository.get(forkId))?.name).toBe('local.wav');
			expect(await run.database.draftIgnores.get(forkId)).toBeUndefined();
			expect(await run.repository.getCurrent()).toBe(forkId);
			const recovered = await recoverStartupDraft(run.repository, run.mediaRepository);
			expect(recovered.id).toBe(forkId);
			expect(recovered.text).toBe(laterEdit === 'cancel' ? '[Verse]\nS1' : '[Verse]\nS3');
			run.autosave.cancel();
			run.player.destroy();
		}
	);

	it.each(['delete', 'reset'] as const)(
		'successful %s discards suspended rich saves and recovery',
		async (operation) => {
			const run = await setup();
			await run.controller.media?.attachFile(new File(['local'], 'local.wav'));
			run.ignores.ignore('song', 'local-ignore');
			run.edit('[Verse]\nPending');
			expect(run.autosave.checkpoint?.()).toBe(true);
			if (operation === 'delete') await run.controller.deleteDraft('song');
			else await run.controller.deleteAllDrafts();
			await run.autosave.flush();
			expect(await run.repository.get('song')).toBeUndefined();
			expect(await run.mediaRepository.get('song')).toBeUndefined();
			expect(await run.database.draftIgnores.get('song')).toBeUndefined();
			expect(run.checkpoint.read()).toEqual([]);
			run.autosave.cancel();
			run.player.destroy();
		}
	);

	it('saves a stale clear as a recoverable empty conflict copy without deleting newer work', async () => {
		const run = await setup();
		const remote = await run.remoteSave();
		run.edit('');
		await run.controller.flushAutosave();
		expect(await run.repository.get('song')).toEqual(remote);
		expect((await run.mediaRepository.get('song'))?.name).toBe('newer.wav');
		expect((await run.database.draftIgnores.get('song'))?.keys).toEqual(['remote-ignore']);
		const local = await run.repository.get(run.controller.draftId);
		expect(local?.id).not.toBe('song');
		expect(local?.text).toBe('');
		expect(local?.conversion).toBeDefined();
		expect((await recoverStartupDraft(run.repository, run.mediaRepository)).id).toBe(local?.id);
		expect(await run.repository.get('song')).toEqual(remote);
		run.player.destroy();
	});

	it('keeps attachment and ignore mutations local until CAS forks them together', async () => {
		const run = await setup();
		const remote = await run.remoteSave();
		await run.controller.media?.attachFile(new File(['local'], 'local.wav'));
		run.ignores.ignore('song', 'local-ignore');
		expect((await run.mediaRepository.get('song'))?.name).toBe('newer.wav');
		expect((await run.database.draftIgnores.get('song'))?.keys).toEqual(['remote-ignore']);
		await run.controller.flushAutosave();
		const localId = run.controller.draftId;
		expect(localId).not.toBe('song');
		expect(await run.repository.get('song')).toEqual(remote);
		expect((await run.mediaRepository.get('song'))?.name).toBe('newer.wav');
		expect((await run.database.draftIgnores.get('song'))?.keys).toEqual(['remote-ignore']);
		expect((await run.mediaRepository.get(localId))?.name).toBe('local.wav');
		expect((await run.database.draftIgnores.get(localId))?.keys).toEqual(['local-ignore']);
		expect(run.controller.media?.storageSnapshot()?.draftId).toBe(localId);
		const backup = createWorkspaceBackup(run.database, { ignoreStore: run.ignores });
		const portable = parseWorkspaceBackup(await backup.serialize());
		expect(portable.ignoredDiagnostics.find((entry) => entry.draftId === 'song')?.keys).toEqual([
			'remote-ignore'
		]);
		expect(portable.ignoredDiagnostics.find((entry) => entry.draftId === localId)?.keys).toEqual([
			'local-ignore'
		]);
		backup.destroy();
		// Detach and restore are also guarded writes, including empty side records.
		await run.controller.media?.detach();
		run.ignores.restore(localId, 'local-ignore');
		expect((await run.mediaRepository.get(localId))?.name).toBe('local.wav');
		await run.controller.flushAutosave();
		expect(await run.mediaRepository.get(localId)).toBeUndefined();
		expect(await run.database.draftIgnores.get(localId)).toBeUndefined();
		expect((await run.mediaRepository.get('song'))?.name).toBe('newer.wav');
		await run.controller.openDraft('song');
		expect(run.ignores.list('song')).toEqual(['remote-ignore']);
		// Clearing the mirror after explicit deletion must not schedule a resurrection.
		await run.controller.deleteDraft('song');
		await run.controller.flushAutosave();
		expect(await run.repository.get('song')).toBeUndefined();
		run.player.destroy();
	});

	it('commits side-only changes and playhead checkpoints with the current draft generation', async () => {
		const run = await setup();
		await run.controller.media?.attachFile(new File(['local'], 'local.wav'));
		run.ignores.ignore('song', 'local-ignore');
		await run.controller.flushAutosave();
		expect((await run.repository.get('song'))?.storageGeneration).toBeGreaterThan(0);
		expect((await run.mediaRepository.get('song'))?.name).toBe('local.wav');
		expect((await run.database.draftIgnores.get('song'))?.keys).toEqual(['local-ignore']);
		run.audio.setDuration(120);
		run.audio.currentTime = 35;
		await run.controller.flushAutosave();
		expect((await run.mediaRepository.get('song'))?.position).toBe(35);
		run.player.destroy();
	});

	it('rechecks the generation before sweeping a historical blank record', async () => {
		const run = await setup();
		const blank = record('');
		delete blank.conversion;
		await run.database.drafts.put(blank);
		const listRecords = run.repository.listRecords.bind(run.repository);
		const competingRepository = {
			...run.repository,
			async listRecords() {
				const stale = await listRecords();
				await run.repository.compareAndSave!(record('[Chorus]\nNewer work'), 0);
				return stale;
			}
		};
		const recovered = await recoverStartupDraft(competingRepository, run.mediaRepository);
		expect(recovered.text).toBe('[Chorus]\nNewer work');
		expect((await run.repository.get('song'))?.text).toBe(recovered.text);
		run.player.destroy();
	});
});

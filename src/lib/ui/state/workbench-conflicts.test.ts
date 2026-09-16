import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { DraftRecord, EditorHandle, EditorSnapshot } from '$lib/core/types.js';
import { importDocument } from '$lib/conversion/import.js';
import { profilePolicyVersions } from '$lib/profiles/versions.js';
import { createConversionEnvelope } from '$lib/persistence/conversion.js';
import { createAutosaveController } from '$lib/persistence/autosave.js';
import { createWorkspaceBackup, parseWorkspaceBackup } from '$lib/persistence/backup.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from '$lib/persistence/database.js';
import { createDraftRepository } from '$lib/persistence/draft-repository.js';
import { createDraftIgnoreStore } from '$lib/persistence/draft-ignores.js';
import { createMediaRepository } from '$lib/persistence/media-repository.js';
import { recoverStartupDraft } from '$lib/persistence/recovery.js';
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
	const autosave = createAutosaveController(repository, { debounceMs: 60_000 });
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

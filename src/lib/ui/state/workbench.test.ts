import { parseDocument } from '$lib/core/parser.js';
import type {
	AutosaveController,
	AutosaveSnapshot,
	DraftRecord,
	DraftRepository,
	EditorHandle,
	EditorSnapshot
} from '$lib/core/types.js';
import { describe, expect, test, vi } from 'vitest';
import {
	createContractSessionIgnoreStore,
	createInMemoryDraftRepository,
	createMemorySessionStorage
} from './in-memory.js';
import { createWorkbenchController } from './workbench.svelte.js';

function draft(id: string, text = '[Verse]\nLine'): DraftRecord {
	return {
		id,
		title: id === 'draft-a' ? 'First song' : 'Second song',
		text,
		language: 'en',
		performers: [],
		createdAt: '2026-07-20T10:00:00.000Z',
		updatedAt: '2026-07-20T10:00:00.000Z',
		ruleSetVersion: '2026.7',
		editorSelection: { anchor: 0, head: 0 }
	};
}

function snapshot(record: DraftRecord, revision = 0, text = record.text): EditorSnapshot {
	return {
		revision,
		text,
		selection: record.editorSelection ?? { anchor: 0, head: 0 },
		parsed: parseDocument(text),
		diagnostics: [],
		composing: false,
		canUndo: revision > 0,
		canRedo: false
	};
}

function controllableAutosave(repository: DraftRepository, events: string[] = []) {
	let pending: AutosaveSnapshot | undefined;
	let status: ReturnType<AutosaveController['status']> = 'idle';
	const scheduled: AutosaveSnapshot[] = [];

	const autosave: AutosaveController = {
		schedule(next) {
			pending = next;
			scheduled.push(next);
			status = 'scheduled';
			events.push(`schedule:${next.draft.id}:${next.draft.title}`);
		},
		async flush() {
			events.push('flush');
			if (!pending) return;
			const current = pending;
			pending = undefined;
			status = 'saving';
			await repository.save(current.draft);
			status = 'saved';
		},
		cancel() {
			events.push('cancel');
			pending = undefined;
			status = 'idle';
		},
		cancelDraft(id) {
			events.push(`cancelDraft:${id}`);
			if (pending?.draft.id === id) pending = undefined;
		},
		status() {
			return status;
		}
	};

	return { autosave, scheduled };
}

function setup(options: {
	initial?: DraftRecord;
	drafts?: DraftRecord[];
	repository?: DraftRepository;
	autosave?: AutosaveController;
	onOpenDraft?: (draft: DraftRecord) => EditorSnapshot;
	initialRecentLanguages?: readonly string[];
}) {
	const initial = options.initial ?? draft('draft-a');
	const repository =
		options.repository ?? createInMemoryDraftRepository(options.drafts ?? [initial]);
	const autosave = options.autosave ?? controllableAutosave(repository).autosave;
	let currentSnapshot = snapshot(initial);
	const editor: EditorHandle = {
		focus() {},
		getSnapshot: () => currentSnapshot,
		dispatchAtomic() {},
		undo() {},
		redo() {},
		revealRange() {},
		setSelection() {}
	};
	const onOpenDraft =
		options.onOpenDraft ??
		((nextDraft: DraftRecord) => {
			currentSnapshot = snapshot(nextDraft, 0);
			return currentSnapshot;
		});
	const controller = createWorkbenchController({
		editor,
		initialSnapshot: currentSnapshot,
		initialDraft: initial,
		initialRecentLanguages: options.initialRecentLanguages,
		repository,
		autosave,
		ignoreStore: createContractSessionIgnoreStore(createMemorySessionStorage()),
		idFactory: vi.fn(() => `generated-${Math.random().toString(36).slice(2)}`),
		now: () => '2026-07-20T11:00:00.000Z',
		onOpenDraft
	});
	return { controller, repository, autosave };
}

describe('workbench draft safety', () => {
	test('keeps polling as a fallback until a late autosave failure is visible', () => {
		vi.useFakeTimers();
		try {
			const first = draft('draft-a');
			const repository = createInMemoryDraftRepository([first]);
			let status: ReturnType<AutosaveController['status']> = 'idle';
			const autosave: AutosaveController = {
				schedule() {
					status = 'scheduled';
				},
				async flush() {},
				cancel() {
					status = 'idle';
				},
				status: () => status
			};
			const { controller } = setup({ initial: first, repository, autosave });
			controller.onSnapshot(snapshot(first, 1, '[Verse]\nPending'));

			status = 'saving';
			vi.advanceTimersByTime(250);
			expect(controller.saveStatus).toBe('saving');
			status = 'failed';
			vi.advanceTimersByTime(250);

			expect(controller.saveStatus).toBe('failed');
		} finally {
			vi.useRealTimers();
		}
	});

	test('accepts revision 1 after two draft switches and schedules the edit', async () => {
		const first = draft('draft-a');
		const second = draft('draft-b');
		const repository = createInMemoryDraftRepository([first, second]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			drafts: [first, second],
			repository,
			autosave: controlled.autosave
		});

		await controller.openDraft(second.id);
		await controller.openDraft(first.id);
		const edited = snapshot(first, 1, '[Verse]\nEdited after switching twice');
		controller.onSnapshot(edited);

		expect(controller.snapshot.text).toBe(edited.text);
		expect(controlled.scheduled.at(-1)?.draft.text).toBe(edited.text);
		expect(controlled.scheduled.at(-1)?.draft.id).toBe(first.id);
	});

	test('flushes the previous draft before creating a new one', async () => {
		const first = draft('draft-a');
		const events: string[] = [];
		const baseRepository = createInMemoryDraftRepository([first]);
		const repository: DraftRepository = {
			...baseRepository,
			async create(record) {
				events.push('create');
				return baseRepository.create(record);
			}
		};
		const controlled = controllableAutosave(repository, events);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nUnsaved edit'));

		await controller.createDraft();

		expect(events.indexOf('flush')).toBeLessThan(events.indexOf('create'));
		expect((await repository.get(first.id))?.text).toBe('[Verse]\nUnsaved edit');
	});

	test('uses the last selected language for a new draft', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});

		controller.setLanguage('fr');
		await controller.createDraft();

		expect(controller.language).toBe('fr');
		expect(controller.draftId).not.toBe(first.id);
		expect((await repository.get(controller.draftId))?.language).toBe('fr');
	});

	test('keeps recent languages in deduplicated most-recent-first order', () => {
		const { controller } = setup({
			initialRecentLanguages: ['no', 'fr', 'de', 'es', 'ja']
		});

		expect(controller.recentLanguages).toEqual(['en', 'no', 'fr', 'de', 'es']);

		controller.setLanguage('fr');
		expect(controller.recentLanguages).toEqual(['fr', 'en', 'no', 'de', 'es']);

		controller.setLanguage('ko');
		expect(controller.recentLanguages).toEqual(['ko', 'fr', 'en', 'no', 'de']);
	});

	test('flushes before reading another draft and treats reopening the current draft as flush-only', async () => {
		const first = draft('draft-a');
		const second = draft('draft-b');
		const events: string[] = [];
		const baseRepository = createInMemoryDraftRepository([first, second]);
		const repository: DraftRepository = {
			...baseRepository,
			async get(id) {
				events.push(`get:${id}`);
				return baseRepository.get(id);
			}
		};
		const controlled = controllableAutosave(repository, events);
		const onOpenDraft = vi.fn((record: DraftRecord) => snapshot(record, 0));
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave,
			onOpenDraft
		});

		events.length = 0;
		await controller.openDraft(second.id);
		expect(events.indexOf('flush')).toBeLessThan(events.indexOf(`get:${second.id}`));
		expect(onOpenDraft).toHaveBeenCalledTimes(1);

		events.length = 0;
		await controller.openDraft(second.id);
		expect(events).toEqual(['flush']);
		expect(onOpenDraft).toHaveBeenCalledTimes(1);
	});

	test('flushes before duplicating so the copy includes a debounced current edit', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nLatest edit'));

		await controller.duplicateDraft(first.id);

		const duplicate = (await repository.list()).find((entry) => entry.id !== first.id);
		expect(duplicate).toBeDefined();
		expect((await repository.get(duplicate!.id))?.text).toBe('[Verse]\nLatest edit');
	});

	test('cancels a draft-specific pending write before delete so flush cannot resurrect it', async () => {
		const first = draft('draft-a');
		const second = draft('draft-b');
		const events: string[] = [];
		const baseRepository = createInMemoryDraftRepository([first, second]);
		const repository: DraftRepository = {
			...baseRepository,
			async delete(id) {
				events.push(`delete:${id}`);
				await baseRepository.delete(id);
			}
		};
		const controlled = controllableAutosave(repository, events);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nPending resurrection'));

		await controller.deleteDraft(first.id);
		await controlled.autosave.flush();

		expect(events.indexOf(`cancelDraft:${first.id}`)).toBeLessThan(
			events.indexOf(`delete:${first.id}`)
		);
		expect(await repository.get(first.id)).toBeUndefined();
	});

	test('queues the current draft again after rename so an older title cannot win', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nPending'));

		await controller.renameDraft(first.id, 'Fresh title');
		await controlled.autosave.flush();

		expect(controlled.scheduled.at(-1)?.draft.title).toBe('Fresh title');
		expect((await repository.get(first.id))?.title).toBe('Fresh title');
	});
});

describe('workbench performer imports', () => {
	test('adds exact pasted names through roster undo and exposes case suggestions', () => {
		const initial = draft('draft-a', '');
		const repository = createInMemoryDraftRepository([initial]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial,
			repository,
			autosave: controlled.autosave
		});
		const pasted = '[Chorus: Avery, <i>avery</i>]\nA long enough lyric line for import detection';

		controller.onSnapshot(snapshot(initial, 1, pasted));

		expect(controller.performers.map((entry) => entry.displayName)).toEqual(['Avery', 'avery']);
		expect(controller.rosterSuggestions).toEqual([
			expect.objectContaining({ sourceName: 'avery', targetName: 'Avery', reason: 'case' })
		]);
		// One user action (the paste) coalesces into exactly one toast whose
		// single Undo reverts the whole imported batch.
		expect(controller.feedback.toasts).toHaveLength(1);
		expect(controller.feedback.toasts.at(-1)?.message).toContain('Imported 2 performers');

		controller.feedback.toasts.at(-1)?.action?.();
		expect(controller.performers).toEqual([]);
	});

	test('imports on an explicit short draft open and surfaces unresolved styled voices', async () => {
		const first = draft('draft-a', '');
		const second = draft(
			'draft-b',
			'[Chorus: Avery]\nA long plain lyric with <i>an unmatched styled voice</i>'
		);
		const repository = createInMemoryDraftRepository([first, second]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});

		await controller.openDraft(second.id);

		expect(controller.performers.map((entry) => entry.displayName)).toEqual([
			'Avery',
			'Unresolved voice 2'
		]);
		expect(controller.unresolvedVoiceGroups).toEqual([
			expect.objectContaining({ rawNameText: 'Unresolved voice 2', styleSlot: 2 })
		]);
		expect(controller.snapshot.text).toBe(second.text);
	});
});

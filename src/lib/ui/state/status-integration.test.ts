import { parseDocument } from '$lib/core/parser.js';
import type { DraftRecord, EditorSnapshot } from '$lib/core/types.js';
import { createAutosaveController } from '$lib/persistence/autosave.js';
import { describe, expect, test, vi } from 'vitest';
import {
	createContractIgnoreStore,
	createInMemoryDraftRepository,
	createMemorySessionStorage
} from './in-memory.js';
import { createWorkbenchController } from './workbench.svelte.js';

const record: DraftRecord = {
	id: 'draft-a',
	title: 'First song',
	text: '[Verse]\nLine',
	language: 'en',
	performers: [],
	createdAt: '2026-07-20T10:00:00.000Z',
	updatedAt: '2026-07-20T10:00:00.000Z',
	ruleSetVersion: '2026.7',
	editorSelection: { anchor: 0, head: 0 }
};

function snap(revision: number, text: string): EditorSnapshot {
	return {
		revision,
		text,
		selection: { anchor: 0, head: 0 },
		parsed: parseDocument(text),
		diagnostics: [],
		composing: false,
		canUndo: revision > 0,
		canRedo: false
	};
}

describe('real autosave + workbench status integration', () => {
	test('saveStatus settles to saved after an edit', async () => {
		vi.useFakeTimers();
		try {
			const repository = createInMemoryDraftRepository([record]);
			const statusEvents: string[] = [];
			const controllerRef: { current?: ReturnType<typeof createWorkbenchController> } = {};
			const autosave = createAutosaveController(repository, {
				onStatusChange: (status) => {
					statusEvents.push(status);
					controllerRef.current?.setSaveStatus(status);
				}
			});
			const initialSnapshot = snap(0, record.text);
			const controller = createWorkbenchController({
				editor: {
					focus() {},
					getSnapshot: () => initialSnapshot,
					dispatchAtomic() {},
					undo() {},
					redo() {},
					revealRange() {},
					setSelection() {}
				},
				initialSnapshot,
				initialDraft: record,
				repository,
				autosave,
				ignoreStore: createContractIgnoreStore(createMemorySessionStorage()),
				now: () => '2026-07-20T11:00:00.000Z'
			});
			controllerRef.current = controller;

			controller.onSnapshot(snap(1, '[Verse]\nLine edited'));
			expect(controller.saveStatus).toBe('scheduled');
			await vi.advanceTimersByTimeAsync(600);
			expect(statusEvents).toContain('saved');
			expect(controller.saveStatus).toBe('saved');
		} finally {
			vi.useRealTimers();
		}
	});

	/*
	 * The first-timer's whole question. A new visitor types, waits, and opens the
	 * drafts menu to find out whether any of it is safe — and the menu read a list
	 * fetched once at boot, so it said "No saved 'scribes yet" over a record
	 * already on disk until a reload or some other draft operation happened to
	 * re-read it. The toolbar deliberately draws nothing while saving is going
	 * well, so this was the only answer on screen.
	 */
	test('lists a draft as soon as its first save lands', async () => {
		vi.useFakeTimers();
		try {
			// A first visit: nothing stored, and the draft the page boots on is the
			// empty transient one, which has no record until it has words.
			const repository = createInMemoryDraftRepository([]);
			const fresh: DraftRecord = { ...record, text: '', title: 'Untitled transcription' };
			const controllerRef: { current?: ReturnType<typeof createWorkbenchController> } = {};
			const autosave = createAutosaveController(repository, {
				onStatusChange: (status) => controllerRef.current?.setSaveStatus(status)
			});
			const initialSnapshot = snap(0, fresh.text);
			const controller = createWorkbenchController({
				editor: {
					focus() {},
					getSnapshot: () => initialSnapshot,
					dispatchAtomic() {},
					undo() {},
					redo() {},
					revealRange() {},
					setSelection() {}
				},
				initialSnapshot,
				initialDraft: fresh,
				repository,
				autosave,
				ignoreStore: createContractIgnoreStore(createMemorySessionStorage()),
				now: () => '2026-07-20T11:00:00.000Z'
			});
			controllerRef.current = controller;
			await vi.advanceTimersByTimeAsync(0);
			expect(controller.drafts).toEqual([]);

			controller.onSnapshot(snap(1, '[Verse]\nFirst words'));
			await vi.advanceTimersByTimeAsync(600);

			expect((await repository.get(fresh.id))?.text).toBe('[Verse]\nFirst words');
			expect(controller.drafts.map(({ id }) => id)).toEqual([fresh.id]);
		} finally {
			vi.useRealTimers();
		}
	});

	// Every landed save, not only the record-creating one: the row carries the
	// draft's own `updatedAt` and the list is ordered by it, so a list re-read
	// once would report yesterday's date under a draft being typed into now.
	test('keeps the listed draft’s date current as it is typed into', async () => {
		vi.useFakeTimers();
		try {
			const stale: DraftRecord = { ...record, updatedAt: '2026-07-19T10:00:00.000Z' };
			const repository = createInMemoryDraftRepository([stale]);
			const controllerRef: { current?: ReturnType<typeof createWorkbenchController> } = {};
			const autosave = createAutosaveController(repository, {
				onStatusChange: (status) => controllerRef.current?.setSaveStatus(status)
			});
			const initialSnapshot = snap(0, stale.text);
			const controller = createWorkbenchController({
				editor: {
					focus() {},
					getSnapshot: () => initialSnapshot,
					dispatchAtomic() {},
					undo() {},
					redo() {},
					revealRange() {},
					setSelection() {}
				},
				initialSnapshot,
				initialDraft: stale,
				repository,
				autosave,
				ignoreStore: createContractIgnoreStore(createMemorySessionStorage()),
				now: () => '2026-07-20T11:00:00.000Z'
			});
			controllerRef.current = controller;
			await vi.advanceTimersByTimeAsync(0);
			expect(controller.drafts[0]?.updatedAt).toBe('2026-07-19T10:00:00.000Z');

			controller.onSnapshot(snap(1, '[Verse]\nLine edited'));
			await vi.advanceTimersByTimeAsync(600);

			expect(controller.drafts[0]?.updatedAt).toBe('2026-07-20T11:00:00.000Z');
		} finally {
			vi.useRealTimers();
		}
	});
});

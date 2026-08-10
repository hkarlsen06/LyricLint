import { parseDocument } from '$lib/core/parser.js';
import type { DraftRecord, EditorHandle, EditorSnapshot } from '$lib/core/types.js';
import { createAutosaveController } from '$lib/persistence/index.js';
import { describe, expect, it, vi } from 'vitest';
import {
	createContractIgnoreStore,
	createInMemoryDraftRepository,
	createMemorySessionStorage
} from './in-memory.js';
import { createWorkbenchController } from './workbench.svelte.js';

function draft(text: string): DraftRecord {
	return {
		id: 'draft-a',
		title: 'Undo persistence',
		text,
		language: 'en',
		performers: [],
		createdAt: '2026-07-24T08:00:00.000Z',
		updatedAt: '2026-07-24T08:00:00.000Z',
		ruleSetVersion: 'test',
		editorSelection: { anchor: 0, head: 0 }
	};
}

function snapshot(text: string, revision: number): EditorSnapshot {
	return {
		revision,
		text,
		selection: { anchor: text.length, head: text.length },
		parsed: parseDocument(text),
		diagnostics: [],
		composing: false,
		canUndo: revision > 0,
		canRedo: false
	};
}

describe('workbench undo after a durable autosave', () => {
	it('persists the reverted snapshot on the autosave following editor undo', async () => {
		const original = '[Verse]\nOriginal line';
		const edited = '[Verse]\nEdited line';
		const initialDraft = draft(original);
		const repository = createInMemoryDraftRepository([initialDraft]);
		const autosave = createAutosaveController(repository, { debounceMs: 60_000 });
		let currentSnapshot = snapshot(original, 0);
		let onUndo: () => void = () => {};
		const editor: EditorHandle = {
			focus() {},
			getSnapshot: () => currentSnapshot,
			dispatchAtomic() {},
			undo: () => onUndo(),
			redo() {},
			revealRange() {},
			setSelection() {}
		};
		const controller = createWorkbenchController({
			editor,
			initialSnapshot: currentSnapshot,
			initialDraft,
			repository,
			autosave,
			ignoreStore: createContractIgnoreStore(createMemorySessionStorage()),
			now: vi.fn(() => '2026-07-24T08:01:00.000Z')
		});
		onUndo = () => {
			currentSnapshot = snapshot(original, 2);
			controller.onSnapshot(currentSnapshot);
		};

		currentSnapshot = snapshot(edited, 1);
		controller.onSnapshot(currentSnapshot);
		await controller.flushAutosave();
		expect((await repository.get(initialDraft.id))?.text).toBe(edited);

		controller.undo();
		expect(controller.snapshot.text).toBe(original);
		expect(controller.snapshot.revision).toBe(2);

		await controller.flushAutosave();
		expect((await repository.get(initialDraft.id))?.text).toBe(original);
		expect((await repository.get(initialDraft.id))?.editorSelection).toEqual({
			anchor: original.length,
			head: original.length
		});
	});
});

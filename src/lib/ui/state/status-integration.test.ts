import { parseDocument } from '$lib/core/parser.js';
import type { DraftRecord, EditorSnapshot } from '$lib/core/types.js';
import { createAutosaveController } from '$lib/persistence/autosave.js';
import { describe, expect, test, vi } from 'vitest';
import {
	createContractSessionIgnoreStore,
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
				ignoreStore: createContractSessionIgnoreStore(createMemorySessionStorage()),
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
});

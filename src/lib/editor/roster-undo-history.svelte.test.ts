import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';
import { createWorkbenchController } from '#lib/ui/state/workbench.svelte.js';
import { createAutosaveController } from '#lib/persistence/autosave.js';
import {
	createContractIgnoreStore,
	createInMemoryDraftRepository,
	createMemorySessionStorage
} from '#lib/ui/state/in-memory.js';
import type { DraftRecord } from '#lib/core/types.js';

const editors: LyricEditorInstance[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

describe('roster toast and editor history', () => {
	it('keeps legacy Genius source and roster atomic through rename, undo and redo', () => {
		const text =
			'[Verse: Mira & <i>Noor</i>]\nMira carries the light\n<i>Noor answers</i>\n\n[Chorus: Mira & Noor]\nBoth hold the line';
		const initial: DraftRecord = {
			id: 'legacy',
			title: 'Legacy',
			text,
			language: 'en',
			performers: [],
			createdAt: '2026-11-05T00:00:00.000Z',
			updatedAt: '2026-11-05T00:00:00.000Z',
			ruleSetVersion: 'test'
		};
		const repository = createInMemoryDraftRepository([initial]);
		const host = document.createElement('div');
		document.body.append(host);
		const editor = createLyricEditor(host, {
			initialText: text,
			context: { language: 'en', performers: [], ruleSetVersion: 'test' },
			callbacks: {
				onSnapshot: vi.fn(),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: vi.fn()
			}
		});
		editors.push(editor);
		const controller = createWorkbenchController({
			editor: editor.handle,
			initialSnapshot: editor.handle.getSnapshot(),
			initialDraft: initial,
			repository,
			autosave: createAutosaveController(repository),
			ignoreStore: createContractIgnoreStore(createMemorySessionStorage())
		});
		editor.updateCallbacks({
			onSnapshot: (value) => controller.onSnapshot(value),
			onPerformerRecordsChanged: (delta) => controller.adoptPerformerRecords(delta),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		});
		const refresh = () =>
			editor.updateContext({
				language: 'en',
				performers: controller.performers,
				ruleSetVersion: 'test'
			});
		const noor = controller.performers.find((record) => record.displayName === 'Noor')!;
		expect(noor).toBeDefined();
		refresh();
		controller.renamePerformer(noor.id, 'Nora');
		refresh();
		const renamed = text
			.replace('<i>Noor</i>', '<i>Nora</i>')
			.replace('Mira & Noor]', 'Mira & Nora]');
		expect(editor.handle.getSnapshot().text).toBe(renamed);
		controller.addPerformer('Independent');
		refresh();
		editor.handle.undo();
		refresh();
		expect(editor.handle.getSnapshot().text).toBe(text);
		expect(controller.performers.find((record) => record.id === noor.id)).toEqual(noor);
		expect(controller.performers.map((record) => record.displayName)).toContain('Independent');
		editor.handle.redo();
		refresh();
		expect(editor.handle.getSnapshot().text).toBe(renamed);
		expect(controller.performers.find((record) => record.id === noor.id)?.displayName).toBe('Nora');
		expect(controller.performers.find((record) => record.id === noor.id)?.aliases).toContain(
			'Noor'
		);
		expect(editor.handle.getSnapshot().conversion).toBeUndefined();
		editor.handle.switchProfile!('musixmatch');
		expect(editor.handle.getSnapshot().text).toBe(
			'Mira carries the light\nNoor answers\n\nBoth hold the line'
		);
		editor.handle.switchProfile!('genius');
		expect(editor.handle.getSnapshot().text).toBe(renamed);
		expect(controller.performers.filter((record) => record.displayName === 'Nora')).toHaveLength(1);
	});
	it.each(['undone', 'cleared'])(
		'cannot resurrect an orphaned performer after an assignment is %s',
		(operation) => {
			const initial: DraftRecord = {
				id: 'song',
				title: 'Song',
				text: '[Verse]\nMoon',
				language: 'en',
				performers: [],
				createdAt: '2026-11-05T00:00:00.000Z',
				updatedAt: '2026-11-05T00:00:00.000Z',
				ruleSetVersion: 'test'
			};
			const repository = createInMemoryDraftRepository([initial]);
			const host = document.createElement('div');
			document.body.append(host);
			const editor = createLyricEditor(host, {
				initialText: initial.text,
				context: { language: 'en', performers: [], ruleSetVersion: 'test' },
				callbacks: {
					onSnapshot: vi.fn(),
					onPerformerRecordsChanged: vi.fn(),
					onAssignRequest: vi.fn(),
					onSectionHeaderRequest: vi.fn(),
					onDiagnosticActivate: vi.fn(),
					onAnnouncement: vi.fn()
				}
			});
			editors.push(editor);
			const controller = createWorkbenchController({
				editor: editor.handle,
				initialSnapshot: editor.handle.getSnapshot(),
				initialDraft: initial,
				repository,
				autosave: createAutosaveController(repository),
				ignoreStore: createContractIgnoreStore(createMemorySessionStorage())
			});
			editor.updateCallbacks({
				onSnapshot: (value) => controller.onSnapshot(value),
				onPerformerRecordsChanged: (delta) => controller.adoptPerformerRecords(delta),
				onAssignRequest: vi.fn(),
				onSectionHeaderRequest: vi.fn(),
				onDiagnosticActivate: vi.fn(),
				onAnnouncement: vi.fn()
			});
			const refresh = () =>
				editor.updateContext({
					language: 'en',
					performers: controller.performers,
					ruleSetVersion: 'test'
				});
			editor.handle.switchProfile!('musixmatch');
			controller.addPerformer('Mira');
			const added = controller.feedback.toasts.at(-1)!.id;
			refresh();
			const before = editor.handle.getSnapshot();
			expect(
				editor.handle.dispatchConversionAction!(
					{
						kind: 'assignVoice',
						sectionId: before.conversion!.model.sections[0]!.id,
						range: { from: 0, to: 4 },
						performerIds: [controller.performers[0]!.id]
					},
					before.revision
				)
			).toEqual({ ok: true });
			if (operation === 'undone') editor.handle.undo();
			else {
				const assigned = editor.handle.getSnapshot();
				expect(
					editor.handle.dispatchConversionAction!({ kind: 'clearDocument' }, assigned.revision)
				).toEqual({ ok: true });
			}
			controller.feedback.runToastAction(added);
			refresh();
			expect(controller.performers).toEqual([]);
			const assertOwned = () => {
				const rosterIds = new Set(controller.performers.map((record) => record.id));
				for (const voice of editor.handle.getSnapshot().conversion!.model.voices)
					for (const id of voice.performerIds) expect(rosterIds.has(id)).toBe(true);
			};
			editor.handle.redo();
			assertOwned();
			expect(editor.handle.getSnapshot().conversion!.model.voices).toEqual([]);
			editor.handle.undo();
			refresh();
			expect(controller.performers[0]?.displayName).toBe('Mira');
			assertOwned();
			if (operation === 'cleared') {
				editor.handle.undo();
				assertOwned();
				expect(editor.handle.getSnapshot().conversion!.model.voices).toHaveLength(1);
			}
			editor.handle.redo();
			assertOwned();
		}
	);
});

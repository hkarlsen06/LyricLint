import { afterEach, expect, it, vi } from 'vitest';
import { createLyricEditor, type LyricEditorInstance } from './create-editor.js';
import { createWorkbenchController } from '#lib/ui/state/workbench.svelte.js';
import { createAutosaveController } from '#lib/persistence/autosave.js';
import {
	createContractIgnoreStore,
	createInMemoryDraftRepository,
	createMemorySessionStorage
} from '#lib/ui/state/in-memory.js';
import { isolateHistory } from '@codemirror/commands';
import { setComposingEffect } from './extensions/editor-state.js';
import { parseScribe, serializeScribe } from '#lib/scribe/format.js';
import type { DraftRecord } from '#lib/core/types.js';

const editors: LyricEditorInstance[] = [];
afterEach(() => {
	for (const editor of editors.splice(0)) {
		const host = editor.view.dom.parentElement;
		editor.destroy();
		host?.remove();
	}
});

const fixture =
	'[Verse: Mira]\nThe [silver compass](123456) by the door\n<i>Stay beside me</i>\n\n[Chorus: Noor]\nHold the light\n\n[Chorus 2: Noor]\nHold the light';
function mount() {
	const initial: DraftRecord = {
		id: 'new',
		title: 'New',
		text: '',
		language: 'en',
		performers: [],
		createdAt: '2026-11-06',
		updatedAt: '2026-11-06',
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
		getNextPerformerOrder: () => controller.nextPerformerOrder,
		onPerformerRenamed: ({ performerId, previousName, displayName }) =>
			controller.adoptHeaderRename(performerId, previousName, displayName),
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

	return { editor, controller, refresh, repository };
}
function insert(editor: LyricEditorInstance, text: string) {
	editor.view.dispatch({
		changes: { from: editor.view.state.doc.length, insert: text },
		userEvent: 'input.type',
		annotations: isolateHistory.of('full')
	});
}
function bound(
	editor: LyricEditorInstance,
	controller: ReturnType<typeof createWorkbenchController>
) {
	const voices = editor.handle
		.getSnapshot()
		.conversion!.model.voices.filter((voice) => voice.rawNameText === 'Noor');
	expect(voices).toHaveLength(2);
	const noor = controller.performers.find((record) => record.displayName === 'Noor')!;
	expect(noor).toBeDefined();
	for (const voice of voices) {
		expect(voice.performerIds).toEqual([noor.id]);
		expect(voice.anonymous).not.toBe(true);
	}
	return voices;
}
it('discovers short native-sized headers before first promotion and retains bindings through Scribe and history', () => {
	const { editor, controller, refresh } = mount();
	for (const [index, line] of fixture.split('\n').entries()) {
		if (index) insert(editor, '\n');
		insert(editor, line);
		refresh();
	}
	expect(editor.handle.getSnapshot().conversion).toBeUndefined();
	expect(controller.performers.map((record) => record.displayName)).toEqual(['Mira', 'Noor']);
	controller.switchProfile('musixmatch');
	refresh();
	const voices = bound(editor, controller);
	controller.switchProfile('genius');
	refresh();
	expect(editor.handle.getSnapshot().text).toBe(fixture);
	expect(bound(editor, controller)).toEqual(voices);
	editor.handle.undo();
	refresh();
	bound(editor, controller);
	editor.handle.redo();
	refresh();
	expect(editor.handle.getSnapshot().text).toBe(fixture);
	const saved = editor.handle.getSnapshot();
	const restored = parseScribe(
		serializeScribe({
			title: 'Typed',
			language: 'en',
			performers: controller.performers,
			lyrics: saved.text,
			lineAnchors: [],
			sectionLinks: [],
			ignoredDiagnostics: [],
			conversion: saved.conversion
		})
	);
	expect(restored.performers).toEqual(controller.performers);
	expect(restored.document.conversion?.model.voices).toEqual(saved.conversion!.model.voices);
});
it('completes a new rich header atomically without discovering partial or provisional names', () => {
	const { editor, controller, refresh } = mount();
	insert(editor, '[Verse: Mira]\nLine');
	refresh();
	controller.switchProfile('musixmatch');
	refresh();
	controller.switchProfile('genius');
	refresh();
	insert(editor, '\n\n[Chorus: Noor');
	refresh();
	expect(controller.performers.map((record) => record.displayName)).toEqual(['Mira']);
	editor.view.dispatch({ effects: setComposingEffect.of(true) });
	insert(editor, ']');
	expect(controller.performers.map((record) => record.displayName)).toEqual(['Mira']);
	editor.view.dispatch({ effects: setComposingEffect.of(false) });
	refresh();
	expect(controller.performers.map((record) => record.displayName)).toEqual(['Mira', 'Noor']);
	const noor = controller.performers[1]!;
	expect(
		editor.handle
			.getSnapshot()
			.conversion!.model.voices.some((voice) => voice.performerIds.includes(noor.id))
	).toBe(true);
	controller.addPerformer('Independent');
	refresh();
	editor.handle.undo();
	refresh();
	expect(editor.handle.getSnapshot().text).toBe('[Verse: Mira]\nLine\n\n[Chorus: Noor');
	expect(controller.performers.map((record) => record.displayName)).toEqual([
		'Mira',
		'Independent'
	]);
	editor.handle.redo();
	refresh();
	expect(controller.performers.find((record) => record.id === noor.id)).toEqual(noor);
});
it('undoes a legacy composition and its discovered identity together', () => {
	const { editor, controller, refresh } = mount();
	insert(editor, '[Verse: ]');
	refresh();
	editor.view.dispatch({ effects: setComposingEffect.of(true) });
	editor.view.dispatch({
		changes: { from: 8, insert: 'No' },
		userEvent: 'input.type.compose.start',
		annotations: isolateHistory.of('before')
	});
	editor.view.dispatch({
		changes: { from: 10, insert: 'or' },
		userEvent: 'input.type.compose'
	});
	expect(controller.performers).toEqual([]);
	editor.view.dispatch({ effects: setComposingEffect.of(false) });
	refresh();
	const noor = controller.performers[0]!;
	expect(noor.displayName).toBe('Noor');

	editor.handle.undo();
	refresh();
	expect(editor.handle.getSnapshot().text).toBe('[Verse: ]');
	expect(controller.performers).toEqual([]);
	editor.handle.redo();
	refresh();
	expect(editor.handle.getSnapshot().text).toBe('[Verse: Noor]');
	expect(controller.performers).toEqual([noor]);
	controller.switchProfile('musixmatch');
	refresh();
	expect(editor.handle.getSnapshot().conversion?.model.voices[0]?.performerIds).toEqual([noor.id]);
});

it('keeps a removed performer before identities discovered while its Undo is available', () => {
	const { editor, controller, refresh } = mount();
	controller.addPerformer('Mira');
	refresh();
	controller.addPerformer('Noor');
	refresh();
	const noor = controller.performers[1]!;
	controller.removePerformer(noor.id);
	refresh();
	const removal = controller.feedback.toasts.find(
		(toast) => toast.message === 'Removed Noor from the roster.'
	);
	expect(removal?.action).toBeDefined();
	insert(editor, '[Verse: Lena]');
	refresh();
	removal!.action!();
	refresh();

	expect(controller.performers.map((record) => record.displayName)).toEqual([
		'Mira',
		'Noor',
		'Lena'
	]);
	expect(new Set(controller.performers.map((record) => record.order)).size).toBe(3);
	expect(controller.performers.find((record) => record.id === noor.id)).toEqual(noor);
});

it('imports Genius text with its discovered roster before constructing the model', async () => {
	const { controller, repository } = mount();
	expect(await controller.importLyrics(new File([fixture], 'Lyrics.txt'), 'genius')).toBe(true);
	const summary = (await repository.list()).find((record) => record.title === 'Lyrics')!;
	const saved = (await repository.get(summary.id))!;
	const host = document.createElement('div');
	document.body.append(host);
	const editor = createLyricEditor(host, {
		initialText: saved.text,
		initialConversion: saved.conversion,
		context: { language: saved.language, performers: saved.performers, ruleSetVersion: 'test' },
		callbacks: {
			onSnapshot: vi.fn(),
			onAssignRequest: vi.fn(),
			onSectionHeaderRequest: vi.fn(),
			onDiagnosticActivate: vi.fn(),
			onAnnouncement: vi.fn()
		}
	});
	editors.push(editor);
	expect(editor.handle.getSnapshot().text).toBe(fixture);
	bound(editor, controller);
});

it('does not discover a long unfinished or malformed pasted legend', () => {
	const { editor, controller, refresh } = mount();
	insert(editor, '[Verse: <i>A very long unfinished performer name');
	refresh();
	expect(controller.performers).toEqual([]);
	insert(editor, ']');
	refresh();
	expect(controller.performers).toEqual([]);
});

it('keeps an empty styled legend anonymous in native edits and Genius file import', async () => {
	const { editor, controller, refresh, repository } = mount();
	const text = '[Verse: <i></i>]\n<i>Line</i>';
	insert(editor, text);
	refresh();
	expect(controller.performers).toEqual([]);
	expect(editor.handle.getSnapshot().text).toBe(text);
	controller.switchProfile('musixmatch');
	refresh();
	expect(
		editor.handle.getSnapshot().conversion?.model.voices.flatMap((voice) => voice.performerIds)
	).toEqual([]);
	controller.switchProfile('genius');
	refresh();
	expect(editor.handle.getSnapshot().text).toBe(text);

	expect(await controller.importLyrics(new File([text], 'Anonymous.txt'), 'genius')).toBe(true);
	const summary = (await repository.list()).find((record) => record.title === 'Anonymous')!;
	const saved = (await repository.get(summary.id))!;
	expect(saved.performers).toEqual([]);
	expect(saved.conversion?.model.voices.flatMap((voice) => voice.performerIds)).toEqual([]);
	expect(saved.text).toBe(text);
});

import Dexie from 'dexie';
import { fireEvent, screen, waitFor } from '@testing-library/dom';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from 'vitest-browser-svelte';
import { afterEach, expect, test } from 'vitest';
import type {
	AutosaveController,
	DraftRecord,
	EditorHandle,
	EditorSnapshot
} from '#lib/core/types.js';
import { parseDocument } from '#lib/core/parser.js';
import { importDocument } from '#lib/conversion/index.js';
import EditorPane from '#lib/editor/EditorPane.svelte';
import { createAutosaveController } from '#lib/persistence/autosave.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { closeDatabase, openDatabase, type LyricLintDatabase } from '#lib/persistence/database.js';
import { createDraftIgnoreStore } from '#lib/persistence/draft-ignores.js';
import { createDraftRepository } from '#lib/persistence/draft-repository.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { createWorkbenchController } from '../state/workbench.svelte.js';
import Workspace from './Workspace.svelte';

const databases: LyricLintDatabase[] = [];
const saves: AutosaveController[] = [];
afterEach(async () => {
	await cleanup();
	for (const autosave of saves.splice(0)) autosave.cancel();
	for (const database of databases.splice(0)) {
		closeDatabase(database);
		await Dexie.delete(database.name);
	}
});

function record(text: string): DraftRecord {
	const imported = importDocument({ text, profile: 'genius', language: 'en' });
	if (!imported.ok) throw new Error(imported.refusal.message);
	return {
		id: 'song',
		title: 'Song',
		text,
		language: 'en',
		performers: [],
		createdAt: '2026-09-16T00:00:00Z',
		updatedAt: '2026-09-16T00:00:00Z',
		ruleSetVersion: 'test',
		conversion: createConversionEnvelope(imported.value, 'genius', profilePolicyVersions)
	};
}

function snapshot(draft: DraftRecord): EditorSnapshot {
	return {
		revision: 0,
		text: draft.text,
		conversion: draft.conversion,
		selection: { anchor: draft.text.length, head: draft.text.length },
		parsed: parseDocument(draft.text),
		diagnostics: [],
		composing: false,
		canUndo: false,
		canRedo: false
	};
}

test('guarded-save identity adoption preserves the mounted editor and native Undo', async () => {
	await page.viewport(1280, 900);
	const database = await openDatabase(`workspace-conflict-${crypto.randomUUID()}`);
	databases.push(database);
	const repository = createDraftRepository(database);
	const source =
		'[Verse: Mira]\nKeep the [moon](12345)\n' +
		Array.from({ length: 60 }, (_, line) => `Long lyric line ${line}`).join('\n');
	const initial = await repository.create(record(source));
	const initialSnapshot = snapshot(initial);
	const placeholder: EditorHandle = {
		focus() {},
		getSnapshot: () => initialSnapshot,
		dispatchAtomic() {},
		undo() {},
		redo() {},
		revealRange() {},
		setSelection() {}
	};
	const autosave = createAutosaveController(repository, { debounceMs: 60_000 });
	saves.push(autosave);
	const controller = createWorkbenchController({
		initialDraft: initial,
		initialSnapshot,
		editor: placeholder,
		repository,
		autosave,
		ignoreStore: await createDraftIgnoreStore(database),
		onOpenDraft: snapshot
	});
	controller.setGrammarCheckEnabled(false);
	await render(Workspace, {
		controller,
		editorComponent: EditorPane,
		harperProvider: { lint: async () => [], dispose: async () => {} }
	});
	await waitFor(() => expect(controller.editor.dispatchConversionAction).toBeTypeOf('function'));
	const editor = screen.getByRole('textbox', { name: 'Lyrics editor' });
	controller.addPerformer('Noor');
	const rosterUndo = controller.feedback.toasts.find(
		(toast) => toast.message === 'Added Noor to the roster.'
	);
	if (!rosterUndo) throw new Error('Adding a performer must offer its Undo.');
	controller.editor.focus();
	await userEvent.fill(editor, source + ' latest');
	await waitFor(() => expect(controller.snapshot.text).toBe(source + ' latest'));
	const selection = controller.snapshot.selection;
	const conversion = controller.snapshot.conversion;
	const scroller = editor.closest('.cm-editor')?.querySelector('.cm-scroller');
	if (!(scroller instanceof HTMLElement)) throw new Error('The real editor scroller must exist.');
	await waitFor(() => expect(scroller.scrollTop).toBeGreaterThan(0));
	const scrollTop = scroller.scrollTop;
	expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();

	const competing = createDraftRepository(database);
	if (!competing.compareAndSave) throw new Error('The real repository must support guarded saves.');
	const remote = await competing.compareAndSave(record('[Chorus]\nOther tab'), 0);
	expect(remote.conflicted).toBe(false);
	await autosave.flush();
	await waitFor(() => expect(controller.title).toBe('Song (conflict copy)'));
	const copyId = controller.draftId;
	const adoptedEditor = await screen.findByRole('textbox', { name: 'Lyrics editor' });
	expect(copyId).not.toBe(initial.id);
	expect(controller.snapshot.text).toBe(source + ' latest');
	expect(controller.snapshot.selection).toEqual(selection);
	expect(controller.snapshot.conversion).toEqual(conversion);
	expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
	expect(adoptedEditor).toBe(editor);
	expect(document.activeElement).toBe(editor);
	expect(scroller.scrollTop).toBe(scrollTop);
	await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
	await waitFor(() => expect(controller.snapshot.text).toBe(source));
	await fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
	await waitFor(() => expect(controller.snapshot.text).toBe(source + ' latest'));
	controller.feedback.runToastAction(rosterUndo.id);
	await waitFor(() =>
		expect(controller.performers.some((performer) => performer.displayName === 'Noor')).toBe(false)
	);
	await fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
	await waitFor(() =>
		expect(controller.performers.some((performer) => performer.displayName === 'Noor')).toBe(true)
	);
	await fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
	await waitFor(() =>
		expect(controller.performers.some((performer) => performer.displayName === 'Noor')).toBe(false)
	);
	expect(controller.snapshot.text).toBe(source + ' latest');
	await autosave.flush();
	expect((await repository.get(initial.id))?.text).toBe('[Chorus]\nOther tab');
	expect((await repository.get(copyId))?.conversion).toEqual(conversion);

	await controller.openDraft(initial.id);
	await waitFor(() => expect(controller.snapshot.text).toBe('[Chorus]\nOther tab'));
	const openedEditor = await screen.findByRole('textbox', { name: 'Lyrics editor' });
	expect(openedEditor).not.toBe(editor);
	expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
	await controller.createDraft();
	await waitFor(() => expect(controller.snapshot.text).toBe(''));
	expect(await screen.findByRole('textbox', { name: 'Lyrics editor' })).not.toBe(openedEditor);
	expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

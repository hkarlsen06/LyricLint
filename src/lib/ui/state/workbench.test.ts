import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { openDatabase, closeDatabase } from '#lib/persistence/database.js';
import { createDraftRepository } from '#lib/persistence/draft-repository.js';
import { serializeScribe } from '#lib/scribe/format.js';
import { parseScribe } from '#lib/scribe/format.js';
import { importDocument } from '#lib/conversion/index.js';
import { createConversionEnvelope } from '#lib/persistence/conversion.js';
import { profilePolicyVersions } from '#lib/profiles/versions.js';
import { runRules as computeDiagnostics } from '#lib/rules/engine.js';
import { copySectionLinks } from '#lib/persistence/copy.js';
import { parseDocument } from '#lib/core/parser.js';
import type {
	AutosaveController,
	AutosaveSnapshot,
	Diagnostic,
	DraftRecord,
	DraftRepository,
	EditorHandle,
	EditorSnapshot,
	LineAnchor,
	SectionLink
} from '#lib/core/types.js';
import { describe, expect, test, vi } from 'vitest';
import { createAutosaveController } from '#lib/persistence/autosave.js';
import { createDepartureCheckpoint } from '#lib/persistence/departure-checkpoint.js';
import {
	createContractIgnoreStore,
	createInMemoryDraftRepository,
	createInMemoryMediaRepository,
	createMemorySessionStorage
} from './in-memory.js';
import type { MediaRepository } from '#lib/persistence/media-repository.js';
import { createFeedbackState, NOTICE_TOAST_DURATION } from './feedback.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { sampleDraftText } from '../sample-draft.js';
import { unknownVoiceAcceptanceKey } from '#lib/diagnostics/ignore.js';
import { createWorkbenchController } from './workbench.svelte.js';
import { buildRuleContext } from './wiring.js';

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
	const result: EditorSnapshot = {
		revision,
		text,
		selection: record.editorSelection ?? { anchor: 0, head: 0 },
		parsed: parseDocument(text),
		diagnostics: [],
		composing: false,
		canUndo: revision > 0,
		canRedo: false
	};
	if (record.conversion) result.conversion = record.conversion;
	return result;
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
	readClipboard?: () => Promise<string>;
	copy?: (text: string) => Promise<void>;
	/**
	 * Build the controller on a handle that cannot hold anchors, the way the page
	 * does: it boots on a headless placeholder and CodeMirror publishes later.
	 */
	headless?: boolean;
	mediaRepository?: MediaRepository;
	exportText?: (text: string, filename: string) => void;
}) {
	const initial = options.initial ?? draft('draft-a');
	const repository =
		options.repository ?? createInMemoryDraftRepository(options.drafts ?? [initial]);
	const autosave = options.autosave ?? controllableAutosave(repository).autosave;
	let currentSnapshot = snapshot(initial);
	let lineAnchors: LineAnchor[] = [];
	let sectionLinks: SectionLink[] = [];
	const editor: EditorHandle = {
		focus() {},
		getSnapshot: () => currentSnapshot,
		dispatchAtomic() {},
		undo() {},
		redo() {},
		revealRange() {},
		setSelection() {},
		requestPerformerLegendAssignment: vi.fn(),
		requestSectionLink: vi.fn(),
		getLineAnchors: () => lineAnchors.map((anchor) => ({ ...anchor })),
		setLineAnchors(anchors) {
			lineAnchors = anchors.map((anchor) => ({ ...anchor }));
		},
		// Through the real copier, not a hand-written one. A stub that listed the
		// fields it kept would hide exactly the bug this file exists to catch,
		// which is what happened: a *fourth* copier in `draft-store` rebuilt every
		// link as `{ lines }` on every save and dropped the differences in silence.
		getSectionLinks: () => copySectionLinks(sectionLinks),
		setSectionLinks(links) {
			sectionLinks = copySectionLinks(links);
		}
	};
	const onOpenDraft =
		options.onOpenDraft ??
		((nextDraft: DraftRecord) => {
			currentSnapshot = snapshot(nextDraft, 0);
			return currentSnapshot;
		});
	// The page's own placeholder: no document, and none of the anchor methods.
	const headless: EditorHandle = {
		focus() {},
		getSnapshot: () => currentSnapshot,
		dispatchAtomic() {},
		undo() {},
		redo() {},
		revealRange() {},
		setSelection() {}
	};
	// Held rather than passed inline: the draft store clears a discarded or
	// deleted 'scribe's ignores through this same object, so a test that means to
	// model that has to be able to reach it.
	const ignoreStore = createContractIgnoreStore(createMemorySessionStorage());
	const controllerDeps: Parameters<typeof createWorkbenchController>[0] = {
		editor: options.headless ? headless : editor,
		initialSnapshot: currentSnapshot,
		initialDraft: initial,
		initialRecentLanguages: options.initialRecentLanguages,
		repository,
		autosave,
		ignoreStore,
		idFactory: vi.fn(() => `generated-${Math.random().toString(36).slice(2)}`),
		now: () => '2026-07-20T11:00:00.000Z',
		readClipboard:
			options.readClipboard ??
			(() => Promise.reject(new Error('Clipboard reads are unavailable.'))),
		copy: options.copy ?? (() => Promise.resolve()),
		onOpenDraft,
		exportText: options.exportText
	};
	// Absent unless the test asked for audio: a controller with a media store is
	// one more thing running behind every unrelated assertion.
	if (options.mediaRepository) {
		controllerDeps.mediaRepository = options.mediaRepository;
		// A real player would reach for `new Audio()`, which node has not got;
		// what is under test here is the draft record, not decoding.
		controllerDeps.mediaPlayer = createMediaPlayer({
			feedback: createFeedbackState(),
			createAudio: () => new StubAudio().asMediaElement(),
			createObjectUrl: () => 'blob:test',
			revokeObjectUrl: () => {}
		});
	}
	const controller = createWorkbenchController(controllerDeps);
	return { controller, repository, autosave, editor, headless, ignoreStore };
}

describe('workbench draft safety', () => {
	test('keeps a usable editor while a keyed replacement clears its bound handle', () => {
		const { controller, editor } = setup({});

		controller.setEditorHandle(undefined);

		expect(controller.editor).toBe(editor);
	});

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

	// Opening a draft remounts the keyed editor, so the handle in scope when the
	// draft loads is the outgoing one and anything dispatched into it dies with
	// it. The anchors are held and applied when the replacement publishes itself.
	test('lands a draft’s line anchors on the editor that replaces the one being torn down', async () => {
		const first = draft('draft-a');
		const second: DraftRecord = { ...draft('draft-b'), lineAnchors: [{ line: 2, time: 61 }] };
		const repository = createInMemoryDraftRepository([first, second]);
		const { controller, editor } = setup({
			initial: first,
			drafts: [first, second],
			repository
		});

		await controller.openDraft(second.id);
		expect(editor.getLineAnchors?.()).toEqual([]);

		controller.setEditorHandle(editor);

		expect(editor.getLineAnchors?.()).toEqual([{ line: 2, time: 61 }]);
	});

	/*
	 * The bug this pins lost a whole synced song on every reload, and it lost it
	 * to `?.`.
	 *
	 * The page builds the controller with a *headless* handle (no document, no
	 * anchors), and only later does CodeMirror mount and publish a real one. The
	 * headless handle is therefore the first thing `setEditorHandle` ever sees, and
	 * `handle.setLineAnchors?.(pending)` dropped the draft's timings into a no-op
	 * and cleared the pending list on the way past.
	 *
	 * `?.` is right for a fire-and-forget notification and wrong for a one-shot
	 * hand-off: there is no second chance to deliver this, so the capability has to
	 * be checked rather than optionally called.
	 */
	// The timings a player gets are the editor's live ones, named after the draft
	// rather than after the file the audio came from.
	test('reports a failed Scribe download without announcing an export', async () => {
		const exportText = vi.fn(() => {
			throw new Error('Download unavailable');
		});
		const { controller } = setup({ exportText });
		await controller.exportScribe();
		expect(exportText).toHaveBeenCalledOnce();
		expect(controller.feedback.announcement).toBe("That 'scribe could not be exported.");
		expect(controller.toasts.at(-1)?.message).toBe("That 'scribe could not be exported.");
	});

	test('writes the editor’s own anchors out as a timed-lyrics file', () => {
		const exportText = vi.fn();
		const { controller, editor } = setup({ exportText });

		editor.setLineAnchors?.([{ line: 2, time: 12.34 }]);

		controller.exportTimedLyrics('lrc');

		expect(exportText).toHaveBeenCalledWith('[00:12.34]Line\n', 'First song.lrc');
	});

	test('writes nothing when every anchor points at a line that is gone', () => {
		const exportText = vi.fn();
		const { controller, editor } = setup({ exportText });

		editor.setLineAnchors?.([{ line: 9, time: 12.34 }]);

		controller.exportTimedLyrics('srt');

		expect(exportText).not.toHaveBeenCalled();
	});

	test('holds a draft’s anchors until a handle that can take them arrives', async () => {
		const stored: DraftRecord = { ...draft('draft-a'), lineAnchors: [{ line: 2, time: 61 }] };
		const repository = createInMemoryDraftRepository([stored]);
		const { controller, editor, headless } = setup({ initial: stored, repository });

		controller.setEditorHandle(headless);
		controller.setEditorHandle(editor);

		expect(editor.getLineAnchors?.()).toEqual([{ line: 2, time: 61 }]);
	});

	// Section links ride the same hand-off and are lost the same two ways, so they
	// get the same pair of guards. A link changes no text at all, which makes the
	// blank-editor window strictly more dangerous for it than for the anchors.
	// The differences are half of what a link is now, and they are written down on
	// the same record, so a copier that keeps the lines and drops them loses the
	// work while leaving every sign that it was saved.
	test('saves a link’s differences along with its lines', async () => {
		const link: SectionLink = {
			lines: [4, 11],
			holes: [
				{ line: 6, column: 18, endLine: 6, endColumn: 25 },
				{ line: 13, column: 18, endLine: 13, endColumn: 23 }
			]
		};
		const stored: DraftRecord = { ...draft('draft-a'), sectionLinks: [link] };
		const repository = createInMemoryDraftRepository([stored]);
		const { controller, editor, autosave } = setup({ initial: stored, repository });

		controller.setEditorHandle(editor);
		editor.setSectionLinks?.([link]);
		controller.onSectionLinksChanged();
		await autosave.flush();

		const saved = await repository.get('draft-a');
		expect(saved?.sectionLinks).toEqual([link]);
	});

	test('holds a draft’s section links until a handle that can take them arrives', async () => {
		const stored: DraftRecord = { ...draft('draft-a'), sectionLinks: [{ lines: [4, 11] }] };
		const repository = createInMemoryDraftRepository([stored]);
		const { controller, editor, headless } = setup({ initial: stored, repository });

		controller.setEditorHandle(headless);
		controller.setEditorHandle(editor);

		expect(editor.getSectionLinks?.()).toEqual([{ lines: [4, 11] }]);
	});

	test('never writes an empty section-link list from a handle that cannot report them', async () => {
		const stored: DraftRecord = { ...draft('draft-a'), sectionLinks: [{ lines: [4, 11] }] };
		const repository = createInMemoryDraftRepository([stored]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: stored,
			repository,
			autosave: controlled.autosave,
			headless: true
		});

		await controller.setTitle('Renamed before the editor mounted');

		expect(controlled.scheduled.at(-1)?.draft.sectionLinks).toEqual([{ lines: [4, 11] }]);
	});

	// The other half of the same window. A save that landed before CodeMirror
	// mounted read the anchors off a handle that cannot report them, and `?? []`
	// would have written an empty list over the draft's own timings. A rename is
	// enough to get there.
	test('never writes an empty anchor list from a handle that cannot report them', async () => {
		const stored: DraftRecord = { ...draft('draft-a'), lineAnchors: [{ line: 2, time: 61 }] };
		const repository = createInMemoryDraftRepository([stored]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: stored,
			repository,
			autosave: controlled.autosave,
			headless: true
		});

		await controller.setTitle('Renamed before the editor mounted');

		expect(controlled.scheduled.at(-1)?.draft.lineAnchors).toEqual([{ line: 2, time: 61 }]);
	});

	// Every editor remount starts blank (a keyed rebuild, or HMR in dev), and a
	// blank editor's `getLineAnchors()` is `[]`, which the next save writes straight
	// over the draft. The anchors are re-seated onto any capable handle that has
	// none, not just the first one.
	test('re-seats the anchors on a remounted editor', async () => {
		const stored: DraftRecord = { ...draft('draft-a'), lineAnchors: [{ line: 2, time: 61 }] };
		const repository = createInMemoryDraftRepository([stored]);
		const { controller, editor, headless } = setup({ initial: stored, repository });

		controller.setEditorHandle(headless);
		controller.setEditorHandle(editor);
		expect(editor.getLineAnchors?.()).toEqual([{ line: 2, time: 61 }]);

		// A fresh CodeMirror, the way a remount publishes one.
		let remounted: LineAnchor[] = [];
		controller.setEditorHandle({
			...editor,
			getLineAnchors: () => remounted.map((anchor) => ({ ...anchor })),
			setLineAnchors(anchors) {
				remounted = anchors.map((anchor) => ({ ...anchor }));
			}
		});

		expect(remounted).toEqual([{ line: 2, time: 61 }]);
	});

	test('saves the editor’s live anchors with the text they describe', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller, editor } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});

		editor.setLineAnchors?.([{ line: 2, time: 12.5 }]);
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nEdited'));

		expect(controlled.scheduled.at(-1)?.draft.lineAnchors).toEqual([{ line: 2, time: 12.5 }]);
	});

	/*
	 * No way of setting an anchor changes any text: a sync tap writes an anchor
	 * and moves the caret, and `Ctrl-Alt-M` and the timestamp column's own control
	 * move nothing. Saving only on a snapshot therefore lost a whole synced song on
	 * reload.
	 */
	test('saves anchors written without the text changing', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller, editor } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});
		const before = controlled.scheduled.length;

		editor.setLineAnchors?.([{ line: 2, time: 41 }]);
		controller.onLineAnchorsChanged();

		expect(controlled.scheduled.length).toBeGreaterThan(before);
		expect(controlled.scheduled.at(-1)?.draft.lineAnchors).toEqual([{ line: 2, time: 41 }]);
		expect(controlled.scheduled.at(-1)?.draft.text).toBe(first.text);
	});

	/*
	 * Against the *real* autosave controller, because the thing under test is its
	 * revision guard and a stub has none. Driven by one, this test agreed with
	 * the bug for as long as it existed.
	 *
	 * Reopening a draft mounts a fresh editor, whose revisions start again at
	 * zero, so the mark the first visit left behind stood over a second visit
	 * whose first save was revision 1 and every save of it was dropped as stale.
	 * A sync run never out-types the old mark, because an anchor changes no text:
	 * a reopened draft's whole timing pass was written nowhere.
	 */
	test('writes an edit made after two draft switches, past the real revision guard', async () => {
		const first = draft('draft-a');
		const second = draft('draft-b');
		const repository = createInMemoryDraftRepository([first, second]);
		const autosave = createAutosaveController(repository, { debounceMs: 0 });
		const { controller } = setup({
			initial: first,
			drafts: [first, second],
			repository,
			autosave
		});

		// The first visit types, which is what leaves a high-water mark behind.
		controller.onSnapshot(snapshot(first, 5, '[Verse]\nTyped before switching away'));
		await autosave.flush();

		await controller.openDraft(second.id);
		await controller.openDraft(first.id);
		const edited = snapshot(first, 1, '[Verse]\nEdited after switching twice');
		controller.onSnapshot(edited);
		await autosave.flush();

		expect(controller.snapshot.text).toBe(edited.text);
		expect((await repository.get(first.id))?.text).toBe(edited.text);
	});

	test('flushes the previous draft before creating a new one, and writes nothing for the new one', async () => {
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

		expect(events).toContain('flush');
		expect((await repository.get(first.id))?.text).toBe('[Verse]\nUnsaved edit');
		// The new draft is empty, so it exists only in memory: no record, and the
		// current-draft pointer still names the draft that has the user's work.
		expect(events).not.toContain('create');
		expect((await repository.list()).map(({ id }) => id)).toEqual([first.id]);
		expect(await repository.getCurrent()).toBe(first.id);
	});

	test('writes the new draft on its first text, and takes over the current pointer then', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});

		await controller.createDraft();
		const created = controller.draftId;
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nFirst words'));
		await controlled.autosave.flush();

		expect((await repository.get(created))?.text).toBe('[Verse]\nFirst words');
		expect(await repository.getCurrent()).toBe(created);
	});

	// Attaching audio is the one thing other than text that makes a draft worth a
	/**
	 * A song attached to an untouched draft says what the transcription is *of*,
	 * which is nearly always what it should be called.
	 *
	 * `Untitled transcription` is the whole of the condition. A title the user typed, or
	 * one an earlier source already supplied, is a decision, and a later
	 * attachment must not overwrite it.
	 */
	test('lets a named source title a draft nobody has named', async () => {
		const first = { ...draft('draft-a'), title: 'Untitled transcription' };
		const repository = createInMemoryDraftRepository([first]);
		const { controller } = setup({
			initial: first,
			repository,
			mediaRepository: createInMemoryMediaRepository()
		});

		await controller.media?.attachAppleMusicSong('1091453645', 'Kygo — Stole the Show');

		expect(controller.title).toBe('Kygo — Stole the Show');
	});

	test('never renames a draft the user has already named', async () => {
		const first = { ...draft('draft-a'), title: 'Snøfall verse 2' };
		const repository = createInMemoryDraftRepository([first]);
		const { controller } = setup({
			initial: first,
			repository,
			mediaRepository: createInMemoryMediaRepository()
		});

		await controller.media?.attachAppleMusicSong('1091453645', 'Kygo — Stole the Show');

		expect(controller.title).toBe('Snøfall verse 2');
	});

	/**
	 * A filename is not reliably a title.
	 *
	 * `01 Track.mp3` is a fine one; a rip's bookkeeping is not, and there is no
	 * way to tell them apart except by how much of it there is. The long ones are
	 * left alone rather than guessed at: an `Untitled transcription` the user renames
	 * beats a title they have to clear first. The extension always goes: that is a
	 * fact about a file on a disk, not the name of a transcription.
	 */
	test('takes a short filename as a title, without its extension, and leaves a long one', async () => {
		for (const [filename, expected] of [
			['Snøfall.mp3', 'Snøfall'],
			[
				'Artist - Album (2011 Remaster) [FLAC 24-96] - 07 - The Song Itself.mp3',
				'Untitled transcription'
			]
		] as const) {
			const first = { ...draft('draft-a'), title: 'Untitled transcription' };
			const repository = createInMemoryDraftRepository([first]);
			const { controller } = setup({
				initial: first,
				repository,
				mediaRepository: createInMemoryMediaRepository()
			});

			await controller.media?.attachFile(new File([''], filename));

			expect(controller.title, filename).toBe(expected);
		}
	});

	// A pasted link is its own URL until the catalogue answers, and a draft called
	// `music.apple.com/song/1091453645` is worse than one called nothing.
	test('never titles a draft after a link', async () => {
		const first = { ...draft('draft-a'), title: 'Untitled transcription' };
		const repository = createInMemoryDraftRepository([first]);
		const { controller } = setup({
			initial: first,
			repository,
			mediaRepository: createInMemoryMediaRepository()
		});

		await controller.media?.attachAppleMusicSong('1091453645', 'music.apple.com/song/1091453645');

		expect(controller.title).toBe('Untitled transcription');
	});

	// record. Without this the media row was written against a transient id, the
	// draft was never persisted, and the next load invented a new id, so the
	// attachment came back as nothing at all, not even the pending bar.
	test('writes a wordless draft once audio is attached to it', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const mediaRepository = createInMemoryMediaRepository();
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave,
			mediaRepository
		});

		await controller.createDraft();
		const created = controller.draftId;
		expect(await repository.get(created)).toBeUndefined();

		await controller.media?.attachFile(new File([''], 'sensommer.mp3'));
		await controlled.autosave.flush();

		expect(await repository.get(created)).toBeDefined();
		expect((await mediaRepository.get(created))?.name).toBe('sensommer.mp3');

		// And it stays written: the document is still wordless on the next
		// snapshot, which is where the discard used to take it straight back out.
		controller.onSnapshot(snapshot(first, 2, ''));
		await controlled.autosave.flush();
		expect(await repository.get(created)).toBeDefined();
	});

	test('saves a deliberate clear of an existing draft', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});

		controller.onSnapshot(snapshot(first, 1, ''));
		await controlled.autosave.flush();

		expect((await repository.get(first.id))?.text).toBe('');
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
		const created = controller.draftId;
		controller.onSnapshot(snapshot(first, 1, '[Verse]\nFirst words'));
		await controlled.autosave.flush();

		expect(controller.language).toBe('fr');
		expect(created).not.toBe(first.id);
		expect((await repository.get(created))?.language).toBe('fr');
	});

	test.each(['fr CA', '', 'abc' + '-abcdefgh'.repeat(14)])(
		'refuses invalid document language %j before changing a plain draft',
		async (language) => {
			const { controller, repository } = setup({});
			const recent = [...controller.recentLanguages];
			const text = controller.snapshot.text;
			expect(controller.snapshot.conversion).toBeUndefined();
			const accepted = controller.setLanguage(language);
			expect(controller.language).toBe('en');
			expect(accepted).toBe(false);
			expect(controller.recentLanguages).toEqual(recent);
			expect(controller.snapshot.text).toBe(text);
			await controller.flushAutosave();
			expect((await repository.get(controller.draftId))?.language).toBe('en');
			expect(controller.feedback.announcement).toContain('valid language code');
		}
	);

	test.each(['fr-CA', 'zz-Latn-custom'])(
		'keeps valid custom document language %s exact on a plain draft',
		async (language) => {
			const { controller, repository } = setup({});
			const text = controller.snapshot.text;
			expect(controller.setLanguage(language)).toBe(true);
			await controller.flushAutosave();
			expect(controller.language).toBe(language);
			expect(controller.snapshot.text).toBe(text);
			expect((await repository.get(controller.draftId))?.language).toBe(language);
		}
	);

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
		expect(controller.draftId).toBe(duplicate!.id);
		expect(controller.snapshot.text).toBe('[Verse]\nLatest edit');
		const copy = await repository.get(duplicate!.id);
		if (!copy) throw new Error('The copied draft is missing.');
		controller.onSnapshot(snapshot(copy, 1, '[Verse]\nChanged only in the copy'));
		await controlled.autosave.flush();
		expect((await repository.get(first.id))?.text).toBe('[Verse]\nLatest edit');
		expect((await repository.get(copy.id))?.text).toBe('[Verse]\nChanged only in the copy');
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

	test('a refused delete reports the failure instead of failing silently', async () => {
		const first = draft('draft-a');
		const second = draft('draft-b');
		const baseRepository = createInMemoryDraftRepository([first, second]);
		const repository: DraftRepository = {
			...baseRepository,
			async delete() {
				throw new Error('quota exceeded');
			}
		};
		const { controller } = setup({ initial: first, repository });

		await controller.deleteDraft(second.id);

		expect(controller.feedback.announcement).toBe("The 'scribe could not be deleted.");
		expect(controller.feedback.toasts.map((toast) => toast.message)).toContain(
			"The 'scribe could not be deleted."
		);
		expect(await baseRepository.get(second.id)).toBeDefined();
	});

	test.each([
		['delete', false],
		['delete', true],
		['reset', false],
		['reset', true]
	] as const)(
		'a refused %s preserves pending edits after save failure=%s',
		async (operation, failed) => {
			const first = draft('draft-a');
			const second = draft('draft-b');
			const baseRepository = createInMemoryDraftRepository([first, second]);
			let refuseSave = failed;
			const repository: DraftRepository = {
				...baseRepository,
				async save(record) {
					if (refuseSave) throw new Error('storage unavailable');
					await baseRepository.save(record);
				},
				async delete() {
					throw new Error('deletion refused');
				},
				async deleteAll() {
					throw new Error('reset refused');
				}
			};
			const storage = createMemorySessionStorage();
			const checkpoint = createDepartureCheckpoint(() => storage);
			const autosave = createAutosaveController(repository, { debounceMs: 60_000, checkpoint });
			const { controller } = setup({ initial: first, repository, autosave });
			const latest = '[Verse]\nLatest unsaved lyric';
			const otherLatest = '[Verse]\nOther pending lyric';
			try {
				autosave.schedule({ revision: 1, draft: { ...second, text: otherLatest } });
				controller.onSnapshot(snapshot(first, 1, latest));
				controller.setGrammarCheckEnabled(false);
				if (failed) {
					await controller.flushAutosave();
					expect(autosave.status()).toBe('failed');
				}
				if (operation === 'delete') await controller.deleteDraft(first.id);
				else await controller.deleteAllDrafts();

				expect(controller.draftId).toBe(first.id);
				expect(controller.snapshot.text).toBe(latest);
				expect((await baseRepository.get(first.id))?.text).toBe(first.text);
				expect(autosave.checkpoint?.()).toBe(true);
				expect(
					checkpoint
						.read()
						.map(({ draft }) => draft.text)
						.sort()
				).toEqual([latest, otherLatest].sort());
				expect(controller.grammarCheckEnabled).toBe(false);
				refuseSave = false;
				await controller.flushAutosave();
				expect((await baseRepository.get(first.id))?.text).toBe(latest);
				expect((await baseRepository.get(second.id))?.text).toBe(otherLatest);
			} finally {
				autosave.cancel();
			}
		}
	);

	test.each(['delete', 'reset'] as const)(
		'a refused %s retains an in-flight save that subsequently fails',
		async (operation) => {
			const first = draft('draft-a');
			const baseRepository = createInMemoryDraftRepository([first]);
			const started = Promise.withResolvers<void>();
			const release = Promise.withResolvers<void>();
			let firstAttempt = true;
			const repository: DraftRepository = {
				...baseRepository,
				async save(record) {
					if (firstAttempt) {
						firstAttempt = false;
						started.resolve();
						await release.promise;
						throw new Error('save refused');
					}
					await baseRepository.save(record);
				},
				async delete() {
					throw new Error('deletion refused');
				},
				async deleteAll() {
					throw new Error('reset refused');
				}
			};
			const storage = createMemorySessionStorage();
			const checkpoint = createDepartureCheckpoint(() => storage);
			const autosave = createAutosaveController(repository, { debounceMs: 60_000, checkpoint });
			const { controller } = setup({ initial: first, repository, autosave });
			const latest = '[Verse]\nIn-flight unsaved lyric';
			controller.onSnapshot(snapshot(first, 1, latest));
			const flushing = controller.flushAutosave();
			try {
				await started.promise;
				const deleting =
					operation === 'delete' ? controller.deleteDraft(first.id) : controller.deleteAllDrafts();
				await new Promise<void>((resolve) => setTimeout(resolve, 10));
				release.resolve();
				await flushing;
				await deleting;
				expect(autosave.checkpoint?.()).toBe(true);
				expect(checkpoint.read().map(({ draft }) => draft.text)).toEqual([latest]);
				await controller.flushAutosave();
				expect((await baseRepository.get(first.id))?.text).toBe(latest);
			} finally {
				release.resolve();
				await flushing;
				autosave.cancel();
			}
		}
	);

	test.each(['delete', 'reset'] as const)(
		'a successful %s cannot resurrect canceled edits',
		async (operation) => {
			const first = draft('draft-a');
			const repository = createInMemoryDraftRepository([first]);
			const storage = createMemorySessionStorage();
			const checkpoint = createDepartureCheckpoint(() => storage);
			const autosave = createAutosaveController(repository, { debounceMs: 60_000, checkpoint });
			const { controller } = setup({ initial: first, repository, autosave });
			try {
				controller.onSnapshot(snapshot(first, 1, '[Verse]\nPending deletion'));
				expect(autosave.checkpoint?.()).toBe(true);
				if (operation === 'delete') await controller.deleteDraft(first.id);
				else await controller.deleteAllDrafts();
				await controller.flushAutosave();
				expect(await repository.get(first.id)).toBeUndefined();
				expect(checkpoint.read()).toEqual([]);
			} finally {
				autosave.cancel();
			}
		}
	);

	test('a refused duplicate reports the failure instead of failing silently', async () => {
		const first = draft('draft-a');
		const baseRepository = createInMemoryDraftRepository([first]);
		const repository: DraftRepository = {
			...baseRepository,
			async duplicate() {
				throw new Error('quota exceeded');
			}
		};
		const { controller } = setup({ initial: first, repository });

		await controller.duplicateDraft(first.id);

		expect(controller.feedback.announcement).toBe("The 'scribe could not be duplicated.");
		expect(controller.feedback.toasts.map((toast) => toast.message)).toContain(
			"The 'scribe could not be duplicated."
		);
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

describe('workbench linking navigation', () => {
	test('keeps the explicitly opened section when the caret moves', () => {
		const initial = draft('draft-a', '[Chorus]\nHold on\n\n[Chorus]\nHold on');
		const { controller } = setup({ initial });
		const header = initial.text.lastIndexOf('[Chorus]');
		controller.openLinking(header);
		controller.onSnapshot({ ...snapshot(initial), selection: { anchor: 0, head: 0 } });
		expect(controller.activeTab).toBe('linking');
		expect(controller.linkingHeaderFrom).toBe(header);
		controller.setActiveTab('song');
		controller.setActiveTab('linking');
		expect(controller.linkingHeaderFrom).toBe(header);
	});

	test('retires a comparison when its document changes and rejects missing headers', () => {
		const initial = draft('draft-a', '[Chorus]\nHold on');
		const { controller } = setup({ initial });
		controller.openLinking(0);
		controller.onSnapshot(snapshot(initial, 1, '[Verse]\nNew words'));
		expect(controller.linkingHeaderFrom).toBeUndefined();
		controller.openLinking(999);
		expect(controller.linkingHeaderFrom).toBeUndefined();
		expect(controller.toasts.at(-1)?.message).toContain('section has changed');
	});

	test('returns to the overview when another draft opens', async () => {
		const initial = draft('draft-a', '[Chorus]\nHold on');
		const other = draft('draft-b', '[Chorus]\nDifferent song');
		const { controller } = setup({ initial, drafts: [initial, other] });
		controller.openLinking(0);
		await controller.openDraft('draft-b');
		expect(controller.activeTab).toBe('linking');
		expect(controller.linkingHeaderFrom).toBeUndefined();
	});
});

describe('workbench diagnostic navigation', () => {
	const diagnostic: Diagnostic = {
		ruleId: 'section-header-missing',
		severity: 'warning',
		message: 'This lyric section has no header.',
		explanation: 'Blank-line sections containing lyrics should open with a header.',
		sourceIds: [],
		from: 8,
		to: 12
	};

	test('returns to the linter tab so the activated card is visible', () => {
		const { controller } = setup({});
		controller.setActiveTab('performers');

		controller.navigateToDiagnostic(diagnostic);

		expect(controller.activeTab).toBe('linter');
		expect(controller.activeDiagnosticKey).toBe('section-header-missing:8:12');
	});

	test('retains an aimed related occurrence through review and guided linking', () => {
		const { controller, editor } = setup({});
		const range = { from: 30, to: 38 };
		const repeated = { ...diagnostic, relatedRanges: [range] };
		editor.setSelection = vi.fn();
		editor.revealRange = vi.fn();

		controller.navigateToDiagnostic(repeated, { focus: false, range });
		// Mounting the focused review card repeats navigation without a pointer range.
		controller.navigateToDiagnostic(repeated, { focus: false });
		controller.linkDiagnosticSections(repeated);
		expect(controller.activeDiagnosticKey).toBe('section-header-missing:8:12');
		expect(editor.setSelection).toHaveBeenLastCalledWith({ anchor: 30, head: 38 });
		expect(editor.revealRange).toHaveBeenLastCalledWith(range);
		expect(editor.requestSectionLink).toHaveBeenCalledOnce();

		// An edit that removes the related occurrence must not reuse its stale range.
		controller.navigateToDiagnostic(diagnostic, { focus: false });
		expect(editor.setSelection).toHaveBeenLastCalledWith({ anchor: 8, head: 12 });
	});

	test('returns to the linter tab when the header picker is requested', () => {
		const { controller } = setup({});
		controller.setActiveTab('preferences');

		controller.chooseSectionHeader(diagnostic);

		expect(controller.activeTab).toBe('linter');
	});

	test('opens guided performer assignment from the linter panel', () => {
		const { controller, editor } = setup({});
		const mismatch = {
			...diagnostic,
			ruleId: 'performer.inline-mismatch',
			message: 'A styled voice is not yet named in the section legend.'
		};

		controller.assignDiagnosticPerformers(mismatch);

		expect(editor.requestPerformerLegendAssignment).toHaveBeenCalledWith(mismatch);
		expect(controller.activeTab).toBe('linter');
	});

	// The panel's way into linking. The card carries the finding but not the
	// group, so it selects the diagnostic's range, the header, and asks the
	// editor the same question `Ctrl-Shift-L` does, over the same predicate.
	test('opens the link picker on the repeated section from the linter panel', () => {
		const { controller, editor } = setup({});
		const repeat = {
			...diagnostic,
			ruleId: 'section.unlinked-repeat',
			message: 'Link the repeated sections so one correction reaches all of them.'
		};

		controller.linkDiagnosticSections(repeat);

		expect(editor.requestSectionLink).toHaveBeenCalled();
		expect(controller.activeTab).toBe('linter');
	});

	test('continues from a deliberately chosen passage after a fix instead of returning to earlier findings', () => {
		const text = '[Verse]\nfirst line\nsecond line\nthird line';
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const earlier: Diagnostic = { ...diagnostic, severity: 'error', from: 8, to: 13 };
		const fixed: Diagnostic = {
			...diagnostic,
			from: 19,
			to: 25,
			fixes: [{ kind: 'safe', label: 'Capitalize', edit: { baseRevision: 1, edits: [] } }]
		};
		const later: Diagnostic = { ...diagnostic, from: 31, to: 36 };
		controller.onSnapshot({ ...snapshot(record, 1, text), diagnostics: [earlier, fixed, later] });
		controller.navigateToDiagnostic(fixed, { focus: false });
		editor.dispatchAtomic = () =>
			controller.onSnapshot({ ...snapshot(record, 2, text), diagnostics: [earlier, later] });
		controller.applyFix(fixed, fixed.fixes![0]);
		expect(controller.activeDiagnosticKey).toBe('section-header-missing:31:36');
	});

	test('hands the editor to the diagnostic the panel leads with after a fix', () => {
		// Applying a fix empties the card the user was reading, so the panel leads
		// with another one, and the editor's active-line wash, which is all that
		// marks where a finding sits, has to travel with it instead of staying on
		// the line the fix landed in.
		const text = '[Verse]\nfirst line\nsecond line';
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const selections: unknown[] = [];
		editor.setSelection = (selection) => selections.push(selection);
		const fixed: Diagnostic = {
			...diagnostic,
			ruleId: 'capitalization.line-start',
			from: 8,
			to: 13,
			fixes: [{ kind: 'safe', label: 'Capitalize', edit: { baseRevision: 1, edits: [] } }]
		};
		const warning: Diagnostic = { ...diagnostic, from: 19, to: 25 };
		// Later in the document but worse, so it leads the panel, in the same order
		// the list reads in, which is why both share one sort.
		const worse: Diagnostic = { ...diagnostic, severity: 'error', from: 26, to: 30 };
		// The dispatch is what triggers the re-lint, and the editor emits the
		// resulting snapshot from inside it.
		editor.dispatchAtomic = () => {
			controller.onSnapshot({ ...snapshot(record, 2, text), diagnostics: [warning, worse] });
		};
		controller.onSnapshot({ ...snapshot(record, 1, text), diagnostics: [fixed, warning] });

		controller.applyFix(fixed, fixed.fixes![0]);

		expect(selections).toEqual([{ anchor: 26, head: 30 }]);
		expect(controller.activeDiagnosticKey).toBe('section-header-missing:26:30');
	});

	// Arriving with a whole document is the same situation as applying a fix: the
	// panel leads with a finding, and nothing in the editor would say where that
	// one sits unless the wash travels to it.
	test('hands the workbench to the leading finding after the sample is loaded', () => {
		const record = draft('draft-a', '');
		const { controller, editor } = setup({ initial: record });
		const selections: unknown[] = [];
		editor.setSelection = (selection) => selections.push(selection);
		const warning: Diagnostic = { ...diagnostic, from: 19, to: 25 };
		const worse: Diagnostic = { ...diagnostic, severity: 'error', from: 26, to: 30 };
		editor.dispatchAtomic = () => {
			controller.onSnapshot({
				...snapshot(record, 1, sampleDraftText),
				diagnostics: [warning, worse]
			});
		};

		controller.loadSample();

		expect(selections).toEqual([{ anchor: 26, head: 30 }]);
		expect(controller.activeDiagnosticKey).toBe('section-header-missing:26:30');
	});

	// The keyboard fallback replaces nothing, so it must not leave the hand-off
	// armed for whatever edit the user makes next.
	test('does not arm the hand-off when the clipboard could not be read', () => {
		const text = '[Verse]\nfirst line';
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const selections: unknown[] = [];
		editor.setSelection = (selection) => selections.push(selection);

		return controller.pasteLyrics().then(() => {
			controller.onSnapshot({
				...snapshot(record, 1, text),
				diagnostics: [{ ...diagnostic, from: 8, to: 13 }]
			});

			expect(selections).toEqual([]);
			expect(controller.activeDiagnosticKey).toBeUndefined();
		});
	});

	// The three refusals of the toolbar's one contrast action. Each used to reach
	// the `sr-only` live region and nothing else, which on the empty document the
	// paste button appears over is a pixel-identical screen: the caret moves into
	// an editor whose active line was already washed. Asserting the toast is
	// asserting the half a sighted user can actually receive.
	test('draws the keyboard hand-off when the clipboard cannot be read', async () => {
		const record = draft('draft-a', '');
		const { controller } = setup({ initial: record });

		await controller.pasteLyrics();

		expect(controller.feedback.toasts.map((toast) => toast.message)).toEqual([
			'Press the paste shortcut to paste into the editor.'
		]);
		expect(controller.feedback.announcement).toBe(
			'Press the paste shortcut to paste into the editor.'
		);
		// An instruction the user has to carry out, not a confirmation of something
		// they just did: the two-second timer is sized for the second kind, and a
		// sentence nobody has read before is off screen before it is read.
		expect(controller.feedback.toasts[0]?.duration).toBe(NOTICE_TOAST_DURATION);
	});

	test('draws the refusal when the clipboard holds no text', async () => {
		const record = draft('draft-a', '');
		const { controller } = setup({ initial: record, readClipboard: () => Promise.resolve('   ') });

		await controller.pasteLyrics();

		expect(controller.feedback.toasts.map((toast) => toast.message)).toEqual([
			'The clipboard has no text to paste.'
		]);
	});

	test('draws the refusal when the markup could not be copied', async () => {
		const record = draft('draft-a', '[Verse]\nfirst line');
		const { controller } = setup({
			initial: record,
			copy: () => Promise.reject(new Error('denied'))
		});

		await expect(controller.copyCanonical()).resolves.toBe(false);

		expect(controller.feedback.toasts.map((toast) => toast.message)).toEqual([
			'Copy failed. Check browser clipboard permission and try again.'
		]);
	});

	// A copy that lands is not an event: the document is unchanged and the user
	// pressed the button, so a toast would be the workbench congratulating itself.
	test('says nothing on screen when the markup reaches the clipboard', async () => {
		const record = draft('draft-a', '[Verse]\nfirst line');
		const { controller } = setup({ initial: record });

		await expect(controller.copyCanonical()).resolves.toBe(true);

		expect(controller.feedback.toasts).toEqual([]);
	});

	test('leaves the editor where it is when a fix clears the last diagnostic', () => {
		const text = '[Verse]\nfirst line';
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const selections: unknown[] = [];
		editor.setSelection = (selection) => selections.push(selection);
		const only: Diagnostic = {
			...diagnostic,
			from: 8,
			to: 13,
			fixes: [{ kind: 'safe', label: 'Capitalize', edit: { baseRevision: 1, edits: [] } }]
		};
		editor.dispatchAtomic = () => {
			controller.onSnapshot({ ...snapshot(record, 2, text), diagnostics: [] });
		};
		controller.onSnapshot({ ...snapshot(record, 1, text), diagnostics: [only] });

		controller.applyFix(only, only.fixes![0]);

		expect(selections).toEqual([]);
		expect(controller.activeDiagnosticKey).toBeUndefined();
	});

	test.each(['ignore', 'restore'])(
		'keeps a diagnostic %s Undo out of a different draft',
		async (action) => {
			const first = draft('draft-a', '[Verse]\nfirst line');
			const second = draft('draft-b', first.text);
			const { controller, ignoreStore } = setup({ initial: first, drafts: [first, second] });
			const finding: Diagnostic = { ...diagnostic, from: 8, to: 13 };
			controller.onSnapshot({ ...snapshot(first, 1), diagnostics: [finding] });
			controller.ignoreDiagnostic(finding);
			if (action === 'restore') controller.restoreDiagnostic(controller.ignoredDiagnosticKeys[0]!);
			const undo = controller.feedback.toasts.at(-1)!.id;
			await controller.openDraft(second.id);
			controller.onSnapshot({ ...snapshot(second, 1), diagnostics: [finding] });
			controller.ignoreDiagnostic(finding);
			if (action === 'restore') controller.restoreDiagnostic(controller.ignoredDiagnosticKeys[0]!);
			const before = [...controller.ignoredDiagnosticKeys];
			controller.feedback.runToastAction(undo);
			expect(controller.ignoredDiagnosticKeys).toEqual(before);
			expect(ignoreStore.list(first.id)).toHaveLength(action === 'ignore' ? 1 : 0);
			expect(controller.feedback.announcement).toContain('original');
		}
	);

	test('keeps an ignored diagnostic hidden when edits remove and later recreate it', () => {
		const text = '[Verse]\nfirst line';
		const record = draft('draft-a', text);
		const { controller } = setup({ initial: record });
		const finding: Diagnostic = { ...diagnostic, from: 8, to: 13 };
		controller.onSnapshot({ ...snapshot(record, 1, text), diagnostics: [finding] });
		controller.ignoreDiagnostic(finding);
		expect(controller.ignoredDiagnosticCount).toBe(1);

		const fixed = snapshot(record, 2, '[Verse]\nFirst line');
		controller.onSnapshot(fixed);
		expect(controller.ignoredDiagnosticCount).toBe(1);

		controller.onSnapshot({ ...snapshot(record, 3, text), diagnostics: [finding] });
		expect(controller.visibleDiagnostics).toEqual([]);
		expect(controller.ignoredDiagnosticCount).toBe(1);
	});

	/**
	 * The panel used to mirror the store's list and re-read it only on a draft
	 * *change*, which misses the other way the store empties: `clearDraft`, run
	 * from the draft store when an emptied 'scribe is discarded or one is
	 * deleted. Discarding and undoing never changes which draft is open, so the
	 * panel went on hiding findings whose ignores no longer existed anywhere,
	 * and a reload brought them all back, since the rows had gone with the
	 * record.
	 */
	test('stops hiding findings once the stored ignores are cleared under it', () => {
		const text = '[Verse]\nfirst line';
		const record = draft('draft-a', text);
		const { controller, ignoreStore } = setup({ initial: record });
		const finding: Diagnostic = { ...diagnostic, from: 8, to: 13 };
		controller.onSnapshot({ ...snapshot(record, 1, text), diagnostics: [finding] });
		controller.ignoreDiagnostic(finding);
		expect(controller.visibleDiagnostics).toEqual([]);
		expect(controller.ignoredDiagnosticKeys).toHaveLength(1);

		ignoreStore.clearDraft('draft-a');

		// The same draft throughout, and the edit that puts the text back is what
		// republishes, which is exactly the shape of a discard the user undoes.
		controller.onSnapshot({ ...snapshot(record, 2, text), diagnostics: [finding] });
		expect(controller.ignoredDiagnosticKeys).toEqual([]);
		expect(controller.visibleDiagnostics).toEqual([finding]);
	});

	/**
	 * The picker's unknown-voice chip is the answer `The performer is unknown`,
	 * so the finding the wrap creates has to arrive already accepted, and the
	 * acceptance keys on the voice rather than on the words it sings, so editing
	 * the lyrics inside the tags cannot resurrect the card. Both halves broke
	 * before this was pinned: the card asked the question the picker had just
	 * answered, and asked it again after every edit between the tags.
	 */
	test('a minted unknown voice arrives accepted and stays accepted while its lyrics change', () => {
		const preText = '[Chorus: A]\nhello there';
		const record = draft('draft-a', preText);
		const { controller } = setup({ initial: record });
		controller.onSnapshot(snapshot(record, 1, preText));

		// What Workspace's `createUnknownVoiceEdit` records as it applies the
		// wrap, keyed against the pre-edit document: the finding does not exist
		// yet, and matching gates only on the parts knowable here.
		controller.recordAcceptedOccurrence(
			unknownVoiceAcceptanceKey(preText, { from: 12, to: 23 }, 2)
		);

		const settle = (revision: number, text: string): Diagnostic[] => {
			const next = snapshot(record, revision, text);
			const diagnostics = computeDiagnostics(
				next.parsed,
				buildRuleContext(record.language, record.performers, record.ruleSetVersion, next.revision)
			);
			controller.onSnapshot({ ...next, diagnostics });
			return diagnostics;
		};

		const wrapped = settle(2, '[Chorus: A]\n<i>hello there</i>');
		expect(wrapped.map((finding) => finding.ruleId)).toContain('performer.inline-mismatch');
		expect(controller.unignoredDiagnostics.map((finding) => finding.ruleId)).not.toContain(
			'performer.inline-mismatch'
		);
		expect(controller.ignoredDiagnosticCount).toBe(1);

		// Every word the voice sings changes; the answer must not.
		settle(3, '[Chorus: A]\n<i>goodbye everyone else</i>');
		expect(controller.unignoredDiagnostics.map((finding) => finding.ruleId)).not.toContain(
			'performer.inline-mismatch'
		);
		expect(controller.ignoredDiagnosticCount).toBe(1);
	});

	test('shows provisional verse numbering only when its prose-header prerequisite is ignored', () => {
		const text = 'Verse 1:\nFirst\n\n[Verse 2]\nSecond';
		const record = draft('draft-a', text);
		const { controller } = setup({ initial: record });
		const next = snapshot(record, 1, text);
		const diagnostics = computeDiagnostics(
			next.parsed,
			buildRuleContext(record.language, record.performers, record.ruleSetVersion, next.revision)
		);
		const proseHeader = diagnostics.find(
			(diagnostic) => diagnostic.ruleId === 'section.header-prose'
		);

		expect(proseHeader).toBeDefined();
		expect(diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain('section.verse-numbering');
		controller.onSnapshot({ ...next, diagnostics });
		expect(controller.unignoredDiagnostics.map((diagnostic) => diagnostic.ruleId)).not.toContain(
			'section.verse-numbering'
		);

		controller.ignoreDiagnostic(proseHeader!);
		expect(controller.unignoredDiagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
			'section.verse-numbering'
		);

		controller.restoreDiagnostic(controller.ignoredDiagnosticKeys[0]!);
		expect(controller.unignoredDiagnostics.map((diagnostic) => diagnostic.ruleId)).not.toContain(
			'section.verse-numbering'
		);
	});

	test('offers the assignment only where the document can take one', () => {
		// The editor's popover asks the same question of the same document, so a
		// card must not advertise an action the popover withholds.
		const text = '[Verse]\n<i>Blair sings</i>\n\nOne more line\n<b>Avery answers</b>';
		const record = { ...draft('draft-a', text) };
		const { controller } = setup({ initial: record });
		controller.onSnapshot(snapshot(record, 1, text));
		const styled = (fragment: string): Diagnostic => ({
			...diagnostic,
			ruleId: 'performer.inline-mismatch',
			message: 'A styled voice is not yet named in the section legend.',
			from: text.indexOf(fragment),
			to: text.indexOf(fragment) + fragment.length
		});

		expect(controller.canAssignDiagnosticPerformers(styled('<i>Blair sings</i>'))).toBe(true);
		// The second section has no header at all, so there is no legend to write.
		expect(controller.canAssignDiagnosticPerformers(styled('<b>Avery answers</b>'))).toBe(false);
		expect(controller.canAssignDiagnosticPerformers(diagnostic)).toBe(false);
	});
});

describe('workbench performer imports', () => {
	test('an earlier roster Undo preserves performers added later', () => {
		const { controller } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1);
		controller.addPerformer('Noor');

		controller.feedback.runToastAction(undo?.id ?? '');

		expect(controller.performers.map((entry) => entry.displayName)).toEqual(['Noor']);
	});

	test('a roster Undo cannot replace another draft roster', async () => {
		const { controller } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1);
		await controller.createDraft();
		controller.addPerformer('Noor');
		const expected = controller.performers.map((entry) => ({ ...entry }));

		controller.feedback.runToastAction(undo?.id ?? '');

		expect(controller.performers).toEqual(expected);
	});

	test.each([false, true])(
		'independent roster Undo works in either order (reverse %s)',
		(reverse) => {
			const { controller } = setup({ initial: draft('draft-a', '') });
			controller.addPerformer('Mira');
			const first = controller.feedback.toasts.at(-1)!.id;
			controller.addPerformer('Noor');
			const second = controller.feedback.toasts.at(-1)!.id;
			for (const id of reverse ? [second, first] : [first, second])
				controller.feedback.runToastAction(id);
			expect(controller.performers).toEqual([]);
		}
	);

	test('coalesced identical additions undo their identities without removing an edited neighbour', () => {
		const { controller } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Noor');
		const noor = controller.performers[0]!;
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1)!.id;
		controller.addPerformer('Mira');
		expect(controller.feedback.toasts.find((toast) => toast.id === undo)?.count).toBe(2);
		controller.renamePerformer(noor.id, 'Nora');
		const retained = controller.performers.find((entry) => entry.id === noor.id);
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual([retained]);
	});

	test('refuses changed affected records visibly and announces the refusal', () => {
		const { controller } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1)!.id;
		controller.renamePerformer(controller.performers[0]!.id, 'Luna');
		const expected = controller.performers.map((entry) => ({ ...entry }));
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual(expected);
		expect(controller.feedback.announcement).toContain('affected performer has changed');
		expect(controller.feedback.toasts.at(-1)?.message).toBe(controller.feedback.announcement);
	});

	test('refuses old actions after switching away and back', async () => {
		const { controller } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1)!.id;
		await controller.createDraft();
		await controller.openDraft('draft-a');
		controller.feedback.runToastAction(undo);
		expect(controller.performers.map((entry) => entry.displayName)).toEqual(['Mira']);
		expect(controller.feedback.announcement).toContain('switching drafts');
	});

	test('coalesced actions across duplicate drafts only undo the active draft addition', async () => {
		const { controller, repository } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1)!.id;
		const mira = controller.performers[0]!;
		await controller.duplicateDraft('draft-a');
		await controller.openDraft(
			(await repository.list()).find((entry) => entry.id !== 'draft-a')!.id
		);
		expect(controller.performers[0]).toEqual(mira);
		controller.addPerformer('Mira');
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual([mira]);
	});

	test('legacy header rename Undo cannot rename a duplicate with the same performer IDs', async () => {
		const { controller, repository } = setup({ initial: draft('draft-a', '[Verse: Mira]\nMoon') });
		controller.renamePerformer(controller.performers[0]!.id, 'Luna');
		const undo = controller.feedback.toasts.at(-1)!.id;
		await controller.duplicateDraft('draft-a');
		await controller.openDraft(
			(await repository.list()).find((entry) => entry.id !== 'draft-a')!.id
		);
		const expected = controller.performers.map((entry) => ({ ...entry }));
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual(expected);
		expect(controller.feedback.announcement).toContain('switching drafts');
	});

	test.each(['add', 'import'])(
		'pending %s Undo cannot orphan retained rich legend and voice identities',
		async (kind) => {
			let exported = '';
			const initial = draft('draft-a', '');
			const { controller } = setup({
				initial,
				exportText: (text) => {
					exported = text;
				}
			});
			if (kind === 'add') controller.addPerformer('Mira');
			else
				controller.onSnapshot(
					snapshot(initial, 1, '[Verse: Mira]\nA long enough line to trigger imported performers')
				);
			const undo = controller.feedback.toasts.at(-1)!.id;
			const text = '[Verse: Mira]\nMoon';
			const model = importDocument({ text, profile: 'genius', performers: controller.performers });
			expect(model.ok).toBe(true);
			if (!model.ok) return;
			expect(model.value.voices.flatMap((voice) => voice.performerIds)).toContain(
				controller.performers[0]!.id
			);
			const conversion = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
			controller.onSnapshot({ ...snapshot(initial, 2, conversion.projectionText), conversion });
			const expected = controller.performers.map((entry) => ({ ...entry }));
			controller.feedback.runToastAction(undo);
			expect(controller.performers).toEqual(expected);
			expect(controller.feedback.announcement).toContain('retained voices or legends');
			expect(controller.feedback.toasts.at(-1)?.message).toBe(controller.feedback.announcement);
			await controller.exportScribe();
			expect(parseScribe(exported).performers).toEqual(expected);
		}
	);

	test('an unreferenced addition still undoes after a rich document update', () => {
		const initial = draft('draft-a', 'Moon');
		const { controller, editor } = setup({ initial });
		editor.dispatchPerformerRecords = (delta) => {
			controller.adoptPerformerRecords(delta);
			return { ok: true };
		};
		controller.addPerformer('Mira');
		const undo = controller.feedback.toasts.at(-1)!.id;
		const model = importDocument({
			text: 'Moon',
			profile: 'genius',
			performers: controller.performers
		});
		if (!model.ok) throw new Error(model.refusal.message);
		const conversion = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
		controller.onSnapshot({ ...snapshot(initial, 1, conversion.projectionText), conversion });
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual([]);
	});

	test('roster-only rename Undo refuses after the renamed performer gains rich references', () => {
		const initial = draft('draft-a', 'Moon');
		const { controller } = setup({ initial });
		controller.addPerformer('Mira');
		controller.renamePerformer(controller.performers[0]!.id, 'Luna');
		const undo = controller.feedback.toasts.at(-1)!.id;
		const model = importDocument({
			text: '[Verse: Luna]\nMoon',
			profile: 'genius',
			performers: controller.performers
		});
		if (!model.ok) throw new Error(model.refusal.message);
		const conversion = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
		controller.onSnapshot({ ...snapshot(initial, 1, conversion.projectionText), conversion });
		controller.feedback.runToastAction(undo);
		expect(controller.performers[0]?.displayName).toBe('Luna');
		expect(controller.feedback.announcement).toContain('retained voices or legends');
		expect(controller.snapshot.conversion?.model.sections[0]?.header).toBe('[Verse: Luna]\n');
	});

	test('legacy merge Undo cannot detach an alias used by a retained rich legend', () => {
		const initial = draft('draft-a', 'Moon');
		const { controller, editor } = setup({ initial });
		editor.dispatchPerformerRecords = (delta) => {
			controller.adoptPerformerRecords(delta);
			return { ok: true };
		};
		controller.addPerformer('Mira');
		controller.addPerformer('Noor');
		controller.mergePerformers(controller.performers[0]!.id, controller.performers[1]!.id);
		const undo = controller.feedback.toasts.at(-1)!.id;
		const model = importDocument({
			text: '[Verse: Mira]\nMoon',
			profile: 'genius',
			performers: controller.performers
		});
		if (!model.ok) throw new Error(model.refusal.message);
		const conversion = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
		controller.onSnapshot({ ...snapshot(initial, 1, conversion.projectionText), conversion });
		const expected = controller.performers.map((record) => ({ ...record }));
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual(expected);
		expect(controller.feedback.announcement).toContain('retained voices or legends');
	});

	test.each(['add', 'import'])('restores the last removed performer before a later %s', (kind) => {
		const initial = draft('draft-a', '');
		const { controller } = setup({ initial });
		controller.addPerformer('Mira');
		controller.addPerformer('Noor');
		const noor = controller.performers[1]!;
		controller.removePerformer(noor.id);
		const undo = controller.feedback.toasts.at(-1)!.id;
		if (kind === 'add') controller.addPerformer('Lena');
		else
			controller.onSnapshot(
				snapshot(initial, 1, '[Verse: Lena]\nA sufficiently long lyric line for performer import')
			);
		controller.feedback.runToastAction(undo);
		expect(controller.performers.map((entry) => entry.displayName)).toEqual([
			'Mira',
			'Noor',
			'Lena'
		]);
		expect(new Set(controller.performers.map((entry) => entry.order)).size).toBe(3);
	});

	test('removal Undo restores exact identity and position without replacing later edits', () => {
		const { controller } = setup({ initial: draft('draft-a', '') });
		controller.addPerformer('Mira');
		controller.addPerformer('Noor');
		const mira = { ...controller.performers[0]! };
		const noor = controller.performers[1]!;
		controller.removePerformer(mira.id);
		const undo = controller.feedback.toasts.at(-1)!.id;
		controller.renamePerformer(noor.id, 'Nora');
		const nora = { ...controller.performers[0]! };
		controller.feedback.runToastAction(undo);
		expect(controller.performers).toEqual([mira, nora]);
	});

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

	// A styled slot with no header entry is an unknown voice, the text's own
	// fact, derived where needed and never a roster identity. Import used to
	// answer it by minting an `Unresolved voice 2` performer, which put a
	// pressable stranger with a color in every picker.
	test('imports on an explicit short draft open without minting placeholder voices', async () => {
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

		expect(controller.performers.map((entry) => entry.displayName)).toEqual(['Avery']);
		expect(controller.snapshot.text).toBe(second.text);
	});

	// Drafts saved while the minting ran still carry the records, so the same
	// import that created them retires them, except one a header genuinely
	// names, which is a real reference the roster must keep resolving.
	test('retires stored placeholder voices on import unless a header names them', async () => {
		const first = draft('draft-a', '');
		const second = {
			...draft(
				'draft-b',
				'[Chorus: Avery & <i>Unresolved voice 2</i>]\nPlain lyric with <i>a styled voice</i>'
			),
			performers: [
				{
					id: 'named-2',
					displayName: 'Unresolved voice 2',
					normalizedKey: 'unresolved voice 2',
					aliases: ['Unresolved voice 2'],
					colorId: 'performer-1',
					order: 0
				},
				{
					id: 'stale-3',
					displayName: 'Unresolved voice 3',
					normalizedKey: 'unresolved voice 3',
					aliases: ['Unresolved voice 3'],
					colorId: 'performer-2',
					order: 1
				}
			]
		};
		const repository = createInMemoryDraftRepository([first, second]);
		const controlled = controllableAutosave(repository);
		const { controller } = setup({
			initial: first,
			repository,
			autosave: controlled.autosave
		});

		await controller.openDraft(second.id);

		expect(controller.performers.map((entry) => entry.displayName)).toEqual([
			'Unresolved voice 2',
			'Avery'
		]);
		expect(controller.feedback.toasts.map((toast) => toast.message)).toContain(
			'Removed the imported placeholder Unresolved voice 3.'
		);
	});

	test.each(['<i>Noor', '<mark>Noor</mark>'])(
		'keeps a genuine placeholder-shaped name beside malformed legend %s',
		async (malformedName) => {
			const first = draft('draft-a', '');
			const second = {
				...draft('draft-b', `[Verse: Unresolved voice 2, ${malformedName}]\nWords stay`),
				performers: [
					{
						id: 'genuine-performer',
						displayName: 'Unresolved voice 2',
						normalizedKey: 'unresolved voice 2',
						aliases: [],
						colorId: 'plum',
						order: 0
					}
				]
			};
			const repository = createInMemoryDraftRepository([first, second]);
			const controlled = controllableAutosave(repository);
			const { controller } = setup({ initial: first, repository, autosave: controlled.autosave });

			await controller.openDraft(second.id);

			expect(controller.performers).toEqual(second.performers);
			expect(controller.snapshot.text).toBe(second.text);
			await controlled.autosave.flush();
			expect((await repository.get(second.id))?.performers).toEqual(second.performers);
		}
	);
	test.each(['', ', <mark>Ed</mark>'])(
		'keeps a genuine joint-voice member when its partner is discovered during open (%s)',
		async (malformedNeighbor) => {
			const first = draft('draft-a', '');
			const genuine = {
				id: 'genuine-joint-member',
				displayName: 'Unresolved voice 2',
				normalizedKey: 'unresolved voice 2',
				aliases: ['Original artist spelling'],
				colorId: 'plum',
				order: 0
			};
			const second = {
				...draft(
					'draft-b',
					`[Verse: Unresolved voice 2 & Noor${malformedNeighbor}]\nWords stay\n\n[Chorus: Noor]\nMore words`
				),
				performers: [genuine]
			};
			const repository = createInMemoryDraftRepository([first, second]);
			const controlled = controllableAutosave(repository);
			const { controller } = setup({ initial: first, repository, autosave: controlled.autosave });

			await controller.openDraft(second.id);

			expect(controller.performers[0]).toEqual(genuine);
			expect(controller.performers.map((record) => record.displayName)).toEqual([
				'Unresolved voice 2',
				'Noor'
			]);
			expect(controller.snapshot.text).toBe(second.text);
			await controlled.autosave.flush();
			expect((await repository.get(second.id))?.performers).toEqual(controller.performers);
		}
	);

	test.each(['genius', 'musixmatch'] as const)(
		'keeps a placeholder-shaped identity referenced by retained %s voices',
		async (profile) => {
			const first = draft('draft-a', '');
			const performers = [
				{
					id: 'genuine-performer',
					displayName: 'Unresolved voice 2',
					normalizedKey: 'unresolved voice 2',
					aliases: [],
					colorId: 'plum',
					order: 0
				}
			];
			const imported = importDocument({
				text: '[Verse: Unresolved voice 2]\nWords stay',
				profile: 'genius',
				language: 'en',
				performers
			});
			if (!imported.ok) throw new Error(imported.refusal.message);
			const conversion = createConversionEnvelope(imported.value, profile, profilePolicyVersions);
			const second = { ...draft('draft-b', conversion.projectionText), performers, conversion };
			const repository = createInMemoryDraftRepository([first, second]);
			const { controller } = setup({
				initial: first,
				repository,
				onOpenDraft: (record) => ({ ...snapshot(record), conversion: record.conversion })
			});

			await controller.openDraft(second.id);

			expect(controller.performers).toEqual(performers);
			expect(controller.snapshot.conversion?.model.voices).toEqual(imported.value.voices);
			expect(controller.snapshot.text).toBe(conversion.projectionText);
		}
	);

	test('follows a header rename in the roster and keeps the old spelling resolvable', () => {
		const initial = draft('draft-a', '[Verse 1: Avery]\nA line\n\n[Chorus: Avery]\nAnother line');
		const { controller } = setup({ initial });
		const toastsBefore = controller.feedback.toasts.length;

		controller.adoptHeaderRename(controller.performers[0]?.id ?? '', 'Avery', 'Averie');

		expect(controller.performers).toEqual([
			expect.objectContaining({
				displayName: 'Averie',
				normalizedKey: 'averie',
				aliases: ['Avery']
			})
		]);
		// The header edit already lives in editor undo; a roster toast here would
		// offer a second, conflicting undo for the same user action.
		expect(controller.feedback.toasts).toHaveLength(toastsBefore);
	});

	test('leaves no stale alias when a rename is typed back to the original name', () => {
		const initial = draft('draft-a', '[Verse 1: Avery]\nA line\n\n[Chorus: Avery]\nAnother line');
		const { controller } = setup({ initial });
		const id = controller.performers[0]?.id ?? '';

		controller.adoptHeaderRename(id, 'Avery', 'Avery');
		expect(controller.performers[0]?.aliases).toEqual([]);

		// One rename reports every keystroke against the name it started from.
		controller.adoptHeaderRename(id, 'Avery', 'Averi');
		controller.adoptHeaderRename(id, 'Avery', 'Avery');
		expect(controller.performers[0]).toEqual(
			expect.objectContaining({ displayName: 'Avery', aliases: [] })
		);
	});
});

/** A live view of the document the applying stub editor is rewriting. */
interface AppliedDocument {
	readonly text: string;
}

describe('workbench performer renames', () => {
	const text = '[Verse 1: Avery]\nA line\n\n[Chorus: Avery]\nAnother line';

	/** A stub editor that applies dispatched edits and re-emits the snapshot. */
	function applyingEditor(
		controller: ReturnType<typeof setup>['controller'],
		editor: EditorHandle,
		record: DraftRecord
	): AppliedDocument {
		let currentText = record.text;
		let revision = 0;
		editor.dispatchAtomic = (edit, delta) => {
			if (delta) controller.adoptPerformerRecords(delta);
			// Back to front, so earlier offsets stay valid while later ones move.
			for (const change of [...edit.edits].sort((left, right) => right.from - left.from)) {
				currentText =
					currentText.slice(0, change.from) + change.insert + currentText.slice(change.to);
			}
			revision += 1;
			controller.onSnapshot(snapshot(record, revision, currentText));
		};
		return {
			get text() {
				return currentText;
			}
		};
	}

	// The mirror already runs the other way (editing a name inside one header
	// rewrites the others and the roster adopts it), so a roster rename that
	// stopped at the record left the legend reading the old name, which is the
	// one job a roster rename exists for.
	test('renaming a performer in the roster rewrites every header that names them', () => {
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const dispatched: Parameters<EditorHandle['dispatchAtomic']>[0][] = [];
		editor.dispatchAtomic = (edit, delta) => {
			if (delta) controller.adoptPerformerRecords(delta);
			dispatched.push(edit);
			controller.onSnapshot(snapshot(record, 1, text.replaceAll('Avery', 'Avery Stone')));
		};
		const avery = controller.performers.find((entry) => entry.displayName === 'Avery');

		controller.renamePerformer(avery?.id ?? '', 'Avery Stone');

		const verse = text.indexOf('Avery');
		const chorus = text.lastIndexOf('Avery');
		expect(dispatched).toEqual([
			{
				baseRevision: 0,
				edits: [
					{ from: verse, to: verse + 'Avery'.length, insert: 'Avery Stone' },
					{ from: chorus, to: chorus + 'Avery'.length, insert: 'Avery Stone' }
				]
			}
		]);
		// The old spelling stays resolvable, so an editor undo of the rewrite
		// does not import a duplicate performer, and the color is re-derived,
		// because it was derived from a name the performer no longer has.
		// `Avery` ranks olive and `Avery Stone` ranks plum, so the pair proves
		// the reallocation actually ran.
		expect(controller.performers.find((entry) => entry.id === avery?.id)).toEqual(
			expect.objectContaining({
				displayName: 'Avery Stone',
				aliases: ['Avery'],
				colorId: 'plum'
			})
		);
		expect(controller.feedback.toasts.at(-1)?.message).toBe(
			'Renamed Avery to Avery Stone in 2 headers.'
		);
	});

	test('the rename toast’s Undo puts the old spelling back in the headers', () => {
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const document = applyingEditor(controller, editor, record);
		const avery = controller.performers.find((entry) => entry.displayName === 'Avery');

		controller.renamePerformer(avery?.id ?? '', 'Averie');
		expect(document.text).toBe('[Verse 1: Averie]\nA line\n\n[Chorus: Averie]\nAnother line');

		controller.feedback.toasts.at(-1)?.action?.();

		expect(document.text).toBe(text);
		expect(controller.performers.find((entry) => entry.id === avery?.id)?.displayName).toBe(
			'Avery'
		);
	});

	test('a performer named in no header renames in the roster alone', () => {
		const record = draft('draft-a', '[Verse]\nA line');
		const { controller, editor } = setup({ initial: record });
		controller.addPerformer('Blair');
		const dispatched: unknown[] = [];
		editor.dispatchAtomic = (edit) => dispatched.push(edit);
		const blair = controller.performers.find((entry) => entry.displayName === 'Blair');

		controller.renamePerformer(blair?.id ?? '', 'Blaire');

		expect(dispatched).toEqual([]);
		// `Blair` and `Blaire` both rank olive: a rename whose new name derives
		// the color the performer already wears moves nothing.
		expect(controller.performers.find((entry) => entry.id === blair?.id)).toEqual(
			expect.objectContaining({ displayName: 'Blaire', colorId: 'olive' })
		);
	});

	// `adoptHeaderRename` fires per keystroke while a name is typed in a header,
	// so re-deriving the color there would strobe every bar in the document
	// through the palette mid-word. Only settled renames recolor.
	test('a header rename typed in the document keeps its color while in flight', () => {
		const record = draft('draft-a', text);
		const { controller } = setup({ initial: record });
		const avery = controller.performers.find((entry) => entry.displayName === 'Avery');
		const before = avery?.colorId;

		controller.adoptHeaderRename(avery?.id ?? '', 'Avery', 'Avery Stone');

		expect(controller.performers.find((entry) => entry.id === avery?.id)?.colorId).toBe(before);
	});

	// The header-side mirror refuses to spread a name that would change how a
	// header parses; the roster-side rename owes the same refusal, and the alias
	// is what keeps the untouched headers resolving to the renamed performer.
	test('a name that cannot sit in a header renames the record and leaves the document alone', () => {
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const dispatched: unknown[] = [];
		editor.dispatchAtomic = (edit) => dispatched.push(edit);
		const avery = controller.performers.find((entry) => entry.displayName === 'Avery');

		controller.renamePerformer(avery?.id ?? '', 'Avery, The Voice');

		expect(dispatched).toEqual([]);
		expect(controller.performers.find((entry) => entry.id === avery?.id)).toEqual(
			expect.objectContaining({ displayName: 'Avery, The Voice', aliases: ['Avery'] })
		);
		expect(controller.feedback.toasts.at(-1)?.message).toContain('The headers keep Avery');
	});
});

describe('linking navigation origin', () => {
	const text = '[Chorus]\nHold on\n\n[Chorus 2]\nHold on';
	const secondHeader = text.indexOf('[Chorus 2]');

	test('retains an overview request through selection-only snapshots and replaces it on an explicit section request', () => {
		const initial = draft('draft-a', text);
		const { controller } = setup({ initial });
		controller.openLinking(0, { fromOverview: true, comparedHeaders: [0, secondHeader] });
		controller.onSnapshot({
			...snapshot(initial),
			selection: { anchor: secondHeader, head: secondHeader }
		});
		expect(controller.linkingHeaderFrom).toBe(0);
		expect(controller.linkingFromOverview).toBe(true);
		expect(controller.linkingComparedHeaders).toEqual([0, secondHeader]);

		controller.openLinking(secondHeader);
		expect(controller.linkingHeaderFrom).toBe(secondHeader);
		expect(controller.linkingFromOverview).toBe(false);
		expect(controller.linkingComparedHeaders).toBeUndefined();
	});

	test('rejects a stale explicit header without relabelling the current overview comparison', () => {
		const { controller } = setup({ initial: draft('draft-a', text) });
		controller.openLinking(0, { fromOverview: true, comparedHeaders: [0, secondHeader] });
		controller.openLinking(2);
		expect(controller.linkingHeaderFrom).toBe(0);
		expect(controller.linkingFromOverview).toBe(true);
		expect(controller.linkingComparedHeaders).toEqual([0, secondHeader]);
		expect(controller.feedback.announcement).toBe(
			'That section has changed. Choose it again in Linking.'
		);
	});

	test('clears the origin with a closed comparison, a text revision, and a draft switch', async () => {
		const initial = draft('draft-a', text);
		const next = draft('draft-b', text);
		const { controller } = setup({ initial, drafts: [initial, next] });
		controller.openLinking(0, { fromOverview: true, comparedHeaders: [0, secondHeader] });
		controller.closeLinking();
		expect(controller.linkingHeaderFrom).toBeUndefined();
		expect(controller.linkingFromOverview).toBe(false);
		expect(controller.linkingComparedHeaders).toBeUndefined();

		controller.openLinking(0, { fromOverview: true, comparedHeaders: [0, secondHeader] });
		controller.onSnapshot(snapshot(initial, 1, text + '!'));
		expect(controller.linkingHeaderFrom).toBeUndefined();
		expect(controller.linkingFromOverview).toBe(false);
		expect(controller.linkingComparedHeaders).toBeUndefined();

		controller.openLinking(0, { fromOverview: true, comparedHeaders: [0, secondHeader] });
		await controller.openDraft(next.id);
		expect(controller.linkingHeaderFrom).toBeUndefined();
		expect(controller.linkingFromOverview).toBe(false);
		expect(controller.linkingComparedHeaders).toBeUndefined();
	});
});

test('a transferred recovery cannot export an unrelated local original through the controller', async () => {
	Dexie.dependencies.indexedDB = indexedDB;
	Dexie.dependencies.IDBKeyRange = IDBKeyRange;
	const source = await openDatabase(`recovery-controller-source-${crypto.randomUUID()}`);
	const destination = await openDatabase(`recovery-controller-destination-${crypto.randomUUID()}`);
	const controllers: ReturnType<typeof setup>['controller'][] = [];
	try {
		const original = draft('foreign-original', '[Verse]\nExact original lyrics');
		const model = importDocument({ text: original.text, profile: 'genius', language: 'en' });
		if (!model.ok) throw new Error(model.refusal.message);
		const conversion = createConversionEnvelope(model.value, 'genius', profilePolicyVersions);
		await source.drafts.add({
			...original,
			conversion: { ...conversion, converterVersion: 'future' as '2' }
		});
		const sourceRepository = createDraftRepository(source);
		const recovered = await sourceRepository.recoverUnreadable?.(original.id);
		expect(recovered?.conversionRecovery?.sourceDraftId).toBe(original.id);
		if (!recovered) throw new Error('Missing recovery');
		const localExport = vi.fn();
		const local = setup({
			initial: original,
			repository: sourceRepository,
			exportText: localExport,
			onOpenDraft: (record) => ({
				...snapshot(record),
				conversion: record.conversion,
				conversionRecovery: record.conversionRecovery,
				originalRecovery: record.originalRecovery
			})
		});
		controllers.push(local.controller);
		await local.controller.openDraft(recovered.id);
		await local.controller.exportOriginalRecovery();
		expect(JSON.parse(localExport.mock.calls[0][0])).toMatchObject({
			id: original.id,
			text: original.text,
			conversion: { converterVersion: 'future' }
		});
		const file = serializeScribe({
			title: recovered.title,
			language: recovered.language,
			lyrics: recovered.text,
			conversion: recovered.conversion,
			conversionRecovery: recovered.conversionRecovery,
			performers: [],
			sectionLinks: [],
			lineAnchors: [],
			ignoredDiagnostics: []
		});
		const repository = createDraftRepository(destination);
		const unrelated = await repository.create({
			...draft(original.id),
			text: 'UNRELATED DESTINATION LYRICS'
		});
		const exported = vi.fn();
		const { controller } = setup({
			initial: unrelated,
			repository,
			exportText: exported,
			onOpenDraft: (record) => ({
				...snapshot(record),
				conversion: record.conversion,
				conversionRecovery: record.conversionRecovery,
				originalRecovery: record.originalRecovery
			})
		});
		controllers.push(controller);
		expect(await controller.importScribe(new File([file], 'recovery.lls'))).toBe(true);
		expect(controller.snapshot.text).toBe(recovered.text);
		expect(controller.snapshot.conversionRecovery).toMatchObject({
			reason: recovered.conversionRecovery?.reason,
			text: recovered.text,
			checkpoint: recovered.conversion
		});
		await controller.exportOriginalRecovery();
		expect(exported).not.toHaveBeenCalled();
		expect(controller.feedback.announcement).toBe(
			'The original data could not be exported. It has not been changed.'
		);
		expect(await destination.drafts.get(original.id)).toEqual(unrelated);
	} finally {
		for (const controller of controllers) await controller.flushAutosave();
		for (const db of [source, destination]) {
			closeDatabase(db);
			await Dexie.delete(db.name);
		}
	}
});

describe('one main draft and independent output', () => {
	test('keeps annotated source and selection exact, remembers output, and expires it irreversibly on original edits', async () => {
		const text =
			'[Verse]\nWith 2 old tickets and a folded map (Whatever)\nA [silver compass](123456) (nearby)';
		const initial = draft('draft-a', text);
		const { controller, repository } = setup({ initial });
		const before = controller.snapshot;
		expect(controller.getExport()).toContain('silver compass');
		expect(controller.setExport('Independent output\n')).toBe(true);
		expect(controller.snapshot).toBe(before);
		expect(controller.getExport()).toBe('Independent output\n');
		expect(controller.setExport('Late output from another load', controller.draftSession + 1)).toBe(
			false
		);
		expect(controller.getExport()).toBe('Independent output\n');
		controller.switchProfile('musixmatch');
		expect(controller.profile).toBe('genius');
		controller.onSnapshot({ ...before, revision: 1, selection: { anchor: 2, head: 2 } });
		await controller.setTitle('Renamed');
		expect(controller.getExport()).toBe('Independent output\n');
		await controller.flushAutosave();
		const saved = await repository.get(initial.id);
		expect(saved?.writing).toMatchObject({
			phase: 'writing',
			export: { text: 'Independent output\n' }
		});
		controller.onSnapshot({ ...controller.snapshot, revision: 2, text: `${text}\nChanged` });
		expect(controller.getExport()).not.toBe('Independent output\n');
		controller.onSnapshot({ ...controller.snapshot, revision: 3, text });
		expect(controller.getExport()).not.toBe('Independent output\n');
		controller.onSnapshot({ ...controller.snapshot, revision: 4, text: '' });
		controller.switchProfile('musixmatch');
		expect(controller.profile).toBe('genius');
	});
});

test('creation preference changes deliberately and is independent of opening legacy drafts', async () => {
	const initial = {
		...draft('draft-a', ''),
		writing: { schema: 1, phase: 'new', profile: 'genius' } as const
	};
	const legacy = draft('legacy');
	const { controller, repository } = setup({ initial, drafts: [initial, legacy] });
	controller.switchProfile('musixmatch');
	expect(controller.profile).toBe('musixmatch');
	expect(await repository.getPreference('newDraftProfile')).toBe('musixmatch');
	await controller.openDraft(legacy.id);
	expect(controller.profile).toBe('genius');
	expect(await repository.getPreference('newDraftProfile')).toBe('musixmatch');
	await controller.createDraft();
	expect(controller.profile).toBe('musixmatch');
	expect(controller.writing.phase).toBe('new');
});

test('saved Musixmatch ownership and edited Genius output survive loading a Genius-ancestry model', async () => {
	const model = importDocument({
		text: '[Verse]\nA [silver compass](123456) (Whatever)',
		profile: 'genius',
		language: 'en'
	});
	if (!model.ok) throw new Error(model.refusal.message);
	const conversion = createConversionEnvelope(model.value, 'musixmatch', profilePolicyVersions);
	const initial = {
		...draft('draft-a', conversion.projectionText),
		conversion,
		writing: {
			schema: 1,
			phase: 'writing',
			profile: 'musixmatch',
			export: { profile: 'genius', text: 'Edited independent Genius output' }
		} as const
	};
	const { controller } = setup({ initial });
	expect(controller.profile).toBe('musixmatch');
	expect(controller.getExport()).toBe('Edited independent Genius output');
	controller.onSnapshot({ ...controller.snapshot, revision: 1, selection: { anchor: 2, head: 2 } });
	expect(controller.getExport()).toBe('Edited independent Genius output');
	const changed = createConversionEnvelope(
		{ ...model.value, defaultLanguage: 'fr' },
		'musixmatch',
		profilePolicyVersions
	);
	controller.onSnapshot({
		...controller.snapshot,
		revision: 2,
		text: changed.projectionText,
		conversion: changed
	});
	expect(controller.getExport()).not.toBe('Edited independent Genius output');
});

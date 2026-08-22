import { copySectionLinks } from '$lib/persistence/copy.js';
import { parseDocument } from '$lib/core/parser.js';
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
} from '$lib/core/types.js';
import { describe, expect, test, vi } from 'vitest';
import { createAutosaveController } from '$lib/persistence/autosave.js';
import {
	createContractIgnoreStore,
	createInMemoryDraftRepository,
	createInMemoryMediaRepository,
	createMemorySessionStorage
} from './in-memory.js';
import type { MediaRepository } from '$lib/persistence/media-repository.js';
import { createFeedbackState, NOTICE_TOAST_DURATION } from './feedback.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { sampleDraftText } from '../sample-draft.js';
import { createWorkbenchController } from './workbench.svelte.js';
import { buildRuleContext, computeDiagnostics } from './wiring.js';

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
		// fields it kept would hide exactly the bug this file exists to catch —
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
	 * The page builds the controller with a *headless* handle — no document, no
	 * anchors — and only later does CodeMirror mount and publish a real one. The
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
	// the same record — so a copier that keeps the lines and drops them loses the
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

	// Every editor remount starts blank — a keyed rebuild, or HMR in dev — and a
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
	 * revision guard and a stub has none — driven by one, this test agreed with
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
	 * `Untitled transcription` is the whole of the condition. A title the user typed — or
	 * one an earlier source already supplied — is a decision, and a later
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
	 * left alone rather than guessed at — an `Untitled transcription` the user renames
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
	// draft was never persisted, and the next load invented a new id — so the
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

	test('drops the record of a draft the user empties out', async () => {
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

		await vi.waitFor(async () => expect(await repository.get(first.id)).toBeUndefined());
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
			message: 'Inline style has no performer in the section legend.'
		};

		controller.assignDiagnosticPerformers(mismatch);

		expect(editor.requestPerformerLegendAssignment).toHaveBeenCalledWith(mismatch);
		expect(controller.activeTab).toBe('linter');
	});

	// The panel's way into linking. The card carries the finding but not the
	// group, so it selects the diagnostic's range — the header — and asks the
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

	test('hands the editor to the diagnostic the panel leads with after a fix', () => {
		// Applying a fix empties the card the user was reading, so the panel leads
		// with another one — and the editor's active-line wash, which is all that
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
		// Later in the document but worse, so it leads the panel — the same order
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

	test('forgets ignored diagnostics once the settled lint result no longer contains them', () => {
		const text = '[Verse]\nfirst line';
		const record = draft('draft-a', text);
		const { controller } = setup({ initial: record });
		const finding: Diagnostic = { ...diagnostic, from: 8, to: 13 };
		controller.onSnapshot({ ...snapshot(record, 1, text), diagnostics: [finding] });
		controller.ignoreDiagnostic(finding);

		controller.onSnapshot(snapshot(record, 2, text), [finding]);
		expect(controller.ignoredDiagnosticCount).toBe(1);

		const fixed = snapshot(record, 3, '[Verse]\nFirst line');
		controller.onSnapshot(fixed, null);
		expect(controller.ignoredDiagnosticCount).toBe(1);

		controller.onSnapshot(fixed, []);
		expect(controller.ignoredDiagnosticCount).toBe(0);

		controller.onSnapshot({ ...snapshot(record, 4, text), diagnostics: [finding] });
		expect(controller.visibleDiagnostics).toEqual([finding]);
	});

	/**
	 * The panel used to mirror the store's list and re-read it only on a draft
	 * *change*, which misses the other way the store empties: `clearDraft`, run
	 * from the draft store when an emptied 'scribe is discarded or one is
	 * deleted. Discarding and undoing never changes which draft is open, so the
	 * panel went on hiding findings whose ignores no longer existed anywhere —
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
		// republishes — exactly the shape of a discard the user undoes.
		controller.onSnapshot({ ...snapshot(record, 2, text), diagnostics: [finding] });
		expect(controller.ignoredDiagnosticKeys).toEqual([]);
		expect(controller.visibleDiagnostics).toEqual([finding]);
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
		controller.onSnapshot({ ...next, diagnostics }, diagnostics);
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
			message: 'Inline style has no performer in the section legend.',
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
		editor.dispatchAtomic = (edit) => {
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

	// The mirror already runs the other way — editing a name inside one header
	// rewrites the others and the roster adopts it — so a roster rename that
	// stopped at the record left the legend reading the old name, which is the
	// one job a roster rename exists for.
	test('renaming a performer in the roster rewrites every header that names them', () => {
		const record = draft('draft-a', text);
		const { controller, editor } = setup({ initial: record });
		const dispatched: Parameters<EditorHandle['dispatchAtomic']>[0][] = [];
		editor.dispatchAtomic = (edit) => {
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
		// does not import a duplicate performer — and the color is re-derived,
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

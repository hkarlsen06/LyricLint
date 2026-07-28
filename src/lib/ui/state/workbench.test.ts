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
import {
	createContractSessionIgnoreStore,
	createInMemoryDraftRepository,
	createInMemoryMediaRepository,
	createMemorySessionStorage
} from './in-memory.js';
import type { MediaRepository } from '$lib/persistence/media-repository.js';
import { createFeedbackState } from './feedback.svelte.js';
import { createMediaPlayer } from './media-player.svelte.js';
import { StubAudio } from './media-test-audio.js';
import { sampleDraftText } from '../sample-draft.js';
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
	readClipboard?: () => Promise<string>;
	/**
	 * Build the controller on a handle that cannot hold anchors, the way the page
	 * does: it boots on a headless placeholder and CodeMirror publishes later.
	 */
	headless?: boolean;
	mediaRepository?: MediaRepository;
	/** The stacked, touch-driven layout, which folds the cover band by default. */
	phoneLayout?: boolean;
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
	const controller = createWorkbenchController({
		editor: options.headless ? headless : editor,
		initialSnapshot: currentSnapshot,
		initialDraft: initial,
		initialRecentLanguages: options.initialRecentLanguages,
		repository,
		autosave,
		ignoreStore: createContractSessionIgnoreStore(createMemorySessionStorage()),
		idFactory: vi.fn(() => `generated-${Math.random().toString(36).slice(2)}`),
		now: () => '2026-07-20T11:00:00.000Z',
		readClipboard:
			options.readClipboard ??
			(() => Promise.reject(new Error('Clipboard reads are unavailable.'))),
		onOpenDraft,
		exportText: options.exportText,
		phoneLayout: () => options.phoneLayout === true,
		...(options.mediaRepository
			? {
					mediaRepository: options.mediaRepository,
					// A real player would reach for `new Audio()`, which node has not
					// got; what is under test here is the draft record, not decoding.
					mediaPlayer: createMediaPlayer({
						feedback: createFeedbackState(),
						createAudio: () => new StubAudio().asMediaElement(),
						createObjectUrl: () => 'blob:test',
						revokeObjectUrl: () => {}
					})
				}
			: {})
	});
	return { controller, repository, autosave, editor, headless };
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

	/**
	 * The fold outlives the band that draws it.
	 *
	 * It is destroyed whenever the attached source changes, so a flag held in the
	 * component would forget on every swapped song — and a reload would start over.
	 * It goes in the same `appMetadata` table as the current draft, which is what
	 * puts it inside the workspace backup and inside `Delete all local data`.
	 */
	/**
	 * The phone gets the compact row instead, and only until the user says
	 * otherwise.
	 *
	 * There the panel is stacked *under* the editor rather than beside it, so an
	 * open cover is a square of picture sitting between the document and the
	 * findings — the two things a transcriber moves between — on the screen with
	 * the least room to give it.
	 */
	test('folds the cover by default on a phone, and opens it everywhere else', () => {
		expect(setup({ phoneLayout: true }).controller.artworkOpen).toBe(false);
		expect(setup({}).controller.artworkOpen).toBe(true);
	});

	// A default decides what to do before the user has said anything, never
	// instead of what they said.
	test('lets a stored preference outrank the phone default', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		await repository.setPreference('artworkOpen', 'true');

		const { controller } = setup({ initial: first, repository, phoneLayout: true });

		await vi.waitFor(() => expect(controller.artworkOpen).toBe(true));
	});

	test('remembers whether the cover was folded, across a reload', async () => {
		const first = draft('draft-a');
		const repository = createInMemoryDraftRepository([first]);
		const { controller } = setup({ initial: first, repository });

		expect(controller.artworkOpen).toBe(true);
		controller.setArtworkOpen(false);
		expect(controller.artworkOpen).toBe(false);
		await vi.waitFor(async () =>
			expect(await repository.getPreference('artworkOpen')).toBe('false')
		);

		// A reload is a fresh controller over the same storage.
		const next = setup({ initial: first, repository });
		await vi.waitFor(() => expect(next.controller.artworkOpen).toBe(false));
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
		controller.setActiveTab('tools');

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

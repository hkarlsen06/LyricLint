import { parseDocument } from '$lib/core/parser.js';
import type {
	AtomicDocumentEdit,
	Diagnostic,
	DraftRecord,
	EditorHandle,
	EditorSnapshot,
	LineAnchor,
	PerformerRecord,
	SectionLink,
	SerializedSelection,
	SourceReference,
	TextRange
} from '$lib/core/types.js';
import type { MediaRepository } from '$lib/persistence/media-repository.js';
import type { WorkspaceBackupController } from '$lib/persistence/backup.js';
import { createFeedbackState } from './state/feedback.svelte.js';
import type { MediaPlayer } from './state/media-player.svelte.js';
import {
	createContractSessionIgnoreStore,
	createInMemoryAutosaveController,
	createInMemoryDraftRepository,
	createMemorySessionStorage
} from './state/in-memory.js';
import { createWorkbenchController } from './state/workbench.svelte.js';

export interface EditorCallLog {
	focusCount: number;
	revealed: TextRange[];
	selections: SerializedSelection[];
	navigation: Array<'selection' | 'reveal'>;
	dispatched: AtomicDocumentEdit[];
	undoCount: number;
	redoCount: number;
	sectionHeaderRequestCount: number;
	searchOpenCount: number;
	lineAnchors: LineAnchor[];
	/** Every playhead push, so a test can assert the document did not follow it. */
	playheads: (number | undefined)[];
}

const testSource: SourceReference = {
	id: 'G-SECTIONS',
	url: 'https://genius.com/9250687',
	annotationId: 9250687,
	pageTitle: 'How to Format Lyrics',
	sectionTitle: 'Vocalist formatting',
	retrievedAt: '2026-07-20',
	lastVerifiedAt: '2026-07-20',
	reviewStatus: 'reviewed'
};

export function diagnostic(
	overrides: Partial<Diagnostic> & Pick<Diagnostic, 'ruleId' | 'severity' | 'message'>
): Diagnostic {
	return {
		from: 0,
		to: 4,
		explanation: 'This finding is backed by the reviewed lyric formatting source.',
		sourceIds: ['G-SECTIONS'],
		...overrides
	};
}

export function performer(
	id: string,
	displayName: string,
	order: number,
	colorId = 'plum'
): PerformerRecord {
	return {
		id,
		displayName,
		normalizedKey: displayName.trim().toLocaleLowerCase(),
		aliases: [],
		colorId,
		order
	};
}

export function createTestWorkbench(options?: {
	text?: string;
	diagnostics?: Diagnostic[];
	performers?: PerformerRecord[];
	/** Links the draft was saved with, for the re-seating a reload performs. */
	sectionLinks?: SectionLink[];
	drafts?: DraftRecord[];
	copyLog?: string[];
	/** What the system clipboard hands back, or a rejection to fall back from. */
	clipboardText?: string | (() => Promise<string>);
	exportLog?: Array<{ text: string; filename: string }>;
	selection?: SerializedSelection;
	revision?: number;
	recentLanguages?: readonly string[];
	/**
	 * Give this workbench audio. Off by default, because a controller with a media
	 * store is one more thing running behind every unrelated assertion — and
	 * because the player has to be a stub: the real one builds an `<audio>`
	 * element and can fetch Google's IFrame API.
	 */
	media?: { repository: MediaRepository; player: MediaPlayer };
	backup?: WorkspaceBackupController;
}) {
	const text = options?.text ?? '[Verse]\nLine';
	const selection = options?.selection ?? { anchor: 0, head: 4 };
	const initialDraft: DraftRecord = {
		id: 'draft-1',
		title: 'Test draft',
		text,
		language: 'en',
		performers: options?.performers ?? [],
		createdAt: '2026-07-20T10:00:00.000Z',
		updatedAt: '2026-07-20T10:00:00.000Z',
		ruleSetVersion: '2026.7',
		editorSelection: selection,
		...(options?.sectionLinks ? { sectionLinks: options.sectionLinks } : {})
	};
	let snapshot: EditorSnapshot = {
		revision: options?.revision ?? 4,
		text,
		selection,
		parsed: parseDocument(text),
		diagnostics: options?.diagnostics ?? [],
		composing: false,
		canUndo: true,
		canRedo: false
	};
	const calls: EditorCallLog = {
		focusCount: 0,
		revealed: [],
		selections: [],
		navigation: [],
		dispatched: [],
		undoCount: 0,
		redoCount: 0,
		sectionHeaderRequestCount: 0,
		searchOpenCount: 0,
		lineAnchors: [],
		playheads: []
	};
	const editor: EditorHandle = {
		focus() {
			calls.focusCount += 1;
		},
		getSnapshot() {
			return snapshot;
		},
		dispatchAtomic(edit) {
			calls.dispatched.push(edit);
		},
		undo() {
			calls.undoCount += 1;
		},
		redo() {
			calls.redoCount += 1;
		},
		revealRange(range) {
			calls.navigation.push('reveal');
			calls.revealed.push(range);
		},
		setSelection(selection) {
			calls.navigation.push('selection');
			calls.selections.push(selection);
			snapshot = { ...snapshot, selection };
		},
		requestSectionHeader() {
			calls.sectionHeaderRequestCount += 1;
		},
		toggleSearch() {
			calls.searchOpenCount += 1;
		},
		getLineAnchors() {
			return calls.lineAnchors.map((anchor) => ({ ...anchor }));
		},
		setLineAnchors(anchors) {
			calls.lineAnchors = anchors.map((anchor) => ({ ...anchor }));
		},
		setMediaPlayhead(time) {
			calls.playheads.push(time);
		}
	};
	const repository = createInMemoryDraftRepository(options?.drafts ?? [initialDraft]);
	const autosave = createInMemoryAutosaveController(repository);
	const ignoreStore = createContractSessionIgnoreStore(createMemorySessionStorage());
	const feedback = createFeedbackState();
	let nextId = 1;
	const controller = createWorkbenchController({
		editor,
		initialSnapshot: snapshot,
		initialDraft,
		initialRecentLanguages: options?.recentLanguages,
		repository,
		autosave,
		ignoreStore,
		feedback,
		...(options?.media
			? { mediaRepository: options.media.repository, mediaPlayer: options.media.player }
			: {}),
		...(options?.backup ? { backup: options.backup } : {}),
		sources: [testSource],
		ruleSet: {
			version: '2026.7',
			publishedAt: '2026-07-20',
			sourceIds: ['G-SECTIONS'],
			ruleIds: ['section.header-missing']
		},
		...(options?.copyLog
			? {
					copy: async (canonicalText: string) => {
						options.copyLog?.push(canonicalText);
					}
				}
			: {}),
		readClipboard: async () => {
			const source = options?.clipboardText;
			if (typeof source === 'function') return source();
			if (source === undefined) throw new Error('Clipboard reads are unavailable.');
			return source;
		},
		exportText: (canonicalText, filename) => {
			options?.exportLog?.push({ text: canonicalText, filename });
		},
		idFactory: () => `generated-${nextId++}`,
		now: () => `2026-07-20T10:00:0${nextId}.000Z`,
		onOpenDraft(draft) {
			snapshot = {
				revision: 0,
				text: draft.text,
				selection: draft.editorSelection ?? { anchor: 0, head: 0 },
				parsed: parseDocument(draft.text),
				diagnostics: [],
				composing: false,
				canUndo: false,
				canRedo: false
			};
			return snapshot;
		}
	});

	return { controller, repository, feedback, calls, editor, initialDraft };
}

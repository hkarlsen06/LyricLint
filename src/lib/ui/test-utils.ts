import { parseDocument } from '$lib/core/parser.js';
import type {
	AtomicDocumentEdit,
	Diagnostic,
	DraftRecord,
	EditorHandle,
	EditorSnapshot,
	PerformerRecord,
	SerializedSelection,
	SourceReference,
	TextRange
} from '$lib/core/types.js';
import { createFeedbackState } from './state/feedback.svelte.js';
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
	dispatched: AtomicDocumentEdit[];
	undoCount: number;
	redoCount: number;
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
	drafts?: DraftRecord[];
	copyLog?: string[];
	exportLog?: Array<{ text: string; filename: string }>;
}) {
	const text = options?.text ?? '[Verse]\nLine';
	const initialDraft: DraftRecord = {
		id: 'draft-1',
		title: 'Test draft',
		text,
		language: 'en',
		performers: options?.performers ?? [],
		createdAt: '2026-07-20T10:00:00.000Z',
		updatedAt: '2026-07-20T10:00:00.000Z',
		ruleSetVersion: '2026.7',
		editorSelection: { anchor: 0, head: 4 }
	};
	let snapshot: EditorSnapshot = {
		revision: 4,
		text,
		selection: { anchor: 0, head: 4 },
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
		dispatched: [],
		undoCount: 0,
		redoCount: 0
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
			calls.revealed.push(range);
		},
		setSelection(selection) {
			calls.selections.push(selection);
			snapshot = { ...snapshot, selection };
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
		repository,
		autosave,
		ignoreStore,
		feedback,
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
		exportText: (canonicalText, filename) => {
			options?.exportLog?.push({ text: canonicalText, filename });
		},
		idFactory: () => `generated-${nextId++}`,
		now: () => `2026-07-20T10:00:0${nextId}.000Z`,
		onOpenDraft(draft) {
			snapshot = {
				revision: snapshot.revision + 1,
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

import type { EditorHandle, EditorSnapshot } from '$lib/core/types.js';
import type { FeedbackState } from './feedback.svelte.js';

/** What an accepted editor snapshot changed relative to the one it replaced. */
export interface SnapshotChange {
	unchanged: boolean;
	textDelta: number;
}

export interface EditorSessionDependencies {
	editor: EditorHandle;
	initialSnapshot: EditorSnapshot;
	feedback: FeedbackState;
	copy: (text: string) => Promise<void>;
}

export interface EditorSession {
	readonly editor: EditorHandle;
	readonly snapshot: EditorSnapshot;
	setEditorHandle(handle: EditorHandle): void;
	/** Store a snapshot, or return undefined when it predates the last one seen. */
	adoptSnapshot(next: EditorSnapshot): SnapshotChange | undefined;
	/** Install a snapshot that came from opening a draft rather than from an edit. */
	replaceSnapshot(next: EditorSnapshot): void;
	resetRevisionGuard(): void;
	undo(): void;
	redo(): void;
	copyCanonical(): Promise<void>;
	insertSection(): void;
}

export function createEditorSession(deps: EditorSessionDependencies): EditorSession {
	let editor = $state(deps.editor);
	let snapshot = $state(deps.initialSnapshot);
	let lastEditorRevision: number | undefined;

	return {
		get editor() {
			return editor;
		},
		get snapshot() {
			return snapshot;
		},
		setEditorHandle(handle) {
			editor = handle;
		},
		adoptSnapshot(next) {
			if (lastEditorRevision !== undefined && next.revision < lastEditorRevision) return undefined;
			const textDelta = next.text.length - snapshot.text.length;
			// The editor emits once at mount so loaded drafts get linted. That
			// snapshot matches the persisted state byte for byte, so store it
			// (for its diagnostics) without dirtying the draft.
			const unchanged =
				next.text === snapshot.text &&
				next.selection.anchor === snapshot.selection.anchor &&
				next.selection.head === snapshot.selection.head;
			lastEditorRevision = next.revision;
			snapshot = next;
			return { unchanged, textDelta };
		},
		replaceSnapshot(next) {
			snapshot = next;
		},
		resetRevisionGuard() {
			lastEditorRevision = undefined;
		},
		undo() {
			editor.undo();
		},
		redo() {
			editor.redo();
		},
		async copyCanonical() {
			try {
				await deps.copy(snapshot.text);
				deps.feedback.announce('Canonical Genius markup copied.');
			} catch {
				deps.feedback.announce('Copy failed. Check browser clipboard permission and try again.');
			}
		},
		insertSection() {
			if (editor.requestSectionHeader) {
				editor.requestSectionHeader();
			} else {
				deps.feedback.announce('Place the cursor in a lyric section before inserting a header.');
			}
		}
	};
}

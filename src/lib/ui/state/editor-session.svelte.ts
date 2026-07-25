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
	readClipboard: () => Promise<string>;
	/**
	 * Called immediately before a whole-document replacement is dispatched, so
	 * the panel can arm its hand-off to the leading finding. It has to run before
	 * the dispatch, because the editor emits the re-linted snapshot from inside
	 * it — and it must not run on a paste that never reached the document.
	 */
	onBeforeReplace?: () => void;
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
	/** Replace the whole document in one undoable edit. */
	replaceDocument(text: string, announcement: string): void;
	/** Drop the clipboard into an empty document, or hand over to keyboard paste. */
	pasteLyrics(): Promise<void>;
	insertSection(): void;
}

export function createEditorSession(deps: EditorSessionDependencies): EditorSession {
	let editor = $state(deps.editor);
	let snapshot = $state(deps.initialSnapshot);
	let lastEditorRevision: number | undefined;

	// Declared out here rather than as a sibling method: the controller hands
	// these out as bare function references, so a `this.` call between them
	// would arrive unbound.
	function replaceDocument(text: string, announcement: string): void {
		const current = snapshot;
		deps.onBeforeReplace?.();
		editor.dispatchAtomic({
			baseRevision: current.revision,
			edits: [{ from: 0, to: current.text.length, insert: text }],
			// The top of the document, not the end of the insert. Whatever arrives
			// this way is a document the reader has not read yet, and the panel is
			// about to select its leading finding anyway; a caret parked on the last
			// line would put the wash below everything they are about to look at.
			selectionAfter: { anchor: 0, head: 0 }
		});
		deps.feedback.announce(announcement);
	}

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
		replaceDocument,
		async pasteLyrics() {
			let text: string;
			try {
				text = await deps.readClipboard();
			} catch {
				// Not a failure worth reporting as one: every browser that refuses a
				// programmatic read still pastes from the keyboard. Put the caret
				// where that keystroke lands instead of explaining a permission.
				editor.focus();
				deps.feedback.announce('Press the paste shortcut to paste into the editor.');
				return;
			}
			if (text.trim().length === 0) {
				editor.focus();
				deps.feedback.announce('The clipboard has no text to paste.');
				return;
			}
			// No `focus()` on this path, unlike the two above it. Those hand the
			// keyboard back because the user still has to do the pasting; this one
			// succeeded, so the panel is about to select the leading finding, and a
			// focused caret sitting on it would arm the next keystroke over text the
			// user never chose. The wash marks the place; the press that goes there
			// is theirs to make.
			replaceDocument(text, 'Lyrics pasted from the clipboard.');
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

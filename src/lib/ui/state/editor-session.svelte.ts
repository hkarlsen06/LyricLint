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
	/** Resolves true when the markup reached the clipboard. */
	copyCanonical(): Promise<boolean>;
	/** Replace the whole document in one undoable edit. */
	replaceDocument(text: string, announcement: string): void;
	/** Drop the clipboard into an empty document, or hand over to keyboard paste. */
	pasteLyrics(): Promise<void>;
	/** Replace the current selection with Genius's unknown-lyric marker. */
	insertUnknownMarker(): void;
	insertSection(): void;
	/** Whether find and replace is on screen, as the editor last reported it. */
	readonly searchOpen: boolean;
	toggleSearch(): void;
	/** The editor reporting that the find panel opened or closed. */
	noteSearchOpen(open: boolean): void;
}

export function createEditorSession(deps: EditorSessionDependencies): EditorSession {
	let editor = $state(deps.editor);
	// Reported by the editor rather than tracked here, because `Mod-F` is bound to
	// the window and `Escape` and the panel's own `✕` close it — three ways in and
	// out, only one of which is the tray's own press.
	let searchOpen = $state(false);
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

	/**
	 * Say something the user is owed an answer to, where they can see it.
	 *
	 * `announce` alone reaches the `sr-only` live region and nothing else, which
	 * is right for the running commentary on things that visibly happened — a
	 * draft opened, a marker inserted, a document replaced. It is wrong for the
	 * three refusals below, because each is the toolbar's one contrast action
	 * declining to do the thing it is labelled with, and two of them are an
	 * *instruction*: the press did not finish the job and the user has to. Left
	 * to the live region they were a pixel-identical screen — the caret moves
	 * into an empty editor whose active-line wash was already drawn, so a sighted
	 * user got no answer at all.
	 *
	 * `announce` beside `addToast` rather than the toast alone: the toast region
	 * is not a live region, so dropping the announcement would trade one
	 * audience for the other.
	 */
	function report(message: string): void {
		deps.feedback.announce(message);
		deps.feedback.addToast({ message });
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
				return true;
			} catch {
				report('Copy failed. Check browser clipboard permission and try again.');
				return false;
			}
		},
		replaceDocument,
		async pasteLyrics() {
			let text: string;
			try {
				text = await deps.readClipboard();
			} catch {
				// Still not a failure worth reporting as one: every browser that
				// refuses a programmatic read pastes from the keyboard, so the caret
				// goes where that keystroke lands rather than a permission being
				// explained. What changed is that the hand-off is *drawn*. Moving the
				// caret is the whole of what this path does on screen, and into an
				// empty document — whose active line is washed either way — that is a
				// blinking hairline nobody can be expected to read as an answer.
				editor.focus();
				report('Press the paste shortcut to paste into the editor.');
				return;
			}
			if (text.trim().length === 0) {
				editor.focus();
				report('The clipboard has no text to paste.');
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
		insertUnknownMarker() {
			const current = snapshot;
			const from = Math.min(current.selection.anchor, current.selection.head);
			const to = Math.max(current.selection.anchor, current.selection.head);
			const caret = from + '[?]'.length;
			editor.dispatchAtomic({
				baseRevision: current.revision,
				edits: [{ from, to, insert: '[?]' }],
				selectionAfter: { anchor: caret, head: caret }
			});
			editor.focus();
			deps.feedback.announce('Unknown lyric marker inserted.');
		},
		insertSection() {
			if (editor.requestSectionHeader) {
				editor.requestSectionHeader();
			} else {
				deps.feedback.announce('Place the cursor in a lyric section before inserting a header.');
			}
		},
		get searchOpen() {
			return searchOpen;
		},
		toggleSearch() {
			// Checked rather than optionally called, for the reason `setLineAnchors`
			// documents: the placeholder handle the page boots with implements none
			// of these, and `editor.toggleSearch?.()` cannot tell "opened" from
			// "silently discarded" — which on an aimed press reads as a dead button.
			if (editor.toggleSearch) {
				editor.toggleSearch();
			} else {
				deps.feedback.announce('Find and replace is not ready yet.');
			}
		},
		noteSearchOpen(open) {
			searchOpen = open;
		}
	};
}

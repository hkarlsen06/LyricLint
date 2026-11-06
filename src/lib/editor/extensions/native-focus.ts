import { EditorView } from '@codemirror/view';

/** Native keyboard entry needs the same synchronous selection handoff as editor commands. */
export function nativeEditorFocus() {
	let pointerEntry = false;
	return EditorView.domEventHandlers({
		pointerdown() {
			pointerEntry = true;
		},
		pointercancel() {
			pointerEntry = false;
		},
		blur() {
			pointerEntry = false;
		},
		focus(_event, view) {
			// Pointer entry owns a new placement; composition owns its native selection.
			if (!pointerEntry && !view.compositionStarted) view.focus();
			pointerEntry = false;
		}
	});
}

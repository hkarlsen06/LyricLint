import { layer, EditorView, RectangleMarker } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/*
 * The caret, drawn in a layer above the document's own fills.
 *
 * The native caret is painted in the editing host's layer, so a child element
 * with a background paints over it — and this editor's lines are covered in
 * deliberate fills: the performer tints on mixed-voice lines (whose highlight
 * carries z-index 1), the fix-preview surfaces, the active-line wash. On
 * exactly the lines a transcriber works most, the caret typed into the right
 * place and could not be seen.
 *
 * This is the cursor half of CodeMirror's drawSelection, taken without its
 * selection half. The refusal of drawSelection stands, for the reason recorded
 * in create-editor.ts — its selection layer sits behind every background and
 * vanished under them — but the cursor layer is the opposite arrangement:
 * `above: true`, painted over the content, with its own z-index above the
 * highlight's. Only the main cursor is drawn, because multiple selection
 * ranges are a feature this editor does not use, and the native caret is
 * turned transparent in the content theme so there are not two.
 */

const caretMarkers = layer({
	above: true,
	class: 'll-caret-layer',
	markers(view) {
		const main = view.state.selection.main;
		if (!main.empty) return [];
		return RectangleMarker.forRange(view, 'll-caret', main);
	},
	update(update, dom) {
		// A caret rests solid while it moves and blinks only once it has stopped,
		// so every selection change restarts the animation. Two identical
		// keyframe names are how a restart avoids a style recomputation — the
		// same trick drawSelection documents in its own source.
		if (update.transactions.some((tr) => tr.selection)) {
			dom.style.animationName =
				dom.style.animationName === 'll-caret-blink' ? 'll-caret-blink2' : 'll-caret-blink';
		}
		return update.docChanged || update.selectionSet || update.focusChanged;
	}
});

const caretTheme = EditorView.baseTheme({
	'.ll-caret-layer': {
		pointerEvents: 'none',
		// Above the document's own stacked fills; the performer highlight is the
		// one that names a z-index, and it names 1.
		zIndex: '2'
	},
	'&.cm-focused .ll-caret-layer': {
		animation: 'steps(1) ll-caret-blink 1.2s infinite'
	},
	'@keyframes ll-caret-blink': { '0%': {}, '50%': { opacity: '0' }, '100%': {} },
	'@keyframes ll-caret-blink2': { '0%': {}, '50%': { opacity: '0' }, '100%': {} },
	'.ll-caret': {
		display: 'none',
		borderLeft: '1.5px solid var(--color-accent)',
		marginLeft: '-0.75px',
		pointerEvents: 'none'
	},
	// Shown only while the editor holds focus, exactly as the native caret is.
	'&.cm-focused .ll-caret': {
		display: 'block'
	}
});

/** The drawn caret and its theme. */
export function caretLayer(): Extension {
	return [caretMarkers, caretTheme];
}

import { StateField } from '@codemirror/state';
import type { EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet, Rect } from '@codemirror/view';
import type { LanguagePack } from '$lib/core/types.js';
import { editorContextField, setEditorContextEffect } from './editor-state.js';

/*
 * What an empty document says for itself.
 *
 * The editor opened as a black field with a caret in it and nothing anywhere
 * naming what belonged there. This is the ghost of a correct transcription
 * standing in that space: two section headers around a line of guidance, so the
 * shape of the document — bracketed headers, a blank line between sections — is
 * legible before the first keystroke rather than after the first diagnostic.
 *
 * The headers are the selected language's own terms, because a header is
 * document content and the language picker is what decides it: under Norwegian
 * the ghost reads `[Vers 1]`, not a shape the linter would then complain about.
 * The line between them is the one piece of chrome here and stays English, as
 * the status bar does — it is the application talking, not the document.
 *
 * The whole thing is `aria-hidden`. A screen reader cannot see a ghost, and
 * announcing four fragments of it as though they were text would be worse than
 * saying nothing; the guidance reaches the accessible tree through the content
 * element's `aria-placeholder` instead, which is what a textbox has the
 * attribute for.
 */

/** The English guidance line, also the accessible placeholder for the editor. */
export const placeholderGuidance = 'Paste or type your lyrics here';

function headerTerm(
	pack: LanguagePack | undefined,
	semanticPart: string,
	fallback: string
): string {
	const term = pack?.headers.find((entry) => entry.semanticPart === semanticPart)?.terms[0];
	return term ?? fallback;
}

/** The ghost transcription's lines, top to bottom, for one language pack. */
export function placeholderLines(pack: LanguagePack | undefined): readonly string[] {
	return [
		`[${headerTerm(pack, 'Verse', 'Verse')} 1]`,
		placeholderGuidance,
		'',
		`[${headerTerm(pack, 'Chorus', 'Chorus')}]`
	];
}

class DocumentPlaceholderWidget extends WidgetType {
	constructor(readonly lines: readonly string[]) {
		super();
	}

	eq(other: DocumentPlaceholderWidget): boolean {
		return other.lines.join('\n') === this.lines.join('\n');
	}

	toDOM(): HTMLElement {
		const wrap = document.createElement('span');
		wrap.className = 'll-placeholder';
		wrap.setAttribute('aria-hidden', 'true');
		// The press that lands on the ghost is a press on the empty line under it,
		// which is where the caret has to end up.
		wrap.style.pointerEvents = 'none';
		for (const line of this.lines) {
			const row = document.createElement('span');
			row.className = 'll-placeholder-line';
			// The blank between the two sections still has to occupy a row, and an
			// empty span collapses. Written as an escape rather than a literal
			// space: this DOM lives inside `contenteditable`, where the browser
			// normalizes a lone space to a non-breaking one regardless, and a
			// character nobody can see in the source is worth naming.
			row.textContent = line === '' ? '\u00a0' : line;
			wrap.append(row);
		}
		return wrap;
	}

	// A caret beside the ghost stands at the ghost's first row, one row tall.
	// Taking the widget out of flow (see the theme below) keeps the *native*
	// caret a single row, because the browser sizes that caret to the line box —
	// but anything that asks CodeMirror where position 0 is (`coordsAtPos`, and
	// through it the drawn caret layer) falls back to this widget's own client
	// rect, which is still four rows tall however it is positioned. So the
	// widget answers the measurement itself, with the start of its first row.
	coordsAt(dom: HTMLElement): Rect | null {
		const firstRow = dom.firstElementChild;
		if (!firstRow) return null;
		const rect = firstRow.getBoundingClientRect();
		return { left: rect.left, right: rect.left, top: rect.top, bottom: rect.bottom };
	}
}

function build(state: EditorState): DecorationSet {
	if (state.doc.length > 0) return Decoration.none;
	const lines = placeholderLines(state.field(editorContextField)?.languagePack);
	return Decoration.set([
		// Inline at offset 0, as CodeMirror's own placeholder is, so the ghost
		// starts on the line the caret is already sitting on rather than above or
		// below it. `inline-block` is what then lets its rows stack.
		Decoration.widget({ widget: new DocumentPlaceholderWidget(lines), side: 1 }).range(0)
	]);
}

export const documentPlaceholderField = StateField.define<DecorationSet>({
	create: (state) => build(state),
	update(value, transaction) {
		const contextChanged = transaction.effects.some((effect) => effect.is(setEditorContextEffect));
		if (!transaction.docChanged && !contextChanged) return value;
		return build(transaction.state);
	},
	provide: (field) => EditorView.decorations.from(field)
});

/*
 * Muted rather than faded: a ghost at reduced opacity would sit on whatever the
 * editor's background happens to be and lose contrast unpredictably, and this
 * codebase does not carry states in `opacity` anywhere else either.
 *
 * And out of flow: the browser draws the native caret at the height of the line
 * box it stands in, so an inline-block ghost four rows tall gave the empty
 * document a caret four rows tall — a blue bar taller than the text it sat
 * beside, which is the one thing on an empty screen that must not shout. Taken
 * out of flow the ghost keeps its static position (it still starts exactly
 * where the caret is) while line 1's box stays a single row, and the caret with
 * it. The line is the containing block so the ghost scrolls and clips with the
 * document rather than floating over the editor.
 *
 * That only covers the native caret. The drawn caret layer measures through
 * `coordsAtPos`, which falls back to the widget's own client rect and brought
 * the four-row caret back; the widget's `coordsAt` above is the same rule for
 * that path.
 */
export const documentPlaceholderTheme = EditorView.baseTheme({
	'.cm-line:has(.ll-placeholder)': {
		position: 'relative'
	},
	'.ll-placeholder': {
		position: 'absolute',
		color: 'var(--color-text-disabled)'
	},
	'.ll-placeholder-line': {
		display: 'block',
		whiteSpace: 'pre'
	}
});

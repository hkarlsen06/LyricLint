import { EditorView, highlightSpecialChars, highlightTrailingWhitespace } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { invisibleCharacterAt, invisibleCharacterPattern } from '$lib/core/invisible-characters.js';

/*
 * `text.invisible-characters` reports characters the reader cannot see, and a
 * diagnostic whose underline sits under nothing reads as a bug in the linter
 * rather than a fact about the document. These decorations are what the rule
 * points at.
 *
 * The character set comes from `core` rather than being restated here, so the
 * mark and the rule cannot drift apart.
 */

/**
 * The glyph standing in for a character with no visible form of its own.
 *
 * This replaces the editor's previously unconfigured `highlightSpecialChars`,
 * so it is also asked to draw the control characters that extension handles by
 * default. Those keep CodeMirror's own placeholder — only the characters in the
 * shared table get the lyric-specific treatment.
 */
function renderInvisible(
	code: number,
	description: string | null,
	placeholder: string
): HTMLElement {
	const element = document.createElement('span');
	const invisible = invisibleCharacterAt(code);

	if (!invisible) {
		element.className = 'cm-specialChar';
		element.textContent = placeholder;
		if (description) {
			element.title = description;
			element.setAttribute('aria-label', description);
		}
		return element;
	}

	element.className = 'll-invisible';
	// A space-like character keeps a space-like glyph; a truly zero-width one
	// gets a bar, because a dot would read as punctuation the lyric does not have.
	element.textContent = invisible.replacement === '' ? '|' : '·';
	// The name is the accessible content: the visible glyph is a stand-in, and a
	// screen reader announcing "middle dot" would describe the decoration rather
	// than the character actually in the document.
	element.setAttribute('aria-label', invisible.description);
	element.title = invisible.description;
	return element;
}

export const invisibleMarks: Extension = [
	highlightSpecialChars({
		addSpecialChars: invisibleCharacterPattern(),
		render: renderInvisible
	}),
	highlightTrailingWhitespace()
];

/*
 * Both marks are drawn in the muted text color rather than at reduced opacity:
 * these sit inside lyric text that may already carry a performer tint or a
 * fix-preview background, and an opacity would dim those along with the glyph.
 */
export const invisibleMarksTheme = EditorView.baseTheme({
	'.ll-invisible': {
		color: 'var(--color-text-muted)',
		border: 'var(--border-width) solid var(--color-border)',
		borderRadius: 'var(--radius-xs)'
	},
	'.cm-trailingSpace': {
		backgroundColor: 'var(--color-fill-subtle)'
	}
});

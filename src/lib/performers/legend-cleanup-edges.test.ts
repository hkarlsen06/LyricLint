import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { TextEdit } from '$lib/core/types.js';
import { editorComposingField, editorContextField } from '$lib/editor/extensions/editor-state.js';
import { legendCleanupFilter } from '$lib/editor/extensions/legend-cleanup.js';
import { cleanupLegendSlots, usedStyleSlots } from './legend-cleanup.js';

// Edges of keeping a header legend in step with its section's styling: when the
// editor prunes, what a removal leaves behind, and what counts as sung text.

function applyEdits(text: string, edits: readonly TextEdit[]): string {
	let result = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
	}
	return result;
}

function cleaned(text: string): string {
	return applyEdits(text, cleanupLegendSlots(parseDocument(text)));
}

function editorState(doc: string): EditorState {
	return EditorState.create({
		doc,
		extensions: [history(), editorContextField, editorComposingField, legendCleanupFilter()]
	});
}

/** Type `text` one character at a time at `at`, as a user would. */
function typeAt(state: EditorState, at: number, text: string): EditorState {
	let current = state;
	for (const [index, character] of [...text].entries()) {
		current = current.update({
			changes: { from: at + index, insert: character },
			userEvent: 'input.type'
		}).state;
	}
	return current;
}

describe('legendCleanupFilter prunes only what the edit made unused', () => {
	// Cleanup used to run over the whole document on every change, so the
	// empty-body protection lasted one keystroke and any edit anywhere pruned
	// every unused slot. A group now drops only when this edit stopped its use.

	it('keeps a just-typed legend group when the user starts the first lyric line', () => {
		// A legend typed ahead of its lyrics survives the first lyric keystroke.
		const doc = '[Verse 1: Avery, <i>Blair</i>]\n';
		const next = typeAt(editorState(doc), doc.length, 'H');
		expect(next.doc.toString()).toBe('[Verse 1: Avery, <i>Blair</i>]\nH');
	});

	it('keeps a legend group the user finishes typing into an existing header', () => {
		// The closing `>` completes the group; it must not delete it too.
		const doc = '[Verse: Avery]\nAvery sings here';
		const at = doc.indexOf(']');
		const next = typeAt(editorState(doc), at, ', <i>Blair</i>');
		expect(next.doc.toString()).toBe('[Verse: Avery, <i>Blair</i>]\nAvery sings here');
	});

	it('does not rewrite the legend of a section the transaction never touched', () => {
		// The verse's unused slot is `performer.unused-legend-slot`'s suggestion
		// to offer, not something an unrelated keystroke applies off-screen.
		const doc = '[Verse: Avery, <i>Blair</i>]\nAvery line\n\n[Chorus: Avery]\nhello';
		const next = typeAt(editorState(doc), doc.length, '!');
		expect(next.doc.toString()).toBe(`${doc}!`);
	});

	it('still drops the group when the edit removes the last styled span (and undo restores it)', () => {
		// This edit did make the italic slot unused, so it still prunes.
		const doc = '[Verse: Avery, <i>Blair</i>]\nAvery line\n<i>Blair line</i>';
		const lineFrom = doc.lastIndexOf('\n');
		const state = editorState(doc);
		const next = state.update({
			changes: { from: lineFrom, to: doc.length },
			userEvent: 'delete'
		}).state;
		expect(next.doc.toString()).toBe('[Verse: Avery]\nAvery line');
		let restored = next;
		undo({ state: next, dispatch: (tr) => (restored = tr.state) });
		expect(restored.doc.toString()).toBe(doc);
	});
});

describe('removing a whole legend leaves the bare header', () => {
	// `legendRemovalRange` removes from the end of the name part, never from a
	// colon searched for backwards from the legend.

	it('removes the space before a French-style colon', () => {
		expect(cleaned('[Couplet 1 : <i>B</i>]\nune ligne')).toBe('[Couplet 1]\nune ligne');
	});

	it('removes the header colon, not a colon that starts the legend', () => {
		expect(cleaned('[Verse: :A, <i>B</i>]\n<b>x</b>')).toBe('[Verse]\n<b>x</b>');
	});
});

describe('separators after a drop follow joinLegendGroups', () => {
	// Commas with `&` before the last solo group, and commas alone once any
	// group is a unison group (docs/performer-tagging.md).

	it('uses the serial ampersand when the last group is dropped', () => {
		expect(cleaned('[Verse: A, <i>B</i> & <b>C</b>]\nA sings\n<i>B sings</i>')).toBe(
			'[Verse: A & <i>B</i>]\nA sings\n<i>B sings</i>'
		);
	});

	it('does not put a solo voice beside a unison group with an ampersand', () => {
		// `ben & <b>ben & leif</b>` would read as three voices.
		expect(cleaned('[Verse: ben, <i>leif</i> & <b>ben & leif</b>]\nben\n<b>both</b>')).toBe(
			'[Verse: ben, <b>ben & leif</b>]\nben\n<b>both</b>'
		);
	});
});

describe('usedStyleSlots counts only sung text as a plain voice', () => {
	// Consumers: cleanupLegendSlots, resolveLegendAssignment, performer.style-order.

	it('does not treat the parentheses around a styled ad-lib as plain lyrics', () => {
		// Genius keeps parentheses outside the formatting: `(<i>yeah</i>)` is the
		// canonical ad-lib, and its brackets are nobody's voice.
		const text = '[Verse: Avery, <i>Blair</i>]\n(<i>Blair ad-lib</i>)';
		expect([...usedStyleSlots(parseDocument(text).sections[0]!)]).toEqual([2]);
		expect(cleaned(text)).toBe('[Verse: <i>Blair</i>]\n(<i>Blair ad-lib</i>)');
	});

	it('does not treat annotation link syntax around a styled line as plain lyrics', () => {
		// `[<i>x</i>](123)` and `<i>[x](123)</i>` are the same sung text.
		const outside = '[Verse: Avery, <i>Blair</i>]\n[<i>Blair line</i>](123)';
		const inside = '[Verse: Avery, <i>Blair</i>]\n<i>[Blair line](123)</i>';
		expect(cleaned(inside)).toBe('[Verse: <i>Blair</i>]\n<i>[Blair line](123)</i>');
		expect(cleaned(outside)).toBe('[Verse: <i>Blair</i>]\n[<i>Blair line</i>](123)');
	});
});

describe('other edges', () => {
	it('handles CRLF bodies and empty or trailing legend groups as a fixpoint', () => {
		const crlf = '[Verse: Avery, <i>Blair</i> & <b>Cory</b>]\r\nAvery line\r\n<i>Blair</i>\r\n';
		expect(cleaned(crlf)).toBe('[Verse: Avery & <i>Blair</i>]\r\nAvery line\r\n<i>Blair</i>\r\n');
		const empties = '[Verse: Avery,, <i>Blair</i>, <b>Cory</b>,]\nAvery line\n<b>c</b>';
		const once = cleaned(empties);
		expect(once).toBe('[Verse: Avery & <b>Cory</b>]\nAvery line\n<b>c</b>');
		expect(cleanupLegendSlots(parseDocument(once))).toEqual([]);
	});
});

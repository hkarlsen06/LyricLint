import { expect, test } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CONVERSION_LIMITS } from '#lib/conversion/model.js';
import { parseDocument } from '#lib/core/parser.js';
import {
	conversionState,
	importEditorState,
	profileForState
} from './extensions/conversion-state.js';
import { editorContextField, parsedDocumentForState } from './extensions/editor-state.js';

function musixmatchState(text: string): EditorState {
	return EditorState.create({
		doc: text,
		extensions: [
			editorContextField.init(() => ({
				profile: 'musixmatch',
				language: 'en',
				performers: [],
				ruleSetVersion: 'test',
				// A stale Genius parse must not override the explicit source profile.
				parsed: parseDocument(text)
			})),
			conversionState()
		]
	});
}

test('a plain Musixmatch editor keeps bracket, annotation and style text literal while typing', () => {
	const source = '[Verse]\n[moon](123) <b>literal</b>';
	let state = musixmatchState(source);
	expect(profileForState(state)).toBe('musixmatch');
	for (let edit = 0; edit < 2; edit++) {
		const parsed = parsedDocumentForState(state);
		expect(parsed.profile).toBe('musixmatch');
		expect(parsed.annotations).toEqual([]);
		expect(parsed.syntaxIssues).toEqual([]);
		expect(parsed.sections[0]?.header).toBeUndefined();
		expect(
			parsed.sections.flatMap((section) => section.lines.map((line) => line.styleSpans))
		).toEqual([[], []]);
		state = state.update({ changes: { from: state.doc.length, insert: '!' } }).state;
	}
	expect(state.doc.toString()).toBe(source + '!!');
});

test('a plain Musixmatch editor imports later retained commands as Musixmatch after shortening', () => {
	let state = musixmatchState('x'.repeat(CONVERSION_LIMITS.text + 1));
	const refused = importEditorState(state);
	expect(refused.ok).toBe(false);
	const source = '[Verse]\n[moon](123) <b>literal</b>';
	state = state.update({ changes: { from: 0, to: state.doc.length, insert: source } }).state;
	const imported = importEditorState(state);
	if (!imported.ok) throw new Error(imported.refusal.message);
	expect(imported.value.envelope.profile).toBe('musixmatch');
	expect(imported.value.envelope.projectionText).toBe(source);
	expect(imported.value.envelope.model.content).toBe(source);
	expect(imported.value.envelope.model.wrappers).toEqual([]);
	expect(imported.value.projection.profile).toBe('musixmatch');
});

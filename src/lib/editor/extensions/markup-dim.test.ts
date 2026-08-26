import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import { markupDimField } from './markup-dim.js';
import { setHeaderlessSectionsEffect } from './section-ghosts.js';

function dimmedRanges(text: string): { from: number; to: number; slice: string }[] {
	const state = EditorState.create({ doc: text, extensions: [markupDimField] });
	const settled = state.update({
		effects: setHeaderlessSectionsEffect.of({ parsed: parseDocument(text), diagnostics: [] })
	}).state;
	const ranges: { from: number; to: number; slice: string }[] = [];
	settled.field(markupDimField).between(0, text.length, (from, to) => {
		ranges.push({ from, to, slice: text.slice(from, to) });
	});
	return ranges;
}

describe('markup dim', () => {
	it('dims an annotation wrapper and leaves the fragment as lyric text', () => {
		// The whole span is preserved, editable text — an annotation stripped
		// from a transcription destroys it on Genius — so the delimiters recede
		// instead of hiding: the `[` and the `](id)` take the muted markup face,
		// and the sung words between them keep the lyric one.
		const text = '[Intro]\n[Patrick](35524236) har ikke';
		const ranges = dimmedRanges(text);
		const opening = text.indexOf('[Patrick');

		expect(ranges).toContainEqual({ from: opening, to: opening + 1, slice: '[' });
		expect(ranges.map((range) => range.slice)).toContain('](35524236)');
		expect(ranges.map((range) => range.slice).join('')).not.toContain('Patrick');
	});

	it('dims both delimiters of a fragment that crosses a line break', () => {
		const text = '[Intro]\n[Det er for mange\nOg ærlig](35524264)\nPennen';
		const slices = dimmedRanges(text).map((range) => range.slice);

		expect(slices).toContain('](35524264)');
		expect(slices.join('')).not.toContain('Det er for mange');
	});
});

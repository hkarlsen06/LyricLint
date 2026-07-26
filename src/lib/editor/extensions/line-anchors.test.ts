import { EditorState } from '@codemirror/state';
import { describe, expect, it } from 'vitest';
import {
	anchorLineEffect,
	anchorTimeAt,
	clearLineAnchorEffect,
	hasAnchorAt,
	lineAnchorField,
	lineAnchorsFor,
	setLineAnchorsEffect,
	setPlayheadEffect
} from './line-anchors.js';
import type { LineAnchor } from './line-anchors.js';

const document = ['[Verse 1]', 'first line', 'second line', 'third line'].join('\n');

function stateWith(anchors: readonly LineAnchor[] = [], doc = document): EditorState {
	const state = EditorState.create({ doc, extensions: [lineAnchorField] });
	if (anchors.length === 0) return state;
	return state.update({ effects: setLineAnchorsEffect.of(anchors) }).state;
}

function lineStart(state: EditorState, line: number): number {
	return state.doc.line(line).from;
}

describe('line anchors', () => {
	it('round-trips anchors as line numbers', () => {
		const state = stateWith([
			{ line: 2, time: 12.5 },
			{ line: 4, time: 30 }
		]);

		expect(lineAnchorsFor(state)).toEqual([
			{ line: 2, time: 12.5 },
			{ line: 4, time: 30 }
		]);
	});

	it('discards anchors for lines the document does not have', () => {
		const state = stateWith([
			{ line: 2, time: 12.5 },
			{ line: 99, time: 30 },
			{ line: 0, time: 5 },
			{ line: 3, time: Number.NaN }
		]);

		expect(lineAnchorsFor(state)).toEqual([{ line: 2, time: 12.5 }]);
	});

	// The reason anchors are a mapped RangeSet rather than an array of line
	// numbers: typing anywhere earlier in the document renumbers everything after
	// it, and an anchor that did not move would start describing another line.
	it('keeps an anchor on its own line when text is inserted above it', () => {
		const state = stateWith([{ line: 3, time: 42 }]);

		const edited = state.update({
			changes: { from: lineStart(state, 2), insert: 'inserted line\n' }
		}).state;

		expect(lineAnchorsFor(edited)).toEqual([{ line: 4, time: 42 }]);
		expect(anchorTimeAt(edited, lineStart(edited, 4))).toBe(42);
	});

	it('keeps an anchor through an edit inside its own line', () => {
		const state = stateWith([{ line: 2, time: 42 }]);

		const edited = state.update({
			changes: { from: lineStart(state, 2) + 5, insert: ' more' }
		}).state;

		expect(lineAnchorsFor(edited)).toEqual([{ line: 2, time: 42 }]);
	});

	it('drops an anchor when its line is deleted', () => {
		const state = stateWith([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);
		const secondLine = state.doc.line(2);

		const edited = state.update({
			changes: { from: secondLine.from, to: secondLine.to + 1, insert: '' }
		}).state;

		expect(lineAnchorsFor(edited)).toEqual([{ line: 2, time: 20 }]);
	});

	// The counterpart to the test above, and the reason the field inspects the
	// change set rather than the result. Deleting a line and merging two lines
	// both end with two anchors on one line; only the change set says which
	// happened, and they want opposite answers.
	it('keeps the earlier anchor when backspace merges two lines', () => {
		const state = stateWith([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);
		const secondLine = state.doc.line(2);

		const edited = state.update({
			changes: { from: secondLine.to, to: secondLine.to + 1, insert: '' }
		}).state;

		expect(edited.doc.line(2).text).toBe('first linesecond line');
		expect(lineAnchorsFor(edited)).toEqual([{ line: 2, time: 10 }]);
	});

	// The automatic stamp fires on every edit while audio plays. If it could
	// overwrite, coming back to fix a typo would drag that line's anchor to
	// wherever the audio happened to be — the feature quietly destroying its own
	// data, which is exactly the way it would fight the user.
	it('never lets an automatic stamp replace a time already there', () => {
		const state = stateWith([{ line: 2, time: 10 }]);

		const stamped = state.update({
			effects: anchorLineEffect.of({ pos: lineStart(state, 2), time: 99, overwrite: false })
		}).state;

		expect(lineAnchorsFor(stamped)).toEqual([{ line: 2, time: 10 }]);
	});

	it('stamps a line that has no anchor yet', () => {
		const state = stateWith([{ line: 2, time: 10 }]);

		const stamped = state.update({
			effects: anchorLineEffect.of({ pos: lineStart(state, 3) + 2, time: 25, overwrite: false })
		}).state;

		expect(lineAnchorsFor(stamped)).toEqual([
			{ line: 2, time: 10 },
			{ line: 3, time: 25 }
		]);
	});

	it('lets a deliberate stamp correct an existing anchor', () => {
		const state = stateWith([{ line: 2, time: 10 }]);

		const stamped = state.update({
			effects: anchorLineEffect.of({ pos: lineStart(state, 2), time: 99, overwrite: true })
		}).state;

		expect(lineAnchorsFor(stamped)).toEqual([{ line: 2, time: 99 }]);
	});

	it('clears the anchor on a line without touching its neighbours', () => {
		const state = stateWith([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);

		const cleared = state.update({
			effects: clearLineAnchorEffect.of({ pos: lineStart(state, 2) + 3 })
		}).state;

		expect(lineAnchorsFor(cleared)).toEqual([{ line: 3, time: 20 }]);
		expect(hasAnchorAt(cleared, lineStart(cleared, 2))).toBe(false);
	});

	it('answers which line the caret is on', () => {
		const state = stateWith([{ line: 3, time: 20 }]);

		expect(anchorTimeAt(state, lineStart(state, 3) + 4)).toBe(20);
		expect(anchorTimeAt(state, lineStart(state, 2))).toBeUndefined();
		expect(hasAnchorAt(state, lineStart(state, 3))).toBe(true);
	});
});

describe('line anchors and the playhead', () => {
	// An anchor owns the audio from its own time until the next one's, so the
	// marker belongs to the last anchor at or before the playhead. The *nearest*
	// anchor would light the next line up halfway through the current one.
	it('marks the last anchor at or before the playhead', () => {
		const state = stateWith([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 },
			{ line: 4, time: 30 }
		]);

		const at25 = state.update({ effects: setPlayheadEffect.of(25) }).state;
		expect(at25.field(lineAnchorField).currentFrom).toBe(lineStart(state, 3));

		const at30 = state.update({ effects: setPlayheadEffect.of(30) }).state;
		expect(at30.field(lineAnchorField).currentFrom).toBe(lineStart(state, 4));
	});

	it('marks nothing before the first anchor, or while not playing', () => {
		const state = stateWith([{ line: 2, time: 10 }]);

		expect(
			state.update({ effects: setPlayheadEffect.of(4) }).state.field(lineAnchorField).currentFrom
		).toBeUndefined();
		expect(
			state.update({ effects: setPlayheadEffect.of(undefined) }).state.field(lineAnchorField)
				.currentFrom
		).toBeUndefined();
	});

	// The playhead ticks several times a second for the length of a song. The
	// column's `lineMarkerChange` is keyed on `currentFrom`, so a tick that stays
	// inside one line has to leave that value alone — otherwise this feature costs
	// a rebuild per tick for a picture that changes once a line.
	it('holds `currentFrom` still while the playhead stays inside one anchor', () => {
		const state = stateWith([
			{ line: 2, time: 10 },
			{ line: 3, time: 20 }
		]);

		const first = state.update({ effects: setPlayheadEffect.of(12) }).state;
		const second = first.update({ effects: setPlayheadEffect.of(13) }).state;
		const crossed = second.update({ effects: setPlayheadEffect.of(21) }).state;

		expect(second.field(lineAnchorField).currentFrom).toBe(
			first.field(lineAnchorField).currentFrom
		);
		expect(crossed.field(lineAnchorField).currentFrom).not.toBe(
			first.field(lineAnchorField).currentFrom
		);
	});

	it('keeps the field value identical when nothing it cares about changed', () => {
		const state = stateWith([{ line: 2, time: 10 }]);
		const unchanged = state.update({ selection: { anchor: 3 } }).state;

		expect(unchanged.field(lineAnchorField)).toBe(state.field(lineAnchorField));
	});
});

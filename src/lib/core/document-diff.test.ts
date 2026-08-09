import { describe, expect, test } from 'vitest';
import { diffDocuments } from './document-diff.js';

describe('diffDocuments', () => {
	test('byte-identical texts report identical and no hunks', () => {
		const text = '[Verse 1]\nHello world';
		const diff = diffDocuments(text, text);
		expect(diff.identical).toBe(true);
		expect(diff.hunks).toHaveLength(0);
	});

	test('a rewritten word is one changed hunk with word-level segments and the line offsets', () => {
		const baseline = '[Verse 1]\nHello wrld\nSecond line';
		const current = '[Verse 1]\nHello world\nSecond line';
		const diff = diffDocuments(baseline, current);
		expect(diff.identical).toBe(false);
		expect(diff.hunks).toHaveLength(1);
		expect(diff.changedLines).toBe(1);

		const hunk = diff.hunks[0];
		expect(hunk.line).toBe(2);
		expect(current.slice(hunk.from, hunk.to)).toBe('Hello world');
		// The change arrives inside its surroundings: the header above — which
		// is also the neighbour — and the line below.
		expect(hunk.rows).toEqual([
			{ kind: 'context', text: '[Verse 1]', line: 1, at: 0 },
			{
				kind: 'changed',
				segments: [
					{ kind: 'shared', text: 'Hello ' },
					{ kind: 'change', deleted: 'wrld', inserted: 'world' }
				],
				line: 2,
				at: 10
			},
			{ kind: 'context', text: 'Second line', line: 3, at: 22 }
		]);
		// A real word change carries no note; the rendered pair already shows it.
		expect(hunk.notes).toHaveLength(0);
	});

	test('an added line is an added row whose offsets cover the new line', () => {
		const baseline = 'One\nThree';
		const current = 'One\nTwo\nThree';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		expect(diff.addedLines).toBe(1);
		const hunk = diff.hunks[0];
		expect(hunk.rows).toEqual([
			{ kind: 'context', text: 'One', line: 1, at: 0 },
			{ kind: 'added', text: 'Two', line: 2, at: 4 },
			{ kind: 'context', text: 'Three', line: 3, at: 8 }
		]);
		expect(current.slice(hunk.from, hunk.to)).toBe('Two');
	});

	test('a removed line is a hunk that collapses to the point the removal left', () => {
		const baseline = 'One\nTwo\nThree';
		const current = 'One\nThree';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		expect(diff.removedLines).toBe(1);
		const hunk = diff.hunks[0];
		// The removal draws between the two lines it used to sit between, and a
		// press on it parks the caret at the point the removal left behind.
		expect(hunk.rows).toEqual([
			{ kind: 'context', text: 'One', line: 1, at: 0 },
			{ kind: 'removed', text: 'Two', at: 4 },
			{ kind: 'context', text: 'Three', line: 2, at: 4 }
		]);
		expect(hunk.from).toBe(hunk.to);
		expect(hunk.from).toBe(current.indexOf('Three'));
		expect(hunk.line).toBe(2);
	});

	test('a removal at the end of the document still has a point to collapse to', () => {
		const baseline = 'One\nTwo';
		const current = 'One';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		const hunk = diff.hunks[0];
		expect(hunk.from).toBe(hunk.to);
		expect(hunk.from).toBe(current.length);
		expect(hunk.rows).toEqual([
			{ kind: 'context', text: 'One', line: 1, at: 0 },
			{ kind: 'removed', text: 'Two', at: current.length }
		]);
	});

	test('a change deep in a section carries its header, an ellipsis, and the neighbours', () => {
		const baseline = '[Chorus]\nAlpha\nBravo\nCharlie\nDelta\nEcho';
		const current = '[Chorus]\nAlpha\nBravo\nCharlie\nDelts\nEcho';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		const kinds = diff.hunks[0].rows.map((row) => row.kind);
		// Header, skipped distance, neighbour above, the change, neighbour below.
		expect(kinds).toEqual(['context', 'gap', 'context', 'changed', 'context']);
		const [header] = diff.hunks[0].rows;
		if (header.kind !== 'context') throw new Error('expected the header row');
		expect(header.text).toBe('[Chorus]');
		expect(header.at).toBe(0);
	});

	test('a header directly above the neighbour needs no ellipsis', () => {
		const baseline = '[Chorus]\nAlpha\nBravo';
		const current = '[Chorus]\nAlpha\nBrava';
		const diff = diffDocuments(baseline, current);
		const kinds = diff.hunks[0].rows.map((row) => row.kind);
		expect(kinds).toEqual(['context', 'context', 'changed']);
	});

	test('separate edits arrive as separate hunks in document order', () => {
		const baseline = 'Alpha\nBravo\nCharlie\nDelta\nEcho';
		const current = 'Alpha\nBrava\nCharlie\nDelta\nEchoes';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(2);
		expect(diff.hunks[0].line).toBe(2);
		expect(diff.hunks[1].line).toBe(5);
		expect(current.slice(diff.hunks[0].from, diff.hunks[0].to)).toBe('Brava');
		expect(current.slice(diff.hunks[1].from, diff.hunks[1].to)).toBe('Echoes');
	});

	test('a quote made typographic is named, because the glyphs are near-identical', () => {
		const diff = diffDocuments("Don't stop", 'Don’t stop');
		expect(diff.hunks).toHaveLength(1);
		expect(diff.hunks[0].notes).toContain('Straight quote marks became typographic ones');
	});

	test('the reverse direction is named the other way round', () => {
		const diff = diffDocuments('Don’t stop', "Don't stop");
		expect(diff.hunks[0].notes).toContain('Typographic quote marks became straight ones');
	});

	test('a removed zero-width space is named — the rows cannot show it', () => {
		const diff = diffDocuments('Hello​world', 'Helloworld');
		expect(diff.hunks).toHaveLength(1);
		expect(diff.hunks[0].notes).toContain('Removed a zero-width space');
	});

	test('a non-breaking space swapped for a normal one is named as the swap', () => {
		const diff = diffDocuments('Hello world', 'Hello world');
		expect(diff.hunks[0].notes).toContain('A non-breaking space became a normal space');
		// The space the swap wrote is part of that sentence, not a second note.
		expect(diff.hunks[0].notes).toHaveLength(1);
	});

	test('removed trailing whitespace is named as trailing', () => {
		const diff = diffDocuments('Hello world  ', 'Hello world');
		expect(diff.hunks[0].notes).toContain('Trailing whitespace removed');
	});

	test('a doubled space inside the line is named as spacing between words', () => {
		const diff = diffDocuments('Hello  world again', 'Hello world again');
		expect(diff.hunks[0].notes).toContain('Extra space between words removed');
	});

	test('wholly different documents still produce a readable diff', () => {
		const diff = diffDocuments('Completely\nother\nsong', 'A new\ntranscription');
		expect(diff.identical).toBe(false);
		expect(diff.hunks.length).toBeGreaterThan(0);
		const rows = diff.hunks.flatMap((hunk) => hunk.rows);
		expect(rows.length).toBeGreaterThan(0);
	});

	test('two removals straddling a kept line may collapse to one offset — both hunks survive', () => {
		// Near the end of a document, distinct removal hunks legitimately share
		// their collapse point and line label. They are separate decisions and
		// must stay separate hunks; a renderer therefore may not treat the
		// (from, line) pair as an identity — doing so crashed the dialog once.
		const diff = diffDocuments('a\nb\n\na', 'c\na\n');
		const removals = diff.hunks.filter((hunk) => hunk.from === hunk.to);
		expect(removals).toHaveLength(2);
		expect(removals[0].from).toBe(removals[1].from);
		expect(removals[0].line).toBe(removals[1].line);
		const removedRows = (rows: (typeof removals)[number]['rows']) =>
			rows.filter((row) => row.kind === 'removed');
		expect(removedRows(removals[0].rows)).toEqual([
			{ kind: 'removed', text: 'b', at: removals[0].from }
		]);
		expect(removedRows(removals[1].rows)).toEqual([
			{ kind: 'removed', text: 'a', at: removals[1].from }
		]);
	});

	test('a note is stated once per hunk however many lines repeat it', () => {
		const diff = diffDocuments('One \nTwo ', 'One\nTwo');
		expect(diff.hunks).toHaveLength(1);
		expect(diff.hunks[0].notes).toEqual(['Trailing whitespace removed']);
	});
});

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
		// The press selects the changed line in the current document.
		expect(current.slice(hunk.from, hunk.to)).toBe('Hello world');
		expect(hunk.rows).toHaveLength(1);
		const row = hunk.rows[0];
		if (row.kind !== 'changed') throw new Error('expected a changed row');
		expect(row.segments).toEqual([
			{ kind: 'shared', text: 'Hello ' },
			{ kind: 'change', deleted: 'wrld', inserted: 'world' }
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
		expect(hunk.rows).toEqual([{ kind: 'added', text: 'Two' }]);
		expect(current.slice(hunk.from, hunk.to)).toBe('Two');
	});

	test('a removed line is a hunk that collapses to the point the removal left', () => {
		const baseline = 'One\nTwo\nThree';
		const current = 'One\nThree';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		expect(diff.removedLines).toBe(1);
		const hunk = diff.hunks[0];
		expect(hunk.rows).toEqual([{ kind: 'removed', text: 'Two' }]);
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

	test('a note is stated once per hunk however many lines repeat it', () => {
		const diff = diffDocuments('One \nTwo ', 'One\nTwo');
		expect(diff.hunks).toHaveLength(1);
		expect(diff.hunks[0].notes).toEqual(['Trailing whitespace removed']);
	});
});

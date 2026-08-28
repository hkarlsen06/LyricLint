import { describe, expect, test } from 'vitest';
import { diffDocuments } from './document-diff.js';

describe('diffDocuments', () => {
	test('byte-identical texts report identical and no hunks', () => {
		const text = '[Verse 1]\nHello world';
		const diff = diffDocuments(text, text);
		expect(diff.identical).toBe(true);
		expect(diff.hunks).toHaveLength(0);
	});

	test('a rewritten word is one changed hunk with character-level segments and the line offsets', () => {
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
					{ kind: 'shared', text: 'Hello w' },
					{ kind: 'change', deleted: '', inserted: 'o' },
					{ kind: 'shared', text: 'rld' }
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

	test('a blank neighbour is dropped — a placeholder line orients nobody', () => {
		// Change on a section's last line: the line below is the blank between
		// sections. "(blank line)" as context says nothing about where the
		// change sits; the placeholder is only owed where a blank line is
		// itself the change.
		const baseline = '[Chorus]\nAlpha\nBravo\n\n[Verse]\nCharlie';
		const current = '[Chorus]\nAlpha\nBrava\n\n[Verse]\nCharlie';
		const diff = diffDocuments(baseline, current);
		const kinds = diff.hunks[0].rows.map((row) => row.kind);
		expect(kinds).toEqual(['context', 'context', 'changed']);
	});

	test('a gap that skips only blank lines draws no ellipsis', () => {
		const baseline = '[Chorus]\n\nAlpha';
		const current = '[Chorus]\n\nAlpha!';
		const diff = diffDocuments(baseline, current);
		const kinds = diff.hunks[0].rows.map((row) => row.kind);
		// The header stands directly over the change; the blank between them is
		// section spacing, and an ⋯ standing for it reads as hidden lyrics.
		expect(kinds).toEqual(['context', 'changed']);
	});

	test('a header directly above the neighbour needs no ellipsis', () => {
		const baseline = '[Chorus]\nAlpha\nBravo';
		const current = '[Chorus]\nAlpha\nBrava';
		const diff = diffDocuments(baseline, current);
		const kinds = diff.hunks[0].rows.map((row) => row.kind);
		expect(kinds).toEqual(['context', 'context', 'changed']);
	});

	test('separate edits arrive as separate hunks in document order', () => {
		const baseline = 'Alpha\nBravo\nCharlie\nDelta\nEcho\nFoxtrot';
		const current = 'Alpha\nBrava\nCharlie\nDelta\nEcho\nFoxtrots';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(2);
		expect(diff.hunks[0].line).toBe(2);
		expect(diff.hunks[1].line).toBe(6);
		expect(current.slice(diff.hunks[0].from, diff.hunks[0].to)).toBe('Brava');
		expect(current.slice(diff.hunks[1].from, diff.hunks[1].to)).toBe('Foxtrots');
	});

	test('changes up to two kept lines apart coalesce into one hunk', () => {
		// Split, the two cards would draw the entire gap anyway — the kept line
		// as one card's neighbour below and the other's neighbour above — with
		// the section header printed a second time over the lower card.
		const baseline = '[Bro]\nOne\nTwo\nThree\nFour';
		const current = '[Bro]\nOne\nTwoo\nThree\nFourr';
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		const hunk = diff.hunks[0];
		expect(hunk.rows.map((row) => row.kind)).toEqual([
			'context', // [Bro], once
			'context', // One, the neighbour above
			'changed', // Twoo
			'context', // Three, the kept line between the changes
			'changed' // Fourr
		]);
		expect(current.slice(hunk.from, hunk.to)).toBe('Twoo\nThree\nFourr');
		expect(diff.changedLines).toBe(2);
	});

	test('a blank kept line inside a coalesced hunk is dropped like a blank neighbour', () => {
		const diff = diffDocuments('One\n\nTwo', 'Onee\n\nTwoo');
		expect(diff.hunks).toHaveLength(1);
		// The line numbers on the rows carry the skip; a "(blank line)" row is
		// only owed where a blank line is itself the change.
		expect(diff.hunks[0].rows.map((row) => row.kind)).toEqual(['changed', 'changed']);
	});

	test('a varied repeat of a line pairs with its own twin, not with an exact match further down', () => {
		// A refrain repeats its lines with ad-lib variations. An exact-match
		// alignment anchors on the byte-identical plain twin, dumping the varied
		// line as a whole-line removal and its counterpart as a whole-line
		// addition — a wall of red and green for what a transcriber reads as one
		// line with its ad-lib struck. The similarity alignment pairs each varied
		// line with the line it varies, and the character diff tells the rest.
		const baseline = [
			'[Refreng]',
			'Jeg tok over hele dritten <i>(Hah)</i>',
			'Vi styrer hele byen <i>(City)</i>',
			'Jeg tok over hele dritten',
			'Vi styrer hele byen'
		].join('\n');
		const current = [
			'[Refreng]',
			'Jeg tok over hele dritten',
			'Vi styrer hele byen <i>City</i>',
			'Jeg tok over hele dritten',
			'Vi styrer hele byen (Wow)'
		].join('\n');
		const diff = diffDocuments(baseline, current);
		expect(diff.hunks).toHaveLength(1);
		expect(diff.hunks[0].rows.map((row) => row.kind)).toEqual([
			'context', // [Refreng]
			'changed', // the ad-lib struck off line 2
			'changed', // (City) → City on line 3
			'context', // the plain twin, still just a kept line
			'changed' // (Wow) added on line 5
		]);
		expect(diff.changedLines).toBe(3);
		expect(diff.removedLines).toBe(0);
		expect(diff.addedLines).toBe(0);
	});

	test('unrelated lines do not pair — a rewrite stays whole-line rows', () => {
		const diff = diffDocuments('One\nAlpha lyric here\nTwo', 'One\nSomething else entirely\nTwo');
		const kinds = diff.hunks[0].rows.map((row) => row.kind);
		// Adjacent but dissimilar: an honest removal and addition, so the reader
		// is not asked to decode a changed row that rewrites every character.
		expect(kinds).toEqual(['context', 'removed', 'added', 'context']);
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

	test('removals straddling kept lines coalesce, and share a collapse point at the end', () => {
		// These were once three hunks, and the two removals near the document's
		// end shared their collapse point and line label — which is why a
		// renderer may not treat the (at, line) pair as an identity; keying on it
		// crashed the dialog once. Coalescing puts them in one hunk now, where
		// the two removed rows still legitimately carry the same offset.
		const diff = diffDocuments('a\nb\n\na', 'c\na\n');
		expect(diff.hunks).toHaveLength(1);
		const hunk = diff.hunks[0];
		expect(hunk.rows.map((row) => row.kind)).toEqual(['added', 'context', 'removed', 'removed']);
		const removedRows = hunk.rows.filter((row) => row.kind === 'removed');
		expect(removedRows).toEqual([
			{ kind: 'removed', text: 'b', at: 4 },
			{ kind: 'removed', text: 'a', at: 4 }
		]);
		expect(diff.addedLines).toBe(1);
		expect(diff.removedLines).toBe(2);
	});

	test('a note is stated once per hunk however many lines repeat it', () => {
		const diff = diffDocuments('One \nTwo ', 'One\nTwo');
		expect(diff.hunks).toHaveLength(1);
		expect(diff.hunks[0].notes).toEqual(['Trailing whitespace removed']);
	});
});

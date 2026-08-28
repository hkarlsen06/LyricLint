import { describe, expect, it } from 'vitest';
import { charDiffSegments } from './char-diff.js';

describe('charDiffSegments', () => {
	it('returns one shared segment for identical text, and nothing for empty', () => {
		expect(charDiffSegments('Hold on tight', 'Hold on tight')).toEqual([
			{ kind: 'shared', text: 'Hold on tight' }
		]);
		expect(charDiffSegments('', '')).toEqual([]);
	});

	it('trims a change to the characters that differ, as Genius draws it', () => {
		expect(charDiffSegments('Hold on tyght', 'Hold on tight')).toEqual([
			{ kind: 'shared', text: 'Hold on t' },
			{ kind: 'change', deleted: 'y', inserted: 'i' },
			{ kind: 'shared', text: 'ght' }
		]);
		// A pure insertion inside a word is an empty deletion, not a rewrite.
		expect(charDiffSegments('the wrld', 'the world')).toEqual([
			{ kind: 'shared', text: 'the w' },
			{ kind: 'change', deleted: '', inserted: 'o' },
			{ kind: 'shared', text: 'rld' }
		]);
	});

	it('folds a rewrite back together instead of keeping coincidental letters', () => {
		// "love" and "friend" agree on an "e"; a diff that shares it is
		// confetti. The semantic cleanup folds it back into the change.
		expect(charDiffSegments('my love forever', 'my dear forever')).toEqual([
			{ kind: 'shared', text: 'my ' },
			{ kind: 'change', deleted: 'love', inserted: 'dear' },
			{ kind: 'shared', text: ' forever' }
		]);
		expect(charDiffSegments('Alpha lyric here', 'Something else entirely')).toEqual([
			{ kind: 'change', deleted: 'Alpha lyric here', inserted: 'Something else entirely' }
		]);
	});

	it('slides an edit to the line boundary, so a new line is whole', () => {
		// Myers is free to answer "One\nT[wo\nT]hree"; the boundary shift is
		// what turns it into a whole added line.
		expect(charDiffSegments('One\nThree', 'One\nTwo\nThree')).toEqual([
			{ kind: 'shared', text: 'One\n' },
			{ kind: 'change', deleted: '', inserted: 'Two\n' },
			{ kind: 'shared', text: 'Three' }
		]);
		expect(charDiffSegments('One\nTwo\nThree', 'One\nThree')).toEqual([
			{ kind: 'shared', text: 'One\n' },
			{ kind: 'change', deleted: 'Two\n', inserted: '' },
			{ kind: 'shared', text: 'Three' }
		]);
	});

	it('draws a moved parenthetical boundary the way Genius does', () => {
		// The flip `<i>(City)</i>` → `(<i>City</i>)`: the markup and the word
		// hold steady as shared text; the parens read as moved — red inside,
		// green outside — which is Genius's own rendering of this edit.
		expect(charDiffSegments('sang <i>(City)</i>', 'sang (<i>City</i>)')).toEqual([
			{ kind: 'shared', text: 'sang ' },
			{ kind: 'change', deleted: '', inserted: '(' },
			{ kind: 'shared', text: '<i>' },
			{ kind: 'change', deleted: '(', inserted: '' },
			{ kind: 'shared', text: 'City' },
			{ kind: 'change', deleted: ')', inserted: '' },
			{ kind: 'shared', text: '</i>' },
			{ kind: 'change', deleted: '', inserted: ')' }
		]);
	});

	it('strikes only the tags when markup is stripped from unchanged lyrics', () => {
		expect(charDiffSegments('<i>City</i>', 'City')).toEqual([
			{ kind: 'change', deleted: '<i>', inserted: '' },
			{ kind: 'shared', text: 'City' },
			{ kind: 'change', deleted: '</i>', inserted: '' }
		]);
	});

	it('shows a split line as text that moved down a row, not a removal', () => {
		expect(
			charDiffSegments(
				'Hvem er på, som oss? Vi styrer hele byen',
				'Hvem er på som oss?\nVi styrer hele byen (Wow)'
			)
		).toEqual([
			{ kind: 'shared', text: 'Hvem er på' },
			{ kind: 'change', deleted: ',', inserted: '' },
			{ kind: 'shared', text: ' som oss?' },
			{ kind: 'change', deleted: ' ', inserted: '\n' },
			{ kind: 'shared', text: 'Vi styrer hele byen' },
			{ kind: 'change', deleted: '', inserted: ' (Wow)' }
		]);
	});

	it('never leaves half a surrogate pair in shared text', () => {
		// 🎵 and 🎶 share their high surrogate; a shared half-character would
		// render as garbage, so the whole emoji is the change.
		expect(charDiffSegments('🎵 x', '🎶 x')).toEqual([
			{ kind: 'change', deleted: '🎵', inserted: '🎶' },
			{ kind: 'shared', text: ' x' }
		]);
	});

	it('reconstructs both inputs exactly, whatever the shapes', () => {
		const cases: [string, string][] = [
			['', 'brand new'],
			['gone', ''],
			['a\nb\nc', 'c\nb\na'],
			['Hei på deg\n\nMer tekst her', 'Hei på dere\nMer tekst her\nog en til'],
			['same', 'same']
		];
		for (const [oldText, newText] of cases) {
			const segments = charDiffSegments(oldText, newText);
			const rebuiltOld = segments
				.map((segment) => (segment.kind === 'shared' ? segment.text : segment.deleted))
				.join('');
			const rebuiltNew = segments
				.map((segment) => (segment.kind === 'shared' ? segment.text : segment.inserted))
				.join('');
			expect(rebuiltOld).toBe(oldText);
			expect(rebuiltNew).toBe(newText);
		}
	});
});

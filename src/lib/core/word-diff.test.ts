import { describe, expect, it } from 'vitest';
import { diffWords, wordDiffSegments } from './word-diff.js';

function applyEdits(text: string, edits: ReturnType<typeof diffWords>): string {
	let result = text;
	for (const edit of [...edits].sort((left, right) => right.from - left.from)) {
		result = result.slice(0, edit.from) + edit.insert + result.slice(edit.to);
	}
	return result;
}

describe('word diff', () => {
	it('returns no edits for identical text', () => {
		expect(diffWords('Hold on tight', 'Hold on tight')).toEqual([]);
		expect(wordDiffSegments('Hold on tight', 'Hold on tight')).toEqual([
			{ kind: 'shared', text: 'Hold on tight' }
		]);
	});

	it('isolates changed words and reports offsets in the old text', () => {
		const oldText = 'Hold on tight\nI will be there tonight';
		const newText = 'Hold on tight\nI can be there again';
		const edits = diffWords(oldText, newText);

		expect(edits).toEqual([
			{ from: 16, to: 20, insert: 'can' },
			{ from: 30, to: 37, insert: 'again' }
		]);
		expect(applyEdits(oldText, edits)).toBe(newText);
	});

	it('keeps insertions and deletions as zero-width or empty replacement edits', () => {
		expect(diffWords('Be there', 'Be right there')).toEqual([{ from: 3, to: 3, insert: 'right ' }]);
		expect(diffWords('Be right there', 'Be there')).toEqual([{ from: 3, to: 9, insert: '' }]);
	});

	it('hands matching whitespace at a run edge back to shared context', () => {
		expect(wordDiffSegments('my love forever', 'my friend forever')).toEqual([
			{ kind: 'shared', text: 'my ' },
			{ kind: 'change', deleted: 'love', inserted: 'friend' },
			{ kind: 'shared', text: ' forever' }
		]);
	});

	it('trims a changed run to the characters that differ, as Genius draws it', () => {
		expect(wordDiffSegments('Hold on tyght', 'Hold on tight')).toEqual([
			{ kind: 'shared', text: 'Hold on t' },
			{ kind: 'change', deleted: 'y', inserted: 'i' },
			{ kind: 'shared', text: 'ght' }
		]);
		// A pure insertion inside a word is an empty deletion, not a rewrite.
		expect(wordDiffSegments('the wrld', 'the world')).toEqual([
			{ kind: 'shared', text: 'the w' },
			{ kind: 'change', deleted: '', inserted: 'o' },
			{ kind: 'shared', text: 'rld' }
		]);
		expect(wordDiffSegments('Imma stay', "I'ma stay")).toEqual([
			{ kind: 'shared', text: 'I' },
			{ kind: 'change', deleted: 'm', inserted: "'" },
			{ kind: 'shared', text: 'ma stay' }
		]);
	});

	it('keeps a rewrite whole instead of hunting shared letters inside it', () => {
		expect(wordDiffSegments('my love forever', 'my dear forever')).toEqual([
			{ kind: 'shared', text: 'my ' },
			{ kind: 'change', deleted: 'love', inserted: 'dear' },
			{ kind: 'shared', text: ' forever' }
		]);
	});

	it('a run where only the markup moved keeps the lyrics and colors the tags', () => {
		// The parenthetical boundary flip: italics that wrapped the parens now
		// sit inside them. The words and parens hold steady as shared text; the
		// old tags read as deletions where they stood, the new ones as
		// insertions where they land — how Genius draws the same edit.
		expect(wordDiffSegments('sang <i>(City)</i>', 'sang (<i>City</i>)')).toEqual([
			{ kind: 'shared', text: 'sang ' },
			{ kind: 'change', deleted: '<i>', inserted: '' },
			{ kind: 'shared', text: '(' },
			{ kind: 'change', deleted: '', inserted: '<i>' },
			{ kind: 'shared', text: 'City' },
			{ kind: 'change', deleted: '', inserted: '</i>' },
			{ kind: 'shared', text: ')' },
			{ kind: 'change', deleted: '</i>', inserted: '' }
		]);
	});

	it('markup stripped from unchanged lyrics strikes only the tags', () => {
		expect(wordDiffSegments('<i>City</i>', 'City')).toEqual([
			{ kind: 'change', deleted: '<i>', inserted: '' },
			{ kind: 'shared', text: 'City' },
			{ kind: 'change', deleted: '</i>', inserted: '' }
		]);
	});

	it('never splits a surrogate pair between shared and changed text', () => {
		// 🎵 and 🎶 share their high surrogate; the trim must not claim it.
		expect(wordDiffSegments('🎵', '🎶')).toEqual([
			{ kind: 'change', deleted: '🎵', inserted: '🎶' }
		]);
	});

	it('uses UTF-16 offsets, including around non-BMP characters', () => {
		const oldText = '🎵 sing tonight';
		const newText = '🎵 sing again';
		expect(diffWords(oldText, newText)).toEqual([{ from: 8, to: 15, insert: 'again' }]);
	});
});

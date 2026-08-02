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

	it('uses UTF-16 offsets, including around non-BMP characters', () => {
		const oldText = '🎵 sing tonight';
		const newText = '🎵 sing again';
		expect(diffWords(oldText, newText)).toEqual([{ from: 8, to: 15, insert: 'again' }]);
	});
});

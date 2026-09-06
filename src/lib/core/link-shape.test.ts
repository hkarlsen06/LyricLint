import { describe, expect, it, vi } from 'vitest';
import * as passages from './link-passages.js';
import {
	alignBodies,
	bodiesAreSimilarEnoughToLink,
	expandOverHoles,
	holeContaining,
	linkBodySimilarity,
	translateSpan
} from './link-shape.js';

/** The divergent runs as their own text, which is what the card ends up showing. */
function wordings(bodies: readonly string[]): string[][] {
	const holes = alignBodies(bodies);
	const slots = holes[0]?.length ?? 0;
	return Array.from({ length: slots }, (_, slot) =>
		bodies.map((body, member) => {
			const hole = holes[member]?.[slot];
			return hole ? body.slice(hole.from, hole.to) : '';
		})
	);
}

describe('aligning the copies of a song part', () => {
	it('finds no difference between identical bodies', () => {
		const body = '\nHold on tight\nNever let go';
		expect(alignBodies([body, body])).toEqual([[], []]);
	});

	it('isolates the one line that differs and leaves the rest shared', () => {
		expect(
			wordings([
				'\nHold on tight\nThe night is young\nAnd I will be there tonight',
				'\nHold on tight\nThe night is young\nAnd I will be there again'
			])
		).toEqual([['tonight', 'again']]);
	});

	it('isolates part of a line, which is the whole point of aligning by word', () => {
		const holes = alignBodies([
			'\nHold on tight, my love\nNever let go',
			'\nHold on tight, my friend\nNever let go'
		]);
		expect(holes[0]).toHaveLength(1);
		expect(
			wordings([
				'\nHold on tight, my love\nNever let go',
				'\nHold on tight, my friend\nNever let go'
			])
		).toEqual([['love', 'friend']]);
	});

	it('never calls a fragment of a longer word a common anchor', () => {
		// A character-level alignment matches the `to` in both and splits two
		// unrelated words into three runs. Word tokens cannot.
		expect(wordings(['\nGoing tonight', '\nGoing together'])).toEqual([['tonight', 'together']]);
	});

	it('keeps an empty run on the side that simply stops', () => {
		expect(wordings(['\nBe there tonight', '\nBe there'])).toEqual([[' tonight', '']]);
	});

	it('treats an untyped copy as one difference covering everything', () => {
		expect(wordings(['\nHold on tight', ''])).toEqual([['\nHold on tight', '']]);
	});

	it('lines up three copies at once, sharing only what all of them share', () => {
		expect(
			wordings(['\nHold on tight\nTonight', '\nHold on tight\nAgain', '\nHold on tight\nTonight'])
		).toEqual([['Tonight', 'Again', 'Tonight']]);
	});

	it('keeps repeated words on their own side of a line break', () => {
		const bodies = ["\na bathroom, she's\nlike b", "\na bathroom\nShe's bathroom, she's like b"];
		const differences = wordings(bodies);

		// Repeated `bathroom` and `she's` must not be worth more than the newline:
		// every divergent run stays within one lyric line.
		expect(differences.flat().every((wording) => !wording.includes('\n'))).toBe(true);
		expect(differences).toEqual([
			["bathroom, she's", 'bathroom'],
			['', "She's bathroom, she's "]
		]);
	});

	it('refuses a run whose words match but whose spacing does not', () => {
		// Two spaces in one copy: the tokens pair up, the text between them does
		// not, so the run is not shared and the difference is reported instead.
		const holes = alignBodies(['\nHold on tight', '\nHold  on tight']);
		expect(holes[0]?.length).toBeGreaterThan(0);
	});

	it('gives every member the same number of runs, always', () => {
		const bodies = ['\nOne\nTwo\nThree', '\nOne\nDifferent\nThree', '\nOne\nTwo\nEntirely other'];
		const holes = alignBodies(bodies);
		expect(new Set(holes.map((list) => list.length)).size).toBe(1);
	});

	it('reconstructs each body exactly from its shared runs and its own runs', () => {
		const bodies = [
			'\nHold on tight\nAnd I will be there tonight\nNever let go',
			'\nHold on tight\nAnd I will be there again\nNever let go'
		];
		const holes = alignBodies(bodies);
		// The shared text between the same two runs has to be identical in every
		// member, or nothing downstream can translate a position.
		const slots = holes[0]?.length ?? 0;
		for (let slot = 0; slot <= slots; slot += 1) {
			const shared = bodies.map((body, member) => {
				const from = slot === 0 ? 0 : (holes[member]?.[slot - 1]?.to ?? 0);
				const to = slot === slots ? body.length : (holes[member]?.[slot]?.from ?? body.length);
				return body.slice(from, to);
			});
			expect(new Set(shared).size).toBe(1);
		}
	});
});

describe('discovering copies by their shared lyrics', () => {
	it('reuses all comparisons when a group has more than 64 pairs', () => {
		const bodies = Array.from(
			{ length: 12 },
			(_, index) => `Signal ${index}alpha ${index}bravo ${index}charlie ${index}delta`
		);
		const align = vi.spyOn(passages, 'alignPassages');
		try {
			for (let revision = 0; revision < 2; revision++) {
				for (let left = 0; left < bodies.length; left++) {
					for (let right = left + 1; right < bodies.length; right++) {
						expect(linkBodySimilarity(bodies[left]!, bodies[right]!)).toBe(0);
					}
				}
			}
			expect(align).toHaveBeenCalledTimes(66);
		} finally {
			align.mockRestore();
		}
	});

	it('uses lexical rejection only where the full aligner also finds no shared passage', () => {
		const bodies = [
			'Hold on tight',
			'Hold on, friend',
			'<i>Bright</i> morning',
			'i et badekar, ri-ri',
			'[Hold on](123)',
			'123 beside lo<i>ve</i>',
			'la la',
			'la',
			'🎵 mañana café',
			'\t\n!!!',
			'!!!'
		];
		for (const left of bodies) {
			for (const right of bodies) {
				const shared = passages.alignPassages([
					{ header: 0, from: 0, text: left },
					{ header: 1, from: 0, text: right }
				]);
				const characters = shared.reduce(
					(total, passage) => total + passage.members[0]!.to - passage.members[0]!.from,
					0
				);
				expect(linkBodySimilarity(left, right)).toBe(
					characters / Math.min(left.length, right.length)
				);
			}
		}
	});

	it('keeps caller ceilings and exact-copy behavior after a permissive result is cached', () => {
		const left = 'We keep these words together through the morning';
		const right = `${left} light`;
		expect(linkBodySimilarity(left, right)).toBe(1);
		expect(linkBodySimilarity(left, right, { maxTokens: 3 })).toBe(0);
		expect(linkBodySimilarity(left, left, { maxTokens: 3 })).toBe(1);
		expect(linkBodySimilarity(left, right)).toBe(1);
	});

	it('recomputes the same score after body-cache eviction', () => {
		const left = 'Another shared passage across the hills';
		const right = `${left} tonight`;
		const expected = linkBodySimilarity(left, right);
		for (let index = 0; index < 150; index++) {
			linkBodySimilarity(`eviction${index} only`, `different${index} words`);
		}
		expect(linkBodySimilarity(left, right)).toBe(expected);
	});

	it('scores exact, partial, and unrelated bodies through the link aligner', () => {
		expect(linkBodySimilarity('\nHold the line', '\nHold the line')).toBe(1);
		expect(
			bodiesAreSimilarEnoughToLink(
				'\nHold the line\nAnd wait for me',
				'\nHold the line\nAnd wait for now'
			)
		).toBe(true);
		expect(bodiesAreSimilarEnoughToLink('\nHold the line', '\nNothing alike')).toBe(false);
	});

	it('does not infer similarity from an empty copy', () => {
		expect(linkBodySimilarity('', '')).toBe(0);
		expect(linkBodySimilarity('\nHold the line', '')).toBe(0);
	});

	it('discovers corresponding words despite surrounding punctuation', () => {
		expect(bodiesAreSimilarEnoughToLink('i et badekar, ri-ri', 'vin i et badekar')).toBe(true);
		expect(linkBodySimilarity('i et badekar, ri-ri', 'vin i et badekar')).toBe(
			'i et badekar'.length / 'vin i et badekar'.length
		);
	});

	it('does not score ambiguous repeated occurrences as established correspondence', () => {
		expect(linkBodySimilarity('la la', 'la')).toBe(0);
		expect(linkBodySimilarity('red blue', 'blue red')).toBe(0);
	});

	it("answers exact copies before applying a caller's alignment ceiling", () => {
		const long = Array.from({ length: 10 }, (_, index) => `line ${index}`).join('\n');
		expect(linkBodySimilarity(long, long, { maxTokens: 1 })).toBe(1);
		expect(linkBodySimilarity(long, `${long} changed`, { maxTokens: 1 })).toBe(0);
	});

	it('applies the discovery ceiling to Unicode-separated words', () => {
		const left = Array.from({ length: 5 }, (_, index) => `word${index}`).join('\u00a0');
		const right = left.replace('word4', 'changed');

		expect(linkBodySimilarity(left, right, { maxTokens: 4 })).toBe(0);
	});
});

describe('carrying an edit from one copy to another', () => {
	const source = { holes: [{ from: 10, to: 17 }], length: 25 };
	const peer = { holes: [{ from: 10, to: 15 }], length: 23 };

	it('leaves an edit inside a difference where it was made', () => {
		expect(holeContaining(source.holes, 12, 14)).toBe(0);
		expect(holeContaining(source.holes, 2, 4)).toBeUndefined();
	});

	it('translates a span of shared text by measuring from the nearest difference', () => {
		const span = expandOverHoles(source.holes, 20, 22);
		expect(span).toMatchObject({ from: 20, to: 22, firstHole: 1, lastHole: 1 });
		// 3 characters past the end of the difference in both copies.
		expect(translateSpan(source, peer, span)).toEqual({ from: 18, to: 20 });
	});

	it('translates a span before the difference without touching it', () => {
		const span = expandOverHoles(source.holes, 2, 5);
		expect(translateSpan(source, peer, span)).toEqual({ from: 2, to: 5 });
	});

	it('swallows a difference an edit reached into, at both ends', () => {
		const span = expandOverHoles(source.holes, 14, 20);
		expect(span).toMatchObject({ from: 10, to: 20, firstHole: 0, lastHole: 1 });
		expect(translateSpan(source, peer, span)).toEqual({ from: 10, to: 18 });
	});

	it('refuses to translate between members whose run counts disagree', () => {
		const span = expandOverHoles(source.holes, 2, 5);
		expect(translateSpan(source, { holes: [], length: 20 }, span)).toBeUndefined();
	});
});

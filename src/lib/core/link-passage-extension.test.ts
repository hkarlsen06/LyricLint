import { describe, expect, it } from 'vitest';
import { extendPassages } from './link-passage-extension.js';
import type { SharedPassage } from './link-passages.js';

function passage(length: number, positions: [number, number][]): SharedPassage {
	return { members: positions.map(([header, from]) => ({ header, from, to: from + length })) };
}

function scope(passages: SharedPassage[], header: number, from: number, to = from + 1): number[] {
	return (
		passages
			.find((passage) =>
				passage.members.some(
					(member) => member.header === header && member.from <= from && member.to >= to
				)
			)
			?.members.map((member) => member.header) ?? []
	);
}

describe('extending stored passage connections', () => {
	it('adds a partial copy without reducing the original full connection', () => {
		const existing = [
			passage(20, [
				[1, 0],
				[2, 100]
			])
		];
		const candidates = [
			passage(5, [
				[1, 5],
				[3, 200]
			])
		];
		const result = extendPassages(existing, candidates, [[1, 2]]);
		expect(result).toEqual([
			passage(5, [
				[1, 0],
				[2, 100]
			]),
			passage(5, [
				[1, 5],
				[2, 105],
				[3, 200]
			]),
			passage(10, [
				[1, 10],
				[2, 110]
			])
		]);
		expect(existing).toEqual([
			passage(20, [
				[1, 0],
				[2, 100]
			])
		]);
	});

	it('splits at different subset boundaries and carries every existing peer', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 100]
			]),
			passage(5, [
				[1, 5],
				[3, 205]
			])
		];
		const candidate = passage(10, [
			[1, 0],
			[4, 300]
		]);
		const result = extendPassages(existing, [candidate], [[1, 2, 3]]);
		expect(result).toEqual([
			passage(5, [
				[1, 0],
				[2, 100],
				[4, 300]
			]),
			passage(5, [
				[1, 5],
				[3, 205],
				[4, 305]
			])
		]);
	});

	it('combines two groups through a single compatible connection', () => {
		const existing = [
			passage(10, [
				[1, 0],
				[2, 100]
			]),
			passage(10, [
				[3, 200],
				[4, 300]
			])
		];
		const result = extendPassages(
			existing,
			[
				passage(10, [
					[1, 0],
					[3, 200]
				])
			],
			[
				[1, 2],
				[3, 4]
			]
		);
		expect(result).toEqual([
			passage(10, [
				[1, 0],
				[2, 100],
				[3, 200],
				[4, 300]
			])
		]);
	});

	it('treats adjacent seed fragments as one established connection', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 100]
			]),
			passage(5, [
				[1, 5],
				[2, 105]
			])
		];
		const candidate = passage(10, [
			[1, 0],
			[2, 100],
			[3, 200]
		]);
		expect(extendPassages(existing, [candidate], [[1, 2]])).toEqual([candidate]);
	});

	it('preserves old independence even if a new alignment finds matching wording', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 100]
			])
		];
		const candidates = [
			passage(10, [
				[1, 0],
				[2, 100],
				[3, 200]
			])
		];
		const result = extendPassages(existing, candidates, [[1, 2]]);
		expect(result).toEqual([
			passage(5, [
				[1, 0],
				[2, 100],
				[3, 200]
			])
		]);
		expect(scope(result, 1, 6)).toEqual([]);
	});

	it('rejects a contradictory occurrence while retaining the complete seed', () => {
		const existing = [
			passage(10, [
				[1, 0],
				[2, 100]
			])
		];
		const candidate = passage(5, [
			[1, 0],
			[2, 105],
			[3, 200]
		]);
		expect(extendPassages(existing, [candidate])).toEqual(existing);
	});

	it('does not bridge two local occurrences indirectly through a new section', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 100]
			])
		];
		const candidates = [
			passage(5, [
				[1, 5],
				[3, 200]
			]),
			passage(5, [
				[2, 105],
				[3, 200]
			])
		];
		const result = extendPassages(existing, candidates, [[1, 2]]);
		expect(scope(result, 1, 5)).toEqual([1, 3]);
		expect(scope(result, 2, 105)).toEqual([]);
	});

	it('refuses additions that would reverse stored passage order', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 105]
			]),
			passage(5, [
				[2, 100],
				[3, 205]
			])
		];
		const candidate = passage(5, [
			[1, 0],
			[3, 200]
		]);
		// The candidate would put B:105 before B:100 through C's ordering.
		expect(extendPassages(existing, [candidate])).toEqual(existing);
	});

	it('preserves paired empty positions and extends them only by exact empty correspondence', () => {
		const existing = [
			passage(0, [
				[1, 5],
				[2, 105]
			])
		];
		expect(extendPassages(existing, [])).toEqual(existing);
		expect(
			extendPassages(
				existing,
				[
					passage(0, [
						[1, 5],
						[3, 205]
					])
				],
				[[1, 2]]
			)
		).toEqual([
			passage(0, [
				[1, 5],
				[2, 105],
				[3, 205]
			])
		]);
	});

	it('adds genuinely new subset passages independently', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 100]
			])
		];
		const newPassage = passage(5, [
			[1, 10],
			[3, 200]
		]);
		expect(extendPassages(existing, [newPassage], [[1, 2]])).toEqual([...existing, newPassage]);
	});

	it('refuses malformed candidates without damaging established connections', () => {
		const existing = [
			passage(5, [
				[1, 0],
				[2, 100]
			])
		];
		const candidate = {
			members: [
				{ header: 1, from: 0, to: 5 },
				{ header: 3, from: 200, to: 204 }
			]
		};
		expect(extendPassages(existing, [candidate])).toEqual(existing);
	});
});

import { describe, expect, it } from 'vitest';
import { parseLegend, serializeLegend } from './legend.js';

describe('performer legends', () => {
	it('round-trips all four canonical style slots', () => {
		const raw = 'A, <i>B</i>, <b>C</b> & <i><b>D</b></i>';
		const groups = parseLegend(raw, 10);

		expect(groups.map((group) => group.styleSlot)).toEqual([1, 2, 3, 4]);
		expect(groups.map((group) => group.rawNameText)).toEqual(['A', 'B', 'C', 'D']);
		expect(groups[0]?.from).toBe(10);
		expect(serializeLegend(groups)).toBe(raw);
	});

	it('serializes newly constructed groups with an ampersand before the last group', () => {
		const serialized = serializeLegend([
			{ rawNameText: 'A', styleSlot: 1 },
			{ rawNameText: 'B', styleSlot: 2 },
			{ rawNameText: 'A & B', styleSlot: 3 },
			{ rawNameText: 'C', styleSlot: 4 }
		]);

		expect(serialized).toBe('A, <i>B</i>, <b>A & B</b> & <i><b>C</b></i>');
	});

	it('keeps a joint group inside one style run', () => {
		const raw = 'Avery & Blair, <i>Casey</i>';
		const groups = parseLegend(raw);

		expect(groups).toHaveLength(2);
		expect(groups[0]?.rawNameText).toBe('Avery & Blair');
		expect(groups[0]?.ambiguousAmpersands).toHaveLength(1);
		expect(groups[1]?.styleSlot).toBe(2);
		expect(serializeLegend(groups)).toBe(raw);
	});

	it('does not split an ambiguous ampersand performer name', () => {
		const raw = 'Echo & The Glass';
		const groups = parseLegend(raw, 7);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.rawNameText).toBe(raw);
		expect(groups[0]?.ambiguousAmpersands[0]).toEqual({
			from: 12,
			to: 13,
			raw: '&'
		});
		expect(serializeLegend(groups)).toBe(raw);
	});

	it('parses and serializes the documented chorus example exactly', () => {
		const header = '[Chorus: A, <i>B</i>, <b>A & B</b> & <i><b>C</b></i>]';
		const raw = header.slice('[Chorus: '.length, -1);
		const groups = parseLegend(raw, '[Chorus: '.length);

		expect(groups.map((group) => [group.styleSlot, group.rawNameText])).toEqual([
			[1, 'A'],
			[2, 'B'],
			[3, 'A & B'],
			[4, 'C']
		]);
		expect(groups[2]?.ambiguousAmpersands).toHaveLength(1);
		expect(`[Chorus: ${serializeLegend(groups)}]`).toBe(header);
	});
});

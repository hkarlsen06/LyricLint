import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { performerUnusedLegendSlotRule as rule } from './performer-unused-legend-slot.js';

describe('performer.unused-legend-slot', () => {
	it('marks and removes an unused styled legend slot', () => {
		const text = '[Verse: A & <i>B</i>]\nOnly A sings';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['A & <i>B</i>']);
		expect(finding).toMatchObject({
			message: 'This performer slot is not used in the section.',
			fixes: [
				{
					kind: 'safe',
					label: 'Remove unused performer slot',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse: A]\nOnly A sings'
		);
	});

	it('removes the complete legend when no declared slot is used', () => {
		const text = '[Verse: <i>B</i>]\nPlain voice';
		const [finding] = checkRule(rule, text);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Verse]\nPlain voice');
	});

	it('accepts used slots and avoids pruning unsafe or empty sections', () => {
		expect(checkRule(rule, '[Verse: A & <i>B</i>]\nA sings\n<i>B sings</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse: A & <i>B</i>]\n<u>Unknown markup</u>')).toEqual([]);
		expect(checkRule(rule, '[Verse: A & <i>B</i>]')).toEqual([]);
	});
});

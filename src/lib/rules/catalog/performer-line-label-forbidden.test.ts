import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { performerLineLabelForbiddenRule as rule } from './performer-line-label-forbidden.js';

describe('performer.line-label-forbidden', () => {
	it('marks a known performer label and removes its following separator', () => {
		const text = '[Verse: Avery]\n[Avery] A line';
		const [finding] = checkRule(rule, text, { performers: ['Avery'] });

		expect(markedText(text, [finding!])).toEqual(['[Avery]']);
		expect(finding).toMatchObject({
			message: 'Do not label individual lyric lines with bracketed performer names.',
			fixes: [
				{
					kind: 'preview',
					label: 'Remove the line label',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Verse: Avery]\nA line');
	});

	it('recognizes roster aliases and preserves indentation before the label', () => {
		const text = '[Verse]\n  [Both] Together now';
		const [finding] = checkRule(rule, text);
		expect(markedText(text, [finding!])).toEqual(['[Both]']);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Verse]\n  Together now');
	});

	it('accepts unknown bracketed words and ordinary lyric lines', () => {
		expect(checkRule(rule, '[Verse: Avery]\n[Maybe] A line', { performers: ['Avery'] })).toEqual(
			[]
		);
		expect(checkRule(rule, '[Verse: Avery]\nA line', { performers: ['Avery'] })).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { performerHeaderRequiredRule as rule } from './performer-header-required.js';

describe('performer.header-required', () => {
	it('anchors on the header name and removes all supported performer wrappers', () => {
		const text = '[Verse]\n<i>Second voice</i> and <b>third voice</b>';
		const [finding] = checkRule(rule, text, { performers: ['A', 'B'] });

		expect(markedText(text, [finding!])).toEqual(['Verse']);
		expect(finding).toMatchObject({
			message: 'Styled vocals need a performer legend.',
			fixes: [
				{
					kind: 'safe',
					label: 'Remove performer formatting',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse]\nSecond voice and third voice'
		);
	});

	it('uses a zero-width section start when the document has no header', () => {
		const text = '<i>Second voice</i>';
		const [finding] = checkRule(rule, text, { performers: ['A', 'B'] });
		expect(finding).toMatchObject({ from: 0, to: 0 });
	});

	it('requires a multi-performer roster and accepts an existing legend', () => {
		expect(checkRule(rule, '[Verse]\n<i>Only voice</i>', { performers: ['A'] })).toEqual([]);
		expect(
			checkRule(rule, '[Verse: A & <i>B</i>]\n<i>Second voice</i>', {
				performers: ['A', 'B']
			})
		).toEqual([]);
	});
});

import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { performerRedundantMarkupRule as rule } from './performer-redundant-markup.js';

describe('performer.redundant-markup', () => {
	it('marks and merges adjacent same-slot wrappers on one line', () => {
		const text = '[Verse: A & <i>B</i>]\n<i>First</i> <i>second</i>';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['</i> <i>']);
		expect(finding).toMatchObject({
			message: 'Adjacent performer formatting can be merged.',
			fixes: [
				{
					kind: 'safe',
					label: 'Merge adjacent formatting',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse: A & <i>B</i>]\n<i>First second</i>'
		);
	});

	it('merges the same slot across one physical line ending', () => {
		const text = '[Verse: A & <i>B</i>]\n<i>First</i>\n<i>Second</i>';
		const [finding] = checkRule(rule, text);
		expect(markedText(text, [finding!])).toEqual(['</i>\n<i>']);
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse: A & <i>B</i>]\n<i>First\nSecond</i>'
		);
	});

	it('accepts different slots, plain-slot text, and separated wrappers', () => {
		expect(checkRule(rule, '[Verse]\n<i>First</i> and <i>second</i>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<i>First</i> <b>second</b>')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nPlain text')).toEqual([]);
	});
});

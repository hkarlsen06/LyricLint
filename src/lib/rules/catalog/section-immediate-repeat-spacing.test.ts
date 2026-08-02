import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { sectionImmediateRepeatSpacingRule as rule } from './section-immediate-repeat-spacing.js';

describe('section.immediate-repeat-spacing', () => {
	it('marks the second identical header and joins the copies under the first', () => {
		const text = '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTonight';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['[Chorus]']);
		expect(finding).toMatchObject({
			message: 'Keep an immediately repeated song part under one header.',
			fixes: [
				{
					kind: 'safe',
					label: 'Join exact repeated part',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Chorus]\nAgain\nTonight\nAgain\nTonight'
		);
	});

	it('marks the separator for an exact headerless repeat', () => {
		const text = '[Chorus]\nAgain\nTonight\n\nAgain\nTonight';
		expect(markedText(text, checkRule(rule, text))).toEqual(['\n\n']);
	});

	it('accepts changed bodies, differing headers, and unsupported markup', () => {
		expect(checkRule(rule, '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTomorrow')).toEqual([]);
		expect(checkRule(rule, '[Chorus]\nAgain\n\n[Verse]\nAgain')).toEqual([]);
		expect(checkRule(rule, '[Chorus]\n<u>Again</u>\n\n[Chorus]\n<u>Again</u>')).toEqual([]);
	});
});

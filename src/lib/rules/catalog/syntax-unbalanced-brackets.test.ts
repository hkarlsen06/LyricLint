import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { syntaxUnbalancedBracketsRule as rule } from './syntax-unbalanced-brackets.js';

describe('syntax.unbalanced-brackets', () => {
	it('anchors at the line-end insertion point and inserts the missing closing bracket', () => {
		const text = '[Verse\nLine';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['']);
		expect(finding).toMatchObject({
			from: text.indexOf('\n'),
			to: text.indexOf('\n'),
			message: 'Section header has unbalanced brackets.',
			fixes: [
				{
					kind: 'safe',
					label: 'Insert the missing closing bracket',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Verse]\nLine');
	});

	it('reports an uneven delimiter count in a closed parsed header without guessing a fix', () => {
		const text = '[[Verse]\nLine';
		const [finding] = checkRule(rule, text);
		expect(markedText(text, [finding!])).toEqual(['[[Verse]']);
		expect(finding?.message).toBe('Section header has unbalanced brackets.');
		expect(finding?.fixes).toBeUndefined();
	});

	it('accepts balanced headers and brackets in lyric text', () => {
		expect(checkRule(rule, '[Verse]\nLine')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nA bracket [ in a lyric')).toEqual([]);
	});
});

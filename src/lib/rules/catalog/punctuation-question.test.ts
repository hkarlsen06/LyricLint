import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { punctuationQuestionRule as rule } from './punctuation-question.js';

describe('punctuation.question', () => {
	it('inserts a question mark at the zero-width end of a clear question', () => {
		const text = '[Verse]\nWhere are you';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['']);
		expect(finding).toMatchObject({
			from: text.length,
			to: text.length,
			message: 'This clearly interrogative line may need a question mark.',
			fixes: [
				{
					kind: 'preview',
					label: 'Add a question mark',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Verse]\nWhere are you?');
	});

	it('places the insertion inside closing markup and before trailing whitespace', () => {
		const text = '[Verse]\n<i>How do you know</i>   ';
		const [finding] = checkRule(rule, text);
		expect(text.slice((finding?.from ?? 0) - 4, finding?.from)).toBe('know');
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Verse]\n<i>How do you know?</i>   '
		);
	});

	it('accepts punctuated, hedged, and unsupported-markup lines', () => {
		expect(checkRule(rule, '[Verse]\nWhere are you?')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nWhere are you—')).toEqual([]);
		expect(checkRule(rule, '[Verse]\nI wonder why')).toEqual([]);
		expect(checkRule(rule, '[Verse]\n<u>Where are you</u>')).toEqual([]);
	});
});

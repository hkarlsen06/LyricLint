import { describe, expect, it } from 'vitest';
import { applyEdits, checkRule, markedText, testRevision } from '../rule-test-utils.js';
import { sectionDeprecatedHookRule as rule } from './section-deprecated-hook.js';

describe('section.deprecated-hook', () => {
	it('marks Hook and offers both reviewed replacements', () => {
		const text = '[Hook: Avery]\nSing it';
		const [finding] = checkRule(rule, text);

		expect(markedText(text, [finding!])).toEqual(['Hook']);
		expect(finding).toMatchObject({
			message: 'The [Hook] section name is deprecated.',
			fixes: [
				{ kind: 'preview', label: 'Replace with Chorus', edit: { baseRevision: testRevision } },
				{ kind: 'preview', label: 'Replace with Refrain', edit: { baseRevision: testRevision } }
			]
		});
		expect(finding?.fixes?.map((fix) => applyEdits(text, fix.edit.edits))).toEqual([
			'[Chorus: Avery]\nSing it',
			'[Refrain: Avery]\nSing it'
		]);
	});

	it('matches case-insensitively while preserving the exact marked text', () => {
		const text = '[hook]\nSing it';
		expect(markedText(text, checkRule(rule, text))).toEqual(['hook']);
	});

	it('accepts current English terms and languages whose reviewed pack includes Hook', () => {
		expect(checkRule(rule, '[Chorus]\nSing it')).toEqual([]);
		expect(checkRule(rule, '[Hook]\nText', { language: 'de' })).toEqual([]);
	});
});

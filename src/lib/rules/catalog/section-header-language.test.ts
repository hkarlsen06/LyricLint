import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
import { sectionHeaderLanguageRule as rule } from './section-header-language.js';

describe('section.header-language', () => {
	it('normalizes a recognized header to its reviewed capitalization', () => {
		const input = '[bridge]\nA lyric';
		const findings = checkRule(rule, input);

		expect(markedText(input, findings)).toEqual(['bridge']);
		expect(findings[0]).toMatchObject({
			message: 'Use the reviewed capitalization “Bridge”.',
			fixes: [{ kind: 'safe', label: 'Use Bridge' }]
		});
		expect(applyRuleFixes(rule, input)).toBe('[Bridge]\nA lyric');
	});

	it('preserves a correctly capitalized reviewed header', () => {
		expect(checkRule(rule, '[Bridge]\nA lyric')).toEqual([]);
	});

	it('normalizes only the name and preserves an ordinal and performer legend', () => {
		expect(applyRuleFixes(rule, '[pre-chorus 2: Avery]\nA lyric')).toBe(
			'[Pre-Chorus 2: Avery]\nA lyric'
		);
	});
});

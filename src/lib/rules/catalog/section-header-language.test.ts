import { describe, expect, it } from 'vitest';
import { applyEdits, applyRuleFixes, checkRule, markedText } from '../rule-test-utils.js';
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

	it.each([
		['ar', 'Bridge', ['جسر']],
		['de', 'Verse', ['Part', 'Strophe']],
		['de', 'Pre-Chorus', ['Pre-Hook', 'Pre-Refrain']],
		['es', 'Chorus', ['Coro', 'Estribillo']],
		['es', 'Interlude', ['Interludio']],
		['fr', 'Pre-Chorus', ['Pré-refrain']],
		['fr', 'Instrumental Break', ['Pause instrumentale', 'Coupure']],
		['ja', 'Couplet', ['Verse']],
		['ko', 'Pont', ['Bridge', '브릿지']],
		['en', 'Intermède', ['Interlude']]
	] as const)('offers reviewed %s alternatives for %s', (language, input, replacements) => {
		const text = `[${input} 2: Avery]\nA lyric`;
		const findings = checkRule(rule, text, { language });
		expect(findings).toHaveLength(1);
		expect(findings[0].fixes?.map((fix) => fix.kind)).toEqual(replacements.map(() => 'preview'));
		expect(findings[0].fixes?.map((fix) => applyEdits(text, fix.edit.edits))).toEqual(
			replacements.map((replacement) => `[${replacement} 2: Avery]\nA lyric`)
		);
		for (const replacement of replacements) {
			expect(checkRule(rule, `[${replacement}]\nA lyric`, { language })).toEqual([]);
		}
	});
});

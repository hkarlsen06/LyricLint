import { describe, expect, it } from 'vitest';
import { symbolsSpecialCharactersRule as rule } from './symbols-special-characters.js';
import { checkRule, fixInserts, markedText } from '../rule-test-utils.js';

describe('symbols.special-characters', () => {
	it('previews the exact reviewed symbol replacements in English lyric text', () => {
		const text = '[Verse]\nYou & me at 37° under macy★s®';
		const findings = checkRule(rule, text);

		expect(markedText(text, findings)).toEqual(['&', '°', '★', '®']);
		expect(fixInserts(findings)).toEqual(['and', ' degrees', '', '']);
		expect(findings.every((finding) => finding.fixes?.[0]?.kind === 'preview')).toBe(true);
	});

	it('preserves compact brand symbols and avoids English replacements in other languages', () => {
		expect(checkRule(rule, '[Verse]\nH&M and su:m37°')).toEqual([]);
		expect(checkRule(rule, '[Couplet]\nToi & moi à 37°', { language: 'fr' })).toEqual([]);
	});

	it('skips lines containing unsupported markup', () => {
		expect(checkRule(rule, '[Verse]\n<u>You & me™</u>')).toEqual([]);
	});
});

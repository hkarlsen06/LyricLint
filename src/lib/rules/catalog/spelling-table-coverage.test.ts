import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { RuleContext, RuleDefinition } from '$lib/core/types.js';
import { sourceRegistry } from '../data/sources.js';
import {
	replacements as arabicReplacements,
	spellingArabicCommonRule
} from './spelling-arabic-common.js';
import {
	replacements as englishReplacements,
	spellingEnglishCommonRule
} from './spelling-english-common.js';
import {
	corrections as frenchCorrections,
	spellingFrenchCommonRule
} from './spelling-french-common.js';
import {
	replacements as germanReplacements,
	spellingGermanCommonRule
} from './spelling-german-common.js';
import {
	replacements as japaneseReplacements,
	spellingJapaneseCommonRule
} from './spelling-japanese-common.js';
import {
	replacements as koreanReplacements,
	spellingKoreanCommonRule
} from './spelling-korean-common.js';
import {
	replacements as norwegianReplacements,
	spellingNorwegianCommonRule
} from './spelling-norwegian-common.js';
import {
	replacements as spanishReplacements,
	spellingSpanishCommonRule
} from './spelling-spanish-common.js';

interface SpellingTable {
	language: string;
	rule: RuleDefinition;
	replacements: Readonly<Record<string, string>>;
}

const tables: SpellingTable[] = [
	{ language: 'en', rule: spellingEnglishCommonRule, replacements: englishReplacements },
	{ language: 'no', rule: spellingNorwegianCommonRule, replacements: norwegianReplacements },
	{ language: 'de', rule: spellingGermanCommonRule, replacements: germanReplacements },
	{ language: 'es', rule: spellingSpanishCommonRule, replacements: spanishReplacements },
	{ language: 'fr', rule: spellingFrenchCommonRule, replacements: frenchCorrections },
	{ language: 'ar', rule: spellingArabicCommonRule, replacements: arabicReplacements },
	{ language: 'ja', rule: spellingJapaneseCommonRule, replacements: japaneseReplacements },
	{ language: 'ko', rule: spellingKoreanCommonRule, replacements: koreanReplacements }
];

describe.each(tables)('$rule.id spelling table coverage', ({ language, rule, replacements }) => {
	it.each(Object.keys(replacements))('matches the table key %s', (key) => {
		const context: RuleContext = {
			language,
			performers: [],
			sources: sourceRegistry,
			ruleSetVersion: '2026.07.24.4',
			revision: 1
		};

		expect(rule.check(parseDocument(`[Verse]\n${key}`), context)).toHaveLength(1);
	});
});

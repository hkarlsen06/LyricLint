import { sectionHeaderLanguageRule } from './section-header-language.js';
import { sectionHeaderUnrecognizedRule } from './section-header-unrecognized.js';
import { describe, expect, it } from 'vitest';
import {
	applyEdits,
	applyRuleFixes,
	checkRule,
	markedText,
	testRevision
} from '../rule-test-utils.js';
import { sectionLocalizedHeaderPreferenceRule as rule } from './section-localized-header-preference.js';

describe('section.localized-header-preference', () => {
	it('replaces an English Norwegian header while preserving ordinal and legend', () => {
		const text = '[Chorus 2: Ane]\nEn natt';
		const [finding] = checkRule(rule, text, { language: 'no' });

		expect(markedText(text, [finding!])).toEqual(['Chorus']);
		expect(finding).toMatchObject({
			message: 'Use the reviewed Norwegian header “Refreng” instead of “Chorus”.',
			fixes: [
				{
					kind: 'safe',
					label: 'Use Refreng',
					edit: { baseRevision: testRevision }
				}
			]
		});
		expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe(
			'[Refreng 2: Ane]\nEn natt'
		);
	});

	it('normalizes accents and an adjacent transposition to the sourced Bridge preference', () => {
		for (const header of ['Brídge', 'Brigde']) {
			const text = `[${header}]\nEn natt`;
			const [finding] = checkRule(rule, text, { language: 'no' });
			expect(markedText(text, [finding!])).toEqual([header]);
			expect(finding?.message).toBe(
				`Use the reviewed Norwegian header “Bro” instead of “${header}”.`
			);
			expect(applyEdits(text, finding?.fixes?.[0]?.edit.edits ?? [])).toBe('[Bro]\nEn natt');
		}
	});

	it('accepts localized headers and does not apply outside Norwegian', () => {
		expect(checkRule(rule, '[Bro]\nEn natt', { language: 'no' })).toEqual([]);
		expect(checkRule(rule, '[Bridge]\nA night', { language: 'en' })).toEqual([]);
	});
});

it.each(['', 'Pre-Chorus', 'Post-Chorus'])(
	'localizes Refrain using the Norwegian chorus convention with %s',
	(affix) => {
		const prefix = affix ? `[${affix}]\nEn natt\n\n` : '';
		const text = `${prefix}[Refrain: Ane]\nEn dag`;
		const localized = applyRuleFixes(sectionHeaderLanguageRule, text, { language: 'no' });
		expect(localized).toBe(`${prefix}[Refreng: Ane]\nEn dag`);
		const fixed = applyRuleFixes(rule, localized, { language: 'no' });
		expect(fixed).toBe(`${prefix}[${affix ? 'Chorus' : 'Refreng'}: Ane]\nEn dag`);
		expect(checkRule(rule, fixed, { language: 'no' })).toEqual([]);
	}
);

const affixes = [
	['Pre-Chorus', 'Pre-Chorus'],
	['Post-Chorus', 'Post-Chorus'],
	['prerefreng', 'Pre-Chorus'],
	['pre-refreng', 'Pre-Chorus'],
	['førrefreng', 'Pre-Chorus'],
	['før-refreng', 'Pre-Chorus'],
	['postrefreng', 'Post-Chorus'],
	['post-refreng', 'Post-Chorus'],
	['etter-refreng', 'Post-Chorus'],
	['etterrefreng', 'Post-Chorus']
];

it.each([
	['Omkved', 'Refreng'],
	['Avslutning', 'Outro'],
	['Åpning', 'Intro'],
	['Bridge', 'Bro'],
	['Interlude', 'Mellomspill']
])('normalizes the Norwegian alias %s without duplicate findings', (name, replacement) => {
	const text = `[${name.toUpperCase()} 2: Ane]\n${name}`;
	const [finding] = checkRule(rule, text, { language: 'no' });
	expect(finding?.fixes?.[0]?.kind).toBe('safe');
	const fixed = applyRuleFixes(rule, text, { language: 'no' });
	expect(fixed).toBe(`[${replacement} 2: Ane]\n${name}`);
	for (const candidate of [sectionHeaderLanguageRule, sectionHeaderUnrecognizedRule]) {
		expect(checkRule(candidate, text, { language: 'no' })).toEqual([]);
		expect(checkRule(candidate, fixed, { language: 'no' })).toEqual([]);
	}
	expect(checkRule(rule, fixed, { language: 'no' })).toEqual([]);
	expect(checkRule(rule, text, { language: 'en' })).toEqual([]);
});

it.each(affixes)('changes Omkved directly to Chorus with %s', (input) => {
	const text = `[Omkved: Ane]\nEn natt\n\n[${input}]\nEn dag`;
	const fixed = applyRuleFixes(rule, text, { language: 'no' });
	expect(fixed).toMatch(/^\[Chorus: Ane\]/u);
	expect(checkRule(rule, fixed, { language: 'no' })).toEqual([]);
});

it.each(affixes)('uses Chorus with %s and normalizes the affix in one pass', (input, canonical) => {
	const text = `[Refreng 2: Ane]\nEn natt\n\n[${input.toUpperCase()} 1: Bo]\nVi går\n\n[Chorus]\nEn dag`;
	const findings = checkRule(rule, text, { language: 'no' });
	expect(findings[0]).toMatchObject({ sourceIds: ['G-NO-CHORUS'], settlesOn: 'document' });
	const languageFindings = checkRule(sectionHeaderLanguageRule, text, { language: 'no' });
	const fixed = applyEdits(
		text,
		[...findings, ...languageFindings].flatMap((f) => f.fixes?.[0]?.edit.edits ?? [])
	);
	expect(fixed).toBe(
		`[Chorus 2: Ane]\nEn natt\n\n[${canonical} 1: Bo]\nVi går\n\n[Chorus]\nEn dag`
	);
	expect(checkRule(rule, fixed, { language: 'no' })).toEqual([]);
	expect(checkRule(sectionHeaderUnrecognizedRule, text, { language: 'no' })).toEqual([]);
	expect(languageFindings).toHaveLength(input === canonical ? 1 : 0);
	expect(checkRule(rule, text, { language: 'en' })).toEqual([]);
});

it('uses Refreng without affix headers, ignoring lyric and performer mentions', () => {
	const text = '[Chorus: Pre-Chorus]\nPost-Chorus\n\n[Refreng]\nEn natt';
	const findings = checkRule(rule, text, { language: 'no' });
	expect(findings).toHaveLength(1);
	expect(applyEdits(text, findings[0].fixes![0].edit.edits)).toBe(
		'[Refreng: Pre-Chorus]\nPost-Chorus\n\n[Refreng]\nEn natt'
	);
	expect(checkRule(rule, '[Refrain]\nEn natt', { language: 'no' })).toEqual([]);
});

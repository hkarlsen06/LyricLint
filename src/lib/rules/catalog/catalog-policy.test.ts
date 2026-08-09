import { beforeAll, describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { PerformerRecord, RuleContext } from '$lib/core/types.js';
import { loadStatisticalLanguageDetector } from '$lib/languages/detect.js';
import { getRule } from '../registry.js';
import { sourceRegistry } from '../data/sources.js';
// The cases live in a module of their own because the public rule reference
// derives its pages from the same examples this suite verifies. See
// `policy-cases.ts` for why the two consumers must not have separate copies.
import { policyCases as cases, type RulePolicyCase } from './policy-cases.js';

beforeAll(() => loadStatisticalLanguageDetector());

function records(names: string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `p-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase('en'),
		aliases: [],
		colorId: `c-${order}`,
		order
	}));
}

function lint(caseData: RulePolicyCase, text: string, ambiguous = false): number {
	const rule = getRule(caseData.id);
	if (!rule) {
		throw new Error(`Missing enabled rule ${caseData.id}`);
	}
	let performerNames = caseData.performers ?? ['A'];
	if (caseData.id === 'performer.header-required' && ambiguous) {
		performerNames = ['A'];
	}
	const context: RuleContext = {
		language: caseData.language ?? 'en',
		performers: records(performerNames),
		sources: sourceRegistry,
		ruleSetVersion: '2026.07.24.4',
		revision: 12
	};
	return rule.check(parseDocument(text), context).length;
}

describe('every enabled rule has valid, invalid, and ambiguous policy coverage', () => {
	it.each(cases)('$id', (caseData) => {
		expect(lint(caseData, caseData.invalid), 'invalid example').toBeGreaterThan(0);
		expect(lint(caseData, caseData.valid), 'valid example').toBe(0);
		expect(lint(caseData, caseData.ambiguous, true), 'ambiguous example').toBe(0);
	});

	it('keeps UTF-16 diagnostic ranges exact after astral characters and markup', () => {
		const input = '[Verse]\n🌙 <i>“Hello”</i>';
		const rule = getRule('quotes.typewriter');
		if (!rule) {
			throw new Error('Missing quotes.typewriter');
		}
		const context: RuleContext = {
			language: 'en',
			performers: records(['A']),
			sources: sourceRegistry,
			ruleSetVersion: '2026.07.24.4',
			revision: 12
		};
		const diagnostics = rule.check(parseDocument(input), context);
		expect(diagnostics.map((item) => input.slice(item.from, item.to))).toEqual(['“', '”']);
	});
});

const englishGatedRuleIds = new Set([
	'contraction.apostrophe',
	'grammar.english-pronoun-i',
	'numbers.decade-apostrophe',
	'numbers.spell-out',
	'spelling.english-common',
	'spelling.texting-shorthand'
]);

describe.each(['en-US', 'en-GB'])('English policy coverage under %s', (language) => {
	it.each(cases.filter((caseData) => englishGatedRuleIds.has(caseData.id)))('$id', (caseData) => {
		for (const [label, text, ambiguous] of [
			['invalid', caseData.invalid, false],
			['valid', caseData.valid, false],
			['ambiguous', caseData.ambiguous, true]
		] as const) {
			expect(lint({ ...caseData, language }, text, ambiguous), label).toBe(
				lint({ ...caseData, language: 'en' }, text, ambiguous)
			);
		}
	});
});

describe('rule regressions', () => {
	function diagnostics(id: string, text: string, language = 'en', performers: string[] = []) {
		const rule = getRule(id);
		if (!rule) {
			throw new Error(`Missing enabled rule ${id}`);
		}
		const context: RuleContext = {
			language,
			performers: records(performers),
			sources: sourceRegistry,
			ruleSetVersion: '2026.07.24.4',
			revision: 12
		};
		return rule.check(parseDocument(text), context);
	}

	it('requires every legend group to use its exact positional style slot', () => {
		expect(diagnostics('performer.style-order', '[Chorus: A & <b>B</b>]\nLine')).toHaveLength(1);
	});

	it('reports inline styles missing from the legend even with an empty roster', () => {
		expect(diagnostics('performer.inline-mismatch', '[Verse: A]\n<i>Voice</i>')).toHaveLength(1);
	});

	it('does not apply English lexical rules to non-English documents', () => {
		expect(diagnostics('contraction.apostrophe', '[Strophe]\nIm Haus', 'de')).toEqual([]);
		expect(diagnostics('numbers.spell-out', '[Vers]\nJeg har 5 grunner', 'no')).toEqual([]);
	});

	it('carries the detected language as a direct resolution for a mismatch', () => {
		const [finding] = diagnostics(
			'language.selection-mismatch',
			'[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir'
		);
		expect(finding?.detectedLanguage).toEqual({
			tag: 'fr',
			displayName: 'French'
		});
	});

	it.each([
		['ar', '[Verse]\nكلمات', 'المقطع'],
		['de', '[Verse]\nText', 'Part'],
		['es', '[Verse]\nLetra', 'Verso'],
		['fr', '[Verse]\nParoles', 'Couplet']
	])('uses the reviewed %s header vocabulary', (language, input, replacement) => {
		const [finding] = diagnostics('section.header-language', input, language);
		expect(finding?.fixes?.map((fix) => fix.edit.edits[0]?.insert)).toContain(replacement);
	});

	it('sends unknown header names to manual review without guessing a replacement', () => {
		const [finding] = diagnostics('section.header-unrecognized', '[Chor]\nEn natt', 'no');
		expect(finding).toMatchObject({
			severity: 'manual-review',
			from: 1,
			to: 5,
			message: 'Review the custom section header “Chor”.'
		});
		expect(finding?.sourceIds.slice(0, 2)).toEqual(['G-SECTIONS', 'G-LANG-NO']);
		expect(finding?.fixes).toBeUndefined();
	});

	it('leaves an unnamed header to section.header-empty rather than reviewing it', () => {
		// One card, not two, and not the wrong one. `Review the custom section
		// header “”` quoted nothing back at the user and offered `It's correct`
		// about it, which is the first thing anybody typing a header met.
		for (const input of ['[]\nA lyric', '[ ]\nA lyric', '[: Ari]\nA lyric', '[\nA lyric']) {
			expect(diagnostics('section.header-unrecognized', input), input).toEqual([]);
		}
		expect(diagnostics('section.header-empty', '[]\nA lyric')).toHaveLength(1);
		// A section that has a header line, empty or not, is not a section with
		// none — so the two picker findings never both fire on one line.
		expect(diagnostics('section.header-missing', '[]\nA lyric')).toEqual([]);
	});

	it('accepts the optional quoted title header on a non-English song', () => {
		expect(
			diagnostics('section.header-unrecognized', '[Letra de “Chantaje” ft. Maluma]\nHola', 'es')
		).toEqual([]);
		expect(
			diagnostics(
				'section.header-unrecognized',
				'[Intro]\nHola\n\n[Letra de “Chantaje” ft. Maluma]\nMás',
				'es'
			)
		).toHaveLength(1);
	});

	it('does not duplicate the language warning for a header recognized in another reviewed pack', () => {
		expect(diagnostics('section.header-unrecognized', '[Verse]\nEn natt', 'no')).toEqual([]);
		expect(diagnostics('section.header-language', '[Verse]\nEn natt', 'no')).toHaveLength(1);
	});

	it.each([
		['Chorus', 'Refreng'],
		['Bridge', 'Bro']
	])('prefers the localized Norwegian header %s → %s', (input, replacement) => {
		const [finding] = diagnostics(
			'section.localized-header-preference',
			`[${input}: Ane]\nEn natt`,
			'no'
		);
		expect(finding).toMatchObject({
			severity: 'suggestion',
			message: `Use the reviewed Norwegian header “${replacement}” instead of “${input}”.`
		});
		expect(finding?.explanation).toContain(
			`recognizes “${replacement}” as the Norwegian term for “${input}”`
		);
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'safe',
			label: `Use ${replacement}`,
			edit: { edits: [{ insert: replacement }] }
		});
	});

	it.each(['Bridge', 'Brídge', 'Brigde'])(
		'routes a Norwegian %s header to the sourced Bro action, not custom-header review',
		(header) => {
			const input = `[${header}: Mul]\nEn natt`;
			const [finding] = diagnostics('section.localized-header-preference', input, 'no');

			expect(diagnostics('section.header-unrecognized', input, 'no')).toEqual([]);
			expect(finding).toMatchObject({
				message: `Use the reviewed Norwegian header “Bro” instead of “${header}”.`,
				sourceIds: ['G-LANG-PURPOSE', 'G-LANG-NO'],
				fixes: [
					{
						kind: 'safe',
						label: 'Use Bro',
						edit: { edits: [{ from: 1, to: 7, insert: 'Bro' }] }
					}
				]
			});
		}
	);

	it('does not duplicate the Norwegian Bridge preference as a language warning', () => {
		expect(diagnostics('section.header-language', '[Bridge]\nEn natt', 'no')).toEqual([]);
		expect(diagnostics('section.localized-header-preference', '[Bridge]\nA night', 'en')).toEqual(
			[]
		);
	});

	it('accepts English headers for Japanese pages and both Korean policies', () => {
		expect(diagnostics('section.header-language', '[Verse]\n歌詞', 'ja')).toEqual([]);
		expect(diagnostics('section.header-language', '[Verse]\n가사', 'ko')).toEqual([]);
		expect(diagnostics('section.header-language', '[벌스]\n가사', 'ko')).toEqual([]);
	});

	it('keeps German genre alternatives and does not apply the English Hook deprecation', () => {
		expect(diagnostics('section.header-language', '[Part]\nText', 'de')).toEqual([]);
		expect(diagnostics('section.header-language', '[Strophe]\nText', 'de')).toEqual([]);
		expect(diagnostics('section.header-language', '[Hook]\nText', 'de')).toEqual([]);
		expect(diagnostics('section.deprecated-hook', '[Hook]\nText', 'de')).toEqual([]);
		expect(diagnostics('section.deprecated-hook', '[Hook]\nWords', 'en')).toHaveLength(1);
	});

	it('recognizes a header-shaped sound effect as ambiguous sound notation', () => {
		expect(diagnostics('sound-effect.asterisks', '[applause]')).toHaveLength(1);
	});

	it.each(['[Chorus x2]', '[Chorus x 2]', '[Chorus (x2)]'])(
		'reports repetition counts from the raw header name: %s',
		(input) => {
			expect(diagnostics('repeat.placeholder', input)).toHaveLength(1);
		}
	);

	it.each(['[Repeat Chorus]', '[Chorus 2x]', '(Repeat chorus)', 'Chorus (x2)'])(
		'reports additional exact repetition placeholders: %s',
		(input) => {
			expect(diagnostics('repeat.placeholder', input)).toHaveLength(1);
		}
	);

	it.each(['[???]', '[ ???? ]', '(??)'])(
		'normalizes exact unknown-marker variants: %s',
		(marker) => {
			expect(diagnostics('unknown.marker', `[Verse]\nI heard ${marker}`)).toHaveLength(1);
		}
	);

	it('does not treat an exact headerless repeat as a missing-header section', () => {
		const input = '[Chorus]\nAgain\nTonight\n\nAgain\nTonight';
		expect(diagnostics('section.header-missing', input)).toEqual([]);
		expect(diagnostics('section.immediate-repeat-spacing', input)).toHaveLength(1);
	});

	it('does not call a section headerless when it leads with a written-out label', () => {
		// The two cards read as contradictory — one denying the header the other
		// is quoting — and the one carrying the exact one-press fix was second.
		const input = 'Verse 1:\nFirst line\n\nChorus:\nSecond line';
		expect(diagnostics('section.header-missing', input)).toEqual([]);
		expect(diagnostics('section.header-prose', input).map((finding) => finding.message)).toEqual([
			'Write this section header as [Verse 1].',
			'Write this section header as [Chorus].'
		]);
	});

	it('does not call a section headerless when a bare reviewed name leads its lyric body', () => {
		const input = '[Bridge]\nFirst\n\nOutro\nLast';
		expect(diagnostics('section.header-missing', input)).toEqual([]);
		expect(diagnostics('section.header-prose', input)).toHaveLength(1);
	});

	it('still reports a headerless section whose label is further down it', () => {
		// Only the leading line is the section's own header. `Chorus:` further in
		// is a second finding about a different line, and both are true.
		const input = 'First line\nChorus:\nSecond line';
		expect(diagnostics('section.header-missing', input)).toHaveLength(1);
		expect(diagnostics('section.header-prose', input)).toHaveLength(1);
	});

	it('recognizes the label in the draft language before English', () => {
		expect(diagnostics('section.header-missing', 'Refreng:\nEn natt', 'no')).toEqual([]);
		// A name no reviewed pack knows is not a header, so the section has none.
		expect(diagnostics('section.header-missing', 'Breakdance 1:\nA lyric')).toHaveLength(1);
	});

	it('leaves missing-header choice to the contextual section picker', () => {
		const [finding] = diagnostics('section.header-missing', 'A lyric');
		expect(finding?.fixes).toBeUndefined();
		expect(finding?.explanation).toContain(
			'Genius does not allow blank lines to split one part into smaller stanzas.'
		);
	});

	it('previews blank-line removal on the blank line, not the lyric below it', () => {
		const [finding] = diagnostics('section.header-missing', '[Verse]\nFirst\n\nSecond');
		expect(finding?.relatedRanges).toEqual([{ from: 14, to: 15 }]);
		expect(finding?.fixes?.[0]?.edit.edits).toEqual([{ from: 14, to: 15, insert: '' }]);
	});

	it('does not merge changed lyrics or different performer legends', () => {
		expect(
			diagnostics(
				'section.immediate-repeat-spacing',
				'[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTomorrow'
			)
		).toEqual([]);
		expect(
			diagnostics(
				'section.immediate-repeat-spacing',
				'[Chorus: A]\nAgain\nTonight\n\n[Chorus: B]\nAgain\nTonight'
			)
		).toEqual([]);
	});

	it('preserves CRLF when joining an exact immediate repeat', () => {
		const input = '[Chorus]\r\nAgain\r\nTonight\r\n\r\n[Chorus]\r\nAgain\r\nTonight';
		const [finding] = diagnostics('section.immediate-repeat-spacing', input);
		const edit = finding?.fixes?.[0]?.edit.edits[0];
		expect(edit?.insert).toBe('\r\n');
	});

	it('merges adjacent same-style wrappers on one line', () => {
		expect(
			diagnostics('performer.redundant-markup', '[Verse: A & <i>B</i>]\n<i>First</i> <i>Second</i>')
		).toHaveLength(1);
	});

	it('leaves a label-only line to the header rules instead of emptying it', () => {
		// The line parses as a section header, so the label rule never sees it and
		// its removal fix can never leave a section-splitting blank line behind.
		expect(
			diagnostics('performer.line-label-forbidden', '[Verse: Avery]\n[Avery] \nA line', 'en', [
				'Avery'
			])
		).toEqual([]);
	});

	it('keeps indentation and the lyric when removing a line label', () => {
		const [finding] = diagnostics(
			'performer.line-label-forbidden',
			'[Verse: Avery]\n  [Avery]   A line',
			'en',
			['Avery']
		);
		expect(finding?.fixes?.[0]?.edit.edits).toEqual([{ from: 17, to: 27, insert: '' }]);
	});

	it('keeps a real ordinal section header clean', () => {
		expect(diagnostics('repeat.placeholder', '[Verse 2]')).toEqual([]);
	});
});

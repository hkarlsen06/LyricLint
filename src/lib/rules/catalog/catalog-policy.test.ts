import { describe, expect, it } from 'vitest';
import { parseDocument } from '$lib/core/parser.js';
import type { PerformerRecord, RuleContext } from '$lib/core/types.js';
import { getRule } from '../registry.js';
import { sourceRegistry } from '../data/sources.js';

interface RulePolicyCase {
	id: string;
	invalid: string;
	valid: string;
	ambiguous: string;
	language?: string;
	performers?: string[];
}

const cases: RulePolicyCase[] = [
	{
		id: 'syntax.unbalanced-brackets',
		invalid: '[Verse\nLine',
		valid: '[Verse]\nLine',
		ambiguous: '[Verse]\nA bracket [ in a lyric'
	},
	{
		id: 'syntax.unsupported-voice-markup',
		invalid: '[Verse]\n<u>Voice</u>',
		valid: '[Verse: A & <i>B</i>]\n<i>Voice</i>',
		ambiguous: '[Verse]\nAT&T'
	},
	{
		id: 'language.selection-mismatch',
		invalid: '[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir',
		valid:
			'[Verse]\nI see the morning light through every shadow\nAnd I know that you will stay with me tonight',
		ambiguous: '[Verse]\nOh yeah'
	},
	{ id: 'section.header-missing', invalid: 'A lyric', valid: '[Verse]\nA lyric', ambiguous: '   ' },
	{
		id: 'section.deprecated-hook',
		invalid: '[Hook]\nSing it',
		valid: '[Chorus]\nSing it',
		ambiguous: '[Verse]\nHook me with the melody'
	},
	{
		id: 'section.immediate-repeat-spacing',
		invalid: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTonight',
		valid: '[Chorus]\nAgain\nTonight\nAgain\nTonight',
		ambiguous: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTomorrow'
	},
	{
		id: 'section.verse-numbering',
		invalid: '[Chorus 2]\nAgain',
		valid: '[Verse 1]\nFirst\n\n[Verse 2]\nSecond',
		ambiguous: '[Verse]\nFirst\n\n[Verse]\nSecond'
	},
	{
		id: 'section.header-language',
		invalid: '[Verse]\nEn natt',
		valid: '[Vers]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
		language: 'no'
	},
	{
		id: 'section.localized-header-preference',
		invalid: '[Chorus]\nEn natt',
		valid: '[Refreng]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
		language: 'no'
	},
	{
		id: 'section.header-unrecognized',
		invalid: '[Chor]\nEn natt',
		valid: '[Refreng]\nEn natt',
		ambiguous: 'En natt',
		language: 'no'
	},
	{
		id: 'performer.header-required',
		invalid: '[Verse]\n<i>Second voice</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>Second voice</i>',
		ambiguous: '[Verse]\n<i>Only voice</i>',
		performers: ['A', 'B']
	},
	{
		id: 'performer.style-order',
		invalid: '[Chorus: A, <b>B</b> & <i>C</i>]\nLine',
		valid: '[Chorus: A, <i>B</i> & <b>C</b>]\nLine',
		ambiguous: '[Chorus: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine'
	},
	{
		id: 'performer.redundant-markup',
		invalid: '[Verse: A & <i>B</i>]\n<i>First</i>\n<i>Second</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>First\nSecond</i>',
		ambiguous: '[Verse: A & <i>B</i>]\n<i>First</i>\nPlain\n<i>Second</i>'
	},
	{
		id: 'performer.unused-legend-slot',
		invalid: '[Verse: A & <i>B</i>]\nOnly A sings',
		valid: '[Verse: A & <i>B</i>]\nA sings\n<i>B sings</i>',
		ambiguous: '[Verse: A & <i>B</i>]\n<u>Unknown markup</u>'
	},
	{
		id: 'performer.inline-mismatch',
		invalid: '[Verse: A]\n<i>Voice</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>Voice</i>',
		ambiguous: '[Verse: A]\n<u>Unknown markup</u>',
		performers: ['A', 'B']
	},
	{
		id: 'performer.too-many-groups',
		invalid: '[Verse: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine',
		valid: '[Verse: A, <i>B</i>, <b>C</b> & <i><b>D</b></i>]\nLine',
		ambiguous: '[Verse: A & B, <i>C</i>]\nLine'
	},
	{
		id: 'performer.line-label-forbidden',
		invalid: '[Verse: Avery]\n[Avery] A line',
		valid: '[Verse: Avery]\nA line',
		ambiguous: '[Verse: Avery]\n[Maybe] A line',
		performers: ['Avery']
	},
	{
		id: 'spelling.standardized',
		invalid: '[Verse]\nImma go',
		valid: "[Verse]\nI'ma go",
		ambiguous: '[Verse]\nMy cuz came'
	},
	{
		id: 'spelling.language-variant',
		invalid: "[Verse]\nStay 'til dawn",
		valid: '[Verse]\nStay till dawn',
		ambiguous: '[Verse]\nCoins fill the till',
		language: 'en-GB'
	},
	{
		id: 'quotes.typewriter',
		invalid: '[Verse]\n“Hello”',
		valid: '[Verse]\n"Hello"',
		ambiguous: '[Verse]\n<u>“Hello”</u>'
	},
	{
		id: 'contraction.apostrophe',
		invalid: '[Verse]\nDont go',
		valid: "[Verse]\nDon't go",
		ambiguous: '[Verse]\nIll will fades'
	},
	{
		id: 'unknown.marker',
		invalid: '[Verse]\nI heard (?)',
		valid: '[Verse]\nI heard [?]',
		ambiguous: '[Verse]\nI heard ???'
	},
	{
		id: 'repeat.placeholder',
		invalid: '[Chorus x2]\nWords',
		valid: '[Chorus]\nWords again',
		ambiguous: '[Verse]\nI repeat chorus melodies'
	},
	{
		id: 'sound-effect.asterisks',
		invalid: '[Verse]\n{laughs}',
		valid: '[Verse]\n*laughs*',
		ambiguous: '[Verse]\n{roses}'
	},
	{
		id: 'censored.mask',
		invalid: '[Verse]\nf*** this',
		valid: '[Verse]\n**** this',
		ambiguous: '[Verse]\n***'
	},
	{
		id: 'adlib.parentheses',
		invalid: '[Verse]\n(yeah)',
		valid: '[Verse]\n(Yeah)',
		ambiguous: '[Verse]\nYeah I know'
	},
	{
		id: 'capitalization.line-start',
		invalid: '[Verse]\nthe night is young',
		valid: '[Verse]\nThe night is young',
		ambiguous: '[Verse]\niPhone lights glow'
	},
	{
		id: 'capitalization.title-case',
		invalid: '[Verse]\nThis Is The Way We Live\nEvery Single Word Starts Uppercase',
		valid: '[Verse]\nThis is the way we live\nEvery single word starts normally',
		ambiguous: '[Verse]\nThis Is One Deliberate Title'
	},
	{
		id: 'punctuation.line-ending',
		invalid: '[Verse]\nA lyric line.',
		valid: '[Verse]\nA lyric line!',
		ambiguous: '[Verse]\nA lyric trails off...'
	},
	{
		id: 'punctuation.question',
		invalid: '[Verse]\nWhere are you',
		valid: '[Verse]\n<i>Where are you?</i>',
		ambiguous: '[Verse]\nI wonder why'
	},
	{
		id: 'punctuation.dropped-word-dash',
		invalid: '[Verse]\nA word—, then silence',
		valid: '[Verse]\nA word—then silence',
		ambiguous: '[Verse]\nA well--being note'
	},
	{
		id: 'line.prose-density',
		invalid:
			'[Verse]\nI walked into the room, and everyone was talking; the lights were fading, while another story started and nobody stopped to breathe before the ending arrived.',
		valid: '[Verse]\nA short lyric line',
		ambiguous:
			'[Verse]\nOne two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour'
	},
	{
		id: 'numbers.spell-out',
		invalid: '[Verse]\nI need 5 reasons',
		valid: '[Verse]\nI need five reasons',
		ambiguous: '[Verse]\nMeet at 5:30 with $5'
	}
];

function records(names: string[]): PerformerRecord[] {
	return names.map((displayName, order) => ({
		id: `p-${order}`,
		displayName,
		normalizedKey: displayName.toLocaleLowerCase(),
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
			message: `Prefer “${replacement}” over “${input}” in Norwegian lyrics.`
		});
		expect(finding?.explanation).toContain('preference, not an error');
		expect(finding?.fixes?.[0]).toMatchObject({
			kind: 'safe',
			label: `Use ${replacement}`,
			edit: { edits: [{ insert: replacement }] }
		});
	});

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

	it('leaves missing-header choice to the contextual section picker', () => {
		const [finding] = diagnostics('section.header-missing', 'A lyric');
		expect(finding?.fixes).toBeUndefined();
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

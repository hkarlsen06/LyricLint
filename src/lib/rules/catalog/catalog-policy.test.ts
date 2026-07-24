import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../core/parser.js';
import type { PerformerRecord, RuleContext } from '../../core/types.js';
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
	{ id: 'section.header-missing', invalid: 'A lyric', valid: '[Verse]\nA lyric', ambiguous: '   ' },
	{
		id: 'section.header-language',
		invalid: '[Verse]\nEn natt',
		valid: '[Vers]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
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
		valid: '[Verse]\nf**** this',
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
		ruleSetVersion: '2026.07.24.1'
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
			ruleSetVersion: '2026.07.24.1'
		};
		const diagnostics = rule.check(parseDocument(input), context);
		expect(diagnostics.map((item) => input.slice(item.from, item.to))).toEqual(['“', '”']);
	});
});

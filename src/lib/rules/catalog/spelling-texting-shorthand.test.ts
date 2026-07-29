import { describe, expect, it } from 'vitest';
import { applyRuleFixes, checkRule, fixInserts, markedText } from '../rule-test-utils.js';
import { contractionApostropheRule } from './contraction-apostrophe.js';
import { spellingStandardizedRule } from './spelling-standardized.js';
import { spellingTextingShorthandRule as rule } from './spelling-texting-shorthand.js';

describe('spelling.texting-shorthand', () => {
	it.each([
		['a line-initial initialism', 'Idk what to tell you', 'Idk', "I don't know what to tell you"],
		['a mid-line initialism', 'Say what you want, idc', 'idc', "Say what you want, I don't care"],
		['an all-caps initialism', 'IDK, I never asked', 'IDK', "I don't know, I never asked"],
		['a two-letter one', 'I need you rn', 'rn', 'I need you right now'],
		['a single letter', 'I need u tonight', 'u', 'I need you tonight'],
		['a slashed one', 'Rolling w/ my people', 'w/', 'Rolling with my people'],
		['the longer slashed one', 'Rolling w/o my people', 'w/o', 'Rolling without my people'],
		['one inside an ad-lib', 'Say it loud (tbh)', 'tbh', 'Say it loud (to be honest)']
	])('flags %s', (_label, lyric, shorthand, expanded) => {
		const input = `[Verse]\n${lyric}`;
		const diagnostics = checkRule(rule, input);

		expect(markedText(input, diagnostics)).toEqual([shorthand]);
		expect(applyRuleFixes(rule, input)).toBe(`[Verse]\n${expanded}`);
	});

	// The letters are the performance in all of these, so expanding one would be
	// the linter asserting something about a delivery it cannot hear. Two of them
	// are reviewed preferred spellings in their own right.
	it.each([
		['an initialism said aloud', 'Call me ASAP'],
		['another one', 'We in the VIP'],
		['a laugh', 'She said lol and left'],
		['a word the shorthand only starts', 'Under the urn'],
		['an apostrophe following the token', "U're the one"],
		['a hyphenated word', 'Pulled a U-turn on the freeway'],
		['a pronunciation spelling another rule owns', 'I know tho'],
		['the words already written out', "I don't know what to tell you"]
	])('leaves %s alone', (_label, lyric) => {
		expect(checkRule(rule, `[Verse]\n${lyric}`)).toHaveLength(0);
	});

	it('leaves a section header alone', () => {
		expect(checkRule(rule, '[Verse: U & A]\nA lyric')).toHaveLength(0);
	});

	// The roster is the one thing that can tell a rapper called IDK from somebody
	// writing the way they text, which is the same accommodation `harper.ts`
	// makes when it hands Harper the performer names.
	it('leaves a performer name alone', () => {
		const input = '[Verse]\nIDK on the track';

		expect(checkRule(rule, input)).toHaveLength(1);
		expect(checkRule(rule, input, { performers: ['IDK'] })).toHaveLength(0);
	});

	// Shorthand is conventionally capitalized, so the token's case says nothing
	// about the line. Only a leading capital survives into the expansion.
	it('never shouts the expansion back', () => {
		expect(fixInserts(checkRule(rule, '[Verse]\nTBH I MISS YOU'))).toEqual(['To be honest']);
		expect(fixInserts(checkRule(rule, '[Verse]\nI miss you tbh'))).toEqual(['to be honest']);
	});

	// Where the shorthand genuinely reads two ways, both wordings are offered
	// rather than one being guessed at.
	it('offers every wording a shorthand has', () => {
		const diagnostics = checkRule(rule, '[Verse]\nur all I need');

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0].message).toBe("Use “your” or “you're” instead of “ur”.");
		expect(fixInserts(diagnostics)).toEqual(['your', "you're"]);
	});

	// Nothing here may be swept up by a bulk fix: an artist who spells the
	// letters out is transcribed as they sing them.
	it('offers every expansion for review rather than mechanically', () => {
		const diagnostics = checkRule(rule, '[Verse]\nIdk what to tell you');

		expect(diagnostics[0].severity).toBe('suggestion');
		expect(diagnostics[0].fixes?.every((fix) => fix.kind === 'preview')).toBe(true);
	});

	it('says nothing about a document in another language', () => {
		expect(checkRule(rule, '[Vers]\nIdk what to tell you', { language: 'no' })).toHaveLength(0);
	});

	// Two rules over one span would be two cards arguing about it. Pronunciation
	// spellings and apostrophe-less contractions each already have an owner, and
	// this rule stays out of both.
	it('yields the neighbouring English rules their own tokens', () => {
		const pronunciation = '[Verse]\nI know tho';
		const contraction = '[Verse]\nI dont know';

		expect(checkRule(rule, pronunciation)).toHaveLength(0);
		expect(checkRule(spellingStandardizedRule, pronunciation)).toHaveLength(1);
		expect(checkRule(rule, contraction)).toHaveLength(0);
		expect(checkRule(contractionApostropheRule, contraction)).toHaveLength(1);
	});
});

import { describe, expect, it } from 'vitest';
import { lookupSpellingCandidates, standardizedSpellings } from './spelling.js';

function replacements(text: string, language = 'en-US'): string[] {
	return lookupSpellingCandidates(text, { language }).map((candidate) => candidate.replacement);
}

describe('standardized spelling data', () => {
	it('encodes every reviewed row, including accepted variants', () => {
		expect(standardizedSpellings).toHaveLength(29);
		expect(
			standardizedSpellings.find((entry) => entry.preferred.includes('shawty'))?.alternates
		).toEqual([]);
		expect(
			standardizedSpellings.find((entry) => entry.preferred.includes('alright'))?.alternates
		).toEqual([]);
		expect(
			standardizedSpellings.find((entry) => entry.preferred.includes('ayy'))?.commonMisspellings
		).toContain('ey');
	});

	it('respects word boundaries, case, punctuation, and literal HTML tokens', () => {
		expect(replacements('Imma, IMMA; Immaculate <Imma>')).toEqual(["I'ma", "I'MA"]);
		expect(replacements('O.K. skrt whoa')).toEqual(['Okay', 'skrrt', 'woah']);
		expect(replacements("'cause 'til lil' okay cream")).toEqual([]);
	});

	it('models cousin, tool, regional, and meaning exceptions', () => {
		expect(replacements('My cuz fixed the garden hoe')).toEqual([]);
		expect(replacements('Cuz I know that hoe')).toEqual(["'Cause", 'ho']);
		expect(replacements('I sharpened my hoe')).toEqual([]);
		expect(replacements('Stay til sunrise', 'en-US')).toEqual(["'til"]);
		expect(replacements('Stay til sunrise', 'en-GB')).toEqual([]);
	});

	it('preserves names and song-title contexts while recognizing money context', () => {
		expect(replacements('A$AP arrived ASAP')).toEqual([]);
		expect(replacements('A.S.A.P. Rocky')).toEqual(['A$AP']);
		expect(replacements('Wu-Tang made the song C.R.E.A.M.')).toEqual([]);
		expect(replacements('I stack money, C.R.E.A.M.')).toEqual(['cream']);
	});

	it('maps curated common misspellings to the reviewed spelling', () => {
		expect(
			replacements("im'a coz okey tryina ey eyy ayee thoe yall ya'll bougy whoah choper")
		).toEqual([
			"I'ma",
			"'cause",
			'okay',
			'tryna',
			'ayy',
			'ayy',
			'ayy',
			'though',
			"y'all",
			"y'all",
			'bougie',
			'woah',
			'chopper'
		]);
		expect(replacements('naieve niaive neive clichè clichê clichee')).toEqual([
			'naive',
			'naive',
			'naive',
			'cliché',
			'cliché',
			'cliché'
		]);
	});

	it('normalizes unambiguous acronym punctuation and casing', () => {
		expect(replacements('G.O.A.T G.O.A.Ts vip vips V.I.P V.I.Ps asap A.S.A.P H.A.M')).toEqual([
			'GOAT',
			'GOATs',
			'VIP',
			'VIPs',
			'VIP',
			'VIPs',
			'ASAP',
			'ASAP',
			'HAM'
		]);
	});

	it('does not report reviewed spellings or nearby real words', () => {
		expect(
			replacements("ayy okay y'all bougie woah chopper naive cliché a.k.a. GOAT VIP ASAP HAM")
		).toEqual([]);
		expect(replacements('hey skirt outta boogie Dogg shortie till garden hoe')).toEqual([]);
	});
});

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

	it('reads an edge apostrophe as part of the lil form rather than stacking a second one', () => {
		expect(replacements('my lil homie')).toEqual(["lil'"]);
		expect(
			lookupSpellingCandidates("my 'lil homie", { language: 'en-US' }).map((candidate) => [
				candidate.found,
				candidate.replacement
			])
		).toEqual([["'lil", "lil'"]]);
		expect(
			lookupSpellingCandidates('my ’lil homie', { language: 'en-US' }).map((candidate) => [
				candidate.found,
				candidate.replacement
			])
		).toEqual([['’lil', "lil'"]]);
		expect(replacements("my 'lil' homie")).toEqual([]);
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

	it('keeps the one-edit guesses to English drafts', () => {
		// Norwegian “tryne” (to faceplant) is one edit from “tryna” and a typo
		// of nothing, so the fuzzy pass stands down outside English.
		expect(replacements("Så i kveld så ska' vi tryne", 'no')).toEqual([]);
		expect(replacements('vi tryne', 'en')).toEqual(['tryna']);
		// Exact reviewed alternates are not guesses and still match everywhere.
		expect(replacements('trynna tryina', 'no')).toEqual(['tryna', 'tryna']);
	});

	// The exception to that last line, and the reason it is an exception: a few
	// reviewed forms are ordinary words in a supported pack, and every one of
	// them carried a *safe* fix, so a bulk fix rewrote correct lyrics outright.
	// `ei` is the Norwegian article, `Ei` a German egg, `cause` a French noun,
	// `ok`/`okey` are written as themselves nearly everywhere, and `naïve` is
	// the correct French spelling of the word this entry drops the diaeresis
	// from.
	it('holds the forms that are ordinary words elsewhere to English drafts', () => {
		expect(replacements('Æ e ei jente', 'no')).toEqual([]);
		expect(replacements('Das Ei ist gut', 'de')).toEqual([]);
		expect(replacements('Det går ok, cause det må', 'no')).toEqual([]);
		expect(replacements('Elle est naïve', 'fr')).toEqual([]);

		expect(replacements('ei ey ok cause naïve', 'en')).toEqual([
			'ayy',
			'ayy',
			'okay',
			"'cause",
			'naive'
		]);
		// The gate is per match in the `ayy` family, because only some of its
		// forms are words elsewhere; `'cause`, `okay` and `naive` are gated whole,
		// since each states an English orthography rather than a transcription
		// convention that holds in every language.
		expect(replacements('ayee ayyy', 'no')).toEqual(['ayy', 'ayy']);
		expect(replacements('niaive', 'no')).toEqual([]);
	});

	it('reads an elided token as its own word rather than as shortened “because”', () => {
		expect(replacements('Non so cos’è')).toEqual([]);
		expect(replacements("Non so cos'è")).toEqual([]);
	});

	it('does not report reviewed spellings or nearby real words', () => {
		expect(
			replacements("ayy okay y'all bougie woah chopper naive cliché a.k.a. GOAT VIP ASAP HAM")
		).toEqual([]);
		expect(replacements('hey skirt outta boogie Dogg shortie till garden hoe')).toEqual([]);
	});
});

export interface GuideTerm {
	name: string;
	forms: readonly string[];
	definition: string;
}

// Reading help, not additional transcription rules or source-authority claims.
export const guideTerms: readonly GuideTerm[] = [
	{
		name: 'Linter',
		forms: ['linter', 'linters'],
		definition:
			'A tool that checks text against a set of rules and points out possible mistakes. LyricLint checks things such as spelling and formatting. It does not listen to the recording, so it cannot tell whether you heard every word correctly.'
	},
	{
		name: 'Ad-lib',
		forms: ['ad-lib', 'ad-libs'],
		definition:
			'A short vocal addition alongside the main lyrics, such as a shout, response, or “yeah”. It may be planned or improvised.'
	},
	{
		name: 'Annotation',
		forms: ['annotation', 'annotations'],
		definition:
			'On Genius, an explanation attached to a selected passage. An annotation on a guide page can explain a transcription convention; an annotation on a song can explain its lyrics.'
	},
	{
		name: 'Elision',
		forms: ['elision', 'elisions'],
		definition:
			"A sound or syllable left out when a word is spoken or sung, such as “them” becoming “'em”."
	},
	{
		name: 'Contraction',
		forms: ['contraction', 'contractions'],
		definition:
			"A shortened form of a word or group of words. For example, “do not” becomes “don't”, with an apostrophe marking the missing letter."
	},
	{
		name: 'Orthography',
		forms: ['orthography'],
		definition:
			'A language’s usual writing conventions, including its spelling, capitalization, and punctuation.'
	},
	{
		name: 'Initialism',
		forms: ['initialism', 'initialisms'],
		definition:
			'An abbreviation made from the first letters of words and spoken letter by letter, such as “FBI”.'
	},
	{
		name: 'Parenthetical',
		forms: ['parenthetical', 'parentheticals'],
		definition:
			'Text enclosed in parentheses: the round brackets ( ). In lyrics, this can be an ad-lib or another voice.'
	},
	{
		name: 'Guillemet',
		forms: ['guillemet', 'guillemets'],
		definition:
			'An angle-shaped quotation mark, like « or ». Some languages use these instead of “curly” quotation marks.'
	},
	{
		name: 'Unison',
		forms: ['unison'],
		definition: 'Two or more voices performing the same words together at the same pitch.'
	},
	{
		name: 'Segue',
		forms: ['segue', 'segues'],
		definition: 'A transition from one song or passage into the next without a break.'
	},
	{
		name: 'Authority tier',
		forms: ['authority tier', 'authority tiers'],
		definition:
			'How this guide ranks a source’s standing, based on who wrote or reviewed it. For example, Genius staff guidance ranks above an unreviewed community post.'
	},
	{
		name: 'Metadata',
		forms: ['metadata'],
		definition:
			'Information about a song, such as its title, artist credits, or release date, kept separately from the lyrics.'
	},
	{
		name: 'Romanized',
		forms: ['romanized', 'romanization'],
		definition:
			'Written using the Latin alphabet to represent words from another writing system. The language stays the same; this is not a translation.'
	},
	{
		name: 'Diff',
		forms: ['diff', 'diffs'],
		definition:
			'A view of what an edit would change. LyricLint marks the text to remove and the text to add so you can review a suggested fix.'
	}
];

export type GlossarySegment =
	{ kind: 'text'; text: string } | { kind: 'term'; text: string; term: GuideTerm };

const termsByForm = new Map(guideTerms.flatMap((term) => term.forms.map((form) => [form, term])));
const pattern = new RegExp(
	`(?<![\\p{L}\\p{N}_])(?:${[...termsByForm.keys()]
		.sort((a, b) => b.length - a.length)
		.map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('|')})(?![\\p{L}\\p{N}_])`,
	'giu'
);

export function glossarySegments(text: string): GlossarySegment[] {
	const segments: GlossarySegment[] = [];
	let offset = 0;
	for (const match of text.matchAll(pattern)) {
		const term = termsByForm.get(match[0].toLowerCase());
		if (!term) continue;
		if (match.index > offset)
			segments.push({ kind: 'text', text: text.slice(offset, match.index) });
		segments.push({ kind: 'term', text: match[0], term });
		offset = match.index + match[0].length;
	}
	if (offset < text.length) segments.push({ kind: 'text', text: text.slice(offset) });
	return segments;
}

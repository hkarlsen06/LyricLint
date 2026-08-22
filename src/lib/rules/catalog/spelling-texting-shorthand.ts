import type { PerformerRecord, RuleDefinition } from '$lib/core/types.js';
import { isEnglishLanguage } from '$lib/languages/registry.js';
import { type CatalogLookup, diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

/**
 * Written-only shorthand and the words it stands in for.
 *
 * The membership test is one question, and it is what keeps this list from
 * growing into "every initialism": **does anybody sing the letters?** A vocal
 * that performs "I don't know" has been transcribed as `Idk` by somebody
 * writing the way they text, so the words are recoverable and the shorthand is
 * a spelling of them. `ASAP`, `OK`, `VIP`, `DJ` and `TV` are the other kind —
 * the letters *are* the performance, they are what the reviewed spelling guide
 * already lists as preferred, and expanding one would put words in a singer's
 * mouth. `LOL`, `OMG` and `WTF` sit on that side too: they are said aloud often
 * enough that "laughing out loud" is a guess rather than a reading.
 *
 * Two neighbouring sets are deliberately absent for a different reason —
 * another rule owns them, and two diagnostics over one span are two cards
 * arguing about it:
 *
 * - Pronunciation spellings (`gonna`, `wanna`, `outta`, `'til`, `tho`) are how
 *   the word is *sung*, which is exactly what `G-AS-SPOKEN` asks for. `tho` and
 *   `cuz` are already reviewed entries in `data/spelling.ts`, so
 *   `spelling.standardized` answers for both — and `cuz` has a cousin-meaning
 *   gate this rule has no way to reproduce.
 * - Contractions missing an apostrophe (`dont`, `im`, `youre`) belong to
 *   `contraction.apostrophe`.
 *
 * An entry may carry more than one wording where the shorthand genuinely has
 * more than one reading. `ur` is the case: it is `your` about as often as it is
 * `you're`, and a rule that picked one would be right half the time in a card
 * that can just as easily offer both.
 */
export const expansions: CatalogLookup<readonly string[]> = {
	abt: ['about'],
	'b/c': ['because'],
	bc: ['because'],
	brb: ['be right back'],
	btw: ['by the way'],
	fr: ['for real'],
	idc: ["I don't care"],
	idk: ["I don't know"],
	ikr: ['I know, right'],
	ily: ['I love you'],
	imo: ['in my opinion'],
	lmk: ['let me know'],
	nvm: ['never mind'],
	omw: ['on my way'],
	pls: ['please'],
	plz: ['please'],
	ppl: ['people'],
	rly: ['really'],
	rn: ['right now'],
	smh: ['shaking my head'],
	srsly: ['seriously'],
	tbh: ['to be honest'],
	thx: ['thanks'],
	tmrw: ['tomorrow'],
	ttyl: ['talk to you later'],
	u: ['you'],
	ur: ['your', "you're"],
	'w/': ['with'],
	'w/o': ['without']
};

/**
 * Apostrophes and hyphens join the boundary set the rest of the catalog uses,
 * because the short entries are what a longer word starts with: without them
 * `u` matches inside `u're` and `U-turn`, and the fix leaves a fragment behind.
 * Longest alternative first, so `w/o` is never read as `w/` with an `o` after
 * it.
 */
const shorthandPattern = new RegExp(
	`(?<![\\p{L}\\p{N}_'’-])(?:${Object.keys(expansions)
		.sort((left, right) => right.length - left.length)
		.join('|')})(?![\\p{L}\\p{N}_'’-])`,
	'giu'
);

/**
 * What the roster already claims, so a performer called IDK or U is never told
 * their own name is shorthand for a sentence.
 *
 * This is the same accommodation `dictionaryWords` makes on Harper's behalf in
 * `harper.ts`; the difference is that Harper is handed the names and this rule
 * has to ask. Exact match only — a name that merely contains the token is a
 * different word.
 */
function rosterNames(performers: readonly PerformerRecord[]): Set<string> {
	return new Set(
		performers
			.flatMap((performer) => [performer.displayName, ...performer.aliases])
			.map((name) => name.trim().toLocaleLowerCase('en'))
	);
}

/**
 * The case the expansion is written in, which is never the case of the token.
 *
 * Shorthand is conventionally capitalized as an initialism — `IDK` and `TBH`
 * are how these are written in a lowercase line — so the token's own case says
 * nothing about the line it sits in, and mirroring it would shout `I DON'T
 * KNOW` at a document over a lyric that was never shouted. A wording that
 * already opens on a capital keeps it; anything else takes a leading capital
 * only where the shorthand had one, which is what carries a line-initial `Tbh`
 * onto the `To be honest` that `capitalization.line-start` is about to want.
 */
function writtenForm(found: string, expansion: string): string {
	if (/^\p{Lu}/u.test(expansion) || !/^\p{Lu}/u.test(found)) {
		return expansion;
	}
	return `${expansion.slice(0, 1).toLocaleUpperCase('en')}${expansion.slice(1)}`;
}

export const spellingTextingShorthandRule: RuleDefinition = {
	id: 'spelling.texting-shorthand',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-SPELLING', 'G-AS-SPOKEN'],
	// No verified Genius page names `idk`: the rule is LyricLint's reading of
	// what the two cited sources establish, and docs/rules.md records it.
	derivation: true,
	check(document, context) {
		if (!isEnglishLanguage(context.language)) {
			return [];
		}
		const roster = rosterNames(context.performers);
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, shorthandPattern)
					.filter((match) => !roster.has(match.text.toLocaleLowerCase('en')))
					.map((match) => {
						const wordings = (expansions[match.text.toLocaleLowerCase('en')] ?? []).map(
							(expansion) => writtenForm(match.text, expansion)
						);
						return diagnostic(
							this,
							match,
							`Use ${wordings.map((wording) => `“${wording}”`).join(' or ')} instead of “${match.text}”.`,
							'Texting shorthand is a way of writing rather than a way of singing: the letters stand in for words the vocal performs in full, and Genius wants the sung words in standardized spelling. Initialisms that are themselves said aloud — ASAP, OK, VIP — are left alone. Check the delivery before replacing this, since an artist who spells the letters out is transcribed as they sing them.',
							wordings.map((wording) =>
								replacementFix(context, 'preview', `Replace with ${wording}`, match, wording)
							)
						);
					})
			)
		);
	}
};

import type { RuleDefinition } from '$lib/core/types.js';
import { isEnglishLanguage } from '$lib/languages/registry.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

/**
 * A decade-shaped run of digits: two ending in zero (`90`), or a four-digit
 * year ending in zero (`1990`). Deliberately not every number followed by
 * `'s` — `45's` is somebody's records or somebody's jersey, where the
 * possessive reading is as likely as the plural and this rule has nothing
 * trustworthy to offer.
 */
const decadeDigits = String.raw`(?:[12]\d{2}0|[1-9]0)`;

/**
 * Every decade-shaped token that carries an apostrophe anywhere in it, right
 * or wrong, curly or straight. This is the set the catalog owns, and
 * `projectLyricsForHarper` masks it before Harper ever sees the text: Harper
 * tokenizes `'90s` as a number followed by a one-letter word and spell-checks
 * the `s` into `so`, `as` and `is` — a fix preview reading `'90s` → `'90so` —
 * and its own decade lint on `90's` would otherwise stand where this rule's
 * reviewed finding belongs. The curly variants are in the set for the same
 * reason (`’90s` mis-tokenizes identically), while the *rule* below matches
 * straight apostrophes only — a curly one is `quotes.typewriter`'s finding
 * first, and two cards arguing over one token is the failure the
 * one-predicate-per-question rules exist to prevent.
 */
export const decadeApostropheTokenPattern = new RegExp(
	String.raw`(?<![\p{L}\p{N}_'’‘])(?:['’‘]${decadeDigits}['’]?|${decadeDigits}['’])[sS](?![\p{L}\p{N}_'’‘])`,
	'gu'
);

const wrongSidePattern = new RegExp(
	String.raw`(?<![\p{L}\p{N}_'’‘])(?<lead>')?(?<digits>${decadeDigits})'(?<s>[sS])(?![\p{L}\p{N}_'’‘])`,
	'gu'
);

export const numbersDecadeApostropheRule: RuleDefinition = {
	id: 'numbers.decade-apostrophe',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-NUMBERS', 'G-SPELLING'],
	check(document, context) {
		if (!isEnglishLanguage(context.language)) {
			return [];
		}
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, wrongSidePattern).map((match) => {
					const digits = match.groups.digits ?? '';
					const s = match.groups.s ?? 's';
					// The apostrophe stands in for the dropped century, so a
					// four-digit year that still has its century takes none at all.
					const decade = digits.length === 2 ? `'${digits}${s}` : `${digits}${s}`;
					// `'90's` has already said it means the decade, and a four-digit
					// form is the same word either way, so only the bare two-digit
					// token is genuinely two readings.
					const wordings =
						match.groups.lead || digits.length > 2 ? [decade] : [decade, `${digits}${s}`];
					return diagnostic(
						this,
						match,
						`Use ${wordings.map((wording) => `“${wording}”`).join(' or ')} instead of “${match.text}”.`,
						"An apostrophe stands in for the dropped century, so it goes before the numerals ('90s); an age range or a plain plural takes none (90s). An apostrophe after the numerals reads as a possessive, which a line can genuinely mean, so check the reading before replacing.",
						wordings.map((wording) =>
							replacementFix(context, 'preview', `Replace with ${wording}`, match, wording)
						)
					);
				})
			)
		);
	}
};

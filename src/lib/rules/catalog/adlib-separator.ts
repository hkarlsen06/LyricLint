import type { Diagnostic, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

/**
 * Chant syllables, deliberately its own list rather than `adlib-parentheses`'s.
 * That rule reads a single word out of running lyric, where a false positive
 * rewrites an ordinary line; here two of these have to sit side by side with
 * nothing between them, which is a shape running lyric does not take. Every
 * entry is one word, so a run splits on whitespace — `let's go` is left to the
 * other rule rather than paying for a tokenizer here.
 *
 * Longest first within each group, so `ohh` is not read as `oh` with a letter
 * after it.
 */
const strong = 'yeah|yah|yuh|ayy|ooh|ohh|oh|wooh|woo|woah|whoa|hoo|hey|huh|mmm|mm|brr|skrrt';

/**
 * Ad-libs that are also ordinary words in a language this product accepts —
 * `la` is a Spanish and French article, `ha` is Spanish "has" and Norwegian
 * "have", `da` is German and Norwegian, `ye` is archaic English. A run of these
 * alone is a phrase until there are three of them: `La ha visto en el espejo`
 * and `I saw La La Land twice` are two of them, and `Na na na` is three.
 */
const weak = 'yea|aye|ay|ye|uh|la|da|ha|na';

const chant = `${strong}|${weak}`;
const isStrong = new RegExp(`^(?:${strong})$`, 'iu');

// A token already joined by a hyphen or apostrophe is not a loose ad-lib.
const edge = "[\\p{L}\\p{N}'\\u2019-]";

export const adlibSeparatorRule: RuleDefinition = {
	id: 'adlib.separator',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-ADLIBS'],
	check(document, context) {
		// Two or more ad-libs in a row with nothing but whitespace between them.
		const pattern = new RegExp(`(?<!${edge})(?:${chant})(?:\\s+(?:${chant}))+(?!${edge})`, 'giu');
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			for (const line of section.lines) {
				for (const match of matchesOutsideMarkup(line, pattern)) {
					// `matchesOutsideMarkup` masks markup as spaces, so a gap holding a
					// tag reads as whitespace and joining the run would delete it.
					if (match.text.includes('<')) {
						continue;
					}
					const words = match.text.split(/\s+/u);
					// Two ordinary words side by side are a phrase, not a chant.
					if (words.length < 3 && !words.some((word) => isStrong.test(word))) {
						continue;
					}
					diagnostics.push(
						diagnostic(
							this,
							match,
							'Separate these ad-libs with commas, or join them with hyphens.',
							'One ad-lib follows another with nothing between them. A comma separates them as distinct calls and a hyphen combines them into one; which one fits is a phrasing call, so both edits are preview-only.',
							[
								replacementFix(
									context,
									'preview',
									`Separate as ${words.join(', ')}`,
									match,
									words.join(', ')
								),
								replacementFix(
									context,
									'preview',
									`Combine as ${words.join('-')}`,
									match,
									words.join('-')
								)
							]
						)
					);
				}
			}
		}
		return diagnostics;
	}
};

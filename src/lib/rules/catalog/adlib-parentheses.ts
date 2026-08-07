import type { Diagnostic, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, maskedMarkupText, matchesOutsideMarkup, replacementFix } from './utils.js';

const adlib = "yeah|ayy|uh|ooh|woo|hey|let's go";

export const adlibParenthesesRule: RuleDefinition = {
	id: 'adlib.parentheses',
	version: 3,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-ADLIBS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			for (const line of section.lines) {
				for (const match of matchesOutsideMarkup(
					line,
					new RegExp(`\\((?<word>${adlib})\\)`, 'gu')
				)) {
					const word = match.groups.word ?? '';
					if (!/^\p{Ll}/u.test(word)) {
						continue;
					}
					const localFrom = match.text.indexOf(word);
					const range = {
						from: match.from + localFrom,
						to: match.from + localFrom + word.length
					};
					const replacement = `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`;
					diagnostics.push(
						diagnostic(
							this,
							range,
							'Capitalize this parenthesized ad-lib.',
							'This is a short recognized ad-lib inside parentheses. The suggestion is contextual and requires preview.',
							[
								replacementFix(
									context,
									'preview',
									`Capitalize as ${replacement}`,
									range,
									replacement
								)
							]
						)
					);
				}

				for (const match of matchesOutsideMarkup(
					line,
					new RegExp(`,\\s*(?<word>${adlib})\\s*$`, 'giu')
				)) {
					const word = match.groups.word ?? '';
					// `Yeah, yeah, yeah` is the line repeating its own word, not a vocal
					// sitting behind it: where the token right before the comma is the same
					// ad-lib, the phrase is the lead's refrain and nothing is offered. Read
					// off the masked text so a repeat inside markup still counts as one.
					const lowerWord = word.toLocaleLowerCase('en');
					const beforeComma = maskedMarkupText(line)
						.slice(0, match.from - line.from)
						.replace(/\s+$/u, '')
						.toLocaleLowerCase('en');
					if (
						beforeComma.endsWith(lowerWord) &&
						!/[\p{L}\p{M}\p{N}]/u.test(
							beforeComma.charAt(beforeComma.length - lowerWord.length - 1)
						)
					) {
						continue;
					}
					const localFrom = match.text
						.toLocaleLowerCase('en')
						.lastIndexOf(word.toLocaleLowerCase('en'));
					const wrapped = `(${word[0]?.toUpperCase() ?? ''}${word.slice(1)})`;
					const wordRange = {
						from: match.from + localFrom,
						to: match.from + localFrom + word.length
					};
					// The comma only separated the ad-lib from the lyric, so parenthesizing the
					// ad-lib strands it. Swallow it with the fix, but only when nothing except
					// whitespace sits between it and the word: `matchesOutsideMarkup` masks markup
					// as spaces, so a gap holding a tag would otherwise be deleted with the comma.
					const strandsComma = /^\s*$/u.test(match.text.slice(1, localFrom));
					const before = line.text.slice(0, match.from - line.from);
					const range = strandsComma ? { from: match.from, to: wordRange.to } : wordRange;
					// `A, yeah` closes up to `A (Yeah)`; `A , yeah` and a line-leading comma must
					// not gain a second space.
					const replacement =
						strandsComma && before.length > 0 && !/\s$/u.test(before) ? ` ${wrapped}` : wrapped;
					diagnostics.push({
						...diagnostic(
							this,
							range,
							'This likely ad-lib may need parentheses.',
							'The short phrase appears after a comma at the end of a lyric line. Parentheses are for a vocal sitting behind the lead, so an ad-lib the singer is performing as part of the line belongs exactly as it is written.',
							[replacementFix(context, 'preview', `Wrap as ${wrapped}`, range, replacement)]
						),
						// More of these are sung than are backing, so the leading answer is
						// that the line is already right and the wrap is the second offer.
						presumedCorrect: true
					});
				}
			}
		}
		return diagnostics;
	}
};

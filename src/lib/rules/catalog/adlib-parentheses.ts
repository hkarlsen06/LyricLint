import type { Diagnostic, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const adlib = "yeah|ayy|uh|ooh|woo|hey|let's go";

export const adlibParenthesesRule: RuleDefinition = {
	id: 'adlib.parentheses',
	version: 2,
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
					const localFrom = match.text.toLocaleLowerCase().lastIndexOf(word.toLocaleLowerCase());
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
					diagnostics.push(
						diagnostic(
							this,
							range,
							'This likely ad-lib may need parentheses.',
							'The short phrase appears after a comma at the end of a lyric line. Because vocal phrasing is contextual, the edit is preview-only.',
							[replacementFix(context, 'preview', `Wrap as ${wrapped}`, range, replacement)]
						)
					);
				}
			}
		}
		return diagnostics;
	}
};

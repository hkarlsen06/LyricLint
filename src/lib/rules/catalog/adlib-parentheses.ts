import type { Diagnostic, RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const adlib = "yeah|ayy|uh|ooh|woo|hey|let's go";

export const adlibParenthesesRule: RuleDefinition = {
	id: 'adlib.parentheses',
	version: 1,
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
					const range = {
						from: match.from + localFrom,
						to: match.from + localFrom + word.length
					};
					const replacement = `(${word[0]?.toUpperCase() ?? ''}${word.slice(1)})`;
					diagnostics.push(
						diagnostic(
							this,
							range,
							'This likely ad-lib may need parentheses.',
							'The short phrase appears after a comma at the end of a lyric line. Because vocal phrasing is contextual, the edit is preview-only.',
							[replacementFix(context, 'preview', `Wrap as ${replacement}`, range, replacement)]
						)
					);
				}
			}
		}
		return diagnostics;
	}
};

import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, maskedMarkupText, matchesOutsideMarkup, replacementFix } from './utils.js';

const trailingCommaOrPeriod = /[,.](?=["'“”‘’)\]}]*\s*$)/gu;

export const punctuationLineEndingRule: RuleDefinition = {
	id: 'punctuation.line-ending',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['APPLE-LINE-PUNCTUATION', 'G-QE-MARKS'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				const visible = maskedMarkupText(line);
				return matchesOutsideMarkup(line, trailingCommaOrPeriod)
					.filter((match) => {
						if (match.text !== '.') {
							return true;
						}
						const offset = match.from - line.from;
						return visible[offset - 1] !== '.' && visible[offset + 1] !== '.';
					})
					.map((match) => {
						const name = match.text === ',' ? 'comma' : 'period';
						return diagnostic(
							this,
							match,
							`Lyric lines should not end with a ${name}.`,
							'Apple Music lyric guidance explicitly excludes commas and periods at line endings. The current Genius guide separately requires question marks for questions and uses exclamation marks for excitement, but does not state the same blanket ban. Removal is preview-only so quotations, abbreviations, and intentional delivery remain reviewable.',
							[replacementFix(context, 'preview', `Remove the ${name}`, match, '')]
						);
					});
			})
		);
	}
};

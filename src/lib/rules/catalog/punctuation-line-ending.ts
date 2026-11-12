import type { RuleDefinition } from '#lib/core/types.js';
import { diagnostic, maskedMarkupText, matchesOutsideMarkup, replacementFix } from './utils.js';

const trailingCommaOrPeriod = /[,.](?=["'“”‘’)\]}]*\s*$)/gu;

export const punctuationLineEndingRule: RuleDefinition = {
	id: 'punctuation.line-ending',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['APPLE-LINE-PUNCTUATION', 'G-QE-MARKS'],
	// Cross-platform guidance, not a Genius claim: Apple states the ban, Genius
	// does not, and docs/rules.md records the reading. The meta line says so.
	derivation: true,
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
							`Consider removing the final ${name}.`,
							'Apple Music excludes final commas and periods; Genius does not state a blanket ban. Keep punctuation needed for quotations, abbreviations or intentional delivery.',
							[replacementFix(context, 'preview', `Remove the ${name}`, match, '')]
						);
					});
			})
		);
	}
};

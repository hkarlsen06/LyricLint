import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup } from './utils.js';

export const spellingLanguageVariantRule: RuleDefinition = {
	id: 'spelling.language-variant',
	version: 1,
	defaultSeverity: 'manual-review',
	fixability: 'none',
	sourceIds: ['G-SPELLING'],
	check(document, context) {
		const british = /^en-gb$/iu.test(context.language);
		const american = /^en-us$/iu.test(context.language);
		if (!british && !american) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				if (british) {
					return matchesOutsideMarkup(line, /(?<![\p{L}\p{N}_])'til(?![\p{L}\p{N}_])/giu).map(
						(match) =>
							diagnostic(
								this,
								match,
								'Review this American spelling against the selected British English variant.',
								'British English accepts “till,” while American English uses “’til.” This is a consistency review, not an automatic replacement.'
							)
					);
				}

				return matchesOutsideMarkup(
					line,
					/\b(?:stay|wait|work|dance|sing|hold|keep)\s+(?<variant>till)\b/giu
				).map((match) => {
					const variant = match.groups.variant ?? 'till';
					const local = match.text.toLocaleLowerCase().lastIndexOf(variant.toLocaleLowerCase());
					const range = { from: match.from + local, to: match.from + local + variant.length };
					return diagnostic(
						this,
						range,
						'Review this British spelling against the selected American English variant.',
						'The temporal use appears to be British “till”; American English prefers “’til.” The rule is manual review because “till” also has unrelated meanings.'
					);
				});
			})
		);
	}
};

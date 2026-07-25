import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const censoredWordCandidate = /(?<![\p{L}\p{M}\p{N}_*])[\p{L}\p{M}*]+(?![\p{L}\p{M}\p{N}_*])/gu;

export const censoredMaskRule: RuleDefinition = {
	id: 'censored.mask',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-CENSORED'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, censoredWordCandidate)
					.filter(
						(match) =>
							match.text.includes('*') &&
							/\p{L}/u.test(match.text) &&
							!(match.text.startsWith('*') && match.text.endsWith('*'))
					)
					.map((match) => {
						const range = { from: match.from, to: match.to };
						return diagnostic(
							this,
							range,
							'A censored word should use exactly four asterisks.',
							'This mixes letters with an asterisk mask. Confirm before replacing the entire censored-word candidate so no partial spelling remains.',
							[replacementFix(context, 'preview', 'Use four asterisks', range, '****')]
						);
					})
			)
		);
	}
};

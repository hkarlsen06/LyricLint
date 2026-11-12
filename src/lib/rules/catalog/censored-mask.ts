import type { RuleDefinition } from '#lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';
import { censoredWordCandidate, isMaskedCensorCandidate } from '#lib/profiles/censorship.js';

export const censoredMaskRule: RuleDefinition = {
	id: 'censored.mask',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-CENSORED'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				if (!line.text.includes('*')) return [];
				return matchesOutsideMarkup(line, censoredWordCandidate)
					.filter((match) => isMaskedCensorCandidate(match.text) && /\p{L}/u.test(match.text))
					.map((match) => {
						const range = { from: match.from, to: match.to };
						return diagnostic(
							this,
							range,
							'A censored word should use exactly four asterisks.',
							'This mixes letters with an asterisk mask. Confirm before replacing the entire censored-word candidate so no partial spelling remains.',
							[replacementFix(context, 'preview', 'Use four asterisks', range, '****')]
						);
					});
			})
		);
	}
};

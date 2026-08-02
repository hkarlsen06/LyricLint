import type { RuleDefinition } from '$lib/core/types.js';
import { resolveLanguageTag } from '$lib/languages/registry.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

export const contractions: Record<string, string> = {
	'a el': 'al',
	'de el': 'del'
};

const contractionPattern = /(?<![\p{L}\p{N}_])(?:a el|de el)(?![\p{L}\p{N}_])/gu;

export const grammarSpanishContractionsRule: RuleDefinition = {
	id: 'grammar.spanish-contractions',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-ES-CONTRACTIONS'],
	check(document, context) {
		if (resolveLanguageTag(context.language) !== 'es') {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, contractionPattern).map((match) => {
					const replacement = contractions[match.text]!;

					return diagnostic(
						this,
						match,
						`Contract “${match.text}” to “${replacement}” in Spanish.`,
						'Spanish contracts the lowercase prepositions “a” and “de” with the article “el.” Capitalized “El” is left alone because it can belong to a proper name.',
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

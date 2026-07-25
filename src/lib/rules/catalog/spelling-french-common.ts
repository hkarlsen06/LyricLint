import type { RuleDefinition } from '$lib/core/types.js';
import { resolveLanguageTag } from '$lib/languages/registry.js';
import { diagnostic, matchesOutsideMarkup, preserveCase, replacementFix } from './utils.js';

const corrections: Readonly<Record<string, string>> = {
	'comme sa': 'comme ça',
	'sa va': 'ça va',
	acceuil: 'accueil',
	parmis: 'parmi',
	addresse: 'adresse',
	apeller: 'appeler',
	envelope: 'enveloppe',
	mourrir: 'mourir',
	traditionel: 'traditionnel',
	interresser: 'intéresser'
};

const commonSpellingPattern =
	/(?<![\p{L}\p{N}_])(?:comme sa|sa va|acceuil|parmis|addresse|apeller|envelope|mourrir|traditionel|interresser)(?![\p{L}\p{N}_])/giu;

export const spellingFrenchCommonRule: RuleDefinition = {
	id: 'spelling.french-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-FR-COMMON', 'L-FR-LEXICAL', 'L-FR-DOUBLES'],
	check(document, context) {
		if (resolveLanguageTag(context.language) !== 'fr') {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonSpellingPattern)
					.filter((match) => {
						const lowercase = match.text.toLocaleLowerCase('fr');
						return (
							lowercase !== 'comme sa' ||
							match.text.endsWith('sa') ||
							match.text === match.text.toLocaleUpperCase('fr')
						);
					})
					.map((match) => {
						const preferred = corrections[match.text.toLocaleLowerCase('fr')] ?? match.text;
						const replacement = preserveCase(match.text, preferred);

						return diagnostic(
							this,
							match,
							`“${match.text}” is a common French spelling error.`,
							`The reviewed standard spelling is “${replacement}.” The suggestion remains optional because lyrics can preserve intentional forms.`,
							[
								replacementFix(
									context,
									'preview',
									`Replace with ${replacement}`,
									match,
									replacement
								)
							]
						);
					})
			)
		);
	}
};

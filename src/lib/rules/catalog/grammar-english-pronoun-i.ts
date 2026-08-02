import type { RuleDefinition } from '$lib/core/types.js';
import { isEnglishLanguage } from '$lib/languages/registry.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const lowercasePronounI =
	/(?<![\p{L}\p{N}_])i(?=(?:['’](?:[mM]|[vV][eE]|[dD]|[lL][lL])(?![\p{L}\p{N}_])|(?!\.[eE]\.)(?![-'’\p{L}\p{N}_])))/gu;

export const grammarEnglishPronounIRule: RuleDefinition = {
	id: 'grammar.english-pronoun-i',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-CAPS'],
	check(document, context) {
		if (!isEnglishLanguage(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, lowercasePronounI).map((match) =>
					diagnostic(
						this,
						match,
						'The English first-person pronoun “I” should be capitalized.',
						'Capitalize the standalone pronoun and its initial letter in contractions such as “I’m,” “I’ve,” “I’d,” and “I’ll.”',
						[replacementFix(context, 'preview', 'Capitalize I', match, 'I')]
					)
				)
			)
		);
	}
};

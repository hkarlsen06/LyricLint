import type { RuleDefinition } from '$lib/core/types.js';
import { resolveLanguageTag } from '$lib/languages/registry.js';
import {
	type CatalogLookup,
	diagnostic,
	matchesOutsideMarkup,
	preserveCase,
	replacementFix
} from './utils.js';

export const replacements: CatalogLookup<string> = {
	sinembargo: 'sin embargo',
	agusto: 'a gusto',
	através: 'a través',
	enmedio: 'en medio',
	alomejor: 'a lo mejor',
	deacuerdo: 'de acuerdo',
	apesar: 'a pesar',
	porfavor: 'por favor'
};

const commonSpanishError =
	/(?<![\p{L}\p{N}_])(?:sinembargo|agusto|através|enmedio|alomejor|deacuerdo|apesar|porfavor)(?![\p{L}\p{N}_])/giu;

export const spellingSpanishCommonRule: RuleDefinition = {
	id: 'spelling.spanish-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-ES-COMMON'],
	check(document, context) {
		if (resolveLanguageTag(context.language) !== 'es') {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonSpanishError).map((match) => {
					const preferred = replacements[match.text.toLocaleLowerCase('es')] ?? match.text;
					const replacement = preserveCase(match.text, preferred);
					return diagnostic(
						this,
						match,
						`“${match.text}” is a common Spanish word-division error.`,
						`The standard spelling is “${replacement}.”`,
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

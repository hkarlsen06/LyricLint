import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, preserveCase, replacementFix } from './utils.js';

const replacements: Readonly<Record<string, string>> = {
	desverre: 'dessverre',
	interresant: 'interessant',
	nyskjerrig: 'nysgjerrig',
	blandt: 'blant',
	værre: 'verre',
	etterhvert: 'etter hvert',
	ihvertfall: 'i hvert fall',
	hvertfall: 'i hvert fall',
	tunell: 'tunnel'
};

const commonNorwegianError =
	/(?<![\p{L}\p{N}_])(?:desverre|interresant|nyskjerrig|blandt|værre|etterhvert|ihvertfall|hvertfall|tunell)(?![\p{L}\p{N}_])/giu;

export const spellingNorwegianCommonRule: RuleDefinition = {
	id: 'spelling.norwegian-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-NO-COMMON'],
	check(document, context) {
		if (!/^no(?:-|$)/iu.test(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonNorwegianError).map((match) => {
					const preferred = replacements[match.text.toLocaleLowerCase()] ?? match.text;
					const replacement = preserveCase(match.text, preferred);
					return diagnostic(
						this,
						match,
						`“${match.text}” is a common Norwegian spelling error.`,
						`The standard spelling is “${replacement}.”`,
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

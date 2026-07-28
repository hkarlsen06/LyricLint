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
	tunell: 'tunnel',
	óg: 'òg'
};

const commonNorwegianError =
	/(?<![\p{L}\p{N}_])(?:desverre|interresant|nyskjerrig|blandt|værre|etterhvert|ihvertfall|hvertfall|tunell|óg)(?![\p{L}\p{N}_])/giu;

/**
 * `óg` is a wrong accent rather than a wrong sequence of letters, so it cites
 * the page that says which accent is meant and gets the sentence a reader needs
 * to judge the preview: the grave marks the adverb, and a line that means “and”
 * wants the unaccented `og` instead. Every other entry here is a plain
 * misspelling with one right answer and nothing to weigh.
 */
const accentedOg = 'óg';

export const spellingNorwegianCommonRule: RuleDefinition = {
	id: 'spelling.norwegian-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-NO-COMMON', 'L-NO-ACCENT'],
	check(document, context) {
		if (!/^no(?:-|$)/iu.test(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonNorwegianError).map((match) => {
					const found = match.text.toLocaleLowerCase();
					const wrongAccent = found === accentedOg;
					const preferred = replacements[found] ?? match.text;
					const replacement = preserveCase(match.text, preferred);
					return diagnostic(
						this,
						match,
						wrongAccent
							? `“${match.text}” carries the wrong accent.`
							: `“${match.text}” is a common Norwegian spelling error.`,
						wrongAccent
							? `The adverb meaning “also” takes a grave accent: “${replacement}.” A line that means “and” takes the unaccented “og.”`
							: `The standard spelling is “${replacement}.”`,
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)],
						wrongAccent ? ['L-NO-ACCENT'] : ['L-NO-COMMON']
					);
				})
			)
		);
	}
};

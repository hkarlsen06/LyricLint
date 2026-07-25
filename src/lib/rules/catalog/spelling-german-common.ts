import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, preserveCase, replacementFix } from './utils.js';

const replacements: Readonly<Record<string, string>> = {
	garnicht: 'gar nicht',
	nähmlich: 'nämlich',
	bischen: 'bisschen',
	immernoch: 'immer noch',
	wiedermal: 'wieder mal',
	seperat: 'separat',
	rythmus: 'rhythmus',
	entgültig: 'endgültig',
	wiedersprechen: 'widersprechen'
};

const commonGermanError =
	/(?<![\p{L}\p{N}_])(?:garnicht|nähmlich|bischen|immernoch|wiedermal|seperat|rythmus|entgültig|wiedersprechen)(?![\p{L}\p{N}_])/giu;

export const spellingGermanCommonRule: RuleDefinition = {
	id: 'spelling.german-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-DE-COMMON'],
	check(document, context) {
		if (!/^de(?:-|$)/iu.test(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonGermanError).map((match) => {
					const preferred = replacements[match.text.toLocaleLowerCase()] ?? match.text;
					const replacement = preserveCase(match.text, preferred);
					return diagnostic(
						this,
						match,
						`“${match.text}” is a common German spelling error.`,
						`The standard spelling is “${replacement}.”`,
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

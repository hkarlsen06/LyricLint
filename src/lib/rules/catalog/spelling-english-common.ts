import type { RuleDefinition } from '$lib/core/types.js';
import { isEnglishLanguage } from '$lib/languages/registry.js';
import { diagnostic, matchesOutsideMarkup, preserveCase, replacementFix } from './utils.js';

export const replacements: Readonly<Record<string, string>> = {
	definately: 'definitely',
	tommorrow: 'tomorrow',
	seperate: 'separate',
	acheive: 'achieve',
	becouse: 'because',
	freind: 'friend',
	untill: 'until',
	recieve: 'receive'
};

const commonEnglishError =
	/(?<![\p{L}\p{N}_])(?:definately|tommorrow|seperate|acheive|becouse|freind|untill|recieve)(?![\p{L}\p{N}_])/giu;

export const spellingEnglishCommonRule: RuleDefinition = {
	id: 'spelling.english-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-EN-COMMON', 'L-EN-MORE', 'L-EN-TOP50'],
	check(document, context) {
		if (!isEnglishLanguage(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonEnglishError).map((match) => {
					const preferred = replacements[match.text.toLocaleLowerCase('en')] ?? match.text;
					const replacement = preserveCase(match.text, preferred);
					return diagnostic(
						this,
						match,
						`“${match.text}” is a common English spelling error.`,
						`The standard spelling is “${replacement}.”`,
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

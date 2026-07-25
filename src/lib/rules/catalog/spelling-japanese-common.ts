import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const replacements: Readonly<Record<string, string>> = {
	こんにちわ: 'こんにちは',
	こんばんわ: 'こんばんは',
	づつ: 'ずつ'
};

const commonFormPattern = /こんにちわ|こんばんわ|づつ/gu;

export const spellingJapaneseCommonRule: RuleDefinition = {
	id: 'spelling.japanese-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-JA-COMMON'],
	check(document, context) {
		if (!/^ja(?:-|$)/iu.test(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonFormPattern).map((match) => {
					const replacement = replacements[match.text] ?? match.text;
					return diagnostic(
						this,
						match,
						`Review “${match.text}” as the standard Japanese spelling “${replacement}”.`,
						'This is the conventional spelling, but phonetic spelling and intentional lyric stylization can preserve the original form.',
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

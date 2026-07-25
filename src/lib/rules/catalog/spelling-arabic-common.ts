import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const replacements: Readonly<Record<string, string>> = {
	لاكن: 'لكن',
	هاذا: 'هذا',
	هاذه: 'هذه',
	'انشاء الله': 'إن شاء الله',
	احلا: 'أحلى'
};

const commonFormPattern = /(?<![\p{L}\p{N}_])(?:انشاء الله|لاكن|هاذا|هاذه|احلا)(?![\p{L}\p{N}_])/gu;

export const spellingArabicCommonRule: RuleDefinition = {
	id: 'spelling.arabic-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-AR-COMMON'],
	check(document, context) {
		if (!/^ar(?:-|$)/iu.test(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonFormPattern).map((match) => {
					const replacement = replacements[match.text] ?? match.text;
					return diagnostic(
						this,
						match,
						`Review “${match.text}” as the standard Arabic form “${replacement}”.`,
						'This is a common standard-Arabic spelling correction, but dialect spelling and intentional lyric stylization can preserve the original form.',
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const replacements: Readonly<Record<string, string>> = {
	됬: '됐',
	몇일: '며칠',
	웬지: '왠지',
	오랫만: '오랜만',
	설레임: '설렘',
	설레이는: '설레는',
	설레이네: '설레네',
	일일히: '일일이'
};

const commonFormPattern =
	/됬|(?<![\p{L}\p{N}_])(?:몇일|웬지|오랫만|설레임|설레이는|설레이네|일일히)(?![\p{L}\p{N}_])/gu;

export const spellingKoreanCommonRule: RuleDefinition = {
	id: 'spelling.korean-common',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['L-KO-COMMON', 'L-KO-WAENJI', 'L-KO-ORAENMAN', 'L-KO-SEOLLEM', 'L-KO-IRIRI'],
	check(document, context) {
		if (!/^ko(?:-|$)/iu.test(context.language)) {
			return [];
		}

		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, commonFormPattern).map((match) => {
					const replacement = replacements[match.text] ?? match.text;
					return diagnostic(
						this,
						match,
						`Review “${match.text}” as the standard Korean form “${replacement}”.`,
						'This common spelling correction is offered as a preview so the transcription can retain intentional lyric styling.',
						[replacementFix(context, 'preview', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

export const punctuationDroppedWordDashRule: RuleDefinition = {
	id: 'punctuation.dropped-word-dash',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-DASHES'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => [
				...matchesOutsideMarkup(line, /—,/gu).map((match) =>
					diagnostic(
						this,
						match,
						'Do not follow an em dash with a comma.',
						'The comma directly after the em dash is mechanically detectable, but the punctuation change remains preview-only.',
						[replacementFix(context, 'preview', 'Remove the comma', match, '—')]
					)
				),
				...matchesOutsideMarkup(line, /(?<=\p{L})--(?=\s|$)/gu).map((match) =>
					diagnostic(
						this,
						match,
						'Review this double hyphen as a dropped-word dash.',
						'Two hyphens after a word look like an attempted em dash. Confirm the transcription and punctuation before replacing them.',
						[replacementFix(context, 'preview', 'Replace with an em dash', match, '—')]
					)
				)
			])
		);
	}
};

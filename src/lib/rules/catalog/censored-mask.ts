import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

export const censoredMaskRule: RuleDefinition = {
	id: 'censored.mask',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-CENSORED'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(
					line,
					/(?<![\p{L}\p{N}_*])(?<prefix>\p{L}+)?(?<mask>\*{1,3}|\*{5,})(?<suffix>\p{L}+)?(?![\p{L}\p{N}_*])/giu
				)
					.filter((match) => Boolean(match.groups.prefix || match.groups.suffix))
					.map((match) => {
						const mask = match.groups.mask ?? '';
						const localMaskFrom = match.text.indexOf(mask);
						const range = {
							from: match.from + localMaskFrom,
							to: match.from + localMaskFrom + mask.length
						};
						return diagnostic(
							this,
							range,
							'A censored-word mask should use exactly four asterisks.',
							'The surrounding letters make this look like a censored word. Confirm before normalizing only the asterisk run.',
							[replacementFix(context, 'preview', 'Use four asterisks', range, '****')]
						);
					})
			)
		);
	}
};

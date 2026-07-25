import type { RuleDefinition } from '$lib/core/types.js';
import { lookupSpellingCandidates } from '../data/spelling.js';
import { diagnostic, hasUnsupportedMarkup, replacementFix } from './utils.js';

export const spellingStandardizedRule: RuleDefinition = {
	id: 'spelling.standardized',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-SPELLING'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				if (hasUnsupportedMarkup(line)) {
					return [];
				}
				return lookupSpellingCandidates(line.text, { language: context.language }).map(
					(candidate) => {
						const range = {
							from: line.from + candidate.from,
							to: line.from + candidate.to
						};
						return diagnostic(
							this,
							range,
							`Use the reviewed spelling “${candidate.replacement}” instead of “${candidate.found}”.`,
							candidate.safe
								? 'This context-free spelling recommendation matched a complete word outside literal markup.'
								: `This recommendation passed its ${candidate.contextGate} context gate, but its meaning still deserves review.`,
							candidate.safe
								? [
										replacementFix(
											context,
											'safe',
											`Replace with ${candidate.replacement}`,
											range,
											candidate.replacement
										)
									]
								: undefined
						);
					}
				);
			})
		);
	}
};

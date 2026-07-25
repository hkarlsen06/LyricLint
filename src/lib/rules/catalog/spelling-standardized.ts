import type { RuleDefinition } from '$lib/core/types.js';
import { lookupSpellingCandidates } from '../data/spelling.js';
import { diagnostic, hasUnsupportedMarkup, replacementFix } from './utils.js';

export const spellingStandardizedRule: RuleDefinition = {
	id: 'spelling.standardized',
	version: 2,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
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
							candidate.contextGate === 'cousin-meaning'
								? `If “${candidate.found}” means “because,” use “${candidate.replacement}”.`
								: `Use “${candidate.replacement}” instead of “${candidate.found}”.`,
							candidate.safe
								? 'The reviewed Genius spelling guide recommends this form.'
								: candidate.contextGate === 'cousin-meaning'
									? `“${candidate.found}” can also mean “cousin,” so check the lyric before replacing it.`
									: `This spelling can have another meaning, so check the lyric before replacing it.`,
							candidate.safe || candidate.contextGate === 'cousin-meaning'
								? [
										replacementFix(
											context,
											candidate.safe ? 'safe' : 'preview',
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

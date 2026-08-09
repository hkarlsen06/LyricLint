import type { RuleDefinition } from '$lib/core/types.js';
import { lookupSpellingCandidates } from '../data/spelling.js';
import { diagnostic, hasUnsupportedMarkup, replacementFix } from './utils.js';

export const spellingStandardizedRule: RuleDefinition = {
	id: 'spelling.standardized',
	version: 5,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-SPELLING', 'G-AS-SPOKEN'],
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
								: candidate.contextGate === 'pronunciation'
									? `Review whether “${candidate.found}” matches the pronunciation.`
									: `Use “${candidate.replacement}” instead of “${candidate.found}”.`,
							candidate.safe
								? 'The reviewed Genius spelling guide recommends this form.'
								: candidate.fuzzy
									? 'This is one character away from a reviewed Genius spelling. Check the lyric before replacing it.'
									: candidate.contextGate === 'pronunciation'
										? `The spelling guide prefers “${candidate.replacement},” but Genius also says distinct or deliberate pronunciation may be written as heard. Compare the audio before replacing it.`
										: candidate.contextGate === 'cousin-meaning'
											? `“${candidate.found}” can also mean “cousin,” so check the lyric before replacing it.`
											: `This spelling can have another meaning, so check the lyric before replacing it.`,
							candidate.safe ||
								candidate.fuzzy ||
								candidate.contextGate === 'cousin-meaning' ||
								candidate.contextGate === 'pronunciation'
								? [
										replacementFix(
											context,
											candidate.safe ? 'safe' : 'preview',
											`Replace with ${candidate.replacement}`,
											range,
											candidate.replacement
										)
									]
								: undefined,
							candidate.contextGate === 'pronunciation'
								? ['G-SPELLING', 'G-AS-SPOKEN']
								: ['G-SPELLING']
						);
					}
				);
			})
		);
	}
};

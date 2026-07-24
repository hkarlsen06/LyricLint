import type { RuleDefinition } from '../../core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

const straightQuotes: Record<string, string> = {
	'‘': "'",
	'’': "'",
	'“': '"',
	'”': '"'
};

export const quotesTypewriterRule: RuleDefinition = {
	id: 'quotes.typewriter',
	version: 1,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-TYPEWRITER'],
	check(document, context) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) =>
				matchesOutsideMarkup(line, /[‘’“”]/gu).map((match) => {
					const replacement = straightQuotes[match.text] ?? match.text;
					return diagnostic(
						this,
						match,
						'Use a straight typewriter quote in lyric text.',
						'The exact curly quote can be replaced mechanically. Lines containing unsupported markup are excluded so the fixer never rewrites uncertain markup.',
						[replacementFix(context, 'safe', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

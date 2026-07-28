import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

/**
 * The straight mark each curly one becomes, and the name that tells one
 * occurrence from another.
 *
 * The message has to carry the name because the character cannot. A line
 * holding both halves of a pair reports twice on the same line number, so the
 * meta line — severity, line, citation — is identical on both rows and the
 * message is the only thing left to separate them. Printing the mark itself
 * does not: `“` and `”` differ by the direction of a curl at 15px, which is
 * exactly the size the panel draws them at.
 */
const curlyQuotes: Record<string, { straight: string; name: string }> = {
	'‘': { straight: "'", name: 'opening curly single quote' },
	'’': { straight: "'", name: 'closing curly single quote' },
	'“': { straight: '"', name: 'opening curly double quote' },
	'”': { straight: '"', name: 'closing curly double quote' }
};

/**
 * `’` between two letters is an apostrophe, not the closing half of anything —
 * and in real lyrics that is most of what this rule points at. Naming it as a
 * closing quote would trade one indistinguishable message for a confidently
 * wrong one.
 */
function isApostrophe(text: string, index: number): boolean {
	return /\p{L}/u.test(text[index - 1] ?? '') && /\p{L}/u.test(text[index + 1] ?? '');
}

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
					const curly = curlyQuotes[match.text];
					const replacement = curly?.straight ?? match.text;
					const name =
						match.text === '’' && isApostrophe(line.text, match.from - line.from)
							? 'curly apostrophe'
							: (curly?.name ?? 'curly quote');
					return diagnostic(
						this,
						match,
						`Use a straight ${replacement} instead of the ${name}.`,
						'The exact curly quote can be replaced mechanically. Lines containing unsupported markup are excluded so the fixer never rewrites uncertain markup.',
						// The label stays the bare replacement, so the two halves of a
						// pair share one `Fix all 2` batch: replacing `“` and `”` with `"`
						// is the same command, and the card's diff honestly stands in for
						// both.
						[replacementFix(context, 'safe', `Replace with ${replacement}`, match, replacement)]
					);
				})
			)
		);
	}
};

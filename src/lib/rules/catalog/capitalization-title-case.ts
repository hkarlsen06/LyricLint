import type { Diagnostic, RuleDefinition } from '$lib/core/types.js';
import { diagnostic, hasUnsupportedMarkup, maskedMarkupText } from './utils.js';

/**
 * Words, bounded by what a letter is rather than by `\b`. That escape is ASCII,
 * so `Ærlig` began at its second character and counted as lowercase, and `Café`
 * stopped at `Caf` — the two ways this rule misread every accented language it
 * was pointed at. A combining mark belongs to the letter in front of it.
 */
const WORD = /(?<![\p{L}\p{M}'’-])[\p{L}][\p{L}\p{M}'’-]*/gu;

function looksTitleCased(text: string): boolean {
	const words = Array.from(text.matchAll(WORD), (match) => match[0]);
	if (words.length < 4) {
		return false;
	}
	const eligible = words.slice(1).filter((word) => !/^(?:I|[A-Z]{2,})$/u.test(word));
	if (eligible.length < 3) {
		return false;
	}
	const capitalized = eligible.filter((word) => /^\p{Lu}/u.test(word)).length;
	return capitalized / eligible.length >= 0.85;
}

export const capitalizationTitleCaseRule: RuleDefinition = {
	id: 'capitalization.title-case',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-CAPS'],
	// Section-scoped: the rule needs two title-cased candidates in one section and
	// then reports on both, so typing line N+1 decides whether line N is flagged —
	// and `line` cannot help, because the card lands on a line the caret is not on.
	settlesOn: 'document',
	check(document) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			const candidates = section.lines.filter(
				(line) => !hasUnsupportedMarkup(line) && looksTitleCased(maskedMarkupText(line))
			);
			if (candidates.length < 2) {
				continue;
			}
			for (const line of candidates) {
				diagnostics.push(
					diagnostic(
						this,
						{ from: line.from, to: line.to },
						'This line may be capitalized like a title.',
						'Lyrics use conventional sentence capitalization rather than capitalizing every word. Review this manually because names, acronyms, and intentional styling can look similar.'
					)
				);
			}
		}
		return diagnostics;
	}
};

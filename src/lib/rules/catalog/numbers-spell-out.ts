import type { RuleDefinition } from '$lib/core/types.js';
import { isProseHeaderLine } from './section-header-prose.js';
import { diagnostic, matchesOutsideMarkup, replacementFix } from './utils.js';

export const numberWords = [
	'zero',
	'one',
	'two',
	'three',
	'four',
	'five',
	'six',
	'seven',
	'eight',
	'nine',
	'ten'
] as const;

function documentedNumericContext(text: string, from: number, to: number): boolean {
	const before = text.slice(Math.max(0, from - 2), from);
	const after = text.slice(to, Math.min(text.length, to + 6));
	// The trailing side mirrors the leading separators so the first digit of a
	// compound number such as `5.5` or `2-5` is exempt just like the last one.
	return /[$€£#:/.-]\s*$/u.test(before) || /^\s*(?:%|[:/.-]\d|a\.?m\.?|p\.?m\.?)/iu.test(after);
}

export const numbersSpellOutRule: RuleDefinition = {
	id: 'numbers.spell-out',
	version: 2,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-NUMBERS'],
	check(document, context) {
		if (context.language !== 'en') {
			return [];
		}
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				// The ordinal in a written-out label — `Verse 1:` — is part of a
				// header, not a number in a lyric, so spelling it out would produce
				// `Verse one:`. It is the very first thing on a pasted transcription,
				// which is the worst possible moment to be confidently wrong.
				if (isProseHeaderLine(line, context.language)) {
					return [];
				}
				return matchesOutsideMarkup(line, /(?<![\p{L}\p{N}_])(?:10|[0-9])(?![\p{L}\p{N}_])/gu)
					.filter((match) => {
						const localFrom = match.from - line.from;
						return !documentedNumericContext(line.text, localFrom, localFrom + match.text.length);
					})
					.map((match) => {
						const replacement = numberWords[Number.parseInt(match.text, 10)] ?? match.text;
						return diagnostic(
							this,
							match,
							`Consider spelling out “${match.text}” as “${replacement}”.`,
							'This small standalone number is outside the reviewed time, money, percentage, date, and compound-number exceptions. Delivery or naming can still matter, so the edit requires preview.',
							[
								replacementFix(
									context,
									'preview',
									`Replace with ${replacement}`,
									match,
									replacement
								)
							]
						);
					});
			})
		);
	}
};

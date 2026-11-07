import type { TextRange } from '#lib/core/types.js';
import { numberWords } from '#lib/rules/catalog/numbers-spell-out.js';

const units = `(?:${numberWords.slice(1, 10).join('|')})`;
const teens = 'eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen';
const tens = 'twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety';
const separator = '(?:[\\p{Zs}\\t]+|[-\\u2010\\u2011])';
const small = `(?:(?:${tens})(?:${separator}${units})?|${teens}|${numberWords.join('|')})`;
const hundred = `(?:(?:${units}|a)${separator})?hundred(?:${separator}(?:and${separator})?${small})?`;
const group = `(?:${hundred}|${small})`;
const thousand = `(?:(?:${group}|a)${separator})?thousand(?:${separator}(?:and${separator})?${group})?`;
const wordEdge = '[\\p{L}\\p{M}\\p{N}_\\u2010\\u2011-]';

/** Lexical spans only: values, usage and pronunciation still require explicit facts. */
export const englishQuantityPattern = new RegExp(
	`(?<!${wordEdge})(?:${thousand}|${group})(?!${wordEdge})`,
	'giu'
);
const aboveTenWord = new RegExp(`\\b(?:${teens}|${tens}|hundred|thousand)\\b`, 'iu');
const beforeWord = new RegExp(`${wordEdge}$`, 'u');
const afterWord = new RegExp(`^${wordEdge}`, 'u');

/** Already spelled small quantities do not add a review task on their own. */
export function needsEnglishQuantityReview(text: string): boolean {
	return aboveTenWord.test(text);
}

/** Masked markup must not become a separator inside a recognized phrase. */
export function isEnglishQuantityPhrase(text: string): boolean {
	const match = text.matchAll(englishQuantityPattern).next().value;
	return match?.index === 0 && match[0].length === text.length;
}

/** Raw explicit ownership boundaries stay separate even when tags share a policy family. */
export function quantityLanguageScopes(length: number, ranges: readonly TextRange[]): TextRange[] {
	const boundaries = [
		...new Set([0, length, ...ranges.flatMap(({ from, to }) => [from, to])])
	].sort((a, b) => a - b);
	return boundaries.slice(0, -1).flatMap((from, index) => {
		const to = boundaries[index + 1]!;
		return from < to ? [{ from, to }] : [];
	});
}

/** The same recognized phrase cannot be partly confirmed through a manual selection. */
export function isCompleteEnglishQuantitySelection(text: string, range: TextRange): boolean {
	if (!hasWholeEnglishQuantityWordEdges(text, range)) return false;
	for (const match of text.matchAll(englishQuantityPattern)) {
		const from = match.index;
		const to = from + match[0].length;
		if (range.from < to && from < range.to && (from < range.from || range.to < to)) return false;
	}
	return true;
}

/** Ownership boundaries cannot manufacture a word boundary inside the original text. */
export function hasWholeEnglishQuantityWordEdges(text: string, range: TextRange): boolean {
	return !beforeWord.test(text.slice(0, range.from)) && !afterWord.test(text.slice(range.to));
}

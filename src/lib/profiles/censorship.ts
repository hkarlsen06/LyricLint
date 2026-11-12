import type { TextRange } from '#lib/core/types.js';

/** Shared by explicit decisions and persisted details, with action-specific refusals. */
export function censoredPrefixProblem(prefix: string): string | undefined {
	if (prefix.length > 100) return 'The audible prefix is too long. Shorten it before previewing.';
	if (/\s/u.test(prefix)) return 'Use an audible prefix without spaces or line breaks.';
	if (/[[\]<>*]/u.test(prefix)) return 'Use the audible prefix without stars, brackets or markup.';
	return undefined;
}

export const censoredWordCandidate =
	/(?<![\p{L}\p{M}\p{N}_*])[\p{L}\p{M}*]+(?![\p{L}\p{M}\p{N}_*])/gu;

/** Classify a complete candidate without treating star-wrapped stage directions as words. */
export function isMaskedCensorCandidate(candidate: string): boolean {
	return (
		candidate.includes('*') &&
		(/\p{L}/u.test(candidate)
			? !(candidate.startsWith('*') && candidate.endsWith('*'))
			: /^\*{2,}$/u.test(candidate))
	);
}

export function isMaskedCensorRange(text: string, range: TextRange): boolean {
	for (const match of text.matchAll(censoredWordCandidate)) {
		if (match.index > range.from) return false;
		if (match.index === range.from)
			return match.index + match[0].length === range.to && isMaskedCensorCandidate(match[0]);
	}
	return false;
}

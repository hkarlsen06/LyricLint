import type { TextRange } from '#lib/core/types.js';

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

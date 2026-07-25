import type { RuleDefinition } from '$lib/core/types.js';
import { diagnostic, hasUnsupportedMarkup, maskedMarkupText } from './utils.js';

function looksProseLike(text: string): boolean {
	const words = text.trim().split(/\s+/u).filter(Boolean);
	const clauses = text.match(/[,;:.!?—]/gu)?.length ?? 0;
	const sentenceLike = text.match(/[.!?](?:\s|$)/gu)?.length ?? 0;
	return words.length >= 24 && (clauses >= 3 || sentenceLike >= 2);
}

export const lineProseDensityRule: RuleDefinition = {
	id: 'line.prose-density',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'none',
	sourceIds: ['G-LINES'],
	check(document) {
		return document.sections.flatMap((section) =>
			section.lines.flatMap((line) => {
				if (hasUnsupportedMarkup(line) || !looksProseLike(maskedMarkupText(line))) {
					return [];
				}
				return [
					diagnostic(
						this,
						line,
						'This line reads like several lyric lines combined.',
						'Multiple clauses and a high word count make the transcription look prose-like. There is no fixed character limit; listen for musical line breaks and split only when supported by phrasing.'
					)
				];
			})
		);
	}
};

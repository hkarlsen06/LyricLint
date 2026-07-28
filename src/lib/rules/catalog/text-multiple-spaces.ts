import type {
	Diagnostic,
	LyricLine,
	RuleDefinition,
	SupportedStyleSpan,
	TextRange
} from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

const MULTIPLE_SPACES = / {2,}/gu;
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}]/u;

function markerRanges(line: LyricLine): TextRange[] {
	return line.styleSpans
		.filter((span): span is SupportedStyleSpan => !('unsupported' in span))
		.flatMap((span) => [
			{ from: span.from, to: span.contentFrom },
			{ from: span.contentTo, to: span.to }
		]);
}

function characterBefore(
	text: string,
	line: LyricLine,
	offset: number,
	markers: readonly TextRange[]
): string | undefined {
	let cursor = offset;
	while (cursor > line.from) {
		const marker = markers.find((range) => range.from < cursor && cursor <= range.to);
		if (marker) {
			cursor = marker.from;
			continue;
		}
		return Array.from(text.slice(line.from, cursor)).at(-1);
	}
	return undefined;
}

function characterAfter(
	text: string,
	line: LyricLine,
	offset: number,
	markers: readonly TextRange[]
): string | undefined {
	let cursor = offset;
	while (cursor < line.to) {
		const marker = markers.find((range) => range.from <= cursor && cursor < range.to);
		if (marker) {
			cursor = marker.to;
			continue;
		}
		return Array.from(text.slice(cursor, line.to))[0];
	}
	return undefined;
}

function repeatedSpacesBetweenWords(documentText: string, line: LyricLine): TextRange[] {
	if (line.styleSpans.some((span) => 'unsupported' in span)) {
		return [];
	}

	const markers = markerRanges(line);
	return Array.from(line.text.matchAll(MULTIPLE_SPACES), (match) => ({
		from: line.from + match.index,
		to: line.from + match.index + match[0].length
	})).filter((range) => {
		const before = characterBefore(documentText, line, range.from, markers);
		const after = characterAfter(documentText, line, range.to, markers);
		return (
			before !== undefined &&
			after !== undefined &&
			WORD_CHARACTER.test(before) &&
			WORD_CHARACTER.test(after)
		);
	});
}

export const textMultipleSpacesRule: RuleDefinition = {
	id: 'text.multiple-spaces',
	version: 1,
	defaultSeverity: 'suggestion',
	fixability: 'safe',
	sourceIds: ['G-ADD-SONGS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		for (const section of document.sections) {
			for (const line of section.lines) {
				for (const range of repeatedSpacesBetweenWords(document.text, line)) {
					diagnostics.push(
						diagnostic(
							this,
							range,
							'Use one space between these words.',
							'Consecutive ordinary spaces between words are mechanically detectable formatting residue. Genius does not state an exact one-space rule, so LyricLint treats this as a text-hygiene suggestion.',
							[replacementFix(context, 'safe', 'Use one space', range, ' ')]
						)
					);
				}
			}
		}
		return diagnostics;
	}
};

import type { AnnotationSpan } from './types.js';

/**
 * The annotation link shape Genius embeds in editable lyrics: a bracketed
 * fragment followed immediately by a parenthesized numeric id. The fragment
 * excludes brackets — an annotation cannot nest — and the character class
 * deliberately admits line breaks, because a referent may span lines. The id
 * is digits only: a bracketed run followed by any other parenthetical is a
 * lyric with punctuation, not an annotation.
 */
const ANNOTATION_PATTERN = /\[([^[\]]*)\]\((\d+)\)/gu;

/**
 * Every annotation link in the text, in document order.
 *
 * This is the one recognizer of the annotation shape. The parser calls it to
 * classify lines (an annotation's opening bracket is never a section
 * header's), the editor dims the delimiters from its result, and anything
 * else that needs to know where annotations sit reads `ParsedDocument.annotations`
 * rather than matching brackets of its own.
 */
export function scanAnnotations(text: string): AnnotationSpan[] {
	const spans: AnnotationSpan[] = [];
	for (const match of text.matchAll(ANNOTATION_PATTERN)) {
		const from = match.index;
		const fragment = match[1] ?? '';
		const fragmentFrom = from + 1;
		const to = from + match[0].length;
		spans.push({
			from,
			to,
			fragmentRange: { from: fragmentFrom, to: fragmentFrom + fragment.length },
			idRange: { from: fragmentFrom + fragment.length + 2, to: to - 1 },
			id: Number.parseInt(match[2] ?? '', 10)
		});
	}
	return spans;
}

import type {
	Diagnostic,
	LyricLine,
	RuleDefinition,
	SupportedStyleSpan,
	TextRange
} from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

function supportedSpans(line: LyricLine): SupportedStyleSpan[] {
	return line.styleSpans.filter((span): span is SupportedStyleSpan => !('unsupported' in span));
}

/**
 * Whether the `(` at `from` is matched by the `)` at `to - 1`, so the whole
 * range is one parenthetical rather than `(a) (b)`.
 */
function enclosesOnePair(text: string, from: number, to: number): boolean {
	let depth = 0;
	for (let index = from; index < to; index += 1) {
		if (text[index] === '(') {
			depth += 1;
		} else if (text[index] === ')') {
			depth -= 1;
			if (depth === 0) {
				return index === to - 1;
			}
		}
	}
	return false;
}

function trimmedSpan(text: string, from: number, to: number): TextRange {
	let start = from;
	let end = to;
	while (start < end && /\s/u.test(text[start] ?? '')) {
		start += 1;
	}
	while (end > start && /\s/u.test(text[end - 1] ?? '')) {
		end -= 1;
	}
	return { from: start, to: end };
}

export const performerParentheticalBoundaryRule: RuleDefinition = {
	id: 'performer.parenthetical-boundary',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];

		for (const section of document.sections) {
			for (const line of section.lines) {
				if (line.styleSpans.some((span) => 'unsupported' in span)) {
					continue;
				}

				for (const span of supportedSpans(line)) {
					if (span.slot === 1 || span.continuedFromPreviousLine || span.continuesToNextLine) {
						continue;
					}

					// Only a wrapper whose content is exactly one parenthetical is
					// unambiguous. A parenthetical inside a longer styled run is that
					// performer's own passage, and the guide says nothing about it.
					const content = trimmedSpan(document.text, span.contentFrom, span.contentTo);
					if (
						content.to - content.from < 2 ||
						document.text[content.from] !== '(' ||
						document.text[content.to - 1] !== ')' ||
						!enclosesOnePair(document.text, content.from, content.to)
					) {
						continue;
					}
					const inner = document.text.slice(content.from + 1, content.to - 1);
					if (inner.trim().length === 0 || inner.includes('<')) {
						continue;
					}

					const opening = document.text.slice(span.from, span.contentFrom);
					const closing = document.text.slice(span.contentTo, span.to);
					const lead = document.text.slice(span.contentFrom, content.from);
					const trail = document.text.slice(content.to, span.contentTo);
					const innerBody = trimmedSpan(document.text, content.from + 1, content.to - 1);
					const innerLead = document.text.slice(content.from + 1, innerBody.from);
					const innerTrail = document.text.slice(innerBody.to, content.to - 1);
					const body = document.text.slice(innerBody.from, innerBody.to);

					diagnostics.push(
						diagnostic(
							this,
							{ from: span.from, to: span.to },
							'Keep the parentheses outside this performer formatting.',
							'The reviewed guide styles only the words of a parenthetical and leaves both parentheses plain — the performer’s italics or bold sit just inside them. This wrapper carries the parentheses along with the words.',
							[
								replacementFix(
									context,
									'safe',
									'Move formatting inside the parentheses',
									{ from: span.from, to: span.to },
									`${lead}(${innerLead}${opening}${body}${closing}${innerTrail})${trail}`
								)
							]
						)
					);
				}
			}
		}

		return diagnostics;
	}
};

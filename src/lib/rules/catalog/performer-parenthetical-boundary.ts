import type {
	Diagnostic,
	LyricLine,
	RuleDefinition,
	StyleSlot,
	SupportedStyleSpan,
	TextRange
} from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

const wrappers: Record<Exclude<StyleSlot, 1>, { opening: string; closing: string }> = {
	2: { opening: '<i>', closing: '</i>' },
	3: { opening: '<b>', closing: '</b>' },
	4: { opening: '<i><b>', closing: '</b></i>' }
};

interface ParenthesisPair {
	open: number;
	close: number;
}

function supportedSpans(line: LyricLine): SupportedStyleSpan[] {
	return line.styleSpans.filter((span): span is SupportedStyleSpan => !('unsupported' in span));
}

function parenthesisPairs(text: string): ParenthesisPair[] {
	const stack: number[] = [];
	const pairs: ParenthesisPair[] = [];

	for (let index = 0; index < text.length; index += 1) {
		if (text[index] === '(') {
			stack.push(index);
		} else if (text[index] === ')') {
			const open = stack.pop();
			if (open !== undefined) {
				pairs.push({ open, close: index });
			}
		}
	}

	return pairs;
}

function contains(range: TextRange, offset: number): boolean {
	return range.from <= offset && offset < range.to;
}

function removeRanges(text: string, absoluteFrom: number, ranges: readonly TextRange[]): string {
	let output = text;
	for (const range of [...ranges].sort((left, right) => right.from - left.from)) {
		const from = range.from - absoluteFrom;
		const to = range.to - absoluteFrom;
		output = `${output.slice(0, from)}${output.slice(to)}`;
	}
	return output;
}

function candidateForPair(
	documentText: string,
	line: LyricLine,
	spans: readonly SupportedStyleSpan[],
	pair: ParenthesisPair
):
	| {
			range: TextRange;
			editRange: TextRange;
			replacement: string;
	  }
	| undefined {
	const open = line.from + pair.open;
	const close = line.from + pair.close;
	const markerRanges = spans.flatMap((span) => [
		{ from: span.from, to: span.contentFrom },
		{ from: span.contentTo, to: span.to }
	]);
	const slotAt = (offset: number): StyleSlot | undefined =>
		spans.find((span) => span.contentFrom <= offset && offset < span.contentTo)?.slot;

	let slot: Exclude<StyleSlot, 1> | undefined;
	for (let offset = open + 1; offset < close; offset += 1) {
		if (
			markerRanges.some((range) => contains(range, offset)) ||
			/\s/u.test(documentText[offset] ?? '')
		) {
			continue;
		}

		const contentSlot = slotAt(offset);
		if (!contentSlot || contentSlot === 1 || (slot !== undefined && contentSlot !== slot)) {
			return undefined;
		}
		slot = contentSlot;
	}

	if (!slot) {
		return undefined;
	}

	const openSlot = slotAt(open);
	const closeSlot = slotAt(close);
	if (
		(openSlot !== undefined && openSlot !== slot) ||
		(closeSlot !== undefined && closeSlot !== slot) ||
		(openSlot === slot && closeSlot === slot)
	) {
		return undefined;
	}

	const relevantSpans = spans.filter(
		(span) => span.slot === slot && span.contentFrom < close && span.contentTo > open + 1
	);
	if (
		relevantSpans.length === 0 ||
		relevantSpans.some((span) => span.continuedFromPreviousLine || span.continuesToNextLine)
	) {
		return undefined;
	}

	const editRange = {
		from: Math.min(open, ...relevantSpans.map((span) => span.from)),
		to: Math.max(close + 1, ...relevantSpans.map((span) => span.to))
	};
	const spansToUnwrap = spans.filter(
		(span) => span.slot === slot && span.from >= editRange.from && span.to <= editRange.to
	);
	const tagRanges = spansToUnwrap.flatMap((span) => [
		{ from: span.from, to: span.contentFrom },
		{ from: span.contentTo, to: span.to }
	]);
	const unwrapped = removeRanges(
		documentText.slice(editRange.from, editRange.to),
		editRange.from,
		tagRanges
	);
	const wrapper = wrappers[slot];

	return {
		range: { from: open, to: close + 1 },
		editRange,
		replacement: `${wrapper.opening}${unwrapped}${wrapper.closing}`
	};
}

export const performerParentheticalBoundaryRule: RuleDefinition = {
	id: 'performer.parenthetical-boundary',
	version: 1,
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

				const spans = supportedSpans(line);
				for (const pair of parenthesisPairs(line.text)) {
					const candidate = candidateForPair(document.text, line, spans, pair);
					if (!candidate) {
						continue;
					}

					diagnostics.push(
						diagnostic(
							this,
							candidate.range,
							'Include the parentheses in this performer formatting.',
							'Everything inside this parenthetical belongs to one styled performer. Leaving either delimiter outside the wrapper assigns that punctuation to the section’s plain performer.',
							[
								replacementFix(
									context,
									'safe',
									'Include parentheses in performer formatting',
									candidate.editRange,
									candidate.replacement
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

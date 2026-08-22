import type {
	StyleSlot,
	SupportedStyleSpan,
	TextRange,
	UnsupportedStyleSpan,
	VoiceSpan
} from './types.js';

interface SupportedWrapper {
	slot: StyleSlot;
	openingTag: string;
	closingTag: string;
}

const SUPPORTED_WRAPPERS: readonly SupportedWrapper[] = [
	{
		slot: 4,
		openingTag: '<i><b>',
		closingTag: '</b></i>'
	},
	{
		slot: 2,
		openingTag: '<i>',
		closingTag: '</i>'
	},
	{
		slot: 3,
		openingTag: '<b>',
		closingTag: '</b>'
	}
];

const SUPPORTED_TAGS = new Set(['<i>', '</i>', '<b>', '</b>']);

function isMalformedSupportedTagPrefix(value: string): boolean {
	return /^<\/?[ib](?:\s[^>]*)?$/iu.test(value);
}

/**
 * The two probes above, anchored at an offset instead of at the start of a
 * fresh string. Sticky rather than sliced: a section dense in `<3` copied the
 * whole remaining body once per `<`, which is quadratic in the section's own
 * length on every keystroke. `$` still means the end of the text, which is what
 * the prefix probe was asking about when it read `remaining` to its end.
 */
const TAG_LIKE_AT = /<\/?[A-Za-z][^>]*>/uy;
const MALFORMED_PREFIX_AT = /<\/?[ib](?:\s[^>]*)?$/iuy;

function findNextMarkupStart(text: string, localFrom: number): number {
	let candidate = text.indexOf('<', localFrom);

	while (candidate !== -1) {
		TAG_LIKE_AT.lastIndex = candidate;
		MALFORMED_PREFIX_AT.lastIndex = candidate;
		if (TAG_LIKE_AT.test(text) || MALFORMED_PREFIX_AT.test(text)) {
			return candidate;
		}
		candidate = text.indexOf('<', candidate + 1);
	}

	return -1;
}

function containsTagLikeMarkup(text: string): boolean {
	return findNextMarkupStart(text, 0) !== -1;
}

function readSupportedSpan(
	lineText: string,
	localFrom: number,
	lineFrom: number
): SupportedStyleSpan | undefined {
	for (const wrapper of SUPPORTED_WRAPPERS) {
		if (!lineText.startsWith(wrapper.openingTag, localFrom)) {
			continue;
		}

		const contentStart = localFrom + wrapper.openingTag.length;
		const closingStart = lineText.indexOf(wrapper.closingTag, contentStart);
		if (closingStart === -1) {
			continue;
		}

		const content = lineText.slice(contentStart, closingStart);
		if (containsTagLikeMarkup(content)) {
			continue;
		}

		const localTo = closingStart + wrapper.closingTag.length;
		return {
			from: lineFrom + localFrom,
			to: lineFrom + localTo,
			slot: wrapper.slot,
			rawTag: wrapper.openingTag,
			contentFrom: lineFrom + contentStart,
			contentTo: lineFrom + closingStart,
			closingTag: wrapper.closingTag
		};
	}

	return undefined;
}

function readUnsupportedSpan(
	lineText: string,
	localFrom: number,
	lineFrom: number
): UnsupportedStyleSpan {
	const closingBracket = lineText.indexOf('>', localFrom + 1);
	const localTo = closingBracket === -1 ? lineText.length : closingBracket + 1;
	const rawTag = lineText.slice(localFrom, localTo);

	return {
		from: lineFrom + localFrom,
		to: lineFrom + localTo,
		unsupported: true,
		rawTag,
		reason:
			SUPPORTED_TAGS.has(rawTag) || isMalformedSupportedTagPrefix(rawTag)
				? 'malformed-markup'
				: 'unsupported-tag'
	};
}

/**
 * Extract supported voice wrappers and unsupported markup from one physical line.
 *
 * The returned ranges are absolute UTF-16 offsets. Supported span ranges cover
 * the entire wrapper, while `contentFrom` and `contentTo` identify the styled
 * text. Unsupported spans cover the exact literal fragment that could not be
 * interpreted. The input string is never normalized or rewritten.
 */
export function extractLineStyleSpans(lineText: string, lineRange: TextRange): VoiceSpan[] {
	const spans: VoiceSpan[] = [];
	let localOffset = 0;

	while (localOffset < lineText.length) {
		const openingBracket = findNextMarkupStart(lineText, localOffset);
		if (openingBracket === -1) {
			break;
		}

		const supported = readSupportedSpan(lineText, openingBracket, lineRange.from);
		if (supported) {
			spans.push(supported);
			localOffset = supported.to - lineRange.from;
			continue;
		}

		const unsupported = readUnsupportedSpan(lineText, openingBracket, lineRange.from);
		spans.push(unsupported);
		localOffset = unsupported.to - lineRange.from;
	}

	return spans;
}

/**
 * Parse performer wrappers across a section body, then project each supported
 * wrapper back onto the physical lines it touches. Genius commonly keeps one
 * `<i>`/`<b>` wrapper open across several lyric lines, so line breaks are
 * content boundaries, not implicit closing tags.
 */
export function extractSectionStyleSpans(
	documentText: string,
	lineRanges: readonly TextRange[]
): VoiceSpan[][] {
	const byLine = lineRanges.map((): VoiceSpan[] => []);
	const first = lineRanges[0];
	const last = lineRanges.at(-1);
	if (!first || !last) {
		return byLine;
	}

	const bodyText = documentText.slice(first.from, last.to);
	const spans = extractLineStyleSpans(bodyText, { from: first.from, to: last.to });

	for (const span of spans) {
		if ('unsupported' in span) {
			const lineIndex = lineRanges.findIndex(
				(line) => line.from <= span.from && span.from <= line.to
			);
			if (lineIndex >= 0) {
				byLine[lineIndex]?.push(span);
			}
			continue;
		}

		for (let index = 0; index < lineRanges.length; index += 1) {
			const line = lineRanges[index];
			if (!line || span.to <= line.from || span.from >= line.to) {
				continue;
			}

			const from = Math.max(span.from, line.from);
			const to = Math.min(span.to, line.to);
			const contentFrom = Math.max(span.contentFrom, line.from);
			const contentTo = Math.min(span.contentTo, line.to);
			if (from >= to || contentFrom > contentTo) {
				continue;
			}

			const projected: SupportedStyleSpan = {
				from,
				to,
				slot: span.slot,
				rawTag: span.from >= line.from ? span.rawTag : '',
				contentFrom,
				contentTo,
				closingTag: span.to <= line.to ? span.closingTag : ''
			};
			if (span.from < line.from) projected.continuedFromPreviousLine = true;
			if (span.to > line.to) projected.continuesToNextLine = true;
			byLine[index]?.push(projected);
		}
	}

	for (const lineSpans of byLine) {
		lineSpans.sort((left, right) => left.from - right.from || left.to - right.to);
	}
	return byLine;
}

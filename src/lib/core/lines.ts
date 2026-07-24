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

function findNextMarkupStart(text: string, localFrom: number): number {
	let candidate = text.indexOf('<', localFrom);

	while (candidate !== -1) {
		const remaining = text.slice(candidate);
		if (/^<\/?[A-Za-z][^>]*>/u.test(remaining) || isMalformedSupportedTagPrefix(remaining)) {
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

/** Alias used by rule and performer workers for per-line voice markup scanning. */
export const extractStyleSpans = extractLineStyleSpans;

import type { AmbiguousAmpersand, LegendVoiceGroup, StyleSlot, TextRange } from './types.js';

interface LocalRange {
	from: number;
	to: number;
}

interface ParsedCandidate {
	styleSlot: StyleSlot;
	name: string;
	nameRange: LocalRange;
	markupSupported: boolean;
}

interface LegendWrapper {
	slot: StyleSlot;
	openingTag: string;
	closingTag: string;
}

const LEGEND_WRAPPERS: readonly LegendWrapper[] = [
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

function trimRange(raw: string, range: LocalRange): LocalRange {
	let from = range.from;
	let to = range.to;

	while (from < to && /\s/u.test(raw[from] ?? '')) {
		from += 1;
	}
	while (to > from && /\s/u.test(raw[to - 1] ?? '')) {
		to -= 1;
	}

	return { from, to };
}

function topLevelSeparatorOffsets(raw: string, range: LocalRange, separator: string): number[] {
	const offsets: number[] = [];
	const tagStack: string[] = [];
	let cursor = range.from;

	while (cursor < range.to) {
		if (raw[cursor] === '<') {
			const tagEnd = raw.indexOf('>', cursor + 1);
			if (tagEnd !== -1 && tagEnd < range.to) {
				const token = raw.slice(cursor, tagEnd + 1);
				const closingMatch = /^<\/([A-Za-z][\w-]*)>$/u.exec(token);
				const openingMatch = /^<([A-Za-z][\w-]*)>$/u.exec(token);

				if (closingMatch) {
					if (tagStack.at(-1) === closingMatch[1]) {
						tagStack.pop();
					}
				} else if (openingMatch) {
					tagStack.push(openingMatch[1] ?? '');
				}

				cursor = tagEnd + 1;
				continue;
			}
		}

		if (tagStack.length === 0 && raw.startsWith(separator, cursor)) {
			offsets.push(cursor);
			cursor += separator.length;
			continue;
		}

		cursor += 1;
	}

	return offsets;
}

function parseCandidate(raw: string, range: LocalRange): ParsedCandidate {
	const candidate = raw.slice(range.from, range.to);

	for (const wrapper of LEGEND_WRAPPERS) {
		if (!candidate.startsWith(wrapper.openingTag) || !candidate.endsWith(wrapper.closingTag)) {
			continue;
		}

		const localNameFrom = wrapper.openingTag.length;
		const localNameTo = candidate.length - wrapper.closingTag.length;
		const name = candidate.slice(localNameFrom, localNameTo);
		const containsMarkup = /<[^>]*>/u.test(name) || name.includes('<');

		if (!containsMarkup) {
			return {
				styleSlot: wrapper.slot,
				name,
				nameRange: {
					from: range.from + localNameFrom,
					to: range.from + localNameTo
				},
				markupSupported: true
			};
		}
	}

	const containsMarkup = /<[^>]*>/u.test(candidate) || candidate.includes('<');
	return {
		styleSlot: 1,
		name: candidate,
		nameRange: range,
		markupSupported: !containsMarkup
	};
}

function splitDifferentlyStyledAmpersand(raw: string, range: LocalRange): LocalRange[] {
	const ampersands = topLevelSeparatorOffsets(raw, range, '&');

	for (const ampersand of ampersands) {
		const left = trimRange(raw, { from: range.from, to: ampersand });
		const right = trimRange(raw, { from: ampersand + 1, to: range.to });
		if (left.from === left.to || right.from === right.to) {
			continue;
		}

		const leftCandidate = parseCandidate(raw, left);
		const rightCandidate = parseCandidate(raw, right);
		if (
			leftCandidate.markupSupported &&
			rightCandidate.markupSupported &&
			leftCandidate.styleSlot !== rightCandidate.styleSlot
		) {
			return [left, right];
		}
	}

	return [range];
}

function splitLegend(raw: string): LocalRange[] {
	const wholeRange = { from: 0, to: raw.length };
	const commaOffsets = topLevelSeparatorOffsets(raw, wholeRange, ',');
	const commaSegments: LocalRange[] = [];
	let segmentFrom = 0;

	for (const comma of commaOffsets) {
		commaSegments.push(trimRange(raw, { from: segmentFrom, to: comma }));
		segmentFrom = comma + 1;
	}
	commaSegments.push(trimRange(raw, { from: segmentFrom, to: raw.length }));

	return commaSegments
		.filter((range) => range.from < range.to)
		.flatMap((range) => splitDifferentlyStyledAmpersand(raw, range));
}

function findAmbiguousAmpersands(
	rawNameText: string,
	nameFrom: number,
	offset: number
): AmbiguousAmpersand[] {
	const ampersands: AmbiguousAmpersand[] = [];
	let localOffset = rawNameText.indexOf('&');

	while (localOffset !== -1) {
		const from = offset + nameFrom + localOffset;
		ampersands.push({ from, to: from + 1, raw: '&' });
		localOffset = rawNameText.indexOf('&', localOffset + 1);
	}

	return ampersands;
}

/**
 * Parse a raw section-header legend into ordered, lossless voice candidates.
 *
 * Commas split top-level candidates. A top-level ampersand splits candidates
 * only when the adjacent segments use different style slots. Ampersands inside
 * one style run remain part of `rawNameText` and are marked as ambiguous.
 */
export function parseLegend(raw: string, offset = 0): LegendVoiceGroup[] {
	const ranges = splitLegend(raw);
	return ranges.map((range, index) => {
		const candidate = parseCandidate(raw, range);
		const nameRange: TextRange = {
			from: offset + candidate.nameRange.from,
			to: offset + candidate.nameRange.to
		};

		return {
			from: offset + range.from,
			to: offset + range.to,
			styleSlot: candidate.styleSlot,
			raw: raw.slice(range.from, range.to),
			rawNameText: candidate.name,
			nameRange,
			ambiguousAmpersands: findAmbiguousAmpersands(
				candidate.name,
				candidate.nameRange.from,
				offset
			),
			markupSupported: candidate.markupSupported,
			separatorBefore:
				index === 0 ? undefined : raw.slice(ranges[index - 1]?.to ?? range.from, range.from)
		};
	});
}

function serializeGroup(group: Pick<LegendVoiceGroup, 'rawNameText' | 'styleSlot'>): string {
	switch (group.styleSlot) {
		case 1:
			return group.rawNameText;
		case 2:
			return `<i>${group.rawNameText}</i>`;
		case 3:
			return `<b>${group.rawNameText}</b>`;
		case 4:
			return `<i><b>${group.rawNameText}</b></i>`;
	}
}

/**
 * Serialize ordered voice groups using Genius' four style slots.
 *
 * Groups are comma-separated, with ` & ` before the final group. Ampersands
 * already present inside a group's exact raw name remain inside its style run.
 */
export function serializeLegend(
	groups: readonly Pick<LegendVoiceGroup, 'rawNameText' | 'separatorBefore' | 'styleSlot'>[]
): string {
	const serialized = groups.map(serializeGroup);
	if (serialized.length < 2) {
		return serialized[0] ?? '';
	}

	if (groups.slice(1).every((group) => group.separatorBefore !== undefined)) {
		return serialized
			.map((group, index) =>
				index === 0 ? group : `${groups[index]?.separatorBefore ?? ''}${group}`
			)
			.join('');
	}

	return `${serialized.slice(0, -1).join(', ')} & ${serialized.at(-1)}`;
}

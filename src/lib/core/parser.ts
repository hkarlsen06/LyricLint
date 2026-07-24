import { parseLegend } from './legend.js';
import { extractSectionStyleSpans } from './lines.js';
import type {
	LineEndingKind,
	LyricLine,
	ParseIssue,
	ParsedDocument,
	Section,
	SectionHeader,
	TextRange,
	VoiceGroup
} from './types.js';

interface PhysicalLine extends TextRange {
	text: string;
	lineEnding: LineEndingKind;
	lineEndingRange: TextRange;
}

interface HeaderParseResult {
	header: SectionHeader;
	issues: ParseIssue[];
}

interface MutableSection {
	from: number;
	to: number;
	header?: SectionHeader;
	lines: LyricLine[];
}

function scanPhysicalLines(text: string): PhysicalLine[] {
	const lines: PhysicalLine[] = [];
	let from = 0;

	while (from < text.length) {
		let cursor = from;
		while (cursor < text.length && text[cursor] !== '\n' && text[cursor] !== '\r') {
			cursor += 1;
		}

		const to = cursor;
		let lineEnding: LineEndingKind = 'none';
		let lineEndingTo = cursor;

		if (text[cursor] === '\r' && text[cursor + 1] === '\n') {
			lineEnding = 'crlf';
			lineEndingTo = cursor + 2;
		} else if (text[cursor] === '\r') {
			lineEnding = 'cr';
			lineEndingTo = cursor + 1;
		} else if (text[cursor] === '\n') {
			lineEnding = 'lf';
			lineEndingTo = cursor + 1;
		}

		lines.push({
			from,
			to,
			text: text.slice(from, to),
			lineEnding,
			lineEndingRange: { from: to, to: lineEndingTo }
		});

		if (lineEnding === 'none') {
			break;
		}
		from = lineEndingTo;
	}

	return lines;
}

function trimmedRange(text: string, from: number, to: number): TextRange {
	let trimmedFrom = from;
	let trimmedTo = to;

	while (trimmedFrom < trimmedTo && /\s/u.test(text[trimmedFrom] ?? '')) {
		trimmedFrom += 1;
	}
	while (trimmedTo > trimmedFrom && /\s/u.test(text[trimmedTo - 1] ?? '')) {
		trimmedTo -= 1;
	}

	return { from: trimmedFrom, to: trimmedTo };
}

function isHeaderCandidate(line: PhysicalLine): boolean {
	const trimmed = line.text.trim();
	if (!trimmed.startsWith('[')) {
		return false;
	}

	return trimmed.endsWith(']') || !trimmed.includes(']');
}

function parseHeaderName(
	text: string,
	range: TextRange
): Pick<
	SectionHeader,
	'name' | 'namePart' | 'nameRange' | 'rawNamePart' | 'ordinal' | 'ordinalRange'
> {
	const rawNamePart = text.slice(range.from, range.to);
	const ordinalMatch = /^(.*?)(?:\s+(\d+))$/u.exec(rawNamePart);

	if (!ordinalMatch) {
		return {
			name: rawNamePart,
			namePart: rawNamePart,
			nameRange: range,
			rawNamePart
		};
	}

	const name = ordinalMatch[1] ?? '';
	const ordinalText = ordinalMatch[2] ?? '';
	const ordinalFrom = range.to - ordinalText.length;

	return {
		name,
		namePart: name,
		nameRange: { from: range.from, to: range.from + name.length },
		rawNamePart,
		ordinal: Number.parseInt(ordinalText, 10),
		ordinalRange: { from: ordinalFrom, to: range.to }
	};
}

function parseSectionHeader(text: string, line: PhysicalLine): HeaderParseResult {
	const trimmedLine = trimmedRange(text, line.from, line.to);
	const closed = text[trimmedLine.to - 1] === ']';
	const headerTo = trimmedLine.to;
	const contentFrom = trimmedLine.from + 1;
	const contentTo = closed ? headerTo - 1 : headerTo;
	const colon = text.indexOf(':', contentFrom);
	const colonInHeader = colon !== -1 && colon < contentTo ? colon : undefined;
	const rawNameRange = trimmedRange(text, contentFrom, colonInHeader ?? contentTo);
	const parsedName = parseHeaderName(text, rawNameRange);
	let legend: string | undefined;
	let legendRange: TextRange | undefined;

	if (colonInHeader !== undefined) {
		legendRange = trimmedRange(text, colonInHeader + 1, contentTo);
		legend = text.slice(legendRange.from, legendRange.to);
	}

	const legendGroups = legendRange ? parseLegend(legend ?? '', legendRange.from) : [];
	const header: SectionHeader = {
		from: trimmedLine.from,
		to: headerTo,
		raw: text.slice(trimmedLine.from, headerTo),
		...parsedName,
		legend,
		legendRange,
		legendGroups,
		closed
	};
	const issues: ParseIssue[] = [];

	if (!closed) {
		issues.push({
			code: 'unbalanced-section-bracket',
			from: headerTo,
			to: headerTo,
			message: 'Section header is missing a closing bracket.',
			raw: ''
		});
	}

	return { header, issues };
}

function parseLyricLine(line: PhysicalLine): LyricLine {
	return {
		from: line.from,
		to: line.to,
		text: line.text,
		lineEnding: line.lineEnding,
		lineEndingRange: line.lineEndingRange,
		styleSpans: []
	};
}

function parseSectionBodyMarkup(
	text: string,
	sections: readonly Section[],
	issues: ParseIssue[]
): void {
	for (const section of sections) {
		const spansByLine = extractSectionStyleSpans(text, section.lines);
		for (let index = 0; index < section.lines.length; index += 1) {
			const line = section.lines[index];
			if (!line) continue;
			line.styleSpans = spansByLine[index] ?? [];

			for (const span of line.styleSpans) {
				if (!('unsupported' in span)) {
					continue;
				}
				issues.push({
					code: span.reason === 'unsupported-tag' ? 'unsupported-markup' : 'malformed-markup',
					from: span.from,
					to: span.to,
					message:
						span.reason === 'unsupported-tag'
							? 'This markup is not a supported Genius performer style.'
							: 'This performer markup is malformed or mis-nested.',
					raw: span.rawTag
				});
			}
		}
	}
}

function resolvedSyntaxGroups(header: SectionHeader | undefined): VoiceGroup[] {
	return (
		header?.legendGroups.map((group) => ({
			id: `legend:${group.from}:${group.to}`,
			performerIds: [],
			styleSlot: group.styleSlot,
			rawNameText: group.rawNameText,
			sourceRange: { from: group.from, to: group.to },
			ambiguousAmpersands: group.ambiguousAmpersands
		})) ?? []
	);
}

function finishSection(section: MutableSection | undefined, sections: Section[]): void {
	if (!section) {
		return;
	}

	sections.push({
		from: section.from,
		to: section.to,
		header: section.header,
		language: 'und',
		voiceGroups: resolvedSyntaxGroups(section.header),
		lines: section.lines
	});
}

/**
 * Parse canonical lyric text into a recoverable, framework-independent model.
 *
 * Parsing is lossless: the original string is retained as `text`, no line
 * endings or Unicode are normalized, and all ranges use half-open UTF-16
 * offsets. Blank physical lines and subsequent headers close the current
 * section. Malformed header and voice markup is reported without being dropped.
 */
export function parseDocument(text: string): ParsedDocument {
	const sections: Section[] = [];
	const syntaxIssues: ParseIssue[] = [];
	let current: MutableSection | undefined;

	for (const line of scanPhysicalLines(text)) {
		if (line.text.trim().length === 0) {
			finishSection(current, sections);
			current = undefined;
			continue;
		}

		if (isHeaderCandidate(line)) {
			finishSection(current, sections);
			const { header, issues } = parseSectionHeader(text, line);
			syntaxIssues.push(...issues);
			current = {
				from: line.from,
				to: line.to,
				header,
				lines: []
			};
			continue;
		}

		const lyricLine = parseLyricLine(line);
		if (!current) {
			current = {
				from: line.from,
				to: line.to,
				lines: [lyricLine]
			};
		} else {
			current.lines.push(lyricLine);
			current.to = line.to;
		}
	}

	finishSection(current, sections);
	parseSectionBodyMarkup(text, sections, syntaxIssues);
	return { text, sections, syntaxIssues };
}

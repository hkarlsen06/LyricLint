import type { LinkPassageOccurrence, LinkPassageRecord, SectionLink } from './types.js';

/** Only the keys this boundary parser reads; none has a trusted value yet. */
interface LinkPayload {
	members?: unknown;
	headerLine?: unknown;
	line?: unknown;
	column?: unknown;
	endLine?: unknown;
	endColumn?: unknown;
}

function object(value: unknown): value is LinkPayload {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * Read the passage format atomically. An invalid connection must never turn into
 * a legacy link that synchronizes everything. Text is optional for the clipboard's
 * first parse; its paste validates again against the actual plain-text fragment.
 * Coordinates retain the caller's line base (drafts: 1; clipboard: 0).
 */
export function validateLinkPassages(
	value: { passages?: unknown; detached?: unknown },
	lines: readonly number[],
	lineTexts?: readonly string[],
	lineBase = 1,
	lineCount = lineTexts?.length ?? Number.MAX_SAFE_INTEGER
): Pick<SectionLink, 'passages' | 'detached'> {
	if (value.passages === undefined && value.detached === undefined) return {};
	const suspended = { passages: [] };
	if (
		!Array.isArray(value.passages) ||
		(value.detached !== undefined && !Array.isArray(value.detached))
	) {
		return suspended;
	}
	if (new Set(lines).size !== lines.length) return suspended;
	const headers = new Set(lines);
	function read(raw: LinkPayload): LinkPassageOccurrence | undefined {
		const { headerLine, line, column, endLine, endColumn } = raw;
		if (
			!integer(headerLine) ||
			!headers.has(headerLine) ||
			!integer(line) ||
			!integer(column) ||
			!integer(endLine) ||
			!integer(endColumn) ||
			line < headerLine ||
			line < lineBase ||
			endLine >= lineBase + lineCount ||
			column < 0 ||
			endColumn < 0 ||
			endLine < line ||
			(line === endLine && endColumn < column)
		)
			return undefined;
		const nextHeader = lines.filter((header) => header > headerLine).sort((a, b) => a - b)[0];
		if (nextHeader !== undefined && endLine >= nextHeader) return undefined;
		if (
			lineTexts &&
			(column > (lineTexts[line - lineBase]?.length ?? -1) ||
				endColumn > (lineTexts[endLine - lineBase]?.length ?? -1) ||
				(line === headerLine && column < (lineTexts[line - lineBase]?.length ?? 0)))
		)
			return undefined;
		return { headerLine, line, column, endLine, endColumn };
	}
	function text(member: LinkPassageOccurrence): string | undefined {
		if (!lineTexts) return undefined;
		const selected = lineTexts.slice(member.line - lineBase, member.endLine - lineBase + 1);
		if (selected.length === 1) return selected[0]?.slice(member.column, member.endColumn);
		selected[0] = selected[0]!.slice(member.column);
		selected[selected.length - 1] = selected[selected.length - 1]!.slice(0, member.endColumn);
		return selected.join('\n');
	}
	const passages: LinkPassageRecord[] = [];
	for (const raw of value.passages) {
		if (!object(raw) || !Array.isArray(raw.members) || raw.members.length < 2) return suspended;
		const members = raw.members.map((member) => (object(member) ? read(member) : undefined));
		if (members.some((member) => !member)) return suspended;
		const kept = members.filter((member): member is LinkPassageOccurrence => member !== undefined);
		if (
			new Set(kept.map((member) => member.headerLine)).size !== kept.length ||
			kept.some((member) => text(member) !== text(kept[0]!))
		)
			return suspended;
		passages.push({ members: kept });
	}
	const detached: LinkPassageOccurrence[] = [];
	for (const raw of value.detached ?? []) {
		const member = object(raw) ? read(raw) : undefined;
		if (!member) return suspended;
		detached.push(member);
	}
	// A position cannot have two owners: overlapping connections would apply a
	// single keystroke twice. Adjacent passages can share a boundary.
	const occurrences = [...passages.flatMap((passage) => passage.members), ...detached];
	occurrences.sort(
		(a, b) =>
			a.headerLine - b.headerLine ||
			a.line - b.line ||
			a.column - b.column ||
			a.endLine - b.endLine ||
			a.endColumn - b.endColumn
	);
	for (let index = 1; index < occurrences.length; index++) {
		const previous = occurrences[index - 1]!;
		const current = occurrences[index]!;
		if (current.headerLine !== previous.headerLine) continue;
		if (
			current.line < previous.endLine ||
			(current.line === previous.endLine && current.column < previous.endColumn) ||
			(current.line === previous.line &&
				current.column === previous.column &&
				current.endLine === previous.endLine &&
				current.endColumn === previous.endColumn)
		)
			return suspended;
	}
	return value.detached === undefined ? { passages } : { passages, detached };
}

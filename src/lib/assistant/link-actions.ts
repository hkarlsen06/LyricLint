import type { AssistantLinkAction, AssistantLinkHeader } from './types.js';

interface DraftLine {
	number: number;
	text: string;
}

type AssistantLinkActionResolution =
	| { ok: true; action: AssistantLinkAction; headerLines: number[] }
	| { ok: false; action: AssistantLinkAction; reason: 'not-found' };

function draftLines(text: string): DraftLine[] {
	return text.split(/\r\n|\n|\r/u).map((line, index) => ({ number: index + 1, text: line.trim() }));
}

/** Resolve one exact header-line occurrence to its 1-based draft line. */
export function resolveHeaderLine(text: string, header: AssistantLinkHeader): number | undefined {
	const wanted = header.text.trim();
	if (header.occurrence < 1) return undefined;
	let occurrence = 0;
	for (const line of draftLines(text)) {
		if (line.text !== wanted) continue;
		occurrence += 1;
		if (occurrence === header.occurrence) return line.number;
	}
	return undefined;
}

/** Resolve every member atomically: one missing member refuses the whole action. */
export function resolveLinkAction(
	text: string,
	action: AssistantLinkAction
): AssistantLinkActionResolution {
	const headerLines = action.headers.map((header) => resolveHeaderLine(text, header));
	if (headerLines.some((line) => line === undefined)) {
		return { ok: false, action, reason: 'not-found' };
	}
	return { ok: true, action, headerLines: headerLines as number[] };
}

/**
 * Describe stored line-number groups in the same text+occurrence vocabulary the
 * model uses. Invalid persisted members are omitted; fewer than two valid
 * members cannot describe a link and therefore produce no entry.
 */
export function composeSectionLinks(text: string, groups: Array<{ lines: number[] }>): string[] {
	const lines = draftLines(text);
	return groups.flatMap((group) => {
		const members = [...group.lines]
			.sort((left, right) => left - right)
			.flatMap((lineNumber) => {
				const line = lines[lineNumber - 1];
				if (!line || line.text === '') return [];
				const occurrence = lines
					.slice(0, lineNumber)
					.filter((candidate) => candidate.text === line.text).length;
				return [`${line.text} occurrence ${occurrence}`];
			});
		return members.length >= 2 ? [members.join(' ↔ ')] : [];
	});
}

import type { Diagnostic, DiagnosticFix, Severity, TextRange } from '#lib/core/types.js';
import { severityRank } from '#lib/core/types.js';

/** Rules whose only answer lives in the workbench, so an export cannot offer one. */
const workbenchOnlyRules = new Set(['section.unlinked-repeat']);

/** The destination's findings an export output can act on. */
export function exportFindings(diagnostics: readonly Diagnostic[]): Diagnostic[] {
	return diagnostics.filter((diagnostic) => !workbenchOnlyRules.has(diagnostic.ruleId));
}

/**
 * A finding's identity across edits to the output: its rule, the line it sits
 * on and the text it flags. Offsets move with every fix above them, and an
 * answer of "leave this one" has to survive that.
 */
export function exportFindingKey(diagnostic: Diagnostic, text: string): string {
	const lineFrom = text.lastIndexOf('\n', diagnostic.from - 1) + 1;
	const lineEnd = text.indexOf('\n', diagnostic.to);
	return JSON.stringify([
		diagnostic.ruleId,
		text.slice(lineFrom, lineEnd === -1 ? text.length : lineEnd),
		text.slice(diagnostic.from, diagnostic.to),
		diagnostic.message
	]);
}

/** Apply one or more fixes' edits to plain output text, last edit first. */
export function applyFixes(text: string, fixes: readonly DiagnosticFix[]): string {
	const edits = fixes
		.flatMap((fix) => fix.edit.edits)
		.sort((left, right) => right.from - left.from || right.to - left.to);
	let next = text;
	let floor = Infinity;
	for (const edit of edits) {
		// An edit reaching into one already applied would rewrite its result.
		if (edit.to > floor) continue;
		next = next.slice(0, edit.from) + edit.insert + next.slice(edit.to);
		floor = edit.from;
	}
	return next;
}

/** One-based line of an offset in plain text. */
export function lineOfOffset(text: string, offset: number): number {
	let line = 1;
	for (
		let index = text.indexOf('\n');
		index !== -1 && index < offset;
		index = text.indexOf('\n', index + 1)
	)
		line++;
	return line;
}

export interface OutputSegment {
	text: string;
	severity?: Severity;
	/** The open finding's own words. */
	open?: true;
	/** The rest of the line the open finding sits on. */
	line?: true;
}

/**
 * The output cut into runs for the layer drawn behind the textarea: plain
 * text, flagged text carrying the most severe finding that covers it, and the
 * open finding's line. A finding with no width (a missing character) marks the
 * character after it.
 */
export function outputSegments(
	text: string,
	diagnostics: readonly Diagnostic[],
	open?: TextRange
): OutputSegment[] {
	const widen = (range: TextRange) => ({
		from: Math.min(text.length, range.from),
		to: Math.min(text.length, Math.max(range.to, range.from + 1))
	});
	const marks = diagnostics
		.map((diagnostic) => ({ ...widen(diagnostic), severity: diagnostic.severity }))
		.filter((mark) => mark.from < mark.to);
	const exact = open && widen(open);
	const line = exact && {
		from: text.lastIndexOf('\n', exact.from - 1) + 1,
		to: text.indexOf('\n', exact.from) === -1 ? text.length : text.indexOf('\n', exact.from)
	};
	const cuts = new Set([0, text.length]);
	for (const range of [...marks, ...(exact && line ? [exact, line] : [])]) {
		cuts.add(range.from);
		cuts.add(range.to);
	}
	const points = [...cuts].sort((left, right) => left - right);
	const segments: OutputSegment[] = [];
	for (let index = 0; index + 1 < points.length; index++) {
		const from = points[index]!;
		const to = points[index + 1]!;
		const segment: OutputSegment = { text: text.slice(from, to) };
		for (const mark of marks)
			if (
				mark.from <= from &&
				to <= mark.to &&
				(!segment.severity || severityRank[mark.severity] < severityRank[segment.severity])
			)
				segment.severity = mark.severity;
		if (exact && exact.from <= from && to <= exact.to) segment.open = true;
		else if (line && line.from <= from && to <= line.to) segment.line = true;
		const previous = segments.at(-1);
		if (
			previous &&
			previous.severity === segment.severity &&
			previous.open === segment.open &&
			previous.line === segment.line
		)
			previous.text += segment.text;
		else segments.push(segment);
	}
	return segments;
}

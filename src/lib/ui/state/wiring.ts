import { runRules } from '$lib/rules/index.js';
import { sourceRegistry } from '$lib/rules/index.js';
import { findExactPerformer } from '$lib/performers/index.js';
import type { VoiceGroupRange } from '$lib/editor/index.js';
import { lineNumberAt } from '$lib/editor/section-links.js';
import { isLyricLine } from '$lib/core/parser.js';
import type {
	Diagnostic,
	EditorSnapshot,
	LineAnchor,
	ParsedDocument,
	PerformerRecord,
	RuleContext,
	SectionLink,
	VoiceGroup
} from '$lib/core/types.js';

const voiceGroupRangeCache = new WeakMap<
	ParsedDocument,
	WeakMap<readonly PerformerRecord[], VoiceGroupRange[]>
>();

/**
 * Whether a sync run has anything left to time.
 *
 * The lines it would tap are `isLyricLine`'s, the same answer the editor's column
 * and sync mode use, matched here against the anchors' own line numbers — both of
 * which the shell already holds. A song with nothing to tap is not a finished one.
 */
export function everyLyricLineTimed(text: string, anchors: readonly LineAnchor[]): boolean {
	const timed = new Set(anchors.map((anchor) => anchor.line));
	const lines = text.split('\n');
	let stampable = 0;
	for (let index = 0; index < lines.length; index += 1) {
		if (!isLyricLine(lines[index])) continue;
		stampable += 1;
		if (!timed.has(index + 1)) return false;
	}
	return stampable > 0;
}

/**
 * Build the immutable rule context for one document revision. Sources come from
 * the bundled reviewed registry; no network access is involved.
 */
export function buildRuleContext(
	language: string,
	performers: readonly PerformerRecord[],
	ruleSetVersion: string,
	revision: number
): RuleContext {
	return {
		language,
		performers,
		sources: sourceRegistry,
		ruleSetVersion,
		revision
	};
}

/** Run every enabled rule against one parsed revision, sorted by severity. */
export function computeDiagnostics(parsed: ParsedDocument, context: RuleContext): Diagnostic[] {
	return runRules(parsed, context);
}

/** Hide unfinished trailing whitespace until the caret leaves its line. */
export function deferActiveLineTrailingWhitespace(
	snapshot: EditorSnapshot,
	diagnostics: readonly Diagnostic[],
	sectionLinks: readonly SectionLink[] = []
): Diagnostic[] {
	if (snapshot.selection.anchor !== snapshot.selection.head) return [...diagnostics];

	const { text } = snapshot;
	const caret = snapshot.selection.head;
	const activeLine = lineNumberAt(text, caret);
	const deferredLines = new Set([activeLine]);
	const section = snapshot.parsed.sections.find(
		(candidate) =>
			candidate.header &&
			candidate.lines.some((line) => line.from <= caret && caret <= line.lineEndingRange.from)
	);
	if (section?.header) {
		const headerLine = lineNumberAt(text, section.header.from);
		const link = sectionLinks.find((candidate) => candidate.lines.includes(headerLine));
		for (const peerHeaderLine of link?.lines ?? []) {
			deferredLines.add(peerHeaderLine + activeLine - headerLine);
		}
	}

	return diagnostics.filter(
		(diagnostic) =>
			!(
				diagnostic.ruleId === 'text.invisible-characters' &&
				deferredLines.has(lineNumberAt(text, diagnostic.from)) &&
				(diagnostic.to === text.length || /[\r\n]/u.test(text[diagnostic.to] ?? '')) &&
				/^[^\S\r\n]+$/u.test(text.slice(diagnostic.from, diagnostic.to))
			)
	);
}

/**
 * Resolve a legend group's raw name text into roster performer IDs.
 *
 * A whole-name exact match wins first so that a performer named `Echo & The
 * Glass` is never split. Otherwise the raw text is split on top-level commas
 * and ampersands and each part is matched, which recovers joint groups such as
 * `Avery & Blair`. Unmatched parts are ignored for display coloring only; they
 * never change the canonical document.
 */
function decodeLegendText(value: string): string {
	return value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => {
		switch (entity) {
			case '&amp;':
				return '&';
			case '&lt;':
				return '<';
			case '&gt;':
				return '>';
			case '&quot;':
				return '"';
			case '&#39;':
				return "'";
			default:
				return entity;
		}
	});
}

function resolvePerformerIds(
	rawNameText: string,
	performers: readonly PerformerRecord[]
): string[] {
	const whole = findExactPerformer(decodeLegendText(rawNameText), performers);
	if (whole) return [whole.id];
	const parts = rawNameText
		.split(/(?:\s*,\s+|\s+&\s+)/u)
		.map(decodeLegendText)
		.filter((part) => part.length > 0);
	const ids: string[] = [];
	for (const part of parts) {
		const match = findExactPerformer(part, performers);
		if (match && !ids.includes(match.id)) ids.push(match.id);
	}
	return ids;
}

/**
 * Derive view-only voice-group highlight ranges from a parsed document.
 *
 * Styled spans map to their section-local slot group; the remaining plain text
 * of a line in a section with a legend maps to the slot-1 group. Highlighting
 * is decoration only and never alters exported text.
 */
export function resolveVoiceGroupRanges(
	parsed: ParsedDocument,
	performers: readonly PerformerRecord[]
): VoiceGroupRange[] {
	const cached = voiceGroupRangeCache.get(parsed)?.get(performers);
	if (cached) return cached;
	const ranges: VoiceGroupRange[] = [];

	for (const section of parsed.sections) {
		if (section.voiceGroups.length === 0) continue;
		const resolvedGroups = new Map<number, VoiceGroup>();
		for (const group of section.voiceGroups) {
			resolvedGroups.set(group.styleSlot, {
				...group,
				performerIds: group.rawNameText
					? resolvePerformerIds(group.rawNameText, performers)
					: group.performerIds
			});
		}
		// Malformed or unsupported markup (e.g. an <i> left open across lines)
		// makes the implicit "everything else is the plain voice" inference
		// unreliable — but only where the broken markup reaches: the lines that
		// carry a broken tag, plus the lines inside an apparently unclosed
		// wrapper. Clean lines in the same section keep the plain fallback, and
		// explicitly tagged spans and legend names always keep their colors.
		const plainGroup = resolvedGroups.get(1);
		const suppressedLines = new Set<(typeof section.lines)[number]>();
		let openUnmatched = false;
		for (const line of section.lines) {
			const openAtStart = openUnmatched;
			let lineBroken = false;
			for (const span of line.styleSpans) {
				if ('unsupported' in span) {
					lineBroken = true;
					openUnmatched = !span.rawTag.startsWith('</');
				}
			}
			if (openAtStart || lineBroken) {
				suppressedLines.add(line);
			}
		}

		// Legend names keep their group's tint inside the header; the `legend`
		// flag keeps them from contributing to lyric-line gutter segments.
		for (const legendGroup of section.header?.legendGroups ?? []) {
			const group = resolvedGroups.get(legendGroup.styleSlot);
			if (group && legendGroup.nameRange.from < legendGroup.nameRange.to) {
				ranges.push({
					from: legendGroup.nameRange.from,
					to: legendGroup.nameRange.to,
					group,
					legend: true
				});
			}
		}

		for (const line of section.lines) {
			const linePlainGroup = suppressedLines.has(line) ? undefined : plainGroup;
			const supported = line.styleSpans
				.filter((span): span is Extract<typeof span, { slot: number }> => 'slot' in span)
				.sort((left, right) => left.from - right.from);

			let cursor = line.from;
			for (const span of supported) {
				if (linePlainGroup && span.from > cursor) {
					const trimmed = trimRange(parsed.text, cursor, span.from);
					if (trimmed) ranges.push({ ...trimmed, group: linePlainGroup });
				}
				const group = resolvedGroups.get(span.slot);
				if (group) ranges.push({ from: span.contentFrom, to: span.contentTo, group });
				cursor = span.to;
			}
			if (linePlainGroup && cursor < line.to) {
				const trimmed = trimRange(parsed.text, cursor, line.to);
				if (trimmed) ranges.push({ ...trimmed, group: linePlainGroup });
			}
		}
	}

	let byPerformers = voiceGroupRangeCache.get(parsed);
	if (!byPerformers) {
		byPerformers = new WeakMap();
		voiceGroupRangeCache.set(parsed, byPerformers);
	}
	byPerformers.set(performers, ranges);
	return ranges;
}

/**
 * Order the roster by each performer's first appearance in the document
 * (legend names and styled spans alike). Performers who do not appear yet
 * keep their existing relative order after the appearing ones. The color a
 * performer carries never changes with this ordering — it is only a visual
 * distinguisher.
 */
export function orderPerformersByAppearance(
	parsed: ParsedDocument,
	performers: readonly PerformerRecord[]
): PerformerRecord[] {
	const firstSeen = new Map<string, number>();
	for (const range of resolveVoiceGroupRanges(parsed, performers)) {
		for (const id of range.group.performerIds) {
			const seen = firstSeen.get(id);
			if (seen === undefined || range.from < seen) firstSeen.set(id, range.from);
		}
	}
	return [...performers].sort((left, right) => {
		const leftSeen = firstSeen.get(left.id) ?? Number.POSITIVE_INFINITY;
		const rightSeen = firstSeen.get(right.id) ?? Number.POSITIVE_INFINITY;
		if (leftSeen !== rightSeen) return leftSeen - rightSeen;
		return performers.indexOf(left) - performers.indexOf(right);
	});
}

function trimRange(text: string, from: number, to: number): { from: number; to: number } | null {
	let start = from;
	let end = to;
	while (start < end && /\s/u.test(text[start] ?? '')) start += 1;
	while (end > start && /\s/u.test(text[end - 1] ?? '')) end -= 1;
	return end > start ? { from: start, to: end } : null;
}

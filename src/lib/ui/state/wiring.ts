import { runRules } from '$lib/rules/index.js';
import { sourceRegistry } from '$lib/rules/index.js';
import { findExactPerformer } from '$lib/performers/index.js';
import type { VoiceGroupRange } from '$lib/editor/index.js';
import type {
	Diagnostic,
	ParsedDocument,
	PerformerRecord,
	RuleContext,
	VoiceGroup
} from '$lib/core/types.js';

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
		const plainGroup = resolvedGroups.get(1);

		for (const line of section.lines) {
			const supported = line.styleSpans
				.filter((span): span is Extract<typeof span, { slot: number }> => 'slot' in span)
				.sort((left, right) => left.from - right.from);

			let cursor = line.from;
			for (const span of supported) {
				if (plainGroup && span.from > cursor) {
					const trimmed = trimRange(parsed.text, cursor, span.from);
					if (trimmed) ranges.push({ ...trimmed, group: plainGroup });
				}
				const group = resolvedGroups.get(span.slot);
				if (group) ranges.push({ from: span.contentFrom, to: span.contentTo, group });
				cursor = span.to;
			}
			if (plainGroup && cursor < line.to) {
				const trimmed = trimRange(parsed.text, cursor, line.to);
				if (trimmed) ranges.push({ ...trimmed, group: plainGroup });
			}
		}
	}

	return ranges;
}

function trimRange(text: string, from: number, to: number): { from: number; to: number } | null {
	let start = from;
	let end = to;
	while (start < end && /\s/u.test(text[start] ?? '')) start += 1;
	while (end > start && /\s/u.test(text[end - 1] ?? '')) end -= 1;
	return end > start ? { from: start, to: end } : null;
}

import { runRules } from '$lib/rules/index.js';
import { sourceRegistry } from '$lib/rules/index.js';
import { normalizePerformerKey } from '$lib/performers/index.js';
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
	ruleSetVersion: string
): RuleContext {
	return {
		language,
		performers,
		sources: sourceRegistry,
		ruleSetVersion
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
function resolvePerformerIds(rawNameText: string, byKey: Map<string, PerformerRecord>): string[] {
	const whole = byKey.get(normalizePerformerKey(rawNameText));
	if (whole) return [whole.id];
	const parts = rawNameText.split(/\s*(?:,|&)\s*/u).filter((part) => part.length > 0);
	const ids: string[] = [];
	for (const part of parts) {
		const match = byKey.get(normalizePerformerKey(part));
		if (match && !ids.includes(match.id)) ids.push(match.id);
	}
	return ids;
}

function rosterIndex(performers: readonly PerformerRecord[]): Map<string, PerformerRecord> {
	const byKey = new Map<string, PerformerRecord>();
	for (const performer of performers) {
		byKey.set(performer.normalizedKey || normalizePerformerKey(performer.displayName), performer);
		byKey.set(normalizePerformerKey(performer.displayName), performer);
		for (const alias of performer.aliases) byKey.set(normalizePerformerKey(alias), performer);
	}
	return byKey;
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
	const byKey = rosterIndex(performers);
	const ranges: VoiceGroupRange[] = [];

	for (const section of parsed.sections) {
		if (section.voiceGroups.length === 0) continue;
		const resolvedGroups = new Map<number, VoiceGroup>();
		for (const group of section.voiceGroups) {
			resolvedGroups.set(group.styleSlot, {
				...group,
				performerIds: group.rawNameText
					? resolvePerformerIds(group.rawNameText, byKey)
					: group.performerIds
			});
		}
		const plainGroup = resolvedGroups.get(1);

		for (const line of section.lines) {
			const supported = line.styleSpans
				.filter((span): span is Extract<typeof span, { slot: number }> => 'slot' in span)
				.sort((left, right) => left.contentFrom - right.contentFrom);

			let cursor = line.from;
			for (const span of supported) {
				if (plainGroup && span.contentFrom > cursor) {
					const trimmed = trimRange(parsed.text, cursor, span.contentFrom);
					if (trimmed) ranges.push({ ...trimmed, group: plainGroup });
				}
				const group = resolvedGroups.get(span.slot);
				if (group) ranges.push({ from: span.contentFrom, to: span.contentTo, group });
				cursor = span.contentTo;
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

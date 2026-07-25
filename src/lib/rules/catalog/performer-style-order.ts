import type {
	DiagnosticFix,
	LegendVoiceGroup,
	RuleContext,
	RuleDefinition,
	Section,
	StyleSlot,
	TextEdit
} from '$lib/core/types.js';
import { usedStyleSlots } from '$lib/performers/legend-cleanup.js';
import { styleTags, wrapVoiceSpan } from '$lib/serialization/genius-markup.js';
import { diagnostic } from './utils.js';

const SLOT_ORDER =
	'Section-local performer groups should appear in plain, italic, bold, then bold-italic order.';

/**
 * The slot each legend group belongs in, keyed by the slot it occupies now.
 *
 * Groups are *ranked* by their current slot rather than reassigned, which is
 * what preserves identity: every group keeps its own performers and its
 * position relative to the others, and a group only ever moves to a lower
 * slot. The group already lowest is therefore the one that becomes plain.
 */
function rankedSlots(groups: readonly LegendVoiceGroup[]): Map<StyleSlot, StyleSlot> | undefined {
	const ranked = new Map<StyleSlot, StyleSlot>();
	for (const [index, group] of orderedGroups(groups).entries()) {
		// Two groups sharing one slot have no distinguishable body spans, so
		// nothing can decide which of them a styled passage belongs to.
		if (ranked.has(group.styleSlot)) {
			return undefined;
		}
		ranked.set(group.styleSlot, (index + 1) as StyleSlot);
	}
	return ranked;
}

function orderedGroups(groups: readonly LegendVoiceGroup[]): LegendVoiceGroup[] {
	return [...groups].sort((left, right) => left.styleSlot - right.styleSlot);
}

/**
 * Serialize the legend in slot order, each group's exact raw name re-wrapped in
 * the slot it was ranked into. Original separators are dropped rather than
 * carried along, because a separator belongs to a position in the list and the
 * positions are what this changes.
 */
function orderedLegend(
	groups: readonly LegendVoiceGroup[],
	ranked: ReadonlyMap<StyleSlot, StyleSlot>
): string {
	const serialized = orderedGroups(groups).map((group) =>
		wrapVoiceSpan(group.rawNameText, ranked.get(group.styleSlot) ?? group.styleSlot)
	);
	if (serialized.length < 2) {
		return serialized[0] ?? '';
	}
	return `${serialized.slice(0, -1).join(', ')} & ${serialized.at(-1)}`;
}

/** Rewrite every wrapper in the section body into its group's ranked slot. */
function restyleBody(
	section: Section,
	ranked: ReadonlyMap<StyleSlot, StyleSlot>
): TextEdit[] | undefined {
	const edits: TextEdit[] = [];

	for (const line of section.lines) {
		for (const span of line.styleSpans) {
			// Markup this parser cannot interpret is left byte-for-byte, and it
			// could be hiding a wrapper the remap would have to account for.
			if ('unsupported' in span) {
				return undefined;
			}
			const slot = ranked.get(span.slot);
			// A styled passage no legend group names: shifting the named slots down
			// could hand its text to one of them.
			if (slot === undefined) {
				return undefined;
			}
			if (slot === span.slot) {
				continue;
			}
			const { opening, closing } = styleTags(slot);
			// A wrapper spanning several lines is projected onto each of them, so a
			// segment carrying no marker of its own produces no edit.
			if (span.from < span.contentFrom) {
				edits.push({ from: span.from, to: span.contentFrom, insert: opening });
			}
			if (span.contentTo < span.to) {
				edits.push({ from: span.contentTo, to: span.to, insert: closing });
			}
		}
	}

	return edits;
}

function orderLabel(ranked: ReadonlyMap<StyleSlot, StyleSlot>, restyles: boolean): string {
	if (!restyles) {
		return 'Reorder legend groups';
	}
	// The only way every group lands in plain is one group moving there alone,
	// and then nothing is reordered or restyled — the markers simply come off.
	return [...ranked.values()].every((slot) => slot === 1)
		? 'Remove performer formatting'
		: 'Restyle in slot order';
}

/**
 * The one edit that puts a section's legend into slot order.
 *
 * The legend and the body move together or not at all: a group that changes
 * slot changes the wrappers around its lyrics in the same transaction, so no
 * passage is ever briefly attributed to another voice.
 */
function orderFix(section: Section, context: RuleContext): DiagnosticFix | undefined {
	const header = section.header;
	const legendRange = header?.legendRange;
	// A group whose markup this parser could not interpret has no exact name to
	// re-wrap, so its raw text is left alone.
	if (!header || !legendRange || header.legendGroups.some((group) => !group.markupSupported)) {
		return undefined;
	}
	const ranked = rankedSlots(header.legendGroups);
	if (!ranked) {
		return undefined;
	}

	const edits: TextEdit[] = [
		{
			from: legendRange.from,
			to: legendRange.to,
			insert: orderedLegend(header.legendGroups, ranked)
		}
	];
	const restyles = [...ranked].some(([slot, ordered]) => slot !== ordered);

	if (restyles) {
		// Without a plain group of its own, the lowest group is the one that
		// becomes plain — and unnamed plain lyrics in the body would absorb it.
		if (!ranked.has(1) && usedStyleSlots(section).has(1)) {
			return undefined;
		}
		const bodyEdits = restyleBody(section, ranked);
		if (!bodyEdits) {
			return undefined;
		}
		edits.push(...bodyEdits);
	}

	return {
		kind: 'preview',
		label: orderLabel(ranked, restyles),
		edit: {
			baseRevision: context.revision ?? 0,
			edits: edits.sort((left, right) => left.from - right.from || left.to - right.to)
		}
	};
}

export const performerStyleOrderRule: RuleDefinition = {
	id: 'performer.style-order',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'preview',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		return document.sections.flatMap((section) => {
			const groups = section.header?.legendGroups ?? [];
			if (groups.length === 0 || groups.length > 4) {
				return [];
			}
			const invalidIndex = groups.findIndex((group, index) => group.styleSlot !== index + 1);
			if (invalidIndex < 0) {
				return [];
			}
			const group = groups[invalidIndex]!;
			const fix = orderFix(section, context);
			return [
				diagnostic(
					this,
					group,
					'Performer legend styles are out of slot order.',
					fix
						? `${SLOT_ORDER} Shifting them into order rewrites the legend and the section's formatting as one edit, so every group keeps its own performers.`
						: `${SLOT_ORDER} This section has to be reordered by hand: its styles cannot be remapped without changing which group a passage belongs to.`,
					fix ? [fix] : undefined
				)
			];
		});
	}
};

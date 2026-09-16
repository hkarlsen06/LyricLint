import type {
	ParsedDocument,
	PerformerRecord,
	StyleSlot,
	SupportedStyleSpan,
	TextRange
} from '$lib/core/types.js';
import { randomId } from '$lib/core/random-id.js';
import {
	findExactPerformer,
	makeVoiceGroupKey,
	normalizePerformerKey,
	suggestPerformerMatches
} from './identity.js';
import { allocatePerformerColor } from './color.js';
import type { ImportExtraction, ImportedVoiceGroup } from './types.js';

import { decodeLegendText } from '$lib/core/legend.js';
import { exactMembers, logicalHeaderGroups } from './legend-groups.js';
export { decodeLegendText } from '$lib/core/legend.js';

function createRosterAddition(
	displayName: string,
	roster: readonly PerformerRecord[]
): PerformerRecord {
	return {
		id: randomId(),
		displayName,
		normalizedKey: normalizePerformerKey(displayName),
		aliases: [],
		colorId: allocatePerformerColor(displayName, roster),
		order: roster.length
	};
}

function supportedSpansForSlot(
	document: ParsedDocument,
	sectionFrom: number,
	styleSlot: StyleSlot
): TextRange[] {
	const section = document.sections.find((candidate) => candidate.from === sectionFrom);
	if (!section || styleSlot === 1) {
		return [];
	}

	return section.lines.flatMap((line) =>
		line.styleSpans
			.filter(
				(span): span is SupportedStyleSpan => !('unsupported' in span) && span.slot === styleSlot
			)
			.map((span) => ({ from: span.contentFrom, to: span.contentTo }))
	);
}

/**
 * Correlate lossless header candidates with section-local inline style spans.
 *
 * Ambiguous ampersands are resolved as joint groups only when every member is
 * already an exact roster identity. Otherwise the complete header text remains
 * one performer name, preventing blind splits such as "Echo & The Glass".
 */
export function extractPerformers(
	document: ParsedDocument,
	knownRoster: readonly PerformerRecord[]
): ImportExtraction {
	const rosterAdditions: PerformerRecord[] = [];
	const suggestions: ImportExtraction['suggestions'] = [];
	const voiceGroups: ImportedVoiceGroup[] = [];
	const availableRoster: PerformerRecord[] = [...knownRoster];
	const candidates = document.sections.flatMap((section) =>
		logicalHeaderGroups(document, section, knownRoster).map((group) => ({
			section,
			group
		}))
	);

	/*
	 * Resolve/add unambiguous names first. This makes later "A & B" candidates
	 * safely splittable when A and B also occur as independent header entries.
	 */
	for (const { group } of candidates) {
		const name = decodeLegendText(group.rawNameText);
		if (findExactPerformer(name, availableRoster) || /\s+&\s+/u.test(name)) {
			continue;
		}

		suggestions.push(...suggestPerformerMatches(name, knownRoster, group.nameRange));
		const addition = createRosterAddition(name, availableRoster);
		availableRoster.push(addition);
		rosterAdditions.push(addition);
	}

	for (const { section, group } of candidates) {
		const name = decodeLegendText(group.rawNameText);
		let members = exactMembers(group.rawNameText, availableRoster);

		if (!members) {
			suggestions.push(...suggestPerformerMatches(name, knownRoster, group.nameRange));
			const addition = createRosterAddition(name, availableRoster);
			availableRoster.push(addition);
			rosterAdditions.push(addition);
			members = [addition];
		}

		const performerIds = members.map((member) => member.id);
		const groupKey = makeVoiceGroupKey(performerIds);
		voiceGroups.push({
			id: groupKey,
			groupKey,
			sectionFrom: section.from,
			performerIds,
			styleSlot: group.styleSlot,
			rawNameText: group.rawNameText,
			sourceRange: { from: group.from, to: group.to },
			ambiguousAmpersands: group.ambiguousAmpersands,
			inlineRanges: supportedSpansForSlot(document, section.from, group.styleSlot)
		});
	}

	const uniqueSuggestions = new Map<string, ImportExtraction['suggestions'][number]>();
	for (const suggestion of suggestions) {
		const key = `${suggestion.importedRange.from}:${suggestion.importedRange.to}:${suggestion.performerId}`;
		uniqueSuggestions.set(key, suggestion);
	}

	return {
		rosterAdditions,
		suggestions: [...uniqueSuggestions.values()],
		voiceGroups
	};
}

/**
 * A roster record this import path used to mint and no longer does.
 *
 * Extraction once answered a styled slot with no header entry by creating a
 * real performer named `Unresolved voice N` — the design the unknown-voice
 * model explicitly rejected, because it gave an identity to a voice whose
 * whole point is having none, and put a pressable stranger in every picker.
 * The state is derived now (`unaccountedStyledSlots`), but drafts saved while
 * the minting ran still carry the records; `importFromSnapshot` uses this to
 * retire them, and only them — a placeholder someone renamed no longer
 * matches, and one a header genuinely names stays referenced and kept.
 */
export function isRetiredUnresolvedVoiceName(displayName: string): boolean {
	return /^Unresolved voice [2-4]$/u.test(displayName);
}

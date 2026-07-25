import type {
	LegendVoiceGroup,
	ParsedDocument,
	PerformerRecord,
	Section,
	StyleSlot,
	SupportedStyleSpan,
	TextRange
} from '$lib/core/types.js';
import {
	findExactPerformer,
	makeVoiceGroupKey,
	normalizePerformerKey,
	suggestPerformerMatches
} from './identity.js';
import type { ImportExtraction, ImportedVoiceGroup } from './types.js';

const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|#39);/gu;

/** Decode the HTML entities Genius legends may carry, for matching only. */
export function decodeLegendText(value: string): string {
	return value.replace(ENTITY_PATTERN, (entity) => {
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

function newPerformerId(): string {
	if (typeof globalThis.crypto?.randomUUID === 'function') {
		return globalThis.crypto.randomUUID();
	}

	const randomPart = () =>
		Math.floor(Math.random() * 0x1_0000)
			.toString(16)
			.padStart(4, '0');
	return `${randomPart()}${randomPart()}-${randomPart()}-4${randomPart().slice(1)}-a${randomPart().slice(1)}-${randomPart()}${randomPart()}${randomPart()}`;
}

function createRosterAddition(displayName: string, order: number): PerformerRecord {
	return {
		id: newPerformerId(),
		displayName,
		normalizedKey: normalizePerformerKey(displayName),
		aliases: [],
		colorId: `performer-${(order % 8) + 1}`,
		order
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

function exactMembers(
	rawNameText: string,
	roster: readonly PerformerRecord[]
): PerformerRecord[] | undefined {
	const name = decodeLegendText(rawNameText);
	const whole = findExactPerformer(name, roster);
	if (whole) {
		return [whole];
	}

	const pieces = rawNameText.split(/\s+&\s+/u);
	if (pieces.length < 2) {
		return undefined;
	}

	const members = pieces.map((piece) => findExactPerformer(decodeLegendText(piece), roster));
	return members.every((member): member is PerformerRecord => member !== undefined)
		? members
		: undefined;
}

function logicalHeaderGroups(
	document: ParsedDocument,
	section: Section,
	knownRoster: readonly PerformerRecord[]
): LegendVoiceGroup[] {
	const groups = section.header?.legendGroups ?? [];
	const logical: LegendVoiceGroup[] = [];
	let index = 0;

	while (index < groups.length) {
		const first = groups[index];
		if (!first || first.styleSlot !== 1) {
			if (first) {
				logical.push(first);
			}
			index += 1;
			continue;
		}

		let combined: LegendVoiceGroup | undefined;
		let combinedTo = index + 1;
		for (let end = groups.length; end > index + 1; end -= 1) {
			const slice = groups.slice(index, end);
			if (slice.some((group) => group.styleSlot !== 1 || !group.markupSupported)) {
				continue;
			}
			const last = slice.at(-1);
			if (!last) {
				continue;
			}
			const name = decodeLegendText(document.text.slice(first.nameRange.from, last.nameRange.to));
			if (!findExactPerformer(name, knownRoster)) {
				continue;
			}

			combined = {
				from: first.from,
				to: last.to,
				styleSlot: 1,
				raw: document.text.slice(first.from, last.to),
				rawNameText: document.text.slice(first.nameRange.from, last.nameRange.to),
				nameRange: { from: first.nameRange.from, to: last.nameRange.to },
				ambiguousAmpersands: slice.flatMap((group) => group.ambiguousAmpersands),
				markupSupported: true,
				separatorBefore: first.separatorBefore
			};
			combinedTo = end;
			break;
		}

		logical.push(combined ?? first);
		index = combined ? combinedTo : index + 1;
	}

	return logical;
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
	const unresolvedVoiceGroups: ImportExtraction['unresolvedVoiceGroups'] = [];
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
		const addition = createRosterAddition(name, availableRoster.length);
		availableRoster.push(addition);
		rosterAdditions.push(addition);
	}

	for (const { section, group } of candidates) {
		const name = decodeLegendText(group.rawNameText);
		let members = exactMembers(group.rawNameText, availableRoster);

		if (!members) {
			suggestions.push(...suggestPerformerMatches(name, knownRoster, group.nameRange));
			const addition = createRosterAddition(name, availableRoster.length);
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

	for (const section of document.sections) {
		const headerSlots = new Set(
			voiceGroups
				.filter((group) => group.sectionFrom === section.from)
				.map((group) => group.styleSlot)
		);
		const inlineSlots = new Set<StyleSlot>();

		for (const line of section.lines) {
			for (const span of line.styleSpans) {
				if (!('unsupported' in span)) {
					inlineSlots.add(span.slot);
				}
			}
		}

		for (const slot of inlineSlots) {
			if (headerSlots.has(slot)) {
				continue;
			}

			const unresolvedName = `Unresolved voice ${slot}`;
			let unresolvedPerformer = findExactPerformer(unresolvedName, availableRoster);
			if (!unresolvedPerformer) {
				unresolvedPerformer = createRosterAddition(unresolvedName, availableRoster.length);
				availableRoster.push(unresolvedPerformer);
				rosterAdditions.push(unresolvedPerformer);
			}

			const groupKey = makeVoiceGroupKey([unresolvedPerformer.id]);
			const unresolved: ImportedVoiceGroup = {
				id: groupKey,
				groupKey,
				sectionFrom: section.from,
				performerIds: [unresolvedPerformer.id],
				styleSlot: slot,
				rawNameText: unresolvedName,
				inlineRanges: supportedSpansForSlot(document, section.from, slot),
				unresolved: true
			};
			voiceGroups.push(unresolved);
			unresolvedVoiceGroups.push(unresolved);
		}
	}

	const uniqueSuggestions = new Map<string, ImportExtraction['suggestions'][number]>();
	for (const suggestion of suggestions) {
		const key = `${suggestion.importedRange.from}:${suggestion.importedRange.to}:${suggestion.performerId}`;
		uniqueSuggestions.set(key, suggestion);
	}

	return {
		rosterAdditions,
		unresolvedVoiceGroups,
		suggestions: [...uniqueSuggestions.values()],
		voiceGroups
	};
}

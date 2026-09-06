// Decision record: docs/subsystems/section-links.md.
import { lineNumberAt } from '$lib/core/line-numbers.js';
import type { LanguagePack, ParsedDocument, SectionLink } from '$lib/core/types.js';
import { linkOccurrences, type LinkOccurrence } from '$lib/editor/section-links.js';

export interface LinkingOverviewGroup {
	headerFrom: number;
	occurrences: LinkOccurrence[];
	/** Stored differences for an existing group; candidates have no chosen alignment yet. */
	differenceCount: number | undefined;
}

export interface LinkingOverview {
	available: LinkingOverviewGroup[];
	linked: LinkingOverviewGroup[];
}

/**
 * Discover choices from each actual section, never from a transitive cluster of
 * similar lyrics. Every row opens precisely the source that discovered it.
 * `linkOccurrences` owns discovery, including its automatic alignment ceiling.
 */
export function linkingOverview(
	parsed: ParsedDocument,
	pack: LanguagePack | undefined,
	links: readonly SectionLink[]
): LinkingOverview {
	const headers = parsed.sections.flatMap((section) =>
		section.header
			? [{ from: section.header.from, line: lineNumberAt(parsed.text, section.header.from) }]
			: []
	);
	const membership = new Map<number, number[]>();
	const linked: LinkingOverviewGroup[] = [];
	for (const link of links) {
		const members = headers.filter((header) => link.lines.includes(header.line));
		const first = members[0];
		if (!first || members.length < 2) continue;
		const offsets = members.map((member) => member.from);
		for (const offset of offsets) membership.set(offset, offsets);
		const occurrences = linkOccurrences(parsed, pack, first.from, {
			includeHeaderOffsets: offsets
		}).filter((occurrence) => offsets.includes(occurrence.headerFrom));
		// Each member carries one hole per stored difference. Count the first
		// member's holes rather than comparing lyrics and erasing stored intent.
		const nextHeader = headers.find((header) => header.from > first.from);
		const differenceCount = (link.holes ?? []).filter(
			(hole) => hole.line >= first.line && (!nextHeader || hole.line < nextHeader.line)
		).length;
		linked.push({ headerFrom: first.from, occurrences, differenceCount });
	}
	linked.sort((left, right) => left.headerFrom - right.headerFrom);

	const available: LinkingOverviewGroup[] = [];
	const seen = new Set<string>();
	for (const header of headers) {
		const existing = membership.get(header.from) ?? [];
		const occurrences = linkOccurrences(parsed, pack, header.from, {
			includeHeaderOffsets: existing
		});
		if (
			occurrences.length < 2 ||
			occurrences.every((occurrence) => existing.includes(occurrence.headerFrom))
		) {
			continue;
		}
		const key = occurrences.map((occurrence) => occurrence.headerFrom).join(',');
		if (seen.has(key)) continue;
		seen.add(key);
		available.push({ headerFrom: header.from, occurrences, differenceCount: undefined });
	}
	return { available, linked };
}

/** Number repeated names across the whole song, independent of the selected group. */
export function linkingSectionNames(parsed: ParsedDocument): ReadonlyMap<number, string> {
	const headers = parsed.sections.flatMap((section) => (section.header ? [section.header] : []));
	const counts = new Map<string, number>();
	const seen = new Map<string, number>();
	const name = (header: (typeof headers)[number]) => header.rawNamePart.trim() || header.raw;
	for (const header of headers) counts.set(name(header), (counts.get(name(header)) ?? 0) + 1);
	return new Map(
		headers.map((header) => {
			const label = name(header);
			const ordinal = (seen.get(label) ?? 0) + 1;
			seen.set(label, ordinal);
			return [header.from, (counts.get(label) ?? 0) > 1 ? `${label} ${ordinal}` : label];
		})
	);
}

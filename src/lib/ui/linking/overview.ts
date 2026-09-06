// Decision record: docs/subsystems/section-links.md.
import { lineNumberAt } from '$lib/core/line-numbers.js';
import type { LanguagePack, ParsedDocument, SectionLink } from '$lib/core/types.js';
import { linkOccurrences, type LinkOccurrence } from '$lib/editor/section-links.js';

export interface LinkingOverviewGroup {
	headerFrom: number;
	occurrences: LinkOccurrence[];
	/** Candidate actions distinguish creating a link from extending existing ones. */
	action: 'manage' | 'create' | 'add' | 'combine';
	/** Already linked members are summarized rather than listed twice in the overview. */
	existingGroups: LinkOccurrence[][];
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
		linked.push({ headerFrom: first.from, occurrences, action: 'manage', existingGroups: [] });
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
		const existingGroups = linked
			.map((group) =>
				group.occurrences.filter((member) =>
					occurrences.some((candidate) => candidate.headerFrom === member.headerFrom)
				)
			)
			.filter((group) => group.length > 0);
		available.push({
			headerFrom: header.from,
			occurrences,
			action:
				existingGroups.length > 1 ? 'combine' : existingGroups.length === 1 ? 'add' : 'create',
			existingGroups
		});
	}
	return { available, linked };
}

export { linkingSectionNames } from '$lib/editor/section-links.js';

import { alignPassages, type PassageMember, type SharedPassage } from '$lib/core/link-passages.js';
import { extendPassages } from '$lib/core/link-passage-extension.js';
import { detachPassageRange, type PassageState } from '$lib/core/passage-targets.js';
import type { TextRange } from '$lib/core/types.js';
import {
	allocateId,
	refuse,
	type ConversionDocument,
	type EngineResult,
	type LinkMember,
	type Projection,
	type ReconciledDocument
} from './model.js';
import { renderProfile } from './projection.js';

export type LinkDecision =
	{ kind: 'linkSections'; sectionIds: string[] } | { kind: 'unlinkSection'; sectionId: string };

/** Shared lyric bounds, including blank separators but excluding a retained literal header. */
export function conversionSectionRanges(
	document: ConversionDocument
): ReadonlyMap<string, TextRange> {
	return new Map(
		document.sections.map((section, index) => [
			section.id,
			{
				from: section.literalHeaderRange?.to ?? section.at,
				to: document.sections[index + 1]?.at ?? document.content.length
			}
		])
	);
}

/** Explicit membership changes discover correspondence once; rendering never calls the aligner. */
export function resolveLinkDecision(
	document: ConversionDocument,
	projection: Projection,
	action: LinkDecision
): EngineResult<ReconciledDocument> {
	const current = renderProfile(document, projection.profile);
	if (!current.ok) return current;
	if (current.value.text !== projection.text)
		return refuse('stale-basis', 'The lyrics changed. Review the current sections before linking.');
	const byId = new Map(document.sections.map((section, index) => [section.id, index]));
	const ranges = conversionSectionRanges(document);
	const next = { ...document };
	if (action.kind === 'unlinkSection') {
		if (
			!byId.has(action.sectionId) ||
			!document.links.some((link) => link.sectionIds.includes(action.sectionId))
		)
			return refuse('invalid-input', 'This section is no longer part of a linked group.');
		next.links = next.links.flatMap((link) => {
			if (!link.sectionIds.includes(action.sectionId)) return [link];
			const sectionIds = link.sectionIds.filter((id) => id !== action.sectionId);
			if (sectionIds.length < 2) return [];
			return [
				{
					...link,
					sectionIds,
					passages: (link.passages ?? []).flatMap((passage) => {
						const members = passage.members.filter(
							(member) => member.sectionId !== action.sectionId
						);
						return members.length >= 2 ? [{ members }] : [];
					}),
					detached: link.detached?.filter((member) => member.sectionId !== action.sectionId)
				}
			];
		});
	} else {
		if (
			action.sectionIds.length < 2 ||
			new Set(action.sectionIds).size !== action.sectionIds.length ||
			action.sectionIds.some((id) => !byId.has(id))
		)
			return refuse('invalid-input', 'Choose at least two distinct current sections to link.');
		const selected = new Set(action.sectionIds);
		// Selecting any existing member adds the whole group; no unselected peer loses intent.
		let size = -1;
		while (size !== selected.size) {
			size = selected.size;
			for (const link of document.links)
				if (link.sectionIds.some((id) => selected.has(id)))
					for (const id of link.sectionIds) selected.add(id);
		}
		const sectionIds = document.sections
			.filter((section) => selected.has(section.id))
			.map((section) => section.id);
		const old = document.links.filter((link) => link.sectionIds.some((id) => selected.has(id)));
		const numeric = (member: LinkMember): PassageMember => ({
			header: byId.get(member.sectionId)!,
			from: member.from,
			to: member.to
		});
		const stable = (member: PassageMember): LinkMember => ({
			sectionId: document.sections[member.header]!.id,
			from: member.from,
			to: member.to
		});
		const seeds: SharedPassage[] = old.flatMap((link) =>
			(link.passages ?? []).map((passage) => ({ members: passage.members.map(numeric) }))
		);
		const detached = old.flatMap((link) => (link.detached ?? []).map(numeric));
		let candidates: PassageState = {
			passages: alignPassages(
				sectionIds.map((id) => {
					const range = ranges.get(id)!;
					return {
						header: byId.get(id)!,
						from: range.from,
						text: document.content.slice(range.from, range.to)
					};
				})
			),
			detached: []
		};
		for (const member of detached) candidates = detachPassageRange(candidates, member);
		// Older records without passages carry exclusions directly in holes. They cannot reconnect.
		for (const link of old.filter((entry) => entry.passages === undefined)) {
			for (const id of link.sectionIds) {
				const range = ranges.get(id)!;
				for (const hole of link.holes) {
					const from = Math.max(range.from, hole.from);
					const to = Math.min(range.to, hole.to);
					if (from <= to)
						candidates = detachPassageRange(candidates, { header: byId.get(id)!, from, to });
				}
			}
		}
		const passages = extendPassages(
			seeds,
			candidates.passages,
			old.map((link) => link.sectionIds.map((id) => byId.get(id)!)),
			detached
		);
		next.links = [
			...next.links.filter((link) => !link.sectionIds.some((id) => selected.has(id))),
			{
				id: old[0]?.id ?? allocateId(next, 'link'),
				sectionIds,
				// Old readers see local bodies instead of interpreting missing passages as full sharing.
				holes: sectionIds.map((id) => ({ ...ranges.get(id)! })),
				passages: passages.map((passage) => ({ members: passage.members.map(stable) })),
				detached: detached.map(stable)
			}
		];
	}
	const rendered = renderProfile(next, projection.profile);
	return rendered.ok
		? { ok: true, value: { document: next, projection: rendered.value, changes: [] } }
		: rendered;
}

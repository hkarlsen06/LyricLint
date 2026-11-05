import { alignBodies } from '#lib/core/link-shape.js';
import { describeLinkDifferences } from '#lib/core/link-differences.js';
import type { SectionLinkChoice, LinkDifference, TextEdit } from '#lib/core/types.js';
import { projectOffset } from './projection.js';
import { reconcileEdit } from './reconcile.js';
import { alignPassages, type PassageMember, type SharedPassage } from '#lib/core/link-passages.js';
import { extendPassages } from '#lib/core/link-passage-extension.js';
import { detachPassageRange, type PassageState } from '#lib/core/passage-targets.js';
import type { TextRange } from '#lib/core/types.js';
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
	| { kind: 'linkSections'; sectionIds: string[] }
	| { kind: 'unlinkSection'; sectionId: string }
	| { kind: 'reviewLinkDifferences'; sectionIds: string[]; choice: SectionLinkChoice };

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

/** Retained section identity supplies comparison bounds, never hidden header parsing. */
export function conversionLinkDifferences(
	document: ConversionDocument,
	projection: Projection,
	sectionIds: readonly string[]
): LinkDifference[] {
	const ranges = conversionSectionRanges(document);
	const members = sectionIds.flatMap((id, header) => {
		const range = ranges.get(id);
		if (!range) return [];
		const from = projectOffset(projection, range.from, 1);
		const end = projectOffset(projection, range.to, -1);
		const body = { from, to: from + projection.text.slice(from, end).trimEnd().length };
		return [{ header, body, holes: [] }];
	});
	const holes = alignBodies(
		members.map((member) => projection.text.slice(member.body.from, member.body.to))
	);
	return describeLinkDifferences(
		projection.text,
		members.map((member, index) => ({ ...member, holes: holes[index] ?? [] }))
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
	if (action.kind === 'reviewLinkDifferences') {
		const group = document.links.find(
			(link) =>
				link.sectionIds.length === action.sectionIds.length &&
				link.sectionIds.every((id, index) => id === action.sectionIds[index])
		);
		if (
			!group ||
			action.choice.headers.length !== group.sectionIds.length ||
			action.choice.headers.some((header, index) => header !== index)
		)
			return refuse('stale-basis', 'This linked group changed. Open Manage again.');
		const differences = conversionLinkDifferences(document, projection, group.sectionIds);
		const changes: TextEdit[] = [];
		for (const difference of differences) {
			if (action.choice.keepDifferent?.[difference.index] !== false) continue;
			const winner = action.choice.replaceFromByDifference?.[difference.index];
			const source = difference.wordings.find((wording) => wording.headerFrom === winner);
			if (!source) return refuse('invalid-input', 'Choose a current wording for each correction.');
			// An empty section cannot erase a populated performance.
			const range = conversionSectionRanges(document).get(group.sectionIds[source.headerFrom]);
			if (!range || !document.content.slice(range.from, range.to).trim())
				return refuse('invalid-input', 'An empty section cannot replace populated lyrics.');
			for (const wording of difference.wordings) {
				if (wording.text !== source.text)
					changes.push({
						from: wording.from,
						to: wording.from + wording.text.length,
						insert: source.text
					});
			}
		}
		return reconcileEdit(document, projection, {
			changes: changes.sort((a, b) => a.from - b.from),
			mirror: false
		});
	}
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

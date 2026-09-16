import { scanPhysicalLines } from '../core/parser.js';
import type { PerformerRecord, TextRange } from '../core/types.js';
import {
	allocateId,
	refuse,
	type ConversionDocument,
	type ContentLine,
	type EngineResult,
	type Projection,
	type ReconciledDocument
} from './model.js';
import { contentOffset, renderProfile } from './projection.js';
import { reconcileEdit } from './reconcile.js';

function inside(range: TextRange, lower: number, upper: number): boolean {
	return lower <= range.from && range.to <= upper;
}
const rangeKey = (from: number, to: number) => `${from}:${to}`;

/** A copied fragment contains only its selected lyrics and wholly owned hidden details. */
export function sliceDocument(
	document: ConversionDocument,
	projection: Projection,
	selection: TextRange
): EngineResult<ConversionDocument> {
	const current = renderProfile(document, projection.profile);
	if (!current.ok) return current;
	if (current.value.text !== projection.text)
		return refuse('stale-basis', 'The copied lyrics changed before their details could be read.');
	if (
		!Number.isSafeInteger(selection.from) ||
		!Number.isSafeInteger(selection.to) ||
		selection.from < 0 ||
		selection.from >= selection.to ||
		selection.to > projection.text.length
	)
		return refuse('invalid-input', 'Copy needs one nonempty lyric selection.');
	const lower = contentOffset(projection, selection.from, 1);
	const upper = contentOffset(projection, selection.to, -1);
	const shift = <T extends TextRange>(range: T): T => ({
		...range,
		from: range.from - lower,
		to: range.to - lower
	});
	const firstSegment = new Map<string, Projection['segments'][number]>();
	const unselectedSyntax = new Set<string>();
	for (const segment of projection.segments) {
		if (!segment.recordId) continue;
		if (!firstSegment.has(segment.recordId)) firstSegment.set(segment.recordId, segment);
		if (!inside(segment, selection.from, selection.to)) unselectedSyntax.add(segment.recordId);
	}
	const selectedSyntax = (id: string) => !unselectedSyntax.has(id);
	const sectionIds = new Set(
		document.sections
			.filter((section, index) => {
				if (section.literalHeaderRange && !inside(section.literalHeaderRange, lower, upper))
					return false;
				const shown = firstSegment.get(section.id);
				if (shown)
					return (
						inside(shown, selection.from, selection.to) &&
						lower <= section.at &&
						section.at <= upper
					);
				const end = document.sections[index + 1]?.at ?? document.content.length;
				if (end === section.at)
					return selection.from === 0 && selection.to === projection.text.length;
				return (
					lower <= section.at &&
					end <= upper &&
					(section.at < upper || selection.to === projection.text.length)
				);
			})
			.map((section) => section.id)
	);
	const owners = document.owners
		.filter((owner) => owner.from < upper && lower < owner.to)
		.map((owner) => ({
			...owner,
			from: Math.max(owner.from, lower) - lower,
			to: Math.min(owner.to, upper) - lower
		}));
	const createdOwner = !owners.length && lower === upper;
	if (createdOwner)
		owners.push({
			id: `owner:${document.nextId}`,
			from: 0,
			to: 0,
			revision: 0,
			authoredProfile: projection.profile
		});
	const ownerIds = new Set(owners.map((owner) => owner.id));
	const wrappers = document.wrappers
		.filter((wrapper) => inside(wrapper, lower, upper) && selectedSyntax(wrapper.id))
		.map(shift);
	const wrapperIds = new Set(wrappers.map((wrapper) => wrapper.id));
	const originalOwners = new Map(document.owners.map((owner) => [owner.id, owner]));
	const unselectedMarkerDecisions = new Set(
		document.markers
			.filter((marker) => !selectedSyntax(marker.id))
			.map((marker) => marker.decisionId)
	);
	const decisions = document.decisions
		.filter((decision) => {
			const owner = originalOwners.get(decision.ownerId);
			if (!owner || !inside(owner, lower, upper) || !ownerIds.has(owner.id)) return false;
			if ('from' in decision && !inside(decision, lower, upper)) return false;
			if (decision.kind === 'instrumental-interval')
				return (
					sectionIds.has(decision.facts.beforeSectionId) &&
					sectionIds.has(decision.facts.afterSectionId) &&
					!unselectedMarkerDecisions.has(decision.id)
				);
			return true;
		})
		.map((decision) => ('from' in decision ? shift(decision) : { ...decision }));
	const decisionIds = new Set(decisions.map((decision) => decision.id));
	const fragment: ConversionDocument = {
		...document,
		content: document.content.slice(lower, upper),
		owners,
		nextId: document.nextId + Number(createdOwner),
		lines: [],
		sections: document.sections
			.filter((section) => sectionIds.has(section.id))
			.map((section) => {
				const result = { ...section, at: section.at - lower };
				if (section.literalHeaderRange)
					result.literalHeaderRange = shift(section.literalHeaderRange);
				return result;
			}),
		wrappers,
		markers: document.markers
			.filter((marker) => decisionIds.has(marker.decisionId))
			.map((marker) => ({ ...marker, at: marker.at - lower })),
		forms: document.forms
			.filter(
				(form) =>
					inside(form, lower, upper) && ownerIds.has(form.ownerId) && selectedSyntax(form.id)
			)
			.map(shift),
		languageRanges: document.languageRanges
			.filter((range) => range.from < upper && lower < range.to)
			.map((range) => ({
				...range,
				from: Math.max(range.from, lower) - lower,
				to: Math.min(range.to, upper) - lower
			})),
		voices: document.voices
			.filter(
				(voice) =>
					inside(voice, lower, upper) &&
					sectionIds.has(voice.sectionId) &&
					(!voice.wrapperId || wrapperIds.has(voice.wrapperId))
			)
			.map((voice) => ({ ...shift(voice), performerIds: [...voice.performerIds] })),
		links: document.links
			.filter(
				(link) =>
					link.sectionIds.every((id) => sectionIds.has(id)) &&
					link.holes.every((hole) => inside(hole, lower, upper)) &&
					(link.passages ?? []).every((passage) =>
						passage.members.every((member) => inside(member, lower, upper))
					) &&
					(link.detached ?? []).every((member) => inside(member, lower, upper))
			)
			.map((link) => {
				const result = { ...link, sectionIds: [...link.sectionIds], holes: link.holes.map(shift) };
				if (link.passages !== undefined)
					result.passages = link.passages.map((passage) => ({
						members: passage.members.map(shift)
					}));
				if (link.detached !== undefined) result.detached = link.detached.map(shift);
				return result;
			}),
		decisions
	};
	if (!fragment.decisions.some((decision) => decision.kind === 'instrumental-interval'))
		delete fragment.recordingId;
	const originalLines = new Map(document.lines.map((line) => [rangeKey(line.from, line.to), line]));
	fragment.lines = scanPhysicalLines(fragment.content).map((line) => {
		const original = originalLines.get(rangeKey(lower + line.from, lower + line.to));
		const result: ContentLine = { id: allocateId(fragment, 'line'), from: line.from, to: line.to };
		if (original?.time !== undefined) result.time = original.time;
		return result;
	});
	const rendered = renderProfile(fragment, projection.profile);
	if (!rendered.ok) return rendered;
	if (rendered.value.text !== projection.text.slice(selection.from, selection.to))
		return refuse(
			'unavailable-capability',
			'This partial syntax selection can only be copied as exact text.'
		);
	return { ok: true, value: fragment };
}

export interface PastedDocument extends ReconciledDocument {
	performers: PerformerRecord[];
}

/** Insert canonical content once, then attach the fragment's explicitly owned records. */
export function pasteDocument(
	document: ConversionDocument,
	projection: Projection,
	selection: TextRange,
	fragment: ConversionDocument,
	profile: Projection['profile'],
	performers: readonly PerformerRecord[] = [],
	existingPerformers: readonly PerformerRecord[] = []
): EngineResult<PastedDocument> {
	if (profile !== projection.profile)
		return refuse('unavailable-capability', 'Copied details use a different lyric format.');
	if (
		fragment.decisions.some((decision) => decision.kind === 'instrumental-interval') &&
		fragment.recordingId !== document.recordingId
	)
		return refuse(
			'unavailable-capability',
			'The copied instrumental facts belong to a different recording. Paste the exact lyrics and review that recording first.'
		);
	const lower = contentOffset(projection, selection.from, 1);
	const upper = contentOffset(projection, selection.to, -1);
	if (
		document.links.some((link) =>
			link.passages?.some((passage) =>
				passage.members.some((member) => member.from <= lower && upper <= member.to)
			)
		)
	) {
		return refuse(
			'unavailable-capability',
			'Linked lyrics need their ordinary mirrored paste before copied details can be attached.'
		);
	}
	const source = renderProfile(fragment, profile);
	if (!source.ok) return source;
	const edited = reconcileEdit(document, projection, {
		changes: [{ ...selection, insert: fragment.content }],
		mirror: false
	});
	if (!edited.ok) return edited;
	const next: ConversionDocument = structuredClone(edited.value.document);
	const at = contentOffset(edited.value.projection, selection.from, 1);
	if (next.content.slice(at, at + fragment.content.length) !== fragment.content)
		return refuse(
			'unavailable-capability',
			'The pasted details cannot be attached safely at this position.'
		);
	const shifted = <T extends TextRange>(range: T): T => ({
		...range,
		from: range.from + at,
		to: range.to + at
	});
	const ids = new Map<string, string>();
	const id = (old: string, kind: string) => {
		let mapped = ids.get(old);
		if (!mapped) {
			mapped = allocateId(next, kind);
			ids.set(old, mapped);
		}
		return mapped;
	};
	const ownerFor = (from: number, to: number) => {
		let left = 0,
			right = next.owners.length;
		while (left < right) {
			const middle = (left + right) >>> 1;
			if (next.owners[middle]!.to < to + at) left = middle + 1;
			else right = middle;
		}
		const owner = next.owners[left];
		return owner && owner.from <= from + at ? owner : undefined;
	};
	const fragmentOwners = new Map(fragment.owners.map((owner) => [owner.id, owner]));
	const copiedOwners = new Map(
		fragment.owners.map((owner) => [rangeKey(owner.from + at, owner.to + at), owner])
	);
	for (const owner of next.owners) {
		const copiedOwner = copiedOwners.get(rangeKey(owner.from, owner.to));
		if (copiedOwner) owner.authoredProfile = copiedOwner.authoredProfile;
	}
	const offsetOrder =
		next.wrappers.reduce(
			(maximum, wrapper) => Math.max(maximum, wrapper.openOrder, wrapper.closeOrder),
			next.sections.reduce(
				(maximum, section) => Math.max(maximum, section.order),
				next.markers.reduce((maximum, marker) => Math.max(maximum, marker.order), -1)
			)
		) + 1;
	for (const section of fragment.sections) {
		const copied = {
			...section,
			id: id(section.id, 'section'),
			at: section.at + at,
			order: section.order + offsetOrder
		};
		if (section.literalHeaderRange) copied.literalHeaderRange = shifted(section.literalHeaderRange);
		next.sections.push(copied);
	}
	next.sections.sort((a, b) => a.at - b.at || a.order - b.order);
	for (const wrapper of fragment.wrappers)
		next.wrappers.push({
			...shifted(wrapper),
			id: id(wrapper.id, 'wrapper'),
			openOrder: wrapper.openOrder + offsetOrder,
			closeOrder: wrapper.closeOrder + offsetOrder
		});
	const copiedLanguages = fragment.languageRanges.map((range) => ({
		...shifted(range),
		id: id(range.id, 'language')
	}));
	if (fragment.defaultLanguage !== next.defaultLanguage && fragment.content.length > 0) {
		copiedLanguages.push({
			id: allocateId(next, 'language'),
			from: at,
			to: at + fragment.content.length,
			language: fragment.defaultLanguage
		});
	}
	next.languageRanges = [...copiedLanguages, ...next.languageRanges];
	for (const form of fragment.forms) {
		const owner = ownerFor(form.from, form.to);
		if (!owner)
			return refuse('unavailable-capability', 'A pasted spelling crosses a content owner.');
		next.forms.push({
			...shifted(form),
			id: id(form.id, 'form'),
			ownerId: owner.id,
			ownerRevision: owner.revision
		});
	}
	for (const decision of fragment.decisions) {
		const sourceOwner = fragmentOwners.get(decision.ownerId)!;
		const owner = ownerFor(sourceOwner.from, sourceOwner.to);
		if (owner) {
			const copied = {
				...('from' in decision ? shifted(decision) : decision),
				id: id(decision.id, 'decision'),
				ownerId: owner.id,
				ownerRevision: owner.revision
			};
			if (copied.kind === 'instrumental-interval')
				copied.facts = {
					...copied.facts,
					beforeSectionId: id(copied.facts.beforeSectionId, 'section'),
					afterSectionId: id(copied.facts.afterSectionId, 'section')
				};
			next.decisions.push(copied);
		}
	}
	for (const marker of fragment.markers)
		next.markers.push({
			...marker,
			id: id(marker.id, 'marker'),
			at: marker.at + at,
			order: marker.order + offsetOrder,
			decisionId: id(marker.decisionId, 'decision')
		});
	const nextLines = new Map(next.lines.map((line) => [rangeKey(line.from, line.to), line]));
	for (const line of fragment.lines) {
		if (line.time === undefined) continue;
		const target = nextLines.get(rangeKey(line.from + at, line.to + at));
		if (target) target.time = line.time;
	}
	const performerIds = new Map<string, string>();
	const additions: PerformerRecord[] = [];
	const usedPerformerIds = new Set(existingPerformers.map((performer) => performer.id));
	const existingById = new Map(existingPerformers.map((performer) => [performer.id, performer]));
	for (const performer of performers) {
		const existing = existingById.get(performer.id);
		if (existing && JSON.stringify(existing) === JSON.stringify(performer)) {
			performerIds.set(performer.id, existing.id);
			continue;
		}
		let candidate = performer.id;
		let sequence = 1;
		while (usedPerformerIds.has(candidate)) candidate = `${performer.id}:paste:${sequence++}`;
		usedPerformerIds.add(candidate);
		performerIds.set(performer.id, candidate);
		additions.push({
			...performer,
			id: candidate,
			aliases: [...performer.aliases],
			order: existingPerformers.length + additions.length
		});
	}
	for (const voice of fragment.voices) {
		if (voice.performerIds.some((performer) => !performerIds.has(performer)))
			return refuse('invalid-input', 'The copied voices are missing their performer identities.');
		const copied = {
			...shifted(voice),
			id: id(voice.id, 'voice'),
			sectionId: id(voice.sectionId, 'section'),
			performerIds: voice.performerIds.map((performer) => performerIds.get(performer)!)
		};
		if (voice.wrapperId) copied.wrapperId = id(voice.wrapperId, 'wrapper');
		next.voices.push(copied);
	}
	for (const link of fragment.links) {
		const copied = {
			...link,
			id: id(link.id, 'link'),
			sectionIds: link.sectionIds.map((section) => id(section, 'section')),
			holes: link.holes.map(shifted)
		};
		if (link.passages !== undefined)
			copied.passages = link.passages.map((passage) => ({
				members: passage.members.map((member) => ({
					...shifted(member),
					sectionId: id(member.sectionId, 'section')
				}))
			}));
		if (link.detached !== undefined)
			copied.detached = link.detached.map((member) => ({
				...shifted(member),
				sectionId: id(member.sectionId, 'section')
			}));
		next.links.push(copied);
	}
	const rendered = renderProfile(next, profile);
	if (!rendered.ok) return rendered;
	const expected =
		projection.text.slice(0, selection.from) +
		source.value.text +
		projection.text.slice(selection.to);
	if (rendered.value.text !== expected)
		return refuse(
			'unavailable-capability',
			'Pasting these details would change the copied lyrics.'
		);
	return {
		ok: true,
		value: {
			document: next,
			projection: rendered.value,
			changes: [{ ...selection, insert: source.value.text }],
			performers: additions
		}
	};
}

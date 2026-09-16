import { scanPhysicalLines } from '$lib/core/parser.js';
import {
	applyPassageTransfer,
	mapPassageState,
	passageTargets,
	type PassageState
} from '$lib/core/passage-targets.js';
import type { PassageMember } from '$lib/core/link-passages.js';
import type { TextEdit, TextRange } from '$lib/core/types.js';
import { importDocument } from './import.js';
import {
	allocateId,
	CONVERSION_LIMITS,
	refuse,
	type CommittedEdit,
	type ContentOwner,
	type ContentLine,
	type ConversionDocument,
	type ConversionDecision,
	type EngineResult,
	type LinkRecord,
	type Projection,
	type ReconciledDocument
} from './model.js';
import { contentOffset, projectOffset, renderProfile } from './projection.js';

export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
	const parts: string[] = [];
	let cursor = 0;
	for (const edit of edits) {
		parts.push(text.slice(cursor, edit.from), edit.insert);
		cursor = edit.to;
	}
	parts.push(text.slice(cursor));
	return parts.join('');
}

/** Same UTF-16 boundary affinities as editor changes, without an editor dependency. */
export function mapEditPosition(
	at: number,
	edits: readonly TextEdit[],
	affinity: -1 | 1 = 1
): number {
	let delta = 0;
	for (const edit of edits) {
		if (at < edit.from) break;
		if (at > edit.to || (at === edit.to && edit.from !== edit.to)) {
			delta += edit.insert.length - (edit.to - edit.from);
			continue;
		}
		if (at === edit.from && edit.from !== edit.to) return edit.from + delta;
		return edit.from + delta + (affinity < 0 ? 0 : edit.insert.length);
	}
	return at + delta;
}

function validEdits(text: string, edits: readonly TextEdit[]): boolean {
	let previousTo = -1;
	let previousFrom = -1;
	return edits.every((edit) => {
		const valid =
			Number.isSafeInteger(edit.from) &&
			Number.isSafeInteger(edit.to) &&
			edit.from >= 0 &&
			edit.from <= edit.to &&
			edit.to <= text.length &&
			typeof edit.insert === 'string' &&
			edit.from >= previousTo &&
			edit.from !== previousFrom;
		previousFrom = edit.from;
		previousTo = edit.to;
		return valid;
	});
}

function overlaps(range: TextRange, edit: TextEdit): boolean {
	return edit.from === edit.to
		? range.from < edit.from && edit.from < range.to
		: range.from < edit.to && edit.from < range.to;
}

function updateEmptySections(document: ConversionDocument): void {
	document.sections = document.sections.map((section, index) => ({
		...section,
		explicitEmpty:
			document.content
				.slice(
					section.literalHeaderRange?.to ?? section.at,
					document.sections[index + 1]?.at ?? document.content.length
				)
				.trim().length === 0
	}));
}

function projectedRange(projection: Projection, id: string): TextRange | undefined {
	const segments = projection.segments.filter((segment) => segment.recordId === id);
	return segments.length ? { from: segments[0]!.from, to: segments.at(-1)!.to } : undefined;
}

function sharedChanges(projection: Projection, changes: readonly TextEdit[]): TextEdit[] {
	// Editing part of an existing spelling materializes its whole unit. Combine
	// multiple edits to that same unit before applying the exact visible changes.
	const groups: { from: number; to: number; edits: TextEdit[] }[] = [];
	for (const edit of changes) {
		let from = edit.from;
		let to = edit.to;
		for (const segment of projection.segments)
			if (segment.kind === 'transformed' && overlaps(segment, edit)) {
				from = Math.min(from, segment.from);
				to = Math.max(to, segment.to);
			}
		const previous = groups.at(-1);
		if (previous && from < previous.to) {
			previous.to = Math.max(previous.to, to);
			previous.edits.push(edit);
		} else groups.push({ from, to, edits: [edit] });
	}
	return groups.map((group) => ({
		from: Math.min(
			contentOffset(projection, group.from, -1),
			...projection.hidden
				.filter(
					(entry) => entry.contentTo !== undefined && group.from <= entry.at && entry.at <= group.to
				)
				.map((entry) => entry.contentAt)
		),
		to: Math.max(
			contentOffset(projection, group.to, 1),
			...projection.hidden
				.filter(
					(entry) => entry.contentTo !== undefined && group.from <= entry.at && entry.at <= group.to
				)
				.map((entry) => entry.contentTo!)
		),
		insert: applyTextEdits(
			projection.text.slice(group.from, group.to),
			group.edits.map((edit) => ({
				from: edit.from - group.from,
				to: edit.to - group.from,
				insert: edit.insert
			}))
		)
	}));
}

function passageState(link: LinkRecord, sectionTokens: Map<string, number>): PassageState {
	const member = (entry: { sectionId: string; from: number; to: number }) => ({
		from: entry.from,
		to: entry.to,
		header: sectionTokens.get(entry.sectionId)!
	});
	return {
		passages: (link.passages ?? []).map((passage) => ({ members: passage.members.map(member) })),
		detached: (link.detached ?? []).map(member)
	};
}

interface MirrorPlan {
	changes: TextEdit[];
	transfers: { linkId: string; members: PassageMember[] }[];
}
function expandMirrors(
	document: ConversionDocument,
	changes: TextEdit[],
	onlySectionId?: string
): EngineResult<MirrorPlan> {
	const tokens = new Map(document.sections.map((section, index) => [section.id, -index - 1]));
	const added: TextEdit[] = [...changes];
	const transfers: MirrorPlan['transfers'] = [];
	for (const change of changes) {
		const section = document.sections.findLast((entry) => entry.at <= change.from);
		const nextSection = section
			? document.sections[document.sections.indexOf(section) + 1]
			: undefined;
		if (!section || (nextSection && change.to > nextSection.at) || section.id === onlySectionId)
			continue;
		for (const link of document.links) {
			if (!link.sectionIds.includes(section.id)) continue;
			const header = tokens.get(section.id)!;
			const targets = passageTargets(passageState(link, tokens), document.content, header, change);
			if (!targets.length) continue;
			const recipients: PassageMember[] = [{ header, from: change.from, to: change.to }];
			for (const target of targets) {
				const identical = added.find(
					(entry) =>
						entry.from === target.from && entry.to === target.to && entry.insert === change.insert
				);
				if (
					!identical &&
					added.some(
						(entry) =>
							(entry.from < target.to && target.from < entry.to) || entry.from === target.from
					)
				)
					return refuse('invalid-input', 'Linked edits overlap with another committed change.');
				if (!identical) added.push({ from: target.from, to: target.to, insert: change.insert });
				recipients.push(target);
			}
			transfers.push({ linkId: link.id, members: recipients });
		}
	}
	added.sort((a, b) => a.from - b.from || a.to - b.to);
	return { ok: true, value: { changes: added, transfers } };
}

/** First surviving old code unit owns a split; a complete in-place rewrite keeps its line. */
function survivingPoint(
	range: TextRange,
	changes: readonly TextEdit[],
	before: string
): number | undefined {
	let at = range.from;
	for (const change of changes) {
		if (change.to <= at || change.from >= range.to) continue;
		if (change.from > at) return at;
		at = change.to;
		if (at >= range.to) break;
	}
	if (at < range.to || range.from === range.to) return at;
	const touching = changes.filter((change) => overlaps(range, change));
	if (touching.length === 1) {
		const change = touching[0]!;
		if (
			change.insert.length > 0 &&
			(before.slice(change.from, change.to).match(/\n/gu)?.length ?? 0) ===
				(change.insert.match(/\n/gu)?.length ?? 0)
		)
			return range.from;
	}
	return undefined;
}

function retainLinesAndOwners(
	before: ConversionDocument,
	after: ConversionDocument,
	map: (at: number, affinity: -1 | 1) => number,
	sharedEdits: readonly TextEdit[],
	profile: Projection['profile']
): void {
	const physical = scanPhysicalLines(after.content);
	const lineCandidates = before.lines.flatMap((line) => {
		const point = survivingPoint(line, sharedEdits, before.content);
		return point === undefined ? [] : [{ line, at: map(point, 1) }];
	});
	const ownerCandidates = before.owners.flatMap((owner) => {
		const point = survivingPoint(
			{
				from: owner.from,
				to: owner.to > owner.from && before.content[owner.to - 1] === '\n' ? owner.to - 1 : owner.to
			},
			sharedEdits,
			before.content
		);
		return point === undefined ? [] : [{ owner, at: map(point, 1) }];
	});
	let lineIndex = 0;
	after.lines = physical.map((line) => {
		while (lineIndex < lineCandidates.length && lineCandidates[lineIndex]!.at < line.from)
			lineIndex++;
		const candidates: typeof lineCandidates = [];
		while (lineIndex < lineCandidates.length && lineCandidates[lineIndex]!.at <= line.to)
			candidates.push(lineCandidates[lineIndex++]!);
		const retained = candidates[0]?.line;
		const times = candidates.flatMap(({ line }) => (line.time === undefined ? [] : [line.time]));
		const result: ContentLine = {
			id: retained?.id ?? allocateId(after, 'line'),
			from: line.from,
			to: line.to
		};
		if (times.length) result.time = Math.min(...times);
		return result;
	});
	let ownerIndex = 0;
	after.owners = physical.map((line): ContentOwner => {
		while (ownerIndex < ownerCandidates.length && ownerCandidates[ownerIndex]!.at < line.from)
			ownerIndex++;
		const retained =
			ownerCandidates[ownerIndex]?.at <= line.to ? ownerCandidates[ownerIndex]!.owner : undefined;
		while (ownerIndex < ownerCandidates.length && ownerCandidates[ownerIndex]!.at <= line.to)
			ownerIndex++;
		const to = line.lineEndingRange.to;
		const inherited =
			retained ??
			before.owners.find((owner) => map(owner.from, 1) < to && line.from < map(owner.to, -1));
		return {
			id: retained?.id ?? allocateId(after, 'owner'),
			from: line.from,
			to,
			revision: retained
				? retained.revision +
					Number(
						before.content.slice(retained.from, retained.to) !== after.content.slice(line.from, to)
					)
				: 0,
			authoredProfile: inherited?.authoredProfile ?? profile
		};
	});
}

function retainOtherRecords(
	before: ConversionDocument,
	after: ConversionDocument,
	map: (at: number, affinity: -1 | 1) => number,
	changes: readonly TextEdit[],
	transfers: MirrorPlan['transfers']
): void {
	const owners = new Map(after.owners.map((owner) => [owner.id, owner]));
	after.forms = before.forms.flatMap((form) => {
		if (changes.some((change) => overlaps(form, change))) return [];
		const from = map(form.from, 1);
		const to = map(form.to, -1);
		const owner = after.owners.find((entry) => entry.from <= from && to <= entry.to);
		return owner ? [{ ...form, from, to, ownerId: owner.id, ownerRevision: owner.revision }] : [];
	});
	const changedSources: ContentOwner[] = [];
	let ownerIndex = 0;
	for (const previous of before.owners) {
		const from = map(previous.from, 1),
			to = map(previous.to, -1);
		if (from >= to) continue;
		while (ownerIndex < after.owners.length && after.owners[ownerIndex]!.to <= from) ownerIndex++;
		for (
			let index = ownerIndex;
			index < after.owners.length && after.owners[index]!.from < to;
			index++
		) {
			if (after.owners[index]!.authoredProfile !== previous.authoredProfile) {
				changedSources.push(previous);
				break;
			}
		}
	}
	if (changedSources.length) {
		// Joining differently authored lines must retain each surviving source's
		// exceptions. One physical owner survives the join; precise local forms carry
		// the other source's spelling without changing unrelated policy eligibility.
		for (const profile of ['genius', 'musixmatch'] as const) {
			const projection = renderProfile(before, profile);
			if (!projection.ok) continue;
			const units = [
				...projection.value.segments
					.filter((segment) => segment.kind === 'transformed')
					.map((segment) => ({
						from: segment.contentFrom,
						to: segment.contentTo,
						text: projection.value.text.slice(segment.from, segment.to)
					})),
				...projection.value.hidden
					.filter((entry) => entry.contentTo !== undefined)
					.map((entry) => ({ from: entry.contentAt, to: entry.contentTo!, text: '' }))
			];
			for (const unit of units) {
				if (changes.some((change) => overlaps(unit, change))) continue;
				const old = before.owners.find((owner) => owner.from <= unit.from && unit.to <= owner.to);
				const from = map(unit.from, 1),
					to = map(unit.to, -1);
				const owner = after.owners.find((entry) => entry.from <= from && to <= entry.to);
				if (
					!old ||
					!owner ||
					old.authoredProfile === owner.authoredProfile ||
					from >= to ||
					after.forms.some((form) => form.profile === profile && form.from < to && from < form.to)
				)
					continue;
				after.forms.push({
					id: allocateId(after, 'form'),
					from,
					to,
					text: unit.text,
					profile,
					ownerId: owner.id,
					ownerRevision: owner.revision
				});
			}
		}
		for (const previous of changedSources) {
			const surviving: TextRange[] = [];
			let cursor = previous.from;
			for (const edit of changes) {
				if (edit.to < cursor || previous.to <= edit.from) continue;
				if (cursor < edit.from)
					surviving.push({ from: cursor, to: Math.min(edit.from, previous.to) });
				cursor = Math.max(cursor, edit.to);
			}
			if (cursor < previous.to) surviving.push({ from: cursor, to: previous.to });
			for (const span of surviving) {
				const start = map(span.from, 1),
					end = map(span.to, -1);
				for (const owner of after.owners) {
					const from = Math.max(start, owner.from),
						to = Math.min(end, owner.to);
					if (from >= to || previous.authoredProfile === owner.authoredProfile) continue;
					const boundaries = new Set([from, to]);
					for (const range of [
						...after.forms,
						...after.wrappers,
						...after.voices,
						...after.languageRanges
					])
						for (const at of [range.from, range.to]) if (from < at && at < to) boundaries.add(at);
					for (const section of after.sections)
						if (from < section.at && section.at < to) boundaries.add(section.at);
					const positions = [...boundaries].sort((a, b) => a - b);
					for (let index = 0; index < positions.length - 1; index++) {
						const lower = positions[index]!,
							upper = positions[index + 1]!;
						if (
							after.forms.some(
								(form) =>
									form.profile === previous.authoredProfile && form.from < upper && lower < form.to
							)
						)
							continue;
						after.forms.push({
							id: allocateId(after, 'form'),
							from: lower,
							to: upper,
							text: after.content.slice(lower, upper),
							profile: previous.authoredProfile,
							ownerId: owner.id,
							ownerRevision: owner.revision
						});
					}
				}
			}
		}
	}
	after.recordingId = before.recordingId;
	after.decisions = before.decisions.flatMap((decision): ConversionDecision[] => {
		if (decision.kind === 'keep-form')
			return owners.get(decision.ownerId)?.revision === decision.ownerRevision ? [decision] : [];
		let from: number;
		let to: number;
		if (decision.kind === 'instrumental-interval') {
			const index = after.sections.findIndex(
				(section) => section.id === decision.facts.beforeSectionId
			);
			const following = after.sections[index + 1];
			if (index < 0 || following?.id !== decision.facts.afterSectionId) return [];
			from = to = following.at;
		} else {
			if (changes.some((change) => overlaps(decision, change))) return [];
			from = map(decision.from, 1);
			to = map(decision.to, -1);
			if (from >= to) return [];
		}
		const owner = after.owners.find((entry) => entry.from <= from && to <= entry.to);
		return owner
			? [{ ...decision, from, to, ownerId: owner.id, ownerRevision: owner.revision }]
			: [];
	});
	after.markers = before.markers.flatMap((marker) => {
		const decision = after.decisions.find((entry) => entry.id === marker.decisionId);
		return decision?.kind === 'instrumental-interval' ? [{ ...marker, at: decision.from }] : [];
	});
	after.languageRanges = before.languageRanges.flatMap((range) => {
		const from = map(range.from, 1);
		const to = map(range.to, -1);
		return from < to ? [{ ...range, from, to }] : [];
	});
	const tokens = new Map(before.sections.map((section, index) => [section.id, -index - 1]));
	const byToken = new Map([...tokens].map(([id, token]) => [token, id]));
	const sectionIds = new Set(after.sections.map((section) => section.id));
	const wrapperIds = new Set(after.wrappers.map((wrapper) => wrapper.id));
	after.voices = before.voices.flatMap((voice) => {
		if (!sectionIds.has(voice.sectionId) || (voice.wrapperId && !wrapperIds.has(voice.wrapperId)))
			return [];
		const from = map(voice.from, 1);
		const to = map(voice.to, -1);
		if (
			from > to ||
			(from === to &&
				voice.from !== voice.to &&
				changes.some(
					(change) =>
						change.from <= voice.from && voice.to <= change.to && change.insert.length === 0
				))
		)
			return [];
		return [{ ...voice, from, to }];
	});
	const mapping = {
		mapPos: (at: number, affinity = 1) => (at < 0 ? at : map(at, affinity < 0 ? -1 : 1))
	};
	after.links = before.links.flatMap((link) => {
		const keptIds = link.sectionIds.filter((id) => sectionIds.has(id));
		if (keptIds.length < 2) return [];
		let state = mapPassageState(
			passageState(link, tokens),
			mapping,
			changes,
			before.content,
			after.content
		);
		for (const transfer of transfers)
			if (transfer.linkId === link.id)
				state = applyPassageTransfer(state, mapping, transfer.members);
		const member = (entry: PassageMember) => ({
			sectionId: byToken.get(entry.header)!,
			from: entry.from,
			to: entry.to
		});
		const passages = state.passages
			.map((passage) => ({
				members: passage.members
					.filter((entry) => sectionIds.has(byToken.get(entry.header)!))
					.map(member)
			}))
			.filter((passage) => passage.members.length >= 2);
		const retained: LinkRecord = {
			...link,
			sectionIds: keptIds,
			holes: link.holes.map((hole) => ({ from: map(hole.from, -1), to: map(hole.to, 1) })),
			passages
		};
		if (link.detached)
			retained.detached = state.detached
				.filter((entry) => sectionIds.has(byToken.get(entry.header)!))
				.map(member);
		return [retained];
	});
}

/** Deliberate typing owns its exact spelling, even if the active policy would correct it. */
function captureAuthoredEdits(
	document: ConversionDocument,
	profile: Projection['profile'],
	edits: readonly TextEdit[],
	map: (at: number, affinity: -1 | 1) => number
): void {
	for (const edit of edits) {
		if (!edit.insert.length) continue;
		const from = map(edit.from, -1);
		const to = map(edit.to, 1);
		for (const owner of document.owners) {
			const start = Math.max(from, owner.from);
			const end = Math.min(to, owner.to);
			if (start >= end || owner.authoredProfile === profile) continue;
			document.forms = document.forms.filter(
				(form) => form.profile !== profile || form.to <= start || end <= form.from
			);
			document.forms.push({
				id: allocateId(document, 'form'),
				from: start,
				to: end,
				profile,
				ownerId: owner.id,
				ownerRevision: owner.revision,
				text: document.content.slice(start, end)
			});
		}
	}
}

function reconcilePlain(
	document: ConversionDocument,
	projection: Projection,
	input: CommittedEdit
): EngineResult<ReconciledDocument> {
	const sourceChanges = sharedChanges(projection, input.changes);
	const mirrored =
		input.mirror === false
			? { ok: true as const, value: { changes: sourceChanges, transfers: [] } }
			: expandMirrors(document, sourceChanges, input.onlySectionId);
	if (!mirrored.ok) return mirrored;
	const { changes, transfers } = mirrored.value;
	if (!validEdits(document.content, changes))
		return refuse('invariant-failure', 'Mapped edits overlap.');
	const next: ConversionDocument = {
		...document,
		content: applyTextEdits(document.content, changes)
	};
	const map = (at: number, affinity: -1 | 1) => mapEditPosition(at, changes, affinity);
	next.sections = document.sections.map((section) => {
		const result = { ...section, at: map(section.at, -1) };
		if (section.literalHeaderRange)
			result.literalHeaderRange = {
				from: map(section.literalHeaderRange.from, 1),
				to: map(
					section.literalHeaderRange.to,
					section.literalHeaderRange.from === section.literalHeaderRange.to ? 1 : -1
				)
			};
		return result;
	});
	next.wrappers = document.wrappers.flatMap((wrapper) => {
		const deleted = changes.some(
			(change) =>
				change.from <= wrapper.from &&
				wrapper.to <= change.to &&
				change.from !== change.to &&
				(change.insert.length === 0 || change.from < wrapper.from || change.to > wrapper.to)
		);
		if (deleted) return [];
		const from = map(wrapper.from, 1);
		const to = map(wrapper.to, wrapper.from === wrapper.to ? 1 : -1);
		return from <= to ? [{ ...wrapper, from, to }] : [];
	});
	retainLinesAndOwners(document, next, map, changes, projection.profile);
	retainOtherRecords(document, next, map, changes, transfers);
	captureAuthoredEdits(next, projection.profile, changes, map);
	updateEmptySections(next);
	const result = renderProfile(next, projection.profile);
	if (!result.ok) return result;
	const visibleChanges = changes.map((change) => ({
		from: projectOffset(projection, change.from, 1),
		to: projectOffset(projection, change.to, -1),
		insert: change.insert
	}));
	const expected = applyTextEdits(projection.text, visibleChanges);
	if (result.value.text !== expected)
		return refuse(
			'invariant-failure',
			'The edited lyric projection could not be preserved exactly.'
		);
	return { ok: true, value: { document: next, projection: result.value, changes: visibleChanges } };
}

function reconcileGenius(
	document: ConversionDocument,
	projection: Projection,
	input: CommittedEdit
): EngineResult<ReconciledDocument> {
	const text = applyTextEdits(projection.text, input.changes);
	const imported = importDocument({
		text,
		profile: 'genius',
		contentKind: document.contentKind,
		language: document.defaultLanguage,
		performers: input.performers
	});
	if (!imported.ok) return imported;
	const next = imported.value;
	const freshProjection = renderProfile(next, 'genius');
	if (!freshProjection.ok) return freshProjection;
	const fresh = freshProjection.value;
	next.nextId = document.nextId;
	const mapVisible = (at: number, affinity: -1 | 1) => mapEditPosition(at, input.changes, affinity);
	// Parsing syntax must not turn an untouched alternate spelling into the new
	// shared source. Restore only those exact mapped units, without searching text.
	const retainedForms = document.forms.filter((form) => form.profile === 'genius');
	const restorations: TextEdit[] = retainedForms
		.flatMap((form) => {
			const range = {
				from: projectOffset(projection, form.from, 1),
				to: projectOffset(projection, form.to, -1)
			};
			if (
				input.changes.some(
					(change) =>
						overlaps(range, change) ||
						(range.from === range.to && change.from <= range.from && range.from <= change.to)
				)
			)
				return [];
			return [
				{
					from: contentOffset(fresh, mapVisible(range.from, 1), 1),
					to: contentOffset(fresh, mapVisible(range.to, -1), -1),
					insert: document.content.slice(form.from, form.to)
				}
			];
		})
		.sort((a, b) => a.from - b.from);
	if (!validEdits(next.content, restorations))
		return refuse(
			'invariant-failure',
			'Untouched authored forms could not be mapped through the syntax edit.'
		);
	const restoreAt = (at: number, affinity: -1 | 1) => mapEditPosition(at, restorations, affinity);
	next.content = applyTextEdits(next.content, restorations);
	next.sections = next.sections.map((section) => ({ ...section, at: restoreAt(section.at, -1) }));
	next.wrappers = next.wrappers.map((wrapper) => ({
		...wrapper,
		from: restoreAt(wrapper.from, 1),
		to: restoreAt(wrapper.to, -1)
	}));
	const map = (at: number, affinity: -1 | 1) =>
		restoreAt(
			contentOffset(fresh, mapVisible(projectOffset(projection, at, affinity), affinity), affinity),
			affinity
		);
	const mappedRange = (id: string) => {
		const section = document.sections.find((entry) => entry.id === id);
		const old =
			projectedRange(projection, id) ??
			(section?.literalHeaderRange
				? {
						from: projectOffset(projection, section.literalHeaderRange.from, 1),
						to: projectOffset(projection, section.literalHeaderRange.to, -1)
					}
				: undefined);
		return old ? { from: mapVisible(old.from, 1), to: mapVisible(old.to, -1) } : undefined;
	};
	const used = new Set<string>();
	const sectionIds = new Map<string, string>();
	const wrapperIds = new Map<string, string>();
	for (const section of next.sections) {
		const previousId = section.id;
		const range = projectedRange(fresh, section.id)!;
		const old = document.sections.find((entry) => {
			const expected = mappedRange(entry.id);
			return !used.has(entry.id) && expected?.from === range.from && expected.to === range.to;
		});
		section.id = old?.id ?? allocateId(next, 'section');
		if (old) {
			used.add(old.id);
			if (old.type) section.type = old.type;
		}
		sectionIds.set(previousId, section.id);
	}
	for (const previous of document.sections) {
		if (used.has(previous.id)) continue;
		const range =
			projectedRange(projection, previous.id) ??
			(previous.literalHeaderRange
				? {
						from: projectOffset(projection, previous.literalHeaderRange.from, 1),
						to: projectOffset(projection, previous.literalHeaderRange.to, -1)
					}
				: undefined);
		if (!range || input.changes.some((edit) => edit.from <= range.from && range.to <= edit.to))
			continue;
		const from = restoreAt(contentOffset(fresh, mapVisible(range.from, -1), -1), -1);
		const to = restoreAt(contentOffset(fresh, mapVisible(range.to, 1), 1), 1);
		if (from > to) continue;
		next.sections.push({
			...previous,
			at: from,
			headerVisible: false,
			literalHeaderRange: { from, to }
		});
		used.add(previous.id);
	}
	// Fresh syntax orders are compact. Retained broken headers need new tie keys,
	// allocated here during the edit, never by viewing another format.
	let order =
		Math.max(
			-1,
			...next.sections
				.filter((section) => section.headerVisible !== false)
				.map((section) => section.order),
			...next.wrappers.flatMap((wrapper) => [wrapper.openOrder, wrapper.closeOrder])
		) + 1;
	for (const section of next.sections) if (section.headerVisible === false) section.order = order++;
	next.sections.sort((a, b) => a.at - b.at || a.order - b.order);
	for (const wrapper of next.wrappers) {
		const previousId = wrapper.id;
		const range = projectedRange(fresh, wrapper.id)!;
		const old = document.wrappers.find((entry) => {
			const expected = mappedRange(entry.id);
			return (
				!used.has(entry.id) &&
				entry.kind === wrapper.kind &&
				entry.annotationId === wrapper.annotationId &&
				entry.styleSlot === wrapper.styleSlot &&
				expected?.from === range.from &&
				expected.to === range.to
			);
		});
		wrapper.id = old?.id ?? allocateId(next, 'wrapper');
		if (old) used.add(old.id);
		wrapperIds.set(previousId, wrapper.id);
	}
	const syntaxVoices = next.voices.map((voice) => {
		const result = {
			...voice,
			sectionId: sectionIds.get(voice.sectionId)!,
			from: restoreAt(voice.from, 1),
			to: restoreAt(voice.to, -1)
		};
		if (voice.wrapperId) result.wrapperId = wrapperIds.get(voice.wrapperId)!;
		return result;
	});
	const contentEdits = input.changes
		.map((edit): TextEdit => ({
			from: contentOffset(projection, edit.from, -1),
			to: contentOffset(projection, edit.to, 1),
			insert: next.content.slice(
				restoreAt(contentOffset(fresh, mapVisible(edit.from, -1), -1), -1),
				restoreAt(contentOffset(fresh, mapVisible(edit.to, 1), 1), 1)
			)
		}))
		.filter((edit) => edit.from !== edit.to || edit.insert.length > 0);
	retainLinesAndOwners(document, next, map, contentEdits, projection.profile);
	retainOtherRecords(document, next, map, contentEdits, []);
	const retainedVoices = next.voices;
	next.voices = syntaxVoices.map((voice) => {
		const old = retainedVoices.find(
			(entry) =>
				entry.sectionId === voice.sectionId &&
				entry.styleSlot === voice.styleSlot &&
				entry.from === voice.from &&
				entry.to === voice.to
		);
		if (!old) return { ...voice, id: allocateId(next, 'voice') };
		return voice.rawNameText === old.rawNameText
			? {
					...voice,
					id: old.id,
					performerIds: old.performerIds,
					...(old.anonymous ? { anonymous: true as const } : { anonymous: undefined })
				}
			: { ...voice, id: old.id };
	});
	next.voices.push(...retainedVoices.filter((voice) => !voice.styleSlot));
	next.voices.push(
		...retainedVoices.filter(
			(voice) =>
				voice.styleSlot &&
				next.sections.some(
					(section) => section.id === voice.sectionId && section.headerVisible === false
				)
		)
	);
	captureAuthoredEdits(next, projection.profile, contentEdits, map);
	updateEmptySections(next);
	const result = renderProfile(next, 'genius');
	if (!result.ok) return result;
	if (result.value.text !== text)
		return refuse(
			'invariant-failure',
			'The edited source syntax could not be reconstructed exactly.'
		);
	return {
		ok: true,
		value: { document: next, projection: result.value, changes: [...input.changes] }
	};
}

/** Reconcile the complete committed operation before publishing text or metadata. */
export function reconcileEdit(
	document: ConversionDocument,
	projection: Projection,
	input: CommittedEdit
): EngineResult<ReconciledDocument> {
	const current = renderProfile(document, projection.profile);
	if (!current.ok) return current;
	if (
		current.value.text !== projection.text ||
		JSON.stringify(current.value.segments) !== JSON.stringify(projection.segments)
	)
		return refuse('stale-basis', 'These edits belong to an earlier lyric projection.');
	if (!input || !Array.isArray(input.changes) || !validEdits(projection.text, input.changes))
		return refuse(
			'invalid-input',
			'Committed changes need ordered, non-overlapping UTF-16 ranges.'
		);
	if (input.changes.length > CONVERSION_LIMITS.edits)
		return refuse('operation-limit', 'This operation contains too many changes.');
	const changes = input.changes.filter(
		(edit) => projection.text.slice(edit.from, edit.to) !== edit.insert
	);
	if (!changes.length)
		return { ok: true, value: { document, projection: current.value, changes: [] } };
	const size =
		projection.text.length +
		changes.reduce((delta, edit) => delta + edit.insert.length - edit.to + edit.from, 0);
	if (size > CONVERSION_LIMITS.text)
		return refuse('operation-limit', 'The edited document exceeds the conversion size limit.');
	// Generated markers have no shared lyric extent. An explicit edit to their
	// displayed bytes turns that complete marker into authored literal text before
	// applying the edit. This prevents stale facts from recreating deleted syntax.
	const touchedMarkers = document.markers.filter((marker) => {
		const range = projectedRange(projection, marker.id);
		return (
			range &&
			changes.some(
				(edit) => overlaps(range, edit) || (edit.from === edit.to && edit.from === range.from)
			)
		);
	});
	if (touchedMarkers.length) {
		const ids = new Set(touchedMarkers.map((marker) => marker.id));
		const decisions = new Set(touchedMarkers.map((marker) => marker.decisionId));
		const without: ConversionDocument = {
			...document,
			markers: document.markers.filter((marker) => !ids.has(marker.id)),
			decisions: document.decisions.filter((decision) => !decisions.has(decision.id))
		};
		const plain = renderProfile(without, projection.profile);
		if (!plain.ok) return plain;
		const insertions: TextEdit[] = [];
		for (const marker of [...touchedMarkers].sort((a, b) => a.at - b.at || a.order - b.order)) {
			const at = projectOffset(plain.value, marker.at, 1);
			const previous = insertions.at(-1);
			if (previous?.from === at) previous.insert += marker.text;
			else insertions.push({ from: at, to: at, insert: marker.text });
		}
		const materialized = reconcilePlain(without, plain.value, {
			changes: insertions,
			mirror: false
		});
		if (!materialized.ok) return materialized;
		const shared = sharedChanges(plain.value, insertions);
		materialized.value.document.sections = materialized.value.document.sections.map((section) => {
			const previous = without.sections.find((entry) => entry.id === section.id)!;
			return { ...section, at: mapEditPosition(previous.at, shared, 1) };
		});
		const basis = renderProfile(materialized.value.document, projection.profile);
		if (!basis.ok) return basis;
		if (basis.value.text !== projection.text)
			return refuse(
				'invariant-failure',
				'The instrumental marker could not be made editable without changing its text.'
			);
		return reconcileEdit(materialized.value.document, basis.value, { ...input, changes });
	}
	return projection.profile === 'genius'
		? reconcileGenius(document, projection, { ...input, changes })
		: reconcilePlain(document, projection, { ...input, changes });
}

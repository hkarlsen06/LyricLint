import { lineNumberLookup } from '$lib/core/line-numbers.js';
import { parseDocument, scanPhysicalLines } from '$lib/core/parser.js';
import type {
	LinkHole,
	ParsedDocument,
	SectionLink,
	SerializedSelection,
	TextRange
} from '$lib/core/types.js';
import type { ProfileId } from '$lib/profiles/types.js';
import { representationEdits } from '$lib/profiles/representation.js';
import { decideInstrumentalRepresentation } from '$lib/profiles/decisions.js';
import {
	refuse,
	type ConversionDocument,
	type EngineResult,
	type Projection,
	type ProjectedSection,
	type ProjectionSegment
} from './model.js';
import { validateModel } from './validation.js';

interface Event {
	at: number;
	order: number;
	text: string;
	recordId: string;
	part: ProjectionSegment['part'];
}

/** A shared boundary can have several syntax literals. Affinity selects its visible side. */
export function projectOffset(projection: Projection, at: number, affinity: -1 | 1 = 1): number {
	// Omitted forms are the ordered prefix of hidden; syntax-only records follow them.
	let omittedLower = 0;
	let omittedUpper = projection.hidden.length;
	while (omittedLower < omittedUpper) {
		const middle = (omittedLower + omittedUpper) >>> 1;
		const entry = projection.hidden[middle]!;
		if (entry.contentTo !== undefined && entry.contentTo < at) omittedLower = middle + 1;
		else omittedUpper = middle;
	}
	const omitted = projection.hidden[omittedLower];
	if (omitted?.contentTo !== undefined && omitted.contentAt <= at) return omitted.at;
	let before: number | undefined;
	let after: number | undefined;
	let lower = 0;
	let upper = projection.segments.length;
	while (lower < upper) {
		const middle = (lower + upper) >>> 1;
		if (projection.segments[middle]!.contentFrom <= at) lower = middle + 1;
		else upper = middle;
	}
	for (let index = lower - 1; index >= 0; index--) {
		const segment = projection.segments[index]!;
		if (segment.contentTo < at) break;
		if (segment.contentFrom <= at && at <= segment.contentTo) {
			let mapped: number;
			if (segment.kind === 'copied') mapped = segment.from + at - segment.contentFrom;
			else if (segment.kind === 'generated') mapped = affinity < 0 ? segment.from : segment.to;
			else
				mapped =
					at === segment.contentFrom
						? segment.from
						: at === segment.contentTo
							? segment.to
							: affinity < 0
								? segment.from
								: segment.to;
			before = before === undefined ? mapped : Math.min(before, mapped);
			after = after === undefined ? mapped : Math.max(after, mapped);
		}
	}
	return (affinity < 0 ? before : after) ?? (at === 0 ? 0 : projection.text.length);
}

/** Offsets are UTF-16 code units. A transformed unit is indivisible. */
export function contentOffset(projection: Projection, at: number, affinity: -1 | 1 = 1): number {
	let omittedLower = 0;
	let omittedUpper = projection.hidden.length;
	while (omittedLower < omittedUpper) {
		const middle = (omittedLower + omittedUpper) >>> 1;
		const entry = projection.hidden[middle]!;
		if (entry.contentTo !== undefined && entry.at < at) omittedLower = middle + 1;
		else omittedUpper = middle;
	}
	const omitted = projection.hidden[omittedLower];
	if (omitted?.contentTo !== undefined && omitted.at === at)
		return affinity < 0 ? omitted.contentAt : omitted.contentTo;
	let lower = 0;
	let upper = projection.segments.length;
	while (lower < upper) {
		const middle = (lower + upper) >>> 1;
		if (
			projection.segments[middle]!.to < at ||
			(projection.segments[middle]!.to === at && affinity > 0)
		)
			lower = middle + 1;
		else upper = middle;
	}
	for (let index = lower; index < projection.segments.length; index++) {
		const segment = projection.segments[index]!;
		if (at < segment.from || at > segment.to) continue;
		if (at === segment.to && affinity > 0) continue;
		if (segment.kind === 'copied') return segment.contentFrom + at - segment.from;
		if (segment.kind === 'generated') return segment.contentFrom;
		return at === segment.from
			? segment.contentFrom
			: at === segment.to
				? segment.contentTo
				: affinity < 0
					? segment.contentFrom
					: segment.contentTo;
	}
	return projection.segments.at(-1)?.contentTo ?? 0;
}

export function mapSelection(
	from: Projection,
	to: Projection,
	selection: SerializedSelection
): SerializedSelection {
	if (selection.anchor === selection.head) {
		const at = projectOffset(to, contentOffset(from, selection.head, 1), 1);
		return { anchor: at, head: at };
	}
	const backward = selection.anchor > selection.head;
	const lower = projectOffset(
		to,
		contentOffset(from, Math.min(selection.anchor, selection.head), -1),
		1
	);
	const upper = projectOffset(
		to,
		contentOffset(from, Math.max(selection.anchor, selection.head), 1),
		-1
	);
	return backward
		? { anchor: Math.max(lower, upper), head: lower }
		: { anchor: lower, head: Math.max(lower, upper) };
}

function linkCoordinates(
	starts: readonly number[],
	lineAt: (at: number) => number,
	range: TextRange
): LinkHole {
	const line = lineAt(range.from);
	const endLine = lineAt(range.to);
	return {
		line,
		column: range.from - starts[line - 1]!,
		endLine,
		endColumn: range.to - starts[endLine - 1]!
	};
}

function firstAfter(values: readonly number[], at: number): number {
	let lower = 0;
	let upper = values.length;
	while (lower < upper) {
		const middle = (lower + upper) >>> 1;
		if (values[middle]! <= at) lower = middle + 1;
		else upper = middle;
	}
	return lower;
}

/** Pure rendering: no model mutations, identities, clocks, caches or correction loops. */
export function renderProfile(
	document: ConversionDocument,
	profile: ProfileId
): EngineResult<Projection> {
	const validated = validateModel(document);
	if (!validated.ok) return validated;
	if (profile !== 'genius' && profile !== 'musixmatch')
		return refuse('invalid-input', 'Unknown lyric format.');
	const events: Event[] = [];
	for (const marker of document.markers)
		if (marker.profile === profile)
			events.push({
				at: marker.at,
				order: marker.order,
				text: marker.text,
				recordId: marker.id,
				part: 'marker'
			});
	if (profile === 'genius')
		for (const section of document.sections)
			if (section.headerVisible !== false)
				events.push({
					at: section.at,
					order: section.order,
					text: section.header,
					recordId: section.id,
					part: 'header'
				});
	for (const wrapper of document.wrappers)
		if (wrapper.profile === profile) {
			events.push({
				at: wrapper.from,
				order: wrapper.openOrder,
				text: wrapper.open,
				recordId: wrapper.id,
				part: 'open'
			});

			events.push({
				at: wrapper.to,
				order: wrapper.closeOrder,
				text: wrapper.close,
				recordId: wrapper.id,
				part: 'close'
			});
		}
	events.sort((a, b) => a.at - b.at || a.order - b.order);
	const authored = document.forms
		.filter((form) => form.profile === profile)
		.sort((a, b) => a.from - b.from);
	const derived: { id: string; from: number; to: number; text: string }[] = [];
	if (profile === 'musixmatch') {
		const languages = [...document.languageRanges].sort((a, b) => a.from - b.from);
		const boundaries = [
			...document.wrappers.flatMap((range) => [range.from, range.to]),
			...document.voices.flatMap((range) => [range.from, range.to]),
			...languages.flatMap((range) => [range.from, range.to]),
			...document.sections.map((section) => section.at)
		].sort((a, b) => a - b);
		const authoredEnds = authored.map((form) => form.to);
		let languageIndex = 0;
		for (const owner of document.owners) {
			if (owner.authoredProfile !== 'genius') continue;
			let from = owner.from;
			while (from < owner.to) {
				while (languages[languageIndex] && languages[languageIndex]!.to <= from) languageIndex++;
				const range = languages[languageIndex];
				const covered = range && range.from <= from;
				const to = Math.min(owner.to, covered ? range.to : (range?.from ?? owner.to));
				const language = covered ? range.language : document.defaultLanguage;
				for (const edit of representationEdits(document.content.slice(from, to), {
					profile,
					sourceProfile: owner.authoredProfile,
					language,
					contentKind: document.contentKind
				})) {
					const start = from + edit.from;
					const end = from + edit.to;
					const retained = authored[firstAfter(authoredEnds, start)];
					const boundary = boundaries[firstAfter(boundaries, start)];
					if ((retained && retained.from < end) || (boundary !== undefined && boundary < end))
						continue;
					derived.push({
						id: `derived:${owner.id}:${start}:${end}`,
						from: start,
						to: end,
						text: edit.insert
					});
				}
				from = to;
			}
		}
	}
	const forms = [...authored, ...derived].sort((a, b) => a.from - b.from);
	const eventPositions = events.map((event) => event.at);
	for (const form of forms) {
		const eventAt = eventPositions[firstAfter(eventPositions, form.from)];
		if (eventAt !== undefined && eventAt < form.to)
			return refuse(
				'invariant-failure',
				'A retained spelling cannot safely map the details inside it.'
			);
	}
	const segments: ProjectionSegment[] = [];
	const pieces: string[] = [];
	const omittedForms: Projection['hidden'] = [];
	let visible = 0;
	let shared = 0;
	let eventIndex = 0;
	let formIndex = 0;
	const append = (text: string, segment: Omit<ProjectionSegment, 'from' | 'to'>) => {
		if (text.length === 0) return;
		pieces.push(text);
		segments.push({ ...segment, from: visible, to: visible + text.length });
		visible += text.length;
	};
	while (shared <= document.content.length) {
		while (events[eventIndex]?.at === shared) {
			const event = events[eventIndex++]!;
			append(event.text, {
				kind: 'generated',
				contentFrom: shared,
				contentTo: shared,
				recordId: event.recordId,
				part: event.part
			});
		}
		const form = forms[formIndex];
		if (form?.from === shared) {
			if (!form.text.length)
				omittedForms.push({
					recordId: form.id,
					at: visible,
					contentAt: form.from,
					contentTo: form.to
				});
			append(form.text, {
				kind: 'transformed',
				contentFrom: form.from,
				contentTo: form.to,
				recordId: form.id
			});
			shared = form.to;
			formIndex++;
			continue;
		}
		if (shared === document.content.length) break;
		const next = Math.min(
			events[eventIndex]?.at ?? document.content.length,
			forms[formIndex]?.from ?? document.content.length,
			document.content.length
		);
		if (next <= shared)
			return refuse('invariant-failure', 'Retained representation ranges overlap.');
		append(document.content.slice(shared, next), {
			kind: 'copied',
			contentFrom: shared,
			contentTo: next
		});
		shared = next;
	}
	const projection: Projection = {
		profile,
		text: pieces.join(''),
		segments,
		hidden: omittedForms,
		sections: [],
		lineAnchors: [],
		sectionLinks: [],
		findings: []
	};
	const byRecord = new Map(
		segments
			.filter((segment) => segment.part === 'header')
			.map((segment) => [segment.recordId, segment])
	);
	for (const section of document.sections) {
		const segment = byRecord.get(section.id);
		const at = segment?.from ?? projectOffset(projection, section.at, 1);
		const projectedSection: ProjectedSection = {
			id: section.id,
			name: section.name,
			at
		};
		if (section.type) projectedSection.type = section.type;
		if (segment) {
			projectedSection.headerFrom = segment.from;
			projectedSection.headerTo = segment.to;
		}
		projection.sections.push(projectedSection);
		if (!segment) projection.hidden.push({ recordId: section.id, at, contentAt: section.at });
	}
	for (const wrapper of document.wrappers)
		if (wrapper.profile !== profile)
			projection.hidden.push({
				recordId: wrapper.id,
				at: projectOffset(projection, wrapper.from, 1),
				contentAt: wrapper.from
			});
	if (profile === 'genius')
		for (const voice of document.voices)
			if (!voice.styleSlot)
				projection.findings.push({
					code: 'voice-representation',
					recordId: voice.id,
					message:
						'This voice assignment is retained. Genius has only four section voice styles; choose how to represent this additional group.',
					range: {
						from: projectOffset(projection, voice.from, 1),
						to: projectOffset(projection, voice.to, -1)
					}
				});
	const lineAt = lineNumberLookup(projection.text);
	const anchoredLines = new Set<number>();
	for (const line of document.lines)
		if (line.time !== undefined) {
			const visibleLine = lineAt(projectOffset(projection, line.from, 1));
			if (!anchoredLines.has(visibleLine)) {
				anchoredLines.add(visibleLine);
				projection.lineAnchors.push({ line: visibleLine, time: line.time });
			}
		}
	if (profile === 'genius' && document.links.length) {
		const lineStarts = scanPhysicalLines(projection.text).map((line) => line.from);
		const sectionLines = new Map(
			projection.sections.map((section) => [section.id, lineAt(section.at)])
		);
		const projectedRange = (range: TextRange) =>
			linkCoordinates(lineStarts, lineAt, {
				from: projectOffset(projection, range.from, 1),
				to: projectOffset(projection, range.to, -1)
			});
		for (const link of document.links) {
			const projectedLink: SectionLink = {
				lines: link.sectionIds.map((id) => sectionLines.get(id)!)
			};
			if (link.holes.length) projectedLink.holes = link.holes.map(projectedRange);
			if (link.passages)
				projectedLink.passages = link.passages.map((passage) => ({
					members: passage.members.map((member) => ({
						...projectedRange(member),
						headerLine: sectionLines.get(member.sectionId)!
					}))
				}));
			if (link.detached)
				projectedLink.detached = link.detached.map((member) => ({
					...projectedRange(member),
					headerLine: sectionLines.get(member.sectionId)!
				}));
			projection.sectionLinks.push(projectedLink);
		}
	}
	for (const marker of document.markers) {
		if (marker.profile !== profile)
			projection.hidden.push({
				recordId: marker.id,
				at: projectOffset(projection, marker.at, 1),
				contentAt: marker.at
			});
		const decision = document.decisions.find((entry) => entry.id === marker.decisionId);
		if (decision?.kind === 'instrumental-interval') {
			const checked = decideInstrumentalRepresentation({
				...decision.facts,
				language: document.defaultLanguage,
				currentRecordingId: document.recordingId ?? ''
			});
			if (!checked.ok)
				projection.findings.push({
					code: 'instrumental-reconfirmation',
					recordId: marker.id,
					message: checked.message
				});
		}
	}
	for (const decision of document.decisions)
		if (decision.kind === 'quantity') {
			const language =
				document.languageRanges.find(
					(entry) => entry.from <= decision.from && decision.to <= entry.to
				)?.language ?? document.defaultLanguage;
			if (language !== decision.facts.language)
				projection.findings.push({
					code: 'quantity-reconfirmation',
					recordId: decision.id,
					message:
						'This quantity was confirmed in a different language. Review its retained spelling against the current passage language.'
				});
		}
	return { ok: true, value: projection };
}

/** Shared profile-aware classification: Musixmatch square brackets remain literal lyrics. */
export function parseProjection(
	document: ConversionDocument,
	projection: Projection,
	language = document.defaultLanguage
): ParsedDocument {
	if (projection.profile === 'genius') return parseDocument(projection.text);
	const physical = scanPhysicalLines(projection.text);
	const sections: ParsedDocument['sections'] = [];
	let current: ParsedDocument['sections'][number] | undefined;
	const projectedSections = document.sections.map((section) => ({
		id: section.id,
		at: projectOffset(projection, section.at, 1)
	}));
	const boundaries = new Set(projectedSections.map((section) => section.at));
	const markers = projection.segments.filter((segment) => segment.part === 'marker');
	let sectionIndex = -1;
	let markerIndex = 0;
	for (const line of physical) {
		while (projectedSections[sectionIndex + 1]?.at <= line.from) sectionIndex++;
		while (markers[markerIndex] && markers[markerIndex]!.to < line.to) markerIndex++;
		const marker = markers[markerIndex];
		if (marker && marker.from <= line.from && line.to <= marker.to) {
			current = undefined;
			continue;
		}
		if (!line.text.trim()) {
			current = undefined;
			continue;
		}
		if (!current || boundaries.has(line.from)) {
			const owner = projectedSections[sectionIndex];
			current = {
				from: line.from,
				to: line.to,
				language,
				voiceGroups: [],
				lines: []
			};
			if (owner) current.conversionSectionId = owner.id;
			sections.push(current);
		}
		current.lines.push({ ...line, styleSpans: [] });
		current.to = line.to;
	}
	return {
		text: projection.text,
		profile: 'musixmatch',
		sections,
		syntaxIssues: [],
		annotations: []
	};
}

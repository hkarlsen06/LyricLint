import { extractLineStyleSpans } from '$lib/core/lines.js';
import { parseDocument, scanPhysicalLines } from '$lib/core/parser.js';
import { exactMembers, logicalHeaderGroups } from '$lib/performers/legend-groups.js';
import {
	allocateId,
	CONVERSION_LIMITS,
	CONVERSION_SCHEMA,
	CONVERTER_VERSION,
	refuse,
	type ConversionDocument,
	type EngineResult,
	type ImportInput,
	type VoiceAssignment,
	type WrapperRecord
} from './model.js';
import { renderProfile } from './projection.js';
import { validateModel } from './validation.js';
import { updateMetadata } from './metadata.js';

interface Extraction {
	from: number;
	to: number;
	kind: 'header' | 'annotation' | 'voice';
	name?: string;
	contentFrom?: number;
	contentTo?: number;
	open?: string;
	close?: string;
	annotationId?: string;
	styleSlot?: WrapperRecord['styleSlot'];
}
interface Omission {
	from: number;
	to: number;
	order: number;
}

export function emptyDocument(nextId = 1): ConversionDocument {
	return {
		schema: CONVERSION_SCHEMA,
		converterVersion: CONVERTER_VERSION,
		contentKind: 'unknown',
		defaultLanguage: 'und',
		content: '',
		nextId,
		owners: [],
		lines: [],
		sections: [],
		wrappers: [],
		forms: [],
		languageRanges: [],
		voices: [],
		markers: [],
		links: [],
		decisions: []
	};
}

/** Extract only complete syntax understood by the existing lossless recognizers. */
export function importDocument(input: ImportInput): EngineResult<ConversionDocument> {
	if (!input || typeof input.text !== 'string' || !['genius', 'musixmatch'].includes(input.profile))
		return refuse('invalid-input', 'Import needs exact text and an explicit source format.');
	if (input.text.length > CONVERSION_LIMITS.text)
		return refuse('operation-limit', 'The document exceeds the conversion size limit.');
	let lineCount = 1;
	for (let index = 0; index < input.text.length; index++)
		if (input.text[index] === '\n' && ++lineCount > CONVERSION_LIMITS.records / 2)
			return refuse('operation-limit', 'The document contains too many physical lines.');
	const document = emptyDocument(input.nextId);
	document.contentKind = input.contentKind ?? 'unknown';
	document.defaultLanguage = input.language ?? 'und';
	const candidates: Extraction[] = [];
	const parsed = input.profile === 'genius' ? parseDocument(input.text) : undefined;
	if (parsed) {
		const physical = scanPhysicalLines(input.text);
		const headers: Extraction[] = [];
		let physicalIndex = 0;
		for (const section of parsed.sections) {
			const header = section.header;
			if (!header?.closed || !header.name.trim()) continue;
			while (physical[physicalIndex] && physical[physicalIndex]!.to < header.to) physicalIndex++;
			const line = physical[physicalIndex];
			if (line && line.from <= header.from)
				headers.push({
					kind: 'header',
					from: line.from,
					to: line.lineEndingRange.to,
					name: header.name
				});
		}
		candidates.push(...headers);
		const wrappers: Extraction[] = [];
		for (const span of parsed.annotations)
			wrappers.push({
				kind: 'annotation',
				from: span.from,
				to: span.to,
				contentFrom: span.fragmentRange.from,
				contentTo: span.fragmentRange.to,
				open: input.text.slice(span.from, span.fragmentRange.from),
				close: input.text.slice(span.fragmentRange.to, span.to),
				annotationId: input.text.slice(span.idRange.from, span.idRange.to)
			});
		for (const span of extractLineStyleSpans(input.text, { from: 0, to: input.text.length }))
			if (!('unsupported' in span))
				wrappers.push({
					kind: 'voice',
					from: span.from,
					to: span.to,
					contentFrom: span.contentFrom,
					contentTo: span.contentTo,
					open: span.rawTag,
					close: span.closingTag,
					styleSlot: span.slot
				});
		wrappers.sort((a, b) => a.from - b.from || b.to - a.to);
		const invalid = new Set<Extraction>();
		const stack: Extraction[] = [];
		let headerIndex = 0;
		for (const wrapper of wrappers) {
			while (headers[headerIndex] && headers[headerIndex]!.to <= wrapper.from) headerIndex++;
			if (headers[headerIndex] && headers[headerIndex]!.from < wrapper.to) {
				invalid.add(wrapper);
				continue;
			}
			while (stack.length && stack.at(-1)!.to <= wrapper.from) stack.pop();
			const parent = stack.at(-1);
			if (
				parent &&
				(wrapper.to > parent.to ||
					wrapper.from < parent.contentFrom! ||
					wrapper.to > parent.contentTo!)
			) {
				invalid.add(parent);
				invalid.add(wrapper);
			}
			stack.push(wrapper);
		}
		candidates.push(...wrappers.filter((wrapper) => !invalid.has(wrapper)));
	}
	candidates.sort((a, b) => a.from - b.from || b.to - a.to);
	if (candidates.length > CONVERSION_LIMITS.records / 2)
		return refuse('operation-limit', 'The document has too many syntax records.');
	const omissions: Omission[] = candidates
		.flatMap((entry) =>
			entry.kind === 'header'
				? [{ from: entry.from, to: entry.to, order: 0 }]
				: [
						{ from: entry.from, to: entry.contentFrom!, order: 0 },
						{ from: entry.contentTo!, to: entry.to, order: 0 }
					]
		)
		.sort((a, b) => a.from - b.from);
	let rawAt = 0;
	let removed = 0;
	const chunks: string[] = [];
	const offsets: { from: number; to: number; removed: number }[] = [];
	for (let index = 0; index < omissions.length; index++) {
		const omission = omissions[index]!;
		omission.order = index;
		if (omission.from < rawAt) return refuse('invariant-failure', 'Recognized syntax overlaps.');
		chunks.push(input.text.slice(rawAt, omission.from));
		rawAt = omission.to;
		offsets.push({ from: omission.from, to: omission.to, removed });
		removed += omission.to - omission.from;
	}
	chunks.push(input.text.slice(rawAt));
	document.content = chunks.join('');
	const sharedAt = (at: number) => {
		let lower = 0;
		let upper = offsets.length;
		while (lower < upper) {
			const middle = (lower + upper) >>> 1;
			if (offsets[middle]!.to <= at) lower = middle + 1;
			else upper = middle;
		}
		const current = offsets[lower];
		if (current && at >= current.from) return current.from - current.removed;
		const previous = offsets[lower - 1];
		return at - (previous ? previous.removed + previous.to - previous.from : 0);
	};
	const orders = new Map(omissions.map((omission) => [omission.from, omission.order]));
	for (const entry of candidates) {
		if (entry.kind === 'header')
			document.sections.push({
				id: allocateId(document, 'section'),
				at: sharedAt(entry.from),
				order: orders.get(entry.from)!,
				header: input.text.slice(entry.from, entry.to),
				name: entry.name!,
				explicitEmpty: false
			});
		else {
			const wrapper: WrapperRecord = {
				id: allocateId(document, 'wrapper'),
				kind: entry.kind,
				profile: input.profile,
				from: sharedAt(entry.contentFrom!),
				to: sharedAt(entry.contentTo!),
				open: entry.open!,
				close: entry.close!,
				openOrder: orders.get(entry.from)!,
				closeOrder: orders.get(entry.contentTo!)!
			};
			if (entry.annotationId !== undefined) wrapper.annotationId = entry.annotationId;
			if (entry.styleSlot !== undefined) wrapper.styleSlot = entry.styleSlot;
			document.wrappers.push(wrapper);
		}
	}
	for (let index = 0; index < document.sections.length; index++) {
		const section = document.sections[index]!;
		section.explicitEmpty =
			document.content
				.slice(section.at, document.sections[index + 1]?.at ?? document.content.length)
				.trim().length === 0;
	}
	for (const line of scanPhysicalLines(document.content)) {
		document.owners.push({
			id: allocateId(document, 'owner'),
			from: line.from,
			to: line.lineEndingRange.to,
			revision: 0,
			authoredProfile: input.profile
		});
		document.lines.push({ id: allocateId(document, 'line'), from: line.from, to: line.to });
	}
	if (parsed) {
		const sectionsByLocation = new Map<string, (typeof document.sections)[number]>();
		for (const section of document.sections) {
			const key = `${section.at}:${section.name}`;
			if (!sectionsByLocation.has(key)) sectionsByLocation.set(key, section);
		}
		for (const section of parsed.sections) {
			if (!section.header) continue;
			const record = sectionsByLocation.get(`${sharedAt(section.from)}:${section.header.name}`);
			if (!record) continue;
			for (const group of logicalHeaderGroups(parsed, section, input.performers ?? [])) {
				if (!group.markupSupported) continue;
				const performers = exactMembers(group.rawNameText, input.performers ?? []);
				const wrappers = document.wrappers.filter(
					(wrapper) =>
						wrapper.kind === 'voice' &&
						wrapper.styleSlot === group.styleSlot &&
						record.at <= wrapper.from &&
						wrapper.to <= sharedAt(section.to)
				);
				const ranges =
					group.styleSlot === 1
						? [
								{
									from: sharedAt(section.lines[0]?.from ?? section.to),
									to: sharedAt(section.to),
									wrapperId: undefined
								}
							]
						: wrappers.map((wrapper) => ({
								from: wrapper.from,
								to: wrapper.to,
								wrapperId: wrapper.id
							}));
				for (const range of ranges) {
					const voice: VoiceAssignment = {
						id: allocateId(document, 'voice'),
						sectionId: record.id,
						from: range.from,
						to: range.to,
						performerIds: performers?.map((performer) => performer.id) ?? [],
						styleSlot: group.styleSlot,
						rawNameText: group.rawNameText
					};
					if (!performers) voice.anonymous = true;
					if (range.wrapperId) voice.wrapperId = range.wrapperId;
					document.voices.push(voice);
				}
			}
		}
	}
	const validated = validateModel(document);
	if (!validated.ok) return validated;
	const projection = renderProfile(document, input.profile);
	if (!projection.ok) return projection;
	if (projection.value.text !== input.text)
		return refuse('invariant-failure', 'The source syntax could not be reconstructed exactly.');
	if (input.lineAnchors || input.sectionLinks) {
		const metadata = updateMetadata(document, projection.value, {
			lineAnchors: input.lineAnchors,
			sectionLinks: input.sectionLinks
		});
		if (!metadata.ok) return metadata;
		return { ok: true, value: metadata.value.document };
	}
	return { ok: true, value: document };
}

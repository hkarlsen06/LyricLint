import {
	CONVERSION_LIMITS,
	CONVERSION_SCHEMA,
	CONVERTER_VERSION,
	refuse,
	type ConversionDocument,
	type EngineResult
} from './model.js';
import { parseDocument, scanPhysicalLines } from '$lib/core/parser.js';
import {
	decideInstrumentalRepresentation,
	decideQuantityRepresentation,
	type InstrumentalIntervalFacts,
	type QuantityFacts
} from '$lib/profiles/decisions.js';

interface BoundaryRecord {
	schema?: unknown;
	converterVersion?: unknown;
	contentKind?: unknown;
	defaultLanguage?: unknown;
	recordingId?: unknown;
	content?: unknown;
	nextId?: unknown;
	owners?: unknown;
	lines?: unknown;
	sections?: unknown;
	wrappers?: unknown;
	forms?: unknown;
	languageRanges?: unknown;
	voices?: unknown;
	markers?: unknown;
	links?: unknown;
	decisions?: unknown;
	id?: unknown;
	from?: unknown;
	to?: unknown;
	revision?: unknown;
	authoredProfile?: unknown;
	time?: unknown;
	at?: unknown;
	order?: unknown;
	header?: unknown;
	name?: unknown;
	explicitEmpty?: unknown;
	type?: unknown;
	headerVisible?: unknown;
	literalHeaderRange?: unknown;
	kind?: unknown;
	profile?: unknown;
	open?: unknown;
	close?: unknown;
	openOrder?: unknown;
	closeOrder?: unknown;
	annotationId?: unknown;
	styleSlot?: unknown;
	text?: unknown;
	ownerId?: unknown;
	ownerRevision?: unknown;
	language?: unknown;
	sectionId?: unknown;
	performerIds?: unknown;
	anonymous?: unknown;
	wrapperId?: unknown;
	rawNameText?: unknown;
	sectionIds?: unknown;
	holes?: unknown;
	passages?: unknown;
	detached?: unknown;
	members?: unknown;
	heardPrefix?: unknown;
	facts?: unknown;
	value?: unknown;
	spokenForm?: unknown;
	digitForm?: unknown;
	pronunciation?: unknown;
	usage?: unknown;
	currentRecordingId?: unknown;
	startMs?: unknown;
	endMs?: unknown;
	recordingDurationMs?: unknown;
	lyricalContent?: unknown;
	placement?: unknown;
	beforeSectionId?: unknown;
	afterSectionId?: unknown;
	decisionId?: unknown;
}
interface BoundaryCollections {
	owners: BoundaryRecord[];
	lines: BoundaryRecord[];
	sections: BoundaryRecord[];
	wrappers: BoundaryRecord[];
	forms: BoundaryRecord[];
	languageRanges: BoundaryRecord[];
	voices: BoundaryRecord[];
	markers: BoundaryRecord[];
	links: BoundaryRecord[];
	decisions: BoundaryRecord[];
}

function object(value: unknown): value is BoundaryRecord {
	return (
		value !== null &&
		typeof value === 'object' &&
		!Array.isArray(value) &&
		(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
	);
}
function integer(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function profile(value: unknown): boolean {
	return value === 'genius' || value === 'musixmatch';
}

/** Validate every persisted rich-data boundary before interpreting a single coordinate. */
export function validateModel(value: unknown): EngineResult<ConversionDocument> {
	const invalid = (message: string) => refuse<ConversionDocument>('invalid-input', message);
	if (!object(value)) return invalid('The converted document must be a plain record.');
	if (value.schema !== CONVERSION_SCHEMA || value.converterVersion !== CONVERTER_VERSION)
		return refuse('unsupported-version', 'This document needs an unavailable converter version.');
	if (
		typeof value.content !== 'string' ||
		!integer(value.nextId) ||
		value.nextId < 1 ||
		!['original', 'translation', 'romanization', 'unknown'].includes(String(value.contentKind)) ||
		typeof value.defaultLanguage !== 'string' ||
		!value.defaultLanguage ||
		value.defaultLanguage.length > 128
	)
		return invalid('The converted document has invalid content, language or identity state.');
	if (value.content.length > CONVERSION_LIMITS.text)
		return refuse('operation-limit', 'The document exceeds the conversion size limit.');
	const content = value.content;
	const names = [
		'owners',
		'lines',
		'sections',
		'wrappers',
		'forms',
		'languageRanges',
		'voices',
		'markers',
		'links',
		'decisions'
	] as const;
	let count = 0;
	for (const key of names) {
		if (!Array.isArray(value[key])) return invalid(`The converted document is missing ${key}.`);
		count += value[key].length;
	}
	if (count > CONVERSION_LIMITS.records)
		return refuse('operation-limit', 'The document has too many retained records.');
	const ids = new Set<string>();
	const range = (raw: BoundaryRecord) =>
		integer(raw.from) && integer(raw.to) && raw.from <= raw.to && raw.to <= content.length;
	const rows: BoundaryCollections = {
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
	for (const key of names) {
		const entries = value[key];
		if (!Array.isArray(entries)) return invalid(`The converted document is missing ${key}.`);
		for (const raw of entries) {
			if (
				!object(raw) ||
				typeof raw.id !== 'string' ||
				!/^[a-z]+:[1-9]\d*$/u.test(raw.id) ||
				ids.has(raw.id)
			)
				return invalid('Retained record identities must be unique.');
			const sequence = Number(raw.id.slice(raw.id.indexOf(':') + 1));
			if (!Number.isSafeInteger(sequence) || sequence >= value.nextId)
				return invalid('The identity allocator is behind its records.');
			ids.add(raw.id);
			rows[key].push(raw);
		}
	}
	for (const key of ['owners', 'lines', 'wrappers', 'forms', 'languageRanges', 'voices'] as const)
		for (const row of rows[key])
			if (!range(row)) return invalid(`A ${key} range falls outside the lyrics.`);
	let end = 0;
	for (const owner of rows.owners) {
		if (owner.from !== end || !integer(owner.revision) || !profile(owner.authoredProfile))
			return invalid('Content owners must partition shared content in order.');
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		end = owner.to as number;
	}
	if (end !== content.length) return invalid('Content owners do not cover the lyrics.');
	let previous = -1;
	for (const line of rows.lines) {
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		if (
			(line.from as number) <= previous ||
			(line.time !== undefined &&
				(typeof line.time !== 'number' || !Number.isFinite(line.time) || line.time < 0)) ||
			/[\r\n]/u.test(content.slice(line.from as number, line.to as number))
		)
			return invalid('A lyric line or timestamp is invalid.');
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		if ((line.from as number) > 0 && !/[\r\n]/u.test(value.content[(line.from as number) - 1]!))
			return invalid('A lyric line does not start at a line boundary.');
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		if (line.to !== content.length && !/[\r\n]/u.test(value.content[line.to as number]!))
			return invalid('A lyric line does not end at a line boundary.');
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		previous = line.from as number;
	}
	const physical = scanPhysicalLines(content);
	if (
		physical.length !== rows.lines.length ||
		physical.some(
			(line, index) => line.from !== rows.lines[index]?.from || line.to !== rows.lines[index]?.to
		)
	)
		return invalid('Physical line identities must cover every shared line.');
	let previousAt = -1;
	let previousOrder = -1;
	const orders = new Set<number>();
	for (const section of rows.sections) {
		if (
			!integer(section.at) ||
			section.at > content.length ||
			!integer(section.order) ||
			typeof section.header !== 'string' ||
			section.header.length === 0 ||
			typeof section.name !== 'string' ||
			typeof section.explicitEmpty !== 'boolean' ||
			(section.type !== undefined &&
				!['Intro', 'Verse', 'PreChorus', 'Chorus', 'Hook', 'Bridge', 'Outro'].includes(
					String(section.type)
				))
		)
			return invalid('A retained section is invalid.');
		const headerLines = scanPhysicalLines(section.header);
		const header =
			headerLines.length === 1 ? parseDocument(section.header).sections[0]?.header : undefined;
		if (!header?.closed || !header.name.trim() || header.name !== section.name)
			return invalid(
				'A retained section must contain one complete recognized header and its exact label.'
			);
		if (
			(section.headerVisible !== undefined && section.headerVisible !== false) ||
			(section.literalHeaderRange !== undefined &&
				(!object(section.literalHeaderRange) || !range(section.literalHeaderRange))) ||
			(section.headerVisible === false && section.literalHeaderRange === undefined)
		)
			return invalid('A partially edited header has invalid literal ownership.');
		if (
			section.at < previousAt ||
			(section.at === previousAt && section.order <= previousOrder) ||
			orders.has(section.order)
		)
			return invalid('Retained sections must have an explicit unique order.');
		orders.add(section.order);
		previousAt = section.at;
		previousOrder = section.order;
	}
	for (const wrapper of rows.wrappers) {
		if (
			wrapper.profile !== 'genius' ||
			!['annotation', 'voice'].includes(String(wrapper.kind)) ||
			typeof wrapper.open !== 'string' ||
			wrapper.open.length === 0 ||
			typeof wrapper.close !== 'string' ||
			wrapper.close.length === 0 ||
			!integer(wrapper.openOrder) ||
			!integer(wrapper.closeOrder) ||
			wrapper.openOrder >= wrapper.closeOrder ||
			orders.has(wrapper.openOrder) ||
			orders.has(wrapper.closeOrder)
		)
			return invalid('A retained wrapper is invalid.');
		orders.add(wrapper.openOrder);
		orders.add(wrapper.closeOrder);
		if (
			wrapper.kind === 'annotation' &&
			(typeof wrapper.annotationId !== 'string' ||
				!/^\d+$/u.test(wrapper.annotationId) ||
				wrapper.open !== '[' ||
				wrapper.close !== `](${wrapper.annotationId})`)
		)
			return invalid('An annotation has invalid delimiters.');
		if (
			wrapper.kind === 'voice' &&
			!(
				(wrapper.styleSlot === 2 && wrapper.open === '<i>' && wrapper.close === '</i>') ||
				(wrapper.styleSlot === 3 && wrapper.open === '<b>' && wrapper.close === '</b>') ||
				(wrapper.styleSlot === 4 && wrapper.open === '<i><b>' && wrapper.close === '</b></i>')
			)
		)
			return invalid('A voice style has invalid delimiters.');
	}
	// SAFETY: The wrapper pass checked safe-integer delimiter orders, and the range pass checked wrapper endpoints.
	const syntaxEvents = rows.wrappers
		.flatMap((wrapper) => [
			{
				at: wrapper.from as number,
				order: wrapper.openOrder as number,
				id: wrapper.id,
				open: true
			},
			{ at: wrapper.to as number, order: wrapper.closeOrder as number, id: wrapper.id, open: false }
		])
		.sort((a, b) => a.at - b.at || a.order - b.order);
	const nesting: unknown[] = [];
	for (const event of syntaxEvents) {
		if (event.open) nesting.push(event.id);
		else if (nesting.pop() !== event.id)
			return invalid('Retained wrappers cross or have inconsistent delimiter order.');
	}
	if (nesting.length) return invalid('A retained wrapper is not closed.');
	const owners = new Map(rows.owners.map((owner) => [owner.id, owner]));
	for (const form of rows.forms)
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		if (
			!profile(form.profile) ||
			typeof form.text !== 'string' ||
			!owners.has(form.ownerId) ||
			owners.get(form.ownerId)?.revision !== form.ownerRevision ||
			(form.from as number) < (owners.get(form.ownerId)!.from as number) ||
			(form.to as number) > (owners.get(form.ownerId)!.to as number) ||
			(form.text.match(/\r\n|\r|\n/gu) ?? []).join('') !==
				(content.slice(form.from as number, form.to as number).match(/\r\n|\r|\n/gu) ?? []).join('')
		)
			return invalid('An authored form has stale or missing ownership.');
	for (const language of rows.languageRanges)
		if (
			typeof language.language !== 'string' ||
			language.language.length === 0 ||
			language.language.length > 128
		)
			return invalid('A passage language is invalid.');
	for (const selected of ['genius', 'musixmatch']) {
		let end = -1;
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		for (const form of rows.forms
			.filter((form) => form.profile === selected)
			.sort((a, b) => (a.from as number) - (b.from as number))) {
			// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
			if ((form.from as number) < end || form.from === form.to)
				return invalid('Authored forms overlap or have no owned source text.');
			// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
			end = form.to as number;
		}
	}
	let languageEnd = -1;
	// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
	for (const language of [...rows.languageRanges].sort(
		(a, b) => (a.from as number) - (b.from as number)
	)) {
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		if ((language.from as number) < languageEnd)
			return invalid('Passage language overrides overlap.');
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		languageEnd = language.to as number;
	}
	// SAFETY: The earlier section, wrapper and form checks establish these retained strings before computing their total size.
	const representedSize =
		content.length +
		rows.sections.reduce((sum, section) => sum + (section.header as string).length, 0) +
		rows.wrappers.reduce(
			(sum, wrapper) => sum + (wrapper.open as string).length + (wrapper.close as string).length,
			0
		) +
		rows.forms.reduce((sum, form) => sum + (form.text as string).length, 0) +
		rows.markers.reduce(
			(sum, marker) => sum + (typeof marker.text === 'string' ? marker.text.length : 0),
			0
		);
	if (representedSize > CONVERSION_LIMITS.text * 2)
		return refuse('operation-limit', 'Retained representations exceed the document size limit.');
	const sections = new Set(rows.sections.map((section) => section.id));
	const wrappers = new Set(rows.wrappers.map((wrapper) => wrapper.id));
	for (const voice of rows.voices)
		// SAFETY: The following literal whitelist rejects every value except the four numeric style slots.
		if (
			!sections.has(voice.sectionId) ||
			!Array.isArray(voice.performerIds) ||
			voice.performerIds.some((id) => typeof id !== 'string' || !id) ||
			new Set(voice.performerIds).size !== voice.performerIds.length ||
			(voice.performerIds.length === 0 && voice.anonymous !== true) ||
			(voice.performerIds.length > 0 && voice.anonymous !== undefined) ||
			(voice.styleSlot !== undefined && ![1, 2, 3, 4].includes(voice.styleSlot as number)) ||
			(voice.wrapperId !== undefined && !wrappers.has(voice.wrapperId)) ||
			(voice.rawNameText !== undefined && typeof voice.rawNameText !== 'string')
		)
			return invalid('A voice assignment has invalid ownership.');
	const linkedSections = new Set<unknown>();
	// SAFETY: The section pass checked ordered safe-integer boundaries; only the final following section may be absent.
	const sectionBounds = new Map(
		rows.sections.map((section, index) => [
			section.id,
			{
				from: section.at as number,
				to: (rows.sections[index + 1]?.at as number | undefined) ?? content.length
			}
		])
	);
	for (const link of rows.links) {
		if (
			!Array.isArray(link.sectionIds) ||
			link.sectionIds.length < 2 ||
			new Set(link.sectionIds).size !== link.sectionIds.length ||
			link.sectionIds.some((id) => !sections.has(id)) ||
			!Array.isArray(link.holes) ||
			link.holes.some((hole) => !object(hole) || !range(hole))
		)
			return invalid('A section link has invalid membership.');
		if (link.sectionIds.some((id) => linkedSections.has(id)))
			return invalid('A section cannot belong to several link groups.');
		for (const id of link.sectionIds) linkedSections.add(id);
		const sectionIds = link.sectionIds;
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		const member = (raw: unknown): raw is BoundaryRecord =>
			object(raw) &&
			range(raw) &&
			sectionIds.includes(raw.sectionId) &&
			(raw.from as number) >= sectionBounds.get(raw.sectionId)!.from &&
			(raw.to as number) <= sectionBounds.get(raw.sectionId)!.to;
		if (
			link.detached !== undefined &&
			(!Array.isArray(link.detached) || link.detached.some((entry) => !member(entry)))
		)
			return invalid('A detached passage is invalid.');
		if (link.passages !== undefined) {
			if (!Array.isArray(link.passages)) return invalid('Stored passages are invalid.');
			const covered = new Map<unknown, { from: number; to: number }[]>();
			for (const passage of link.passages) {
				if (
					!object(passage) ||
					!Array.isArray(passage.members) ||
					passage.members.length < 2 ||
					passage.members.some((entry) => !member(entry))
				)
					return invalid('A stored passage has invalid ranges.');
				// SAFETY: Every passage member just passed the plain-record and bounded-member predicate.
				const members = passage.members as BoundaryRecord[];
				for (const entry of members) {
					const ranges = covered.get(entry.sectionId) ?? [];
					// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
					if (
						ranges.some(
							(range) => range.from < (entry.to as number) && (entry.from as number) < range.to
						)
					)
						return invalid('Shared passages overlap inside a section.');
					// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
					ranges.push({ from: entry.from as number, to: entry.to as number });
					covered.set(entry.sectionId, ranges);
				}
				// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
				const text = content.slice(members[0]!.from as number, members[0]!.to as number);
				// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
				if (
					new Set(members.map((entry) => entry.sectionId)).size !== members.length ||
					members.some((entry) => content.slice(entry.from as number, entry.to as number) !== text)
				)
					return invalid('A shared passage must contain identical lyrics in different sections.');
			}
		}
	}
	for (const decision of rows.decisions) {
		if (
			!['keep-form', 'censored-token', 'quantity', 'instrumental-interval'].includes(
				String(decision.kind)
			) ||
			!profile(decision.profile) ||
			!owners.has(decision.ownerId) ||
			owners.get(decision.ownerId)?.revision !== decision.ownerRevision
		)
			return invalid('A conversion decision is stale or unsupported.');
		if (
			decision.kind === 'censored-token' &&
			(!range(decision) ||
				typeof decision.heardPrefix !== 'string' ||
				decision.heardPrefix.length > 100 ||
				/[\s[\]<>*]/u.test(decision.heardPrefix))
		)
			return invalid('A confirmed censored token is invalid.');
		if (decision.kind === 'quantity') {
			// SAFETY: Primitive fact fields are checked here; the shared policy validator below rejects unsupported usage and pronunciation members.
			if (
				!range(decision) ||
				decision.from === decision.to ||
				!object(decision.facts) ||
				typeof decision.facts.value !== 'string' ||
				typeof decision.facts.language !== 'string' ||
				decision.profile !== decision.facts.profile ||
				!profile(decision.facts.profile) ||
				(decision.facts.spokenForm !== undefined &&
					typeof decision.facts.spokenForm !== 'string') ||
				(decision.facts.digitForm !== undefined && typeof decision.facts.digitForm !== 'string') ||
				!decideQuantityRepresentation(decision.facts as QuantityFacts).ok
			)
				return invalid('A confirmed quantity has invalid or unsupported facts.');
		}
		if (decision.kind === 'instrumental-interval') {
			// SAFETY: String references are checked here; the shared policy validator checks integer boundaries and every interval eligibility member.
			if (
				!range(decision) ||
				!object(decision.facts) ||
				typeof decision.facts.language !== 'string' ||
				typeof decision.facts.recordingId !== 'string' ||
				typeof decision.facts.currentRecordingId !== 'string' ||
				!sections.has(decision.facts.beforeSectionId) ||
				!sections.has(decision.facts.afterSectionId) ||
				!decideInstrumentalRepresentation(decision.facts as InstrumentalIntervalFacts).ok
			)
				return invalid('A confirmed instrumental interval has invalid or unsupported facts.');
			const facts = decision.facts;
			const before = rows.sections.findIndex((section) => section.id === facts.beforeSectionId);
			const after = rows.sections[before + 1];
			if (
				decision.profile !== 'musixmatch' ||
				after?.id !== decision.facts.afterSectionId ||
				!rows.sections[before]?.type ||
				!after.type ||
				decision.from !== decision.to ||
				decision.from !== after.at
			)
				return invalid(
					'An instrumental interval must remain attached to its adjacent typed sections.'
				);
		}
		// SAFETY: The bounded-range pass validated these UTF-16 coordinates before this ownership comparison.
		if (
			decision.kind !== 'keep-form' &&
			((decision.from as number) < (owners.get(decision.ownerId)!.from as number) ||
				(decision.to as number) > (owners.get(decision.ownerId)!.to as number))
		)
			return invalid('A confirmed fact falls outside its owned lyrics.');
	}
	if (
		value.recordingId !== undefined &&
		(typeof value.recordingId !== 'string' || value.recordingId.length > 2000)
	)
		return invalid('The recording reference is invalid.');
	const decisions = new Map(rows.decisions.map((decision) => [decision.id, decision]));
	const markerDecisions = new Set<unknown>();
	for (const marker of rows.markers) {
		if (
			!integer(marker.at) ||
			marker.at > content.length ||
			!integer(marker.order) ||
			marker.profile !== 'musixmatch' ||
			typeof marker.text !== 'string' ||
			decisions.get(marker.decisionId)?.kind !== 'instrumental-interval' ||
			decisions.get(marker.decisionId)?.from !== marker.at ||
			markerDecisions.has(marker.decisionId)
		)
			return invalid('An instrumental marker has no unique confirmed interval at its boundary.');
		const markerLines = scanPhysicalLines(marker.text);
		if (
			markerLines.length !== 2 ||
			markerLines[0]?.text !== '#INSTRUMENTAL' ||
			markerLines[1]?.text !== '' ||
			markerLines[1].lineEnding === 'none'
		)
			return invalid(
				'An instrumental marker must retain one complete marker line and one following blank line.'
			);
		markerDecisions.add(marker.decisionId);
	}
	if (
		rows.decisions.some(
			(decision) => decision.kind === 'instrumental-interval' && !markerDecisions.has(decision.id)
		)
	)
		return invalid('A confirmed instrumental interval is missing its retained marker.');
	// SAFETY: Every required field, record, range and cross-record dependency has passed the schema checks above.
	return { ok: true, value: value as ConversionDocument };
}

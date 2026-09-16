import { scanPhysicalLines, parseDocument } from '$lib/core/parser.js';
import type { LineAnchor, LinkHole, SectionLink } from '$lib/core/types.js';
import {
	allocateId,
	refuse,
	type ConversionDocument,
	type EngineResult,
	type LinkMember,
	type LinkRecord,
	type Projection,
	type ReconciledDocument
} from './model.js';
import { contentOffset, parseProjection, renderProfile } from './projection.js';

export interface MetadataUpdate {
	lineAnchors?: readonly LineAnchor[];
	sectionLinks?: readonly SectionLink[];
}

/** The editor's coordinate adapters write back into stable shared ownership atomically. */
export function updateMetadata(
	document: ConversionDocument,
	projection: Projection,
	update: MetadataUpdate
): EngineResult<ReconciledDocument> {
	const current = renderProfile(document, projection.profile);
	if (!current.ok) return current;
	if (current.value.text !== projection.text)
		return refuse('stale-basis', 'These details belong to an earlier lyric projection.');
	const next: ConversionDocument = {
		...document,
		lines: document.lines.map((line) => ({ ...line })),
		links: document.links
	};
	const physical = scanPhysicalLines(projection.text);
	if (update.lineAnchors !== undefined) {
		const lyricStarts = new Set(
			parseProjection(document, projection).sections.flatMap((section) =>
				section.lines.map((line) => line.from)
			)
		);
		for (const line of next.lines) delete line.time;
		const seen = new Set<number>();
		for (const anchor of update.lineAnchors) {
			if (
				!Number.isSafeInteger(anchor.line) ||
				anchor.line < 1 ||
				typeof anchor.time !== 'number' ||
				!Number.isFinite(anchor.time) ||
				anchor.time < 0 ||
				seen.has(anchor.line)
			)
				return refuse('invalid-input', 'A timestamp has invalid line coordinates or time.');
			seen.add(anchor.line);
			const visible = physical[anchor.line - 1];
			if (!visible) return refuse('invalid-input', 'A timestamp points beyond the lyrics.');
			if (!lyricStarts.has(visible.from))
				return refuse(
					'invalid-input',
					'A timestamp must belong to a lyric line rather than retained syntax or blank spacing.'
				);
			const at = contentOffset(projection, visible.from, 1);
			const line = next.lines.find((entry) => entry.from <= at && at <= entry.to);
			if (!line) return refuse('invalid-input', 'A timestamp has no surviving lyric line.');
			line.time = anchor.time;
		}
	}
	if (update.sectionLinks !== undefined) {
		if (projection.profile !== 'genius')
			return refuse(
				'unavailable-capability',
				'Line-number section links require the Genius view; use stable section identities in Musixmatch.'
			);
		const sectionByLine = new Map(
			projection.sections
				.filter((section) => section.headerFrom !== undefined)
				.map((section) => [
					physical.findIndex((line) => line.from === section.headerFrom) + 1,
					section.id
				])
		);
		const range = (entry: LinkHole) => {
			const fromLine = physical[entry.line - 1];
			const toLine = physical[entry.endLine - 1];
			if (
				!fromLine ||
				!toLine ||
				!Number.isSafeInteger(entry.column) ||
				!Number.isSafeInteger(entry.endColumn) ||
				entry.column < 0 ||
				entry.endColumn < 0 ||
				entry.column > fromLine.text.length ||
				entry.endColumn > toLine.text.length
			)
				return undefined;
			const from = contentOffset(projection, fromLine.from + entry.column, 1);
			const to = contentOffset(projection, toLine.from + entry.endColumn, -1);
			return from <= to ? { from, to } : undefined;
		};
		const parsed = parseDocument(projection.text);
		const links: LinkRecord[] = [];
		for (const link of update.sectionLinks) {
			const sectionIds = link.lines.map((line) => sectionByLine.get(line));
			if (
				sectionIds.length < 2 ||
				sectionIds.some((id) => id === undefined) ||
				new Set(sectionIds).size !== sectionIds.length
			)
				return refuse('invalid-input', 'A section link points to missing or duplicate sections.');
			const holes = (link.holes ?? []).map(range);
			if (holes.some((hole) => !hole))
				return refuse('invalid-input', 'A section exclusion has invalid coordinates.');
			const old = document.links.find(
				(candidate) =>
					candidate.sectionIds.length === sectionIds.length &&
					candidate.sectionIds.every((id, index) => id === sectionIds[index])
			);
			const record: LinkRecord = {
				id: old?.id ?? allocateId(next, 'link'),
				sectionIds: sectionIds.filter((id) => id !== undefined),
				holes: holes.filter((hole) => hole !== undefined)
			};
			if (link.passages !== undefined) {
				record.passages = [];
				for (const passage of link.passages) {
					const members: LinkMember[] = [];
					for (const member of passage.members) {
						const coordinates = range(member);
						const sectionId = sectionByLine.get(member.headerLine);
						if (!coordinates || !sectionId || !record.sectionIds.includes(sectionId))
							return refuse('invalid-input', 'A stored passage points to an unavailable section.');
						members.push({ ...coordinates, sectionId });
					}
					record.passages.push({ members });
				}
			} else {
				// Legacy holes already specify correspondence. Preserve those exact gaps;
				// never discover new relationships by matching the current wording.
				const gaps = link.lines.map((line) => {
					const section = parsed.sections.find(
						(entry) =>
							entry.header &&
							physical[line - 1]?.from <= entry.header.from &&
							entry.header.to <= physical[line - 1]!.to
					);
					const first = section?.lines[0];
					const last = section?.lines.at(-1);
					if (!first || !last) return [];
					const from = contentOffset(projection, first.from, 1);
					const to = contentOffset(projection, last.to, -1);
					let cursor = from;
					const result: { from: number; to: number }[] = [];
					for (const hole of record.holes
						.filter((hole) => from <= hole.from && hole.to <= to)
						.sort((a, b) => a.from - b.from)) {
						result.push({ from: cursor, to: hole.from });
						cursor = hole.to;
					}
					result.push({ from: cursor, to });
					return result;
				});
				record.passages = [];
				for (let index = 0; index < (gaps[0]?.length ?? 0); index++) {
					const members = gaps.flatMap((ranges, member) =>
						ranges[index] ? [{ ...ranges[index]!, sectionId: record.sectionIds[member]! }] : []
					);
					if (
						members.length === record.sectionIds.length &&
						members.every(
							(member) =>
								document.content.slice(member.from, member.to) ===
								document.content.slice(members[0]!.from, members[0]!.to)
						)
					)
						record.passages.push({ members });
				}
			}
			if (link.detached !== undefined) {
				record.detached = [];
				for (const member of link.detached) {
					const coordinates = range(member);
					const sectionId = sectionByLine.get(member.headerLine);
					if (!coordinates || !sectionId || !record.sectionIds.includes(sectionId))
						return refuse('invalid-input', 'A detached passage has invalid coordinates.');
					record.detached.push({ ...coordinates, sectionId });
				}
			}
			links.push(record);
		}
		next.links = links;
	}
	const rendered = renderProfile(next, projection.profile);
	return rendered.ok
		? { ok: true, value: { document: next, projection: rendered.value, changes: [] } }
		: rendered;
}

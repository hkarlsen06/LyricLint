import type { ConversionDocument, Projection } from './model.js';
import type { SectionType } from './section-types.js';
import { canRenderSection } from './section-placement.js';

/** A section boundary as the main draft draws it: where it sits and what it is called. */
export interface TaggedSection {
	id: string;
	/** Offset of the boundary in the projected text. */
	at: number;
	type?: SectionType;
	/** The section's own name, for a heading no Musixmatch type stands for. */
	name: string;
	/** A boundary with voices assigned is removed in the section's options, not from a menu. */
	removable: boolean;
}

/** One stanza of a headerless draft, as a row of its outline. */
export interface StanzaRow {
	/** Offset of the stanza's first line in the projected text. */
	from: number;
	to: number;
	/** One-based line number of the first line. */
	line: number;
	lineCount: number;
	opening: string;
	/** The section that begins exactly on this stanza. */
	section?: TaggedSection;
	/** The section this stanza belongs to when it begins none. */
	continues?: TaggedSection;
	/** The type of an identically worded stanza that is already tagged. */
	suggestion?: SectionType;
}

/** The boundaries the editor draws: placed ones only, in document order. */
export function taggedSections(
	document: ConversionDocument,
	projection: Projection
): TaggedSection[] {
	return projection.sections.flatMap((section) => {
		const record = document.sections.find((entry) => entry.id === section.id);
		if (!record || !canRenderSection(document, record)) return [];
		const tagged: TaggedSection = {
			id: section.id,
			at: section.at,
			name: section.name,
			removable: !document.voices.some((voice) => voice.sectionId === section.id)
		};
		if (section.type) tagged.type = section.type;
		return [tagged];
	});
}

interface Stanza {
	from: number;
	to: number;
	line: number;
	lineCount: number;
	opening: string;
}

/**
 * Blank lines separate stanzas, and so does a section boundary: lyrics pasted
 * from Genius without blank lines still have one passage per header.
 */
function stanzas(text: string, boundaries: ReadonlySet<number>): Stanza[] {
	const found: Stanza[] = [];
	let current: Stanza | undefined;
	let offset = 0;
	let line = 1;
	for (const raw of text.split('\n')) {
		const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
		if (content.trim()) {
			if (current && !boundaries.has(offset)) {
				current.to = offset + content.length;
				current.lineCount++;
			} else {
				current = {
					from: offset,
					to: offset + content.length,
					line,
					lineCount: 1,
					opening: content
				};
				found.push(current);
			}
		} else {
			current = undefined;
		}
		offset += raw.length + 1;
		line++;
	}
	return found;
}

function boundariesOf(sections: readonly TaggedSection[]): Set<number> {
	return new Set(sections.map((section) => section.at));
}

/** Two stanzas are the same passage when their words match, whatever the spacing or case. */
function wording(text: string, stanza: Stanza): string {
	return text
		.slice(stanza.from, stanza.to)
		.split('\n')
		.map((line) => line.trim().replace(/\s+/gu, ' ').toLocaleLowerCase())
		.join('\n');
}

/**
 * The song's stanzas with the section each begins or continues. A stanza
 * worded exactly like a tagged one carries that tag as a suggestion, because a
 * repeated chorus is the same decision made twice.
 */
export function stanzaOutline(text: string, sections: readonly TaggedSection[]): StanzaRow[] {
	const rows: StanzaRow[] = stanzas(text, boundariesOf(sections)).map((stanza) => {
		const row: StanzaRow = { ...stanza };
		const section = sections.find((entry) => entry.at === stanza.from);
		const continues = section ? undefined : sections.findLast((entry) => entry.at <= stanza.from);
		if (section) row.section = section;
		if (continues) row.continues = continues;
		return row;
	});
	const typed = new Map<string, SectionType>();
	for (const row of rows)
		if (row.section?.type && !typed.has(wording(text, row)))
			typed.set(wording(text, row), row.section.type);
	for (const row of rows) {
		const suggestion = row.section ? undefined : typed.get(wording(text, row));
		if (suggestion) row.suggestion = suggestion;
	}
	return rows;
}

/**
 * Where a tag for the stanza around `offset` belongs: the start of that
 * stanza's first line. On a blank line it is the next stanza, and with nothing
 * after it the blank line itself, so an empty draft can be tagged before it is
 * written.
 */
export function stanzaStartAt(
	text: string,
	offset: number,
	sections: readonly TaggedSection[] = []
): number {
	const lineStart = text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
	const all = stanzas(text, boundariesOf(sections));
	const around = all.find((stanza) => stanza.from <= lineStart && lineStart <= stanza.to);
	if (around) return around.from;
	return all.find((stanza) => stanza.from > lineStart)?.from ?? lineStart;
}

import { englishLanguagePack } from '$lib/languages/en.js';
import { headerSemanticKey } from '$lib/languages/registry.js';
import type { LanguagePack, ParsedDocument, Section, TextRange } from '$lib/core/types.js';

/**
 * The section kinds a song repeats verbatim, and therefore the only ones worth
 * linking.
 *
 * A verse repeats its *shape*, not its words, so linking two of them would be a
 * standing offer to overwrite one with the other. These three are the parts a
 * transcriber genuinely types twice, and mis-typing the second is the mistake
 * linking exists to make impossible.
 */
const LINKABLE_SEMANTICS = new Set(['chorus', 'prechorus', 'postchorus']);

/**
 * The linkable kind this header spells, in the draft's own language.
 *
 * English is consulted second rather than instead: Genius pages in every
 * language carry English headers routinely — `ja` is an English pack outright,
 * and `no` lists `Chorus` beside `Refreng` — so a German draft with `[Chorus]`
 * in it links exactly like one with `[Hook]`. The selected pack still wins,
 * which is what keeps `Refrain` reading as a chorus in French and as a chorus
 * in German rather than as English's separate `Refrain`.
 */
export function linkableSemantic(
	pack: LanguagePack | undefined,
	headerName: string | undefined
): string | undefined {
	const semantic =
		(pack ? headerSemanticKey(pack, headerName) : undefined) ??
		headerSemanticKey(englishLanguagePack, headerName);
	return semantic && LINKABLE_SEMANTICS.has(semantic) ? semantic : undefined;
}

function sectionForHeader(parsed: ParsedDocument, headerFrom: number): Section | undefined {
	return parsed.sections.find((section) => section.header?.from === headerFrom);
}

/**
 * The text a linked section shares with its peers: everything after the header
 * line, up to wherever the section ends.
 *
 * It starts at the *end of the header line* rather than at the first lyric, so
 * the leading line break belongs to the body. That is what lets a header with
 * no lyrics under it yet take a peer's words — replacing an empty range at the
 * end of a header line with `"\nOoh, ooh"` needs no special case, while a body
 * measured from the first lyric of a section that has none has no position to
 * describe at all.
 */
export function sectionBodyRange(
	parsed: ParsedDocument,
	headerFrom: number
): TextRange | undefined {
	const section = sectionForHeader(parsed, headerFrom);
	if (!section?.header) {
		return undefined;
	}
	const from = section.header.to;
	return { from, to: Math.max(from, section.to) };
}

/** 1-based line number of an offset, matching CodeMirror's own numbering. */
export function lineNumberAt(text: string, offset: number): number {
	let line = 1;
	for (let index = 0; index < offset && index < text.length; index += 1) {
		if (text[index] === '\n') {
			line += 1;
		} else if (text[index] === '\r' && text[index + 1] !== '\n') {
			line += 1;
		}
	}
	return line;
}

/** One section of a linkable kind, numbered by where it falls in the song. */
export interface LinkOccurrence {
	/** Offset of the header's opening bracket, the identity every hook uses. */
	headerFrom: number;
	/** 1-based header line, for the reader and for what gets written down. */
	line: number;
	/** The header as written, ordinal and all: `Chorus 2`. */
	label: string;
	/** Position among this kind's occurrences, counted from the top of the song. */
	ordinal: number;
}

/** Every section of the same kind as the one at `headerFrom`, in document order. */
export function linkOccurrences(
	parsed: ParsedDocument,
	pack: LanguagePack | undefined,
	headerFrom: number
): LinkOccurrence[] {
	const semantic = linkableSemantic(
		pack,
		sectionForHeader(parsed, headerFrom)?.header?.rawNamePart
	);
	if (!semantic) {
		return [];
	}
	return parsed.sections
		.filter(
			(section) => section.header && linkableSemantic(pack, section.header.rawNamePart) === semantic
		)
		.map((section, index) => ({
			headerFrom: section.header?.from ?? 0,
			line: lineNumberAt(parsed.text, section.header?.from ?? 0),
			label: section.header?.rawNamePart.trim() || section.header?.raw || '',
			ordinal: index + 1
		}));
}

/**
 * The linkable header the user has selected whole, if that is what this
 * selection is.
 *
 * Whole, because half a header is a word being retyped and a selection spanning
 * two lines is a passage — neither is an invitation to restructure the song.
 * A collapsed selection resolves to the header of the section the caret is in,
 * which is what the keyboard command asks for.
 */
export function linkableHeaderAt(
	parsed: ParsedDocument,
	pack: LanguagePack | undefined,
	from: number,
	to: number
): TextRange | undefined {
	const section = parsed.sections.find((candidate) => {
		const header = candidate.header;
		if (!header || !linkableSemantic(pack, header.rawNamePart)) {
			return false;
		}
		return from === to
			? candidate.from <= from && from <= candidate.to
			: from <= header.from && header.to <= to;
	});
	const header = section?.header;
	if (!header) {
		return undefined;
	}
	if (from !== to && /[\r\n]/u.test(parsed.text.slice(from, to))) {
		return undefined;
	}
	return { from: header.from, to: header.to };
}

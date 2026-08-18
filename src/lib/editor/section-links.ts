import { linkableSemantic } from '$lib/languages/registry.js';
import type { LanguagePack, ParsedDocument, Section, TextRange } from '$lib/core/types.js';
import { lineNumberAt } from '$lib/core/line-numbers.js';

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
	/**
	 * How this section's lyrics compare with the words a link would write.
	 *
	 * `source` is the section the card was opened from — unless it has no words,
	 * in which case it reports `empty` like any other empty copy, because an
	 * empty section is not what a link is written from.
	 */
	comparison: 'source' | 'same' | 'empty' | 'different';
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
	const members = parsed.sections.filter(
		(section) => section.header && linkableSemantic(pack, section.header.rawNamePart) === semantic
	);
	const lyrics = (section: Section): string =>
		section.lines
			.map((line) => line.text.trim())
			.filter(Boolean)
			.join('\n');
	// What a link would actually write: the opened section's words, or — where it
	// has none — the first copy that has any, since that is where `linkSections`
	// takes them from. Compared against an empty source every peer reads
	// `different`, which is the card telling a user filling a new `[Chorus 3]`
	// that the two identical choruses above it disagree.
	const opened = sectionForHeader(parsed, headerFrom) ?? members[0];
	const sourceLyrics =
		lyrics(opened) || lyrics(members.find((section) => lyrics(section).length > 0) ?? opened);
	return members.map((section, index) => ({
		headerFrom: section.header?.from ?? 0,
		line: lineNumberAt(parsed.text, section.header?.from ?? 0),
		label: section.header?.rawNamePart.trim() || section.header?.raw || '',
		ordinal: index + 1,
		comparison:
			lyrics(section).length === 0
				? 'empty'
				: section.header?.from === headerFrom
					? 'source'
					: lyrics(section) === sourceLyrics
						? 'same'
						: 'different'
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

/**
 * What an aimed press means: which section's card to open, and which words the
 * user had in hand when they asked.
 *
 * A selection of *lyrics* inside a linkable section resolves to that section's
 * header and reports itself. In an existing group it is the span `Type only
 * here` will replace; while linking new members it can still be set aside as a
 * difference immediately.
 *
 * Deliberately not `linkableHeaderAt`, which stays exactly as narrow as it was.
 * That predicate answers the *pointer* path, where a card opens uninvited on a
 * bare selection, and teaching it about lyric ranges would put the link card on
 * the most common gesture in a text editor — beside the performer picker, which
 * is already there. An aimed press has been asked; a selection has not.
 */
export function linkTargetAt(
	parsed: ParsedDocument,
	pack: LanguagePack | undefined,
	from: number,
	to: number
): { header: TextRange; selection?: TextRange } | undefined {
	const header = linkableHeaderAt(parsed, pack, from, to);
	if (header) {
		return { header };
	}
	if (from === to) {
		return undefined;
	}
	const section = parsed.sections.find(
		(candidate) =>
			candidate.header &&
			linkableSemantic(pack, candidate.header.rawNamePart) &&
			candidate.header.to <= from &&
			to <= candidate.to
	);
	return section?.header
		? { header: { from: section.header.from, to: section.header.to }, selection: { from, to } }
		: undefined;
}

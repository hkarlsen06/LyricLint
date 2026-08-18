/*
 * Every character here is built from its code point rather than written
 * literally. The whole subject of this file is characters that cannot be seen,
 * and a literal one in the source is a character no reviewer can check and no
 * diff can show.
 *
 * This table lives in `core` because two independent consumers have to agree on
 * it exactly: `text.invisible-characters` reports these characters, and the
 * editor decorates them. A rule that flagged a character the editor left
 * invisible would put an underline under nothing.
 */

interface InvisibleCharacter {
	/** Names the character in a diagnostic message, mid-sentence. */
	description: string;
	/** What the safe fix puts in its place; empty means the character is dropped. */
	replacement: string;
	fixLabel: string;
}

const SPACE_FIX = 'Replace with a normal space';

/**
 * Characters that arrive with a paste and cannot be seen once they are here.
 *
 * The set is deliberately short. Every entry is a character that is in a lyric
 * by accident — a word processor's spacing, a scraper's separator, a file's
 * byte-order mark — and never because a transcriber typed it.
 *
 * Bidi controls (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069) and the joiners
 * (U+200C, U+200D) are excluded on purpose and must stay excluded. They carry
 * meaning: the joiners hold emoji sequences and Persian and Indic words
 * together, and the bidi marks are load-bearing in the Arabic documents this
 * product commits to preserving exactly. Stripping them would silently corrupt
 * the text this rule exists to clean.
 */
export const INVISIBLE_CHARACTERS = new Map<string, InvisibleCharacter>([
	[
		String.fromCodePoint(0x00a0),
		{ description: 'a non-breaking space', replacement: ' ', fixLabel: SPACE_FIX }
	],
	[
		String.fromCodePoint(0x202f),
		{ description: 'a narrow non-breaking space', replacement: ' ', fixLabel: SPACE_FIX }
	],
	[
		String.fromCodePoint(0x2007),
		{ description: 'a figure space', replacement: ' ', fixLabel: SPACE_FIX }
	],
	[
		String.fromCodePoint(0x200b),
		{ description: 'a zero-width space', replacement: '', fixLabel: 'Remove the zero-width space' }
	],
	[
		String.fromCodePoint(0xfeff),
		{ description: 'a byte-order mark', replacement: '', fixLabel: 'Remove the byte-order mark' }
	]
]);

/**
 * A fresh global pattern matching every invisible character.
 *
 * Built per call rather than shared: a global regular expression carries
 * `lastIndex` between uses, and CodeMirror and the rule engine scan different
 * strings at different times.
 */
export function invisibleCharacterPattern(): RegExp {
	return new RegExp(`[${[...INVISIBLE_CHARACTERS.keys()].join('')}]`, 'gu');
}

/** The entry for a code point, for consumers that scan by character code. */
export function invisibleCharacterAt(code: number): InvisibleCharacter | undefined {
	return INVISIBLE_CHARACTERS.get(String.fromCodePoint(code));
}

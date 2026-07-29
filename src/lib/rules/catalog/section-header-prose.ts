import type { Diagnostic, LyricLine, RuleDefinition, Section } from '$lib/core/types.js';
import {
	canLintHeaderLanguage,
	getLanguagePack,
	reviewedLanguagePacks
} from '$lib/languages/registry.js';
import { diagnostic, replacementFix } from './utils.js';

/**
 * A whole line that is nothing but a song-part name, optionally numbered and
 * optionally followed by a colon — the shape lyric sites and word processors
 * use where Genius wants `[Verse 1]`.
 */
const PROSE_LABEL = /^(?<name>\p{L}[\p{L} '’-]*?)(?:\s+(?<ordinal>\d+))?\s*(?<colon>:)?$/u;

interface RecognizedTerm {
	term: string;
	sourceIds: readonly string[];
}

/**
 * The reviewed spelling of a song-part name, preferring the document's own
 * language so a Norwegian draft converts `Refreng:` with Norwegian provenance
 * before English is consulted.
 *
 * The pack's casing wins over the line's, which is what turns `VERSE 1` into
 * `[Verse 1]` rather than `[VERSE 1]`. Choosing a *localized* replacement is
 * deliberately not this rule's job: `section.localized-header-preference`
 * already owns that decision and will see the bracketed header afterwards.
 */
function canonicalTerm(name: string, language: string): RecognizedTerm | undefined {
	const normalized = name.trim().toLocaleLowerCase();
	const selected = getLanguagePack(language);
	const packs = canLintHeaderLanguage(selected)
		? [selected, ...reviewedLanguagePacks.filter((pack) => pack.tag !== selected.tag)]
		: reviewedLanguagePacks;

	for (const pack of packs) {
		for (const header of pack.headers) {
			for (const term of header.terms) {
				if (term.toLocaleLowerCase() === normalized) {
					return { term, sourceIds: pack.sourceIds };
				}
			}
		}
	}
	return undefined;
}

/** True only for cased scripts, so Hangul and Arabic never read as shouting. */
function isAllCaps(name: string): boolean {
	return /\p{Lu}/u.test(name) && name === name.toLocaleUpperCase();
}

/**
 * True where a line is a song-part label written as prose rather than as a
 * bracketed header.
 *
 * It is exported because such a line is not a lyric, and two other rules read
 * every line as one. `section.header-missing` reported the section it heads as
 * headerless — two cards on one line, the leading one saying there is no header
 * beside one quoting the header — and `numbers.spell-out` offered to write its
 * ordinal out, so a pasted `Verse 1:` was told to become `Verse one:`. Both are
 * this shape's own findings arriving as somebody else's, and the answer to both
 * is the same one press: `Use [Verse 1]`.
 *
 * One predicate rather than a copy per consumer, because what counts as a
 * written-out header is exactly the set this rule is about to offer a fix for —
 * three answers to that would disagree the first time a language pack gained a
 * term.
 */
export function isProseHeaderLine(line: LyricLine, language: string): boolean {
	return proseHeader(line, language) !== undefined;
}

/**
 * A bare reviewed name is strong enough evidence when it is the first line of
 * a headerless blank-line section and has a lyric body beneath it. Inside an
 * existing headed section, or alone with no body, the same word can still be a
 * one-word lyric.
 */
function leadingBareProseHeader(
	section: Section,
	language: string
): { line: LyricLine; finding: ProseHeader } | undefined {
	if (section.header) {
		return undefined;
	}
	const nonEmpty = section.lines.filter((line) => line.text.trim().length > 0);
	const line = nonEmpty[0];
	if (!line || nonEmpty.length < 2) {
		return undefined;
	}
	const finding = proseHeader(line, language, true);
	return finding ? { line, finding } : undefined;
}

export function sectionLeadsWithProseHeader(section: Section, language: string): boolean {
	const leading = section.lines.find((line) => line.text.trim().length > 0);
	return (
		leading !== undefined &&
		(isProseHeaderLine(leading, language) ||
			leadingBareProseHeader(section, language)?.line === leading)
	);
}

export const sectionHeaderProseRule: RuleDefinition = {
	id: 'section.header-prose',
	version: 2,
	defaultSeverity: 'warning',
	fixability: 'safe',
	sourceIds: ['G-SECTIONS'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];

		for (const section of document.sections) {
			const bareLead = leadingBareProseHeader(section, context.language);
			for (const line of section.lines) {
				const finding =
					bareLead?.line === line ? bareLead.finding : proseHeader(line, context.language);
				if (!finding) {
					continue;
				}

				const range = { from: line.from, to: line.to };
				diagnostics.push(
					diagnostic(
						this,
						range,
						`Write this section header as ${finding.replacement}.`,
						`Genius marks song parts with a bracketed header. “${line.text.trim()}” names a reviewed song part but is written as a plain line, so it reads as a lyric and no section is created. The bracketed form keeps the same part name.`,
						[
							replacementFix(
								context,
								'safe',
								`Use ${finding.replacement}`,
								range,
								finding.replacement
							)
						],
						['G-SECTIONS', ...finding.sourceIds.filter((id) => id !== 'G-SECTIONS')]
					)
				);
			}
		}

		return diagnostics;
	}
};

interface ProseHeader {
	replacement: string;
	sourceIds: readonly string[];
}

/**
 * A recognized part name alone on a line is not enough on its own: a lyric can
 * be the single word “Chorus”. One of three marks has to be present — a
 * trailing colon, a number, or shouting caps — which is what every real scraped
 * transcription carries and what a one-word lyric does not.
 */
function proseHeader(
	line: LyricLine,
	language: string,
	allowBareName = false
): ProseHeader | undefined {
	// Any markup at all means the line was styled as a lyric, not typed as a label.
	if (line.styleSpans.length > 0) {
		return undefined;
	}

	const groups = PROSE_LABEL.exec(line.text.trim())?.groups;
	const name = groups?.name;
	if (!name) {
		return undefined;
	}
	if (
		!allowBareName &&
		groups.colon === undefined &&
		groups.ordinal === undefined &&
		!isAllCaps(name)
	) {
		return undefined;
	}

	const recognized = canonicalTerm(name, language);
	if (!recognized) {
		return undefined;
	}

	const ordinal = groups.ordinal === undefined ? '' : ` ${groups.ordinal}`;
	return { replacement: `[${recognized.term}${ordinal}]`, sourceIds: recognized.sourceIds };
}

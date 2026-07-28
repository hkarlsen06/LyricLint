import { canLintHeaderLanguage, getLanguagePack } from '$lib/languages/registry.js';
import type {
	Diagnostic,
	RuleDefinition,
	Section,
	SectionHeader,
	TextEdit
} from '$lib/core/types.js';
import { diagnostic, replacementFix } from './utils.js';

function semanticPart(header: SectionHeader, language: string): string | undefined {
	const pack = getLanguagePack(language);
	if (!canLintHeaderLanguage(pack)) return undefined;
	const normalized = header.namePart.trim().toLocaleLowerCase();
	return pack.headers.find((entry) =>
		entry.terms.some((term) => term.toLocaleLowerCase() === normalized)
	)?.semanticPart;
}

function ordinalRemovalRange(header: SectionHeader) {
	return header.ordinalRange
		? { from: header.nameRange.to, to: header.ordinalRange.to }
		: undefined;
}

function bodyKey(section: Section): string {
	return section.lines.map((line) => line.text).join('\n');
}

/**
 * The edit that puts `expected` on a verse header.
 *
 * A header that already carries a number has its digits replaced; one that
 * carries none takes an insertion at the end of its name, which is before the
 * legend rather than at the end of the header — `[Vers: Ane]` numbers as
 * `[Vers 1: Ane]`.
 */
function numberEdit(header: SectionHeader, expected: number): TextEdit {
	return header.ordinalRange
		? { from: header.ordinalRange.from, to: header.ordinalRange.to, insert: String(expected) }
		: { from: header.nameRange.to, to: header.nameRange.to, insert: ` ${expected}` };
}

export const sectionVerseNumberingRule: RuleDefinition = {
	id: 'section.verse-numbering',
	version: 2,
	defaultSeverity: 'suggestion',
	fixability: 'preview',
	sourceIds: ['G-SECTION-NUMBERING'],
	check(document, context) {
		const diagnostics: Diagnostic[] = [];
		const verses: Section[] = [];
		const pack = getLanguagePack(context.language);
		const sourceIds = ['G-SECTION-NUMBERING', ...pack.sourceIds];
		for (const section of document.sections) {
			const header = section.header;
			if (!header) continue;
			const part = semanticPart(header, context.language);
			if (part === 'Verse') {
				verses.push(section);
				continue;
			}
			const removal = ordinalRemovalRange(header);
			if (!removal || part === undefined) continue;
			diagnostics.push(
				diagnostic(
					this,
					header.ordinalRange ?? removal,
					`Do not number ${part} headers.`,
					'The Genius section guide reserves enumeration for verses.',
					[replacementFix(context, 'preview', 'Remove section number', removal, '')],
					sourceIds
				)
			);
		}

		const uniqueBodies = new Map<string, number>();
		for (const verse of verses) {
			const key = bodyKey(verse);
			if (!uniqueBodies.has(key)) uniqueBodies.set(key, uniqueBodies.size + 1);
		}
		if (uniqueBodies.size === 1) {
			for (const verse of verses) {
				const header = verse.header;
				const removal = header && ordinalRemovalRange(header);
				if (!header?.ordinalRange || !removal) continue;
				diagnostics.push(
					diagnostic(
						this,
						header.ordinalRange,
						'Do not number a song with only one distinct verse.',
						'If a song contains only one verse, the Genius section guide leaves it unnumbered even when that verse repeats.',
						[replacementFix(context, 'preview', 'Remove verse number', removal, '')],
						sourceIds
					)
				);
			}
			return diagnostics;
		}

		// Every verse whose header does not already say the number this song's
		// distinct verses give it, in document order.
		const wanted = verses.flatMap((verse) => {
			const header = verse.header;
			const expected = uniqueBodies.get(bodyKey(verse));
			return header && expected !== undefined && header.ordinal !== expected
				? [{ header, expected }]
				: [];
		});
		if (wanted.length === 0) {
			return diagnostics;
		}

		if (wanted.every(({ header }) => header.ordinal !== undefined)) {
			// Every verse is numbered and some of the numbers disagree with the
			// order the song's distinct verses appear in. That is one wrong number
			// per header rather than a song that was never enumerated, so each one
			// is its own finding with its own correction.
			for (const { header, expected } of wanted) {
				if (!header.ordinalRange) continue;
				diagnostics.push(
					diagnostic(
						this,
						header.ordinalRange,
						`This verse should be numbered ${expected}.`,
						'Distinct verses are numbered in ascending order; an exact repeated verse keeps the number of its first occurrence.',
						[
							replacementFix(
								context,
								'preview',
								`Replace with ${expected}`,
								header.ordinalRange,
								String(expected)
							)
						],
						sourceIds
					)
				);
			}
			return diagnostics;
		}

		// A verse carries no number at all, so what is missing is the enumeration
		// itself. Two verses written out is a song that needs numbering, and a
		// verse still waiting for its words is not evidence of one — so the
		// trigger counts the verses that have words, while the numbers themselves
		// still count every verse. Otherwise pressing Enter on a fresh `[Verse]`
		// would ask for numbering before there was a second verse to distinguish.
		const written = new Set(verses.map(bodyKey).filter((key) => key.length > 0));
		if (written.size < 2) {
			return diagnostics;
		}

		const [lead, ...rest] = wanted;
		if (!lead) {
			return diagnostics;
		}
		// One finding for the song, not one per header. Numbering is a single
		// decision about a set — a card per verse would be the same sentence down
		// a column, and each of them would only do part of the job.
		const scope =
			verses.length === uniqueBodies.size
				? `This song has ${verses.length} verses, and each one has different words.`
				: `This song has ${verses.length} verse headers and ${uniqueBodies.size} distinct verses; an exact repeated verse keeps the number of its first occurrence.`;
		const only = wanted.length === 1;
		diagnostics.push({
			...diagnostic(
				this,
				{ from: lead.header.from, to: lead.header.to },
				only ? `This verse should be numbered ${lead.expected}.` : "Number this song's verses.",
				`${scope} The Genius section guide enumerates distinct verses in ascending order, so a reader can tell which verse is which.`,
				[
					{
						kind: 'preview',
						label: only ? `Number this verse ${lead.expected}` : 'Number the verses',
						edit: {
							baseRevision: context.revision,
							edits: wanted.map(({ header, expected }) => numberEdit(header, expected))
						}
					}
				],
				sourceIds
			),
			...(rest.length > 0
				? { relatedRanges: rest.map(({ header }) => ({ from: header.from, to: header.to })) }
				: {})
		});
		return diagnostics;
	}
};

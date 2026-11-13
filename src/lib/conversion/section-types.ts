import type { ParsedDocument } from '#lib/core/types.js';
import type { SectionRecord } from './model.js';
import { canRetainSectionHeader } from './section-placement.js';
import { getLanguagePack, headerSemanticKey, semanticPartKey } from '#lib/languages/registry.js';

/** Shared order for deliberate Musixmatch type choices in Review and Song. */
export const sectionTypeChoices: readonly NonNullable<SectionRecord['type']>[] = [
	'Intro',
	'Verse',
	'PreChorus',
	'Chorus',
	'Hook',
	'Bridge',
	'Outro'
];

/** A type as its tag reads: `PreChorus` is stored without its hyphen. */
export function sectionTypeLabel(type: NonNullable<SectionRecord['type']>): string {
	return type === 'PreChorus' ? 'Pre-Chorus' : type;
}

/** The type choices as a list a picker draws, in the shared order. */
export const sectionTypeOptions = sectionTypeChoices.map((type) => ({
	value: type,
	label: sectionTypeLabel(type)
}));

/** The Musixmatch tag a reviewed song-part name stands for, in the draft's language or English. */
export function sectionTypeForName(name: string, language: string): SectionRecord['type'] {
	const literal = semanticPartKey(name.replace(/\s+\d+$/u, ''));
	const direct = sectionTypeChoices.find((type) => semanticPartKey(type) === literal);
	if (direct) return direct;
	const semantic =
		headerSemanticKey(getLanguagePack(language), name) ??
		headerSemanticKey(getLanguagePack('en'), name);
	return sectionTypeChoices.find((type) => semanticPartKey(type) === semantic);
}

/** An authored heading supplies its type; an explicit override takes precedence. */
export function sectionType(section: SectionRecord, language: string): SectionRecord['type'] {
	if (section.type) return section.type;
	if (section.headerVisible === false || section.placement === 'unresolved') return undefined;
	return sectionTypeForName(section.name, language);
}

/**
 * How many complete header lines name a reviewed song part. One or more is the
 * sign that a passage was written in Genius formatting: `[laughs]` alone is a
 * bracketed vocal, `[Chorus: Mira]` is structure.
 */
export function recognizedSectionHeaders(document: ParsedDocument, language: string): number {
	let count = 0;
	for (const section of document.sections)
		if (canRetainSectionHeader(section.header) && sectionTypeForName(section.header.name, language))
			count++;
	return count;
}

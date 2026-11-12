import type { SectionRecord } from './model.js';
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

/** An authored heading supplies its type; an explicit override takes precedence. */
export function sectionType(section: SectionRecord, language: string): SectionRecord['type'] {
	if (section.type) return section.type;
	if (section.headerVisible === false || section.placement === 'unresolved') return undefined;
	const literal = semanticPartKey(section.name.replace(/\s+\d+$/u, ''));
	const direct = sectionTypeChoices.find((type) => semanticPartKey(type) === literal);
	if (direct) return direct;
	const semantic =
		headerSemanticKey(getLanguagePack(language), section.name) ??
		headerSemanticKey(getLanguagePack('en'), section.name);
	return sectionTypeChoices.find((type) => semanticPartKey(type) === semantic);
}

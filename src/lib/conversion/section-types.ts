import type { SectionRecord } from './model.js';

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

import type { LanguagePack } from './types.js';
import { englishLanguagePack } from './en.js';

/** Genius Japan requires English section headers on song pages. */
export const japaneseLanguagePack: LanguagePack = {
	tag: 'ja',
	displayName: 'Japanese',
	policy: 'english-preferred',
	reviewed: true,
	sourceIds: ['G-LANG-JA', 'G-LANG-EN'],
	headers: englishLanguagePack.headers.map((header) => ({
		semanticPart: header.semanticPart,
		terms: [...header.terms]
	}))
};

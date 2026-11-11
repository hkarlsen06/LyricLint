import type { LanguagePack } from './types.js';

/**
 * Reviewed Danish section-header vocabulary from Genius annotation 12816647.
 * `Bro` is the Danish Pre-Chorus; Norwegian uses the same word for Bridge, and
 * each pack reads it as its own part.
 */
export const danishLanguagePack: LanguagePack = {
	tag: 'da',
	displayName: 'Danish',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-DA'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Vers'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Bro'] },
		{ semanticPart: 'Chorus', terms: ['Omkvæd'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-omkvæd'] },
		{ semanticPart: 'Refrain', terms: ['Refræn'] },
		{ semanticPart: 'Bridge', terms: ['Kontraststykke'] },
		{ semanticPart: 'Interlude', terms: ['Mellemstykke', 'Mellemspil'] },
		{ semanticPart: 'Outro', terms: ['Outro'] }
	]
};

import type { LanguagePack } from './types.js';

/** Reviewed English section-header vocabulary. */
export const englishLanguagePack: LanguagePack = {
	tag: 'en',
	displayName: 'English',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-EN'],
	headers: [
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Verse'] },
		{ semanticPart: 'Chorus', terms: ['Chorus'] },
		{ semanticPart: 'Refrain', terms: ['Refrain'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Chorus'] },
		{ semanticPart: 'Bridge', terms: ['Bridge'] },
		{ semanticPart: 'Interlude', terms: ['Interlude'] },
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Outro', terms: ['Outro'] }
	]
};

import type { LanguagePack } from './types.js';

/** Reviewed Norwegian section-header vocabulary. */
export const norwegianLanguagePack: LanguagePack = {
	tag: 'no',
	displayName: 'Norwegian',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-NO'],
	headers: [
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Vers'] },
		{ semanticPart: 'Chorus', terms: ['Refreng', 'Chorus'] },
		{ semanticPart: 'Refrain', terms: ['Refreng'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Chorus'] },
		{ semanticPart: 'Bridge', terms: ['Bro'] },
		{ semanticPart: 'Interlude', terms: ['Mellomspill'] },
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Outro', terms: ['Outro'] }
	]
};

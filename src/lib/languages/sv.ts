import type { LanguagePack } from './types.js';

/** Reviewed Swedish section-header vocabulary from Genius annotation 12745194. */
export const swedishLanguagePack: LanguagePack = {
	tag: 'sv',
	displayName: 'Swedish',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-SV'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Vers'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Brygga'] },
		{ semanticPart: 'Chorus', terms: ['Refräng'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Refräng'] },
		{ semanticPart: 'Bridge', terms: ['Stick'] },
		{ semanticPart: 'Interlude', terms: ['Mellanspel'] },
		{ semanticPart: 'Outro', terms: ['Outro'] }
	]
};

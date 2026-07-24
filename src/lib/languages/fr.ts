import type { LanguagePack } from './types.js';

/** Reviewed French section-header vocabulary from Genius annotation 12745216. */
export const frenchLanguagePack: LanguagePack = {
	tag: 'fr',
	displayName: 'French',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-FR'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Couplet'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pré-refrain'] },
		{ semanticPart: 'Chorus', terms: ['Refrain'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-refrain'] },
		{ semanticPart: 'Refrain', terms: ['Riff'] },
		{ semanticPart: 'Bridge', terms: ['Pont'] },
		{ semanticPart: 'Interlude', terms: ['Intermède', 'Interlude'] },
		{ semanticPart: 'Skit', terms: ['Dialogue'] },
		{ semanticPart: 'Scatting', terms: ['Scat'] },
		{ semanticPart: 'Solo', terms: ['Solo'] },
		{ semanticPart: 'Outro', terms: ['Outro'] },
		{ semanticPart: 'Instrumental Break', terms: ['Pause instrumentale', 'Coupure'] },
		{ semanticPart: 'Instrumental Intro', terms: ['Intro instrumentale'] },
		{ semanticPart: 'Instrumental Outro', terms: ['Outro instrumentale'] },
		{ semanticPart: 'Non-Lyrical Vocals', terms: ['Vocalises'] }
	]
};

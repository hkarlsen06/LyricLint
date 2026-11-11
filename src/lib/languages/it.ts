import type { LanguagePack } from './types.js';

/**
 * Reviewed Italian section-header vocabulary from Genius annotation 12745215.
 * The annotation gives one term, `Ritornello`, for Chorus/Refrain, so it is
 * listed under both parts, as Norwegian lists `Refreng`.
 */
export const italianLanguagePack: LanguagePack = {
	tag: 'it',
	displayName: 'Italian',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-IT'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Strumentale'] },
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Strofa'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pre-Ritornello'] },
		{ semanticPart: 'Chorus', terms: ['Ritornello'] },
		{ semanticPart: 'Refrain', terms: ['Ritornello'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Ritornello'] },
		{ semanticPart: 'Bridge', terms: ['Bridge'] },
		{ semanticPart: 'Outro', terms: ['Outro'] },
		{ semanticPart: 'Drop', terms: ['Drop'] },
		{ semanticPart: 'Solo', terms: ['Assolo'] },
		{ semanticPart: 'Interlude', terms: ['Interludio'] },
		{ semanticPart: 'Non-Lyrical Vocals', terms: ['Senza testo'] }
	]
};

import type { LanguagePack } from './types.js';

/**
 * Reviewed German vocabulary. Rap commonly uses Part/Hook while other genres
 * commonly use Strophe/Refrain, so both alternatives are accepted.
 */
export const germanLanguagePack: LanguagePack = {
	tag: 'de',
	displayName: 'German',
	policy: 'contextual',
	reviewed: true,
	sourceIds: ['G-LANG-DE'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Part', 'Strophe'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pre-Hook', 'Pre-Refrain'] },
		{ semanticPart: 'Chorus', terms: ['Hook', 'Refrain'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Hook', 'Post-Refrain'] },
		{ semanticPart: 'Bridge', terms: ['Bridge'] },
		{ semanticPart: 'Interlude', terms: ['Interlude'] },
		{ semanticPart: 'Outro', terms: ['Outro'] },
		{ semanticPart: 'Part', terms: ['Teil'] }
	]
};

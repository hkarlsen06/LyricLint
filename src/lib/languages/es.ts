import type { LanguagePack } from './types.js';

/** Reviewed Spanish section-header vocabulary from Genius annotation 12744618. */
export const spanishLanguagePack: LanguagePack = {
	tag: 'es',
	displayName: 'Spanish',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-ES'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Intro', terms: ['Intro'] },
		{ semanticPart: 'Verse', terms: ['Verso'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pre-Coro', 'Pre-Estribillo'] },
		{ semanticPart: 'Chorus', terms: ['Coro', 'Estribillo'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Coro', 'Post-Estribillo'] },
		{ semanticPart: 'Refrain', terms: ['Refrán'] },
		{ semanticPart: 'Bridge', terms: ['Puente'] },
		{ semanticPart: 'Interlude', terms: ['Interludio'] },
		{ semanticPart: 'Spoken', terms: ['Hablado'] },
		{ semanticPart: 'Breakdown', terms: ['Ruptura'] },
		{ semanticPart: 'Outro', terms: ['Outro'] },
		{ semanticPart: 'Build', terms: ['Build'] },
		{ semanticPart: 'Drop', terms: ['Drop'] }
	]
};

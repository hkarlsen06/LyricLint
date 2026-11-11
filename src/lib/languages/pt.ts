import type { LanguagePack } from './types.js';

/**
 * Reviewed Portuguese section-header vocabulary from Genius annotation 12745694.
 * `Saída` is the annotation's Brazilian Outro; packs are not regional, so it is
 * accepted beside `Outro` for every Portuguese tag.
 */
export const portugueseLanguagePack: LanguagePack = {
	tag: 'pt',
	displayName: 'Portuguese',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-PT'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['Instrumental'] },
		{ semanticPart: 'Intro', terms: ['Intro', 'Introdução'] },
		{ semanticPart: 'Verse', terms: ['Verso', 'Estrofe'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pré-Refrão'] },
		{ semanticPart: 'Chorus', terms: ['Refrão'] },
		{ semanticPart: 'Refrain', terms: ['Estribilho'] },
		{ semanticPart: 'Post-Chorus', terms: ['Pós-Refrão'] },
		{ semanticPart: 'Bridge', terms: ['Ponte'] },
		{ semanticPart: 'Interlude', terms: ['Interlúdio'] },
		{ semanticPart: 'Outro', terms: ['Outro', 'Saída'] }
	]
};

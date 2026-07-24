import type { LanguagePack } from './types.js';

/**
 * Original Korean songs use English headers; Korean translations may use the
 * paired Hangul terms. Both forms are accepted without guessing page type.
 */
export const koreanLanguagePack: LanguagePack = {
	tag: 'ko',
	displayName: 'Korean',
	policy: 'contextual',
	reviewed: true,
	sourceIds: ['G-LANG-KO', 'G-LANG-EN'],
	headers: [
		{ semanticPart: 'Intro', terms: ['Intro', '인트로'] },
		{ semanticPart: 'Verse', terms: ['Verse', '벌스'] },
		{ semanticPart: 'Refrain', terms: ['Refrain', '포스트벌스'] },
		{ semanticPart: 'Pre-Chorus', terms: ['Pre-Chorus', '프리코러스'] },
		{ semanticPart: 'Chorus', terms: ['Chorus', '코러스'] },
		{ semanticPart: 'Post-Chorus', terms: ['Post-Chorus', '포스트코러스'] },
		{ semanticPart: 'Bridge', terms: ['Bridge', '브릿지'] },
		{ semanticPart: 'Interlude', terms: ['Interlude', '인털루드'] },
		{ semanticPart: 'Instrumental', terms: ['Instrumental', '기악'] },
		{ semanticPart: 'Outro', terms: ['Outro', '아웃트로'] }
	]
};

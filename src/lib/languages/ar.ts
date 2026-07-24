import type { LanguagePack } from './types.js';

/** Reviewed Arabic section-header vocabulary from Genius annotation 12745769. */
export const arabicLanguagePack: LanguagePack = {
	tag: 'ar',
	displayName: 'Arabic',
	policy: 'localized',
	reviewed: true,
	sourceIds: ['G-LANG-AR'],
	headers: [
		{ semanticPart: 'Instrumental', terms: ['إنسترومنتال'] },
		{ semanticPart: 'Intro', terms: ['المقدمة'] },
		{ semanticPart: 'Verse', terms: ['المقطع'] },
		{ semanticPart: 'Pre-Chorus', terms: ['قبل اللازمة'] },
		{ semanticPart: 'Chorus', terms: ['اللازمة'] },
		{ semanticPart: 'Post-Chorus', terms: ['بعد اللازمة'] },
		{ semanticPart: 'Bridge', terms: ['جسر'] },
		{ semanticPart: 'Interlude', terms: ['فاصل'] },
		{ semanticPart: 'Outro', terms: ['الخاتمة'] }
	]
};

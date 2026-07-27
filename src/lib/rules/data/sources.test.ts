import { describe, expect, it } from 'vitest';
import { assertReviewedSources, getSource, sourceRegistry } from './sources.js';

const reviewedIds = [
	'T-LANGUAGE-DETECT',
	'T-HARPER',
	'L-EN-COMMON',
	'L-EN-MORE',
	'L-EN-TOP50',
	'L-NO-COMMON',
	'L-DE-COMMON',
	'L-ES-CONTRACTIONS',
	'L-ES-COMMON',
	'L-FR-COMMON',
	'L-FR-LEXICAL',
	'L-FR-DOUBLES',
	'L-AR-COMMON',
	'L-JA-COMMON',
	'L-KO-COMMON',
	'L-KO-WAENJI',
	'L-KO-ORAENMAN',
	'L-KO-SEOLLEM',
	'L-KO-IRIRI',
	'G-ADD-SONGS',
	'G-SPELLING',
	'G-SECTIONS',
	'G-SECTION-NUMBERING',
	'G-SECTION-HOOK',
	'G-LANG-HEADERS',
	'G-LANG-PURPOSE',
	'G-LANG-EN',
	'G-LANG-NO',
	'G-LANG-AR',
	'G-LANG-DE',
	'G-LANG-ES',
	'G-LANG-FR',
	'G-LANG-JA',
	'G-LANG-KO',
	'G-NUMBERS',
	'APPLE-LINE-PUNCTUATION',
	'G-QE-MARKS',
	'G-DASHES',
	'G-CAPS',
	'G-UNKNOWN',
	'G-CONTRACTIONS',
	'G-TYPEWRITER',
	'G-ADLIBS',
	'G-REPEATS',
	'G-LINES',
	'G-SFX',
	'G-CENSORED',
	'G-QUOTES',
	'G-SYMBOLS',
	'G-AS-SPOKEN',
	'G-NON-ENGLISH',
	'G-INSTRUMENTAL',
	'G-ROMANIZED',
	'G-TRANSLATIONS'
] as const;

const latestHashes = new Map([
	['G-QUOTES', 'sha256:af782896da241613e8c43f818e1e29cbd10c737dd3a25085ecdff4f9b85ec49b'],
	['G-SYMBOLS', 'sha256:264d9996c30fe27b2d8d51591a3fdf4a26c16569a1ab5849cd48c30449e9f601'],
	['G-AS-SPOKEN', 'sha256:961751d472f6b006e7c23640f99f18d5f81255f3cec22faf002648b0e648e092'],
	['G-NON-ENGLISH', 'sha256:23f3b830f5078af165503b09bc9e7775a3b4e5623260b3ac1648c2c25d6ae8f1'],
	['G-INSTRUMENTAL', 'sha256:27f047b0a1ab7f56e8cbf9ef46ea08c1441e843f66f41e569afefb2874e55350'],
	['G-ROMANIZED', 'sha256:fc82a5078321719e14a6efda974655d32f6d14027547baa53e2d6d9b7979373a'],
	['G-TRANSLATIONS', 'sha256:df8d1a410fbcbf88f912a5d030553840a6145383649e4d194c2bb8dc453fa4eb']
]);

describe('source registry', () => {
	it('contains every reviewed source with exact review dates', () => {
		expect(() => assertReviewedSources(reviewedIds)).not.toThrow();
		for (const id of reviewedIds) {
			const lastVerifiedAt = latestHashes.has(id)
				? '2026-07-27'
				: id === 'T-HARPER'
					? '2026-07-26'
					: id.startsWith('L-') ||
						  id === 'APPLE-LINE-PUNCTUATION' ||
						  id === 'G-ADD-SONGS' ||
						  id === 'G-QE-MARKS'
						? '2026-07-25'
						: '2026-07-24';
			expect(getSource(id)).toMatchObject(
				latestHashes.has(id)
					? {
							id,
							retrievedAt: '2026-07-27',
							lastVerifiedAt,
							reviewStatus: 'reviewed',
							contentHash: latestHashes.get(id)
						}
					: id === 'T-HARPER'
						? {
								id,
								retrievedAt: '2026-07-26',
								lastVerifiedAt,
								reviewStatus: 'reviewed'
							}
						: id === 'APPLE-LINE-PUNCTUATION' || id.startsWith('L-')
							? {
									id,
									retrievedAt: '2026-07-25',
									lastVerifiedAt,
									reviewStatus: 'reviewed'
								}
							: {
									id,
									retrievedAt: '2026-07-24',
									lastVerifiedAt,
									reviewStatus: 'reviewed'
								}
			);
		}
	});

	it('contains only the 54 specified source records', () => {
		expect(sourceRegistry.size).toBe(54);
	});
});

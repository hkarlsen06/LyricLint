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
	'G-CENSORED'
] as const;

const needsReviewIds = [
	'G-QUOTES',
	'G-SYMBOLS',
	'G-AS-SPOKEN',
	'G-NON-ENGLISH',
	'G-INSTRUMENTAL'
] as const;

describe('source registry', () => {
	it('contains every reviewed source with exact review dates', () => {
		expect(() => assertReviewedSources(reviewedIds)).not.toThrow();
		for (const id of reviewedIds) {
			const lastVerifiedAt =
				id === 'T-HARPER'
					? '2026-07-26'
					: id.startsWith('L-') ||
						  id === 'APPLE-LINE-PUNCTUATION' ||
						  id === 'G-ADD-SONGS' ||
						  id === 'G-QE-MARKS'
						? '2026-07-25'
						: '2026-07-24';
			expect(getSource(id)).toMatchObject(
				id === 'T-HARPER'
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

	it('keeps candidate sources out of reviewed provenance', () => {
		for (const id of needsReviewIds) {
			expect(getSource(id)?.reviewStatus).toBe('needs-review');
		}
		expect(() => assertReviewedSources(needsReviewIds)).toThrow(/not reviewed/u);
	});

	it('contains only the 52 specified source records', () => {
		expect(sourceRegistry.size).toBe(52);
	});
});

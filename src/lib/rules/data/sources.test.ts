import { describe, expect, it } from 'vitest';
import { assertReviewedSources, getSource, sourceRegistry } from './sources.js';

const reviewedIds = [
	'T-LANGUAGE-DETECT',
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
			expect(getSource(id)).toMatchObject({
				id,
				retrievedAt: '2026-07-24',
				lastVerifiedAt: '2026-07-24',
				reviewStatus: 'reviewed'
			});
		}
	});

	it('keeps candidate sources out of reviewed provenance', () => {
		for (const id of needsReviewIds) {
			expect(getSource(id)?.reviewStatus).toBe('needs-review');
		}
		expect(() => assertReviewedSources(needsReviewIds)).toThrow(/not reviewed/u);
	});

	it('contains only the 33 specified source records', () => {
		expect(sourceRegistry.size).toBe(33);
	});
});

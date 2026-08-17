import { describe, expect, it } from 'vitest';
import { assertReviewedSources, getSource, sourceRegistry } from './sources.js';

const reviewedIds = [
	'T-LANGUAGE-DETECT',
	'T-HARPER',
	'L-EN-COMMON',
	'L-EN-MORE',
	'L-EN-TOP50',
	'L-NO-COMMON',
	'L-NO-ACCENT',
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
	'G-PERF-PARENS',
	'G-HEADER-COLLECTIVE',
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
	'G-TRANSLATIONS',
	'G-STREAMING',
	'G-REVERSED',
	'G-YODELING',
	'G-PLURALS'
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

// Reviewed in the latest sweep. Only the annotations were re-fetched with a
// content hash; `L-NO-ACCENT` arrived with the rule that cites it.
const reviewedToday = new Set<string>([...latestHashes.keys(), 'L-NO-ACCENT']);

// Linked from `G-ADD-SONGS` and never registered until the guidance catalog's
// sourcing pass reached the end of that index, so these four were retrieved
// and mined on the same day.
const sourcedFromIndex = new Set<string>(['G-STREAMING', 'G-REVERSED', 'G-YODELING', 'G-PLURALS']);

function retrievedOn(id: string): string {
	if (sourcedFromIndex.has(id)) {
		return '2026-08-12';
	}
	// The staff forum answer arrived with `performer.collective-identifier`.
	if (id === 'G-HEADER-COLLECTIVE') {
		return '2026-08-10';
	}
	// The editorial parenthetical-formatting reference arrived with the
	// rule↔guideline linking pass.
	if (id === 'G-PERF-PARENS') {
		return '2026-08-17';
	}
	if (reviewedToday.has(id)) {
		return '2026-07-27';
	}
	if (id === 'T-HARPER') {
		return '2026-07-26';
	}
	return id === 'APPLE-LINE-PUNCTUATION' || id.startsWith('L-') ? '2026-07-25' : '2026-07-24';
}

// The guidance catalog's sourcing passes re-read sources without re-fetching
// them, so their verification outruns their retrieval: `G-QE-MARKS` on
// 2026-08-10, `G-SECTIONS` on 2026-08-11 (and on 2026-08-08, when its
// examples corrected `performer.parenthetical-boundary`), and the rest of the
// mined clusters on 2026-08-12 — `G-LANG-HEADERS` confirmed to be only the
// inventory, one annotation per language, seeding no entries of its own.
const guidanceSourcingPass = new Set<string>([
	'G-SECTION-NUMBERING',
	'G-SECTION-HOOK',
	'G-HEADER-COLLECTIVE',
	'G-LANG-HEADERS',
	'G-SPELLING',
	'G-AS-SPOKEN',
	'G-CONTRACTIONS',
	'G-CAPS',
	'G-ADLIBS',
	'G-SFX',
	'G-QUOTES',
	'G-TYPEWRITER',
	'G-DASHES',
	'G-SYMBOLS',
	'G-INSTRUMENTAL',
	'G-LINES',
	'G-REPEATS',
	'G-CENSORED',
	'G-UNKNOWN',
	'G-NUMBERS',
	'G-NON-ENGLISH',
	'G-ROMANIZED',
	'G-TRANSLATIONS',
	'G-LANG-PURPOSE',
	'G-ADD-SONGS',
	...sourcedFromIndex
]);

// The rule↔guideline linking pass of 2026-08-17: the maintainer supplied the
// full text of these pages again, seeding the bracketed-headers,
// header-lyrics-language, immediate-repeat, and unknown-marker entries and
// the two G-ADD-SONGS-context advisories.
const linkingPass = new Set<string>(['G-SECTIONS', 'G-UNKNOWN', 'G-ADD-SONGS']);

function verifiedOn(id: string): string {
	if (linkingPass.has(id)) {
		return '2026-08-17';
	}
	if (id === 'G-QE-MARKS') {
		return '2026-08-10';
	}
	if (guidanceSourcingPass.has(id)) {
		return '2026-08-12';
	}
	return retrievedOn(id);
}

// An annotation with Genius staff among its contributors ranks staff — the
// roster is the approval signal, per the ruling docs/guidelines.md records.
// Every annotation's banner and roster were checked by the maintainer on
// 2026-08-10, in-session; no annotation carried the unreviewed banner.
// G-LANG-PURPOSE joined on 2026-08-12, promoted from editorial when the
// guidance sourcing pass re-checked its roster.
const staffAnnotations = new Set([
	'G-SPELLING',
	'G-SECTIONS',
	'G-QE-MARKS',
	'G-QUOTES',
	'G-SYMBOLS',
	'G-AS-SPOKEN',
	'G-NON-ENGLISH',
	'G-INSTRUMENTAL',
	'G-ROMANIZED',
	'G-TRANSLATIONS',
	'G-NUMBERS',
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
	'G-LANG-EN',
	'G-LANG-ES',
	'G-LANG-PURPOSE',
	'G-STREAMING',
	'G-REVERSED',
	'G-PLURALS'
]);

// Reviewed (no unreviewed banner) with editors and moderators only in the
// roster — no staff. G-LANG-HEADERS is deliberately absent from both sets: it
// is a page, its track is confirmed unbadged, so its own text stays community.
const editorialAnnotations = new Set([
	'G-SECTION-NUMBERING',
	'G-SECTION-HOOK',
	'G-LANG-NO',
	'G-LANG-AR',
	'G-LANG-DE',
	'G-LANG-FR',
	'G-LANG-JA',
	'G-LANG-KO',
	'G-YODELING'
]);

function authorityOf(id: string): string {
	// The venue never decides a tier, the author's rank does — so the staff
	// forum reply (G-HEADER-COLLECTIVE) ranks exactly as staff guide content.
	if (id === 'G-ADD-SONGS' || id === 'G-HEADER-COLLECTIVE' || staffAnnotations.has(id)) {
		return 'staff';
	}
	// An editorial reference image rather than an annotation, so it sits
	// beside the annotation set instead of in it.
	if (id === 'G-PERF-PARENS' || editorialAnnotations.has(id)) {
		return 'editorial';
	}
	return id.startsWith('G-') ? 'community' : 'external';
}

describe('source registry', () => {
	it('contains every reviewed source with exact review dates', () => {
		expect(() => assertReviewedSources(reviewedIds)).not.toThrow();
		for (const id of reviewedIds) {
			expect(getSource(id)).toMatchObject({
				id,
				retrievedAt: retrievedOn(id),
				lastVerifiedAt: verifiedOn(id),
				reviewStatus: 'reviewed',
				authority: authorityOf(id),
				...(latestHashes.has(id) ? { contentHash: latestHashes.get(id) } : {})
			});
		}
	});

	it('contains only the 61 specified source records', () => {
		expect(sourceRegistry.size).toBe(61);
	});
});

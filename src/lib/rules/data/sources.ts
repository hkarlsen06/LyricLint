import type { SourceAuthority, SourceReference } from '$lib/core/types.js';

const reviewedAt = '2026-07-24';
const latestReviewedAt = '2026-07-27';

// `community` is the conservative default: an annotation whose acceptance is
// not recorded claims the lowest Genius-annotation tier, and promotion is
// adding the evidence, never editing the tier alone.
function annotation(
	id: string,
	annotationId: number,
	pageTitle: string,
	sectionTitle: string,
	authority: SourceAuthority = 'community'
): SourceReference {
	return {
		id,
		url: `https://genius.com/${annotationId}`,
		annotationId,
		pageTitle,
		sectionTitle,
		retrievedAt: reviewedAt,
		lastVerifiedAt: reviewedAt,
		reviewStatus: 'reviewed',
		authority
	};
}

const sources: SourceReference[] = [
	{
		id: 'T-LANGUAGE-DETECT',
		url: 'https://github.com/FGRibreau/node-language-detect',
		pageTitle: 'LanguageDetect',
		sectionTitle: 'Local statistical language recognition using bundled text profiles',
		retrievedAt: reviewedAt,
		lastVerifiedAt: reviewedAt,
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'T-HARPER',
		url: 'https://github.com/Automattic/harper',
		pageTitle: 'Harper',
		sectionTitle: 'Version 2.4.0 local English grammar and spelling engine',
		retrievedAt: '2026-07-26',
		lastVerifiedAt: '2026-07-26',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-EN-COMMON',
		url: 'https://www.merriam-webster.com/grammar/commonly-misspelled-words',
		pageTitle: 'Commonly Misspelled Words',
		sectionTitle: 'Frequent English misspellings including definitely and tomorrow',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-EN-MORE',
		url: 'https://www.merriam-webster.com/grammar/more-commonly-misspelled-words/_not-seperate-seprate-seperet_',
		pageTitle: 'More Commonly Misspelled Words',
		sectionTitle: 'Frequent English misspellings including separate and achieve',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-EN-TOP50',
		url: 'https://dictionary.cambridge.org/grammar/british-grammar/spelling-top-50-spelling-mistakes-in-english',
		pageTitle: 'Spelling: Top 50 spelling mistakes in English',
		sectionTitle:
			'High-frequency learner misspellings including definately, freind, untill and recieve',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-NO-COMMON',
		url: 'https://sprakradet.no/arkiv/ord-som-mange-lurer-pa/',
		pageTitle: 'Ord som mange lurer på',
		sectionTitle: 'Frequently searched Bokmål spellings, including dessverre and interessant',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-NO-ACCENT',
		url: 'https://sprakradet.no/godt-og-korrekt-sprak/rettskriving-og-grammatikk/tegn/aksentteikn/',
		pageTitle: 'Aksentteikn',
		sectionTitle:
			'Gravis separates the adverb òg from the conjunction og; the acute accent is wrong here',
		retrievedAt: latestReviewedAt,
		lastVerifiedAt: latestReviewedAt,
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-DE-COMMON',
		url: 'https://www.duden.de/haeufige_fehler',
		pageTitle: 'Häufige Fehler und Falschschreibweisen',
		sectionTitle: 'Common German misspellings, including garnicht and nähmlich',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-ES-CONTRACTIONS',
		url: 'https://www.rae.es/diccionario-estudiante/docs/ortografia.pdf',
		pageTitle: 'Ortografía',
		sectionTitle: 'Contractions al and del, with proper-name exceptions',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-ES-COMMON',
		url: 'https://www.rae.es/sites/default/files/la_tecnologia_al_servicio_de_la_palabra.pdf',
		pageTitle: 'La tecnología al servicio de la palabra',
		sectionTitle: 'Frequent Spanish word-division errors such as sinembargo and porfavor',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-FR-COMMON',
		url: 'https://www.dictionnaire-academie.fr/article/A9C0002',
		pageTitle: 'Ça',
		sectionTitle: 'Demonstrative-pronoun spellings in ça va and comme ça',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-FR-LEXICAL',
		url: 'https://www.projet-voltaire.fr/regles-orthographe/categories/lexical/page/5/',
		pageTitle: 'Questions d’orthographe lexicales',
		sectionTitle: 'Frequent lexical errors including acceuil and parmis',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-FR-DOUBLES',
		url: 'https://vitrinelinguistique.oqlf.gouv.qc.ca/24465/lorthographe/problemes-lies-aux-consonnes/les-erreurs-frequentes-liees-aux-consonnes-doubles',
		pageTitle: 'Les erreurs fréquentes liées aux consonnes doubles',
		sectionTitle: 'Standard spellings with single and doubled consonants',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-AR-COMMON',
		url: 'https://library.ksaa.gov.sa/links/epubs/arabic_child_2.pdf',
		pageTitle: 'لغة الطفل العربي (٢): لغة الطفل في وسائل الإعلام المعاصرة',
		sectionTitle: 'Common phonetic spellings لاكن and هاذا and their standard written forms',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-JA-COMMON',
		url: 'https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gendaikana/honbun_dai2.html',
		pageTitle: '現代仮名遣い 本文 第2',
		sectionTitle: 'Conventional greeting spellings and ずつ',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-KO-WAENJI',
		url: 'https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6103&mn_id=62&pageIndex=207',
		pageTitle: '‘웬지’와 ‘왠지’',
		sectionTitle: 'Standard spelling 왠지',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-KO-ORAENMAN',
		url: 'https://www.korean.go.kr/nkview/news/11/11_3.htm',
		pageTitle: '‘오랜만’과 ‘오랫만’',
		sectionTitle: 'Standard spelling 오랜만',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-KO-SEOLLEM',
		url: 'https://www.korean.go.kr/nkview/nknews/200111/40_9.html',
		pageTitle: '궁금증을 풀어 드립니다',
		sectionTitle: 'Misused 설레이다 forms in popular songs and their standard forms',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-KO-IRIRI',
		url: 'https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6078&mn_id=62&pageIndex=207',
		pageTitle: '‘일일이’와 ‘일일히’',
		sectionTitle: 'Standard spelling 일일이',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'L-KO-COMMON',
		url: 'https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=317387',
		pageTitle: '온라인가나다 맞춤법 문답',
		sectionTitle: 'Standard spellings 됐 and 며칠',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		id: 'G-ADD-SONGS',
		url: 'https://genius.com/Genius-how-to-add-songs-to-genius-annotated',
		pageTitle: 'How to Add Songs to Genius',
		sectionTitle: 'Index of lyric accuracy and formatting guidance',
		retrievedAt: reviewedAt,
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// never-copy sourcing entry; the rest of the page is the index of the
		// annotations mined individually, plus page-cataloging policy —
		// unreleased music, AI-song admission — outside a transcription
		// catalog's scope. Full text supplied and re-read on 2026-08-17 for the
		// rule↔guideline linking pass — its "double-check all spelling" and
		// "clean and concise" asks are the context the standard-orthography and
		// clean-text advisories read from. Staff tier reconfirmed.
		lastVerifiedAt: '2026-08-17',
		reviewStatus: 'reviewed',
		authority: 'staff'
	},
	// Screenshot 2026-08-10: no unreviewed banner, and Genius staff in the
	// contributor roster (accepted by streetlights; Gary, KST, Yessirre) —
	// staff among an annotation's contributors is what lifts it to staff.
	// Re-read in full on 2026-08-12, seeding the guidance catalog's
	// English-variant entry; the preferred-spellings table itself is
	// `spelling.standardized`'s data. Staff tier reconfirmed.
	{
		...annotation(
			'G-SPELLING',
			9298624,
			'Use standardized spellings',
			'Preferred spellings with contextual exceptions',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-08, correcting `performer.parenthetical-boundary`:
		// the guide's own examples keep parentheses outside performer formatting —
		// `(<i>If Young Metro don't trust you…</i>)` — never inside it. Re-read
		// again on 2026-08-11, seeding the guidance catalog's section-headers
		// entries; staff tier reconfirmed. Full text supplied and re-read on
		// 2026-08-17 for the rule↔guideline linking pass, seeding the
		// bracketed-headers, header-lyrics-language, and immediate-repeat
		// entries.
		...annotation(
			'G-SECTIONS',
			9250687,
			'Use song part headers',
			'Section headers, performer legends, and four differentiation styles',
			'staff'
		),
		lastVerifiedAt: '2026-08-17'
	},
	{
		// A Genius editorial reference image supplied by the maintainer on
		// 2026-08-17: performer formatting sits inside a parenthetical's own
		// parentheses, so the parentheses stay plain — which G-SECTIONS' worked
		// examples second (`(<i>If Young Metro don't trust you…</i>)`). An
		// image rather than an annotation, so an object literal, with the
		// author's standing carried by the tier.
		id: 'G-PERF-PARENS',
		url: 'https://filepicker-images.genius.com/246a575f42ff058a461512edd78c9fbdb161475306d75fb6fbe33e34bfce6bc0%2Fijecuzgqan',
		pageTitle: 'Performer formatting and parentheses',
		sectionTitle: 'Editorial reference: parentheses stay outside performer formatting',
		retrievedAt: '2026-08-17',
		lastVerifiedAt: '2026-08-17',
		reviewStatus: 'reviewed',
		authority: 'editorial'
	},
	{
		// A staff reply in a community discussion rather than an accepted
		// annotation: Gary (Genius staff) rules that artist names are always
		// written out and never combined under "Both", "All", etc., and names
		// annotation 9250687 as the staff-approved guideline over the community
		// headers guide.
		// Re-read in full on 2026-08-12: the staff answer also restates the
		// too-many-vocalists recourse (omit the names, annotate over the
		// header), so it seconds the guidance catalog's crowded-headers entry.
		// Staff tier reconfirmed — Gary's reply, in a community discussion.
		id: 'G-HEADER-COLLECTIVE',
		url: 'https://genius.com/discussions/459032-Two-correct-methods-for-identifying-artists-in-section-headers',
		pageTitle: 'Two "Correct" Methods for Identifying Artists in Section Headers',
		sectionTitle: 'Staff answer: artist names are written out, never combined under Both or All',
		retrievedAt: '2026-08-10',
		lastVerifiedAt: '2026-08-12',
		reviewStatus: 'reviewed',
		authority: 'staff'
	},
	// Screenshot 2026-08-10: no unreviewed banner, editor-authored (Pessoa).
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// segue/Parts entry; editorial tier reconfirmed.
		...annotation(
			'G-SECTION-NUMBERING',
			16107272,
			'Song Sections & Headers Guide',
			'Only verses are enumerated; distinct verses use ascending numbers',
			'editorial'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// Hook-by-language entry: the deprecation is scoped to English songs,
		// and some international communities (Germany) still use Hook.
		// Editorial tier reconfirmed.
		...annotation(
			'G-SECTION-HOOK',
			34151858,
			'Song Sections & Headers Guide',
			'Replace the deprecated Hook header with Chorus or Refrain',
			'editorial'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read on 2026-08-12 for the guidance catalog sourcing pass: the page
		// is still only the inventory — one annotation per language, each already
		// registered as its own `G-LANG-*` source feeding a language pack — so it
		// seeds no entries of its own. Its guidance value is being the place to
		// check a language the packs do not cover, which the hook-by-language
		// entry cites it for. Community tier stands: the track is unbadged, and
		// the page's own text is the only thing this source vouches for.
		id: 'G-LANG-HEADERS',
		url: 'https://genius.com/Genius-song-headers-in-different-languages-annotated',
		pageTitle: 'Song Headers in Different Languages',
		sectionTitle: 'Inventory of language-specific header annotations',
		retrievedAt: reviewedAt,
		lastVerifiedAt: '2026-08-12',
		reviewStatus: 'reviewed',
		authority: 'community'
	},
	{
		// Promoted editorial → staff on 2026-08-12: the guidance sourcing pass
		// re-read the annotation — it is the page's own about section — and the
		// maintainer re-checked its roster and ranked it staff. Seeds the
		// foreign-language-headers entry alongside G-LANG-HEADERS.
		...annotation(
			'G-LANG-PURPOSE',
			12709276,
			'Song Headers in Different Languages',
			'Purpose of localized section-header guidance',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	annotation(
		'G-LANG-EN',
		12744609,
		'Song Headers in Different Languages',
		'Reviewed English section-header vocabulary',
		'staff'
	),
	annotation(
		'G-LANG-NO',
		13453292,
		'Song Headers in Different Languages',
		'Reviewed Norwegian section-header vocabulary',
		'editorial'
	),
	annotation(
		'G-LANG-AR',
		12745769,
		'Song Headers in Different Languages',
		'Reviewed Arabic section-header vocabulary',
		'editorial'
	),
	annotation(
		'G-LANG-DE',
		12745292,
		'Song Headers in Different Languages',
		'Reviewed German genre-dependent section-header vocabulary',
		'editorial'
	),
	annotation(
		'G-LANG-ES',
		12744618,
		'Song Headers in Different Languages',
		'Reviewed Spanish section-header vocabulary',
		'staff'
	),
	annotation(
		'G-LANG-FR',
		12745216,
		'Song Headers in Different Languages',
		'Reviewed French section-header vocabulary',
		'editorial'
	),
	annotation(
		'G-LANG-JA',
		13322994,
		'Song Headers in Different Languages',
		'Japanese song pages use English section headers',
		'editorial'
	),
	annotation(
		'G-LANG-KO',
		20378931,
		'Song Headers in Different Languages',
		'English headers for original Korean songs and Hangul headers for translations',
		'editorial'
	),
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's numbers
		// topic — the spelled-out default, the digit exemptions, and the times
		// format; staff tier reconfirmed.
		...annotation(
			'G-NUMBERS',
			15591905,
			'Number spelling',
			'Spell out numbers with exceptions',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		id: 'APPLE-LINE-PUNCTUATION',
		url: 'https://artists.apple.com/support/1111-lyrics-guidelines',
		pageTitle: 'Review guidelines for submitting lyrics',
		sectionTitle: 'No periods or commas at the end of lyric lines',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed',
		authority: 'external'
	},
	{
		// Re-verified 2026-08-10 against a full screenshot of the annotation while
		// seeding the guidance catalog's punctuation entries; the same screenshot
		// shows no "This annotation is unreviewed" banner, which is the
		// editor-reviewed state — every annotation's box reads "Genius
		// Annotation" regardless. Its contributor roster is unexpanded in the
		// screenshot, so whether staff are among its 5 contributors — which is
		// what would lift it to staff — is still unrecorded.
		...annotation(
			'G-QE-MARKS',
			15593987,
			'Question and exclamation marks',
			'Punctuation for questions and exclamations',
			'staff'
		),
		lastVerifiedAt: '2026-08-10'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// scatting/stutter entry; the em-dash claims are
		// `punctuation.dropped-word-dash`'s own. Staff tier reconfirmed.
		...annotation(
			'G-DASHES',
			15594027,
			'Hyphens and em dashes',
			'Dropped words and punctuation around em dashes',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// capitalization entries; staff tier reconfirmed.
		...annotation(
			'G-CAPS',
			15545679,
			'Conventional capitalization',
			'Lyric-line capitalization with contextual exceptions',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12: the whole claim — [?] for a missing
		// lyric, brackets never parentheses — is checked outright by
		// `unknown.marker` and `unknown.improvised-marker`. Full text supplied
		// and re-read on 2026-08-17 for the rule↔guideline linking pass, which
		// reversed the seeds-no-entry call: the catalog states conventions the
		// linter checks whole now, so it seeds the unknown-marker entry. Staff
		// tier reconfirmed.
		...annotation(
			'G-UNKNOWN',
			9303373,
			'Unknown lyric marker',
			'Use [?] for unknown lyrics',
			'staff'
		),
		lastVerifiedAt: '2026-08-17'
	},
	{
		// Re-read in full on 2026-08-12, seconding the guidance catalog's
		// elision-apostrophe entry; staff tier reconfirmed.
		...annotation(
			'G-CONTRACTIONS',
			9290803,
			'Contraction apostrophes',
			'Write apostrophes in clear contractions',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12: the whole claim is the glyph form,
		// which `quotes.typewriter` checks outright, so it seeds no guidance
		// entry. Staff tier reconfirmed.
		...annotation(
			'G-TYPEWRITER',
			11293005,
			'Typewriter quotes',
			'Use straight apostrophes and quotation marks',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's ad-libs
		// entries; staff tier reconfirmed.
		...annotation('G-ADLIBS', 9257397, 'Ad-libs', 'Parenthesize and capitalize ad-libs', 'staff'),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// repeats-in-full entry; staff tier reconfirmed.
		...annotation(
			'G-REPEATS',
			9290098,
			'Repeated sections',
			'Transcribe repeated lyrics instead of placeholders',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// line-format entries; staff tier reconfirmed.
		...annotation(
			'G-LINES',
			9257393,
			'Individual lyric lines',
			'Split prose-like transcription into lyric lines',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// vocalized-sound entry; staff tier reconfirmed.
		...annotation(
			'G-SFX',
			14949930,
			'Sound effects',
			'Use asterisks rather than braces for sound effects',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// censored-word entries — the explicit-version preference included;
		// staff tier reconfirmed.
		...annotation(
			'G-CENSORED',
			15237597,
			'Censored words',
			'Use four asterisks for a censored word',
			'staff'
		),
		lastVerifiedAt: '2026-08-12'
	},
	{
		...annotation(
			'G-QUOTES',
			15594059,
			'Quotation marks',
			'When lyric text uses quotation marks',
			'staff'
		),
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// quotation-usage entry; staff tier reconfirmed.
		retrievedAt: latestReviewedAt,
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:af782896da241613e8c43f818e1e29cbd10c737dd3a25085ecdff4f9b85ec49b'
	},
	{
		...annotation(
			'G-SYMBOLS',
			30242624,
			'Symbols and special characters',
			'Omit trademark and decorative symbols; spell out ampersands and degrees outside brands',
			'staff'
		),
		// Re-read in full on 2026-08-12, seconding the guidance catalog's
		// brand-stylization entry; staff tier reconfirmed.
		retrievedAt: latestReviewedAt,
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:264d9996c30fe27b2d8d51591a3fdf4a26c16569a1ab5849cd48c30449e9f601'
	},
	{
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// as-pronounced and readability-limit entries; staff tier reconfirmed.
		...annotation(
			'G-AS-SPOKEN',
			12332255,
			'Transcribe as spoken',
			'Reflect distinct pronunciation unless a phonetic spelling harms comprehension',
			'staff'
		),
		retrievedAt: latestReviewedAt,
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:961751d472f6b006e7c23640f99f18d5f81255f3cec22faf002648b0e648e092'
	},
	{
		...annotation(
			'G-NON-ENGLISH',
			11893156,
			'Non-English song header',
			'Optional bracketed title header for non-English songs',
			'staff'
		),
		retrievedAt: latestReviewedAt,
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// lyrics-header entry; staff tier reconfirmed.
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:23f3b830f5078af165503b09bc9e7775a3b4e5623260b3ac1648c2c25d6ae8f1'
	},
	{
		...annotation(
			'G-INSTRUMENTAL',
			16427849,
			'Instrumental songs',
			'Use [Instrumental] as the lyric text for an instrumental track page',
			'staff'
		),
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// instrumental-page entry; staff tier reconfirmed.
		retrievedAt: latestReviewedAt,
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:27f047b0a1ab7f56e8cbf9ef46ea08c1441e843f66f41e569afefb2874e55350'
	},
	{
		...annotation(
			'G-ROMANIZED',
			14835335,
			'Romanized lyrics',
			'Host romanized lyrics on a separate page',
			'staff'
		),
		retrievedAt: latestReviewedAt,
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// romanized-separate entry; staff tier reconfirmed.
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:fc82a5078321719e14a6efda974655d32f6d14027547baa53e2d6d9b7979373a'
	},
	{
		...annotation(
			'G-TRANSLATIONS',
			14949891,
			'Translations',
			'Host lyric translations on a separate page',
			'staff'
		),
		retrievedAt: latestReviewedAt,
		// Re-read in full on 2026-08-12, seeding the guidance catalog's
		// translations-separate entry; staff tier reconfirmed.
		lastVerifiedAt: '2026-08-12',
		contentHash: 'sha256:df8d1a410fbcbf88f912a5d030553840a6145383649e4d194c2bb8dc453fa4eb'
	},
	// The four annotations linked from G-ADD-SONGS that had no record of their
	// own, retrieved and mined on 2026-08-12 during the guidance catalog's
	// sourcing pass; the maintainer supplied each annotation's text and rank.
	{
		// Seeds the streaming-version sourcing entry.
		...annotation(
			'G-STREAMING',
			14949792,
			'Streaming version',
			'The lyric page follows the streaming version',
			'staff'
		),
		retrievedAt: '2026-08-12',
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Seeds the reversed-vocals entry.
		...annotation(
			'G-REVERSED',
			14913125,
			'Reversed lyrics',
			'Type reversed vocals as they sound',
			'staff'
		),
		retrievedAt: '2026-08-12',
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Seeds the yodeling-and-scatting entry. Editor-reviewed with no staff
		// contributors (editorial tier).
		...annotation(
			'G-YODELING',
			16912129,
			'Yodeling and scatting',
			'Dash yodel and scat syllables, with bracketed fallbacks',
			'editorial'
		),
		retrievedAt: '2026-08-12',
		lastVerifiedAt: '2026-08-12'
	},
	{
		// Seeds the letter-plurals entry.
		...annotation(
			'G-PLURALS',
			33314316,
			'Pluralizing letters',
			'Apostrophe-s for a single letter, bare s for longer',
			'staff'
		),
		retrievedAt: '2026-08-12',
		lastVerifiedAt: '2026-08-12'
	}
];

/** Bundled source metadata keyed by its stable source ID. */
export const sourceRegistry: ReadonlyMap<string, SourceReference> = new Map(
	sources.map((source) => [source.id, source])
);

export function getSource(id: string): SourceReference | undefined {
	return sourceRegistry.get(id);
}

/** Throw when any requested source is missing or has not completed human review. */
export function assertReviewedSources(
	sourceIds: readonly string[],
	registry: ReadonlyMap<string, SourceReference> = sourceRegistry
): void {
	for (const sourceId of sourceIds) {
		const source = registry.get(sourceId);
		if (!source) {
			throw new Error(`Unknown source ID: ${sourceId}`);
		}
		if (source.reviewStatus !== 'reviewed') {
			throw new Error(`Source ${sourceId} is not reviewed (status: ${source.reviewStatus})`);
		}
	}
}

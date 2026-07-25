import type { SourceReference } from '$lib/core/types.js';

const reviewedAt = '2026-07-24';

function annotation(
	id: string,
	annotationId: number,
	pageTitle: string,
	sectionTitle: string,
	reviewStatus: SourceReference['reviewStatus'] = 'reviewed'
): SourceReference {
	return {
		id,
		url: `https://genius.com/${annotationId}`,
		annotationId,
		pageTitle,
		sectionTitle,
		retrievedAt: reviewedAt,
		lastVerifiedAt: reviewedAt,
		reviewStatus
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
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-EN-COMMON',
		url: 'https://www.merriam-webster.com/grammar/commonly-misspelled-words',
		pageTitle: 'Commonly Misspelled Words',
		sectionTitle: 'Frequent English misspellings including definitely and tomorrow',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-EN-MORE',
		url: 'https://www.merriam-webster.com/grammar/more-commonly-misspelled-words/_not-seperate-seprate-seperet_',
		pageTitle: 'More Commonly Misspelled Words',
		sectionTitle: 'Frequent English misspellings including separate and achieve',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-EN-TOP50',
		url: 'https://dictionary.cambridge.org/grammar/british-grammar/spelling-top-50-spelling-mistakes-in-english',
		pageTitle: 'Spelling: Top 50 spelling mistakes in English',
		sectionTitle:
			'High-frequency learner misspellings including definately, freind, untill and recieve',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-NO-COMMON',
		url: 'https://sprakradet.no/arkiv/ord-som-mange-lurer-pa/',
		pageTitle: 'Ord som mange lurer på',
		sectionTitle: 'Frequently searched Bokmål spellings, including dessverre and interessant',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-DE-COMMON',
		url: 'https://www.duden.de/haeufige_fehler',
		pageTitle: 'Häufige Fehler und Falschschreibweisen',
		sectionTitle: 'Common German misspellings, including garnicht and nähmlich',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-ES-CONTRACTIONS',
		url: 'https://www.rae.es/diccionario-estudiante/docs/ortografia.pdf',
		pageTitle: 'Ortografía',
		sectionTitle: 'Contractions al and del, with proper-name exceptions',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-ES-COMMON',
		url: 'https://www.rae.es/sites/default/files/la_tecnologia_al_servicio_de_la_palabra.pdf',
		pageTitle: 'La tecnología al servicio de la palabra',
		sectionTitle: 'Frequent Spanish word-division errors such as sinembargo and porfavor',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-FR-COMMON',
		url: 'https://www.dictionnaire-academie.fr/article/A9C0002',
		pageTitle: 'Ça',
		sectionTitle: 'Demonstrative-pronoun spellings in ça va and comme ça',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-FR-LEXICAL',
		url: 'https://www.projet-voltaire.fr/regles-orthographe/categories/lexical/page/5/',
		pageTitle: 'Questions d’orthographe lexicales',
		sectionTitle: 'Frequent lexical errors including acceuil and parmis',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-FR-DOUBLES',
		url: 'https://vitrinelinguistique.oqlf.gouv.qc.ca/24465/lorthographe/problemes-lies-aux-consonnes/les-erreurs-frequentes-liees-aux-consonnes-doubles',
		pageTitle: 'Les erreurs fréquentes liées aux consonnes doubles',
		sectionTitle: 'Standard spellings with single and doubled consonants',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-AR-COMMON',
		url: 'https://library.ksaa.gov.sa/links/epubs/arabic_child_2.pdf',
		pageTitle: 'لغة الطفل العربي (٢): لغة الطفل في وسائل الإعلام المعاصرة',
		sectionTitle: 'Common phonetic spellings لاكن and هاذا and their standard written forms',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-JA-COMMON',
		url: 'https://www.bunka.go.jp/kokugo_nihongo/sisaku/joho/joho/kijun/naikaku/gendaikana/honbun_dai2.html',
		pageTitle: '現代仮名遣い 本文 第2',
		sectionTitle: 'Conventional greeting spellings and ずつ',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-KO-WAENJI',
		url: 'https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6103&mn_id=62&pageIndex=207',
		pageTitle: '‘웬지’와 ‘왠지’',
		sectionTitle: 'Standard spelling 왠지',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-KO-ORAENMAN',
		url: 'https://www.korean.go.kr/nkview/news/11/11_3.htm',
		pageTitle: '‘오랜만’과 ‘오랫만’',
		sectionTitle: 'Standard spelling 오랜만',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-KO-SEOLLEM',
		url: 'https://www.korean.go.kr/nkview/nknews/200111/40_9.html',
		pageTitle: '궁금증을 풀어 드립니다',
		sectionTitle: 'Misused 설레이다 forms in popular songs and their standard forms',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-KO-IRIRI',
		url: 'https://www.korean.go.kr/front/mcfaq/mcfaqView.do?mcfaq_seq=6078&mn_id=62&pageIndex=207',
		pageTitle: '‘일일이’와 ‘일일히’',
		sectionTitle: 'Standard spelling 일일이',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'L-KO-COMMON',
		url: 'https://www.korean.go.kr/front/onlineQna/onlineQnaView.do?mn_id=216&pageIndex=1&qna_seq=317387',
		pageTitle: '온라인가나다 맞춤법 문답',
		sectionTitle: 'Standard spellings 됐 and 며칠',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		id: 'G-ADD-SONGS',
		url: 'https://genius.com/Genius-how-to-add-songs-to-genius-annotated',
		pageTitle: 'How to Add Songs to Genius',
		sectionTitle: 'Index of lyric accuracy and formatting guidance',
		retrievedAt: reviewedAt,
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	annotation(
		'G-SPELLING',
		9298624,
		'Use standardized spellings',
		'Preferred spellings with contextual exceptions'
	),
	annotation(
		'G-SECTIONS',
		9250687,
		'Use song part headers',
		'Section headers, performer legends, and four differentiation styles'
	),
	annotation(
		'G-SECTION-NUMBERING',
		16107272,
		'Song Sections & Headers Guide',
		'Only verses are enumerated; distinct verses use ascending numbers'
	),
	annotation(
		'G-SECTION-HOOK',
		34151858,
		'Song Sections & Headers Guide',
		'Replace the deprecated Hook header with Chorus or Refrain'
	),
	{
		id: 'G-LANG-HEADERS',
		url: 'https://genius.com/Genius-song-headers-in-different-languages-annotated',
		pageTitle: 'Song Headers in Different Languages',
		sectionTitle: 'Inventory of language-specific header annotations',
		retrievedAt: reviewedAt,
		lastVerifiedAt: reviewedAt,
		reviewStatus: 'reviewed'
	},
	annotation(
		'G-LANG-PURPOSE',
		12709276,
		'Song Headers in Different Languages',
		'Purpose of localized section-header guidance'
	),
	annotation(
		'G-LANG-EN',
		12744609,
		'Song Headers in Different Languages',
		'Reviewed English section-header vocabulary'
	),
	annotation(
		'G-LANG-NO',
		13453292,
		'Song Headers in Different Languages',
		'Reviewed Norwegian section-header vocabulary'
	),
	annotation(
		'G-LANG-AR',
		12745769,
		'Song Headers in Different Languages',
		'Reviewed Arabic section-header vocabulary'
	),
	annotation(
		'G-LANG-DE',
		12745292,
		'Song Headers in Different Languages',
		'Reviewed German genre-dependent section-header vocabulary'
	),
	annotation(
		'G-LANG-ES',
		12744618,
		'Song Headers in Different Languages',
		'Reviewed Spanish section-header vocabulary'
	),
	annotation(
		'G-LANG-FR',
		12745216,
		'Song Headers in Different Languages',
		'Reviewed French section-header vocabulary'
	),
	annotation(
		'G-LANG-JA',
		13322994,
		'Song Headers in Different Languages',
		'Japanese song pages use English section headers'
	),
	annotation(
		'G-LANG-KO',
		20378931,
		'Song Headers in Different Languages',
		'English headers for original Korean songs and Hangul headers for translations'
	),
	annotation('G-NUMBERS', 15591905, 'Number spelling', 'Spell out numbers with exceptions'),
	{
		id: 'APPLE-LINE-PUNCTUATION',
		url: 'https://artists.apple.com/support/1111-lyrics-guidelines',
		pageTitle: 'Review guidelines for submitting lyrics',
		sectionTitle: 'No periods or commas at the end of lyric lines',
		retrievedAt: '2026-07-25',
		lastVerifiedAt: '2026-07-25',
		reviewStatus: 'reviewed'
	},
	{
		...annotation(
			'G-QE-MARKS',
			15593987,
			'Question and exclamation marks',
			'Punctuation for questions and exclamations'
		),
		lastVerifiedAt: '2026-07-25'
	},
	annotation(
		'G-DASHES',
		15594027,
		'Hyphens and em dashes',
		'Dropped words and punctuation around em dashes'
	),
	annotation(
		'G-CAPS',
		15545679,
		'Conventional capitalization',
		'Lyric-line capitalization with contextual exceptions'
	),
	annotation('G-UNKNOWN', 9303373, 'Unknown lyric marker', 'Use [?] for unknown lyrics'),
	annotation(
		'G-CONTRACTIONS',
		9290803,
		'Contraction apostrophes',
		'Write apostrophes in clear contractions'
	),
	annotation(
		'G-TYPEWRITER',
		11293005,
		'Typewriter quotes',
		'Use straight apostrophes and quotation marks'
	),
	annotation('G-ADLIBS', 9257397, 'Ad-libs', 'Parenthesize and capitalize ad-libs'),
	annotation(
		'G-REPEATS',
		9290098,
		'Repeated sections',
		'Transcribe repeated lyrics instead of placeholders'
	),
	annotation(
		'G-LINES',
		9257393,
		'Individual lyric lines',
		'Split prose-like transcription into lyric lines'
	),
	annotation(
		'G-SFX',
		14949930,
		'Sound effects',
		'Use asterisks rather than braces for sound effects'
	),
	annotation('G-CENSORED', 15237597, 'Censored words', 'Use four asterisks for a censored word'),
	annotation('G-QUOTES', 15594059, 'Quotation marks', 'Quotation style candidate', 'needs-review'),
	annotation(
		'G-SYMBOLS',
		30242624,
		'Symbols and special characters',
		'Symbol usage candidate',
		'needs-review'
	),
	annotation(
		'G-AS-SPOKEN',
		12332255,
		'Transcribe as spoken',
		'Pronunciation-based transcription candidate',
		'needs-review'
	),
	annotation(
		'G-NON-ENGLISH',
		11893156,
		'Non-English song header',
		'Non-English title-header candidate',
		'needs-review'
	),
	annotation(
		'G-INSTRUMENTAL',
		16427849,
		'Instrumental songs',
		'Instrumental-page tag candidate',
		'needs-review'
	)
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

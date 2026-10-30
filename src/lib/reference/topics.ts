/**
 * Shared reader-facing topics; rule families remain internal to the exhaustive catalog.
 * `preview` is what the directory row shows beneath the title so a reader recognizes the
 * topic by its forms: exact excerpts of a guidance entry's example or quoted forms, or a
 * preferred standardized spelling, each named by `source` and checked in `topics.test.ts`.
 */
export const referenceTopics = [
	{
		id: 'section-headers',
		title: 'Section headers and performers',
		question: 'How do I label song sections and credit different singers?',
		preview: [{ text: '[Verse 1: Avery]', source: 'guidance.section-headers.artist-identifiers' }]
	},
	{
		id: 'spelling',
		title: 'Spelling and contractions',
		question: 'How should I spell this word?',
		preview: [
			{ text: 'okay', source: 'spelling.standardized' },
			{ text: "ballin'", source: 'guidance.spelling.elision-apostrophe' }
		]
	},
	{
		id: 'ad-libs',
		title: 'Ad-libs and sound effects',
		question: 'How do I write ad-libs and sound effects?',
		preview: [
			{ text: '(Skrrt)', source: 'guidance.ad-libs.include-every' },
			{ text: '*cash register*', source: 'guidance.ad-libs.vocalized-sounds' }
		]
	},
	{
		id: 'censored-unknown',
		title: 'Censored and unknown words',
		question: 'What if I cannot hear a word?',
		preview: [
			{ text: '****', source: 'guidance.censored-unknown.four-asterisks' },
			{ text: '[?]', source: 'guidance.censored-unknown.unknown-marker' }
		]
	},
	{
		id: 'lines',
		title: 'Lines and repeats',
		question: 'Where do I break lines or repeat a chorus?',
		preview: [{ text: 'Hold on tight\nWe ride tonight', source: 'guidance.lines.immediate-repeat' }]
	},
	{
		id: 'punctuation',
		title: 'Punctuation and symbols',
		question: 'Which punctuation belongs in lyrics?',
		preview: [
			{ text: 'Turn it up!', source: 'guidance.punctuation.doubled-exclamation' },
			{ text: "D-d-don't", source: 'guidance.punctuation.performance-hyphens' }
		]
	},
	{
		id: 'capitalization',
		title: 'Capitalization',
		question: 'Which words need capital letters?',
		preview: [
			{ text: 'God', source: 'guidance.capitalization.conventional-only' },
			{ text: 'West Coast', source: 'guidance.capitalization.conventional-only' }
		]
	},
	{
		id: 'numbers',
		title: 'Numbers',
		question: 'Should I use digits or spell out a number?',
		preview: [
			{ text: 'five', source: 'guidance.numbers.spelled-out' },
			{ text: '24/7', source: 'guidance.numbers.digit-exemptions' }
		]
	},
	{
		id: 'non-english',
		title: 'Non-English songs',
		question: 'How do I transcribe other languages?',
		preview: [
			{ text: '[Letra de "Golondrina" ft. Avery]', source: 'guidance.non-english.lyrics-header' }
		]
	},
	{
		id: 'sourcing',
		title: 'Sourcing lyrics',
		question: 'Which lyric sources can I trust?',
		preview: [{ text: 'Golondrina (Video Version)', source: 'guidance.sourcing.streaming-version' }]
	}
] as const;

export type ReferenceTopic = (typeof referenceTopics)[number]['id'];
const ruleTopics = {
	section: 'section-headers',
	performer: 'section-headers',
	syntax: 'section-headers',
	spelling: 'spelling',
	contraction: 'spelling',
	grammar: 'spelling',
	adlib: 'ad-libs',
	'sound-effect': 'ad-libs',
	unknown: 'censored-unknown',
	censored: 'censored-unknown',
	line: 'lines',
	repeat: 'lines',
	text: 'lines',
	punctuation: 'punctuation',
	quotes: 'punctuation',
	symbols: 'punctuation',
	capitalization: 'capitalization',
	numbers: 'numbers',
	language: 'non-english'
} satisfies Record<string, ReferenceTopic>;
export function referenceTopicForRule(group: string): ReferenceTopic {
	const topic = Object.entries(ruleTopics).find(([family]) => family === group)?.[1];
	if (!topic) throw new Error(`No shared reference topic for rule group "${group}"`);
	return topic;
}

/** Preserve old rule-family bookmarks using the same mapping that places checks in topics. */
export function referenceTopicAnchors(topic: ReferenceTopic): string[] {
	return [
		...new Set([
			topic,
			...Object.entries(ruleTopics)
				.filter(([, owner]) => owner === topic)
				.map(([family]) => family)
		])
	];
}

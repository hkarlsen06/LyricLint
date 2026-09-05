/** Shared reader-facing topics; rule families remain internal to the exhaustive catalog. */
export const referenceTopics = [
	{
		id: 'section-headers',
		title: 'Section headers and performers',
		question: 'How do I label song sections and credit different singers?'
	},
	{
		id: 'spelling',
		title: 'Spelling and contractions',
		question: 'How should I spell this word?'
	},
	{
		id: 'ad-libs',
		title: 'Ad-libs and backing vocals',
		question: 'How do I write backing vocals and sound effects?'
	},
	{
		id: 'censored-unknown',
		title: 'Censored and unknown words',
		question: 'What if I cannot hear a word?'
	},
	{
		id: 'lines',
		title: 'Lines and repeats',
		question: 'Where do I break lines or repeat a chorus?'
	},
	{
		id: 'punctuation',
		title: 'Punctuation and symbols',
		question: 'Which punctuation belongs in lyrics?'
	},
	{
		id: 'capitalization',
		title: 'Capitalization',
		question: 'Which words need capital letters?'
	},
	{
		id: 'numbers',
		title: 'Numbers',
		question: 'Should I use digits or spell out a number?'
	},
	{
		id: 'non-english',
		title: 'Non-English songs',
		question: 'How do I transcribe other languages?'
	},
	{
		id: 'sourcing',
		title: 'Sourcing lyrics',
		question: 'Which lyric sources can I trust?'
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

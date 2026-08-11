/**
 * The guidance entries, one checkable claim each. Statements are LyricLint's
 * own paraphrases; examples are invented, because anything shipped here is
 * quoted permanently and a real transcription's lyrics must never be.
 *
 * Every entry's authority is the highest tier among its cited sources —
 * claimed here, enforced in `guidance.test.ts` — so promoting an entry means
 * adding the confirming higher-tier source, which is the audit trail.
 */
import type { GuidanceEntry } from './guidance.js';

export const guidanceEntries: readonly GuidanceEntry[] = [
	{
		id: 'guidance.punctuation.unmarked-question',
		topic: 'punctuation',
		title: 'Questions always end with a question mark',
		statement:
			'Every question ends with a question mark, even though lyric lines never take terminal periods or commas.',
		example: { correct: 'Where do we go from here?', incorrect: 'Where do we go from here' },
		authority: 'staff',
		sourceIds: ['G-QE-MARKS'],
		relatedRuleIds: ['punctuation.question', 'punctuation.line-ending'],
		note: 'The linter flags only openings that are unmistakably interrogative; whether the rest of a sung line asks a question is a judgment about delivery that only the transcriber can make.'
	},
	{
		id: 'guidance.punctuation.exclamation-restraint',
		topic: 'punctuation',
		title: 'Exclamation marks only mark excitement',
		statement:
			'An exclamation mark records excitement in the delivery; a line performed without it does not take one.',
		authority: 'staff',
		sourceIds: ['G-QE-MARKS']
	},
	{
		id: 'guidance.punctuation.doubled-exclamation',
		topic: 'punctuation',
		title: 'One exclamation mark at a time',
		statement:
			'Doubled exclamation marks are never kept: where several arrive in a row, all but one are removed.',
		example: { correct: 'Turn it up!', incorrect: 'Turn it up!!' },
		authority: 'staff',
		sourceIds: ['G-QE-MARKS'],
		note: 'Mechanically checkable, so a candidate to graduate into a linter rule — at which point this entry retires in its favor.'
	},
	{
		id: 'guidance.punctuation.brand-name-marks',
		topic: 'punctuation',
		title: "Never double a brand name's own mark",
		statement:
			"A line that would take a question or exclamation mark of its own — from its grammatical structure or its apparent excitement — and ends on a brand name already carrying one (Guess Who?, Yahoo!, Chips Ahoy!) does not take a second: the name's single mark holds for the line.",
		example: {
			correct: 'Have you ever played Guess Who?',
			incorrect: 'Have you ever played Guess Who??'
		},
		authority: 'staff',
		sourceIds: ['G-QE-MARKS']
	}
];

/** Guidance entries keyed by their stable ids. */
export const guidanceRegistry: ReadonlyMap<string, GuidanceEntry> = new Map(
	guidanceEntries.map((entry) => [entry.id, entry])
);

/** The topics that actually have entries, in declaration order, with theirs. */
export function guidanceTopics(): Array<{
	topic: GuidanceEntry['topic'];
	entries: GuidanceEntry[];
}> {
	const topics = new Map<GuidanceEntry['topic'], GuidanceEntry[]>();
	for (const entry of guidanceEntries) {
		const list = topics.get(entry.topic);
		if (list) {
			list.push(entry);
		} else {
			topics.set(entry.topic, [entry]);
		}
	}
	return [...topics.entries()].map(([topic, entries]) => ({ topic, entries }));
}

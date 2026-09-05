// Decision record: docs/subsystems/reference.md
/** Editorial query vocabulary belongs to the convention that answers it, never every row in a topic. */
const intents = [
	{
		id: 'guidance.section-headers.artist-identifiers',
		aliases: [
			'two singers',
			'duet',
			'multiple performers',
			'multiple singers',
			'different singers',
			'artist names',
			'credit performers',
			'credit singers',
			'voices'
		]
	},
	{
		id: 'guidance.section-headers.bracketed-headers',
		aliases: ['song sections', 'label sections', 'song part names']
	},
	{
		id: 'guidance.section-headers.parenthetical-formatting',
		aliases: ['backing vocals', 'background vocals', 'write backing vocals']
	},
	{ id: 'guidance.ad-libs.include-every', aliases: ['adlibs', 'ad libs', 'write adlibs'] },
	{ id: 'guidance.ad-libs.vocalized-sounds', aliases: ['sound effects'] },
	{
		id: 'guidance.censored-unknown.unknown-marker',
		aliases: [
			'cannot hear a word',
			"can't hear a word",
			'cannot hear',
			"can't hear",
			'inaudible',
			'unclear words',
			'missing words'
		]
	},
	{
		id: 'guidance.censored-unknown.four-asterisks',
		aliases: ['bleep', 'censorship', 'censored words']
	},
	{ id: 'standardized-spellings', aliases: ['spell', 'misspelled', 'typo', 'slang'] },
	{ id: 'spelling.texting-shorthand', aliases: ['texting', 'text speak'] },
	{ id: 'guidance.spelling.elision-apostrophe', aliases: ['apostrophe', 'omitted letters'] },
	{ id: 'guidance.lines.bar-per-line', aliases: ['line breaks', 'break lines'] },
	{ id: 'guidance.lines.repeats-in-full', aliases: ['repeat chorus', 'copy chorus'] },
	{ id: 'guidance.lines.clean-text', aliases: ['spacing', 'extra spaces'] },
	{ id: 'guidance.section-headers.blank-line-spacing', aliases: ['blank lines'] },
	{ id: 'guidance.punctuation.unmarked-question', aliases: ['question marks'] },
	{ id: 'guidance.punctuation.quotation-usage', aliases: ['quotation marks', 'quotes'] },
	{
		id: 'guidance.capitalization.conventional-only',
		aliases: ['capital letters', 'uppercase', 'lowercase']
	},
	{ id: 'guidance.numbers.spelled-out', aliases: ['digits', 'numerals'] },
	{ id: 'guidance.numbers.digit-exemptions', aliases: ['dates', 'years'] },
	{
		id: 'language.selection-mismatch',
		aliases: ['foreign language', 'languages', 'language pack']
	},
	{ id: 'guidance.non-english.translations-separate', aliases: ['translation'] },
	{ id: 'guidance.sourcing.never-copy', aliases: ['official lyrics', 'sources'] },
	{ id: 'guidance.sourcing.streaming-version', aliases: ['recording', 'listen'] }
];

export function referenceAliases(id: string): string[] {
	return intents.find((intent) => intent.id === id)?.aliases ?? [];
}

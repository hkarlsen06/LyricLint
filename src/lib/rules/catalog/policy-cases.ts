/**
 * One reviewed example triple per enabled rule: text the rule must flag, text
 * it must accept, and text close enough to the line that flagging it would be
 * a false positive.
 *
 * Two consumers keep each other honest. `catalog-policy.test.ts` runs every
 * case against its rule, so an example that stops tripping (or starts
 * over-tripping) fails CI. `reference.ts` derives the public rule pages from
 * the same cases — the `invalid` example is what produces each page's message,
 * explanation, and fix label. Splitting the data would let the published
 * example drift from the tested one, which is exactly the drift the reference
 * exists to rule out.
 */
export interface RulePolicyCase {
	id: string;
	/**
	 * What the rule is called in front of a reader, and the one thing here that
	 * is written rather than derived.
	 *
	 * Everything else a reference page says comes from running the rule, and that
	 * is the right default — a hand-written copy of an explanation would drift
	 * from the rule inside a release. A title is the exception because there is
	 * nothing to copy: a rule has no name of its own, and the two candidates for
	 * standing in for one both fail. The diagnostic `message` is written about
	 * the occurrence in front of the reader (“«definately» is a common English
	 * spelling error”), so a list of fifty-two of them reads as a dump of linter
	 * output rather than as a reference; and `ruleName()`'s derived form reads as
	 * the ID it is built from (“Spelling: english common”).
	 *
	 * It lives on the policy case rather than in a map of its own so that the
	 * type is what enforces it: a rule ships with a reviewed example or it does
	 * not ship, and now the same object is where its name has to be. A map keyed
	 * by ID would let a new rule arrive with no title and fall back to something.
	 *
	 * It names the convention, not the example — a reader scanning the index is
	 * looking for the rule, and the message is on the row underneath saying what
	 * the linter will actually tell them. `reference.test.ts` pins that they are
	 * distinct, unique, and short enough to stay one line in the index.
	 */
	title: string;
	invalid: string;
	valid: string;
	ambiguous: string;
	language?: string;
	performers?: string[];
}

export const policyCases: readonly RulePolicyCase[] = [
	{
		id: 'syntax.unbalanced-brackets',
		title: 'Close every section header bracket',
		invalid: '[Verse\nLine',
		valid: '[Verse]\nLine',
		ambiguous: '[Verse]\nA bracket [ in a lyric'
	},
	{
		id: 'syntax.unsupported-voice-markup',
		title: 'Only italic and bold performer markup',
		invalid: '[Verse]\n<u>Voice</u>',
		valid: '[Verse: A & <i>B</i>]\n<i>Voice</i>',
		ambiguous: '[Verse]\nAT&T'
	},
	{
		id: 'language.selection-mismatch',
		title: 'The selected language matches the lyrics',
		invalid: '[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir',
		valid:
			'[Verse]\nI see the morning light through every shadow\nAnd I know that you will stay with me tonight',
		ambiguous: '[Verse]\nOh yeah'
	},
	{
		id: 'section.header-missing',
		title: 'Every song part has a header',
		invalid: 'A lyric',
		valid: '[Verse]\nA lyric',
		ambiguous: '   '
	},
	{
		id: 'section.header-prose',
		title: 'Song part names go in brackets',
		invalid: 'Verse 1:\nA lyric',
		valid: '[Verse 1]\nA lyric',
		// A one-word lyric that happens to name a song part, with none of the
		// three marks a written-out label carries.
		ambiguous: '[Verse]\nChorus'
	},
	{
		id: 'text.invisible-characters',
		title: 'No invisible or trailing whitespace',
		invalid: '[Verse]\nA lyric ',
		valid: '[Verse]\nA lyric',
		// A right-to-left mark is invisible and deliberately preserved.
		ambiguous: `[Verse]\nA lyric${String.fromCodePoint(0x200f)}`
	},
	{
		id: 'text.multiple-spaces',
		title: 'One space between words',
		invalid: '[Verse]\nTwo  words',
		valid: '[Verse]\nTwo words',
		ambiguous: '[Verse]\n  An indented line'
	},
	{
		id: 'section.header-spacing',
		title: 'A blank line before a header',
		invalid: '[Verse]\nFirst\n[Chorus]\nSecond',
		valid: '[Verse]\nFirst\n\n[Chorus]\nSecond',
		ambiguous: '[Chorus]\nAgain\n[Chorus]\nAgain'
	},
	{
		id: 'section.deprecated-hook',
		title: '[Hook] is deprecated',
		invalid: '[Hook]\nSing it',
		valid: '[Chorus]\nSing it',
		ambiguous: '[Verse]\nHook me with the melody'
	},
	{
		id: 'section.immediate-repeat-spacing',
		title: 'One header for an immediate repeat',
		invalid: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTonight',
		valid: '[Chorus]\nAgain\nTonight\nAgain\nTonight',
		ambiguous: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTomorrow'
	},
	{
		id: 'section.unlinked-repeat',
		title: 'Link repeated song parts',
		invalid: '[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nHold the line',
		// A song part sung once. Two copies that *differ* used to be the valid case
		// here, and are now a finding: linking keeps whatever the copies disagree
		// on, so there is nothing left for the suggestion to endanger and no reason
		// for it to stay quiet on the shape it was quietest about.
		valid: '[Chorus]\nHold the line\n\n[Verse 1]\nA lyric',
		// Two identical choruses with nothing between them belong under one
		// header, which is `section.immediate-repeat-spacing`'s finding rather
		// than this one.
		ambiguous: '[Chorus]\nHold the line\n\n[Chorus]\nHold the line'
	},
	{
		id: 'section.verse-numbering',
		title: 'Number distinct verses',
		invalid: '[Verse]\nFirst\n\n[Verse]\nSecond',
		valid: '[Verse 1]\nFirst\n\n[Verse 2]\nSecond',
		// One distinct verse, sung twice. Genius leaves that unnumbered, so the
		// missing numbers here are correct rather than an omission.
		ambiguous: '[Verse]\nFirst\n\n[Chorus]\nHold\n\n[Verse]\nFirst'
	},
	{
		id: 'section.header-language',
		title: 'Headers from the selected language',
		invalid: '[Verse]\nEn natt',
		valid: '[Vers]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
		language: 'no'
	},
	{
		id: 'section.localized-header-preference',
		title: 'Prefer the localized song part name',
		invalid: '[Chorus]\nEn natt',
		valid: '[Refreng]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
		language: 'no'
	},
	{
		id: 'section.header-unrecognized',
		title: 'Check an unrecognized header',
		invalid: '[Chor]\nEn natt',
		valid: '[Refreng]\nEn natt',
		ambiguous: 'En natt',
		language: 'no'
	},
	{
		id: 'performer.header-required',
		title: 'Styled vocals need a performer legend',
		invalid: '[Verse]\n<i>Second voice</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>Second voice</i>',
		ambiguous: '[Verse]\n<i>Only voice</i>',
		performers: ['A', 'B']
	},
	{
		id: 'performer.style-order',
		title: 'Legend styles in slot order',
		invalid: '[Chorus: A, <b>B</b> & <i>C</i>]\nLine',
		valid: '[Chorus: A, <i>B</i> & <b>C</b>]\nLine',
		ambiguous: '[Chorus: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine'
	},
	{
		id: 'performer.redundant-markup',
		title: 'Merge adjacent performer markup',
		invalid: '[Verse: A & <i>B</i>]\n<i>First</i>\n<i>Second</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>First\nSecond</i>',
		ambiguous: '[Verse: A & <i>B</i>]\n<i>First</i>\nPlain\n<i>Second</i>'
	},
	{
		id: 'performer.parenthetical-boundary',
		title: 'Style the whole parenthetical',
		invalid: '[Verse: A & <i>B</i>]\nA (<i>Second voice</i>)',
		valid: '[Verse: A & <i>B</i>]\nA <i>(Second voice)</i>',
		ambiguous: '[Verse: A & <i>B</i>]\nA (plain <i>mixed voice</i>)'
	},
	{
		id: 'performer.unused-legend-slot',
		title: 'No unused legend slots',
		invalid: '[Verse: A & <i>B</i>]\nOnly A sings',
		valid: '[Verse: A & <i>B</i>]\nA sings\n<i>B sings</i>',
		ambiguous: '[Verse: A & <i>B</i>]\n<u>Unknown markup</u>'
	},
	{
		id: 'performer.inline-mismatch',
		title: 'Every inline style is in the legend',
		invalid: '[Verse: A]\n<i>Voice</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>Voice</i>',
		ambiguous: '[Verse: A]\n<u>Unknown markup</u>',
		performers: ['A', 'B']
	},
	{
		id: 'performer.too-many-groups',
		title: 'More voices than formatting slots',
		invalid: '[Verse: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine',
		valid: '[Verse: A, <i>B</i>, <b>C</b> & <i><b>D</b></i>]\nLine',
		ambiguous: '[Verse: A & B, <i>C</i>]\nLine'
	},
	{
		id: 'performer.line-label-forbidden',
		title: 'No performer labels on lyric lines',
		invalid: '[Verse: Avery]\n[Avery] A line',
		valid: '[Verse: Avery]\nA line',
		ambiguous: '[Verse: Avery]\n[Maybe] A line',
		performers: ['Avery']
	},
	{
		id: 'spelling.standardized',
		title: 'Standardized lyric spellings',
		invalid: '[Verse]\nImma go',
		valid: "[Verse]\nI'ma go",
		ambiguous: '[Verse]\nMy cuz came'
	},
	{
		id: 'spelling.language-variant',
		title: 'Match the selected English variant',
		invalid: "[Verse]\nStay 'til dawn",
		valid: '[Verse]\nStay till dawn',
		ambiguous: '[Verse]\nCoins fill the till',
		language: 'en-GB'
	},
	{
		id: 'spelling.texting-shorthand',
		title: 'Write texting shorthand out in full',
		invalid: '[Verse]\nIdk what to tell you',
		valid: "[Verse]\nI don't know what to tell you",
		// An initialism people say aloud is the letters being sung, not a
		// spelling of words that were. Expanding one would put words in a
		// singer's mouth, which is the whole boundary this rule holds.
		ambiguous: '[Verse]\nCall me ASAP'
	},
	{
		id: 'quotes.typewriter',
		title: 'Straight quotes in lyric text',
		invalid: '[Verse]\n“Hello”',
		valid: '[Verse]\n"Hello"',
		ambiguous: '[Verse]\n<u>“Hello”</u>'
	},
	{
		id: 'contraction.apostrophe',
		title: 'Apostrophes in contractions',
		invalid: '[Verse]\nDont go',
		valid: "[Verse]\nDon't go",
		ambiguous: '[Verse]\nIll will fades'
	},
	{
		id: 'grammar.english-pronoun-i',
		title: 'Capitalize the pronoun “I”',
		invalid: '[Verse]\nyou and i',
		valid: '[Verse]\nyou and I',
		ambiguous: '[Verse]\niPhone lights glow',
		language: 'en-US'
	},
	{
		id: 'spelling.english-common',
		title: 'Common English misspellings',
		invalid: '[Verse]\nI will definately stay',
		valid: '[Verse]\nI will definitely stay',
		ambiguous: '[Verse]\nA weird separate friend',
		language: 'en'
	},
	{
		id: 'spelling.norwegian-common',
		title: 'Common Norwegian misspellings',
		invalid: '[Vers]\nDet er desverre sant',
		valid: '[Vers]\nDet er dessverre sant',
		ambiguous: '[Vers]\nVæret er verre',
		language: 'no'
	},
	{
		id: 'spelling.german-common',
		title: 'Common German misspellings',
		invalid: '[Strophe]\nDas ist garnicht wahr',
		valid: '[Strophe]\nDas ist gar nicht wahr',
		ambiguous: '[Strophe]\nGar nichts bleibt',
		language: 'de'
	},
	{
		id: 'grammar.spanish-contractions',
		title: 'Spanish “al” and “del” contractions',
		invalid: '[Verso]\nVoy a el mar',
		valid: '[Verso]\nVoy al mar',
		ambiguous: '[Verso]\nVoy a El Salvador',
		language: 'es'
	},
	{
		id: 'spelling.spanish-common',
		title: 'Common Spanish misspellings',
		invalid: '[Verso]\nPorfavor ven',
		valid: '[Verso]\nPor favor ven',
		ambiguous: '[Verso]\nUn favor más',
		language: 'es'
	},
	{
		id: 'spelling.french-common',
		title: 'Common French misspellings',
		invalid: '[Couplet]\nJe sais, sa va',
		valid: '[Couplet]\nJe sais, ça va',
		ambiguous: '[Couplet]\nSa chanson va loin',
		language: 'fr'
	},
	{
		id: 'spelling.arabic-common',
		title: 'Standard Arabic spellings',
		invalid: '[المقطع]\nلاكن أحبك',
		valid: '[المقطع]\nلكن أحبك',
		ambiguous: '[المقطع]\nمكان هذا',
		language: 'ar'
	},
	{
		id: 'spelling.japanese-common',
		title: 'Standard Japanese spellings',
		invalid: '[Verse]\nこんにちわ',
		valid: '[Verse]\nこんにちは',
		ambiguous: '[Verse]\nわたしはここ',
		language: 'ja'
	},
	{
		id: 'spelling.korean-common',
		title: 'Standard Korean spellings',
		invalid: '[벌스]\n됬어',
		valid: '[벌스]\n됐어',
		ambiguous: '[벌스]\n되어 간다',
		language: 'ko'
	},
	{
		id: 'symbols.special-characters',
		title: 'Spell out symbols in lyrics',
		invalid: '[Verse]\nYou & me',
		valid: '[Verse]\nYou and me',
		ambiguous: '[Verse]\nH&M on my shirt',
		language: 'en'
	},
	{
		id: 'unknown.marker',
		title: '[?] for an unclear lyric',
		invalid: '[Verse]\nI heard (?)',
		valid: '[Verse]\nI heard [?]',
		ambiguous: '[Verse]\nI heard ???'
	},
	{
		id: 'unknown.improvised-marker',
		title: 'Question marks are not the [?] marker',
		invalid: '[Verse]\nI heard ??? tonight',
		valid: '[Verse]\nI heard [?] tonight',
		// Attached to the word it punctuates, so it is punctuation rather than a
		// placeholder standing in for words nobody could make out.
		ambiguous: '[Verse]\nAre you serious???'
	},
	{
		id: 'unknown.unresolved',
		title: 'Resolve [?] where you can',
		invalid: '[Verse]\nI heard [?]',
		valid: '[Verse]\nI heard every word',
		ambiguous: '[Verse]\nWas that a question?'
	},
	{
		id: 'repeat.placeholder',
		title: 'Write repeats out in full',
		invalid: '[Chorus x2]\nWords',
		valid: '[Chorus]\nWords again',
		ambiguous: '[Verse]\nI repeat chorus melodies'
	},
	{
		id: 'sound-effect.asterisks',
		title: 'Asterisks around a sound effect',
		invalid: '[Verse]\n{laughs}',
		valid: '[Verse]\n*laughs*',
		ambiguous: '[Verse]\n{roses}'
	},
	{
		id: 'censored.mask',
		title: 'Four asterisks for a censored word',
		invalid: '[Verse]\nf*** this',
		valid: '[Verse]\n**** this',
		ambiguous: '[Verse]\n***'
	},
	{
		id: 'adlib.parentheses',
		title: 'Capitalize a parenthesized ad-lib',
		invalid: '[Verse]\n(yeah)',
		valid: '[Verse]\n(Yeah)',
		ambiguous: '[Verse]\nYeah I know'
	},
	{
		id: 'adlib.separator',
		title: 'Separate consecutive ad-libs',
		invalid: '[Verse]\n(Yeah yeah yeah)',
		valid: '[Verse]\n(Yeah, yeah, yeah)',
		// One ad-lib among ordinary words is `adlib.parentheses`'s business; this
		// rule needs two of them side by side.
		ambiguous: '[Verse]\nOh baby oh baby'
	},
	{
		id: 'capitalization.line-start',
		title: 'Capitalize the start of a line',
		invalid: '[Verse]\nthe night is young',
		valid: '[Verse]\nThe night is young',
		ambiguous: '[Verse]\niPhone lights glow'
	},
	{
		id: 'capitalization.title-case',
		title: 'Sentence case, not title case',
		invalid: '[Verse]\nThis Is The Way We Live\nEvery Single Word Starts Uppercase',
		valid: '[Verse]\nThis is the way we live\nEvery single word starts normally',
		ambiguous: '[Verse]\nThis Is One Deliberate Title'
	},
	{
		id: 'punctuation.line-ending',
		title: 'No period at the end of a line',
		invalid: '[Verse]\nA lyric line.',
		valid: '[Verse]\nA lyric line!',
		ambiguous: '[Verse]\nA lyric trails off...'
	},
	{
		id: 'punctuation.question',
		title: 'A question mark on a question',
		invalid: '[Verse]\nWhere are you',
		valid: '[Verse]\n<i>Where are you?</i>',
		ambiguous: '[Verse]\nI wonder why'
	},
	{
		id: 'punctuation.dropped-word-dash',
		title: 'No comma after an em dash',
		invalid: '[Verse]\nA word—, then silence',
		valid: '[Verse]\nA word—then silence',
		ambiguous: '[Verse]\nA well--being note'
	},
	{
		id: 'line.prose-density',
		title: 'Break a prose-like line',
		invalid:
			'[Verse]\nI walked into the room, and everyone was talking; the lights were fading, while another story started and nobody stopped to breathe before the ending arrived.',
		valid: '[Verse]\nA short lyric line',
		ambiguous:
			'[Verse]\nOne two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour'
	},
	{
		id: 'numbers.spell-out',
		title: 'Spell out small numbers',
		invalid: '[Verse]\nI need 5 reasons',
		valid: '[Verse]\nI need five reasons',
		ambiguous: '[Verse]\nMeet at 5:30 with $5'
	}
];

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
	invalid: string;
	valid: string;
	ambiguous: string;
	language?: string;
	performers?: string[];
}

export const policyCases: readonly RulePolicyCase[] = [
	{
		id: 'syntax.unbalanced-brackets',
		invalid: '[Verse\nLine',
		valid: '[Verse]\nLine',
		ambiguous: '[Verse]\nA bracket [ in a lyric'
	},
	{
		id: 'syntax.unsupported-voice-markup',
		invalid: '[Verse]\n<u>Voice</u>',
		valid: '[Verse: A & <i>B</i>]\n<i>Voice</i>',
		ambiguous: '[Verse]\nAT&T'
	},
	{
		id: 'language.selection-mismatch',
		invalid: '[Verse]\nJe regarde la lumière du matin\nEt je sais que tu resteras avec moi ce soir',
		valid:
			'[Verse]\nI see the morning light through every shadow\nAnd I know that you will stay with me tonight',
		ambiguous: '[Verse]\nOh yeah'
	},
	{ id: 'section.header-missing', invalid: 'A lyric', valid: '[Verse]\nA lyric', ambiguous: '   ' },
	{
		id: 'section.header-prose',
		invalid: 'Verse 1:\nA lyric',
		valid: '[Verse 1]\nA lyric',
		// A one-word lyric that happens to name a song part, with none of the
		// three marks a written-out label carries.
		ambiguous: '[Verse]\nChorus'
	},
	{
		id: 'text.invisible-characters',
		invalid: '[Verse]\nA lyric ',
		valid: '[Verse]\nA lyric',
		// A right-to-left mark is invisible and deliberately preserved.
		ambiguous: `[Verse]\nA lyric${String.fromCodePoint(0x200f)}`
	},
	{
		id: 'section.header-spacing',
		invalid: '[Verse]\nFirst\n[Chorus]\nSecond',
		valid: '[Verse]\nFirst\n\n[Chorus]\nSecond',
		ambiguous: '[Chorus]\nAgain\n[Chorus]\nAgain'
	},
	{
		id: 'section.deprecated-hook',
		invalid: '[Hook]\nSing it',
		valid: '[Chorus]\nSing it',
		ambiguous: '[Verse]\nHook me with the melody'
	},
	{
		id: 'section.immediate-repeat-spacing',
		invalid: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTonight',
		valid: '[Chorus]\nAgain\nTonight\nAgain\nTonight',
		ambiguous: '[Chorus]\nAgain\nTonight\n\n[Chorus]\nAgain\nTomorrow'
	},
	{
		id: 'section.unlinked-repeat',
		invalid: '[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nHold the line',
		valid: '[Chorus]\nHold the line\n\n[Verse 1]\nA lyric\n\n[Chorus]\nLet it go',
		// Two identical choruses with nothing between them belong under one
		// header, which is `section.immediate-repeat-spacing`'s finding rather
		// than this one.
		ambiguous: '[Chorus]\nHold the line\n\n[Chorus]\nHold the line'
	},
	{
		id: 'section.verse-numbering',
		invalid: '[Verse]\nFirst\n\n[Verse]\nSecond',
		valid: '[Verse 1]\nFirst\n\n[Verse 2]\nSecond',
		// One distinct verse, sung twice. Genius leaves that unnumbered, so the
		// missing numbers here are correct rather than an omission.
		ambiguous: '[Verse]\nFirst\n\n[Chorus]\nHold\n\n[Verse]\nFirst'
	},
	{
		id: 'section.header-language',
		invalid: '[Verse]\nEn natt',
		valid: '[Vers]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
		language: 'no'
	},
	{
		id: 'section.localized-header-preference',
		invalid: '[Chorus]\nEn natt',
		valid: '[Refreng]\nEn natt',
		ambiguous: '[Eget parti]\nEn natt',
		language: 'no'
	},
	{
		id: 'section.header-unrecognized',
		invalid: '[Chor]\nEn natt',
		valid: '[Refreng]\nEn natt',
		ambiguous: 'En natt',
		language: 'no'
	},
	{
		id: 'performer.header-required',
		invalid: '[Verse]\n<i>Second voice</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>Second voice</i>',
		ambiguous: '[Verse]\n<i>Only voice</i>',
		performers: ['A', 'B']
	},
	{
		id: 'performer.style-order',
		invalid: '[Chorus: A, <b>B</b> & <i>C</i>]\nLine',
		valid: '[Chorus: A, <i>B</i> & <b>C</b>]\nLine',
		ambiguous: '[Chorus: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine'
	},
	{
		id: 'performer.redundant-markup',
		invalid: '[Verse: A & <i>B</i>]\n<i>First</i>\n<i>Second</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>First\nSecond</i>',
		ambiguous: '[Verse: A & <i>B</i>]\n<i>First</i>\nPlain\n<i>Second</i>'
	},
	{
		id: 'performer.parenthetical-boundary',
		invalid: '[Verse: A & <i>B</i>]\nA (<i>Second voice</i>)',
		valid: '[Verse: A & <i>B</i>]\nA <i>(Second voice)</i>',
		ambiguous: '[Verse: A & <i>B</i>]\nA (plain <i>mixed voice</i>)'
	},
	{
		id: 'performer.unused-legend-slot',
		invalid: '[Verse: A & <i>B</i>]\nOnly A sings',
		valid: '[Verse: A & <i>B</i>]\nA sings\n<i>B sings</i>',
		ambiguous: '[Verse: A & <i>B</i>]\n<u>Unknown markup</u>'
	},
	{
		id: 'performer.inline-mismatch',
		invalid: '[Verse: A]\n<i>Voice</i>',
		valid: '[Verse: A & <i>B</i>]\n<i>Voice</i>',
		ambiguous: '[Verse: A]\n<u>Unknown markup</u>',
		performers: ['A', 'B']
	},
	{
		id: 'performer.too-many-groups',
		invalid: '[Verse: A, <i>B</i>, <b>C</b>, <i><b>D</b></i> & E]\nLine',
		valid: '[Verse: A, <i>B</i>, <b>C</b> & <i><b>D</b></i>]\nLine',
		ambiguous: '[Verse: A & B, <i>C</i>]\nLine'
	},
	{
		id: 'performer.line-label-forbidden',
		invalid: '[Verse: Avery]\n[Avery] A line',
		valid: '[Verse: Avery]\nA line',
		ambiguous: '[Verse: Avery]\n[Maybe] A line',
		performers: ['Avery']
	},
	{
		id: 'spelling.standardized',
		invalid: '[Verse]\nImma go',
		valid: "[Verse]\nI'ma go",
		ambiguous: '[Verse]\nMy cuz came'
	},
	{
		id: 'spelling.language-variant',
		invalid: "[Verse]\nStay 'til dawn",
		valid: '[Verse]\nStay till dawn',
		ambiguous: '[Verse]\nCoins fill the till',
		language: 'en-GB'
	},
	{
		id: 'quotes.typewriter',
		invalid: '[Verse]\n“Hello”',
		valid: '[Verse]\n"Hello"',
		ambiguous: '[Verse]\n<u>“Hello”</u>'
	},
	{
		id: 'contraction.apostrophe',
		invalid: '[Verse]\nDont go',
		valid: "[Verse]\nDon't go",
		ambiguous: '[Verse]\nIll will fades'
	},
	{
		id: 'grammar.english-pronoun-i',
		invalid: '[Verse]\nyou and i',
		valid: '[Verse]\nyou and I',
		ambiguous: '[Verse]\niPhone lights glow',
		language: 'en-US'
	},
	{
		id: 'spelling.english-common',
		invalid: '[Verse]\nI will definately stay',
		valid: '[Verse]\nI will definitely stay',
		ambiguous: '[Verse]\nA weird separate friend',
		language: 'en'
	},
	{
		id: 'spelling.norwegian-common',
		invalid: '[Vers]\nDet er desverre sant',
		valid: '[Vers]\nDet er dessverre sant',
		ambiguous: '[Vers]\nVæret er verre',
		language: 'no'
	},
	{
		id: 'spelling.german-common',
		invalid: '[Strophe]\nDas ist garnicht wahr',
		valid: '[Strophe]\nDas ist gar nicht wahr',
		ambiguous: '[Strophe]\nGar nichts bleibt',
		language: 'de'
	},
	{
		id: 'grammar.spanish-contractions',
		invalid: '[Verso]\nVoy a el mar',
		valid: '[Verso]\nVoy al mar',
		ambiguous: '[Verso]\nVoy a El Salvador',
		language: 'es'
	},
	{
		id: 'spelling.spanish-common',
		invalid: '[Verso]\nPorfavor ven',
		valid: '[Verso]\nPor favor ven',
		ambiguous: '[Verso]\nUn favor más',
		language: 'es'
	},
	{
		id: 'spelling.french-common',
		invalid: '[Couplet]\nJe sais, sa va',
		valid: '[Couplet]\nJe sais, ça va',
		ambiguous: '[Couplet]\nSa chanson va loin',
		language: 'fr'
	},
	{
		id: 'spelling.arabic-common',
		invalid: '[المقطع]\nلاكن أحبك',
		valid: '[المقطع]\nلكن أحبك',
		ambiguous: '[المقطع]\nمكان هذا',
		language: 'ar'
	},
	{
		id: 'spelling.japanese-common',
		invalid: '[Verse]\nこんにちわ',
		valid: '[Verse]\nこんにちは',
		ambiguous: '[Verse]\nわたしはここ',
		language: 'ja'
	},
	{
		id: 'spelling.korean-common',
		invalid: '[벌스]\n됬어',
		valid: '[벌스]\n됐어',
		ambiguous: '[벌스]\n되어 간다',
		language: 'ko'
	},
	{
		id: 'symbols.special-characters',
		invalid: '[Verse]\nYou & me',
		valid: '[Verse]\nYou and me',
		ambiguous: '[Verse]\nH&M on my shirt',
		language: 'en'
	},
	{
		id: 'unknown.marker',
		invalid: '[Verse]\nI heard (?)',
		valid: '[Verse]\nI heard [?]',
		ambiguous: '[Verse]\nI heard ???'
	},
	{
		id: 'unknown.unresolved',
		invalid: '[Verse]\nI heard [?]',
		valid: '[Verse]\nI heard every word',
		ambiguous: '[Verse]\nWas that a question?'
	},
	{
		id: 'repeat.placeholder',
		invalid: '[Chorus x2]\nWords',
		valid: '[Chorus]\nWords again',
		ambiguous: '[Verse]\nI repeat chorus melodies'
	},
	{
		id: 'sound-effect.asterisks',
		invalid: '[Verse]\n{laughs}',
		valid: '[Verse]\n*laughs*',
		ambiguous: '[Verse]\n{roses}'
	},
	{
		id: 'censored.mask',
		invalid: '[Verse]\nf*** this',
		valid: '[Verse]\n**** this',
		ambiguous: '[Verse]\n***'
	},
	{
		id: 'adlib.parentheses',
		invalid: '[Verse]\n(yeah)',
		valid: '[Verse]\n(Yeah)',
		ambiguous: '[Verse]\nYeah I know'
	},
	{
		id: 'adlib.separator',
		invalid: '[Verse]\n(Yeah yeah yeah)',
		valid: '[Verse]\n(Yeah, yeah, yeah)',
		// One ad-lib among ordinary words is `adlib.parentheses`'s business; this
		// rule needs two of them side by side.
		ambiguous: '[Verse]\nOh baby oh baby'
	},
	{
		id: 'capitalization.line-start',
		invalid: '[Verse]\nthe night is young',
		valid: '[Verse]\nThe night is young',
		ambiguous: '[Verse]\niPhone lights glow'
	},
	{
		id: 'capitalization.title-case',
		invalid: '[Verse]\nThis Is The Way We Live\nEvery Single Word Starts Uppercase',
		valid: '[Verse]\nThis is the way we live\nEvery single word starts normally',
		ambiguous: '[Verse]\nThis Is One Deliberate Title'
	},
	{
		id: 'punctuation.line-ending',
		invalid: '[Verse]\nA lyric line.',
		valid: '[Verse]\nA lyric line!',
		ambiguous: '[Verse]\nA lyric trails off...'
	},
	{
		id: 'punctuation.question',
		invalid: '[Verse]\nWhere are you',
		valid: '[Verse]\n<i>Where are you?</i>',
		ambiguous: '[Verse]\nI wonder why'
	},
	{
		id: 'punctuation.dropped-word-dash',
		invalid: '[Verse]\nA word—, then silence',
		valid: '[Verse]\nA word—then silence',
		ambiguous: '[Verse]\nA well--being note'
	},
	{
		id: 'line.prose-density',
		invalid:
			'[Verse]\nI walked into the room, and everyone was talking; the lights were fading, while another story started and nobody stopped to breathe before the ending arrived.',
		valid: '[Verse]\nA short lyric line',
		ambiguous:
			'[Verse]\nOne two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour'
	},
	{
		id: 'numbers.spell-out',
		invalid: '[Verse]\nI need 5 reasons',
		valid: '[Verse]\nI need five reasons',
		ambiguous: '[Verse]\nMeet at 5:30 with $5'
	}
];

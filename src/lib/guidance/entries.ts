/**
 * The guidance entries, one checkable claim each. Statements are LyricLint's
 * own paraphrases; examples are invented, because anything shipped here is
 * quoted permanently and a real transcription's lyrics must never be.
 *
 * Every entry's authority is the highest tier among its cited sources —
 * claimed here, enforced in `guidance.test.ts` — so promoting an entry means
 * adding the confirming higher-tier source, which is the audit trail.
 */
import {
	entryAnchor,
	guidanceTopicLandmarks,
	guidanceTopicOrder,
	guidanceTopicTitles,
	type GuidanceEntry,
	type RuleGuidelineLink
} from './guidance.js';

export const guidanceEntries: readonly GuidanceEntry[] = [
	{
		id: 'guidance.section-headers.bracketed-headers',
		topic: 'section-headers',
		title: 'Song parts open with bracketed headers',
		statement:
			"Each part of a song stands under its own header — the part's name in square brackets on a line of its own — with `Intro`, `Verse`, `Refrain`, `Pre-Chorus`, `Chorus`, `Bridge`, and `Outro` the most common names, and further parts documented in the reviewed sections guide.",
		example: { correct: '[Verse 1]', incorrect: 'Verse 1:' },
		authority: 'staff',
		sourceIds: ['G-SECTIONS'],
		relatedRuleIds: [
			'section.header-missing',
			'section.header-prose',
			'section.header-empty',
			'syntax.unbalanced-brackets',
			'section.header-unrecognized'
		],
		note: 'The linter checks the whole mechanical convention: a section with no header, a header written as prose, empty brackets, unbalanced ones, and a name outside every reviewed catalog.'
	},
	{
		id: 'guidance.section-headers.artist-identifiers',
		topic: 'section-headers',
		title: 'Name artists in headers when voices differ',
		statement:
			"Every header carries artist identifiers when a solo artist's song gives parts to other artists, or when a band or group has multiple vocalists — and none when one voice performs everything: a band with one lead singer, or a solo artist singing every part.",
		example: { correct: '[Verse 1: Avery]' },
		authority: 'staff',
		sourceIds: ['G-SECTIONS'],
		relatedRuleIds: ['performer.header-required'],
		note: 'In between, identifiers are allowed but not required: songs by several primary artists or an artist-and-producer duo, and one-singer songs whose intro, outro, or interludes are sampled. The linter checks the mechanical half — a section with styled voices in its lyrics and no legend in its header; whether a song needs identifiers at all is a judgment about the release.'
	},
	{
		id: 'guidance.section-headers.voice-order',
		topic: 'section-headers',
		title: 'Order voices by prominence or arrival',
		statement:
			'Where several artists share one section, the plain slot belongs to the voice with the most lines or the first to sing; italics, bold, and bold italics follow in that order down to the fewest lines, in the header and in the lyrics both, with names separated by their formatting, commas, and an ampersand before the last.',
		example: { correct: '[Chorus: Avery, <i>Blair</i> & <b>Casey</b>]' },
		authority: 'staff',
		sourceIds: ['G-SECTIONS'],
		relatedRuleIds: [
			'performer.style-order',
			'syntax.unsupported-voice-markup',
			'performer.inline-mismatch',
			'performer.unused-legend-slot',
			'performer.redundant-markup'
		],
		note: 'The linter checks the mechanics of the four slots — their order, that only the supported italic and bold tags carry them, and that the legend and the lyrics agree about which are in use; which artist earned which slot is a count of lines only the transcriber can make.'
	},
	{
		id: 'guidance.section-headers.unison-grouping',
		topic: 'section-headers',
		title: 'Group unison voices with ampersands',
		statement:
			'Vocalists performing the same lines in unison are one group: their names share one text formatting and are joined with ampersands, and commas separate whole groups from each other, never the voices inside one.',
		example: { correct: '[Chorus: Avery, <i>Avery & Blair</i>, <b>Avery & Casey</b>]' },
		authority: 'staff',
		sourceIds: ['G-SECTIONS'],
		relatedRuleIds: ['performer.collective-identifier'],
		note: 'A group is always its members written out: the linter flags a legend naming a collective identifier such as `Both` or `All` where the names belong.'
	},
	{
		id: 'guidance.section-headers.parenthetical-formatting',
		topic: 'section-headers',
		title: 'Parentheses sit outside voice formatting',
		statement:
			"Where a differentiated voice's words are parenthesized — an ad-lib or a backing line — the italic or bold tags wrap the words inside the parentheses, and the parentheses themselves stay unformatted.",
		example: {
			correct: 'We own the night (<i>We own it</i>)',
			incorrect: 'We own the night <i>(We own it)</i>'
		},
		authority: 'editorial',
		sourceIds: ['G-PERF-PARENS'],
		relatedRuleIds: ['performer.parenthetical-boundary'],
		note: "The reviewed headers guide's own worked examples keep the same boundary, so the linter's fix moves the formatting inside the parentheses."
	},
	{
		id: 'guidance.section-headers.crowded-headers',
		topic: 'section-headers',
		title: 'Annotate a header too crowded to format',
		statement:
			'Where one section has more vocalists than the four text formats can carry concisely, the header omits the names and an annotation over it breaks down who performs each line; names never stand in brackets at the start of lyric lines, and asterisks or other symbols never stand in for a name.',
		authority: 'staff',
		// The staff forum answer restates the recourse word for word when asked
		// how a five-voice section should be handled, so it seconds the guide.
		sourceIds: ['G-SECTIONS', 'G-HEADER-COLLECTIVE'],
		relatedRuleIds: ['performer.too-many-groups', 'performer.line-label-forbidden']
	},
	{
		id: 'guidance.section-headers.fictional-characters',
		topic: 'section-headers',
		title: 'Credit performers, not their characters',
		statement:
			'A song performed in character is identified by the performers credited on the release — which may itself credit the characters; for a musical, or a musical-style film or television show, the transcriber may use character names where those read more appropriately.',
		authority: 'staff',
		sourceIds: ['G-SECTIONS']
	},
	{
		id: 'guidance.section-headers.ai-vocals',
		topic: 'section-headers',
		title: 'AI vocal identifiers follow consent',
		statement:
			"An AI vocal imitating a specific artist is identified by that artist's name only where the artist or their estate consented, and as `AI` otherwise; an artist applying AI to their own voice keeps their name, vocals imitating nobody are `AI` or left unidentified when used as samples, and an AI or virtual artist performs under its own name.",
		authority: 'staff',
		sourceIds: ['G-SECTIONS']
	},
	{
		id: 'guidance.section-headers.producer-tags',
		topic: 'section-headers',
		title: 'Known sample voices may join the header',
		statement:
			"A prominently featured producer tag or vocal sample may carry its vocalist's name in the section header when the vocalist is known.",
		authority: 'staff',
		sourceIds: ['G-SECTIONS'],
		note: 'A sample shorter than a full line, or samples that would push one header past four artists, share a single text formatting instead, with identification left to annotations and song metadata.'
	},
	{
		id: 'guidance.section-headers.sampled-dialogue',
		topic: 'section-headers',
		title: 'Sampled dialogue names the actor',
		statement:
			'Sampled film or television dialogue is identified by the actors who speak it, never by their characters.',
		authority: 'staff',
		sourceIds: ['G-SECTIONS']
	},
	{
		id: 'guidance.section-headers.instrumental',
		topic: 'section-headers',
		title: 'An instrumental page reads [Instrumental]',
		statement:
			'A track with no lyrics still gets a page: its whole lyrics field is the single line `[Instrumental]`.',
		example: { correct: '[Instrumental]' },
		authority: 'staff',
		sourceIds: ['G-INSTRUMENTAL'],
		note: 'An instrumental version of an already-existing song is only added where it was released in some official capacity — on streaming, a box set, or similar.'
	},
	{
		id: 'guidance.section-headers.hook-by-language',
		topic: 'section-headers',
		title: 'Check whether your language kept Hook',
		statement:
			"Replacing the deprecated `Hook` header with `Chorus` or `Refrain` is settled for English songs only; some international communities, German among them, still use `Hook` — so a transcription in another language follows that community's own ruling, confirmed with its community lead where it is in doubt.",
		authority: 'editorial',
		sourceIds: ['G-SECTION-HOOK', 'G-LANG-HEADERS'],
		relatedRuleIds: ['section.deprecated-hook'],
		note: "For supported languages the linter already knows the answer: each language pack carries that community's reviewed header vocabulary, and the deprecation warning stands down wherever a pack still lists `Hook` as a valid term. For a language the packs do not cover, the Song Headers in Different Languages page cited above is the inventory to check before asking a community lead."
	},
	{
		id: 'guidance.section-headers.segue-parts',
		topic: 'section-headers',
		title: 'Label a two-song track by Parts',
		statement:
			'A track that a segue divides into two distinct songs still never numbers its choruses, intros, or other non-verse parts; the split is carried by `Part` labels instead — `Part I`, `Part II`, and so on.',
		authority: 'editorial',
		sourceIds: ['G-SECTION-NUMBERING'],
		relatedRuleIds: ['section.verse-numbering'],
		note: 'The linter flags any numbered non-verse header; whether a track is really two songs behind one segue is a judgment only the transcriber can make.'
	},
	{
		id: 'guidance.section-headers.foreign-language-headers',
		topic: 'section-headers',
		title: "Check a language's headers before editing",
		statement:
			'Standard section headers exist in many languages, and the reviewed inventory of them is the place to check before changing a header in a song whose language is not your own — each community settles its own vocabulary.',
		authority: 'staff',
		sourceIds: ['G-LANG-PURPOSE', 'G-LANG-HEADERS'],
		relatedRuleIds: ['section.header-language', 'section.localized-header-preference'],
		note: "For the linter's supported languages the packs already carry each community's reviewed header vocabulary; the Song Headers in Different Languages page cited above covers the rest."
	},
	{
		id: 'guidance.section-headers.header-lyrics-language',
		topic: 'section-headers',
		title: "Headers speak the transcription's language",
		statement:
			"Song part headers are written in the same language as the transcribed text, and the reviewed inventory of headers in other languages documents each community's forms.",
		authority: 'staff',
		sourceIds: ['G-SECTIONS', 'G-LANG-HEADERS'],
		relatedRuleIds: ['section.header-language', 'section.localized-header-preference'],
		note: "The linter checks recognized headers against the selected language pack's reviewed vocabulary and offers the community-preferred localized term where one exists."
	},
	{
		id: 'guidance.section-headers.blank-line-spacing',
		topic: 'section-headers',
		title: 'One blank line between song parts',
		statement:
			'A single blank line separates each song part from the header of the next — and never more than one.',
		authority: 'lyriclint',
		sourceIds: ['G-SECTIONS'],
		relatedRuleIds: ['section.header-spacing', 'section.extra-blank-lines'],
		note: "This is LyricLint's own readability advisory rather than a stated Genius rule: the reviewed guide's examples all keep the single blank line, but no source spells it out, so the claim carries LyricLint's name instead of theirs."
	},
	{
		id: 'guidance.spelling.as-pronounced',
		topic: 'spelling',
		title: 'Spell deliberate mispronunciations as sung',
		statement:
			'A word an artist mispronounces or deliberately bends — local slang, or a rhyme forced into the flow — is transcribed to reflect the pronunciation, within reason; slang built on a mispronounced word is spelled the way it is usually written online, or as it is pronounced.',
		authority: 'staff',
		sourceIds: ['G-AS-SPOKEN'],
		relatedRuleIds: ['spelling.texting-shorthand'],
		note: 'The same convention read the other way is what the linter checks: written-only texting shorthand such as `idk` stands for words the artist actually sang, so it is expanded to them rather than kept as letters nobody performed.'
	},
	{
		id: 'guidance.spelling.readability-limit',
		topic: 'spelling',
		title: 'Keep the standard spelling when unclear',
		statement:
			"Where writing a pronunciation out would make the word hard to recognize, the standard spelling wins: `business` rather than `bini` for the Southern pronunciation, `and` rather than `an'` where the `d` softens, `of` rather than `o'` where the `f` does.",
		authority: 'staff',
		sourceIds: ['G-AS-SPOKEN']
	},
	{
		id: 'guidance.spelling.elision-apostrophe',
		topic: 'spelling',
		title: 'An apostrophe marks the omitted side',
		statement:
			"When letters or a syllable are dropped from a word, the remaining characters take an apostrophe on the side of the omission — `ballin'`, `gon'` for `gonna`, `'til`, `'em` — and a contraction's apostrophe always sits on the side its letters left.",
		example: { correct: "Ballin' like we used to", incorrect: 'Ballin like we used to' },
		authority: 'staff',
		sourceIds: ['G-AS-SPOKEN', 'G-CONTRACTIONS'],
		relatedRuleIds: ['contraction.apostrophe', 'spelling.standardized'],
		note: "The linter checks the contractions and shortened forms it knows; an elision in a word outside its tables is the transcriber's to mark."
	},
	{
		id: 'guidance.spelling.english-variant',
		topic: 'spelling',
		title: "Transcribe in the artist's own English",
		statement:
			"A song by a British artist is transcribed in British spellings and one by an American artist in American: the lyric follows the variant its artist uses, never the transcriber's.",
		authority: 'staff',
		sourceIds: ['G-SPELLING'],
		relatedRuleIds: ['spelling.language-variant'],
		note: "The linter reviews only the `'til`/`till` pair, and only while a British or American English variant is selected; every other variant spelling is the transcriber's to keep consistent."
	},
	{
		id: 'guidance.spelling.standard-orthography',
		topic: 'spelling',
		title: "Spelling follows the language's standard",
		statement:
			'Outside deliberate as-sung spellings, lyric text follows the standard orthography of its language — the double-checked accuracy the transcription guide asks of every lyric.',
		authority: 'lyriclint',
		sourceIds: ['G-ADD-SONGS'],
		relatedRuleIds: [
			'spelling.english-common',
			'spelling.norwegian-common',
			'spelling.german-common',
			'grammar.spanish-contractions',
			'spelling.spanish-common',
			'spelling.french-common',
			'spelling.arabic-common',
			'spelling.japanese-common',
			'spelling.korean-common'
		],
		note: "The per-language checks are LyricLint's own curation against external dictionaries and academies — each rule's page cites its sources — rather than a reviewed Genius list; Genius's own reviewed forms are the standardized-spellings table above."
	},
	{
		id: 'guidance.spelling.reversed-vocals',
		topic: 'spelling',
		title: 'Type reversed vocals as they sound',
		statement:
			'A vocal the production plays backwards is written out as it sounds, letter for letter, and capitalized as any other line would be; what the words are forwards belongs in an annotation rather than in the lyrics.',
		example: { correct: 'Emit eht lla ti od I' },
		authority: 'staff',
		sourceIds: ['G-REVERSED']
	},
	{
		id: 'guidance.spelling.letter-plurals',
		topic: 'spelling',
		title: 'One letter pluralizes with an apostrophe',
		statement:
			'Pluralizing one letter takes an apostrophe before the `s`; pluralizing anything longer than a single letter does not, so an initialism or an abbreviation takes a bare `s`.',
		example: { correct: "Two L's and three CDs", incorrect: "Two Ls and three CD's" },
		authority: 'staff',
		sourceIds: ['G-PLURALS']
	},
	{
		id: 'guidance.capitalization.conventional-only',
		topic: 'capitalization',
		title: 'Capitalize only what convention requires',
		statement:
			'Beyond the start of every line and of a parenthetical, capitals belong to proper nouns, religious titles (`God`, `Him`), acronyms (`TBH`), geographical regions (`West Coast`), and the title casing of works (`The Life of Pablo`); outside those, words stay lowercase.',
		authority: 'staff',
		sourceIds: ['G-CAPS'],
		relatedRuleIds: [
			'capitalization.line-start',
			'capitalization.title-case',
			'adlib.parentheses',
			'grammar.english-pronoun-i'
		],
		note: "The linter checks the line starts, the parenthetical openings, title-cased runs of lyric, and the standalone lowercase `i`; whether a word is a proper noun is the transcriber's call."
	},
	{
		id: 'guidance.capitalization.brand-stylization',
		topic: 'capitalization',
		title: 'Write brands conventionally, not stylized',
		statement:
			"A brand name takes its conventional form over its own stylization — `Chanel`, not `CHANEL`; `Adidas`, not `adidas`; `Macy's`, not `macy★s` — with no trademark marks and no decorative characters, unless the name is an acronym normally written in capitals (`GEICO`, `IMAX`); CamelCase stays where the name itself carries it (`YouTube`, `iPhone`, `eBay`), as does a symbol that is genuinely part of the name (`H&M`, `su:m37°`), and a brand that has become a generic word may be lowercased (`band-aid`, `popsicle`, `jet ski`).",
		example: { correct: 'New Glock in my jeans', incorrect: 'New GLOCK in my jeans' },
		authority: 'staff',
		// The symbols annotation carries the same principle from the other side —
		// decoration and ™/® go, a symbol the name itself owns stays.
		sourceIds: ['G-CAPS', 'G-SYMBOLS'],
		relatedRuleIds: ['symbols.special-characters']
	},
	{
		id: 'guidance.capitalization.earth',
		topic: 'capitalization',
		title: 'Earth is capital only as the planet',
		statement:
			'`Earth` takes a capital only when it names the planet; as the material — dirt, soil — it stays lowercase.',
		authority: 'staff',
		sourceIds: ['G-CAPS']
	},
	{
		id: 'guidance.capitalization.directions',
		topic: 'capitalization',
		title: 'Capitalize regions, not directions',
		statement:
			'`North`, `south`, `east`, and `west` take capitals where they designate a definite region or belong to a name — `the Deep South`, `the Eastern Seaboard` — and stay lowercase as mere directions, like westerly winds or a northern winter.',
		authority: 'staff',
		sourceIds: ['G-CAPS']
	},
	{
		id: 'guidance.ad-libs.include-every',
		topic: 'ad-libs',
		title: 'Transcribe every ad-lib',
		statement:
			'Every ad-lib belongs in the transcription — the most complete lyrics possible are the goal — written in parentheses with its first letter capitalized.',
		example: { correct: 'Racing down the boulevard (Skrrt)' },
		authority: 'staff',
		sourceIds: ['G-ADLIBS'],
		relatedRuleIds: [
			'adlib.parentheses',
			'adlib.separator',
			'punctuation.parenthesis-spacing',
			'syntax.unbalanced-parentheses'
		],
		note: 'The linter checks the shape once an ad-lib is written — the parentheses, the space before them, the separators between run-together ad-libs; hearing one and writing it down is the half only the transcriber can do.'
	},
	{
		id: 'guidance.ad-libs.echo-effects',
		topic: 'ad-libs',
		title: 'Echo repeats are not ad-libs',
		statement:
			'Words repeated by an echo or delay effect on the vocal are not ad-libs, and the repeats are not transcribed.',
		authority: 'staff',
		sourceIds: ['G-ADLIBS']
	},
	{
		id: 'guidance.ad-libs.vocalized-sounds',
		topic: 'ad-libs',
		title: 'Asterisks mark produced sounds, not vocals',
		statement:
			'A sound effect in the production — a money counter, a gunshot — is wrapped in asterisks either side (`*beep*`); a sound the artist vocalizes with their own voice is a lyric and is written plain, without them.',
		example: { correct: "*cash register* Countin' it up all night" },
		authority: 'staff',
		sourceIds: ['G-SFX'],
		relatedRuleIds: ['sound-effect.asterisks'],
		note: 'The linter flags braces and other wrappers around a likely sound effect; whether a sound came from the booth or the board is a judgment only the transcriber can hear.'
	},
	{
		id: 'guidance.ad-libs.yodel-scat-sections',
		topic: 'ad-libs',
		title: 'Bracket a yodel you cannot make out',
		statement:
			'A yodel or a scat run is transcribed syllable by syllable, dashes joining the syllables of one run, no dash where a small pause falls, and a comma closing each section; a transcriber not confident of the syllables writes `[Yodeling]` or `[Scatting]` where the passage occurs instead of guessing at them.',
		example: { correct: 'Lay-ee-oh-del-ay-hee, oh-del-ay-hee-hoo' },
		authority: 'editorial',
		sourceIds: ['G-YODELING'],
		note: 'A yodeling page also takes the `Yodel` tag. Yodels draw on a small set of recurring syllables — `dee`, `del`, `ee`, `ho`, `la`, `lay`, `oh`, `oo`, `ro`, `yo` — while scatting is free-form and has no such set, so only its segmentation is conventional. The dash itself is the hyphen convention stated with the other dash rules.'
	},
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
		note: 'Mechanically checkable, so a candidate for a linter rule — which this entry would then name as checking it.'
	},
	{
		id: 'guidance.punctuation.brand-name-marks',
		topic: 'punctuation',
		title: "Never double a brand name's own mark",
		statement:
			"A line that would take a question or exclamation mark of its own — from its grammatical structure or its apparent excitement — and ends on a brand name already carrying one (`Guess Who?`, `Yahoo!`, `Chips Ahoy!`) does not take a second: the name's single mark holds for the line.",
		example: {
			correct: 'Have you ever played Guess Who?',
			incorrect: 'Have you ever played Guess Who??'
		},
		authority: 'staff',
		sourceIds: ['G-QE-MARKS']
	},
	{
		id: 'guidance.punctuation.quotation-usage',
		topic: 'punctuation',
		title: 'Quotes mark titles, speech, and mentions',
		statement:
			'Quotation marks serve three jobs in a lyric: a song title the words name, a passage the artist explicitly performs as something said elsewhere, and a word the line refers to as a word.',
		example: { correct: 'She said, "Meet me where the river bends"' },
		authority: 'staff',
		sourceIds: ['G-QUOTES'],
		relatedRuleIds: ['quotes.typewriter'],
		note: "The linter checks only the glyphs — typewriter quotation marks, never curly; whether a passage is quoted speech, a named title, or a mentioned word is the transcriber's reading."
	},
	{
		id: 'guidance.punctuation.performance-hyphens',
		topic: 'punctuation',
		title: 'Hyphenate scatting and stutters',
		statement:
			'Hyphens join rapidly spoken non-lyrical vocalization — scatting — and the repeated fragments of a stuttered word; a stutter produced artificially, by effects, sampling, or scratching, may be left out.',
		example: { correct: "D-d-don't say it twice" },
		authority: 'staff',
		// The yodeling annotation states the same hyphen for a scat or yodel
		// run, so it seconds this half of the dashes annotation.
		sourceIds: ['G-DASHES', 'G-YODELING'],
		relatedRuleIds: ['punctuation.dropped-word-dash'],
		note: 'The em-dash half of the dashes annotation — a dash for a dropped word or line, never followed by a comma — is checked by the linter outright.'
	},
	{
		id: 'guidance.lines.bar-per-line',
		topic: 'lines',
		title: 'Transcribe line by line, not in paragraphs',
		statement:
			"Lyrics are transcribed line by line, each line ending where the musical phrase does — in most songs the snare marks the count, and the words landing on it show where a bar's lines break — because a long prose-like run hides where lines stop and how the rhyme scheme runs, especially on a phone.",
		authority: 'staff',
		sourceIds: ['G-LINES'],
		relatedRuleIds: ['line.prose-density'],
		note: 'The linter flags a line dense enough to read as prose; hearing where the beat actually breaks it is a judgment only the transcriber can make.'
	},
	{
		id: 'guidance.lines.spoken-sections',
		topic: 'lines',
		title: 'Spoken sections break into lines too',
		statement:
			'A spoken intro, interlude, or outro is transcribed line by line like everything else, split where the speaker pauses and where sentences begin and end — never as one paragraph.',
		authority: 'staff',
		sourceIds: ['G-LINES']
	},
	{
		id: 'guidance.lines.repeats-in-full',
		topic: 'lines',
		title: 'Type repeated lyrics out in full',
		statement:
			'A section the song repeats — a returning chorus, a refrain — is typed out in full at every occurrence, and so are lyrics repeated inside one section: a header or a count never stands in for words the song sings again, so nobody reading along has to scroll back to find them.',
		authority: 'staff',
		sourceIds: ['G-REPEATS'],
		relatedRuleIds: ['repeat.placeholder', 'section.unlinked-repeat'],
		note: 'The linter flags `x2` counts and `Repeat` placeholders outright, and offers to link identical choruses so the copies stay identical. On Genius itself, copy each repeated line together with the annotation number it carries in Edit Lyrics mode, so the annotations repeat with the words.'
	},
	{
		id: 'guidance.lines.immediate-repeat',
		topic: 'lines',
		title: 'An immediate repeat shares one header',
		statement:
			'When an entire song part is sung again immediately, its lyrics are typed out again under the same single header, with no blank line between the copies.',
		example: {
			correct: '[Chorus]\nHold on tight\nWe ride tonight\nHold on tight\nWe ride tonight',
			incorrect:
				'[Chorus]\nHold on tight\nWe ride tonight\n\n[Chorus]\nHold on tight\nWe ride tonight'
		},
		authority: 'staff',
		sourceIds: ['G-SECTIONS', 'G-REPEATS'],
		relatedRuleIds: ['section.immediate-repeat-spacing']
	},
	{
		id: 'guidance.lines.clean-text',
		topic: 'lines',
		title: 'No doubled spaces or hidden characters',
		statement:
			'Lyric text keeps exactly one ordinary space between words and carries no invisible characters — the clean, concise text the transcription guide asks for.',
		example: { correct: 'Hold on tight', incorrect: 'Hold  on tight' },
		authority: 'lyriclint',
		sourceIds: ['G-ADD-SONGS'],
		relatedRuleIds: ['text.multiple-spaces', 'text.invisible-characters'],
		note: "The exact checks are LyricLint's own text hygiene rather than a stated Genius rule: the guide asks for clean, accurate text without naming spacing, so this advisory carries LyricLint's name."
	},
	{
		id: 'guidance.censored-unknown.explicit-version',
		topic: 'censored-unknown',
		title: 'Transcribe the explicit version',
		statement:
			'A transcription follows the explicit version of a song, so a censor mask belongs only where the recording itself censors the word — which even explicit versions occasionally do.',
		authority: 'staff',
		sourceIds: ['G-CENSORED']
	},
	{
		id: 'guidance.censored-unknown.four-asterisks',
		topic: 'censored-unknown',
		title: 'A censored word is four asterisks',
		statement:
			'A word the recording censors out is written as exactly four asterisks, however many letters the word has and however much of it survives the censor.',
		example: { correct: 'Keep that **** away from me' },
		authority: 'staff',
		sourceIds: ['G-CENSORED'],
		relatedRuleIds: ['censored.mask'],
		note: "The linter flags letters mixed into an asterisk mask; a bare asterisk run could as easily be a divider or emphasis, so its length is the transcriber's to check."
	},
	{
		id: 'guidance.censored-unknown.unknown-marker',
		topic: 'censored-unknown',
		title: "A lyric you can't make out is [?]",
		statement:
			'A lyric nobody can decipher yet is represented by a question mark in brackets — `[?]` — and only that form: parentheses are avoided because they already mark ad-libs on Genius.',
		example: {
			correct: 'Counting every [?] till the morning comes',
			incorrect: 'Counting every (?) till the morning comes'
		},
		authority: 'staff',
		sourceIds: ['G-UNKNOWN'],
		relatedRuleIds: ['unknown.marker', 'unknown.improvised-marker', 'unknown.unresolved'],
		note: 'The linter checks the whole convention: recognized nonstandard markers, improvised runs of question marks standing where words would go, and a count of the `[?]` marks a document still leaves unresolved.'
	},
	{
		id: 'guidance.numbers.spelled-out',
		topic: 'numbers',
		title: 'Spell numbers out',
		statement:
			'Numbers are spelled out rather than written as digits, and a multiple of 100 is spelled as it is pronounced — `a hundred`, or `hunnid` where that is what is sung.',
		example: {
			correct: 'I got five of them waiting on me',
			incorrect: 'I got 5 of them waiting on me'
		},
		authority: 'staff',
		sourceIds: ['G-NUMBERS'],
		relatedRuleIds: ['numbers.spell-out'],
		note: "The linter reviews only small standalone digits outside its known digit contexts; everything larger, and every exemption call, is the transcriber's."
	},
	{
		id: 'guidance.numbers.digit-exemptions',
		topic: 'numbers',
		title: 'Some numbers stay digits',
		statement:
			'Digits are kept for proper nouns that carry them, model numbers including firearm and ammunition names, years, phone numbers, terms conventionally written in digits like `24/7`, numerical slang for the police (`5-0`, `12`), counts shortened with `K` that are not multiples of 100 (`24K`), and times.',
		example: { correct: 'Grinding 24/7 like it pays' },
		authority: 'staff',
		sourceIds: ['G-NUMBERS'],
		relatedRuleIds: ['numbers.decade-apostrophe'],
		note: "A decade is one of the digit-kept forms, and the linter checks its written shape: the apostrophe stands in for the century before the digits — `'90s` — never after them."
	},
	{
		id: 'guidance.numbers.times',
		topic: 'numbers',
		title: 'Write times in digits',
		statement:
			"A time is written in digits: a whole number on the hour (`8 a.m.`), a colon only where minutes are named (`7:45 p.m.`), and a digit before `o'clock` (`6 o'clock`); ante and post meridiem abbreviate to lowercase `a.m.` and `p.m.` with periods.",
		example: { correct: 'Meet me at 8 a.m. sharp', incorrect: 'Meet me at 8:00 A.M. sharp' },
		authority: 'staff',
		sourceIds: ['G-NUMBERS']
	},
	{
		id: 'guidance.non-english.lyrics-header',
		topic: 'non-english',
		title: 'Non-English songs may open with a header',
		statement:
			"A song not in English may open with one extra bracketed header for findability — the word `lyrics` translated into the song's own language, the song's name, and any featured artists — and an English song never carries one.",
		example: { correct: '[Letra de "Golondrina" ft. Avery]' },
		authority: 'staff',
		sourceIds: ['G-NON-ENGLISH'],
		relatedRuleIds: ['section.header-unrecognized'],
		note: "Languages differ on the exact wording; the How to Add Songs page for the song's language documents its community's form. The linter accepts such a header as a song's first line instead of misreporting it as an unrecognized song part."
	},
	{
		id: 'guidance.non-english.romanized-separate',
		topic: 'non-english',
		title: 'Romanized lyrics live on their own page',
		statement:
			"Romanized lyrics never join the song's primary page: they get a separate page credited to Genius Romanizations, titled with the artist's name, the song's title, and `(Romanized)`, carrying the release date, audio links, and tags — and omitting featured artists, writers, producers, and every other role.",
		authority: 'staff',
		sourceIds: ['G-ROMANIZED']
	},
	{
		id: 'guidance.non-english.translations-separate',
		topic: 'non-english',
		title: 'Translations live on their own page',
		statement:
			"A translation never joins the song's primary page either: it is hosted on a separate page of its own, formatted per the How to Translate Songs guide.",
		authority: 'staff',
		sourceIds: ['G-TRANSLATIONS']
	},
	{
		id: 'guidance.sourcing.never-copy',
		topic: 'sourcing',
		title: 'Never copy lyrics from another site',
		statement:
			'Lyrics are transcribed, never copied from another lyric website — that is plagiarism. The one exception is lyrics the artist or their team released themselves, on Bandcamp, a video description, press notes, or liner notes; official sheets still carry mistakes, so even those are checked for completeness and accuracy and reformatted to Genius standards before they stand.',
		authority: 'staff',
		sourceIds: ['G-ADD-SONGS']
	},
	{
		id: 'guidance.sourcing.streaming-version',
		topic: 'sourcing',
		title: 'A page follows the streaming version',
		statement:
			"A song's page transcribes the streaming release, so lyrics only a video version carries go in the Q&A rather than into the words; where a video or an album cut differs substantially — different verses, say — it earns a page of its own, titled with `(Video Version)` or `(Album Version)` after the song's title.",
		example: { correct: 'Golondrina (Video Version)' },
		authority: 'staff',
		sourceIds: ['G-STREAMING']
	}
];

/** Guidance entries keyed by their stable ids. */
export const guidanceRegistry: ReadonlyMap<string, GuidanceEntry> = new Map(
	guidanceEntries.map((entry) => [entry.id, entry])
);

/** The topics that actually have entries, in their deliberate learning order. */
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
	return guidanceTopicOrder.flatMap((topic) => {
		const entries = topics.get(topic);
		return entries ? [{ topic, entries }] : [];
	});
}

/**
 * The guidelines a rule's page links, derived from the same `relatedRuleIds`
 * the entries' own meta lines draw — one mapping, read from both ends, so the
 * rule page and the topic page cannot disagree about which convention a rule
 * checks. Landmarks count too: `spelling.standardized`'s guideline is the
 * standardized-spellings table itself, and its anchor is derived through
 * `entryAnchor` exactly as an entry's is — a no-op for every landmark id today,
 * and one derivation rather than two conventions that happen to agree.
 * Entries come out in catalog order;
 * a rule no entry names comes out empty, which is the page drawing nothing.
 */
export function guidanceForRule(ruleId: string): RuleGuidelineLink[] {
	const links: RuleGuidelineLink[] = [];
	for (const topic of guidanceTopicOrder) {
		for (const landmark of guidanceTopicLandmarks[topic] ?? []) {
			if (landmark.relatedRuleIds?.includes(ruleId)) {
				links.push({
					topic,
					topicTitle: guidanceTopicTitles[topic],
					anchor: entryAnchor(landmark.id),
					title: landmark.title
				});
			}
		}
	}
	for (const entry of guidanceEntries) {
		if (entry.relatedRuleIds?.includes(ruleId)) {
			links.push({
				topic: entry.topic,
				topicTitle: guidanceTopicTitles[entry.topic],
				anchor: entryAnchor(entry.id),
				title: entry.title
			});
		}
	}
	return links;
}

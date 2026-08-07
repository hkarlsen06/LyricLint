/**
 * What each rule family is *about*, in one short statement of the convention.
 *
 * The reference is derived from the linter, and that is right for everything a
 * rule page says: a hand-written copy of an explanation drifts from the rule
 * inside a release. It is wrong for the one question the index could not
 * answer. A reader arriving from the landing page wants to know what the
 * conventions *are*, and what the index gave them was 55 checks — the shape a
 * linter decomposes into, which is one rule per thing that can be detected,
 * ignored, fixed and cited independently. Eleven separate header rules is
 * correct for an engine and useless to somebody who has one question: how do I
 * write a header?
 *
 * So this is the connective tissue, and it is deliberately the *only* written
 * part. Each section states the convention; the checks under it stay derived,
 * named by their own titles and linked to their own pages. That is the same
 * trade `RulePolicyCase.title` already makes, bounded the same way: **nothing
 * here restates a rule's message, explanation or fix.** If a sentence here
 * would have to be updated because a rule changed its wording, it is written
 * wrong.
 *
 * **Where LyricLint goes beyond what the reviewed sources state, it says so.**
 * Three families carry a check the Genius guidance does not actually mandate —
 * the blank line above a header, one space between words, and the period at the
 * end of a line — and each of those sentences hedges here for the same reason
 * the rule's own explanation hedges on its page. A guide that presented our
 * preferences as somebody else's policy would be worth less than no guide.
 *
 * A module of its own, with no imports, for the reason `+layout.server.ts`
 * gives at length: `reference.ts` pulls the parser, all 55 rules and the
 * ~330KB language-detection corpus, so the index page cannot import it. This is
 * a `Record` of strings — the page imports it directly and it costs the other
 * 54 prerendered payloads nothing, because it never rides on a group.
 *
 * Exhaustive, and `reference.test.ts` fails for a family with no entry, exactly
 * as `groupTitle` and `groupRank` do: a rule family added without a place in
 * the guide would land in the index with no statement of what it is for.
 */
export const groupGuidance: Record<string, string> = {
	section:
		'Every distinct song part carries a header of its own line, in square brackets — ' +
		'`[Verse 1]`, `[Chorus]`, `[Bridge]` — naming a part from the reviewed catalog for the ' +
		'language you are transcribing in. Distinct verses are numbered in order, a part repeated ' +
		'word for word stays under one header rather than being written twice, and blank lines ' +
		'separate parts rather than splitting one part into stanzas. LyricLint also suggests one ' +
		'blank line above each header — no fewer and no more — which makes a long transcription ' +
		'easier to scan but is not something the Genius guidance requires.',
	spelling:
		'Lyrics are written in standardized spelling rather than in the spelling of a text ' +
		'message. Where a word has a reviewed preferred lyric form Genius uses it, and each ' +
		'transcription language has its own reviewed source naming the misspellings that language ' +
		'sees most. A deliberate pronunciation — a word sung differently from how it is written — ' +
		'is a separate matter and is transcribed as it is sung.',
	syntax:
		'Two marks carry structure and nothing else does: square brackets around a section header, ' +
		'and italic or bold around a performer’s lines. Both have to be closed. An underline tag, ' +
		'a stray bracket or a half-open wrapper is text the parser cannot read as either, so the ' +
		'section it was meant to open never exists.',
	performer:
		'Where more than one voice sings a section, the header carries a legend naming them — ' +
		'`[Chorus: Avery & Blair]` — and each voice takes one of four style slots: plain, italic, ' +
		'bold, and bold-italic. The legend and the lyrics have to agree in both directions: every ' +
		'style used in the lines is named in the legend, and every slot in the legend is used by ' +
		'the lines. Performer names never appear on individual lyric lines.',
	capitalization:
		'Lines begin with a capital and are otherwise written in sentence case. Title case belongs ' +
		'to titles rather than to sung lines, and both of these are reviewed as suggestions ' +
		'because stylization, a line continuing the one before it, and names can all look the same ' +
		'to a linter.',
	punctuation:
		'Lyrics carry the punctuation that changes how a line is read rather than the punctuation ' +
		'that ends a sentence — a question mark on a question, an exclamation mark for delivery. ' +
		'A period closing a line is the one LyricLint suggests removing without the Genius guide ' +
		'stating a ban, so it is always offered for review rather than applied.',
	unknown:
		'A lyric nobody can make out is marked `[?]` — that exact form, brackets included, rather ' +
		'than `(?)` or a run of question marks. It is a last resort and not a shortcut: ' +
		'transcribe everything audible first, and resolve the markers you can before submitting.',
	contraction:
		'A contraction keeps its apostrophe. `Dont` and `wont` are how a contraction looks when it ' +
		'is typed quickly, and the apostrophe is what makes the word read as the one that was ' +
		'sung. Forms that are also ordinary words — `ill`, `well`, `were` — are left alone, ' +
		'because only the singer knows which was meant.',
	quotes:
		'Quotation marks and apostrophes are the straight typewriter kind. The curly ones arrive ' +
		'by pasting out of a word processor, and although they look more finished they are not ' +
		'what Genius stores.',
	adlib:
		'A vocal sitting behind the lead goes in parentheses, and what is inside them is ' +
		'capitalized like any other line. Consecutive ad-libs are separated — a comma where they ' +
		'are distinct calls, a hyphen where they run together as one — and which of the two fits ' +
		'is a judgment about the phrasing rather than something a linter can hear.',
	text:
		'Nothing invisible belongs in a transcription. Trailing spaces and zero-width characters ' +
		'survive a paste into Genius without ever showing in an editor, so they are worth removing ' +
		'even though nothing on screen changes. LyricLint also collapses runs of spaces between ' +
		'words, which is its own hygiene preference rather than a stated rule.',
	grammar:
		'The transcription language’s own grammar applies to the words as they are sung. English ' +
		'capitalizes the pronoun `I` wherever it appears, contractions included; Spanish contracts ' +
		'`a el` into `al` and `de el` into `del`.',
	repeat:
		'A repeated part is written out in full. `[Chorus x2]` and similar counts are a note to ' +
		'the transcriber rather than a lyric, and a reader who came for the words finds a ' +
		'placeholder instead of them.',
	symbols:
		'A symbol standing in for a word is spelled out — `&` is written `and` — because it is ' +
		'sung as a word. A symbol inside a brand or an artist’s name is part of the name and stays ' +
		'exactly as it is.',
	numbers:
		'Small numbers are spelled out, because they are sung as words. Numbers that read as data ' +
		'rather than as words — times, money, percentages, years, anything joined by a separator — ' +
		'stay in digits.',
	censored:
		'A censored word is masked with exactly four asterisks, and the mask replaces the whole ' +
		'word rather than some of its letters. A partly masked word leaves enough spelling to read ' +
		'and is neither one thing nor the other.',
	'sound-effect':
		'A sound effect is wrapped in asterisks — `*gunshot*` — which is what tells a reader it is ' +
		'a noise on the recording rather than a word somebody sang.',
	line:
		'A lyric line is a line as sung. There is no character limit, but a line carrying several ' +
		'clauses is usually several lines run together, and where to split it follows the phrasing ' +
		'on the recording rather than any count.',
	language:
		'The selected language pack decides which headers, spellings and grammar rules apply, so ' +
		'it has to be the language the lyrics are in. LyricLint recognizes the language locally, ' +
		'from statistical analysis of the text and without sending it anywhere, and says so when ' +
		'the two disagree.'
};

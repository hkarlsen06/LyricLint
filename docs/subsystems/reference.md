# The reference sections: /rules/, /guidelines/, and the split shell they share

Touches: `src/lib/rules/reference.ts`, `src/lib/rules/reference-search.ts`,
`src/lib/rules/reference-guide.ts`, `src/lib/ui/site/SectionSplit.svelte`,
`src/lib/ui/site/reveal-selected.ts`, `src/lib/ui/site/rule-search.svelte.ts`,
`src/lib/guidance/guidance-search.ts`, `src/lib/ui/site/GuidanceIndex.svelte`,
`src/lib/ui/site/guidance-reading.svelte.ts`, `src/lib/ui/assistant/AssistantSpark.svelte`,
`src/routes/(site)/rules/`, `src/routes/(site)/guidelines/`

## The rules

- `title` on `RulePolicyCase` is the one written string in the reference; it names the
  failure, not the convention; `variant` collapses per-language families in the index only
  (URLs, sitemap, search stay exhaustive). `reference.test.ts` pins uniqueness, length,
  and the guide's no-restating rule.
- `/rules/` is the guide (one section per family, `groupGuidance` prose with no imports);
  the list is the finder. `groupOrder` and `popularRuleIds` (ceiling: six) are editorial
  judgments, written down and pinned — never derived from registry order or an invented
  metric. Both lists are exhaustive and throw on an unknown family.
- Search matches everything a page says (examples, citations, lookup-table prose via
  `lookupSearchTerms`) — the citation omission was measured wrong once; a claim about how a
  set is distributed is a measurement, not a judgment. Filtered, never ranked; `foldForSearch`
  strips marks, folds quotes, lowercases last.
- Matches are marked: `foldWithOffsets` runs the fold per character (folding changes
  lengths), overlapping runs merge, `<mark>` in `--color-text-selection` with
  `color: inherit`, and a mark inside a link gives up the accent (AA).
  `SearchHighlight.svelte` is one unbroken template line — leading whitespace becomes real
  text nodes inside `<pre>`; both the component test and the e2e spec measure rendered text
  against input.
- Query state is module state (siblings with nothing to hand each other), never the URL;
  component tests must reset it. Chip counts are over the query alone and blind to the
  chips; offered chips are decided over the whole set; a zero chip stays (unlike the linter
  panel, whose set is the document's own).
- `SectionSplit` owns the grid, the collapse, the back bar, and the view transition: names
  go on the columns (never on `main` inside a scroll port — snapshots are unclipped), the
  detail column is named by view to encode direction, the fourth gate is `stacked()`.
  Equal columns are what keep the swap a pure translation. The back bar is pinned, bleeds
  across the lane variables, and prefers `history.back()` where the index is behind it.
- `revealSelectedRow`: opening by URL scrolls the list to the row (clearing the measured
  finder, moving scroll not focus); pressing a row moves nothing. The guidance list also
  *follows* the reading position (`guidance-reading.svelte.ts`, midpoint arithmetic,
  nearest-edge smooth nudge) — the hash is only the pre-hydration fallback.
- Guidance ↔ rules linking is two-way and derived from one source (`relatedRuleIds` /
  `guidanceForRule`); entry meta-line rule ids open in a new tab (the catalog is read
  mid-scroll); the rules section's own links stay in place. `language.selection-mismatch`
  and the three Harper ids are deliberately named by no entry.
- The assistant's entry is `AssistantSpark.svelte`, owning the whole finder row in both
  sections; the wand toggles search ↔ ask (FLIP wipe, one duration/easing, DOM order follows
  visual order, reduced-motion exempt), Enter opens the shared modal via `openWithQuestion`,
  and the mode swap must not eat the query. Pinned in `AssistantSpark.svelte.test.ts`.
- Harper is named on the index and given no pages; `style` is in `groupTitles` for the
  ignored-rules footer alone.

## Decision record

### A rule is named for what it catches, and `/rules/` is a guide with a finder beside it

The rule reference is derived from the linter rather than written about it, and for a long time
that included what each rule was _called_ — the index row and the page's `<h1>` were both the
diagnostic `message`, which is written about the occurrence in front of the reader. Fifty-two of
those in one column is not a reference: `«definately» is a common English spelling error` names
one misspelling out of a list the rule holds hundreds of, and `Use «I'ma» instead of «Imma»` reads
as a finding somebody left lying around. The page said what the linter would say and never said
what the rule was.

**So `title` is the one written string in the whole reference, and it lives on the policy case.**
Everything else a page states is produced by running the rule against its reviewed example, which
is right and stays right — a hand-written copy of an explanation drifts from the rule inside a
release. A title is the exception because there is nothing to copy from: a rule has no name of its
own, and both candidates for standing in for one fail. The message is about the occurrence, and
`ruleName()`'s derived form reads as the ID it is built from (`Spelling: english common`). It goes
on `RulePolicyCase` rather than in a map keyed by ID so the _type_ is what enforces it: a rule
already ships with a reviewed example or it does not ship, and now the same object is where its
name has to be. `reference.test.ts` pins that the titles are unique, trimmed, under 44 characters,
not a sentence, and never equal to the message.

#### The title names the failure, not the convention

The first set of written titles restated the rule, and inside a family that made every row the same
row. Eleven section-header rules read `Every song part has a header`, `Name every section header`,
`Song part names go in brackets`, `A blank line before a header` — eleven paraphrases of one
instruction, carrying the same three nouns, in three different grammatical moods. Somebody who
already knew the rules could tell them apart. Nobody else could, which is the wrong way round: the
reader who needs this column is the one who does _not_ know them.

**What separates these rules is what each one finds, so that is what the title says.** `A section
with no header`, `Brackets with no song part in them`, `A header written as a plain line`, `No blank
line above a header` — the same eleven, distinct at a glance. This is the workbench's own idiom
arriving in the reference: a diagnostic card leads with what is wrong, not with the rule's name.

The register is the middle one of three, and both neighbours were shipped and rejected. The
`message` is too specific, because it is about one occurrence; `ruleName()`'s derived form is too
generic. A title is the thing in between.

#### One convention per language pack is one row

Eight of the eleven rules in the Spelling family are the same rule instantiated per language —
`A common English misspelling`, `A common Norwegian misspelling`, and six more. They look alike in
the index because they **are** alike, and no amount of retitling touches that: a transcriber works
in one language, so seven of those eight rows are noise to every reader who ever sees them. It is
the second group on the page, so the repetition landed on the first screen.

The engine needs them apart — different data, different citations, a different `check`. The reader
does not. Publishing the registry's decomposition one-for-one is the same mistake `groupOrder` was
making when it was registry order: an implementation detail deciding what is on the reader's first
screen.

`RulePolicyCase.variant` is the declaration and `ruleIndexEntries` is the collapse. Four things it
owes:

- **Only the drawing collapses.** `groupedRuleReferences()` stays exhaustive, so the sitemap, the
  prerender entries, the structured data and the search all still see all 60 rules. Every
  `/rules/<slug>/` URL is untouched, and the build output was diffed against the previous one to
  prove it rather than argued about.
- **A family takes the position of its first member**, so collapsing never reorders the group
  around it, and the packs inside keep registry order.
- **A family of one draws as an ordinary rule row.** Under a query that keeps only the Norwegian
  rule, a family row is a heading over a single link — one press wearing two rows, which is what
  `Fix all 1` refuses in the workbench. The rule's own row says more, because it carries the
  message and the severity.
- **The shared meta line is drawn only where every member agrees.** All eight are `suggestion` with
  a previewed fix today; a family that disagreed would be stating one member's severity over the
  rest, so it states none.

`family` and `language` are written on the case rather than derived from the ID, because
`spelling.arabic-common` is not a _common misspelling_ rule in the sense the other five are and its
own title says so. What makes the eight one family is editorial, exactly as `groupOrder` is.

#### `/rules/` is the guide, and the list beside it is the finder

The detail column at `/rules/` used to be a page **about** the list: how the reference is derived,
how to search it, which chips narrow what. All true, and all written for a reader who already knew
what they were looking for. The one this section actually has to serve arrives from the landing
page not knowing the conventions at all, and was handed 60 checks and an explanation of the
filtering — the catalog is a list of failures a linter detects, and it was being presented as
though it were a guide.

So the conventions are the content now: one section per family, in `groupOrder`, each stating what
to do, with its rules underneath as the ways it goes wrong. `groupGuidance` in
`rules/reference-guide.ts` is that prose, and three things bound it:

- **It is the only written prose in the reference, and it must not restate a rule.** A sentence
  there that quoted a message or an explanation would have to be re-edited whenever that rule
  changed its wording, with nothing to say so — which is the drift the whole reference is derived
  to avoid. `reference.test.ts` asserts no guidance string contains any rule's message or
  explanation.
- **Where LyricLint goes beyond the reviewed sources, the guide says so.** Three families carry a
  check the Genius guidance does not mandate — the blank line above a header, one space between
  words, the period at the end of a line — and each of those sentences hedges here exactly as the
  rule's own explanation hedges on its page. A guide presenting our preferences as somebody else's
  policy is worth less than no guide.
- **It is a module with no imports.** `reference.ts` pulls the parser, all 60 rules and the ~330KB
  language-detection corpus, so an index page cannot import it — that is what `+layout.server.ts`
  exists for. A `Record` of strings is importable directly, and it never rides on a group, so it
  costs the other 59 prerendered payloads nothing.

**The checks under each convention are an interpunct run, not a bulleted list.** Nineteen bulleted
lists is the column beside this one drawn a second time; inside prose the links read as the ways
the sentence above them goes wrong, which is the whole difference between a guide and a finder.
The same collapse applies, so the spelling section reads `Spellings the reviewed guides correct
(English, Norwegian, …)` rather than eight more names.

**Every separator in that run is a value, not markup whitespace and not generated content**, and
both alternatives shipped first. Markup whitespace is at the mercy of the formatter: the run read
`standardizes· A spelling`, with the space on the wrong side of the interpunct, because a line
break landed after the `</a>`. `::before` is worse — the brackets around the language packs were
generated content for one round, which draws them for a reader with eyes and leaves
`correctEnglish, Norwegian` for a screen reader. Punctuation separating two facts is content. The
constants exist because a string literal in a mustache is `svelte/no-useless-mustaches`, and the
rule is right about every other case.

**The row leads with the title and keeps the message under it**, because the message is still the
most useful thing on the row once the reader has stopped on it — it is what the workbench will
actually tell them. The detail page leads with the title too, and quotes the message beneath the
_flagged example_, which is the one place on the page where a statement about one occurrence is
true without qualification. The `<h1>`, the `<title>`, and the row that opened it are now one
string; a heading disagreeing with the row pressed to reach it reads as having landed somewhere
else.

**Finding a rule is by symptom, because that is what the reader has.** Nobody arrives knowing a
rule's name — they know a bracket, an apostrophe, or the word the linter underlined. So the query
is matched against everything a page says, **the reviewed examples included**, which is what makes
`definately` and `Imma` land on the rules that flag them. Three folds on both sides of the
comparison (`foldForSearch`), and each answers a way this page's own text would otherwise refuse
an honest search: combining marks come off, so `ca va` finds `ça va`; typographic quotes fold to
the typewriter kind, so `don't` finds `don’t` on the pages that are _about_ the apostrophe; case
goes last, with `toLowerCase` rather than a locale fold, because nine languages have no one locale
to be right for. Every term has to match — two words narrow.

**Filtered, never ranked.** The index is grouped by rule family and a relevance order would have
to break that grouping, so short terms matching a few extra rules is the accepted cost. A group
that keeps nothing is dropped rather than left standing as a heading over no rows.

**The groups themselves are ranked, and the ranking is editorial rather than measured.** Their
order used to be each family's first appearance in the registry, which is the order the _pipeline_
takes a document apart — so `language.selection-mismatch` was the second heading on the page. That
is one rule, and it is the one a reader only ever meets by having chosen the wrong language pack;
above it, and above every spelling, sat nothing anybody arrives here looking for. The reader's
first screen was decided by an implementation detail.

`groupOrder` in `reference.ts` is the ranking, and what it is ranked by is how often a transcriber
_meets_ that family — headers, spellings, the markup itself and the voices lead; then the
conventions that apply line by line; then the narrow families one particular song runs into; and
last the two that exist only under a condition the reader has to have hit. It cannot be ranked by
anything better than that, and the reason is the product: LyricLint measures nothing, so there is
no "most accessed" to read off. Sorting by an invented number would be the automatic anchor stamp
again — plausible, and wrong by an amount nobody can see — so this is a judgment, written down,
and `reference.test.ts` pins the head and the tail of it so a reorder is a deliberate edit rather
than something registry order does behind the page's back.

**Order _within_ a group stays registry order**, which is already written strongest-first inside
each family: `spelling.standardized` leads the spellings and the nine language-specific ones trail
it. Hand-ranking all 60 would be a great deal of judgment for very little movement.

The list is **exhaustive and throws** for a family it does not know, exactly as `groupTitles` does.
Prerendering every page is part of the build, so a rule family added without a place in it fails
the build rather than landing silently at one end of the index.

**And six of them are drawn twice, at the head of the column.** `groupOrder` gets the right family
onto the first screen; `Popular` gets the right _rows_ onto it. Section headers is eleven rules
deep, so ranking it first still opens the page on eleven headings' worth of scrolling before the
reader meets a spelling — and the two conventions a first-time transcriber actually has to be told
are one rule from each end of that.

`popularRuleIds` in `reference-search.ts` is the list, and it is curated rather than counted for
the reason `groupOrder` is. What its members have in common is that each is a Genius convention
somebody has to be _told_ — brackets around a song part, a legend before a styled voice, `[?]` for
a lyric nobody could make out — as against a rule whose own message is the whole of what there is
to know about it. `capitalization.line-start` is absent for exactly that reason, and would
otherwise be the obvious seventh.

Four things it owes:

- **Six is a ceiling, not a round number.** This block costs the real index its own place on the
  first screen, and past about six it _is_ the first screen, which defeats a shortcut into a list.
- **It draws only while nothing is narrowing the list.** A search is the reader saying what they
  are looking for, and a duplicated shortcut standing over their answer is noise — it would also
  put six rows in front of a readout counting a different number.
- **One row implementation, rendered by both lists.** The row is a snippet, because a second copy
  of that markup is the drift `DiagnosticActions` has a whole section about, and the copy that
  drifted would be the one at the top of the page.
- **Both copies of the open rule carry `aria-current`.** They are the same link to the same page,
  and a shortcut that refused the marker would be the one row in this column where "you are here"
  is false. `revealSelected` therefore finds the popular copy first, which is already on screen,
  so a deep link to one of these six scrolls nothing and is marked immediately.

`rows()` in `RuleIndex.svelte.test.ts` excludes `.rules__popular`, or every assertion about "the
whole list" is six rows too many — which is also the reason the block is not a twentieth entry in
`groupedRuleReferences()`: that value is prerendered into every payload in the section and read by
the sitemap, and a rule listed twice there is a duplicate URL rather than a shortcut. **The e2e
spec's own locator excludes it in the same place**, and did not for a while: `total` counted 61
rows against a readout that counts 55 rules, so the two disagreed on a page where both were right
about their own thing.

#### What is searchable is what the page says, and the page says which part matched

The haystack is the rule's page read top to bottom — its name, the linter's wording, the
explanation, both reviewed examples, the fix's label, the citations under them, and for a
table-shaped rule the table's own prose and every form in it. That is the whole of what the reader
can see, and it is the only definition of "searchable" that does not have to be re-argued each time
a page grows a section.

**A table-shaped rule is where that was a hole rather than a nicety.** For those eight the table
_is_ the page: the reviewed example demonstrates one of thirty rows, so most of what the reader is
looking at is the conditions written down the others — `Not where the word means cousin`, `British
English uses till`, `The closing curly single quote`. None of it was reachable by typing the words
in it, which is a search that answers for a page's headings and not for its body.

`lookupSearchTerms` carries it, and **the conditions are deduped**, which is what keeps the
addition cheap: a gate is written once and repeated down the table, so 29 reviewed spellings carry
12 distinct sentences between them. That is 5.8% of the layout payload against the full table's
16.2% — the ratio the reference has always been split on, since this value rides into all 60
prerendered pages and the table itself is loaded by the one page that draws it.

**The citations were left out of it once, and the argument was wrong by an amount that could have
been measured.** The reasoning — written into this file, which is why it is being corrected here
rather than quietly deleted — was that all 60 rules cite the same handful of Genius pages, so a
citation term would group the index rather than narrow it. They do not. The most-cited page title
covers 18 rules and is `Use song part headers`, where landing on the eighteen header rules is a
correct answer rather than a grouping; every other title covers three or fewer, and the 47 distinct
section titles are as specific as `Reviewed Norwegian section-header vocabulary`. What the omission
actually cost was a reader looking at a link reading `Song Headers in Different Languages`, typing
`languages`, and being told **no rule matches this search** — the precise distrust this section
exists to prevent, produced by the section itself. `languages` returns 8 of 60 now.

That is also the general lesson, and it is the one `groupOrder` and the automatic anchor stamp
already state from other directions: **a claim about how a set is distributed is a measurement, not
a judgment**, and one made by eye is wrong by an amount nobody can see. What is left outside the
haystack is severity and fixability, which the chips own — a control the reader can already see —
along with the sentences the page writes _about_ a fix, which are identical on every rule that has
none and are therefore the fixability chip wearing words.

**Which means `SourceLink.svelte` takes an optional `text` snippet.** A citation that matched and
draws no mark is the same complaint arriving from the other side, and the marker cannot simply be
reached for from inside that component: `src/lib/diagnostics/` sits outside `src/lib/ui/` on
purpose, because the editor may not depend on the shell and the linter's popover draws this same
block. So the surface that knows about a query passes one in, and the two that do not — the popover
and the tools panel — get the text.

**And a mark inside a link gives up the accent.** Measured, accent blue on `--color-text-selection`
is 3.92:1 in the dark scheme where the body colour on it is 9.28:1 — under AA, on the one element
added to help somebody read. The underline runs through the mark and the external-link glyph is at
the end of the same link, so what says "link" here was never the colour alone, which is this
system's own rule about colour applied to the one run of a link that has a second thing to say. The
e2e spec compares the marked text's computed colour against the page's body colour rather than
restating a ratio.

**A rule opened out of a search marks what was searched for.** `Standardized lyric spellings`
matching `cousin` is a true answer and an unreadable one: the word is in row three of a
twenty-nine-row table, several screens down, and the reader has to find it themselves. This is the
same argument the workbench makes by previewing a fix as a diff — show it rather than making the
reader ask — and it is what closes the loop the widened haystack opens, because a page that can
match on any of its own text has to be able to say _which_ of it matched.

- **The query is module state** (`ui/site/rule-search.svelte.ts`), and it has to be. The list and
  the rule are sibling columns under the section's layout with nothing to hand each other, so the
  component that takes the query cannot be the one that owns it. What that costs is a query
  surviving a trip out of the section entirely — and nothing about that state is hidden, since the
  field is showing it and the readout under it says `3 of 60 rules` with `Clear filters` beside it.
  It also means **a component test has to reset it**: `RuleIndex.svelte.test.ts` would otherwise
  pass or fail on whatever the test above it happened to type.
- **The fold is run one character at a time, because the plain one changes the string's length.**
  NFD splits a letter into a letter and a mark, the mark is then dropped, and a few characters
  lowercase to more than one — so `ça` folds to `ca` and an offset found in the folded text names
  nothing in the text on screen. `foldWithOffsets` records, per folded code unit, the span of the
  source character behind it, so a match resolves to the first character's start and the last one's
  end. Whole characters only: half a `ç` is not something a `<mark>` can hold.
- **Every term is marked, and overlapping runs are merged.** Every term had to match for the rule
  to be listed at all, so marking one of them answers half the question. Two terms that meet in the
  middle of a word are one mark rather than two with a seam between them.
- **`<mark>`, and `--color-text-selection`.** The element's semantics are exactly this — text marked
  for reference to something outside the document — which also puts the fact in the accessible tree
  where colour cannot go. The tone is the system's one answer for a run of text picked out of a
  page, already opaque, already vetted to leave the glyphs on it readable, and already restated in
  the `.site` palette, so this adds nothing to either scheme. The yellow a browser draws `<mark>` in
  is what `--color-warning-soft` means here, and this page is covered in severities. `color:
inherit` is not optional: a `<mark>` takes the browser's own black `marktext`, which over the dark
  scheme's selection blue is text nobody can read, on the one element added to help somebody read.

**`SearchHighlight.svelte` draws text and nothing else — no wrapper — so it stands inside a
heading, a `<pre>`, a muted `<span>` and a run of code segments without any of them knowing it is
there. Which makes the whitespace in its template load-bearing.** Svelte does not trim a template
that opens with a comment node, so the markup around the comment that first stood over the block —
the newline under the script, the blank line, the indentation — came out as a real text node in
front of every string it drew. In the reviewed examples, which are set in a `<pre>`, that is three
lines of a transcription nobody typed at the top of every rule page on the site. The comment is in
the script now and the block is one unbroken line. **Both the component test and the e2e spec
measure the rendered text against the string that went in**, because it is a formatter that will
break this and it looks exactly like working markup when it does. It is the base both reference
sections share — `RuleSearchHighlight.svelte` and `GuidanceSearchHighlight.svelte` are one-line
wrappers binding it to their own section's tokens, so the guidance catalog marks its hits with the
same element, the same fold and the same whitespace discipline, and its `.site-hit` mark is
`site-`prefixed because it stopped being one section's own.

**Opening a rule by its URL scrolls the list to it; pressing a row in the list does not.** A rule
_is_ a URL, so most arrivals here are not presses on this column — a shared link, a search result,
a reload, a link from elsewhere on the site. The row is marked `aria-current` and drawn recessed
the whole time, which is the entire "you are here", and forty rows below the fold it says that to
nobody: the column then reads as a list with nothing selected in it, beside a page that plainly
came out of one of its rows.

Four things it owes, and two of them are the reasons it is arithmetic rather than
`scrollIntoView`:

- **The shell says when and the index says how.** `SectionSplit.svelte` already owns what a
  navigation means for these two columns — the detail goes to its top, the list must not move — and
  this is the third case in that same hook. `pressedARow` is its predicate, and it is deliberately
  the whole section rather than the index page alone: `arrivedFromIndex` beside it answers a
  different question, "is the list one entry back in history", for the back button, and going from
  one rule to another is a press on a row that never passes through `/rules`.
- **A row already wholly in view is not moved**, which is the other half of the rule that pressing
  a row may not move the list the row is in. Nothing has to trust the predicate for the ordinary
  case.
- **The finder is pinned over the top of this column**, so a row the browser would call visible can
  be entirely underneath it — `block: 'nearest'` knows nothing about that and would leave it
  covered. The free space starts at the finder's own measured bottom edge, measured rather than
  restated as a length, because the chips wrap and the readout comes and goes.
- **It moves the scroll and not the focus.** The reader opened a rule to read it, and focus parked
  in a `<nav>` of sixty links would send their first Tab away from the document they came
  for — the same reason the workbench leaves the editor unfocused after a fix.

Below 62rem there is nothing to do: the columns stack and the list is `display: none` while a rule
is open, which `revealSelected` reads off the row having no box at all rather than by restating the
breakpoint. `RuleIndex.svelte.test.ts` drives it against a real scroll port at 1100px and asserts
both halves — the deep-linked row clears the finder, and a row already in view moves the column by
nothing.

**Two axes, one chip, and the chip is the linter panel's own.** `.filter-chip` moved to
`controls.css` when this shipped: the same control filtering the same severities out of a list,
drawn twice, is two copies of the dashed-and-struck-through unpressed state that carries the whole
meaning — and the copy that drifted would be the one nobody is looking at. Pressed means "I am
looking at this kind", exactly as in the panel.

**The fix axis is three chips and not one “only rules with a fix” toggle**, and that follows from
sharing the visual. Unpressed reads as _excluded_, so a struck-through `Fixes automatically` says
the opposite of what switching it off means. As three shown/hidden chips it also answers the
better question: keep `No automatic fix` alone and the list is every rule that is a judgment call.
The three labels are the words the rule's own page already uses.

**A chip's count is over the query alone and blind to the chips.** Read the other way it would be
the number of rows that chip is currently contributing, so pressing one back on would be a press
towards a zero, and the two rows of chips would chase each other's numbers on every toggle. Read
this way a count is what pressing the chip puts back — which is how the linter panel counts its
own severities. Which chips are _offered_ is decided over the whole set rather than the query, so
a chip cannot vanish as the reader types and take its axis with it; a chip reading zero is what
says the query excluded it.

**That last part is the one place this row and the linter panel's differ on purpose.** There a
chip with a zero on it is dropped, because the set behind it is the document's own findings and a
kind with nothing in it is nothing to filter. Here the set is fixed — every rule that exists — and
the zero is a fact about the _query_, which the reader is in the middle of typing. Dropping it
would take the axis off screen mid-keystroke and leave nothing to say why the list is short.

**The readout draws only while something is narrowing the list**, because `60 of 60 rules` is a
count that could not have been otherwise and the lede beside the column already states the total.
It carries the count at one end and `Clear filters` at the other — a lone control in half a row of
empty gutter is the other way this row fails. Nothing matching is a sentence on the canvas, not a
box.

**None of it is in the URL, and all of it is in the layout.** A filter is a way of looking at the
list, not a place, and a history entry per keystroke would make the back button walk the query
backwards one letter at a time. Because `RuleIndex` is mounted by the section's layout — the same
thing that keeps pressing a row from rebuilding the list — a reader who searched, opened a result,
and came back finds the search they were in the middle of.

**The finder is pinned on a wide screen and static on a narrow one.** There the column is its own
scroll port and a field forty rows above the reader is a field they travel back to; here the
columns stack, the index sits _below_ the rule being read, and a sticky bar would engage after a
whole page of scrolling and then follow them down glued to a viewport with no chrome in it.

**Harper is named on the index and given no pages.** The workbench runs a local English
proofreader beside these rules, and its findings arrive as `spelling.harper`, `style.harper` and
`grammar.harper` — diagnostics like any other, and not in this set. A rule earns a page by citing
a reviewed Genius guideline and carrying an example a person has checked; Harper's suggestions
cite Harper, and its list of them is its own to change. Saying so on the page is cheaper than a
reader concluding the reference is incomplete. `style` is in `groupTitles` for that group alone —
it will never have a page, but `ruleName` reads the same map, and without an entry the
ignored-rules footer printed the raw ID at the reader.

Implementation: `title` and `variant` on `RulePolicyCase` in `rules/catalog/policy-cases.ts`,
`groupOrder` in `rules/reference.ts`, `groupGuidance` in `rules/reference-guide.ts`,
`rules/reference-search.ts` (the fold, the filter, the counts, the popular list, `ruleIndexEntries`
and the highlight arithmetic — pure, so neither the component nor the page holds logic of its own),
`revealSelectedRow` in `src/lib/ui/site/reveal-selected.ts` (shared with the guidance catalog's
index) with its trigger in `src/lib/ui/site/SectionSplit.svelte`, the guide in
`routes/(site)/rules/+page.svelte`, and `.site-finder`, `.rules__family`, `.rules__checks` and
`.site-hit` in `site.css`. The shell itself — the grid, the choreography, the back control — is
the next section's subject.

### The reference sections share one split shell, and opening a page is choreographed

`/rules/` and `/guidelines/` are the same arrangement — a searchable index column beside a reading
column — and they are one implementation, because a second section arriving is exactly when a
private layout starts to drift. `SectionSplit.svelte` owns the grid, the narrow-screen collapse,
the back control, what a navigation means for each column, and the view transition; a section
supplies its index component (`RuleIndex`, `GuidanceIndex`), which renders `.site-split__index`
itself and shares `revealSelectedRow` in `reveal-selected.ts` and the `.site-finder` idiom. The
shared vocabulary in `site.css` is `.site-split*`, `.site-finder*`, `.site-index__*` and
`.site-run__message`; anything still `rules__`- or `guidelines__`-prefixed is that one section's
own. `data-section` on the split exists for exactly one such thing, the guidance wash's paint lane
below.

**The index view leads with the welcome page, not the list.** At `/rules/` and `/guidelines/` the
intro — the guide, the tier ladder — takes the left column and the list rides the right; opening a
page swaps them, so the page arrives where the list was and the list crosses to the left. The grid
areas are read off `data-view` structurally, so no page carries a naming class and a new section
gets the whole convention for free.

**The two columns are equal width, and that is what makes the swap honest rather than a preference.**
Unequal, both of them change _size_ as well as position on every navigation: the transition below
stretches one snapshot against the other, and — the half that outlives the animation — each scroll
port reflows its own content at the new width, so the offset the reader left it at lands somewhere
else. The pair was `1fr` and `34rem`, which at this measure came to roughly 35rem and 34rem anyway,
so what equalizing gives up is about a rem.

**Opening a page is a view transition, and the names are on the columns rather than on what is
inside them.** `SectionSplit` starts it in `onNavigate`, behind four gates: `document.startViewTransition`
exists, reduced motion is not requested, both ends of the navigation are inside the section —
leaving for another section changes the whole shell, and animating half of it would read as the
site tearing — and the columns are still columns.

**Naming the page instead was the instability, and the markup looked right.** `.site-split__detail >
main` carried the name, keyed off `data-view` so the intro and an open page were named apart and
could each be given a leave and an arrive of their own. A view transition snapshots a named element
**unclipped by its ancestors**, and `main` lives inside a scroll port — so a rule or a guideline
several thousand pixels long was captured whole, positioned at its own border-box origin, which for
a column scrolled past its first screen is above the viewport, and painted over the entire window
for the length of the animation. Nothing in the resting layout says so, and the taller the page the
worse it read. The columns are the boxes that actually move and each clips its own overflow, so a
snapshot is the screenful the reader can see and nothing else.

**The ride is a push seen through a slit, and the names encode its direction.** The three views a
section can show — intro, list, page — behave as one strip of paper, and a navigation pulls the
strip one slot: opening a page pulls it left — the intro out through the container's left edge, the
list from the right slot to the left one, the page in through the right edge — and going back pulls
the same strip right. The list is named once (`section-index`) and needs no keyframes: the default
group morph is exactly its one-slot journey, and equal columns are what keep it a pure translation.
The detail column is named **by view**, `section-intro` against `section-page` — the view-keyed
naming coming back on the box that clips its own overflow rather than on the `main` inside it — and
that is what encodes the direction without a line of script: a navigation captures each of those
names on one side of the swap only, so the intro is an exit and the page an entrance, and going
back lands them on the other side, which reverses the slides with it. A press from one detail page
straight to another captures `section-page` on both sides — the pair the `:only-child` selectors in
`site.css` deliberately skip — so neither column moves and only the contents cross-fade, which is
the in-place change that move deserves. The back bar rides inside the page's own snapshot, so it
arrives with the slide rather than popping in over one.

**The slit is `overflow: clip` on the two image-pairs, and the easing is the pull.** A snapshot is
unclipped by the container, so the exiting column would otherwise glide across the canvas beside
the page and pop off whole at the transition's end — clipped to its own slot, it disappears at the
edge it is pulled through, which is what makes the motion read as paper under a mask rather than a
card flying over one. `--ease-in-out-cubic` exists for this travel: `--ease-out-quart`'s full-speed
launch is right for a control answering a press and reads as thrown when a whole column crosses the
page, so the pull gathers and settles instead. Every pseudo takes `--duration-slow` and
`--ease-in-out-cubic` together, or the images outlive the box they are painted in — the browser's
own default is 250ms, ten past the token — and the slides carry `animation-fill-mode: both` for the
same ten milliseconds, because the root's default cross-fade keeps the transition alive past their
end and a slide fallen back to base styles would draw the exited column back over the arrived list
for exactly that long.

**And the fourth gate is the one that was missing.** Stacked, there is no journey to animate and
three things are true at once that a transition cannot survive: the list is `display: none` while a
page is open, so a named column vanishes mid-capture; the document rather than the column is the
scroller, so `afterNavigate` sends the whole page to the top _under_ the animation; and both columns
occupy one grid area, so the journey the names describe does not exist. That is the arrangement a
reader is in when they **tap** a row, which is why this read as unstable exactly where it was least
affordable. `stacked()` is that question, read off the detail column giving up its own scroll port
rather than restating the breakpoint in a second place — the same signal `afterNavigate` already
used to decide which scroller to send to the top.

**The back control draws at every width, and the choreography is why.** It began narrow-only, when
the index view was still on screen beside an open page; the moment the swap pushed the welcome
view off, nothing brought it back. `All rules` / `All guidelines` sits quiet at the top of the
open page — pinned there on a wide screen, which is its own paragraph below — prefers
`history.back()` where the index is genuinely behind it — a popped entry keeps the scroll the
reader left it at — and `goto`s a fresh index otherwise.

**The window shell has no footer.** Its columns own the viewport's height, so a footer there is a
permanent band of colophon pinned under content somebody is reading, on every screen, saying
nothing about either column. The colophon — and the Apple attribution it carries, a once-per-site
requirement — stays on the document pages, which end.

**The assistant's entry point is the sparkles, and the field it asks in is the search field's own
slot.** Both finders carry `AssistantSpark.svelte`, which owns the whole finder row so the two
sections cannot grow separate copies of what a press does: at rest the wand sits at the field's end,
struck through — the filter chips' unpressed idiom on a control with no word to strike, with the
wand stepped down to the muted tone under a slash that keeps the full text color, because the slash
is the half carrying the state and two marks at one weight fight for the same pixels — and the row
is the section's search field, supplied as a snippet. Pressing the wand sweeps it to the head of the
row, takes the strike off, draws it accent (the editor magnifier's own report, with `aria-pressed`
carrying the state and the accessible name `Ask the assistant` never changing), and swaps the field
for the ask field; Enter there opens the shared modal with the question already sent through
`openWithQuestion`, which starts its own chat because that field is not in a conversation. Pressing
the wand again — or Escape in an empty ask field — returns the search, holding whatever query it
had: the mode swap must not eat a search the reader means to come back to, and the readout still
discloses a query narrowing the list while the field shows the prompt. The sweep is a wipe with the
wand as its edge — the outgoing bar stays whole ahead of it and is masked in its wake, where the
incoming bar is unveiled — which is why both bars are mounted in one stacked slot rather than
swapped: a wipe needs something on both sides of its edge, so the resting states are a visibility
question and never presence. Its three animations are measured across the toggle (FLIP), share one
duration and one easing read off the control's own motion tokens so the mask, the unveil and the
wand cannot drift apart, and run only under `prefers-reduced-motion: no-preference`; DOM order
follows the visual order in both states, so the press recreates the button and focus is handed to
the active field explicitly — which is where the press was headed anyway. This replaced a spark that only opened the modal, which itself replaced a full
prompt — label, field, button and three lines of hint — that said more about the assistant than
either column said about its own content. `AssistantSpark.svelte.test.ts` pins the toggle, the
strike, the send and the Escape ladder; the e2e conversation test drives the dialog through the ask
field.

**The guidance catalog draws no linter rows, and its finder still answers symptom queries.** The
index and the topic pages both used to carry runs of one-line rule rows (`LinterRuleRow`) pointing
out to the rule reference; both retired when the linking became two-way — every entry names its
rules in its `Checked by` meta line, and every rule page links its guideline back
(`RuleReference.guidelines`, derived in `guidanceForRule` from the same `relatedRuleIds` the meta
lines draw, so the two directions cannot disagree) — which made a run of the whole family a second
copy of what the entries already say. What the rows were still doing was search: their haystacks
carried the rules' failure-naming titles and, for table-shaped rules, every form in the table, so
`woah` and `idk` answered in the guidance finder. That folded into the entries instead:
`guidanceRuleTerms` (`lookups.server.ts`) ships each named rule's title and lookup terms on the
section as `ruleTerms`, and the entry and landmark haystacks read them — server-derived, because
the reference is server-only, which is why the terms ride the layout load rather than being
computed in the browser. `language.selection-mismatch` is deliberately named by no entry: it is
about the workbench's language picker, not a Genius convention, so it has no `/guidelines/`
surface at all. The three Harper ids (`spelling.harper`, `grammar.harper`, `style.harper`) are
the only other unnamed rules, for Harper's own reason — their findings cite Harper rather than a
guideline, so there is no convention to point an entry at.

**`target="_blank"` is one direction only.** A reader in this catalog is working _through_ a
topic — down the list, or down a page of entries they have scrolled and deep-linked into — and a
rule is a lookup beside that rather than the next thing to read. Taken in place it costs them the
place they had, and nothing on screen gives it back: `All guidelines` returns to the catalog's
welcome view, not to the entry they were reading. So the `Checked by` ids in an entry's meta line —
the section's only links into `/rules/`, read mid-entry, which is the worst place to lose a scroll
position — open a tab. The **rules section's own rows are unchanged**, because there a rule _is_
the next thing to read (and its guideline link under the explanation opens in place, for the same
reason), and so are guidance-entry rows, which never leave. The `rel` pair is the one every
external link here carries, and an `sr-only` `(opens in a new tab)` is the whole of what says so —
the ids get no mark at all, because a glyph after every id in a comma list is a run of marks
rather than a note.

**Two things stay pinned to the tops of the two columns, and the second is a repair.** The
finder rides the index column. The way out — `All rules` / `All guidelines`, now an arrow rather
than a list glyph, because what the press does is go back — rides the detail column, in
`.site-split__backbar`. It scrolled away with the page at first, which made it a control that
existed only on the first screen of a rule: the columns are their own scroll ports on a wide
screen, and a guideline opened by fragment _lands_ mid-column, so the commonest way into an entry
was also the one arrival that never showed a way back out. Three things the bar owes, and the
third is the sticky trap the finder already documents from the other side: it bleeds across the
column's own lanes (`--split-lane-start` / `--split-lane-end`, which the guidance catalog's wider
wash lane moves for it) or the page shows past it on either edge as it scrolls under; it fills
with `--color-canvas`, the page it is pinned over; and it carries the focus ring's lane as its own
block padding, with the column standing its own down — a pinned box is back at the clip edge
whatever the column's padding says. Below `62rem` it is static again, for the finder's reason:
there the document is the only scroller, the masthead is already pinned over it, and the control
is the first thing in the document anyway.

**The masthead names the section, and that is the whole of what tells the two apart at a glance.**
`/rules/` and `/guidelines/` are deliberately alike — one shell, one finder idiom, one run of rows
— so the difference between them was `aria-current` on a 15px nav link, which is a difference
nobody reads. `.site-header__section` is `Linter Rules` or `Guidelines` at `--font-size-xl` beside
the lockup, which is set at the body size: the biggest type in the band is where you are. It is
not a heading (the page under it owns the document's outline), the rule before it is drawn rather
than typed so nothing is announced between the brand and the section, and the nav takes the far
end through `margin-inline-start: auto` — `space-between` alone stranded the title in the middle
of the row. It fits inside the band rather than growing it, because `e2e/lyriclint.spec.ts` pins
that height against the workbench's toolbar. Below `46rem` it comes off: the band has room for the
brand, the section _or_ the nav, and at that width the columns stack, so the page's own heading is
the first thing under the masthead — which is exactly the question this title answers on a wide
screen, where the choreography has pushed that heading away.

**The guidance finder speaks the reader's word and searches the whole page.** Its counts, readout
and empty state say `conventions` — `lookups` was the implementation's own register leaking into
five user-facing strings, naming neither of the two things the number blends. The haystack is what
the topic page says, the topic's own title and the citations' titles included; both omissions were
the rule reference's citation lesson arriving here, and the measured failure is worth keeping:
`punctuation`, typed under the heading `Punctuation`, dropped every guidance entry and answered
with the linter rows whose ids happened to carry the word. **And the topic page marks what
matched**, through `GuidanceSearchHighlight` over the shared `SearchHighlight` base, on every
string the haystack reads — title, statement, samples, note, tier label, rule ids, citations
(`SourceCitation.svelte` takes the same optional `text` snippet `SourceLink.svelte` does, for the
same dependency reason). **Two or more citations on an entry's meta line fold behind the
diagnostic card's own `Sources ⌄`** (`SiteSourceFold.svelte`, reusing the card's disclosure
classes so there is one implementation of the control), unfolding on a row under the whole line —
the list's flex `order` is what keeps that true with facts after the disclosure. Promotion by
evidence means entries accumulate sources, and a second inline citation wraps the meta line into
the very rows the card's rule exists to prevent. The query is module state in
`guidance-search.svelte.ts` for
`rule-search.svelte.ts`'s own reason — the page and the list are siblings with nothing to hand
each other — and it is a second module rather than the same one because the two sections are
searched for different things: one query silently narrowing both lists would be a filter applied
where nobody typed it.

The guidance column knows one thing the rules one does not: **a guideline is a fragment on its
topic's page**, so the current row is the route param _and_ an entry together — `afterNavigate`
covers path changes, and `hashchange` covers the navigation the router never models.

**And which entry is the one being read, not the one the reader was sent to.** The hash was that
answer for a while, and it is only true for an instant: a topic page is a column of conventions
rather than one document, so the reader scrolls off the entry they arrived at almost immediately
and the marker goes stale, while a topic opened with no fragment marked no row at all. A list
beside a page it does not follow has stopped answering the one question it exists to answer.
`guidance-reading.svelte.ts` is the reading position — module state for
`guidance-search.svelte.ts`'s own reason, the page and the list being siblings with nothing to hand
each other, and cleared when the page is destroyed exactly as the rule guide clears its hover. The
hash stays as the fallback for the two states the page cannot answer in: before it has hydrated,
and at the section's index view, where there is no page.

**The reading line is the middle of the viewport, and that is arithmetic rather than taste.** The
entry is the last one to have _started_ above it, which is what stays honest for an entry taller
than the screen. It has to be the middle because the landing already is: `scrollIntoView({ block:
'center' })` puts a deep-linked entry across the centre, so any line higher sits above a short
entry's own top and answers with the entry _before_ it — a deep link marking the wrong row, at the
one moment the reader is checking they arrived where they meant to. It reads a fraction of the
window rather than the column it is inside, because the detail column is the scroll port on a wide
screen and the document is on a narrow one, and a fraction of the viewport means the same thing in
both without the page reaching up into the shell for an ancestor. The landing publishes its own
answer before it scrolls, or the first frame is computed from a document still at its top and the
list travels to the first row and is corrected. The scroll listener is bound in the capture phase
on the document — a scroll event does not bubble, and which element scrolls is the layout's
business — and coalesces to one pass per frame.

**The list travels with it, and a follow is not a reveal.** `followSelectedRow` nudges to the
nearest edge rather than aligning to the top: an arrival has no previous position to respect, but a
reader watching this column does, and hauling a row that had merely slipped past the bottom all the
way up moves every other row under their eye for a correction of a few pixels. It keeps a row's
worth of breath at whichever edge it lands against, bounded by a quarter of the free height — in a
short column the two edges cross and the row is pushed between them forever. And it is the one
scroll in this section that is **smooth**, because every other one is a jump somebody asked for
while this is a list travelling with a page nobody pressed anything to move; under
`prefers-reduced-motion` it is instant like everything else. It needs no width gate: below 62rem
the list is `display: none` while a page is open, so the row has no box and the follow returns.
Pressing a row still moves nothing, which is this column's rule everywhere — the row a reader
pressed is by definition one they can see.

**The wash
cannot ride `:target` alone for the same reason.** Only a native fragment navigation updates the
target element, and pressing an index row from the index page or the other topic is the router's
`pushState`, which updates nothing — so the first press drew no wash, and only a same-path hash
press (the one navigation the router leaves to the browser) ever lit one, which read as needing to
press another entry and come back. The topic page marks the entry itself (`data-current`, off the
same `afterNavigate` + `hashchange` pair its landing already reads), and `:target` stays in the
selector as the no-JavaScript arrival's own mark. And its wash
taught the shell a clip lesson: the wash spills `--space-4` past the entry on every
side, and a scroll port clips at its padding edge, so at the shared focus-ring lane the wash's
left corners came back square — which reads as the radius failing, not as a clip. The guidance
detail column widens its start lane to the spill and hands it back with the same negative margin
(the focus-ring lane's own trick, under `data-section='guidelines'`). Between entries the wash
sits with an equal `--space-4` breath between itself and the hairlines; the last entry closes on
no hairline at all, because what follows it is a heading that already separates itself.

Implementation: `src/lib/ui/site/SectionSplit.svelte`, `reveal-selected.ts` (both the arrival's
reveal and the reading follow), `GuidanceIndex.svelte`, `guidance-reading.svelte.ts` with its spy
in `routes/(site)/guidelines/[topic]/+page.svelte`, `guidance-search.svelte.ts` and
`GuidanceSearchHighlight.svelte` beside their rule twins, the haystacks in
`src/lib/guidance/guidance-search.ts`,
`src/lib/ui/assistant/AssistantSpark.svelte`, the `.site-split` / `.site-finder` /
view-transition blocks in `site.css`, and the section layouts in `routes/(site)/rules/` and
`routes/(site)/guidelines/`. The guidance catalog's content pipeline — what an entry is, the
authority ladder, how one is added — is `docs/guidelines.md`.


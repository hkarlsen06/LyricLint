# The rules catalog: tiers, shared predicates, Harper, and how a rule ships

Touches: `src/lib/rules/catalog/`, `src/lib/rules/harper.ts`, `src/lib/rules/registry.ts`,
`src/lib/rules/lookup-tables.ts`, `src/lib/rules/data/rule-set.ts`, `src/lib/ui/state/wiring.ts`,
`src/lib/rules/catalog/policy-cases.ts`, `services/rules-assistant/`

## The rules

- Every rule declares `settlesOn` (`character` | `caret` | `line` | `document`; default
  `line`): the axis is how far right a change can still reach, not time. A diagnostic may
  override its rule's tier. One gate, in `filterForEditorState` — never a second deferral
  mechanism. `typing-churn.test.ts` types a verse a character at a time and asserts the
  doomed-episode list is empty; a rule at the wrong tier fails there.
- The `document` tier settles on a 1500ms pause and trusts `EditorSnapshot.atomic` (the
  editor's own annotation) over any guess; `isTypingChange` judges only undispatched changes,
  by changed span. A selection defers nothing; mirrored-line deferral clamps to the peer's
  own line range.
- Where two rules can fire on one line, one owns the predicate and the other imports it:
  `isProseHeaderLine` (header-prose ← header-missing, numbers.spell-out),
  `isImmediateRepeat`, `recognizedUnknownMarker`, `headerNameIsEmpty`. A rule re-deriving
  another rule's question presents as the panel arguing with itself. Cross-rule interactions
  are pinned in `catalog-policy.test.ts`.
- An `ambiguous` policy case is a reviewed decision, not a hole: the answer to a gap beside
  one is a second rule at the right tier (`suggestion` + `preview`), never a wider regex.
- Adding a rule is four registrations and two counts: `registry.ts`,
  `currentRuleSet.ruleIds` in `data/rule-set.ts` (never `previousRuleSet`), a full
  `RulePolicyCase`, the row in `docs/rules.md`, the total in `engine.test.ts`, **and** the
  sitemap total in `e2e/lyriclint.spec.ts` — which no local command runs; verify with
  `bunx playwright test -g "sitemap"`. Then `bun run assistant:corpus` and bump
  `currentRuleSet.version`. A table-shaped rule also registers in `ruleLookupTables()`.
- `RulePolicyCase.title` names the failure, not the convention, and is the one written string
  in the reference; `variant` collapses per-language families in the index only.
  `reference.test.ts` pins title constraints.
- The way to quiet Harper is a reviewed rule claiming the token (`mergeHarperDiagnostics`
  drops covered findings) — never teaching `dictionaryWords` a word the catalog thinks is
  wrong. `harper.test.ts` drives the real rule, and the real WASM above 200 characters
  (the readability-dedup ordering must not regress behind a mock).
- Harper is audited by purpose: `disabledHarperLints` names rules whose job contradicts the
  guidance (censoring, register expansion, typography); the `Regionalism` and `Readability`
  kinds drop whole in `appliesToLyrics`; marked g-drops (`runnin'`) are filtered in the
  provider; unmarked g-drops get a synthesized elision-mark fix only when Harper's own
  suggestions endorse the `-ing` form (`elisionMarkFixes`). Rules that merely misfire stay on.
- Shorthand expansion (`spelling.texting-shorthand`) is gated on one question — does anybody
  sing the letters? — never a `safe` fix, never mirrors the token's case beyond a leading
  capital, and leaves neighbouring sets to the rules that own them.

## Decision record

### A rule sees a finished song, and the document under the caret is not one

Every rule runs against a whole parsed document on every keystroke, so a transcription
mid-composition is linted as if the user had already stopped. Most of what this catalog checks is
therefore asserted about text the next keystroke is about to change — and those cards are not
merely early. They are wrong, they argue with the transcriber, and they retract themselves.

Measured over one short invented verse typed a character at a time: **21 cards appeared and 16 of
them were doomed**, occupying 46 keystrokes. `[` is `syntax.unbalanced-brackets` for the eight
keystrokes it takes to type `[Verse 1]`, and letters two through five each replaced the card with a
fresh `section.header-unrecognized` naming the prefix so far — `“V”`, `“Ve”`, `“Ver”` — with
`section.header-language` telling the user their English was wrong in the middle of the word
"Verse". That is the first thing anybody meets in this application.

**The axis is not time and it is not the line. It is how far to the right a change can still
reach.** Both of the obvious repairs are wrong, and each is wrong in the direction the other is
right:

- **A global debounce fixes almost nothing measured.** The doomed episodes ran 7–11 keystrokes,
  which is one to two seconds of ordinary typing — longer than any debounce anybody would tolerate.
  It also makes the correct findings late, and the one thing it would catch (a word passing through
  a fuzzy spelling target) it catches only if the user pauses mid-word, which is exactly when they
  are stuck and least want it.
- **Deferring everything until the caret leaves the line breaks the other half.** A curly quote is a
  curly quote the instant it lands. Holding those means typing a whole song and meeting forty cards
  at the end, which is not a linter.

So `settlesOn` is a declaration on the rule — four tiers, `line` by default, because a rule added
without a thought about typing should be quiet while its line is being written rather than arguing
with every prefix of every word:

- **`character`** — a fact about text already committed whose **message** is settled as well as its
  existence. `symbols.special-characters` and the invisible-character half of
  `text.invisible-characters`. These draw at once, wherever the caret is.
- **`caret`** — provisional while the caret is on its line, typing or not. Exactly one finding is
  here, and it is the one this mechanism replaced: a trailing run of spaces. Every space between two
  words is trailing whitespace for a moment, and the transcription loop is listen, pause, type — so
  a pause mid-line is the commonest thing that happens in this application, and being told about the
  space you are standing in is the churn wearing a different hat.
- **`line`** — the rule reads a whole line, so its answer is provisional while that line is being
  written. This is where every mid-word misfire lives, and where the header family lives, which is
  why **the unclosed bracket needed no special case**: a caret inside `[` is on that line, so the
  whole family stands down for free. The cost is finding out one Enter later.
- **`document`** — a claim about the shape of the song, which is not finished until typing stops.
  `section.verse-numbering` said `Do not number a song with only one distinct verse` from the moment
  `[Verse 1` existed, which for a transcriber working top to bottom is most of the session: it told
  them to unnumber a verse they were on their way to numbering correctly. `section.header-missing`
  fired on the document's **first keystroke**, because somebody transcribing by ear types the words
  before the header. `capitalization.title-case` is here too and is the subtle member: it needs two
  title-cased lines in one section and then reports on both, so typing line N+1 decides whether line
  N is flagged — a card that lands on a line the caret is not on, which `line` cannot help with.

**`line` needs live typing and `caret` does not, and that difference is two real findings that went
undrawn.** Deferral is a statement about a document being written, not about where a caret is
parked. Read the other way, the landing page's demo — which seeds a collapsed caret at offset 0 and
never moves it — permanently hid the `section.header-prose` its own copy points at; and a
transcriber who types the last line of a song and stops leaves the caret there for good, hiding that
line from the panel **and** from the `Fix N automatically` batch, which plans over what is visible.
`caret` is the narrow exception, for the one finding whose whole existence is caused by the caret
being there.

**A `character` finding is one whose wording cannot change either, and `quotes.typewriter` is the
near miss worth recording.** The finding is settled the instant the mark lands, but its _message_ is
not: `isApostrophe` reads the character after the mark, so `Don’` reports a closing curly single
quote and `Don’t` reports a curly apostrophe. At `character` the card was replaced by a differently
worded one on the next keystroke, on every `don't`, `I'm` and `ain't` in the song. It is `line`.

**A diagnostic may override its rule's tier, and one does.** `text.invisible-characters` reports a
zero-width space, which is wrong the moment it exists, and a trailing run of spaces, which is only
trailing until the next word — every space between two words is trailing whitespace for a moment.
Carried on the `Diagnostic` rather than split into two rules, for the reason `presumedCorrect` is.

**This replaced `deferActiveLineTrailingWhitespace`, which was this idea hand-rolled for exactly one
rule**, and re-adding a second mechanism beside `settlesOn` is the drift this section exists to
prevent. There is one gate, in `filterForEditorState`, and it runs there rather than in
`RuleContext` for the reason the section links already give: the lint is memoized on the document,
so a filter is free while a context change would re-run 60 rules.

**The `document` tier is the one place a timer is right, and it is a settle, not a debounce.** It
waits for the user to stop making the answer change, so `settleDelay` is 1500ms — under a second it
fires mid-sentence, which is the noise it exists to remove. Two things it owes:

- **Text that arrived whole is a finished document.** Opening a draft, pasting a transcription,
  loading the sample, inserting a header and applying a fix all deliver one in a single change, and
  their shape findings are right immediately — waiting on those would read as the linter being slow.

  **The editor says which it was; the shell does not estimate it.** `dispatchAtomicEdit` has always
  annotated its transaction `input.atomic`, and that annotation now reaches the shell as
  `EditorSnapshot.atomic`, so every path that replaces text as one complete edit is covered by the
  one place that dispatches them. This replaced a guess, and the guess could not have been made to
  work: a one-occurrence fix (`Dont` → `Don't`) inserts one character at the caret exactly as typing
  one there would. Only a **document change** may be atomic — a selection moving is not an edit, and
  reporting it as one would tell the shell a press had landed when nothing had.

  `isTypingChange` is what is left, and it judges only the changes nobody dispatched — keystrokes,
  pastes, drops. It measures the **changed span** rather than the length delta, because
  `Fix all 2 · Replace with '` rewrites two characters in different verses for a net delta of zero;
  that press is atomic now and never reaches this function, but a paste with the same shape would.
  Two characters rather than one, so an IME commit, a bracket auto-close and a `\r\n` count as typing.

  **`MockEditorPane` reports `atomic` too**, off its own `dispatchAtomic`. A mock that never did
  would make every component test look like typing, which is the state the real editor is in least
  often when a test drives it.

- **The pause has to re-publish the snapshot in hand**, because nothing else emits one when typing
  merely stops. It costs what `republishForSectionLinks` costs, which is nothing: the lint is
  memoized on the document, so it re-filters findings already computed.

**A selection defers nothing.** A range is not somewhere a word is being typed — it is a decision
already made about text that is already there, and hiding findings under it would take away the ones
the user selected them to read.

**A mirrored line is only a peer where the peer section has one.** A caret in a linked section defers
the lines its edits are being carried onto, and that offset arithmetic assumes every member of the
link runs to the same length — which the merge-structure link model explicitly does not require, two
choruses differing by a line being the shape the whole feature was rebuilt for. Unbounded, a caret on
the fourth line of a long chorus resolved to whatever line sat at that offset from the peer's header
and suppressed a finding in a section that was not in the link at all. It is clamped to the peer's own
line range now. This was survivable while it could only ever hide a trailing-whitespace card; it is
not, now that it governs the default tier.

**One line-number pass, not one per finding.** `lineNumberAt` is an O(offset) character walk, and it
used to run for two rule ids — it now runs for nearly every finding, on every keystroke and every
caret move. `filterForEditorState` builds one line table instead, lazily, and returns early when
nothing is deferred at all.

Implementation: `SettlesOn`, `Diagnostic.settlesOn` and `EditorSnapshot.atomic` in
`src/lib/core/types.ts`; the tier default in `diagnostic()` in `rules/catalog/utils.ts`;
`filterForEditorState` and `isTypingChange` in `src/lib/ui/state/wiring.ts`; the `input.atomic`
read in `extensions/update-bridge.ts` against `dispatchAtomicEdit`'s annotation in
`transaction-adapter.ts`; and the settle timer in `Workspace.svelte`.
`src/lib/rules/typing-churn.test.ts` is the harness that produced the numbers above, kept as a
regression: it types the verse a character at a time and asserts the doomed-episode list is
**empty**. A rule added at the wrong tier fails there rather than in somebody's transcription.

### A line that is a header is not a lyric, and every rule has to agree about which

Paste what a word processor or a lyric site gives you and the first line is `Verse 1:`. Three rules
read that line, and only one of them was right about it — so the first thing a new user saw was the
workbench contradicting itself on the line they had just pasted:

- `section.header-prose` says the header wants brackets, and offers `Use [Verse 1]`, one press.
- `section.header-missing` said the section had **no** header, on the same line, expanded and
  leading — because the label is not bracketed, so the parser hands it over as a lyric. Two cards
  adjacent, the loud one denying the header the quiet one was quoting, and the quiet one was the
  one carrying the fix.
- `numbers.spell-out` offered to write the `1` out, so the linter's advice on line 1 of a fresh
  paste was **`Verse one:`**. It goes away the moment the header is bracketed, which is exactly the
  wrong time: it is on screen while the user is deciding whether this tool knows anything.

Both are one rule's finding arriving as somebody else's, and both have the same answer — the one
press that brackets the header. So `isProseHeaderLine` is exported from `section-header-prose.ts`,
the rule that owns the question, and the other two consult it. One predicate rather than three,
because what counts as a written-out label is exactly the set that rule is about to offer a fix
for, and three copies would disagree the first time a language pack gained a term.

Two things about the suppression:

- **`section.header-missing` steps aside only for the section's _leading_ line.** A headerless
  section with `Chorus:` further down it really does start without a header, and the two findings
  are then about different lines and both true.
- **`numbers.spell-out` steps aside for the whole line, wherever it sits.** An ordinal in a label is
  part of a song-part name at any position; the `5` in the lyric beneath it is untouched.

This is the same shape as `isImmediateRepeat`, which `section.immediate-repeat-spacing` and
`section.unlinked-repeat` share: where two rules can fire on one line, one of them owns the
predicate and the other imports it. A rule that re-derives another rule's question locally is the
bug, and it presents as a panel arguing with itself.

Implementation: `isProseHeaderLine` in `rules/catalog/section-header-prose.ts`,
`leadsWithProseHeader` in `section-header-missing.ts`, the guard in `numbers-spell-out.ts`, and the
regressions in `catalog-policy.test.ts` — which is where cross-rule interactions are pinned, so the
two halves cannot be re-broken one at a time.

### An empty header is not a custom one, and the picker fills the brackets it finds

Type `[` and `]` and stop, and the workbench used to answer `Review the custom section header “”.` —
`section.header-unrecognized`, quoting nothing back at the reader, explaining that “” is in no
reviewed catalog, and leading with `It's correct` about it. Three things were wrong at once, and the
first is the one that matters: **a name that is not there is not a name somebody chose.** That rule
exists for `[Chor]`, a header a transcriber typed on purpose which LyricLint cannot vouch for, and
its whole shape — manual review, no fix, an affirmative control leading the row — is built on the
likelihood that the words are already right. Nothing about `[]` is right yet. It also drew its
underline over the empty name part, which is a zero-width range, so the one line the card was about
was marked with nothing at all. And it was the first thing anybody typing a header met.

`section.header-empty` owns that line now, at `warning`, and it says the thing that is true: the
brackets are here and the song part they open is not named. **Its one control is `Choose header`,
the same control `section.header-missing` carries**, because the two findings ask the same question
— which reviewed song part is this? — and a card that offered a second, differently worded way to
pick a header would be two ways to ask it. `offersHeaderPicker` in `DiagnosticActions.svelte` is
therefore an id pair rather than an id, and the surfaces stay identical because they already share
that row.

**What differs is the edit, and the transform decides it rather than the card.** A section with no
header line takes a new one above its first lyric; a section whose header is `[]` is a user who has
already said where the header goes, so the chosen name is written **between the brackets they
typed**. `emptyHeaderNameSlot` in `performers/transform.ts` is that span, and it stops at the colon
where there is one: a legend is a decision about voices and has nothing to do with naming the part,
so `[: Ari]` becomes `[Chorus: Ari]`. Both are one `TextEdit`, so filling the brackets is one undo,
and the later-verse renumbering runs on either path. `insertSectionHeader`'s refusal to touch a
section that already has a header is otherwise unchanged — the empty one is the exception, and it is
the only one.

Four things this depends on:

- **The finding is anchored at `section.from`, not at the header.** The two surfaces reach the
  picker by different routes — the popover hands the diagnostic's own `from` to
  `createSectionHeaderEdit`, while the panel selects the range and lets `containingSectionRange`
  answer from the caret — and `insertSectionHeader` looks the section up by `from`. Anchored on
  `header.from` instead, an indented `  []` resolves from one path and is refused from the other.
- **Only a _closed_ empty header is reported.** `[` on its own is
  `syntax.unbalanced-brackets`' finding, and half the keystrokes in `[Verse 1]` are spent in that
  state, so flagging it here would put two cards on one line for most of the time it takes to write
  a header. The rule's `ambiguous` policy case is exactly that, so the decision is a reviewed
  example rather than a comment.
- **`section.header-unrecognized` steps aside on the name alone, closed or not.** It has nothing to
  say about a name that is not there in either state, and the predicate is the parser's
  `headerNameIsEmpty` — beside `isSectionHeaderLine`, for the same reason: three surfaces need the
  same answer and two of them are not rules, so neither the transform nor a second rule may arrive
  at it with a check of its own.
- **`section.header-missing` is untouched and cannot collide.** A section with a header line, empty
  or not, is not a section without one, so the two picker findings never both draw on one line.

The tier is the default `line`: the name is being typed on that line, so the card waits until the
caret leaves it or typing settles. `typing-churn.test.ts` is unaffected because `[Verse 1]` typed a
character at a time is never both closed and nameless.

Implementation: `rules/catalog/section-header-empty.ts`, `headerNameIsEmpty` in `core/parser.ts`,
`emptyHeaderNameSlot` in `performers/transform.ts`, and the id pair in
`diagnostics/DiagnosticActions.svelte`. The cross-rule regression is in `catalog-policy.test.ts`
with the others, and `section-header-empty.test.ts` drives the real transform from the real
finding's range — the one contract neither file would catch alone.

### An `ambiguous` policy case is a decision, and widening a rule past one is how a safe fix stops being safe

`unknown.marker` flags `(?)` and `[??]` and offers `[?]` as a one-press **safe** fix, and its own
explanation says why that is allowed: these are _exact recognized_ markers, so replacing one is
mechanically safe. Its `ambiguous` case is `[Verse]\nI heard ???`, which `catalog-policy.test.ts`
pins at zero findings.

That looked like a hole — `???` is the commonest thing a transcriber types for a line they cannot
make out, and the linter said nothing about it. It is not a hole. It is the safe fix's own
justification, written down as an example: `???` is somebody's improvisation rather than a form
anyone recognizes, so a rule that swallowed it would have made "exact recognized marker" false for
every match it has, and would have swept `Are you serious???` into a bulk fix on the strength of it.

**So the answer to a gap next to an `ambiguous` case is a second rule at the right tier, not a wider
regex.** `unknown.improvised-marker` is a `suggestion` with a `preview` fix — the tier every judgment
call in this catalog uses, and the one thing `collectSafeFixes` will not touch. The reviewed decision
survives exactly as written: nothing rewrites `???` mechanically. The transcriber is simply told what
the marker is.

Three things it owes:

- **The run has to be a token of its own**, and that boundary is the rule. A placeholder stands where
  the words nobody could make out would have stood; emphatic punctuation attaches to the word it
  punctuates, so `I heard ??? tonight` is flagged and `Are you serious???` is not.
- **It reads `recognizedUnknownMarker` rather than re-deriving it.** `( ?? )` and `[???]` are
  `unknown.marker`'s findings, and two diagnostics over one span are two cards arguing about it —
  the same failure `isProseHeaderLine` and `isImmediateRepeat` exist to prevent, and the same
  arrangement: the rule that owns the question exports the predicate, the other imports it.
- **`censored.mask`'s standalone-run precedent does not carry over, and the difference is worth
  stating.** A lone `***` is ambiguous about _what it is_ — a mask, a divider, a redaction — so that
  rule flags only runs mixed with letters. A lone `???` is not ambiguous about what it is, only about
  whether it was meant; there is exactly one form it can be steering toward, and `[?]` is it.

A new rule is four registrations and **two** counts: `registry.ts`, `currentRuleSet.ruleIds` in
`data/rule-set.ts` (**never** `previousRuleSet`), a `RulePolicyCase` with all three examples, the row
in `docs/rules.md`, the hard-coded total in `engine.test.ts` — and the sitemap total in
`e2e/lyriclint.spec.ts`, which no local command runs and which has therefore been missed on every
rule that shipped without it (see _The catalog's size is pinned in two suites, and only one of
them runs locally_ below).

**Then regenerate the assistant corpus**, `bun run assistant:corpus`, because
`services/rules-assistant/generated/rules-context.json` is a committed artifact stamped with
`currentRuleSet.version` and `assistant-corpus.test.ts` compares it against the registry. Bump that
version at the same time: the manifest is a record of what a version of the rule set shipped, so a
set that gained a rule under an unchanged version number is one version meaning two things.

**And a fifth where the rule is a table rather than a judgment.** A rule that checks against a
lookup — a map of misspellings, a set of expansions, a list of preferred forms — reaches the rules
assistant as its one reviewed example and nothing else, because the corpus derives a rule the way
the reference page does. `spelling.standardized` shipped that way: asked what the standardized
spellings are, the assistant could see exactly one pair and said so. Export the table and add it to
`ruleLookupTables()` in `src/lib/rules/lookup-tables.ts`, which carries per-entry fix behavior — a
rule's `fixability` is a ceiling, not what every row of its table gets — and keeps LyricLint's own
curated misspellings labelled apart from the reviewed forms. `services/rules-assistant/README.md`
is where the rest of that decision is written down, including why a reviewed source is still a
pointer and no Genius prose is stored.

### The catalog's size is pinned in two suites, and only one of them runs locally

Every rule is a prerendered page, so the sitemap grows by one URL per rule — and
`e2e/lyriclint.spec.ts` pins that count (`expect(rulePages).toHaveLength(…)`), a second copy of the
total `engine.test.ts` already holds. The two go out of step the same way every time, and it has
now happened enough to write down: a rule is added, the checklist above is followed,
`bun run check`, `bun run lint` and `bun run test:unit -- --run` all pass, the work is pushed —
and CI goes red on the sitemap count, because **none of the three commands in Tooling runs the
Playwright suite**. The e2e spec is only exercised in CI, so the failure is discovered after the
push. The production deploy now gates on CI — `ci.yml`'s `deploy` job triggers the Cloudflare
Pages build through a deploy hook only after every CI job is green, with Cloudflare's own
automatic production deploys disabled — so a red run is no longer shrugged at: it is the site not
shipping. That is also this assertion's second lesson, not its first: the spec's own
comment records that the count once read 52 against 55 rules for three releases, which is what a
bare figure with nothing saying what it counts costs.

Two things follow:

- **Changing how many rules exist means updating both totals in the same commit** —
  `engine.test.ts` and the sitemap assertion in `e2e/lyriclint.spec.ts`. The e2e number is the unit
  number plus nothing: one page per rule, and the index, home and privacy pages are counted
  separately on the next line.
- **The check costs about a minute, so run it rather than trusting the arithmetic:**
  `bunx playwright test -g "sitemap"` builds the site and verifies the count locally. This is the
  cheap slice of the e2e suite, not the whole of it.

The general shape is worth keeping in mind beyond this one assertion: the e2e spec is where
counts and cross-surface facts get pinned _outside_ the unit suite — it has its own copy of the
rules readout, its own row locators, its own layout measurements — so any change that moves a
number the reference states should be grepped for in `e2e/` before it is called done. A local
suite that cannot fail on the change is not evidence the change is complete.

### The way to quiet Harper is to know something Harper does not

Harper is a general-purpose English proofreader with a dictionary, and a dictionary meeting `Idk`
does the only thing it can: it looks for the nearest words it knows. What that produced was a card
headed `Did you mean to spell Idk this way?` offering `Id`, `Ids` and `Ilk` — three replacements
that are not words anybody sang, over a token whose meaning every reader of the line already knows.
The finding was not merely unhelpful; the fixes were actively wrong, and they were the loudest thing
on the card.

**The repair is a reviewed rule claiming the token, not a list of words Harper is told to skip.**
Both would have removed the bad card, and only one of them says anything. `mergeHarperDiagnostics`
already drops any Harper finding whose range a native diagnostic covers, so a rule that reports
`Idk` is a rule that silences Harper there for free — and what stands in its place is the finding
the transcriber wanted: the words the shorthand stands for. Teaching `dictionaryWords` the token
would have done the opposite of the intent, since that list is what Harper is told is _correct_, and
`idk` is exactly what this catalog does not think is correct. `harper.test.ts` drives the real rule
rather than a hand-written span, because a synthetic range would go on passing after the rule
stopped covering that token.

**What may be expanded is decided by one question: does anybody sing the letters?** A vocal
performing "I don't know" has been written down as `Idk` by somebody typing the way they text, so
the words are recoverable and the shorthand is a spelling of them. `ASAP`, `OK`, `VIP`, `DJ` are the
other kind — the letters _are_ the performance, two of them are reviewed preferred spellings
already, and expanding one would put words in a singer's mouth. `LOL`, `OMG` and `WTF` are on that
side too, said aloud often enough that "laughing out loud" is a guess rather than a reading. That
question is what keeps `expansions` from drifting into every initialism in English, and it is the
same shape as `unknown.improvised-marker`'s: a rule earns a token by being able to say what it means.

Three consequences worth keeping straight:

- **Nothing here is ever a `safe` fix.** An artist who spells the letters out is transcribed as they
  sing them, and no rule can hear which happened — so this is a `suggestion` with `preview` fixes,
  which is the tier every judgment call in this catalog uses and the one thing `collectSafeFixes`
  will not touch.
- **A shorthand with two readings offers two fixes rather than guessing one.** `ur` is `your` about
  as often as it is `you're`, and the card already draws a row of them.
- **The token's case is never mirrored onto the expansion.** Shorthand is conventionally capitalized
  as an initialism — `IDK` and `TBH` are how these are written inside an ordinary lowercase line — so
  its case says nothing about the line, and `I DON'T KNOW` would be the linter shouting over a lyric
  that was never shouted. Only a leading capital survives, which is what carries a line-initial `Tbh`
  onto the `To be honest` that `capitalization.line-start` is about to want.

**And the neighbouring sets are left to the rules that own them**, which is the arrangement
`isProseHeaderLine` and `recognizedUnknownMarker` are already in. Pronunciation spellings (`gonna`,
`tho`, `cuz`) are how the word is _sung_, which is what `G-AS-SPOKEN` asks for, and `tho` and `cuz`
are reviewed entries `spelling.standardized` answers for — `cuz` behind a cousin-meaning gate this
rule could not reproduce. Apostrophe-less contractions belong to `contraction.apostrophe`. A
performer's own name is left alone through the roster, because IDK is a rapper.

**Its citation is a derivation, and `docs/rules.md` says so.** No verified Genius page names `idk`.
What the reviewed sources establish is that lyrics use standardized spellings and reflect what is
sung, and written-only shorthand is neither — so the rule cites `G-SPELLING` and `G-AS-SPOKEN` and
is recorded in the Policy section beside the line-ending and blank-line checks, which are the other
two rules here that read a source rather than quote one.

Implementation: `src/lib/rules/catalog/spelling-texting-shorthand.ts`, its policy case in
`policy-cases.ts`, and the merge regression at the foot of `harper.test.ts`.

### Harper is audited against the performance, and a refused rule is named with its reason

Harper is a general-purpose English proofreader with prose opinions, and some of those opinions
are the opposite of transcription policy. Measured against ordinary lyric lines, the default
engine offered `****` and `fudge` for a sung `fuck`, Unicode primes for `5'2"`, `because` for a
`cuz` that meant cousin, and `Take` for a performed `have a look` — each one a card telling the
transcriber to move the document _away_ from the performance. The repair is not a wider merge and
not a taught word: it is refusing the rules whose **purpose** contradicts the guidance, and the
line matters. A rule that merely misfires sometimes — an idiom correction, agreement on a dialect
`We was` — stays on behind the preview tier and the card's review-in-context sentence, because it
is also what catches real typos, and no rule can hear which happened.

Three mechanisms, one per class of harm:

- **`disabledHarperLints` names the rules whose job is the contradiction**, switched off through
  `setLintConfig` once, when the engine is created. `AvoidCurses` censors, and lyrics are censored
  only where the recording is. The initialism and informal-register expanders rewrite the register
  the catalog curates per token (`spelling.texting-shorthand`, and `cuz`/`tho` in the reviewed
  spellings), so every one either duplicates a native rule — which already wins the shared range —
  or contradicts a reviewed refusal: `OMG` stays as sung. `CauseItIsBecause` fires on the
  _preferred_ `'Cause`, because the elision apostrophe is tokenized away before the rule looks.
  `FootInchMinuteSecondSymbols` wants typography Genius lyrics do not use, and `UnclosedQuotes`
  falls with it — the inch mark that refusal keeps is a quotation mark Harper can never see
  closed, so every height in a lyric would read as sloppy quoting. The list is pinned against the
  real engine's own config in `harper.test.ts`: a Harper upgrade that renames a rule fails there
  loudly, and so does one that ships a new censoring or expanding rule, matched by description.
- **The `Regionalism` kind is dropped whole in `appliesToLyrics`**, beside `Readability` and for
  the same shape of reason: a dialect performed is the transcription, and a kind-level drop covers
  the preferences a Harper upgrade adds without an edit here. `FedUpWith` and `InOnTheCards`
  prefer dialects without wearing the kind, so they are in the name list instead.
- **A marked g-drop is filtered in the provider**, because no config reaches it: `runnin'` is the
  as-spoken form, Harper sees bare `runnin`, and what its dictionary guesses is never the word
  being sung — measured, `Lovin` → `Loin`, `rollin` → `roll in`, `somethin` → `some thin`. The
  trailing apostrophe is the gate. An unmarked `somethin` is a misspelling Harper is right to
  question, so it still comes through, exactly as the apostrophe-edged dictionary filter beside it
  only vouches for words the reviewed spellings taught.

**And the unmarked g-drop keeps its card and changes its answer.** A bare `Killin` used to offer
only dictionary guesses — `Killing`, `Kill's`, `Kelvin` — when the transcription-first repair is
the mark: `Killin'`. Harper cannot know to offer it, but it does prove the token is a g-drop, by
carrying the `-ing` form in its own suggestion list. `elisionMarkFixes` reads that endorsement off
the raw suggestions — raw rather than the capped fixes, because `Lovin` carries `Loving` third,
behind two guesses — and rewrites the row: the synthesized `Replace with Killin'` leads, the
`-ing` form stays second for the vocal that really sang it, and the nearest-word noise goes. The
endorsement is the whole gate. `chillin` comes back as `chill in` with no `chilling` beside it, so
it keeps Harper's ordinary fixes: an `-in'` synthesized without the dictionary's word behind it
would be the automatic anchor stamp's failure again — plausible, and wrong by an amount nobody can
see.

What stays on is deliberate too. The its/it's and missing-possessive-apostrophe family matches the
same standard punctuation `contraction.apostrophe` already enforces natively, so refusing it would
be the catalog disagreeing with itself. What remains open is the slang Harper's dictionary simply
lacks — `finna`, `shawty`, `hunnid`, `gon'` all drew spelling guesses in the same probes — which is
a curation question for the reviewed spellings or a taught lexicon, not a filter. And a per-user
toggle for Harper as a whole is a settings surface this workbench does not have yet; the audit
removes what is wrong for everyone, and only that.

Implementation: `disabledHarperLints`, `appliesToLyrics`, `isMarkedGDrop` and `elisionMarkFixes`
in `src/lib/rules/harper.ts`, and the pins in `harper.test.ts` — the stub tests for the ordering,
the filters and the synthesized row, and the real-WASM set: a document of every measured misfire
answered with silence, `Killin` leading with its mark against the real dictionary, and the
loud-failure guard against an upgrade renaming or re-adding a refused rule.


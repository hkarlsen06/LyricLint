# Diagnostics: the card, the popover, the preview, and the panel's order

Touches: `src/lib/diagnostics/`, `src/lib/diagnostics/order.ts`,
`src/lib/editor/extensions/fix-preview.ts`, `src/lib/core/fix-preview.ts`,
`src/lib/rules/bulk-fix.ts`, `src/lib/ui/state/panel-view.svelte.ts`,
`src/lib/rules/harper-ids.ts`

## The rules

- Show, don't ask: selecting a diagnostic previews its fix in the document as a diff; the card
  carries one control labelled with the fix itself (no `Apply`, no `Preview`, no `Cancel`).
  Previewing never scrolls and never focuses the editor.
- Applying a fix hands the workbench to the next finding (`leadAfterFix`); any wholesale
  document replacement arms the same advance through `leadOnNextSnapshot`, called from
  `replaceDocument`'s `onBeforeReplace` hook — before the dispatch, and never on a paste that
  failed.
- One document, one diff: the preview slot belongs to whichever surface mounted last, and a
  surface leaving hands it back (`shownPreviews` in `DiagnosticActions.svelte`).
  `selectDiagnostic` does not clear the preview.
- The fix-preview insert widget must override `ignoreEvent` (mousemove only) and resolve
  through `posAtDOM`, or the inserted half of the diff is a dead zone.
- `presumedCorrect` findings lead with `It's correct` in the contrast tier; it is `onIgnore`
  under the hood, per occurrence. `acceptsAsCorrect` is one derived answer for both surfaces.
  No catalog rule sets `presumedCorrect` today — its last producer, the ad-lib wrap offer, was
  retired (see *Some findings lead with the answer that nothing is wrong*) — but the shell
  contract stays pinned in `diagnostic-parity.svelte.test.ts` for the next judgment-call rule.
  `section.header-unrecognized` still leads with `It's correct`, recognized by id.
  Two acceptances stand in the ignore slot instead of leading: `It really is unintelligible`
  (`unknown.unresolved`) and `The performer is unknown` (`performer.inline-mismatch`) — the
  quiet `Ignore` is what each replaces, and `acceptsDiagnosticAsCorrect` in `ignore.ts` is the
  one predicate the button, the key's `accepted` marker, and the toast all read.
- A finding that declares `identityText` keys its per-occurrence ignores on that string in
  place of the flagged text (`performer.inline-mismatch` keys on the voice's name, never the
  lyrics it flags), and the picker's unknown-voice chip writes the acceptance itself at mint
  time (`unknownVoiceAcceptanceKey`, recorded via `recordAcceptedOccurrence`). The round trip
  is pinned in `workbench.test.ts` (*a minted unknown voice arrives accepted…*).
- `Fix all N` batches by rule *and* fix label; the linter's bulk fix plans over the visible
  diagnostics only; a batch is one `AtomicDocumentEdit` (`mergeFixes` drops `selectionAfter`).
  Counts are of diagnostics, not fixes. The count comes from `countDiagnosticFixBatch` on the
  contract, never the editor's own arithmetic.
- One diagnostic, one implementation: `src/lib/diagnostics/` owns everything from the meta
  line down, shared by the panel card and the popover;
  `diagnostic-parity.svelte.test.ts` renders both and compares them. The directory sits
  outside `src/lib/ui/` because the editor may not depend on the shell.
- The panel's order ranks provider first (native, then Harper), then severity, then position —
  a pure function of the findings, pinned in `order.test.ts`. The editor's document-order
  sorts are deliberately untouched. `harperRuleIds` lives in `harper-ids.ts` so `order.ts`
  never pulls the WASM bridge's imports.
- A diagnostic's facts are one line — severity glyph, line number, citation — with the
  citation's section and verified date in its tooltip (`aria-describedby` there, because the
  visible tooltip is the only copy). Two or more citations fold behind `Sources ⌄`.
- The card is the control all the way down: the stretched `::after` hit layer is measured
  against the `<li>`, the head stays unpositioned, and only the buttons lift over it.

## Decision record

### Show, don't ask

The best confirm step is the one that never has to happen. Where a change can be shown in place,
show it and offer only the control that keeps it — do not make the user ask to see it first.

Diagnostic fixes work this way. Selecting a diagnostic (hovering its underline in the editor, or
expanding its card in the linter panel) previews its fix in the document as a **diff**: the text
the fix would drop stays put, struck through, and the replacement sits beside it. Nothing is
hidden and nothing is applied. The card therefore carries one control for the fix, and no
`Preview` or `Cancel` — closing the card is what abandons the change. Previewing is silent and
never scrolls: it happens because a diagnostic is selected, not because the user issued a
command, and whatever selected it has already brought the range into view.

**That control is labelled with the fix, not with a verb in front of it.** Fix labels are already
commands — `Replace with Don't`, `Remove markup`, `Use Refrain` — so `Apply Replace with Don't`
says the same thing twice and reads as two controls crammed into one. The label is the whole
button, and no `aria-label` repeats it back with `Apply:` in front: the visible text is the
accessible name.

**Applying a fix hands the workbench to the next finding, wash included.** The applied card
empties and the panel leads with another diagnostic, but nothing in the document said where that
one sits: the full-line wash stayed on the line the fix had landed in, describing a caret that
was no longer anywhere the user was looking. So the shell selects the leading diagnostic's range
as soon as the fix's re-lint arrives, which moves the wash onto it and previews its fix in place.
It does not reveal deliberately — the selection's own nearest-edge scroll is enough, and a fix
applied to a line already on screen must not throw the document around — and it does not change
which panel tab is showing. The panel's reading order and the order the state follows are one
sort, in `src/lib/diagnostics/order.ts`, because the two disagreeing would leave the wash on a
different finding than the open card.

The editor is deliberately left unfocused through all of this: pressing a control in the panel
already blurred it, and a hovered popover's fix no longer hands focus back either (only its
keyboard-opened twin does, as with dismissal). A wash with no caret in it reads as a location;
a caret parked on text the user never chose would arm their next keystroke over it.

**One document, one diff, and two surfaces that both want it.** A selected diagnostic showing no
preview is the failure this invariant exists to prevent, and it had two causes, both of them one
surface reaching into a slot another one owned. Hovering an underline highlights the finding, which
expands its card, so the panel card and the popover are routinely mounted over the same fix — and
the popover leaving cleared the diff the still-expanded card was showing. The slot therefore
belongs to whichever surface mounted last, and a surface leaving **hands it back** to whoever is
still open rather than clearing it (`shownPreviews` in `DiagnosticActions.svelte`). That also makes
teardown order irrelevant, which matters because moving the panel's selection destroys one card and
creates another in the same flush.

**And selecting a diagnostic does not clear the preview, because selecting one is what asks for
it.** `selectDiagnostic` used to clear first, on the reasoning that the outgoing card's diff had to
go — but the outgoing card's own unmount already retires it, and clearing here silently undid the
request whenever the card was _already_ open on that diagnostic, which is every press on an
expanded card's own row.

**A pointer on the replacement text is a pointer on the finding.** The struck-through half of the
diff is inside the underline and always resolved; the inserted half is a widget outside every mark,
so it revealed nothing and the more interesting half of the change was a dead zone. Two things it
needs, and the second is the one that costs an afternoon: `diagnosticAtPointer` resolves
`.ll-fix-preview-insert` through `posAtDOM` (a widget has no text under it to read coordinates
against), and the widget has to override `ignoreEvent` — CodeMirror stops at the first `ignoreEvent`
on the way up from the target, so a widget swallows every plugin handler by default and the hover
watcher never ran at all. Only `mousemove` is let through: the diff is not text, and a press must
not put a caret inside a change nobody has applied.

Implementation: `src/lib/editor/extensions/fix-preview.ts` renders the diff,
`src/lib/core/fix-preview.ts` picks the fix, and `src/lib/diagnostics/DiagnosticActions.svelte`
binds it to its own mounted lifetime — which is the open/close lifetime of whichever surface
rendered it, plus the hand-off above. `leadAfterFix` in `src/lib/ui/state/panel-view.svelte.ts` is
the advance, consumed on the snapshot that dispatch emits.

**A fix is not the only edit that needs the advance.** Anything that replaces the whole document —
loading the sample, pasting into an empty draft — lands the panel on a leading finding while the
wash sits wherever the edit left the caret, which is the same failure with a different cause. So
the arming is its own call, `leadOnNextSnapshot`, and `replaceDocument` in
`editor-session.svelte.ts` makes it through the `onBeforeReplace` hook rather than each caller
remembering to. It has to run _before_ the dispatch, because the editor emits the re-linted
snapshot from inside it, and it must not run on a paste that never reached the document — a lead
left armed fires on whatever the user types next.

### Some findings lead with the answer that nothing is wrong

Most of the time the reason a diagnostic is on screen is that the text is wrong and the fix is
what the user came for, so the fix takes the card's one contrast tier and the way out is a quiet
`Ignore` after it. A few findings are the other way round: they are a guess about intent, and the
likelier answer is that the words are already right. There the quiet `Ignore` is replaced by
`It's correct` — an affirmative control, with a check, in the contrast tier, **leading the row** —
and whatever change the card also offers steps down to bordered, because a surface has one
contrast action.

One finding is like that today, and one was — and the one that was is the reason the mechanism
knows its limits.

**A custom section header is the whole of its rule.** `section.header-unrecognized` cannot vouch
for `[Chor]`, and says so; a rule that never has anything else to report can be recognised by its
id, which is how the card has always known.

**An ad-lib after a comma was the other, and leading with the accepting answer did not save it.**
Parentheses mark a vocal sitting _behind_ the lead, so an ad-lib the singer is performing as part
of the line belongs exactly as it is written — most of what `adlib.parentheses` pointed at was
already correct, and offering `Wrap as (Yeah)` as the loud answer was the linter asserting
something it cannot hear. `presumedCorrect` was the first repair: on the diagnostic rather than
read off the id, because the rule's _other_ finding — a parenthesized `(yeah)` wants a capital —
is a fact about the text and keeps the ordinary shape, so one rule carried two shapes. It was not
enough. Measured against real transcription, a rapper performing `Ayy` as the end of the line is
at least as common as a backing vocal there, so the card was wrong about as often as it was right
— and a finding whose base rate is a coin flip is churn whichever button leads, because every hit
still costs the transcriber a read and a press about something only they can hear. The
presumed-correct wrap offer is retired; what came back in its place (rule version 6) is the same
comma-and-line-end shape gated on the one thing that proves the form wrong either way — a
titlecased ad-lib, `, Ayy`, which mid-line convention allows in neither reading. That finding
needs no `presumedCorrect`, because it is not a guess: it offers `Replace with ayy` and
`Wrap as (Ayy)` and lets the transcriber say which repair their ears heard.
`adlib-parentheses.test.ts` pins that the lowercase form is never flagged. `presumedCorrect`
survives as the mechanism for the next judgment-call finding — with this as the calibration
note: it softens a guess that is usually wrong to flag at all, it does not license one. The
repair here was not softening the coin flip but finding the narrower predicate on which the
claim stops being one.

That is also why `It's correct` is `onIgnore` under the hood and not a new hook — an ignore is
per-occurrence (`diagnostics/ignore.ts` keys on the rule, the message, the text and its
surroundings), so accepting one occurrence says nothing about the next one. Only the words on the
button change, and they change because the user is being asked a different question.

**A styled voice nobody can name yet gets the same slot-standing answer.**
`performer.inline-mismatch` reports an unknown voice — styling the legend does not account for —
and in the formatting-first workflow that state is often exactly what the transcriber means: they
heard a distinct voice and cannot name it. `Ignore` there asked them to *set aside* a finding
they in fact have an answer to, so the slot's words are `The performer is unknown`, the same
shape `It really is unintelligible` takes for `unknown.unresolved`: recognized by id, standing in
the ignore slot rather than leading, with the guided `Assign section performers` beside it as the
path for whoever can name the voice. Per-occurrence keying is what makes this honest — the key
carries the slot's first span and its surroundings, so confirming the italic voice unknown says
nothing about a bold voice added later, and the acceptance lists as accepted, not ignored, in the
preferences panel. The regression is in `DiagnosticDetails.svelte.test.ts`, beside the guided
assignment's own.

**An acceptance about a voice must not be keyed to the words it sings.** As first shipped, the
answer above did not stick. The occurrence key carried the flagged text — the styled span's own
lyrics — and matching gates on that part exactly, so editing anything between the tags orphaned
the acceptance, the next settled lint pruned the orphan from the store, and the card asked
`The performer is unknown` again. In a workflow whose whole point is going on transcribing that
voice, every rewrite of its line re-asked a question already answered. The rule now sets
`identityText` on its findings — the voice's name, `Unknown italic voice` and kin, the one
wording `unknownVoiceName` in `legend-cleanup.ts` owns and the picker's chips already speak —
and `identity()` in `ignore.ts` keys the text part on it when present. The claim is keyed on
what it is about; the context parts go on ranking which same-named occurrence is meant, so
confirming one section's italic voice still says nothing about another's. The second half of the
annoyance was the workbench arguing with itself: the picker's unknown-voice chip *is* this
card's answer, so `createUnknownVoiceEdit` in `Workspace.svelte` writes the acceptance as it
applies the wrap — `unknownVoiceAcceptanceKey` builds the key against the pre-edit document,
which is sound because matching gates only on the three parts knowable before the finding
exists, and the finding then arrives already accepted. The round trip — minted, hidden on
arrival, still hidden after a full rewrite of the lyrics inside the tags — is pinned in
`workbench.test.ts`. Keys stored before this change carry lyrics in the text part and now match
nothing, so a pre-existing acceptance is re-asked once and then durable.

Implementation: `presumedCorrect` and `identityText` on `Diagnostic` in `src/lib/core/types.ts`
(`presumedCorrect` currently with no catalog producer); `acceptsAsCorrect` in
`src/lib/diagnostics/DiagnosticActions.svelte`, which is one derived answer for both surfaces —
`diagnostic-parity.svelte.test.ts` renders the card and the popover and compares the row.

### A batch repeats one change, not one rule

Two controls fix more than one finding at a time, and what separates them is what the user has
already been shown.

**The card's `Fix all N` batches by rule _and_ fix label together.** A card previews exactly one
fix as a diff, and that diff is the whole evidence for pressing anything beside it, so the batch
may only hold edits the preview honestly stands in for. Batching by rule alone is the tempting
wrong answer: it sweeps `til` → `'til` into a card showing `Imma` → `I'ma` — both
`spelling.standardized`, neither one the change on screen. The label is the right key rather than
a lucky one, because fix labels are written to name the change, so two fixes share a label
exactly when they read as the same command. The control appears only above one occurrence
(`Fix all 1` is a second button for the press already beside it) and never for a `preview` fix,
which is the kind that exists to be confirmed one at a time.

**The linter's `Fix N issues automatically` batches every safe fix in the panel.** Both plan over
the _visible_ diagnostics. A severity chip switched off is a statement about what the user means
to deal with, and reaching past it is the one thing bulk fixing must never do — as is reaching
past an ignored rule.

**A batch is one `AtomicDocumentEdit`, always.** Every fix in it carries the same `baseRevision`,
so dispatching them one at a time makes the second stale and hands the user one undo step per fix
for something they pressed once. `mergeFixes` drops `selectionAfter` on the way: a batch spread
down the document has no single place for the caret, and `leadAfterFix` is about to select the
leading remaining finding anyway, exactly as it does after a single fix.

Counts are of diagnostics, not of fixes, because the strip's two numbers are read as one sentence
about the list underneath and have to add up to it.

Implementation: `src/lib/rules/bulk-fix.ts` (keys, arbitration through the existing
`collectSafeFixes`, and the merge), `applyFixBatch` / `applyBulkFix` in
`src/lib/ui/state/panel-view.svelte.ts`, and the card's control in
`src/lib/diagnostics/DiagnosticActions.svelte` — the shared row, so the popover and the panel
card cannot offer different batches for the same fix. The shell answers the count for both
surfaces (`countDiagnosticFixBatch` in `src/lib/editor/contracts.ts`); an editor that counted its
own would disagree with the panel.

### One diagnostic, one implementation

The expanded card in the linter panel and the popover anchored under an underline are the same
finding seen from two places. They therefore share components rather than mirroring each other by
hand — the previous pair had drifted into two source lists, two ignore labels, two fix buttons,
and a severity tag in only one of them.

`src/lib/diagnostics/` owns everything from the meta line down: `DiagnosticMeta.svelte` (the one
line of facts, built from `SeverityTag.svelte` and `SourceCitation.svelte`),
`DiagnosticActions.svelte` (every decision about a diagnostic, in one row, in one order, plus the
fix-preview lifetime), and `source-url.ts` (no citation is ever linked without going through it).
`SourceLink.svelte` is the block form of a citation and is no longer part of a diagnostic at all —
it belongs to the tools panel's reviewed-source snapshot. The directory sits outside
`src/lib/ui/` on purpose: the editor may not depend on the shell.

Each surface keeps only its own chrome — a row in the run of cards, or a floating overlay — and
the panel's line number, which is the one thing its meta line carries that the popover's does not
(the popover is anchored under the underline it describes). The hovered popover's action row is
the panel card's action row exactly; only the keyboard-opened one adds a control (see below).
Anything else that appears on one and not the other is a bug, and
`src/lib/diagnostics/diagnostic-parity.svelte.test.ts` renders both and compares them.

### The panel reads reviewed rules first, and Harper only after all of them

`orderDiagnostics` is worst-first-then-down-the-document, and it now ranks the **provider** ahead
of both: every native finding, then every Harper one. That is a layout bug's repair, and the bug
was the visible half of something worse.

Harper is a WASM proofreader that answers about 250ms behind the rule engine, so **every edit
publishes twice** — the native findings at once, then the union re-sorted when Harper lands
(`scheduleHarper` in `Workspace.svelte`, `mergeHarperDiagnostics`). Interleaved by severity and
position, a Harper finding earlier in the document than the card the reader is on was _inserted
above it_ on that second publish. After a fix that card is the one `leadAfterFix` has just
expanded, so the tall open card — the one whose button the pointer is aimed at, in a panel whose
whole use is pressing fixes in a run — slid down a row on a delay.

Underneath it, `leadAfterFix` was choosing that card from an **incomplete list**: the lead is
picked on the native-only publish, and a late arrival can change which finding is actually first,
leaving the wash on one finding and the open card on another. That is precisely the disagreement
the single sort exists to prevent. Ranking the provider fixes both, because a late Harper finding
can now only ever land _below_ every native card and never above the lead.

Three things about it:

- **It is a rank, not a rule about arrival.** The order stays a pure function of the findings, so
  the same document lists the same way whether Harper answered first, last or twice. Sorting late
  arrivals to the bottom _because_ they were late would make the list depend on history and this
  sort unrepeatable; `order.test.ts` pins the two orderings against each other.
- **It says something true.** A reviewed rule cites a Genius guideline and carries a checked
  example; Harper is a general-purpose English proofreader that cites itself and knows nothing
  about lyrics. The merge already lets any native finding win a shared range, and the reference
  names Harper and gives it no pages. Reading order now agrees with both.
- **The editor's own sorts are deliberately untouched.** `lint-decorations.ts` orders marks and
  badges _in the document_, where position is the only order that means anything and a provider
  rank would shuffle the marks on one line. This is the panel's reading order, and the panel is a
  list.

`harperRuleIds` moved to `src/lib/rules/harper-ids.ts` for this and is re-exported from
`harper.ts`. `order.ts` is imported by the editor as well as the shell, and `harper.ts` statically
pulls the language registry and the spelling table on its way to the WASM bridge — so asking it
"is this Harper's" there would drag the grammar integration into every chunk that sorts a list. A
second copy of the three strings was the other way out, and it is the one this file keeps a rule
about.

### A diagnostic's facts are one line, and its provenance is on it

The card used to open with a filled severity badge on a line of its own and close with a footer of
block citations, each spelling out its section and verified date. Two blocks of chrome, top and
bottom, for facts that read as one sentence — and between them the reader had to travel the whole
card to learn where the finding was and what said so.

They are one line now, under the message: **severity, line number, citation**, interpuncts between
(`DiagnosticMeta.svelte`). The severity is a colored glyph, not a chip and **not a word** — and
therefore no interpunct follows it, because an interpunct separates facts of the same kind and the
mark that opens the line is not one of the words in the list it introduces. The
citation is a link and only a link; **which part of the page was cited and when it was last
verified are the link's tooltip**, because that is what a reader checks before following it rather
than something they need in front of them on every card.

- The tooltip is `position: fixed`, measured from the link when it opens. The citation sits inside
  the linter panel's scroller and inside the editor popover's, either of which clips a box that
  stays in flow.
- The description is in the accessible tree whether or not the tooltip is showing, through
  `aria-describedby` on the link. The visible tooltip is the same text drawn again and is
  `aria-hidden`, so nothing is announced twice — a screen reader cannot produce a hover.
- **One citation is inline; two or more fold behind `Sources ⌄`.** Two links on the meta line wrap
  it onto a second and a third row, which is the layout this section exists to prevent. The
  label names what is behind it and does not change — `aria-expanded` and the chevron carry the
  state — and unfolded, each citation is the inline one exactly, tooltip included.

The panel card also changed shape for this. The row is still the control, but the button no longer
_contains_ the head: an `<a>` inside a `<button>` is neither valid nor reliably pressable. The
button holds the message and stretches its hit area over the row with an inset `::after`, the
citation and its disclosure ride above that layer with `z-index`, and hover and the focus ring
are read off the head with `:has()` — off the button alone they would light up only the message.

**The card is the control all the way down, not just at its head.** Expanded, it is the message,
the meta line, the explanation, and the decisions; only the first two used to open the diagnostic,
so half the surface the reader was looking at did nothing. The stretched layer is measured against
the `<li>` — which is why the head is deliberately unpositioned, a containing block there stops the
layer at the head's own bottom edge — and what does something else is lifted over it. That is the
**buttons**, not the row holding them: lifting `.diagnostic-actions` would make its whole band dead,
and the slack beside the last control is card, exactly as the head's padding is. The one thing this
costs is selecting the explanation's prose with the pointer, which is the trade a card that is a
control makes anyway.


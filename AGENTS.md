# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` is a symlink to this file.

## Project

LyricLint is a SvelteKit (Svelte 5, runes) workbench for linting Genius lyric transcriptions.
Reference docs: `PRODUCT.md`, `DESIGN.md`, and `docs/`.

## Tooling

Use **bun**, never npm.

```bash
bun run check
bun run lint
bun run test:unit -- --run
```

## Git history

Prefer rebasing over merge commits when integrating branches. Rebase the topic branch onto the
current target branch, then use a fast-forward merge so history stays linear. Do not create a
merge commit unless the user explicitly requests one or rebasing would rewrite shared history.

## UI rules

### No cards inside cards

Never nest a card, panel, or bordered/filled box inside another one. If an action needs a
follow-up step, it happens **in place** in the existing surface — swap the control's label,
reveal a sibling control in the same row, or change the surface's own state. Do not open a
second bordered box inside the card the user is already looking at.

Concretely, for a two-step confirm:

- The trigger keeps its slot and changes its label (`Preview` → `Confirm`).
- The confirming control is the high-contrast CTA (`.button--contrast`, the theme-inverting
  white/black action).
- `Cancel` sits immediately to the right of it, quiet emphasis.
- Competing actions on the same surface (for example `Ignore this session`) are hidden while
  the confirm step is pending, so exactly one decision is on screen.
- Announce the pending state with a visually hidden `aria-live` region rather than a visible
  status box.

This applies to destructive confirms too: a warning reads as prose in the section it belongs to,
not as a tinted danger box that pops into existence.

Canonical implementations: `src/lib/ui/tools/ToolsPanel.svelte` and
`src/lib/ui/layout/DraftMenu.svelte`.

### A card has to earn its border

A card is a boundary, and a boundary has to separate something from something. Before drawing
one, name the job: it groups items that repeat (a diagnostic among other diagnostics), it marks
a region the user acts on independently of its neighbors, or it lifts a surface above the page
(a popover, a menu). If none of those apply, the border is decoration — drop it and let the
content sit directly on the page background.

The tell is a card with nothing beside it. A single centered box on an otherwise empty page
separates its contents from nothing at all; it only adds a rectangle, an inset, and a second
background color for the reader to parse. Full-page messages — boot and error states — are prose on
the canvas: constrain the measure with `max-width`, center it, and stop there.

Canonical implementation: `.error-page` in `src/lib/ui/styles/overlays.css`.

### The shell is one window, and the linter is one column

The document toolbar spans the whole window, above both columns — the draft's name, its save
state, and the commands that act on the whole document belong to the window, not to the editor
half of it. The right panel's tab strip hangs directly under it, at `--panel-tabs-height` rather
than the toolbar's `--header-height`. Toolbar, tab strip, ignored-rules footer, video band, and
status bar are all `--color-chrome`; the scrolling content between them is not.

**The toolbar splits on what a control acts on, not on how loud it is.** The left is the identity
strip — the brand, the draft's name, and the plus that starts another one, which acts on no
document and therefore does not belong in the strip of commands that act on this one. The right
holds only those: the language and the contrast action. The save readout trails the plus and
**draws nothing while saving is going well** — a disk glyph that is always there reports a state
that never changes — but it stays in the accessible tree the whole time (`sr-only`, named and
titled), because the e2e suite and a screen reader both need to know a save landed. A failure is
the one state that draws, with its words and an alert glyph, so what the user must act on is
carried neither by red alone nor by the silence that means everything is fine.

Diagnostics are one continuous run, not a stack of separate cards: no gap, no rounding, a
hairline between neighbours. **Selection is depth, not hue.** The selected row drops from
`--color-surface` to the recessed `--color-canvas` and takes `--shadow-recessed`, so it reads as
cut into the column; it does not also get an accent wash or an accent ring, which put a blue box
inside a panel whose entire job is to color things by severity.

**That spends `--color-canvas`, so nothing else in the column may sit on it.** Anything hanging
between the tab strip and the run of cards is chrome or it is a card; there is no third material.
The bulk-fix strip learned this the long way: drawn as bare canvas it was the same tone as
whichever card was open below it, the two merged into one region, and its button read as loose
inside the open diagnostic rather than as a command over the list. It is `--color-chrome` now,
like the severity chips it hangs beneath. A strip also carries something at both ends — the
command at one, the count it will not touch at the other — because a lone control in half a row
of empty gutter is the other way this row has failed.

The severity filters have no control of their own. Pressing the Linter tab from another panel
comes back to the linter; pressing it again, while already inside, shows or hides the chips.
Both handlers on the trigger run _before_ Bits UI activates the tab (it composes props handlers
ahead of its own), so `controller.activeTab` read inside them is still the tab the user was on.
Keyboard needs its own `onkeydown` path: Bits UI activates Enter and Space from `keydown` and
calls `preventDefault`, so no click follows to be heard.

Implementation: `src/lib/ui/styles/shell.css`, `src/lib/ui/styles/panel.css`,
`src/lib/ui/styles/linter.css` (the run of cards), `src/lib/ui/styles/diagnostics.css` (what is
inside one), and `src/lib/ui/layout/RightPanel.svelte`.

### The empty document is one message, not three

A fresh open used to say "empty" four times — a black editor with a bare caret, a panel explaining
how to feed it, and four zeroed counts in the status bar — while the loudest control on the screen,
the contrast-tier `Copy lyrics`, pointed at the exit of a job nobody had started. The fix is not
decoration. It is dividing one message between the surfaces so that no two of them say it:

- **The editor says what belongs there**, with a ghost transcription at the caret
  (`extensions/document-placeholder.ts`). Section headers come from the selected language pack, so
  the shape it models is the shape the linter wants; the one line of guidance between them stays
  English because it is the application talking, not the document.
- **The toolbar says what to do**, by swapping its one contrast action to `Paste lyrics` while the
  document is empty. The slot, the tier, and the tab order are unchanged — only the label follows
  the state, and the surface never carries two contrast actions.
- **The panel says what it is waiting for**, and nothing about how to start. Its copy got shorter
  when the editor took over the instructions; re-adding "paste or write some lyrics" here is the
  drift this section exists to prevent.
- **The status bar says nothing at all.** A count worth stating is one that could have been
  otherwise, so each count waits until it has something to report. The shortcut hints that used to
  keep it company are gone at every state, not just this one: a legend for `F8` and `⌘.` was help
  nobody had asked for, printed permanently across the quietest row in the window. So was `offline
ready`, which is a fact about the application in a row that summarises the document. What is left
  at the end of the row is the `About LyricLint` link, alone, which is the whole of what that end of
  the row is for.

Two things the empty panel offers, both prose on the canvas rather than boxes: the drafts the user
already has (a fresh open is only empty because it opened a _new_ one, and their work should not be
behind a menu they have to find), and the sample. **They are not offered in the same place**, because
only one of them is about this document. The sample answers "nothing to lint yet" and stays with the
sentence it answers, directly under it. The drafts answer nothing — they are somewhere else to be —
so they sit at the **foot of the column**, after everything the panel has to say about the draft in
front of the user, pushed there by `margin-top: auto` rather than by whatever happens to be above
them. Between the two is empty canvas, and that is the whole separation: no rule, no fill, no box.

Pinning a foot means the panel is a column the height of the panel, which is what
`.right-panel__pane` is for. Two traps in that: the pane is only told to fill, never to fit, so
content taller than the panel still grows and scrolls; and its `display` **must** exclude
`[hidden]`, because Bits UI hides the inactive panes with the attribute and a bare `display: flex`
outranks the rule that honours it — all three panels stack into one column. `RightPanel.svelte.test.ts`
asserts exactly one pane draws.

**The sample is offered only while its own
language is selected** — under another choice, its English lyrics open with a true
`language.selection-mismatch` about a document the user did not write. Its findings are few, and
`sample-draft.test.ts` pins both the count and the mix, because the sample is only worth loading
while it still demonstrates the split the bulk strip reads out: some fixed mechanically, the rest
named as judgment calls.

`controller.isEmpty` and `controller.canLoadSample` are the single answers to both questions; no
surface decides for itself what "empty" means.

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

### A draft is one line, and an empty draft is not a draft

The drafts menu used to spend two rows on every draft: its name, then `Rename Duplicate Export
Delete` spelled out underneath. Seven drafts came to twenty-eight words of chrome around seven
names, the same four repeated down the page, and a column of red `Delete`s warning about nothing —
the row is not dangerous, the press is. The commands are glyphs on the name's own line now, each
keeping the draft in its accessible name (`aria-label="Rename Sensommer"`, `title="Rename"`) so
"Rename" alone is never all a screen reader hears. They are muted until the row is hovered or holds
focus, and the trash earns `--color-danger` only under the pointer. The hairline between rows went
with the second line: a compact row that lights up says where one draft ends, and the only rule
left worth drawing is the one under the heading.

**The confirm takes the trigger's own slot.** `Delete` armed a `Yes` at the far side of the row,
which is a pointer journey to undo a press the user has already aimed. `RemoveButton.svelte`
swaps itself for the confirm in place, `Cancel` beside it, the row's other commands hidden and the
row itself no longer pressable while the question is open — and it moves focus onto the confirm,
because a control that replaces another has to inherit the focus that was on it. **Every list that
offers a way out of one of its rows shares the component**: the drafts menu, the linter panel's
recent-drafts list — which is where a returning user actually meets the drafts they want rid of —
and the performer roster. `label` is all that differs between them, because a draft is deleted and
a performer is removed from a roster. The armed row is the list's state, never the row's: only one
question may be open at a time, and closing the surface has to abandon it.

**The roster is the same list, and there the name _is_ the rename.** A performer was two rows as
well — a colored dot and a bold name, then `Rename Remove` underneath — so six performers filled a
panel with `Rename` printed six times and `Remove` in red beside it, and the roster's actual
content, the six names, was the smallest thing in it. It is `.list-row` now: dot, name, trash. No
pencil, because pressing the name opens the field in its place, and a glyph beside it would be a
second control for the thing the pointer is already on. The name draws nothing to advertise that —
a bordered field on every row is six boxes for a name that is usually only read — it just takes the
row's free width, underlines under the pointer, and keeps `Rename Mul` as its accessible name. While
a removal is pending it is plain text again, because that question is the row's only one. The name
also lost its `<strong>`: six bold rows in a column are the same repetition the commands were, and a
name is not an emphasis.

A draft's name is not this, and the difference is what the row is for. A draft row is a way _into_
the draft, so its name opens it and the pencil stays; a performer row is nothing but the name, so
the name is the only thing there to press.

**Attached audio is the exception, and it is the whole of the exception.** A song chosen for a
draft with no words yet is deliberate work — the user said what this transcription is _of_ — and
without this it was thrown away on every reload, silently and in two places at once: the draft was
never written, so the media row pointed at a transient id no later boot would produce; and had it
been written, `recoverStartupDraft`'s blank sweep would have deleted it, taking the attachment with
it, because `delete` clears the media record in the same transaction. So `scheduleSave` consults
`hasAttachment`, `recoverStartupDraft` takes the media repository and spares a wordless draft that
has a row in it, and `claim()` in the media store calls `onAttached` — one call at the single point
every attachment path already passes through, rather than three that each have to remember.

The predicate is read on **every** save, not only the one attaching triggers. The document is still
wordless on the next snapshot, so a one-shot write would be undone a keystroke later by the very
discard it was working around. This costs a wordless draft with a song in it a row in the drafts
list, which is the right trade: an `Untitled draft` the user can see and delete beats an attachment
that vanishes with no sign it existed.

**A draft with nothing in it is never written.** Every "new draft" used to create a record
immediately, so a session of second thoughts left a list of `Untitled draft`s that had never held a
character. Now `createDraft` loads a transient record and writes nothing; the first save with text
in it is what creates the row and takes over the current-draft pointer, so a reload before the
first keystroke comes back to the draft that still has the work in it. A draft emptied out gives up
its record the same way (`discardEmptyDraft`) — undo puts the text back and the next save writes
the same id, so nothing is lost. `recoverStartupDraft` sweeps blank records on the way through for
the databases earlier builds already filled.

Dates are read, not parsed: `Today`, `Yesterday`, `3 days ago`, then `15 Jun`, and the year only
outside this one. They are English like the rest of the chrome — the browser locale put a Norwegian
month on the line under `Yesterday` — and the exact timestamp stays in `datetime` and the tooltip.

**The way into that list is the draft's own name.** It used to be a hamburger at the far end of the
command strip: a glyph that names nothing, sitting among the commands that act on the document,
nowhere near the thing it actually switched. The name was already in the toolbar as an input, so the
two are one control now — `.draft-switcher`, the field plus a chevron at its end. Typing in it
renames this draft; the chevron opens the ones it could be swapped for, anchored to the switcher's
left edge so the list opens under the name it would replace. That anchoring is why the `<details>`
goes `position: static` inside a relative switcher; the popover hangs from the group, not from the
chevron. Border and fill belong to the group and nothing inside it draws a box of its own — a border
inside a border is two rectangles for one control — and hovering either half, or opening the menu,
lights the whole thing. The trigger keeps `Drafts` as its accessible name; only the glyph changed.

Implementation: `src/lib/ui/primitives/RemoveButton.svelte` (the shared confirm) and
`src/lib/ui/styles/rows.css` (`.list-row` and its commands, shared by the drafts menu and the
performer roster); `src/lib/ui/drafts/draft-date.ts` for the dates; what each surface adds on top in
`overlays.css`, `linter.css`, and `performers.css`; and the persistence rule in
`draft-store.svelte.ts` and `persistence/recovery.ts`.

### The audio is a transport, and it is never at rest

Nobody opens LyricLint to listen to music. The loop is listen, pause, type, back up, replay, so the
control that matters is the one nobody looks at — and most of the value is in two defaults and three
keys rather than in anything on screen.

**The strip is the second row of `.editor-region`, not a row of the workspace grid.** A workspace
row would run under both columns and shorten the right panel, whose linter pane is a full-height
column with its recent drafts pinned to the foot. Hanging it under the document alone is also the
honest reading: it controls what the document is transcribed from, not the window. The row is
`auto`, so it costs nothing until a file is attached, and it is `--color-chrome` like the toolbar
above it and the status bar below — the bulk-fix strip's lesson, that a row drawn as bare canvas
between two surfaces merges with whichever one it touches.

It was not made a fourth panel tab, and the reason generalizes: tabs are exclusive, so a Media tab
would make the user choose between seeing diagnostics and controlling audio during the one activity
where both are live.

**With a software keyboard up, the strip rides the top of it, and pressing it does not close it.**
Two separate fixes for one failure, and the workbench is unusable on a phone without both.

A keyboard covers the foot of the workbench, transport included, so the row a transcriber needs
_most_ while typing was the one row they could not reach. `trackKeyboardInset` publishes
`--keyboard-top` and `data-keyboard-inset` on `<html>`, and `responsive.css` hangs the strip off
them.

**Nothing in it reads `window.innerHeight`, and that is the whole design.** The obvious measurement
is `innerHeight - visualViewport.height`, it is what every recipe on the web says, and it is what
shipped first and did **nothing at all** on a real phone. What the layout viewport does when a
keyboard opens is browser lore that differs by engine and by version; a rule built on it fails
silently on the one device it was written for, and passes every test, because no test has a
keyboard. Both published values come from `visualViewport` alone:

- **`--keyboard-top` is `offsetTop + height`** — the bottom edge of what the user can see, in the
  space `position: fixed` is measured against. `offsetTop` is not optional: iOS pushes the visible
  viewport down inside the layout one to bring the caret into view, and dropping it puts the strip
  over the top row of keys by exactly that much. The CSS moves the strip there with
  `translateY(calc(var(--keyboard-top) - 100%))` — not `bottom`, which would need the keyboard's
  height, the thing we could not establish; and not `top`, which relayouts on every event the
  keyboard fires as it slides in. The `- 100%` is also why nothing here measures the strip: a
  percentage in a translate resolves against the element's own size, so a JS version of the same
  offset would have to read the height back and observe it changing.
- **The flag is the drop in visible height** below the tallest this session has seen, not a
  comparison against anything the layout viewport reports. A shrinking visual viewport is the one
  behaviour that is true on every engine. The baseline resets when the viewport changes width,
  because a rotation is a new viewport and not a keyboard.
- **The viewport's own events are not enough, and it re-reads on a timer while a keyboard is up.**
  Dismissing the iOS screenshot preview moved the visible viewport and fired nothing, so the strip
  stayed pinned where the viewport had been and sat halfway down the keyboard until something else
  happened; anything the system draws over the page can do this. Twice a second, and only while the
  flag is set — a pair of property reads that cannot run at all in the state the workbench spends
  its life in.

**The band below the strip is filled** (`.workspace::after`). Between the visible viewport's bottom
edge and the foot of the layout viewport is chrome the browser owns — the address pill, the
keyboard's accessory row — and the page goes on drawing behind it, so the tab strip and the top of
the findings showed through the gaps around it in pieces. The fill is the strip's own
`--color-chrome`, so the two read as one band resting on the keyboard. It hangs off the workspace
rather than the strip because the strip is a horizontal scroller: `overflow-x: auto` computes
`overflow-y` to `auto` as well, so a pseudo-element below the strip inside it would be clipped and
would give the shortest row in the window a vertical scroll port.

`env(keyboard-inset-height)` would answer both directly and is not available: it belongs to the
VirtualKeyboard API, which Safari does not implement, and `interactiveWidget` in the viewport meta
is Chrome on Android.

The flag is also the whole gate, so the rule needs no pointer query and is inert everywhere else.
The module publishes lengths and moves nothing; where a band sits stays in the stylesheet with
every other decision of that kind.

**And a press on the strip keeps the caret in the document.** Focus moves on `mousedown`, so
preventing its default is what stops a press here from blurring the editor — and on a phone, focus
leaving the document is the keyboard closing. Buttons only: the scrubber and the rate control need
their own press to drag and to open, and both are aimed rather than tapped, where a lost keyboard is
the cheaper cost. `click` is not a default action of `mousedown` and still fires, so nothing else
changes.

This does not contradict "the editor is deliberately left unfocused" under _Show, don't ask_. That
rule is about a caret the user did not place — parked on text a panel control happened to select,
arming their next keystroke over it. Here the caret is exactly where they put it and they are in the
middle of typing there; taking it away is the bug, not the fix.

Implementation: `src/lib/ui/state/keyboard-inset.ts`, the `:root[data-keyboard-inset]` rule in
`responsive.css`, and `keepFocus` in `MediaStrip.svelte`.

**Nothing draws while there is nothing to control.** No empty transport, no `Load audio` in the
toolbar competing with its one contrast action.

**Attaching is one control in the status bar, and it opens one question.** It sat in the tools panel
first, which meant three tabs away from the document and, worse, split across two commands —
`Attach audio…` and `Use a YouTube video…` — so the user had to know which kind of answer they had
before they could start. There is one trigger now (`MediaPicker.svelte`), it lives in the row the
transport itself appears directly above, and the two ways to answer sit side by side inside a modal.
It is the one control in the status bar and therefore the one exception to that row being a readout:
its slot never moves and only its label follows the state, `Add audio` to `Change audio`, because a
control that vanished once audio was attached would take the only way to swap tracks with it.

The modal is a modal because attaching is a detour — nothing else in the workbench is worth doing
until it is answered or abandoned — and neither answer inside it is boxed. The dialog is already the
surface; a border around each option would be two cards inside the card the reader is looking at,
and the hairline between them is a separator, which is a different thing. Once a file is attached,
the strip is where it is operated.

**Each answer is a control and a line of facts, and YouTube is the first of them.** It opened as two
headings over two paragraphs — a hundred words of grey to read before either press, the longer of
them explaining what YouTube costs — so a dialog offering two ways to start a job read as a warning
about doing it at all. The facts are the same facts, in the meta idiom the diagnostic card
established: interpuncts, muted, small, under the control they qualify. A requirement stated as a
specification reads as a specification; the same requirement spelled out in sentences reads as an
apology for the button under it. YouTube leads because it is where most transcribers' audio already
is, and the header lost its rule and its display size with the rest — a band of chrome over four
lines of content is the boundary separating nothing that `A card has to earn its border` is about.

**`F7`, `F8`, `F9` — back, play/pause, forward.** They are the three controls
the keyboard already made for a transport, so they are the primary path and need no modifiers.
The Media Session handlers answer to the Mac's previous, play/pause, and next buttons even when
the browser consumes their function-key events; browsers that deliver `F7` through `F9` directly
take the same path. Keyboards without media keys use one modifier with the physical J K L triad:
`Ctrl-J/K/L` on macOS, where Option types characters, and `Alt-J/K/L` on Windows and Linux, where
Control belongs to the browser. `Ctrl-Alt-J/K/L` remains the universal fallback.

**Back and forward step between the timed lines once there are any**, and move two seconds when
there are not. A transcriber checking a line wants the line, not two seconds of wherever the last
press left off — and a song with anchors already says where its lines begin, so the step is free.
The shell pushes those moments into the transport as `cuePoints` and nothing else; the arithmetic
stays where every other rule about where the playhead lands lives, so a press on the strip and a
press of the key cannot mean different things. Outside the timed part of the song — before the
first cue, after the last — there is nothing to step to and the nudge is what is left, which is
also the whole of the behaviour for an untimed draft. The controls are named for what they
currently do (`Previous line` against `Back 2 seconds`); a button naming a number of seconds it no
longer moves is worse than one naming none.

The reliable one-modifier fallback is printed on the transport itself, as one mark **under** each
control. This is where the shortcut is learned: the guide appears with the song, stays attached to
the action it operates, and costs no separate help row or preference. Tooltips and
`aria-keyshortcuts` carry the function-row and universal fallbacks without putting every alternative
on screen.

Three things that mark is not. It is not **beside** the glyph, which is where it began: read along
the row it joined the run of controls, doubling the transport's width and making two thirds of the
most-operated row in the window a legend. It is not two capped boxes, `⌃` and `J`, which printed the
modifier three times for a fact that never varies while the letter — the only part that differs —
wore the same weight as it. And it is not boxed at all: a keycap border here is a rectangle drawn
around every glyph in the shortest row in the window, competing with the transport it only
annotates. Muted, `--font-size-2xs`, one caption per control.

**The caption costs the row no height, and that is a constraint rather than a happy result.** The
strip is `--control-height-lg` and every other control in it is `--control-height-md` plus this
row's padding, which comes to exactly that — so the stack of glyph, gap, and caption has to fit
inside one `md` control, and it does with a pixel to spare. Anything added to that stack grows the
strip, and every pixel this row takes is a pixel off the document above it.
`MediaStrip.svelte.test.ts` measures the stack against a sibling control rather than trusting the
arithmetic, because at narrow widths `responsive.css` raises every `.button` to `lg` and the box
stops reporting what the content does.

**The transport is bound to the window, not to the editor**, and that is a correction. It began as a
CodeMirror keymap, which meant it answered only while the caret was in the document — so the moment
the user stepped out to read a finding, aim the scrubber, or rename the draft, the tape could not be
stopped. That is the wrong half of the loop to serve: the pause is wanted _most_ at those moments.
`bindTransportShortcuts` in `src/lib/ui/state/media-shortcuts.ts` listens in the capture phase and
the editor no longer knows these keys exist, because two implementations of one keystroke would
double every nudge the moment CodeMirror let the event bubble. `keyboard-commands.svelte.test.ts`
now asserts the opposite of what it used to: that the triad reaches the window from inside the
editor, `defaultPrevented === false`, with the document and the caret untouched.

Three things that listener owes its keystroke:

- **The function row and media buttons need no modifier.** Modified variants remain available to
  the browser and the rest of the app. The J K L fallback matches the platform's one modifier or
  `Ctrl-Alt`, and no superset of either.
- **It matches the _physical_ key** (`event.code`), because the argument for J K L is physical —
  three keys beside one another with pause in the middle. `event.key` is the fallback for synthetic
  events that carry a character and no code.
- **It prevents nothing it did not handle.** No audio attached means nothing to control, and a
  control that is not on screen must not eat a key press. A held nudge repeats, because that is a
  scrub worth having; a held pause does not, or the track starts and stops dozens of times a second
  and settles wherever the last repeat landed.

**That refusal applies to every Alt-letter binding, and two of the workbench's own were broken by
it.** `Alt-p` (assign performers) had never once fired on a Mac, silently, with no test covering it;
and diagnostics once occupied `F8`/`Shift-F8`, colliding with the media row. Assignment therefore
has `Ctrl-Alt-P` as its cross-platform primary, while diagnostic navigation uses
`Ctrl-Alt-.`/`Ctrl-Alt-,` with `F2`/`Shift-F2` as its function-row aliases. `.` and `,` are adjacent
and sit in the same place on US and Nordic layouts, unlike `/` or the brackets, which are Option
combos on a Norwegian Mac; `.` already means "diagnostic" here through `Mod-.`.

Worth knowing before trusting a green suite: `userEvent` reports `key='p'` for `Alt-p`, so CodeMirror
matches by name and never reaches the base-key fallback it refuses. **The alias tests pin the
binding's existence, not the macOS failure** — that one is reproducible only on real hardware.

**Two defaults do more work than the keys.** A resume backs up two seconds, because the words either
side of a pause are the ones hardest to place and a resume that starts where the ear stopped means
rewinding by hand nearly every time. And `preservesPitch` is on, because every rate below 1 is
unusable without it and those are the rates a transcriber actually reaches for. The run-in is
cancelled by any deliberate placement — a nudge or a scrub — or back-2 followed by resume moves four
seconds and the two controls stop being separately predictable.

**The song is the draft, so the audio and its playhead belong to the draft, not the session.** Both
are stored, and neither is stored on `DraftRecord`: a `FileSystemFileHandle` is structured
cloneable but not JSON, and `exportDraft` and `copyDraft` walk that record field by field. They live
in a `mediaHandles` table of their own (`database.ts` `version(2)`), and `delete` and `deleteAll`
clear it inside their own transactions — a guarantee kept by every call site remembering to make a
second call is one that will eventually be broken, and the tools panel promises this one in prose.

**Bytes are never stored.** A 60MB file per draft would spend the origin's whole quota on one song.
What is kept is a handle, a name, and a number.

Three things the restore depends on:

- **The draft the page boots with never travels through `onDraftLoaded`** — that hook fires on a
  _switch_ — so `createWorkbenchController` calls `openFor` for the initial draft itself. Without it
  a reload came back to a workbench with no audio and no sign there had been any.
- **A restored position is held, not assigned.** `currentTime` does not stick until the browser has
  read the file's metadata, so the seek waits for `loadedmetadata`/`durationchange`. It is shown
  immediately all the same, so a reopened draft says where it left off before the decoder is ready.
- **A reload is not a user gesture**, so a stored handle usually needs one before the browser will
  hand the bytes back. The strip's other state is that question: `Reconnect sensommer.mp3`, naming
  the file in the control rather than in a sentence beside it. Where `queryPermission` already
  answers `granted`, the track simply returns.

Writes are throttled to one every five seconds while audio runs, and bypass the throttle on a pause,
an ending, and a nudge. The flush that runs as the tab hides reads `player.liveTime()` — the
element's own playhead — because `currentTime` is a `timeupdate`-fed mirror, near enough for a
readout and up to a tick stale for the one write that has no second chance. A position is written
against `ownerDraftId`, the draft the loaded audio belongs to, never the draft that happens to be
open: switching drafts mid-playback would otherwise stamp the outgoing track's playhead onto the
incoming draft.

Implementation: `src/lib/ui/state/media-player.svelte.ts` (the transport and its arithmetic),
`media-store.svelte.ts` (attachment, permission, and the durable position),
`src/lib/ui/media/MediaStrip.svelte`, `src/lib/ui/styles/media.css`, and
`src/lib/persistence/media-repository.ts`. `media-test-audio.ts` is the stub both test files drive —
a real `<audio>` rejects `play()` on a synthetic object URL and ignores `currentTime` until metadata
arrives, so what is under test is the transport's arithmetic rather than the browser's.

### Every anchor is deliberate, and neither the audio nor the document moves the other

Line anchoring ties a lyric line to the moment in the audio it was transcribed from. It is the one
feature here with a real capacity to make the editor unusable, because it couples two things that
are each moving under the user's hands — so the whole design is three rules about what it may not
do:

- **The audio never moves the document** — outside sync mode, which is the one exception and is
  described below. No auto-scroll, no follow mode, no caret motion. The playhead arrives several
  times a second and marks exactly one cell of the timestamp column. A document that moves under
  someone typing into it is the fastest way to ruin a transcription tool, and the temptation to add
  "just a gentle scroll" is why this is written down.
- **The document never moves the audio unless the gesture meant only that.** Clicking a line is how
  a caret is placed and is the most frequent gesture in the editor, so a click that also seeked
  would be intolerable. Seeking happens from a press on a timestamp, from a press on an anchored
  line's _number_, and from `Ctrl-Alt-Enter` — and from nothing else. The two gutter paths are safe
  for one reason and it is worth stating: a gutter sits outside `.cm-content`, so a press there
  never places a caret, which is exactly what disqualifies the text. `line-anchoring.svelte.test.ts`
  asserts that clicking an anchored line's text and arrowing across anchored lines both seek
  nothing.
- **Typing writes no anchor at all.** There are exactly three ways one is set — sync mode's tap,
  `Ctrl-Alt-M`, and the timestamp column's own control — and all three are a press the user aimed
  at a line. Each replaces whatever was there, because correcting a wrong time is most of what all
  three are for, so nothing arbitrates between them and `anchorLineEffect` carries no flag.

**There used to be a fourth, automatic, and it was deleted rather than tuned.** Typing a character
stamped that line with wherever the playhead sat. The intent was that nobody transcribing a song
will press a key per line, so an anchor set only by hand is an anchor that never exists — but what
it actually recorded was the moment the user _started typing_ a line, which is after they heard it
and after however long they spent working out the words. That lag has no fixed size and nothing on
screen disclosed it:

- Typing a verse at one pause put every line of it on the same second, so a whole verse pointed at
  one moment and every jump into it landed in the same place.
- Typing along with the tape running put every line late by a different amount.
- Shifting the write back one line does not fix either — it relocates an unbounded error onto a
  different row, right only by luck.

Sync mode is the accurate answer to the job that stamp was invented for, and it was built after it:
one pass, one tap per line, in rhythm, correctable, with `Ctrl-Alt-M` and the column control for
fixing a single line afterwards. Three rules existed only to contain the automatic stamp's guesses
and went with it — the `input.type` prefix precision (`input.atomic` had counted as typing, so
applying a linter fix stamped the line it repaired), the never-at-zero filter, and the never-
overwrite flag. **Do not reintroduce it.** A timing derived from when someone typed is a plausible
number that is wrong by an amount nobody can see, which is worse than the dash that says a line is
not timed yet.

**An anchor is a range over the line's text, not a point at its start**, and that distinction cost
two bugs' worth of learning:

- A point at `line.from` sits on the _boundary_ of the deletion that removes the line, and a boundary
  is not inside anything — so deleting a line left its anchor behind to share the next line with
  that line's own anchor, and a jump went to whichever came first.
- `ChangeDesc.touchesRange` is the obvious way to detect the erasure and the wrong one. Its `'cover'`
  verdict is strict on both sides (`pos < from && end > to`), so deleting a line — a change starting
  exactly at the anchor's `from` — answers `true` like any ordinary edit. What separates the cases is
  whether the span survived: map the start forward, map the end backward, and if they meet, every
  character the anchor described is gone.

That distinction is load-bearing because deleting a line and merging two lines produce _identical_
end states — two anchors on one line — and want opposite answers. Where a merge really happened the
earlier time wins, because the merged line begins with the earlier line's words.

**Anchors live on the draft, not beside the attached audio**, because an anchor describes a _line_:
it is written by typing, it moves when the text moves, and it is saved by the same autosave that
saves the words. That also means a duplicated draft keeps them and detaching the audio does not throw
away work still correct for the same song.

**Three hand-written copiers stand between a draft and the disk, and every one lists the fields it
keeps.** `copySnapshot` in `persistence/autosave.ts`, and `copyDraft` and `createRecord` in
`persistence/draft-repository.ts`. A field added to `DraftRecord` and missed by any of them is
dropped in silence — which is what happened to `lineAnchors`: the autosave stripped it on the way
past, so a whole synced song was gone on reload while the editor, the controller and the repository
all looked correct, and two other real bugs were fixed in front of it before anyone looked here.
**Adding a field to `DraftRecord` means adding it to all three.** `persistence.test.ts` populates
every optional field and asserts the record comes back whole, so the next omission fails there
rather than in somebody's lost work.

**Setting an anchor has to schedule its own save, because none of them change the text.**
`draft.scheduleSave()` runs from `onSnapshot`, and only when the document actually changed — so for
a while a whole synced song was lost on reload. Sync mode holds the document read-only; `Ctrl-Alt-M`
and the timestamp column's own control move nothing. The path is `onAnchorsChanged` on the extension →
`onLineAnchorsChanged` on the contract → `controller.onLineAnchorsChanged()`, and it deliberately
stays quiet for two kinds of update: a document change, which the snapshot already covers, and a
transaction carrying `setLineAnchorsEffect`, which is the draft being read back rather than
changed.

Restoring them has one trap. Opening a draft **remounts the keyed editor**, so the handle in scope
when the draft loads is the outgoing one and anything dispatched into it dies with it. The anchors
are held in `pendingLineAnchors` and applied from `setEditorHandle`, when the replacement publishes
itself — the same hand-off `retryFixPreview` already waits for.

**`?.` is wrong for a one-shot hand-off, and it cost every reload's timings.** The page builds the
controller on a _headless_ placeholder handle — no document, and none of the optional anchor methods
— and CodeMirror publishes a real one only after it mounts. That placeholder is therefore the first
thing `setEditorHandle` ever sees, so `handle.setLineAnchors?.(pending)` dropped a whole synced song
into a no-op and cleared the pending list on the way past. The capability is **checked** now, not
optionally called: there is no second chance to deliver this, and an optional call cannot tell
"delivered" from "silently discarded".

The same window has a second edge, and it is guarded the same way: `bindings.lineAnchors` falls back
to `pendingLineAnchors` rather than to `[]`, because a save landing before the editor mounts — a
rename is enough — would otherwise write an empty list over the draft's own timings. `workbench.test.ts`
pins both halves, and both fail if either guard is relaxed.

Implementation: `src/lib/editor/extensions/line-anchors.ts` (the field, the mapping, the column),
the two commands in `keymap.ts`,
`getLineAnchors`/`setLineAnchors`/`setMediaPlayhead`/`setLyricSync` on `EditorHandle`, and
`onRequestMediaTime`/`onSeekMedia`/`onLyricSyncChange` in `contracts.ts` — which, like every other
hook, must also be added to **`createCallbackProxy` in `create-editor.ts`**, an explicit allow-list
where a missing callback looks exactly like a feature that silently does nothing.

### The anchors are a column on the far side of the text

Anchoring used to draw a dot in a left gutter, and that lost on both counts. The left side already
carries line numbers and the performer voice bars, so a third lane crowded it; and a dot says only
_that_ a line is anchored, never to when. The column on the right says both, and it is where the eye
already goes to check timings.

A cell is a time and one control. **The time is the play control** — a visible timestamp is the most
obvious thing in the world to press to hear that moment, so it needs no glyph, and a separate play
button would be a second control for the gesture the pointer is already on. **The glyph beside it is
one control for the write, not two**: stamping an empty line and correcting a stamped one are the
same command with the same effect, and the line's own state says which, so a pin and a pencil in
adjacent slots would be two buttons for one press.

Four things that arrangement depends on:

- **It draws whenever audio is attached, anchors or not**, and it does not wait for a first anchor
  the way the transport waits for a first file. With no audio the column goes entirely —
  `.cm-editor:not(.ll-has-audio)` sets `display: none`, which also keeps it out of the landing
  page's demo editor. The signal is `setMediaPlayhead(undefined)`, so a shell that wires
  `onRequestMediaTime` and never pushes a playhead gets no column.
- **An untimed line draws a dash, and its control shows at rest on the caret's line.** Both of
  those are corrections. Drawn as a blank cell with a control on hover, the column was invisible:
  nothing on screen said the rail existed, what it held, or that a line could be timed, so the
  whole feature read as absent until the pointer happened to cross the one cell that answered — a
  control discovered by hovering a blank column is a control nobody discovers. A dash is the
  quietest mark that says "a value goes here and is not set yet", which is exactly true, and
  `.cm-activeLineGutter` (from `highlightActiveLineGutter`, already in the extension list) puts the
  stamp control beside the line the user just clicked into. The gutter's own active-line wash is
  turned off, because `.cm-activeLine` already marks the row and a second band starting at the
  text's edge would draw one row as two pieces.
- **Every row reserves the same width**, `calc(4ch + var(--space-5))` — four characters for `m:ss`
  and the rest for the control. An empty row reserves it too, so anchoring a song never moves a
  single wrap point in the document, and the hover control is `visibility: hidden` rather than
  removed for the same reason. (`visibility`, not `opacity`: opacity is never a state carrier here.)
- **The marked cell is the last anchor at or before the playhead**, not the nearest, or the accent
  jumps to the next line halfway through the current one. `lineMarkerChange` is keyed on
  `currentFrom` rather than on the time, so a tick that stays inside one line costs one transaction
  and no rebuild.
- **No `initialSpacer`.** The column's width is a constant in the theme, so a spacer reserves
  nothing CSS has not already reserved.

**The line number is the second way to play a line.** It is a wider, always-drawn target than four
characters of muted time, on the side of the document the eye already uses to find a line — and
CodeMirror binds nothing to the line-number gutter itself, so there was nothing to displace. Two
things it depends on:

- **Only anchored line numbers get the pointer cursor**, and a press on an untimed one returns
  false so nothing is claimed. An affordance that works on some rows and silently not on others is
  worse than no affordance at all.
- **The marker carries `elementClass` and deliberately no `toDOM`.** `lineNumbers` drops its own
  number for any line whose markers include one that draws (`others.some(m => m.toDOM)`), so a
  marker with a body would replace the line number rather than decorate it. It rides the
  `lineNumberMarkers` facet rather than `gutterLineClass`, because the latter classes the matching
  element in _every_ gutter — the timestamp cell and the performer bar included — for a fact that
  is only about this one.

**Everything in the column is a pointer affordance and says so.** CodeMirror sets
`aria-hidden="true"` on the whole `.cm-gutters` container and a descendant cannot opt back in, so
nothing in any gutter is reachable by assistive technology. Nothing here carries an `aria-label` — a
name nothing can read is a claim to accessibility rather than the thing itself — and nothing is
focusable, both because a focusable control inside an `aria-hidden` subtree is a real violation and
because a hundred anchored lines would be two hundred tab stops before the first word. The
equivalent paths are `Ctrl-Alt-Enter`, `Ctrl-Alt-M`, and sync mode, all of which announce what they
did. **Do not give a gutter control an accessible name and call it done.**

The escape hatch — line-decoration widgets at the end of each line, which _would_ be in the
accessible tree — is disqualified rather than unconsidered. A widget in the content flow
participates in selection and copy, and clean lyrics on the clipboard are this application's entire
output. A timestamp in somebody's paste is the worst bug it could ship.

### Sync mode is the one place the audio moves the document

Automatic stamping only ever anchors lines typed _while_ the audio runs, so a draft pasted in from
somewhere else has nothing — which is most drafts. Sync mode is how one gets timed: press play, tap
a key at the start of each line, and the caret walks down the document ahead of you.

**It is a mode, and that is what makes the key cheap.** The whole value is one key hit in rhythm
without thinking about it, which rules out a chord; and a bare `Space` is only free if the document
is not taking typing. So entering sets `EditorState.readOnly` — which blocks document changes only,
leaving the caret free to walk and the anchor effects free to land — and every way out is loud:
`Escape`, the strip's own control, and running off the end of the document.

**No `preventDefault: true` on any of the sync bindings.** That option prevents the default even
when the command returns _false_, so it swallows the space bar, backspace and the up arrow in an
editor that is not syncing, which is to say almost always. Returning true already prevents the
default, and returning false is exactly the case that must not. This cost a green suite once.

**A finger has no `Space`, so the tap is also a control.** While a run is under way the strip's
name slot becomes `Tap each line`, which is the run's instruction and the thing you press at once —
and on a phone it is the only way to drive a run at all. Three things about it:

- **It is bound to the command, not to a synthesised key event.** `lyricSyncTap` is exported and
  the `Space` binding, the `Enter` binding and `tapLyricSync` on the handle are all the same
  command over the same options, so the offset, the deferred advance and the ending on the last
  line cannot come to mean one thing under a key and another under a finger.
- **It draws on every pointer**, and only its width follows the device: under a coarse one it takes
  the row's slack, because a target pressed in rhythm has to be found without looking away from the
  lyric. A control that exists only on some devices is one nobody documents and nobody tests, and
  pressing it with a mouse is a legitimate way to time a line. `Space` and `Enter` activate a
  focused button and are the run's own keys, so the keyboard path survives the button taking focus.
- **It does not focus the editor.** The press is already in the transport, the caret walks on its
  own, and the document is read-only for the duration anyway.

The `Esc stops` hint beside it goes under a coarse pointer, where there is neither room for it nor
a key it names.

**Its control is the one bordered thing in the strip, and it earned the step up.** Set quiet, it
was a word in the same muted type as the readouts either side of it, in the shortest row in the
window — the entry point to a whole mode, indistinguishable from the track's name, and unfindable
even by the person who designed it. Everything else in that row is a transport glyph the user
already knows how to look for or a number they read; this is the only thing there that _starts_
something, so it is the only thing there drawn as a command. Bordered rather than contrast: the
tier above belongs to a surface's primary action, and the primary thing this row does is play and
pause.

The rest is five decisions:

- **The caret and the tape begin in the same place, and a half-timed song picks up where it was
  left.** A run is one pass over the document against one pass of the audio, so starting the tape at
  0:00 and the caret at whichever line was last clicked would time the wrong lines from the first
  press. `runStart` decides where that is and the shell learns the matching moment through
  `onLyricSyncChange(active, startAt)` — the editor's answer, because the anchors are the editor's.

  A part-timed song resumes on the **last line that already has a time**, `armed`, so the first tap
  advances onto the first untimed line exactly as any other tap would. Landing directly on the
  untimed line would mean tapping its opening syllable from a standing start; a whole line of run-up
  is what makes the rhythm findable again. A song with nothing timed and a song timed all the way
  through both start over from the top — the second is the only sensible reading of pressing sync on
  finished work, since there is nothing to resume.

  Correcting one line afterwards is what the column's own control and `Ctrl-Alt-M` are for.

- **Blank lines and section headers are skipped**, through the parser's own `isSectionHeaderLine`
  rather than a regex of the editor's. A header sits in the gap before its verse, so a tap spent on
  it would land at the exact moment the verse's first line starts and put every anchor in that
  section one line out. It is also why the run starts on the first _stampable_ line rather than
  line 1 — the top of a lyric is usually a header.
- **The caret lands on the line that was just timed, not on the one coming next.** A tap is a claim
  about the line starting _now_, so the row that lights up has to be the row whose time just
  changed — that is the whole of the feedback for the press, and read on the following line it is
  feedback about the wrong thing. It is also what the user is doing between taps: reading along
  with the line they are hearing, checking the words against the music. So the advance is deferred
  to the front of the _next_ tap, which is exactly when it stops being wrong, and `armed` on the
  sync field is what tells a run's first tap on a line from its second. Timing the last line ends
  the run there rather than on a further press, because a press that only stopped the mode would be
  a press the user made expecting to time something.
- **`Backspace` and `ArrowUp` undo the last tap.** Without a way back one fumbled tap means
  restarting the run, because every later press lands on the wrong line. It clears the line it
  leaves rather than merely stepping off it, so that line is genuinely un-timed and the next tap
  writes it fresh — and it goes back to the previous line, which is still timed and therefore still
  `armed`. This is the only caller of `clearLineAnchorEffect`.
- **Every tap is written `tapOffsetSeconds` early** (120ms). Human taps land late, and without the
  offset jumping to a line starts just after its first syllable — the annoying direction, because
  the word you came back to check is the one you miss.
- **The stamp and the advance are one transaction.** One press has to be one undo, and `readOnly`
  does not stand in the way of putting a selection change and an effect in the same dispatch.
- **The document follows the run, at a reading line a third from the top — and not before the caret
  gets there.** Far enough down that the lines already timed stay readable above it, high enough
  that the two thirds below show what is coming, which is what the user reads ahead into while
  waiting for the next line. A run starts at the top of the lyric, where the first lines are
  naturally above that point, so scrolling on the first tap would throw the page down to reposition
  a line the user could already see. `holdReadingLine` therefore leaves the document alone while the
  caret descends and only starts moving at the moment the caret would otherwise go past — and pulls
  back a caret that has gone _above_ the viewport, which is what makes `Backspace` land somewhere
  visible.

  It sets `scrollTop` rather than passing `scrollIntoView`, because CodeMirror's own scroll is a
  nearest-edge nudge with no notion of a fixed reading position, and it is instant rather than
  smooth, because a smooth scroll started on every tap would still be animating when the next
  arrived. Worth knowing before trusting a test here: **near the top of the document the browser
  clamps a premature scroll away at zero**, so an assertion that nothing moved on the first taps
  passes with or without the guard. The one that bites is stepping back once the document is already
  scrolled — without the guard that hauls the page up to re-centre a row already in plain view.

The editor owns the mode and the shell reacts (`onLyricSyncChange`), which is what keeps the tape
and the mode from disagreeing: `Escape` and the end of the document both end a run without the shell
being asked, and both arrive through that one hook. The shell answers by playing or pausing, and by
focusing the editor on entry — the tap is a keystroke, so a run cannot start with focus in the
button that started it.

Implementation: `src/lib/editor/extensions/lyric-sync.ts`, the control in `MediaStrip.svelte`, and
the wiring in `Workspace.svelte`.

### YouTube is a second source behind the same transport, and it is asked for every session

Transcribers' audio is usually on YouTube, so it is the source most of them actually have. It is also
the only thing in this application that contacts a third party, and both facts have to stay true at
once.

**One transport, two sources.** `MediaPlayer` holds a `MediaSource` — `time`, `duration`, `rates`,
`play/pause/seek/setRate/clear/destroy`, reporting upward through events — and every rule worth
having is written once against that interface: the two-second resume rewind, the clamp to both ends,
nudge and scrub cancelling the run-in, `liveTime()`, the `'progress' | 'settled'` reasons. A source
reports; it never decides. The evidence the abstraction did not disturb the default is that
`media-player.test.ts` needed no changes at all.

**The source hides the async gap; the transport must never learn about it.** The media element is
synchronous and the IFrame API is a postMessage bridge, so `createYouTubeSource` records the target
of a `seekTo` and reports _that_ from `time` until the player agrees. Without it, back-2-then-resume
moves five seconds, and there is a test pinning exactly that against a stub with read latency.
`getCurrentTime` is a poll rather than an event, so it runs at 250ms while playing and stops on
pause, end, clear and destroy — a poll that outlives its player is a leak that costs battery on a
page nobody is looking at.

**The opt-in is per session and deliberately not persisted.** A stored "yes" would load Google's
script on a page nobody has touched, which is the thing the consent exists to prevent. So a
remembered video comes back as a pending source waiting on a press, exactly as a file handle waits on
a gesture. `loadYouTubeApi()` is the whole network surface and nothing calls it at module scope. The
host is `youtube-nocookie.com`. The sentence stating the trade is prose in the Tools panel, not a
tinted warning box, and it says the two things that are actually true: Google sees which video is
being transcribed, and that draft stops working offline.

**Offering a rate that will not apply is worse than offering fewer.** `playbackRates` is now the
_offer_; `MediaPlayer.availableRates` is that list intersected with what the source says it can do,
and the strip renders the latter. The offer stands until the source contradicts it, because
collapsing to one option and growing back is worse than either. `preservesPitch` has no YouTube
counterpart — the player pitch-corrects itself and exposes no control — so there is nothing to set
and that is documented rather than faked.

**No schema bump.** `source?: 'file' | 'youtube'` and `videoId?` are unindexed, so the live
`version(2)` `mediaHandles` table takes them without a migration, and **absence reads as `'file'`** —
which is what keeps every record written before YouTube existed working. That is why the discriminant
is optional rather than required.

**The video cannot be a hidden iframe**: YouTube's embed terms require a visible player, minimum
200×200. That minimum is `px` and not `rem` — the one place in the system where a literal length is
right, because a rem shrinks below a third party's stated floor on a smaller root font.

**It draws at the foot of the right panel, not in the editor column.** It began above the strip,
on the reasoning that the picture and the controls under it are one band; what that missed is that
they are used differently. The transport is operated constantly — three keys, a scrubber — and
belongs under the document because it controls what the document is transcribed from. The picture
is only looked at, and two hundred pixels of it taken off the editor is two hundred pixels off the
thing being typed into, where the same two hundred off a scrolling list of findings costs a scroll.

Three things that placement depends on:

- **It is the panel's _last_ band, under the ignored-rules footer rather than over it**, and the
  order is by scope: the pane, then the chrome belonging to that one pane, then the chrome
  belonging to the window. A picture that survives every tab switch cannot sit above a bar that
  exists only inside the linter, or changing tabs would move it.
- **It is outside the panes**, so a tab switch does not destroy and rebuild the iframe — which is a
  black flash and a lost playhead every time. `RightPanel.svelte.test.ts` pins the element's
  identity across a switch.
- **The frame takes the panel's width and holds 200px as a floor.** At 21rem the panel is narrower
  than the 356px a 200px-tall 16:9 box wants, so `min-height` overrides `aspect-ratio` and the
  picture is pillarboxed by a few pixels. A couple of pixels of black beside the video costs
  nothing; a frame 189px tall is a term broken quietly.

Implementation: `src/lib/ui/state/media-youtube.ts`, `MediaVideo.svelte`, and the stub in
`media-test-youtube.ts`, which is what makes "nothing has contacted Google" an assertion rather than
a hope — its load count is the number of times the real loader would have injected a script tag.

### Spotify is a third source, and it is the one with no cue and no rate

Most transcribers' audio is on Spotify, and the two things that make it awkward are worth stating
before the code: it costs the speed control, and it is the only source that needs an account.
Neither is a reason to refuse it — a transcriber who has the song in the tool is better off than
one who has it in another tab — but both shape the module.

**The rate is `[1]`, permanently.** Spotify exposes no playback-rate control at any layer, so the
source reports one rate and `reconcileRates` narrows the workbench's offer to it and announces the
narrowing once. Nothing pretends otherwise, `preservesPitch` has no counterpart to set, and the
picker states it as a fact under the control — `No speed control`, beside `Needs Spotify Premium` —
rather than leaving the user to discover it when the menu they were reaching for has one entry.

**The way in is a search, because a link is a trip to another application.** YouTube has to be
pasted — there is no public search without an API key — but Spotify's `/v1/search` needs no scope
beyond the token the sign-in already produced, so asking the user to go and fetch a URL would be
making them do work this application can do for them. One field takes both: a query that parses as
a track link attaches outright and anything else is searched, so a paste still works and costs no
second control in a section that has room for one row. Results are six rows on the dialog with the
track at one end and its length at the other — not a boxed list, which would be the card inside a
card the design rules forbid.

**A sign-in interrupts that search, so the query rides across the redirect with it.** The intent
carried through `sessionStorage` is therefore one of two things, and `resumeSignIn` tells them
apart with the same parser: a link attaches on the way back, a query is handed to the picker
through `takeResumedQuery` for it to reopen and re-run. Reading it clears it, because a query left
standing would reopen the dialog on every later render. Without this, a user's first search — the
one that triggered the sign-in — was silently thrown away and they came back to an untouched
workbench.

**There is no cue, and that is the whole shape of the source.** `cueVideoById` is what keeps
attaching a YouTube video from playing it; Spotify's only way onto a device is
`PUT /me/player/play`, which plays. So attaching fetches the track's name and length over the Web
API — no sound — and the `PUT` is deferred to the user's first `play()`. That is what `started` is
for: the first press starts the track at whatever position was restored, and every press after it
resumes. A restored playhead is therefore spent as `position_ms` on that first call rather than as
a seek, because before the first press there is nothing on the device to seek in.

**Both Spotify layers are used, and each does the one thing the other cannot.** The Web Playback
SDK is playback and position; the Web API is exactly two calls, the metadata read and the start.
The Connect API alone would have been less code and was rejected on the poll: `GET /me/player`
against a rate limit of a few requests a second would make every line anchor sloppier than the file
source's, where the SDK's `getCurrentState()` is answered inside this tab and costs nothing.

**The deployed build ships without Spotify, and that is the feature working as designed.** It draws
only where `PUBLIC_SPOTIFY_CLIENT_ID` is set, and production leaves it unset — because a visitor
who is not on the five-slot allowlist gets no polite refusal, but a trip to Spotify, a sign-in, and
Spotify's own error page. Offering an answer that cannot be carried out is the thing
`availableRates` and `spotifyAvailable` both exist to prevent.

A machine on the allowlist sets it in **`.env.development.local`**, and the `.development.` is
load-bearing: Vite loads `.env.local` for `vite build` as well, so the obvious filename bakes a
local opt-in into any bundle built on that machine and deploys it. The suite pins its own value in
`vite.config.ts` and reads neither file — without that, the picker's tests passed on the machine
that had an env file and failed on a fresh checkout.

**This app cannot leave development mode, and the code is written for that.** Since May 2025
extended quota is organizations only — a registered business, a launched service, **250,000 monthly
active users** — so LyricLint stays capped at a hand-added allowlist (5 users for apps registered
after February 2026), and the owner's account must be Premium. The February 2026 dev-mode changes
also cap `/search` at `limit=10` and remove the _batch_ fetch endpoints; this module is on the
surviving side of both, because it asks for 6 results and reads one track at a time through
`GET /tracks/{id}`, which that migration names as the replacement. Player endpoints were untouched.
Do not "optimise" the metadata read into a batch call.

**Tokens live in `sessionStorage`, and neither longer nor shorter.** A refresh token in
`localStorage` is a credential at rest in a tool whose whole promise is that it keeps nothing, and
it would let an untouched page reach Spotify on load — which is the exact thing `youtubeAllowed`
exists to prevent. So being signed in _is_ the consent, `spotifySignedIn()` stands where
`youtubeAllowed` stands, and a remembered track comes back waiting for a press exactly as a
remembered file handle does.

They were held in module memory first, and that was stricter than this rule rather than safer than
it: module memory dies on **reload**, so every refresh of the workbench bounced the user through
Spotify's authorize screen to re-establish a session the browser still considered open. A browser
session survives a reload and ends with the tab, which is what "session-scoped" meant all along, and
script that could read the stored copy could already read the in-memory one. A refused refresh
clears storage as well, or every later reload rehydrates a dead token and spends a round trip
rediscovering that.

**The mark beside the track name is a requirement, not decoration.** Spotify's Design Guidelines
want their content attributed wherever it plays — the mark, the track and artist named beside it,
and a way back to the track on Spotify — and a missing one of those is the most common reason a
quota-extension request is refused. So `.media-strip__spotify` is the **one literal color in this
stylesheet outside the favicon**: a third party's brand asset is not a tone from our palette, their
green is fixed, and their floor is 21px. A semantic token here would be the design system claiming
ownership of something it does not own, and would drift the moment the theme moved. It opens a new
tab, because the workbench is a document being typed into.

**Spotify refuses the name `localhost`, not merely insecure origins, and its error says the
opposite.** `redirect_uri: Insecure` on a blank white page is what comes back from
`https://localhost:5173/lint/` — a real TLS origin with an mkcert certificate behind it — because
the rule is about the host and Spotify wants `127.0.0.1`. Read as a statement about the scheme,
that message sends you to fix the one thing that was already right, and it cost two wrong guesses
here before anyone doubted the word "Insecure". `spotifyRedirectAllowed()` refuses `localhost` and
`[::1]` at any scheme and otherwise wants HTTPS or the loopback literal, and the picker names the
URL to open rather than the rule to satisfy — a user told "needs HTTPS" while looking at a padlock
has been told nothing. **Dev therefore runs on `https://127.0.0.1:5173/`,** which the certificate
`bun run certs` writes already covers.

It reports rather than repairs, and the rewrite it declines to do is the interesting part:
retargeting `localhost` to `127.0.0.1` on the way out would send the user back to a **different
origin**, where `sessionStorage` cannot see the PKCE verifier that was written under the first one
— so the flow would fail one step later with a far stranger message. The origin has to be one the
user is actually on.

**The sign-in is a full-page redirect back to `/lint/`, not a popup.** A popup costs another
prerendered route, a `postMessage` bridge and a blocker to fall foul of, to save a reload at the one
moment a reload is free — the draft is autosaved, and attaching audio is not typing. `attachSpotify`
is therefore re-entrant: it either attaches or leaves for Spotify carrying the link, and
`resumeSignIn` calls it again with that link on the way back. It runs **after** `openFor` at boot,
because the returning load has already restored this draft's pending track and `openFor` arriving
second would detach what the user just signed in to hear.

**The client id is committed, because it is not a secret and the alternative fails silently.** A
client id travels in the authorize URL and is inlined in the bundle however it is supplied; PKCE is
the flow for clients that can hide nothing, so there is no secret to leak. The trap it avoids is
that `import.meta.env` is resolved at **build** time: a value set as a Cloudflare Pages _runtime_
variable, or through `wrangler secret`, never reaches the bundle at all, so Spotify would work
locally and quietly vanish from the deployed picker. `PUBLIC_SPOTIFY_CLIENT_ID` still overrides it
for a fork, and setting it empty turns the feature off — when it resolves to nothing,
`spotifyAvailable` is false and the picker does not draw an answer it cannot carry out, the same
rule `availableRates` follows. `envPrefix` in `vite.config.ts` is what carries `PUBLIC_` onto
`import.meta.env`.

**`trackId` is its own field on the record, not a reused `videoId`.** They are different lengths in
different alphabets, and a record that confused them would fail as a 404 a long way from here. Both
are unindexed, so the live `version(2)` `mediaHandles` table takes them without a migration. The
store's `forget()` exists for the same reason the three draft copiers are called out above: the
pending fields were cleared by three hand-written runs of assignments, and a fourth source is a
field added to all three or silently dropped by two.

Implementation: `src/lib/ui/state/spotify-auth.ts` (PKCE, tokens, the redirect),
`media-spotify.ts` (the source and the link parser), and `media-spotify.test.ts`, whose stub SDK is
what makes "attaching plays nothing" an assertion rather than a hope.

### Audio arrives by drop, and the drop that is not audio is not ours

Dragging an audio file onto the document attaches it. The rule that matters is the negative one:
CodeMirror has its own drop handling that inserts dropped text at the drop position, and that must
keep working exactly as it did. So the handler `preventDefault()`s **only** when it is actually
taking the file — unconditionally preventing on `dragover` is what breaks native text drop — and the
shell returning false hands the event straight back to CodeMirror.

Detection happens on `dragover`, where the browser withholds the file's name and exposes only
`kind` and `type`, so an empty `type` counts as a candidate (some browsers report nothing for
`.flac` and `.opus`) and the extension is only checkable on `drop`. `dragleave` ignores a
`relatedTarget` still inside `contentDOM`, or crossing between lines blinks the affordance.

The affordance is an inset outline on the editor's own edge, because the thing that will take the
file is the whole document — a tinted sheet or a "Drop here" box would be a card inside the editor
saying what an edge already says.

Implementation: `audioFileDrop` in `src/lib/editor/create-editor.ts`, `onAudioFileDropped` in
`contracts.ts`, and `src/lib/editor/audio-drop.svelte.test.ts`, which asserts both halves of the
regression: dragover is not `defaultPrevented` for text, and dropped text still reaches the document.

### A panel section is a heading over at most two things

The tools tab stopped being skimmable the ordinary way: nothing in it was wrong on its own. Its
`Document` section had grown to four actions, which wrapped into a ragged two-by-two of mixed tiers,
and the privacy story was told three separate times — once about audio under those buttons, once
under `Local data`, and once more in a trailing sentence with no heading over it at all. Every part
was defensible; the panel was a wall of grey.

Two rules came out of the repair:

- **A section's actions fit on one row.** Two is what fits at this panel's width, so a third has to
  displace something or live somewhere else. That is what moved attaching audio to the status bar
  rather than shortening its label to squeeze it in — the constraint is a forcing function for
  putting a command where it belongs, not a licence to abbreviate. `Export current draft (.txt)`
  also lost two words, because the toolbar names the draft two rows above it.
- **A claim is made once, where the reader is deciding.** Everything local is said under
  `Local data`; what YouTube costs is said in the picker, beside the press that spends it. A warning
  met an hour before the decision is a warning already forgotten, and the same warning in two places
  reads as two different warnings.

The trailing `.offline-note` went with this, and its CSS hook went with it: a selector for markup
nothing renders is the same drift as a fallback color for a token nothing defines.

`ToolsPanel.svelte.test.ts` asserts the heading list, the single action row, and the _absence_ of any
audio control — re-adding one here is the specific regression that made the panel messy the first
time.

### A surface that opens itself has to have been asked, twice over

The performer picker is the one overlay in the workbench that appears without a press aimed at
it: select lyric text and it is there. That is worth having — assignment is the workbench's one
selection-scoped job, and a card that arrives with the selection is faster than any command — but
it puts the surface on the most common gesture in a text editor. People select text to re-read a
line, to drag it, to delete it and type over it. So it opens on two conditions, and **it is silent
when either fails**, because the user asked for nothing and owes no answer to a question they did
not put.

- **The gesture has to have meant only that.** `select.pointer`, never `select`. A drag or a
  double-click is terminal: the button came up and the user is looking at what they picked. A
  keyboard selection is nearly always a step _inside_ an edit — Shift-arrow to retype a word,
  Shift-End to cut the rest of a line — so a card that opens over the caret there interrupts the
  very gesture it read as an invitation. The keyboard keeps `Ctrl-Alt-P`, which is a press that
  meant only this.
- **The range has to be one an assignment could be written to**, which is `canAssignVoiceGroup` in
  `performers/transform.ts` and not a predicate of the editor's own. It is the three checks
  `assignVoiceGroup` opens with, through the same helpers, so the card cannot offer an assignment
  the transform is about to refuse: a header, the legend inside it, a drag across two sections, and
  a document with no headers at all are all ranges the picker used to open on and then fail from.
  What it does not ask about is the roster — an empty one is answered by the card's own inline add,
  and `too-many-groups` depends on performers the card is open to choose.

**One flag on the anchor, `offersAssignment`, and not two.** The overlay layer has one decision to
make and no use for which half said no; the flag also short-circuits on the gesture, so the parse
behind the second half never runs for the anchors the plugin reports on every settled scroll,
geometry change and typing pause, which is nearly all of them. The geometry beside it is still
reported for every selection either way — it is the cache every anchored overlay positions
against, including the two that were never opened from a selection.

**Not offering is not the same as the selection going away.** An anchor with nothing to offer
leaves an open picker standing; only `undefined` — collapsed, whitespace, composing — retires it.
Closing on the first unassignable selection would shut the card the moment a user reached past it.

**`Ctrl-Alt-P` asks the same question and answers out loud.** Two ways in that disagree about what
is assignable is the bug this section exists to prevent, so both call the one predicate; what
differs is what a refusal costs. The uninvited surface stays quiet, and the aimed press gets a
sentence, because a shortcut that silently does nothing reads as a shortcut that is broken.

`EditorPane.svelte.test.ts` pins all four cases — pointer opens, keyboard does not, programmatic
does not, a header does not — and `transform-boundaries.test.ts` pins the predicate against the
transform's own `blocked` verdicts, so the two cannot drift apart.

### Every transient surface dismisses on an outside press

Anything that floats over the workbench — a picker, a popover, a menu — closes three ways, and
all three are required: `Escape`, its own closing control, and **a pointer press anywhere
outside it**. The outside press is the one users reach for without being told, so a surface that
lacks it reads as stuck.

The closing control exists to cover a way out the user cannot see, so a surface that already
closes itself on the pointer path does not need one. The hovered diagnostic popover is the case:
nothing in it is pending, and the pointer-leave watcher ends it the moment the user moves away,
so a `Close` there would only sit beside `Ignore` wearing the same quiet tier while one of the
two silences a rule for the session. Its keyboard-opened twin keeps `Close`, because that one
holds focus, is deliberately exempt from the pointer-leave watcher, and would otherwise offer no
exit but a keystroke nobody announced (`closingControl` in
`src/lib/editor/overlays/DiagnosticPopover.svelte`). Dropping the control is only ever justified
by naming the visible exit that replaces it.

Use the shared attachment, never a hand-rolled listener:

```svelte
<div class="picker" {@attach dismissOnOutside(dismiss)}>
```

`src/lib/interaction/dismiss.ts` is the implementation. It listens for `pointerdown` in the
capture phase — waiting for `click` leaves the surface up through the press, and the bubble
phase never arrives for presses that CodeMirror or a picker cancels for its own reasons.

Two rules for the `dismiss` callback:

- **It does not move focus.** The press already named where the user is going; calling
  `returnFocus()` there would drag the caret out of whatever they just pressed. `Escape` and
  `Cancel` are the paths that hand focus back.
- **It abandons the surface's pending state**, so reopening never resurfaces a primed confirm.

Attach it to the surface's outermost node. For a `<details>` menu that is the `<details>`
itself, which keeps a press on the summary inside the surface where the native toggle can do its
job. A modal `<dialog>` is the exception: it already has a backdrop, so it dismisses by
comparing `event.target` to the dialog (`src/lib/ui/layout/LanguagePicker.svelte`).

Canonical implementations: `src/lib/editor/overlays/SectionPicker.svelte`,
`src/lib/editor/overlays/PerformerPicker.svelte`, `src/lib/editor/overlays/DiagnosticPopover.svelte`,
and `src/lib/ui/layout/DraftMenu.svelte`.

### The hero is a claim, a sentence, and a line of facts

The landing page opened with a headline, four muted lines restating the entire product, two
actions, and two more muted lines explaining what the product could not do — all at the same
spacing, so nothing led and the loudest control on the page was followed immediately by a caveat
about it. Six blocks of grey before the reader reached the live demo that would have convinced
them. Overwhelming is a symptom of mass; unconfident is a symptom of saying everything at once
and then apologising.

Three things, in three different sizes, and nothing else:

- **The headline is the claim**, at `--font-size-3xl` — the one step past the display size, fluid
  between a phone and an 800px viewport, and the only use of it in the system. It is
  `text-wrap: balance`d so it breaks between phrases instead of wherever the column runs out, and
  its tracking is negative, because the spacing that keeps 15px UI text legible reads as loose at
  40px.
- **The lede is one sentence**, and it says the one thing that separates this from a
  spellchecker: the guideline behind each finding. Everything it used to say beyond that —
  what the product is, what the workflow is, what the copied markup is worth — already has a
  section of its own further down, and a first paragraph that says all of it is the drift this
  section exists to prevent.
- **What it costs is a line of facts**, in the meta idiom the diagnostic card established:
  interpuncts, muted, small, `Free · No account · Desktop or laptop`. A requirement stated as a
  specification reads as a specification; the same requirement spelled out in two sentences under
  the button reads as an apology for the button. There are three because a fourth wrapped at a
  phone's width, and the one that went is the privacy claim — the footer of every page already
  carries it.

The separator and the fact after it are one flex item (`.site-meta__fact`), so a wrap can never
leave an interpunct dangling at the end of a line with nothing to separate.

The three are **centred, and they are the only centred thing on the site.** The hero is a stack
read as one object with a screen of space around it; everything below it is prose, and prose is
read down a left edge.

No border and no fill: a hero that boxed itself would be a card separating its contents from
nothing. The space around it is the boundary.

**It takes the screen and leaves exactly one thing on it: the top of what comes next.** A first
screen that is only a headline is a claim with no evidence under it, and one that ends at a clean
viewport edge reads as the end of the page — either way the reader never reaches the live demo,
which is the only thing here that proves any of it. So the hero is sized to stop short, and the
next heading and the top edge of the editor stay on screen underneath it, cut off. That is the
scroll affordance; there is no chevron, and adding one would be saying it twice.

**The heading sits directly on the demo, and what the sample gets wrong is read back afterwards.**
That paragraph used to lead into the editor with a colon, which put four lines of prose in the peek
describing a picture the reader could not see yet — and it cost the hero the same four lines, so
the claim sat higher up the screen than it had to. Underneath the demo it names findings that are
already on screen, so it needs no colon and no forward reference, and the peek is the pair worth
peeking at.

Three things that arithmetic depends on:

- **`svh`, never `dvh`.** A phone's URL bar retracts on the first scroll, and `dvh` grows the hero
  underneath the reader as it goes, closing the gap the hero exists to hold open.
- **`--site-hero-reserved` is measured, not guessed** — the header band, the page's own top
  padding, and the peek. It is _smaller_ on a phone (`14rem` against `18.5rem`), because the phone
  gives back the header's padding and the peek is only the heading and the editor's top edge.
  Re-measure it if the heading's margins, the header, or what sits between them changes.
- **On a short phone the subtraction stops governing**, and nothing peeks: below roughly a 600px
  visible viewport the hero's own content — a four-line headline, the lede, two stacked actions,
  the fact line — is taller than the `min-height` this arithmetic computes, so the box grows to fit
  and the next heading lands at the fold. That is not a regression to hunt; it is the floor of what
  the hero contains. Fixing it means making the hero's contents shorter at that height, not tuning
  the reservation.
- **The height is capped at `32rem`.** The subtraction alone is right on a laptop, which is wide
  and short; a tablet held in portrait is a thousand pixels tall, and centring four small elements
  in all of it puts a hundred and fifty pixels of nothing above the headline and the same below.
  Past the cap the hero stops growing and the page moves up instead, which is the right trade — a
  taller screen showing more of the demo is more evidence, while a taller screen showing more
  empty canvas is only a longer scroll to the same place.

Below `32rem` the two actions stop fitting on one row by about two pixels, so they become a column
on purpose, at one width. Two centred buttons of unequal width stacked on each other read as a row
that broke rather than as a column that was meant.

Implementation: `.site-hero` in `src/lib/ui/styles/site.css` and
`src/routes/(site)/+page.svelte`.

### On a phone the site header is not a band, and the masthead never underlines

`theme-color` is `--color-canvas`, which means the browser paints the status bar and the safe area
with the **page** color. A header filled with `--color-chrome` therefore met that strip at a seam a
few percent lighter than it, full width, at the very top of the first screen — so the first thing
the page said was that it was two mismatched bands, before it said anything about the product.

Below `46rem` the fill comes off, and the border with it. A band separates pinned chrome from
content moving under it; at this width the header scrolls away with the document like everything
else, so it separates nothing, and a hairline under a band the same color as the page is a rule
drawn across the canvas for no reason. The footer keeps its rule and loses its fill for the same
trade — the rule is what marks the end of the article, and it does that job alone. **On a laptop
the band stays**, because there it is the workbench's own band over a wide page with no browser
tint above it to disagree with.

Two things that follow, and both are load-bearing:

- **`theme-color` and the top of the page are one decision.** They are already coupled by
  `theme-color.test.ts`, which pins the meta tags to `--color-canvas`; this section is the other
  half of it. Anything given a fill at the top of a site page has to answer what the browser is
  painting above it.
- **The gutter is the prose gutter.** With no band to sit in, the wordmark's left edge is read
  against the headline's and every paragraph's, so header, footer, `.site-main`, and `.rules` all
  take `--space-5` at this width. `.rules` needs saying separately because the rule reference is
  laid out by its own grid rather than by `.site-main`.

**The nav is chrome, and chrome does not underline.** Set as prose links, `About Rules Open the
app` were three accent-blue underlined words crowded against the wordmark — a link list where a
masthead should be, and on a phone the busiest thing on the first screen. They are quiet text at
every width: `--color-text-muted`, resolving to the body color under the pointer, the way the
workbench's toolbar commands answer one. The page the reader is on is still named rather than
linked, but it says so with a step up in color now instead of the absence of an underline.

Implementation: the `max-width: 46rem` block and `.site-nav` in `src/lib/ui/styles/site.css`.

### The demo is as tall as its verse

The landing page's editor is the workbench's `EditorPane`, and for a long time it was also the
workbench's _shape_: a fixed box with the document scrolling inside it. That is right for the
workbench, where the editor is one half of a two-column window and has a column to fill. It is
wrong in an article. The box had to be tall enough for the worst wrap at every width it covered, so
it was too tall at all the others — a hand of empty surface under a four-line verse — and it took
three measured breakpoints to be wrong by a different amount at each size.

Two mount options say so, both off by default so the workbench is untouched
(`CreateLyricEditorOptions`, threaded through `EditorPaneProps`):

- **`autoHeight`** makes the pane as tall as its document and lets it grow as one is typed into it.
  It also brings the content's bottom padding down from `--space-8` to `--space-5`: forty eight
  pixels under the last line is room to scroll it clear of the bottom edge, and a pane that never
  scrolls has no use for it.
- **`sectionGhosts={false}`** drops the `+ Add section header` row, which costs one row of a
  document you can scroll and a quarter of a box four lines tall.

Three things this arrangement depends on:

- **The host owns no size and paints nothing.** `.editor-pane` is `height: 100%` with a
  `min-height: 12rem` floor and a `--color-surface` fill; under `autoHeight` all three come off. The
  floor would put a foot of empty surface under a short document — and, before CodeMirror loads,
  the empty host is stacked under the stand-in that is already drawing the verse. The fill is worse:
  it is a square box directly behind a child that draws a rounded one, so at each corner the host
  paints outside the editor's curve and the box reads as poking out of itself.
- **The stand-in has to be the shape the editor will be.** With neither given a height, the box is
  whichever of the two is in the document, so `.site-demo__fallback` is set in the editor's own type
  at insets measured to where the editor's text lands. Matching insets at matching type means
  matching wraps. What is left over is that a row carrying a diagnostic badge is taller than plain
  text, so hydration can still settle the box by up to one row at some widths; it happens below the
  fold, because the hero holds the first screen. Re-measure the insets if the gutter, the content
  padding, or the editor's type changes.
- **A CodeMirror theme mounted later does not reliably come out later in the sheet.** `StyleModule`
  decides that, so at equal specificity the override is a coin toss — `autoHeightTheme` writes
  `&.cm-editor` where `editorTheme` writes `&`, and wins outright. The first version of it lost
  silently: the padding stayed at 48px and the `min-height` floor stayed standing, and the box only
  looked right because the wrapper had stopped setting a height.

Implementation: `autoHeightTheme` and both options in `src/lib/editor/create-editor.ts`,
`.editor-pane.auto-height` in `src/lib/editor/EditorPane.svelte`, `.site-demo*` in
`src/lib/ui/styles/site.css`, and the pane's own tests in `EditorPane.svelte.test.ts`.

### The mark and the wordmark are one object

There is one pair of brackets in the brand, not two. The mark's brackets and the `[Lint]`
brackets were always the same shape drawn twice, so the lockup is a single rig that opens and
closes: closed, the brackets hold the waveform and it _is_ the mark; open, the waveform has
flattened onto the baseline, `Lint` has grown out of that line, and `Lyric` has been uncovered by
the left bracket sweeping right off it. It holds open on load for as long as the word takes to
read — a saccade to land on it, ~400ms for a nine-letter compound, a beat to register it — then
contracts, and reopens on hover or on a press that latches. That is the animated default.

**The landing page parks the rig open.** There the brand is what the reader came for, not a
masthead over a tool, so `/` ships the complete wordmark and never turns it into an interactive
morph (`animated={false}`). The rule reference and the workbench keep the animated default: they
are surfaces people return to for their content, so the word leads, contracts, and gives that
space back (`entrance="hold"`).

The alternate animated entrance is `entrance="reveal"`, and the prop is `entrance` rather than
`intro`, which is what it is, because `intro` is one of Svelte's own `mount` options: a prop by
that name is taken as the option and never reaches the component, silently, including from every
`render()` in the tests. `animated={false}` outranks either entrance, renders the open state from
the server, and owns no transition, so the landing page never flashes through a mark or suggests
that its home link is also a separate logo control.

**A press is not a hover, and on touch it cannot be faked with one.** Tapping an element that
carries `:hover` styles does apply them, so a tap looks like it opens the lockup — but they stay
applied until the next tap somewhere else, which means a second tap on the lockup changes nothing.
A toggle has to be a real toggle. So the press latches its own state, that latch outranks hover in
both directions (or sticky hover would hold open the thing the second tap just closed), and only a
**mouse** leaving releases it: a touch pointer is destroyed when the finger lifts, so
`pointerleave` fires after every tap and releasing there would undo each press on the frame it
happened.

It is used twice — the document toolbar and the site header — and only the first of those is a
toolbar. It stays able to be the **first word of a sentence** rather than a logo above one:
`role="img"` puts `LyricLint` into the surrounding accessible name, and the component's root is a
`span` because a heading takes phrasing content only, and a flow-content root gets spaced apart
from the text beside it during name computation, so such a heading announces as two fragments.

**A lockup set inside wrapping copy has to reserve the taller of its two heights**, because opening
it can add a line. Left alone that line comes out of the layout and everything below it climbs, and
an earlier hover-driven version oscillated on exactly that — the lockup moved a line up the page,
out from under the pointer that opened it. The trap is still there for anything that keys off
pointer position here.

**One driver, not a choreography.** `--wm-open` is a registered `@property` interpolating 0 to 1,
and it is the only thing that transitions. Every width, tint, flatten, fan, and per-letter fade is
`calc()` off it. This is not a stylistic preference — it is what keeps a hover that interrupts the
intro, or a pointer that leaves halfway through the open, from tearing the lockup into two
half-states that finish at different times. Reversing the number reverses the whole rig. Anything
given its own `transition` here is a bug, and `AppWordmark.svelte.test.ts` asserts that
`transition-property` is `--wm-open` and that no descendant owns a transition of its own.

Three things the arithmetic depends on, all easy to break:

- **Per-letter offsets are lengths, never fractions of the driver.** A fan that scales with
  progress closes the letter pitch below the width of a glyph partway through and the word turns
  into a smear. `Lint` is spaced against the slot's live width; `Lyric` does not move at all and
  is revealed by the clip edge instead.
- **`ch` is exact because the lockup is monospaced**, which is why `letter-spacing` is zero here:
  tracking would add a gap the bracket has no room for, and `4ch` would stop being the width of
  `Lint`.
- **Everything is `em` against the lockup's own `font-size`** — bracket height and width, the
  waveform's `vector-effect: non-scaling-stroke` width, both slot widths. A surface resizes the
  whole brand by setting `font-size`, and that is the only override it is allowed.

Implementation: `src/lib/ui/layout/AppWordmark.svelte` (state and markup only) and the arithmetic
in `src/lib/ui/styles/shell.css`. `src/lib/assets/lyriclint-mark.svg` and the favicon are the
static mark and carry the same geometry — the closed lockup has to keep matching them.

**The favicon is the bare mark in `#dea645`, and the color is contrast, not taste.** There is no
tile: brackets and waveform on transparency, the `viewBox` cropped to the mark's own bounding box
plus half a unit so the strokes land as thick as 16px allows. The brand's dark ink is the one thing
it may not have, because:

**Safari draws its own background behind any favicon whose contrast against the tab bar is too
low.** Its dark-mode tab bar is `#282828`; the brand's `#1c1c22` scores 1.15:1 against it, which is
about as low as a favicon can score. Safari's plate is white and rounded and a little larger than
the icon, so a dark tile came back wearing a white ring, and a transparent icon with dark ink came
back as a solid white box with the mark inverted on top. Two rounds went into blaming our own file
for both. The threshold is undocumented and does not match WCAG AA or AAA; the only lever is the
icon's own brightness. `#dea645` scores 6.77:1, so nothing is drawn behind it.

Three consequences worth keeping straight:

- **A transparent background is only safe while the mark is bright.** Transparency is not what
  summons the plate — low contrast is. The moment this mark takes a darker color it is a white box
  again, and no amount of squaring, padding, or opaque tiling addresses that.
- **`prefers-color-scheme` inside an SVG favicon does not help.** It resolves in the browser's
  favicon context rather than the tab strip's, so ink that swapped under the dark scheme rendered
  the light value anyway. No media query belongs in this file.
- **A single mid-tone reads against dark or against light, never both.** `#dea645` is 6.77:1 on a
  dark bar and 2.18:1 on a light one, so this icon is chosen for a dark tab strip and gives up the
  light one — where Safari will plate it dark, which is the acceptable end of the trade. An icon
  that wanted both would need a bright field _and_ dark ink, which is a tile, which is the version
  in the history of this file.

`favicon-16.png` and `favicon-32.png` are `favicon.svg` rasterized at those sizes with the page
background omitted — never scale the old files, and never size by rewriting the SVG's `width`/`height`
attributes, which silently stops matching the moment the file is reformatted and crops the icon
instead. Size the wrapper. `apple-touch-icon.png` keeps the dark tile, because a home-screen icon
is composited by iOS against a wallpaper and no contrast heuristic runs on it.

Safari caches favicons hard and does not clear them on a normal reload. Verifying a change there
means clearing website data, not pressing refresh.

### The phone is supported upright and refused on its side

The workbench runs on a phone. The editor and the linter stack (the `68rem` breakpoint), each
scrolls in its own port, every fix has a button, and the transport's own controls are all a
touch user needs for playback — nobody transcribes a song on a phone by keyboard shortcut.

**One orientation is refused, and only one.** Turned sideways there is no height left to divide:
the toolbar, the tab strip and the status bar are fixed costs, and what remains would be a couple
of lines of lyric over a couple of lines of finding. `(pointer: coarse) and (max-height: 30rem)`
hides `.app-shell` outright — `display: none` takes the app out of the accessibility tree, which an
overlay would not have done — and `LandscapeNotice.svelte` takes its place.

Three things that gate depends on:

- **Height _and_ a coarse pointer, never height alone.** A short window on a laptop is a supported
  size — the stacked layout is what it is for — and a rule keyed on height alone would tell someone
  with a mouse to rotate a screen they cannot rotate. `e2e/lyriclint.spec.ts` pins both halves.
- **It is CSS, not `matchMedia`.** The app is prerendered, so a JS gate would ship the workbench
  markup first and swap it for the notice a frame later, on exactly the devices least able to hide
  the flash.
- **It asks for a rotation and offers nothing else.** The way out is a gesture the reader is already
  holding the device to make, which is what separates it from the whole-phone gate it replaced —
  there, the device could not run the app at all, so the notice owed the reader somewhere to go.

The notice is prose on the canvas, and the brand is the first word of its headline rather than a
logo above it. The gate lives in the `(app)` group layout so it cannot reach the pages under
`(site)`, which read fine held either way round.

Implementation: the `(pointer: coarse) and (max-height: 30rem)` block in
`src/lib/ui/styles/responsive.css` and `src/lib/ui/layout/LandscapeNotice.svelte`.

### The touch user is told once, and told what is true

A phone visitor meets a workbench built for a wide screen and a keyboard, so `TouchNotice.svelte`
says so on the way in: the lyrics and the findings stack instead of sitting side by side, every fix
has a shortcut they do not have, and it will be quicker on a desktop. It says **everything here
works**, because it does — this is a recommendation, not the gate it replaced.

- **A modal, and the only one that opens by itself.** Nothing else in the workbench appears
  unasked. It earns that by being the shortest-lived surface in the application: one press and it
  is gone for the session. A banner would have to live somewhere in a layout whose whole problem is
  that it has no room to spare.
- **Session-scoped, like the ignored rules.** A warning that has been read is noise, and one that
  is never repeated is a warning the user cannot get back; closing the tab forgets it. It is
  remembered on the dialog's `close` rather than in the button's handler, so `Escape` and a press
  on the backdrop are remembered too — every way out is the same way out. A browser refusing
  storage reads as "not seen", which shows it once per load rather than losing it.
- **A coarse pointer _and_ the stacked layout** (`68rem`), not either alone. The pointer alone
  stops a tablet in landscape, where the two-column layout is intact and there is nothing to warn
  about; the width alone stops a narrow window on a laptop, which is a supported size with a
  keyboard behind it.
- **Nothing inside it is boxed**, and there is one action. The dialog is already the surface, and
  there is no `Cancel` because there is nothing to cancel.

### Nothing a finger types into is smaller than 16px

Safari on iOS answers a focus on a field below 16px by zooming the page in, and it does not zoom
back out — so placing the caret made the whole workbench lurch. The UI ramp tops out at 15px
(`--font-size-md`), which means every input and the lyric text itself were under the threshold.

Under `(pointer: coarse)` they step up to `--font-size-lg`: the first rung that clears it, a token
rather than a literal `1rem`, and larger text under a finger on its own merits. The alternative fix
is `maximum-scale=1` on the viewport meta, which buys the same result by taking pinch zoom away
from everyone; that is not a trade this application makes, and `src/app.html` must stay
`width=device-width, initial-scale=1`.

The editor moves through a token of its own, `--font-size-editor`, because two surfaces have to
move together: the editor, and the landing page's prerendered stand-in, which is sized to be the
shape the editor will be (see "The demo is as tall as its verse"). Anything new that a caret can
land in either inherits from the body or names `--font-size-editor` — a field given
`--font-size-sm` reintroduces the lurch, silently, on a device the test suite does not run on.

Implementation: the `(pointer: coarse)` block in `src/lib/ui/styles/responsive.css`.

### Design system

`DESIGN.md` is authoritative. Components consume semantic tokens from
`src/lib/ui/styles/tokens.css` — never literal colors, radii, spacing, or timings. All ordinary
buttons share one silhouette; emphasis changes through color, not shape. There is no pill-shaped
button variant — the legacy `.button--pill` hook has been removed, so do not reintroduce it. Pill
radii belong to categorical chips and badges only (`.tab-count`,
`.linter-panel__filter-chip`), never to an action button.

The severity on a diagnostic is no longer a chip at all. It was a filled badge holding a line of
its own above the message, which spent a whole line of a card's height saying one word — and it
had to be squared off to keep from reading as one of the pressable severity filters directly
above it. It is a **colored glyph** now (`.severity`, no fill, no border, no radius), and it leads
the card's meta line ahead of the line number: `⚠ Line 47 · Use song part headers`. Severity is one
more fact about the finding, so it sits with where the finding is and what says so, and the color
is the text's own color, which is why the shape question stops arising.

**The word went because it was the same word every row.** A panel of nine findings printed
`Suggestion` eight times, in one blue, down one column — repetition that never varies stops being
read by the second row, and what the eye was actually using was the shape and the color. Dropping
it also gives the column a left rail of glyphs to scan instead of a ragged mix of `⚠ Warning ·` and
`ⓘ Suggestion ·`, and buys back width in a panel where a long rule name already runs to the edge.
Three things hold it up, and removing any one of them puts severity back on color alone:

- **The four glyphs separate at 12px in greyscale.** `SeverityIcon.svelte` owns them, and
  `SeverityIcon.svelte.test.ts` asserts no two severities draw the same outline. Error used to be
  `!` in a circle and suggestion `i` in one — the same ring with the bar and the dot swapped, which
  is a coin flip at this size — so error is a cross now: `✕`, `!`, `i`, `✓` in four different marks.
- **The word is still in the accessible tree**, `sr-only` inside the tag, and in its `title` for
  the pointer. Nothing about the change is visual-only in the sense that costs a screen reader.
- **The filter chip wears the same mark** (`LinterPanel.svelte`), because the row's word was half
  of what tied `Suggestions` to the rows it hides; without the glyph on both, the tie is color.

`SeverityTag.svelte` therefore takes `labelled`, and **the rule reference keeps the word**
(`/rules` and `/rules/[rule]`). Nothing repeats there the way it does in the panel, the reader may
never have opened the workbench, and a severity in a document is a fact to be read rather than a
mark to be scanned.

Three button tiers, and no more: `.button--quiet` (borderless) < `.button` (bordered default) <
`.button--contrast` (theme-inverting, one per surface). `.button--primary` is gone — an
accent-filled button competed with the contrast tier for the same job. Pick the tier from what
the action _is_, not from which panel it landed in; if a command appears twice, only its home
surface gets the contrast tier.

**A control that draws no fill draws no inset.** A quiet button's inline padding is invisible
until the pointer arrives, so a quiet button standing alone in a column of prose starts a few
pixels right of every paragraph edge around it and reads as a misalignment rather than as
something deliberate — which is exactly how `Delete all local data…` sat under its own paragraph
in the tools panel. `.button--flush` cancels the inset with a negative inline margin, so the label
lines up with the text and the hover fill keeps its padding. It is for a quiet button whose edge
is read against text; inside a row of controls the gap _is_ the alignment and this would close it.
The other way out is to give the control a real background — but a permanently filled red trigger
for an action that already arms a `.button--danger` confirm would put two red buttons in one
section, so flush is the default answer.

**The editor is part of the design system.** CodeMirror styles live in CSS-in-JS
(`create-editor.ts` and `src/lib/editor/extensions/*.ts`) where the stylesheet cannot reach them,
so they must reference tokens directly and must not carry literal fallbacks — a fallback is a
second palette waiting to drift, and one of them (`--ll-focus`) was live for months because the
variable it guarded never existed. `editor-token-policy.test.ts` enforces this.

**Opacity is never a state carrier.** No `opacity` for disabled, excluded, empty, or de-emphasized
anything. Use `--color-text-disabled` / `--color-control-disabled` / `--color-border-disabled`, or
an opaque muted color, plus a non-color cue. Opacity stacks, drops contrast below AA, and dims the
focus ring along with the label.

Component tests load `global.css` through `vitest-setup-client.ts`, so a computed-style assertion
sees the real tokens. Do not reintroduce literal fallbacks to make a test pass.

## Testing

Component behavior is covered by `vitest-browser-svelte` tests next to the component. When a
UI interaction changes, update the test to assert the new structure — including the absence of
the thing that was removed.

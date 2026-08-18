# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` is a symlink to this file.

## Project

LyricLint is a SvelteKit (Svelte 5, runes) workbench for linting Genius lyric transcriptions.
Reference docs: `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Adding entries to the guidance catalog behind `/guidelines/` — turning supplied screenshots or
pasted Genius guideline text into reviewed entries, registering sources with their authority
tier, and verifying annotation acceptance states — follows **`docs/guidelines.md`** exactly.

## Tooling

Use **bun**, never npm.

```bash
bun run check
bun run lint
bun run test:unit -- --run
```

### Two TypeScripts are installed on purpose

`typescript` is 6 and `@typescript/native` is 7, aliased (`npm:typescript@7`). That is not a
half-finished migration — it is the arrangement svelte-check documents, and both halves are load
bearing.

TypeScript 7 is the native Go port, and the package no longer ships the JS compiler API: its `.`
export is `lib/version.cjs`, which carries `version` and `versionMajorMinor` and nothing else.
Everything that reads the compiler API off the name `typescript` therefore breaks on a naive bump —
**svelte-check** refuses to start, and **typescript-eslint** throws `does not support TS 7.0` before
a single file is linted. Two of the three commands above, from one version number.

So the name `typescript` stays on 6, where those two tools find the API they expect, and the Go
binary arrives under a second name that nothing else resolves. `bun run check` opts in with
`--tsgo`; `bun run lint` is untouched and never learns any of this happened. Measured here, that is
~9.9s to ~3.7s on `check`, with identical diagnostics — a planted error in a `.ts` file and in a
`.svelte` file are both still reported at the same line and column, and `check` still exits
non-zero.

Four things it depends on:

- **`--tsgo` writes transpiled Svelte to disk** (`.svelte-kit/.svelte-check`, ~1.1MB) and spawns the
  binary against an overlay tsconfig. That path is already inside the gitignored `.svelte-kit`, so
  it costs the repository nothing — but it is why the mode cannot simply be the default.
- **It reports a much smaller file count** — 75 against 1298 — and that is a reporting difference,
  not a coverage gap. Do not read the smaller number as the check having quietly stopped looking;
  the planted-error probes above are what actually establishes that, and they are the thing to
  re-run if this is ever doubted.
- **It inherits `--incremental`'s limitation**: a Svelte file outside the tsconfig's root dir is not
  properly type-checked. Every `.svelte` file here lives under `src/`, so the cost today is zero —
  and a Svelte file added anywhere else is what would silently change that.
- **Dependabot is told to skip both halves for the root package only**, and each for its own
  reason. `typescript` is held at major 6, because that bump always reconstructs the broken
  arrangement. `@typescript/native` is skipped outright, because **it is not a package on npm** —
  it is only the name the alias is installed under, so Dependabot's lookup 404s and the whole
  update run for this directory reports a failure while still opening everyone else's PRs. That
  cost one red run before it was noticed. The consequence is that **TS 7 does not update itself
  here**: bump it by hand alongside svelte-check, which is what decides the `--tsgo` flag anyway.
  `services/rules-assistant` carries neither hold and runs TS 7 as `typescript` directly, because
  it is plain `tsc` with neither svelte-check nor typescript-eslint in front of it — which is also
  the cleanest demonstration that the blocker is those two tools rather than the compiler.

The whole thing is a workaround with an expiry date. When svelte-check supports TS 7 without the
dual install, this collapses to one dependency and the `--tsgo` flag goes away.

## Git history

Prefer rebasing over merge commits when integrating branches. Rebase the topic branch onto the
current target branch, then use a fast-forward merge so history stays linear. Do not create a
merge commit unless the user explicitly requests one or rebasing would rewrite shared history.

### Undo your own hunks, never the file

**Do not run `git checkout -- <file>` (or `git restore <file>`) unless you have just checked that
the file contains no changes but your own.** It discards everything uncommitted in that file, and
work that was never staged is not recoverable — not from the reflog, not from a stash, not from
Vite's caches, which hold transforms in memory only and drop them the moment the watcher sees the
file change.

This working tree is normally carrying a large set of the user's own modified files, so any file
worth experimenting in is likely to already hold work that is not yours. Backing an experiment out
means inverting **your** edits: `Edit` them back, or reverse-apply your own hunks from `git diff`.
Where you know in advance that you are about to try something you may abandon, `git stash` the
file first and restore it after.

The cost of getting this wrong is not a rerun. It is somebody's unsaved afternoon, and the only
place it may still exist is their editor's undo buffer — so if it happens, say so immediately and
tell them to check that before you offer to rebuild anything from memory.

## UI rules

### Never use eyebrows

**NEVER EVER USE EYEBROWS.** Do not place a small label, kicker, category, or mono all-caps text
above a heading. Write a heading that names the section on its own.

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
hairline between neighbours. **Selection is depth, not hue.** It does not get an accent wash or an
accent ring, which put a blue box inside a panel whose entire job is to color things by severity.

**Which way the depth goes is the scheme's answer, and the two differ.** In dark the selected row
drops from `--color-surface` to the recessed `--color-canvas` with `--shadow-recessed` and reads as
cut into the column — the recessed level there is the document's own tone, so a well reads as
somewhere to look into. In light it lifts instead: it stays on `--color-surface`, takes
`--shadow-raised`, and gives up the hairline at both its own foot and the row above it, so the
shadow falls across its neighbours rather than under them. Sinking it there put the one card the
reader has opened — the card carrying the fix they are about to press — into the grey this
workbench spends on things that are _spent_: disabled text, an unpressable control, an ignored
rule. It cannot rise by lightness, because the resting cards are already the paper, so a shadow is
how it rises; that is the same rule `tokens.css` states for anything above `--color-surface` in
light. Nothing moves when it lifts — the border keeps its 1px and loses only its color.

**`--color-canvas` is still spent in this column — on the panel behind the cards at both schemes,
and on the selected card in dark — so nothing else in it may sit on that tone.** Anything hanging
between the tab strip and the run of cards is chrome or it is a card; there is no third material.
The bulk-fix strip learned this the long way: drawn as bare canvas it was the same tone as
whichever card was open below it, the two merged into one region, and its button read as loose
inside the open diagnostic rather than as a command over the list. It is `--color-chrome` now,
like the severity chips it hangs beneath. A strip also carries something at both ends — the
command at one, the count it will not touch at the other — because a lone control in half a row
of empty gutter is the other way this row has failed.

**The severity chips draw one chip per kind the document has, and they draw it unasked.** They
used to have no control of their own: pressing the Linter tab a second time, from inside the
linter, was what showed and hid them. That is a gesture nothing advertises and nobody performs — a
tab announces switching panels and nothing else — so the filters read as a feature the workbench
did not have, which is the same failure the timestamp gutter had while its control only appeared
under a hovering pointer, and worse here because there was no column to hover. It also cost three
handlers to work around Bits UI's activation order, all of them for a press that was never made.

What the reveal was buying was vertical space, and the row buys it back by **drawing only the
kinds that are actually there**. `Errors 0` and `Manual review 0` were two thirds of this row on
an ordinary draft: counts that could not have been otherwise, offering to filter out kinds that
are not in the document — the same thing the status bar refuses to print. A clean draft draws no
row at all.

**A chip's count is over the unignored diagnostics and blind to the filters**, exactly as in the
rule reference, and that is what makes drawing on the count safe: a kind the user has switched off
keeps its count, so it keeps its chip, which is the only control that brings it back. Read the
other way — counting what is visible — hiding a kind would delete the way back to it.

The row also earns its place at rest. The card dropped the severity **word** in favour of a glyph,
so this is now the one surface in the workbench pairing the four marks with their names, hanging
directly above the column it is the legend for.

Implementation: `chips` in `src/lib/ui/linter/LinterPanel.svelte`, `src/lib/ui/styles/shell.css`,
`src/lib/ui/styles/panel.css`, `src/lib/ui/styles/linter.css` (the run of cards),
`src/lib/ui/styles/diagnostics.css` (what is inside one), and
`src/lib/ui/layout/RightPanel.svelte`.

### The editor's commands are a tray on the tab strip's own edge

The tab strip hangs under the toolbar at `--panel-tabs-height` and used to be the whole of that
band: to the left of it, across the editor column, was nothing. So the editor's own commands had
nowhere to be, and the one that had shipped — inserting Genius's unknown-lyric marker — had ended up
in the **status bar**, which is the row this file describes as a readout with exactly one control.
It failed twice over. It was a second control in that row, and what it said there was `Insert [?]`,
which is a mark somebody either knows or does not — and the reader who needs the button is by
definition the second kind. A glyph cannot teach the convention it is a glyph for.

**`.editor-actions` is a tray, not a band, and it took three wrong shapes to get there.** Drawn
full width across the editor column it made the _row_ the object: a strip of chrome as wide as the
document with two words at one end and a hand of empty gutter after them, which is the failure the
bulk-fix strip has a rule about arriving from the other side — there a lone control in half a row of
gutter is what carrying something at both ends exists to prevent, and here there is no second end
worth carrying anything, so the answer is not to draw the row at all. Hugged to its contents at the
**left** of the column it was the right size and belonged to nothing: a small box of chrome adrift
on the document, level with a tab strip a thousand pixels away that it had no visible relationship
to. Given a grid row of its own at the **right** it belonged to the tab strip and charged the
document 44px for the privilege — every pixel of it beside the text rather than above it, because
the lyric column is capped at `--measure-editor` and left-aligned, so the space it took was space
that was already empty.

So the row went. It is `position: absolute` over the document's top-right corner, against the panel,
and it costs the document no height at all. `--panel-tabs-height` is kept, so its foot still lands
level with the panel's tab strip: the chrome under the toolbar ends at one height across the window
even though the two surfaces do not touch. It closes on the side it pokes out of — a border and a
radius at the bottom-left corner, nothing at the right where the panel's own border already draws
the edge, and nothing at the top where it meets the toolbar it hangs from.

It is `--color-chrome` for the reason the bulk-fix strip is — a strip drawn as bare canvas takes the
tone of whatever it touches — and that is a live hazard here rather than a remembered one, since the
tray now floats directly over the document.

`Workspace.svelte.test.ts` measures the width and the right edge rather than trusting the rule:
`width: 100%` or a lost `justify-self` restores the band silently, and both halves have to hold or
the tray is back to belonging to nothing.

**Find and replace runs under the tray, not below it.** Stacked, the two were 44px of tray over 74px
of find bar for one job, which is what the overlay exists to stop — so the bar occupies the same band
and the tray floats over its right end. Three things follow, and the first is the one that will be
re-broken:

- **CodeMirror panels default to `z-index: 300`**, above every tier in this application's scale, so
  the bar painted over the very glyph that toggles it and the second press landed on the panel.
  `--layer-editor-panel` is that panel brought into the scale, below `--layer-toolbar`. The tempting
  fix — `isolation: isolate` on the editor host — is wrong: it would cap the editor's own pickers and
  popovers below `--layer-panel`, which is a worse bug than the one it fixes.
- **The row keeps the tray's width clear** (`--editor-actions-reserve`), or its right end sits under
  a surface that is painted over it. `Workspace.svelte.test.ts` measures the tray against that
  number rather than trusting the two to stay in step.
- **The bar has no close button, and the magnifier is the visible exit that replaces it.** The rule
  under _Every transient surface dismisses on an outside press_ allows dropping a closing control
  only by naming what stands in for it, and this one names three things at once: the glyph toggles,
  it sits directly over the row's own right end, and it draws `--color-accent` while the bar is open.
  An `✕` beside that would be a second control for a press the user already has, in the row with the
  least space for one. `Escape` is the third way out, as it is everywhere else here.

**The pressed state is reported by the editor, never assumed from the press.** `Mod-F` is bound to
the window and `Escape` closes the bar, so a glyph that only knew about its own presses would go on
burning accent over a bar that had already gone. `onSearchOpenChange` is the hook, fired from an
`updateListener` that compares `searchPanelOpen` across the update, and — like every other hook — it
has to be added to **`createCallbackProxy` in `create-editor.ts`**. It is `aria-pressed` rather than
a class, because the state is a fact about a toggle and colour is never a state carrier here.

**The controls are glyphs, and what they are is a tooltip.** Spelled out — `Section header` over
`⇧⌘H`, `Unknown lyric [?]` over `⌃⌥U` — the tray was 243px of the document's own top row for two
commands, five times what the glyphs need, permanently, to say something a transcriber reads once.
The name and the keystroke arrive together on hover and on focus, which is the one moment either is
being asked for, and the tray is 95px.

**The glyph is the mark, not an icon drawn to stand for it.** `[?]` is exactly what the button
writes into the document; `[+]` is that mark's own family saying a header goes in. Both are
`--font-mono`, at the weight the document will draw them in. An abstract pictogram here would be a
second thing to learn on top of the convention this control exists to teach.

**What that costs is named rather than hidden, because it is the original complaint coming most of
the way back.** The status-bar control this replaced also had a `title`; a tooltip is not a thing a
finger can produce, so a sighted touch user now meets two marks and no words. Two things hold the
line. The **accessible name is the whole label** at every state (`aria-label`, with
`aria-keyshortcuts` beside it), so nothing is lost to a screen reader and nothing here repeats the
gutter's mistake of a control that is only a pointer affordance. And the tooltip is drawn
`aria-hidden`, because both facts in it are already the button's own name and shortcut — described
rather than hidden, they would be announced twice. That last part is the citation tooltip's rule
(`SourceCitation.svelte`) applied in the one case where the direction reverses: there the visible
text is the _only_ copy and needs `aria-describedby`; here it is the second copy and must not
announce.

**The box itself is shared, and is the subject of its own section below.**

**Three glyphs, and four is the ceiling.** Each costs about 30px of the document's own top row, past
which this is the full-width band it replaced, wearing icons. Bold and italic were considered and
refused: `<i>` and `<b>` are the performer voice slots, the picker and the roster are how a voice is
marked here, and a command is offered once.

**Only commands a caret alone can carry out.** `Ctrl-Alt-P`, `Ctrl-Alt-H`, and `Mod-Shift-L` are
deliberately absent: each needs a selection, shared lyrics in an existing link, or a chorus and
announces a refusal the rest of the time, and a bar that spends most of its life offering answers
it cannot give is what `availableRates` and `spotifyAvailable` both exist to prevent. That leaves
two, which is also all a row of this width holds — the same constraint that moved `Add audio` out
of the tools panel.

**It draws at every state, including over an empty document.** A band that appeared on the first
keystroke would shove the editor down at the moment somebody started typing, and the reader who has
never met `[?]` is the one looking at an empty document.

**The editor asks and the shell writes.** `Ctrl-Alt-U` is a keymap binding like `Mod-Shift-H`, but
the command dispatches nothing itself — it calls `onUnknownMarkerRequest` and the shell runs
`controller.insertUnknownMarker()`, so the insertion is an `AtomicDocumentEdit` against the
session's own revision, which is the bookkeeping every fix already goes through. The bar's press
takes the same path. And like every other hook it has to be added to **`createCallbackProxy` in
`create-editor.ts`**, where a missing callback looks exactly like a feature that silently does
nothing.

**That binding carries no `preventDefault: true`, and the reason is the one the sync bindings
document.** The option prevents the default even when the command returns _false_, and this one
returns false whenever no shell is listening — which would swallow `Ctrl-Alt-U` in an editor that
never bound it, the landing page's demo included. Returning true already prevents the default.

Implementation: `src/lib/ui/layout/EditorActions.svelte`, `.editor-actions` in
`src/lib/ui/styles/shell.css` (and the third row `.editor-region` grew for it, which is why
`.editor-host` and `.media-strip` both state their own `grid-row` now), `insertUnknownMarker` in
`src/lib/editor/keymap.ts`, `toggleSearch` on `EditorHandle`, and `onUnknownMarkerRequest` /
`onSearchOpenChange` on the contract.

### One box names a control, and it is drawn once

Three surfaces wanted the same thing and were about to solve it three ways. The diagnostic
citation already had a real tooltip — measured, `position: fixed`, `aria-describedby` — the action
tray grew a second copy of it, and the transport's three glyphs were still on `title`, which is
slow, unstyled, and worded differently on every platform. `describeControl` and
`ControlTooltip.svelte` are the one answer: a box carrying **what the control is and the keystroke
that does the same thing**, on hover and on focus.

**It is an attachment, not a wrapper, and that is a constraint rather than a preference.** The
transport row's height is budgeted to the pixel — the stack of glyph, gap and caption has to fit
inside one `md` control, and `MediaStrip.svelte.test.ts` measures it against a sibling — so an
element wrapped around a flex item is a new flex item with its own sizing and its own chance to grow
the row. `describeControl` adds nothing to any control's box.

**One box for the whole application**, held in a module rather than per control, because hover and
focus are separate: a pointer crossing one control while the keyboard sits on another would leave
two up. `ControlTooltip` is mounted in `Workspace.svelte` rather than the app layout, so a workspace
rendered on its own — which is how every component test renders it — still has somewhere to draw.
The section-link picker's `Type only here` action later joined these controls rather than growing a
popover-specific tooltip.

**The placement is read off the control, never passed in.** The surfaces occupy different edges and
none should have to say so: the tray hangs at the top-right of the document, the link picker can sit
on either side of its anchor, and the transport is the last row above the status bar, where there is
no room below at all. `placeControlHint` is that arithmetic, exported and unit-tested against
synthetic rects rather than trusted — it flips to `bottom` when the control is within a two-line box
of the foot, lays out from whichever edge the control is nearer, and clamps at 8px so nothing starts
off screen.

**It is `aria-hidden`, not `aria-describedby`, and this is the one place that direction reverses.**
Both facts in it are already the control's own accessible name and `aria-keyshortcuts`, so
describing would announce each twice. The citation's tooltip is the opposite case — its visible text
is the _only_ copy — which is why that one keeps `aria-describedby` and this one must not grow it.

**On the transport it joins the caption rather than replacing it.** The caption under each glyph is
the one keystroke worth learning, one modifier and one letter, and _The audio is a transport_ says
the tooltip carries the function-row and universal fallbacks — that split was described there long
before anything implemented it. So the box reads `Play` over `F8 · ⌃K`, and the row is unchanged.
Both surfaces that draw a transport get it, the strip and the artwork band, because they share
`MediaTransport.svelte`.

Implementation: `src/lib/ui/state/control-tooltip.svelte.ts` (the store, the placement, the
attachment), `src/lib/ui/primitives/ControlTooltip.svelte`, and `.control-tooltip` in
`overlays.css`.

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

  **And when that action refuses, it says so where the press can see it.** Safari denies
  `readText()` outside a gesture and Firefox gates it behind a prompt, which is ordinary rather
  than exceptional — the keyboard still pastes, so the fallback puts the caret where that keystroke
  lands. What it must not do is put the _instruction_ in the `sr-only` live region alone, which is
  what `announce` reaches and all it reaches. Over an empty document that is a pixel-identical
  screen: the active line is washed either way, so the whole of the visible change was a blinking
  caret, and the one contrast action on the surface read as doing nothing at all. The three
  refusals of that action — the denied read, the empty clipboard, the failed copy — go through
  `report` in `editor-session.svelte.ts`, which draws a toast **and** announces, because the toast
  region is not a live region and either alone loses an audience.

  Only the refusals. A copy that lands changes nothing on screen and was asked for by the press
  that ran it, so a toast there would be the workbench congratulating itself — the same reason the
  save readout draws nothing while saving is going well. `workbench.test.ts` pins both halves.

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

### Some findings lead with the answer that nothing is wrong

Most of the time the reason a diagnostic is on screen is that the text is wrong and the fix is
what the user came for, so the fix takes the card's one contrast tier and the way out is a quiet
`Ignore` after it. A few findings are the other way round: they are a guess about intent, and the
likelier answer is that the words are already right. There the quiet `Ignore` is replaced by
`It's correct` — an affirmative control, with a check, in the contrast tier, **leading the row** —
and whatever change the card also offers steps down to bordered, because a surface has one
contrast action.

Two findings are like that, and each of them says something about where the flag lives.

**A custom section header is the whole of its rule.** `section.header-unrecognized` cannot vouch
for `[Chor]`, and says so; a rule that never has anything else to report can be recognised by its
id, which is how the card has always known.

**An ad-lib after a comma is one of two findings its rule reports, and only one of them is a
question.** Parentheses mark a vocal sitting _behind_ the lead, so an ad-lib the singer is
performing as part of the line belongs exactly as it is written — most of what
`adlib.parentheses` points at is already correct, and offering `Wrap as (Yeah)` as the loud answer
was the linter asserting something it cannot hear. The rule's _other_ finding, that a
parenthesized `(yeah)` wants a capital, is a fact about the text and keeps the ordinary shape. One
rule, two shapes, so it cannot be read off the id: `presumedCorrect` is on the diagnostic, set by
the rule that knows which of its findings is a judgment about performance.

That is also why `It's correct` is `onIgnore` under the hood and not a new hook — an ignore is
per-occurrence (`diagnostics/ignore.ts` keys on the rule, the message, the text and its
surroundings), so accepting one ad-lib says nothing about the next one. Only the words on the
button change, and they change because the user is being asked a different question.

Implementation: `presumedCorrect` on `Diagnostic` in `src/lib/core/types.ts`, set in
`rules/catalog/adlib-parentheses.ts`; `acceptsAsCorrect` in
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
list, which is the right trade: an `Untitled transcription` the user can see and delete beats an attachment
that vanishes with no sign it existed.

**A draft with nothing in it is never written.** Every "new draft" used to create a record
immediately, so a session of second thoughts left a list of `Untitled transcription`s that had never held a
character. Now `createDraft` loads a transient record and writes nothing; the first save with text
in it is what creates the row and takes over the current-draft pointer, so a reload before the
first keystroke comes back to the draft that still has the work in it. A draft emptied out gives up
its record the same way (`discardEmptyDraft`) — undo puts the text back and the next save writes
the same id, so nothing is lost. `recoverStartupDraft` sweeps blank records on the way through for
the databases earlier builds already filled.

**Which makes a landed save the moment a draft joins the list, so a landed save is what re-reads
it.** The list was fetched once at boot and thereafter only by the operations that change it —
open, rename, duplicate, delete — and none of those is what a first-timer does. They type, they
wait, and they open the menu to find out whether any of it is safe: `drafts` was still the empty
value it booted with, so the menu said `No saved 'scribes yet. This one will appear after its first
local save` over a record that had been on disk for six seconds. It is the only question that menu
exists to answer, and the toolbar deliberately draws nothing while saving is going well, so both of
a nervous new user's signals said no while the data was written.

Every landed save re-reads it, not only the record-creating one, because the row carries the
draft's own `updatedAt` and the list is ordered by it — refreshed once, the menu would report
`Yesterday` under a draft being typed into now. The read is bounded by `sawPendingSave` rather than
by the status alone: a settle arrives twice, once from the store's own 250ms poll and once from the
autosave controller's `onStatusChange`, so a status that has not passed through `scheduled` or
`saving` since the last read has nothing new to show. `noteSaveStatus` in `draft-store.svelte.ts` is
therefore the **one** place `saveStatus` is assigned; an assignment that goes around it is a save
the list never hears about.

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

**And the menu deletes one 'scribe at a time, never all of them.** It carried `Delete all local
data…` as a footer under the list — red, ruled off, one scope up from the row deletes above it — and
on a fresh install that footer _was_ the menu: a sentence saying there is nothing saved yet, and
beneath it the most destructive command in the application, offering to delete the nothing. This is
the menu a first-timer opens out of curiosity, because it is the one control in the toolbar whose
label does not say what it does, so the first thing the workbench showed them was a way to wipe it.
The command was already in the tools panel, which is the second half of the complaint and the reason
this is a deletion rather than a move: the same press in two places is two places for it to drift,
and the copy that drifted would be the one nobody is looking at.

The panel is where it stays, and not because that surface was there first. **A destructive command
belongs beside the claim it undoes** — under `Local data`, directly below the paragraph saying
'scribes stay in this browser and audio stays on your disk, which is the only place in the workbench
that says what "all local data" _means_. In the menu the phrase had nothing to define it and a list
of song titles beside it, so it read as being about the seven names on screen; the confirm underneath
even said `Delete all 'scribes`, promising something narrower than the trigger above it. That is also
why the menu's own footer could not simply be relabelled: the scope was ambiguous because the surface
was wrong, not because the words were.

What is left in the menu is per-draft, aimed, and in the row it belongs to — `RemoveButton` in the
slot the trigger vacated. A user who wants everything gone deletes them one at a time or opens Tools,
and neither is a path anybody reaches by accident. `DraftMenu.svelte.test.ts` asserts the absence at
both list states, because re-adding it to the empty menu is the specific regression.

Implementation: `src/lib/ui/primitives/RemoveButton.svelte` (the shared confirm) and
`src/lib/ui/styles/rows.css` (`.list-row` and its commands, shared by the drafts menu and the
performer roster); `src/lib/ui/drafts/draft-date.ts` for the dates; what each surface adds on top in
`overlays.css`, `linter.css`, and `performers.css`; and the persistence rule in
`draft-store.svelte.ts` and `persistence/recovery.ts`.

### A performer's rename runs in both directions, and the headers are the point of it

A performer's name lives in two places — the roster record, and every section-header legend that
names them — and a rename made in either has to reach both, because a legend the roster no longer
recognizes is an unresolved voice and a duplicate import waiting to happen. Editing the name inside
one header was already mirrored: `headerRenameFilter` rewrites the other headers in the same
transaction and the roster adopts the spelling (`adoptHeaderRename`, silently, keeping the old one
as an alias). **The roster-side rename shipped without the reverse half**, so the Performers tab
said `Renamed KrissyB to KrissyC.` over a document whose every header still read KrissyB — the one
job a roster rename exists for, reported as done and not done.

`renamePerformer` on the controller is that reverse half, and it is on the controller rather than
in the roster store because it is the one place that holds both the editor session and the roster.
Six decisions in it:

- **The rewrite is one atomic edit over every header occurrence** — `headerNameAtoms` filtered to
  the performer, which is the same resolution the forward mirror reads — so it is one editor undo,
  exactly as a mirrored header edit is.
- **The roster half goes through `adoptHeaderRename`, not the plain record rename**, so the old
  spelling survives as an alias and an editor undo of the rewrite still resolves the headers to
  this performer instead of importing a duplicate.
- **The roster is adopted _before_ the dispatch**, because the re-lint arrives from inside it: a
  long enough new name crosses the import threshold, and an extraction run against the old roster
  would read the freshly written name as a stranger and import it as one.
- **The toast's Undo is the same rename run in reverse**, recomputed against the document as it
  stands — pressed after further edits it reverses the rename and nothing else. A restored roster
  clone alone would recreate the mismatch this exists to fix, pointed the other way.
- **A name that would change how a header parses is kept out of the document**
  (`isMirrorableHeaderName`, the same refusal the forward mirror makes), and the toast says so
  rather than reporting a rewrite that did not happen. The alias is what keeps the untouched
  headers resolving. A performer named in no header renames in the roster alone, exactly as
  before.
- **A settled rename re-derives the color, and only a settled one.** The color is allocated
  _from the name_ (`allocatePerformerColor`, hue hashed off the normalized spelling), so a rename
  that kept the old token left the performer wearing a color derived from a name they no longer
  have. The performer's own token is left out of the usage count when re-deriving — it is the one
  being replaced, and counting it would push the new name off its own nearest token. What must
  not recolor is `adoptHeaderRename` itself: it fires per keystroke while a name is typed in a
  header, and re-deriving there would strobe every bar in the document through the palette
  mid-word. `recolorPerformer` on the roster store is therefore its own call, made by the settled
  paths — the roster-tab rename, in all three of its branches — and by nothing per-keystroke. A
  header-typed rename keeps its color for now; if that is ever wanted, the settle moment is the
  rename session ending, which needs a hook the editor does not yet report.

Implementation: `renamePerformer` in `src/lib/ui/state/workbench.svelte.ts`, over
`headerNameAtoms` / `isMirrorableHeaderName` in `src/lib/performers/header-rename.ts`, with the
recolor in `renamePerformer` and `recolorPerformer` in `roster-store.svelte.ts`; the regressions
are the `workbench performer renames` block in `workbench.test.ts`.

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

**But the reach-for keys are the `Escape` family, because a fumbled chord writes into the document
and a fumbled `Escape` does not.** The transcription loop is listen, pause, fix, replay, and the
pause is wanted at the moment the ear catches a mistake — which is the worst moment to be aiming a
two-letter combination whose miss cost is a character dropped into somebody's lyric that they now
have to find and erase. `Escape` is the keyboard's one large key that can never type a character, and
neither can it while a modifier is held. Bare `Escape` toggles, `Shift+Escape` backs up, and
`Alt+Escape` (`Option+Escape`) goes forward: one key under the pinky and a modifier under the other
fingers or the thumb, so the whole triad is a shape the hand holds without leaving `Escape`, and a
mistimed modifier degrades to a bare `Escape`, which merely pauses. `Shift`-and-`Alt` together is a
superset of both nudges and answers to neither, the same no-superset discipline the J/K/L triad
keeps. These three are the keys named on the transport tooltips (`Esc`, `Shift+Esc`, `Alt+Esc`); the
triad and the function row stay in `aria-keyshortcuts` only, the same split the one-modifier fallback
follows.

**They are the bottom of the Escape stack, never the top.** Every other `Escape` in the workbench
means "close the surface on top" — dismiss a popover, cancel a find, end a sync run, reset the
draft's name — and each claims the event by preventing its default or stopping its propagation. So
the transport's `Escape` listener is the one place the triad's rule reverses: it is in the **bubble
phase**, not capture, so every surface-level handler in the window has already run, and it stands
down on a press already `defaultPrevented`. A native `<dialog>` closes on `Escape` without reliably
marking the keydown, so deferral to an open modal is read off the press's **target** (trapped inside
the dialog) rather than off the flag. What reaches the transport is an `Escape` nobody else wanted —
the caret sitting in the document — which is exactly the press that means "stop the tape". A held
`Escape` does not repeat the pause, exactly as the triad's toggle does not; a held `Shift+Escape` or
`Alt+Escape` is a scrub and does. `Ctrl-L` is deliberately not a forward alias on Linux for the
reason the triad already gives — it is the browser's address bar — and two of the Escape modifiers
collide with the desktop rather than the page: `Shift+Escape` is Chromium's task manager, and
`Alt+Escape` cycles windows on Windows and some Linux desktops. Both reach the page cleanly on macOS,
where `Option+Escape` was the ask; the collisions are the platform note worth verifying by hand.

**And when there is no tape yet, a bare `Escape` loads the one the draft remembers.** A restored or
pasted source sits pending until a gesture pays for its permission, sign-in, or script — the state
the strip draws as `Load …` / `Reconnect …` — and the reach-for key is what brings it, the same press
that control makes. It is a fallback under the toggle, not a second meaning: a bare `Escape` tries to
play first, and only loads when nothing was attached to take it (`load` on `TransportShortcutOptions`,
answered by the shell against `pendingName` and `busy`). The nudges have no such fallback — there is
nothing to step through until something is loaded — so only the bare press loads, and the transport
listener now binds while a source is merely pending, not only while one is attached.

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

**But "after the last" is a distance, not a boundary, and reading it as a boundary was a bug.** The
step exists to replay the line the playhead is _inside_, and the nearest cue is only that line's
start while the playhead is near it. Past the final timed line, or sitting in an untimed stretch
between two timed ones, the nearest cue behind can be twenty seconds off — and `back` leaping that
far was the exact complaint, a "previous line" that hurled the playhead across an untimed outro
instead of nudging two seconds through it. So a cue counts as a step target only while the playhead
is within `cueStepReach` (ten seconds) of it; beyond that it is a distant marker rather than a line
the user is in, and the nudge takes over in both directions — the same fallback that already applied
before the first cue and after the last, now measured rather than assumed. Ten seconds clears any
sung line and stays well under the leap that prompted it; a held phrase longer than that costs a
couple of nudges, which is the safe way to be wrong. `cueBefore`/`cueAfter` in
`media-player.svelte.ts` carry the reach, and `media-player.test.ts` pins both the walk between near
cues and the nudge past a far one.

**The one-modifier fallback is in the control's tooltip, and nowhere else on screen.** It was
printed under each glyph as a caption, for as long as it had nowhere else to live — the reasoning
was that a shortcut belongs beside the action it operates rather than in a help row, and that still
holds. What changed is that the control names itself now, through the shared `describeControl` box
that every other named control in the workbench uses, and the keystroke goes in it. Printed in both
places it was the same fact twice, six pixels apart, in the shortest row in the window. A device
with no pointer to open that box has no modifier keys either, so nothing is lost where it cannot be
opened.

**Only that one keystroke is named.** `F7`–`F9` and the universal `Ctrl-Alt` triad stay in
`aria-keyshortcuts` and are not drawn: a control listing every way to press it is a legend rather
than a name, and the function row is the alternative nobody reaches for first. This is the split
this section always described — the caption carries the one you learn, the tooltip carries the
rest — settled the other way round now that there is only one surface.

**Whatever goes in this row next has to fit the height, and that is a constraint rather than a happy
result.** The strip is `--control-height-lg` and every other control in it is `--control-height-md`
plus this row's padding, which comes to exactly that. Anything stacked on a glyph grows the strip,
and every pixel this row takes is a pixel off the document above it. `MediaStrip.svelte.test.ts`
measures the control's **content** against a sibling rather than trusting the arithmetic — content
and not the box, because at narrow widths `responsive.css` raises every `.button` to `lg` and the
box stops reporting what is inside it.

The mark that was there is worth keeping in mind if a caption is ever proposed again. It was not
**beside** the glyph, which is where it began: read along the row it joined the run of controls,
doubling the transport's width and making two thirds of the most-operated row in the window a
legend. It was not two capped boxes, `⌃` and `J`, which printed the modifier three times for a fact
that never varies while the letter — the only part that differs — wore the same weight as it. And it
was not boxed at all: a keycap border here is a rectangle drawn around every glyph in the shortest
row in the window, competing with the transport it only annotates.

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

**A press made before the source can act on it is remembered, not dropped.** A remote source is not
ready the moment its strip draws: a video is waiting on Google's player, a track on a device
registration, a song on a script, a sign-in and a queue. The transport is on screen and live for
that whole gap, and every press in it used to go on the floor — so the user pressed play, got
silence, pressed again, and eventually one landed by luck. `playWhenReady` in
`media-player.svelte.ts` holds the press and `playIfAsked` spends it when the attachment lands.

Three things it needs, and the second is the one that stops the rage rather than merely fixing the
bug:

- **It lives in the transport, not in a source.** The YouTube bridge solved this for itself with a
  `wantPlaying` flag it replays when its player arrives — right behaviour, wrong place, because it
  left the identical gap open in the two sources written after it. Spotify's `startPlayback`
  returns early on a missing `deviceId`; Apple's `music` is undefined for most of `load`. One rule
  above all four is the whole fix.
- **`playing` reports the queued press**, so the control flips to Pause the instant it is made. A
  press that works but shows nothing for a second is still a press somebody makes twice, and the
  second one has to mean something: `toggle` reads `player.playing` rather than the bare state, so
  pressing again cancels the pending start instead of asking for it a second time. Repeated
  presses collapse to one start.
- **A failure clears it.** `events.failed` and `playIfAsked` both refuse to start something the
  source has already reported it cannot play — answering a real error with silence and a Pause
  button is the failure this was supposed to prevent, wearing a different hat.
- **And the wait is drawn, not merely handled.** A Pause button over silence is only half an
  answer; the half that was missing still read as nothing having happened. `player.starting` is the
  other half and is the only thing it is for — the transport puts the loading mark in the glyph's
  own slot while it is true, so nothing in the row moves. The label stays `Pause`, because that is
  still what the press does, and `aria-busy` carries the wait: a label reading `Loading` would name
  the state and lose the action.

**The loading mark (`LoadingMark.svelte`, `.loading-mark`) is the one shared answer to a wait with
no measurable end, and it is deliberately
scarce.** Every other progress in this application is a state that can be named — saving, attached,
ready — and says so in words. There are three places where the honest answer is only "a request is
out": a track told to play before its source could take the instruction, a catalogue search, and
the attach behind a pressed search result. All three looked exactly like nothing happening. It is
not a substitute for a control saying what it did, and it is never a fourth way to say something a
word already says.

Three things it owes:

- **It takes `currentColor` and `1em`**, so it belongs to whatever it is inside — a quiet button in
  a chrome row, a bordered button in a dialog, a transport glyph over an album cover — without
  either surface knowing about it.
- **It is slowed under `prefers-reduced-motion`, not stopped.** A still ring reads as a drawing, so
  stopping it loses the one piece of information the element carries, exactly where a text
  alternative is least likely to be noticed.
- **It goes in a slot that already had a size.** The transport's glyph, and the duration at the end
  of a search result — never appended beside something, which reflows a row under the pointer that
  just pressed it. The search control is the same rule in reverse: the label stays `Search` and the
  spinner joins it, rather than the word swapping to `Searching…` and resizing a control that sits
  beside a field the user may still be typing into.

**A pressed result names itself.** `media.busy` covers the attach, but on its own it only disables
controls, which reads as the dialog having gone dead rather than as work being done — and it cannot
say _which_ row was pressed. The picker holds the id it is attaching so the spinner lands on the row
the user aimed at, and both search flags clear in a `finally`: a spinner left turning over a refused
request is worse than the silence it replaced.

The other half of the same complaint is not a queue but a wait worth shortening: **nothing that the
press is not waiting on may be awaited in front of it.** The Apple source fetched a song's name and
length and only then built the queue, which put a whole network round trip between the user and
their first press for two things that have nothing to do with each other. They run together now, so
the wait is the slower of the two rather than the sum, and `load` still resolves with both in —
which is what lets the transport treat "attached" as "ready to play".

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
a while a whole synced song was lost on reload. A sync tap writes an anchor and moves the caret;
`Ctrl-Alt-M` and the timestamp column's own control move nothing. The path is `onAnchorsChanged` on the extension →
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
one control, not two**: a pin and a pencil in adjacent slots would be two buttons where the line's
own state already says which of the two writes is on offer.

**On an untimed line that glyph stamps the playhead; on a timed one it opens `−` and `+` beside the
time.** Those are not the same write, which is what the single control used to assume. A line that
already carries a time is nearly always a line whose time is nearly _right_ — a tap landed late, or
a run was a beat behind — so re-stamping it from wherever the tape happens to be sitting is almost
never the correction wanted, and it destroys the one that was. Re-stamping outright is still
`Ctrl-Alt-M`, which is a press aimed at exactly that.

**The step is a quarter second, so the open cell — and only the open cell — shows `m:ss.cc`.** A
step nothing on screen answers is a press that reads as broken, and three presses in every four move
a time `m:ss` goes on printing unchanged. The anchors were never whole seconds anyway; a sync tap is
written 50ms early. But a whole column of hundredths is two digits per row nobody is reading, and
the resting job of this rail is to say where a line sits in the song. So the precision arrives with
the controls that spend it and leaves with them, which is why `formatAnchorTimePrecise` is a second
function rather than a flag on the first. The announcements stay whole for the same reason:
hundredths read aloud say nothing anyone asked, so `Ctrl-Alt-M` and sync mode keep `formatAnchorTime`.

Neither state changes the column's width, because the reserve below covers the wider one.

**One chip at each end of the number, not two glyphs after it.** Set as a pair in the stamp's slot
they read as a suffix of the time — `0:12.88 −+`, three marks in a row where there is one control,
one value and one control. Each is a small lifted surface instead: border, fill and shadow, the same
three the workbench's other popovers use, at the size the gutter has room for. They are on screen
for the length of one correction, over a column of quiet text they must not read as part of.

**`+` stays in flow and `−` does not**, which is what keeps the number still. `+` follows the last
digit however wide the number is, and the cell packs from the left while the pair is open rather
than spreading its children to both ends; `−` hangs outside the cell entirely, since in flow it
would push the number right by its own width. The open cell is the closed one plus two things drawn
beside it.

**That means this one gutter column may spill.** CodeMirror clips every column
(`.cm-gutter { overflow: hidden }`), which cut the `−` down to a sliver — a control that is there,
is pressable, and cannot be seen. `.ll-time-gutter` is `overflow: visible`: everything in it is
ours, the only thing that ever leaves it is that chip, and it spills inwards over the text rather
than outwards past the scroller.

**The reserved width is the widest state written out, padding included.**
`calc(9ch + var(--space-4) + var(--space-4))` is seven characters of `m:ss.cc`, the gap, two for the
pair, and the element's own inline padding — it is a `min-width` on a `border-box` element, so
reserving only the content leaves the row's contents governing the width. That is how the number
slid sideways once already: the pair is a fraction of a pixel wider than the glyph it replaces, and
with no slack the gutter grew by exactly that much and dragged every row left.

**And its inline end is the scrollbar's lane, wider than its inline start on purpose.** This column
is the last thing before the scroller's own edge, so whatever sits at the end of a cell — `+` while
the pair is open, the stamp glyph the rest of the time — is what a vertical scrollbar lands on. A
classic bar takes its width out of the scrollport, so the sticky column stops beside it and the
padding is merely a tight gap; an overlay bar — macOS, and any touch device — takes no layout space
at all, paints over the last dozen or so pixels of the scrollport, and **wins the press there**, so
at the `--space-2` this used to reserve, aiming at `+` scrubbed the document instead of moving the
time. That is the same answer `.rules__index` reaches from the other side: padding rather than
`scrollbar-gutter`, because only padding is a lane an overlay bar can float in. It costs the
document `--space-2` of width it did not spend before, and the lyric column is capped at
`--measure-editor`, so on anything but the narrowest pane it costs nothing at all.
`line-anchoring.svelte.test.ts` measures the clearance against the **scrollport** rather than
against the padding it comes from: a cell's own contents can grow into that lane without the
stylesheet changing, and the lane going quietly back to a gap looks exactly like working CSS.

It closes the way every transient surface in the workbench closes — a press anywhere else, read on
`pointerdown` in the capture phase, plus a second press on the pencil that opened it. The listener is
on the document rather than the editor, because most of what is "anywhere else" is the panel, the
toolbar and the transport; only the cell's own two controls are exempt, since the pair has to survive
being pressed. It is one at a time and it belongs to the field, not to the cell: a state kept in the
marker would be destroyed by the next rebuild, and the playhead rebuilds this column whenever it
crosses a line.

Six things that arrangement depends on:

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
- **A cell is one line of the document tall, never as tall as its block.** A gutter element is as
  tall as the line it stands beside, so a lyric long enough to wrap makes this box two or three rows
  deep — and centred in that box the time slid to the middle of the block while the line number
  stayed on the first row, which is two facts about one line drawn on different rows. So the element
  aligns its cell to the start and `.ll-time-cell` states the height itself, `--font-size-editor`
  times `--line-height-editor` less the padding above it, which is what CodeMirror measures an
  unwrapped line at. Centring inside _that_ is also what absorbs the couple of pixels the number
  column is pushed down by `lineNumbers`' own hidden width spacer — a `border-box` element cannot be
  shorter than what it pads by, so a spacer of height 0 is still that column's `--space-0-5` tall.
  Matching the two by hand-tuning the paddings instead would put one column's arithmetic in the
  other's stylesheet, and it would silently stop being true the next time CodeMirror changed the
  spacer.
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
without thinking about it, which rules out a chord; and a bare `Space` is only free while the run
owns it, which the mode's own keymap sees to at the highest precedence. Every way out is loud:
`Escape`, the strip's own control, running off the end of the document — and typing.

**Typing ends the run, and the character lands where it was typed.** The mode used to hold the
document `EditorState.readOnly`, on the reasoning that a document not taking typing is what frees
`Space` to be the tap. What that actually bought was a mis-keyed letter doing nothing at all: the
user typed at a line they could see was wrong, nothing happened, and there was no sign of why it
would not take — they had to work out that they were in a mode before they could fix it. `Space`
was being freed by the keymap the whole time, so the lock was buying only the silence. A keystroke
that would write something is now read as what it plainly is — the user has stopped tapping and
started transcribing — and the shell pauses the tape on the way out, as it does for every other
exit.

**It is read off the document actually changing, never off a guess about which keys mean typing.**
That is what keeps it one rule rather than a list: a dead key, an IME composition, a paste, a drop
and a fix applied from the panel are all edits, and every one of them ends the run. Nothing has to
be excluded either, because the keys the run owns — `Space`, `Enter`, `Backspace`, `ArrowUp` —
return true down every path they have while a run is under way, so they are answered by the keymap
and never reach the document. An `EditorState.transactionExtender` rather than a filter, because
the effect has to ride the very transaction that carried the edit: one undo step, one snapshot, and
no instant in which the document has changed while the mode is still on.

Ending is not undoing: the anchors the run wrote stay written, and the announcement is the run's
own (`Sync stopped: the document changed.`), because a mode that ends under someone's fingers is
loud on screen and silent to a screen reader.

**No `preventDefault: true` on any of the sync bindings.** That option prevents the default even
when the command returns _false_, so it swallows the space bar, backspace and the up arrow in an
editor that is not syncing, which is to say almost always. Returning true already prevents the
default, and returning false is exactly the case that must not. This cost a green suite once.

**Pausing holds the run, and a tap against a paused tape is refused out loud.** The transcription
loop is listen, pause, type, and the transport keys are bound to the window — so the tape can be
stopped in the middle of a run, and stopping it must not end a mode the user is coming back to.
What it must also not do is take taps: `liveTime()` goes on reporting wherever the tape was
parked, so a tap spent there writes the pause's own moment onto the next line — wrong by the
length of the pause, with nothing on screen saying so, which is the automatic stamp's failure
arriving through `F8`. The refusal changes nothing visible either, so the sentence goes out on
both channels (`announce` and `notify`, the split `report` in `editor-session` makes), the key is
still claimed — `Space` belongs to the run, paused or not — and the run stays armed exactly where
it was. Resuming is the transport's ordinary resume, two-second run-in included, which is the
run-up a rhythm is re-entered on. The tap reads the tape through `onRequestMediaPlayback` — one
reading carrying the position, the rate, and whether it is running, taken at the moment of the
press for `liveTime()`'s own reason — and a shell that wires only `onRequestMediaTime` is read as
playing at 1×, which is the behaviour taps always had. `playing` is the player's intent-inclusive
answer, so a tap made while a queued start is still settling counts as one the user meant.

**And while a run is under way, a bare space is the tap from anywhere short of a surface that
types or presses with it.** The transport binds bare space to play/pause at the window level and
defers to every input — so the moment focus left the editor, the run's one key paused the tape
instead of timing a line. And mid-run is exactly when focus leaves the editor, because the
scrubber is where a scoped run's own design sends the user to park the tape. The tap outranks the
toggle in `bindTransportShortcuts` (the `tap` hook, asked before `matchTransportAction`), and it
deliberately claims **more** than the toggle defers to: a range input neither types nor presses on
space, so a space on the scrubber taps, while the draft's name, every real control, and the
editor's own `contenteditable` keep theirs — the run's keymap stays the only handler of a space
landing in the document, so the one keystroke never grows a second implementation. A held space is
dropped exactly as the toggle's repeat is, or it would machine-gun anchors down the document. The
shell's hook declines while no run is on, which leaves the space bar meaning what it always meant.

**A selection scopes a run, and the strip's control says so before the press.** A transcriber who
wants only the chorus timed — or a botched bridge re-timed — selects those lines, and the control
reads `Sync selection`: the first tap times the selection's first line, timing its last ends the
run exactly as running off the document does, and entering collapses the selection, which is also
what consumed it. The selection is the gate because it is the one gesture that deliberately names
a region; the **caret was considered for this job and refused**, because a caret is parked
somewhere after every interaction and carries no intent — read at entry it starts the
first-time syncer's run on whatever line typing left it, and every repair (a churning label, a
silent announcement, a sensibleness predicate) costs more than the selection it stands in for.
Seven things the scope owes:

- **The label outranks `Lyrics synced`**, because selected lines over a fully timed song are a
  request to re-time exactly those — and it changes _before_ the press, since the scope is decided
  at entry and a label that only changed afterwards would be a control doing something it never
  offered. The shell's predicate (`selectionCoversLyricLine` in `wiring.ts`) and the editor's own
  entry (`selectionScope`) both come down to `isLyricLine` over the lines the selection touches,
  which is what keeps the two from drifting; a selection touching no lyric line falls back to the
  ordinary pass, which is also what the label promised in that state. A selection ending exactly
  at a line's start does not include that line — sweeping two whole lines routinely lands the head
  on the third's first character, and a run must not time a line nobody swept over.
- **Where the stampable line directly above the selection is timed, the run enters resume-style** —
  caret on that line, armed, tape sent to its anchor — so there is a whole line of run-up to tap
  against, exactly as a resumed pass gives itself.
- **Where it is not, the tape is left alone.** The run has no moment of its own to name, and
  wherever the user parked the tape is the only position anybody chose — the worst a badly parked
  tape costs is waiting, never a wrong anchor, because a tap stamps `liveTime()` and is true
  whenever it is made. The contract carries this as an **absent `startAt`** on
  `onLyricSyncChange`, which is why the shell seeks only when one is named and why
  `MockEditorPane` passes `0` explicitly — a mock that passed nothing would read as "leave the
  tape", the opposite of the fresh pass it models.
- **The boundary is `until` on the sync field**, the last selected stampable line's start — a bare
  offset for `filled`'s reason: a document change ends the run and clears it.
- **The linked fill truncates at the boundary**, exactly as it already stops at a peer's first
  gap: a shortcut that dated lines outside the selection would break the one promise the scope
  makes. Truncated rather than refused, so a whole linked chorus selected at once still times
  itself in one tap.
- **The skip is withheld** (`scoped` on `onLyricSyncChange`): it is a jump measured against the
  whole document, and inside a selection's few lines it would be a control that mostly refuses —
  `lyricSyncSkipTarget` also refuses past the boundary itself, so a caller that never learned
  about scopes cannot jump one.
- **A scoped run does not scroll — not on entry, not on the playhead follow, not on a tap.** The
  reading-line hold exists for a pass over the whole song, where the caret descends out of view; a
  scoped run's lines were on screen when the user selected them, and the document jumping to a
  reading position right after they carefully put a selection where they were looking is a jump
  nobody asked for. Entry, the taps and the step back use a nearest-edge nudge instead, which
  moves nothing while the line is visible and covers the one case it is not; the playhead follow
  stands down for the length of the run through `suppressPlayheadFollow` in `line-anchors.ts` — a
  facet rather than a read of the sync field, because the imports point the other way and asking
  directly would close a cycle. The user's own follow toggle is untouched: the facet is a second
  gate beside `followPlayheadField`, never a write to it.

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
  own, and a run driven from there is a run nobody is typing into.

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

  **The tape backs up with the caret**, to the time that previous line already carries. A run is one
  pass over the document against one pass of the audio, so a step back that moved only the caret
  would leave the two ends in different places — the user reading the line before the fumble while
  hearing whatever came after it, and the next tap landing as wrong as the one being taken back.
  Seeking to the stored anchor rather than to the moment of the tap carries `tapOffsetSeconds` back
  with it, so the line starts a beat after playback resumes and there is a run-up to tap against. It
  goes through `onSeekMedia`, the hook the timestamp column and `Ctrl-Alt-Enter` already seek
  through, so backing a run up and jumping to a line cannot come to mean different things about
  where the tape ends up — which also means it plays, and a run being backed up is a run in
  progress. Where there is no earlier line, or the one there is carries no time, nothing is seeked:
  the tap comes off and the audio is left where it is rather than sent somewhere invented.

- **Every tap is written `tapOffsetSeconds` early** (50ms). Human taps land late, and without the
  offset jumping to a line starts just after its first syllable — the annoying direction, because
  the word you came back to check is the one you miss.

  **It is small because one number is serving two jobs that want opposite things.** A _seek_ wants
  a lead; a _follow_ wants none, and the marked cell — along with the document scroll keyed on it —
  is read against the audio continuously rather than once. It was 120ms, which is past the point
  where a visual event leading audio stops reading as simultaneous, so the mark and the scroll both
  arrived a beat before the line was sung and the rail read as running ahead of the song. 50ms is
  under that and still keeps a jump off the first syllable. **If a longer lead is ever wanted for
  seeking, it is a second constant spent at the four places that seek to an anchor** — the timestamp
  press, the line-number press, `Ctrl-Alt-Enter` and `stepBack` — rather than this one growing back.
  An anchor is a claim about when a line started, and the follow is only honest while it stays one.

  **And it is a wall-clock quantity, spent in track time by multiplying by the playback rate.** The
  lateness it compensates belongs to a hand, and a hand is no later at 0.5× — but the tape moves
  half as far during it, so the fixed 50ms over-corrected every anchor written at a slowed rate and
  stamped them early. Slowing the tape is the sanctioned way to tap a fast song — the sync
  control's idle tooltip says so, because nothing else on screen connects the two controls — which
  makes the practice rate the case this arithmetic most owes, not a corner of it.

- **The stamp and the advance are one transaction.** One press has to be one undo, and a selection
  change and an effect go in one dispatch.
- **And so is the wash, which is what stopped it trailing the caret by a tick.** The marked line is
  the last anchor at or before the **playhead**, and the playhead the editor holds is
  `player.currentTime` — a `timeupdate`-fed mirror, up to a tick stale, which the media section
  already says is near enough for a readout and not for a write. A tap stamps its line from
  `liveTime()` minus `tapOffsetSeconds`, so whenever that mirror was more than the offset itself
  behind, the line just timed sorted _after_ the playhead on record: the caret moved and the yellow
  band stayed on the previous line until the next tick pushed it along. That is about half of all
  taps, and a run is the one place the two are read against each other.

  So the tap publishes the reading it already took, in the same transaction as the stamp. It is not a
  guessed position — `currentTime()` is `liveTime()`, the source's own playhead read at the moment of
  the press, strictly fresher than the mirror it replaces, and the next tick can only confirm it. A
  linked fill publishes `lastTime` instead, because the seek that follows is issued in the same
  synchronous block: published live, the wash would land on the section's first line while the caret
  sat on its last, and the follow listener would scroll to one and then the other. Neither case
  touches the field's own rule, which is still that the wash follows the playhead and nothing else.

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

#### A repeat is timed once, and the run walks over the copies

A chorus is typed once and sung three times, and a link is the document already saying so. So a run
that has timed one copy knows the shape of the next: the words are the same words — that is what a
link _is_ — and the only thing left to establish is where in the song this repeat starts, which is
exactly what the tap walking into it says. The tap dates the section's first line, the peer's own
intervals date the rest, the tape moves to the last line of the repeat, and the run carries on from
there. A three-chorus song is one pass with a chorus's worth of tapping in it instead of three.

**What is carried is the shape, never the times.** A peer's anchors are absolute moments in the
song, and copied outright every jump into the second chorus would land in the first. Each line is
written at the tap plus that line's distance from the peer's own opening line, so what repeats is
the rhythm the transcriber already tapped by hand.

Six refusals, and each is a case where a guess is worse than the dash it would replace:

- **Only on the way in.** A tap in the middle of a section is the user timing that line, and nothing
  about it asks for the rest to be written for them.
- **Only from a copy that comes earlier.** A later peer is the same words and would date this
  section just as well, but a section written by the one below it reads as the document filling
  itself in backwards — and the run has not reached that copy yet, so its times are the ones the
  user is on their way to correcting.
- **It stops at the peer's first gap** rather than skipping it. Dating the lines after a hole leaves
  an untimed line _behind_ the caret, which is a line the run never comes back to; stopping there
  hands the tapping back at the point the peer stops answering.
- **It stops where the peer's times go backwards.** The marked cell, the step back and the follow
  all read anchors as ordered, and a peer carrying broken data must not spread it.
- **It stops where the copies' line structures part ways**, and this one shipped late. The pairing
  is by line index, and the merge model deliberately lets a copy carry a line its peer lacks — the
  shape the whole feature was rebuilt for — so every line at or past such a difference paired with
  the _wrong_ peer line. The derived times still increase, so the monotonicity refusal above passes,
  and the toast reports a successful fill: a plausible number wrong by an amount nobody can see,
  which is the automatic anchor stamp's failure arriving through the link. `linePairingLimits` in
  `extensions/section-links.ts` says how far the two structures agree — pairing is provably safe up
  to the first divergent run whose text, in either member, contains a line break, because a shared
  run is byte-identical in every member by construction. It aligns the pair afresh rather than
  reading the stored runs, and that is semantics rather than caution: stored intent is the mirror's
  question, a mistake against a decision, and the fill is not asking it — what pairs a line with a
  line is the text as it stands, and a record written without runs (every draft from before
  differences existed) describes exactly the group this most needs to be true of. A word-level
  difference moves no line boundary and fills on, which keeps the commonest linked shape working.
- **Once per section per run**, which is what makes the way out real. `filled` on the sync field is
  that record — bare offsets, because a document change ends the run and clears it with them.

**And among the peers that survive the refusals, one the run tapped outranks one it derived**,
nearest-first within each — `filled` is the record of which is which. A filled section's times are a
rhythm at one remove already, and nearest-first alone would date chorus three from chorus two's
derived times rather than from the copy the user actually tapped, carrying any error of the first
fill down the whole song.

**The way out is the line number, and it had to grow half of itself.** Pressing an anchored line's
number plays from that moment, and outside a run that is all it does; inside one it cannot be,
because the caret is where the next tap lands and a tape that moved without it would leave the two
ends of the run in different places — which is the failure `stepBack` seeks for, met from the other
side. `syncMoveTo` is that second half: it lands the caret on the line the press named, **armed** —
the press only ever lands on a line that already has a time, which is the same thing a resumed run
starts on — so the next tap belongs to the line below and the copy is walked by hand from there. It
runs only where the seek was claimed, so no line without the pointer cursor promises a rewind.

**It was disarmed once, and that tap could not have timed anything.** The reading was that the press
names the line the user wants timed. What it actually named was the moment the seek had just gone
to: an anchor is what the press seeks to, so a tap against it rewrites the value it rewound to, to
within the reaction it takes to make the press. The caret does not move, the cell redraws the same
`m:ss`, and the tap reads as swallowed — one dead press per jump, with every tap after it working,
which is the shape it was reported in. It cannot repair a wrong time either: wrong _late_ means the
rewind starts after the line began, so its opening is gone before the tape is playing. Re-timing one
line is `Ctrl-Alt-M` and the column's own ± pair, and stepping back onto one is `Backspace`, which
clears the anchor first and seeks to the line _before_ it so there is a run-up to tap against — the
three controls that were built for exactly that.

**And the fill is the one thing a run does that owes a toast.** Everything else it does is loud on
screen already — the rail, the caret, the times — so `announce` and its `sr-only` region are the
whole of what those need. This one dates several lines nobody tapped, jumps the caret past them and
moves the tape, without a press having asked for any of it, so it says what it did _and_ how to
refuse it: `Chorus 2 timed from Chorus — 3 lines. Press a line number to time it by hand instead.`
Nothing else on screen says those times were derived, and the section may be the one place this song
departs from itself. `onLyricSyncNotice` is the hook, the editor announces the same sentence itself
so a shell that leaves it off loses the toast and not the message, and the shell draws it **without**
announcing again — two live-region writes for one event is the message read twice.

The editor owns the mode and the shell reacts (`onLyricSyncChange`), which is what keeps the tape
and the mode from disagreeing: `Escape` and the end of the document both end a run without the shell
being asked, and both arrive through that one hook. The shell answers by playing or pausing, and by
focusing the editor on entry — the tap is a keystroke, so a run cannot start with focus in the
button that started it. **That focus is deferred one frame**, because the hook fires synchronously
inside the press that turned the mode on: the click's own default processing and the re-render the
state flip schedules both run after a synchronous call, and either can take the focus straight
back. Left synchronous, a run started with focus on the scrubber — where a scoped run's own design
just had the user parking the tape — came up with the space bar answering nothing, and the repair
was re-clicking the very line the entry had already selected.

Implementation: `src/lib/editor/extensions/lyric-sync.ts` (`linkedFill` and `syncMoveTo` are the
repeat's half of it), `linkedPeerHeaders` and `linePairingLimits` in `extensions/section-links.ts`,
the line-number handler in `create-editor.ts` where the seek and the caret move are ordered, the
control in `MediaStrip.svelte`, and the wiring in `Workspace.svelte`.

### A chorus is typed once, and what its repeats do differently is said out loud

A song's second chorus is its first chorus, so transcribing it means typing the same lines
again — and the mistake that follows is the one nobody catches: one of them has a typo, or a
correction lands in one and not the others, and the page ships with two versions of a line that is
sung once. Linking is the answer.

**A group used to be one body repeated, and that was the whole problem.** Linking overwrote every
copy from the one the picker was opened on, and the mirror rewrote each peer's entire body on every
edit — so the commonest shape in pop music, two choruses that are identical apart from the last
line, could not be linked at all. The only offer on the table destroyed the difference the
transcriber meant to keep, and the linter deliberately went quiet rather than make it. The feature
worked exactly where it was least needed.

**So a group is a merge structure now, not a body.** Each member's body is a partition into
alternating **shared runs** and **divergent runs**, and two facts hold at all times:

- every member has the same number of divergent runs, and
- the shared text between run `k-1` and run `k` is identical in every member.

Which means a position in shared text is expressible in coordinates every member agrees on — _so
many characters into the run after hole 3_ — and that one property is what everything else is built
out of. An edit made in one copy is carried to the others by translating its span; nobody's body is
rewritten wholesale, and nobody's own words are touched.

**Only the divergent runs are stored.** The shared runs are the gaps between them, so the second
half of the invariant is true by construction rather than by two lists agreeing.

**Linking therefore writes nothing.** `alignBodies` works out what the copies already share, that
becomes the shared runs, and everything else is set aside as each copy's own. Pressing `Link` on two
choruses that differ by a line changes not one character of the document — it only says that from
now on they move together, apart from the words named in the card. Making copies actually agree is
still available and is asked for **per difference**, so the destructive act is something the user
requests about specific words rather than the price of linking at all.

**Only what a song repeats verbatim may be linked**, which is chorus, pre-chorus and post-chorus
(`LINKABLE_SEMANTICS`). A verse repeats its shape and not its words, so offering to link two of them
would be a standing offer to overwrite one with the other. Refrain is deliberately out for now.

**The kind is the language pack's `semanticPart`, never the spelling.** That is what makes this work
in every supported language without a word of it being written twice: `[Hook]` and `[Refreng]` and
`[코러스]` are all `chorus`, and `Chorus 2` matches `Chorus` because the ordinal is stripped by the
same `headerSemanticKey` the section picker orders its suggestions with — one answer to "is this a
chorus", exported from `languages/registry.ts`, because two would disagree the first time a pack
gained a term. **English is consulted second**, not instead: Genius pages in every language carry
English headers routinely — `ja` is an English pack outright, `no` lists `Chorus` beside `Refreng` —
so a German draft with `[Chorus]` in it links exactly like one with `[Hook]`, while the selected pack
still wins where the two disagree.

#### The alignment is decided once, and that is not an optimisation

The tempting design is to re-derive the shape on every edit — git-style, re-diff and see what lines
up. It is wrong, and the reason is worth stating because it will be proposed again.

**Git can re-align because it has three versions.** Base, ours, theirs: it knows which side moved.
Here there is no stored common ancestor, so a live aligner has to guess whether an edit meant the
copies to converge or to diverge further. Fix a typo in one chorus and it must decide whether you
were making them agree — in which case it should propagate — or writing a deliberate variation, in
which case it must not. **A diff cannot tell a mistake from a decision.** Guess one way and it eats a
difference the user meant to keep; guess the other and the typo stays in one copy for good.

So the shape is worked out once, when a link is made or its membership changes, and is **stored
intent** from then on. It is re-derived only where there is no intent to honour: a group loaded from
a draft written before differences existed, or one whose members somehow ended up with different
numbers of runs, where every translation downstream would refuse anyway.

Three things about the aligner itself:

- **It matches words and line breaks, never characters.** A character-level alignment finds the `to`
  inside both `tonight` and `together` and calls it a common anchor — a shared run nobody would
  recognise as shared, which then propagates edits the user never asked to propagate. Line breaks are
  tokens of their own so a lyric's line structure survives instead of words drifting across it.
- **Matched tokens are not enough; the text between them is verified.** The whitespace between
  tokens is not tokenized, so two copies can match word for word and still differ by a double space.
  A run whose full span is not byte-identical in every member is not a shared run.
- **Whitespace at a run's edges is handed back to the shared text.** A run begins where the last
  matched word ended, so `my love` against `my friend` opens the difference at the space and reports
  ` love` against ` friend` — a difference whose first character is the same in both copies, which is
  the one thing a difference is not. **Whitespace only, never a letter**: `love` and `lover` share
  four characters, and trimming those would end the shared run mid-word, which is the coincidental
  anchor that tokenizing by word exists to prevent arriving through the back door.

#### The mirror carries a run, and the rule is contained against overlapping

An edit lands in one member's body. What happens next is two lines:

- **A change wholly _contained_ in a divergent run stays where it was made.** The run absorbs it,
  nothing is carried to the peers. This is the half that makes two choruses differing by a line
  linkable at all.
- **A change that merely _overlaps_ a run took that run with it, in every copy.** Retyping a line
  that contains a difference, or deleting across one, is the user writing over words that were
  deliberately their own — so the difference ends, the words become shared, and the mirrored span is
  widened to swallow the same run everywhere.

`carryHoles` in the field and `expandOverHoles` in the mirror name **the same set from opposite
ends**, which is why the counts stay equal without anything having to count them.

**Which puts the whole invariant at the mercy of every edit reporting its own size honestly, and one
did not.** An edit's range is a claim about what the user wrote over, and the two rules above are
read off nothing else — so an edit that says it replaced more than it did ends differences nobody
touched. `transformLine` in `performers/transform.ts` renders a lyric line whole, every piece
concatenated, and used to hand back `{ from: line.from, to: line.to }` for it. Tagging a performer
on an ad-lib that exists in one chorus only is an insertion of two tags around five characters; it
arrived as a claim to have rewritten the line, so the difference died and the ad-lib was copied into
every other copy. Silently, with the source line correct, and only visible on the peer the user was
not looking at. It was reported from a real transcription, on an ad-lib in the middle of a line —
the position decides nothing, and the trailing one that looked fine was fine only because it had
been styled before the sections were linked.

`narrowEdit` is the repair: the common text at both ends stays put and the range covers what
changed, so wrapping words that are this copy's own is an edit _contained_ in the run and the rule
above answers correctly on its own. Two things it owes. The trims are **clamped to the selected
content's own span**, because `insertedOffset` maps the selection as an offset into the edit's
`insert` and an edit that started after that offset would have nothing to measure. And neither trim
may stop **between the halves of a surrogate pair**, which is the one way a shorter range could be
worse than the long one it replaces.

The fix is deliberately in the transform and not in the mirror. An exemption for performer markup
would be a second rule beside the containment one, and the copy that drifted would be the one nobody
is looking at — while the honest range is owed to line anchors and to undo granularity anyway. The
pair in `section-links.svelte.test.ts` pins both halves: an ad-lib tagged in one copy stays there
whichever position it sits in, and a performer tagged on **shared** words still reaches every copy.
`transform-boundaries.test.ts` pins the seeds themselves, so a rewrite that goes back to claiming
whole lines fails there rather than in somebody's second chorus.

**A run's ends map outwards** — `from` backwards, `to` forwards — so it is greedy at its edges:
typing at the end of a word that was deliberately this copy's own leaves it this copy's own. The
containment rule agrees with this by construction, because an insertion at either edge is contained.

**What gets carried is the whole shared run, not the characters that changed**, and that is
correctness rather than convenience. A shared run is identical in every member _by definition_, so
writing all of it is idempotent where the group is in step and **repairs** it where it is not.
Carrying only the edited slice trusts every offset inside the run to already line up, and leaves the
copies disagreeing forever the first time one does not. It is also what makes a group with no
differences behave exactly as the old whole-body link did — one run, the whole body, replaced — so
a draft saved before any of this still mirrors the way it always did.

Four things it still refuses, and the refusals are the design:

- **Undo, redo, and IME composition are exempt**, so history replays byte for byte and a preedit is
  never interrupted.
- **Only a single contiguous edit inside exactly one member's body is mirrored.** An edit reaching a
  header, spanning two sections, or arriving scattered is a restructuring rather than a rewrite of
  the words, and guessing at those is how a link eats work the user meant to keep.
- **Membership is a range over the header's own line, never a point at its start.** The distinction
  `line-anchors.ts` documents at length: a point sits on the _boundary_ of the deletion that removes
  the line, so a deleted section would leave its membership behind for whatever line moved up into
  its place. Erasure is detected the same way — map the start forward, map the end backward, and if
  they meet, every character it described is gone.
- **A group with fewer than two members is not a group.** Delete a linked section and the rest carry
  on; delete all but one and the link is simply off. That is also what makes unlinking one effect
  rather than two: `setSectionLinkEffect` names the whole resulting group, every named header leaves
  whatever group it was in first, and a lone survivor comes loose.

**And it is a `transactionFilter`, not a follow-up dispatch.** The mirrored edits are appended to the
transaction that caused them with `sequential: true`, exactly as `headerRenameFilter` mirrors a
performer's name: the document is never briefly inconsistent, one snapshot is emitted, and one undo
restores every section at once. A second `view.dispatch` would give the user one undo step per linked
section for something they typed once.

#### Making copies agree is asked for per difference

`keepDifferent[i] === false` collapses difference `i` to one wording. **That wording is the source's**
— the copy the card was opened from, the words the user is looking at — **unless the source has
nothing there**, which is the one case where the section in front of the user cannot win: an untyped
`[Chorus 3]` is a request to be _filled_, and letting its emptiness win would answer it by emptying
the chorus that had the words. Then the words come from the first member of the group that has any.
**The group, never the document**, because a copy the user did not tick is not part of what they
asked for.

This is the same rule the old whole-body link had for bodies, now applied per difference — and the
empty-section special case collapses into the general model rather than needing its own branch.

#### Setting words aside by hand is a selection and a press

Select the words that differ, press `Mod-Shift-L`, and the card opens with the selection offered as
a difference, ticked. The span is **translated** into every peer rather than searched for, through
the same arithmetic the mirror uses: a position in shared text is the same distance from the nearest
difference in every copy, so "these five characters" means the same five characters everywhere
without a word of either copy being compared. It lands in every member or in none — a run that
appeared in some copies and not others would leave the group with different counts, which every
translation downstream refuses, so the link would go quiet rather than fail, which is the worse
failure.

**`linkTargetAt` answers the keyboard, and `linkableHeaderAt` stays exactly as narrow as it was.**
That second predicate answers the _pointer_ path, where a card opens uninvited on a bare selection,
and teaching it about lyric ranges would put the link card on the most common gesture in a text
editor — beside the performer picker, which is already there. An aimed press has been asked; a
selection has not. That is the rule _A surface that opens itself has to have been asked_ already
states, applied to a second surface that wanted the same gesture.

**And the answer about existing differences is resolved before a new one is added.** Inserting first
would shift every index the user's ticks were given against, silently, and collapse the wrong
difference.

**`Type only here` is refused inside a difference that is already there, and the empty ones are the
exception.** The reasoning for the refusal is sound and stays: the mode would be a fact standing
true, and a control for that appears to do nothing. What it missed is that the fact is only
_visible_ where the run has words in it — the dotted underline the caret is sitting in is what says
so. A run that is empty in this copy draws nothing, because there is nothing there to draw on, so
those were the one set of positions in a linked body where typing already stays put and no mark
anywhere says it.

That is not an edge case, it is the feature's most ordinary use. A peer with an ad-lib the other
copy lacks puts an empty run at exactly the caret a transcriber goes to when they want to write
their own — the end of the line for a trailing `(Yeah)`, mid-sentence for an inline one — so the
button vanished precisely where it was being looked for, and read as the workbench refusing. It was
reported as being unable to write a second chorus's ad-lib at all, on a caret where typing would in
fact have stayed local the whole time.

So `canTypeOnlyHere` answers on the run's **width** rather than on its existence. Pressing it there
arms the mode, the `Typing only here` marker draws, and the mirror's own "already local" branch
spends the press without adding a second run beside the difference already recorded — machinery
that was written for this and could not previously be reached. Nothing about a run with words in it
changed.

#### The card asks one thing at a time, and shows a diff

The sections list is what it was: tick the copies to tie together. **Nothing is said about the words
until some are ticked**, because what two copies differ on is a question about a set the user has
not chosen yet. Once a peer is ticked, the card grows a **diff** and then the one decision, as a
**radio pair**:

- ◉ Respect differences between them
- ○ Replace them with `Chorus 1 ⌄`

**The second radio names the copy, and it names it in a control rather than in its label.**
`Replace them with this chorus's words` is ambiguous the moment there are three of them — the reader
has to work out which chorus "this" is from the greyed row further up — so the copy is the dropdown
that follows the words, which is the same control described under _Whose version wins is a dropdown_
below. The radio's own accessible name says what it does without it
(`Replace them with another section's version`), because a name that stops mid-sentence at a
`<select>` is not a sentence.

**The diff shows each version inside its own line.** `før, du kunne spørt meg` on its own says
nothing about where in the chorus it sits, or that the other copies simply stop there. So each row
is the run with its neighbours around it: the shared halves muted, the divergent run marked, and the
versions stacked so the only thing that moves between them is the run.

**That context is the shared runs either side, and never "the rest of the line".** Clipped to the
line it was drawn from, the context stopped at whatever line boundary each copy happened to have —
and a run that spans lines ends on a _different_ line in each copy, so the text drawn beside it was
different text. On screen that put a word inside one copy's run and in another copy's context, with
the insertion caret sitting in front of a word the row above was showing as shared. A shared run is
identical in every member by construction; a line is not. It is trimmed towards the middle with a
leading `…`, because the shared run either side of a difference can be the whole rest of the chorus.

**The lyric wraps rather than truncating.** Set to one line with an ellipsis, the run itself — the
one thing the row exists to show — was the part that got cut off, and there was nowhere to scroll to
see it. Wrapping means the run is always whole and only the context is ever abbreviated, which is
the right way round. The list keeps a `max-height` so a long comparison scrolls.

**A copy that has nothing there gets an insertion caret, not the words "nothing here".** It is the
mark a diff already uses, it sits at the exact point the other copies' words would go, and it costs
the row no width it would have to take from the lyric.

**The highlight ends where the run ends.** It carried a one-pixel `box-shadow` spread to fake
padding, which drew a band a pixel out on every side — read down a column of rows that is a stripe
lying behind words that are not part of the difference at all. Inline padding grows the box around
its own text instead.

**Whose version wins is a dropdown, not the opened section.** Hard-wired to the copy the card
happened to be opened from, noticing that a _later_ chorus has the wording worth keeping made the
repair "close the card and open it again from the right one". `replaceFrom` rides the choice, the
dropdown lists the ticked copies, and choosing one selects the replace outcome — picking a version
is asking for it. Unticking the chosen copy falls back to the opened one, because a section that is
not in the group cannot be the one whose version wins. An empty wording still never wins.

**Choosing to replace turns each row into what would happen to it**, rather than recolouring what
is already there. A row that is changing keeps the words it loses, struck through, with the words it
gains beside them — the editor's own fix-preview idiom, and the only arrangement that answers "what
would actually happen". Colouring the losing rows red said only that something was wrong with them,
and left the reader to imagine the result.

Three states follow from it, and the third is the one worth naming:

- **The picked copy** is already saying the winning version, so it shows no change at all, only its
  run marked green.
- **A copy that differs** shows `del` then `ins`, in `--color-danger` and `--color-success`. Struck
  through **as well as** coloured, because colour alone is never a state carrier here.
- **A copy that happens to match the winner already** is not changing either, so it is marked as the
  version rather than as an edit. Marking it as a change would promise an edit that never runs.

**Switching the dropdown turns the whole diff around**, because the diff is derived from
`replaceFrom` rather than from the opened section — otherwise the card would go on describing an
outcome nobody chose.

**And the card's `winningText` follows the same rule as the editor's `winningWording`**: the picked
copy's version, unless it is empty, in which case the first copy with words wins. The two have to
agree, because this row is a promise about what that function is going to do.

**An insertion caret only survives into the replacing state on a row that is not changing.**
Everywhere else the green insertion has taken its place, which is a better answer to "where do the
words go" than a bar.

**The two outcomes are one control each, not two rows apart.** Given `--control-height-sm` and their
own padding they sat a whole row apart with nothing between them, which reads as two separate things
rather than as one either/or. The heading over the diff takes the opposite correction: with only the
card's uniform gap above it, the section rows and the comparison ran together as one list of six.

**This replaced a checkbox per difference, and the reason is worth keeping.** Ticked meant _keep
these words apart_, six pixels under a list where ticked meant _include this section_. One control,
two opposite meanings, on one card — and the row beside it ran both versions together with an
interpunct into a single truncated line, so which words were whose could not be read at all. The
lesson is the general one: **a novel control is a bug unless the familiar one genuinely cannot do
the job.** A diff and a radio pair are what everyone has already met in a file-conflict dialog, and
neither can be read two ways.

The diff is **information, not a control**. Nothing in it is pressable.

#### The card is pinned, not frozen

What the old "must not resize" rule was really protecting is the **position** of whatever the
pointer is on. The card hangs from its bottom edge, so anything appearing lower down pushes the
section list — the very checkboxes being ticked — up the screen.

Freezing the card's size was the wrong way to stop that, and it cost two rounds. Reserving the
diff's height meant reserving it for the largest set the user _might_ tick, which opened the card as
a tall empty box; filling that space with a preview meant showing a comparison and a decision about
copies nobody had picked yet, which is a question asked before the one it depends on has been
answered.

**So the top is pinned instead.** `pinnedTop` is measured in a `requestAnimationFrame` after the
card has drawn, after which the card extends downwards into space the user is not pointing at.
Three things go with it:

- Only the `above` placement needs it; `below` is already measured from its top.
- `--ll-room` is what is left below the pinned top, so a long diff scrolls rather than putting the
  actions out of reach.
- The diff list keeps a `max-height` of its own for the same reason.

`section-links.svelte.test.ts` asserts the card's top **and the ticked row's own top** are unchanged
across a tick, and that the card did grow — a pin that pins nothing would pass the first two.

The note is still one sentence per **opening** rather than one per tick (`openedComplete`), because
two sentences of different length rewrap to different heights and that is a change nothing asked
for.

**Applying collapses the selection**, and that is load-bearing rather than tidiness: the card opens
_because_ a header is selected whole, and the selection survives the edit, so leaving it there would
reopen the card the user just answered on the next settled anchor report. A collapsed selection
reports no anchor at all. **Which is exactly why a missing anchor does not retire this card**, unlike
the performer picker — that one exists solely because a range of lyrics is selected, while this one
is anchored to a _header_ that is still there, and it opens from a bare caret through `Mod-Shift-L`.
It leaves the way every other transient surface does: Escape, Cancel, an outside press, or applying.

**A card no anchor describes takes the side that has room**, rather than `above` unconditionally.
`anchorPlacement` takes the fallback from the caller, and the caller measures with
`selectionAnchorForView`'s own comparison, so the pointer-opened card and the keyboard-opened one
land on the same side.

**The keyboard keeps the section list and the radios apart.** Arrows rove the section rows only; the
radio group answers its own arrows, which is what a radio group is for.

`apply` asks for the differences of the ticked copies again rather than reading the list on screen,
so the answer can never be given against a set that is no longer showing.

#### What is drawn

**A linked header says so on its own line** through `⇄`, a widget outside the text.

**And it serves the editor's one hover wait before it opens anything.** It opened on the bare
`pointerenter`, which made it the only pointer target in the document that answered instantly — so a
mouse crossing the editor on its way to the panel dragged a card open behind it for every linked
header it passed over. `HoverIntent` in `extensions/hover-intent.ts` is that wait, shared with the
severity underline and the count badge at the end of a line, so a pointer crossing a crowded
document meets one rule rather than a different one per target. The keyboard is exempt, as it is on
the badge: reaching the marker with `Tab` is a decision already made, so `focus` cancels the wait and
opens at once. There is deliberately **no click path** — a press focuses the button, and a second
`open()` behind the first would reset a card the user had already started answering.

**A divergent run is a `Decoration.mark`, never a widget**, and that distinction is the same one the
`⇄` earns its exception from: a widget in the content flow participates in selection and copy, and
clean lyrics on the clipboard are this application's entire output. A mark adds nothing to a paste.
It is drawn as a **dotted** underline because every other underline in the editor is wavy and belongs
to a diagnostic — this is not a finding, it is a note about what an edit here will and will not
reach. A run that is empty in this copy draws nothing, because there is nothing there to draw on;
the card is where those are named.

**The mark on the header stayed as it was, and that is a decision.** `⇄` means one thing — this
section moves with others — and giving linkable-but-unlinked headers a dimmer copy of it would
separate a warning from an invitation by tone alone, which is what the severity glyphs were reworked
to stop doing.

#### The linter is how anyone finds this, and it is no longer timid

`section.unlinked-repeat` used to name only the copies that **already agreed**, and at the time the
reason was sound: linking overwrote, so pointing at a chorus that genuinely differed was an
invitation to destroy the difference. Two rounds of narrowing went into keeping that offer honest —
first the whole song part had to match, then the most-repeated wording had to.

All of it is gone, because the hazard is. Linking keeps what the copies disagree on, so there is no
wording left for a suggestion to endanger — and the song the rule was quietest about is exactly the
one this rebuild was for. The narrowing was silence on the common case, bought against a risk that
no longer exists.

**So the song part is the group now — but only where the copies have something in common.** The
widening went one step too far in its first version, and the report was a diagnostic offering to
link two pre-choruses with _completely different_ words. Those share nothing, so linking them ties
no text together at all: every word is a difference, the mirror can never carry an edit, and the
finding is an offer to do nothing. `worthLinking` gates on `alignBodies`, and three things about it
are decisions rather than tuning:

- **Half of the shorter copy**, as a fraction rather than a count, so it means the same for a
  two-line pre-chorus and a twelve-line one. Against the _shorter_ one, so a copy that repeats
  another in full and then carries on still qualifies — the short one is wholly inside the long one,
  which is exactly what linking is for.
- **Some pair, never all of them together.** A song whose first and last chorus match while the
  middle one departs shares almost nothing across all three, and is still two choruses worth
  linking. Asking it of the whole set is how this rule went quiet on that shape once already.
- **Empty copies are not counted and do not count against.** An untyped `[Chorus 3]` shares nothing
  with anything by definition, and it is the case this rule most wants to catch.

**The gate is on what the linter volunteers, not on what the card will do.** Open the picker on two
sections that share nothing and you may still link them; the diff shows exactly what that means.
The rule only decides what to raise unasked.

Four things it still owes:

- **It is a `suggestion` with no fix, and its action opens the picker.** Linking is a state effect
  and `DiagnosticFix` carries text edits, so this joins `Choose header` and `Assign section
performers` as a guided action on the shared row rather than inventing a fourth kind of fix. The
  picker is also the honest surface: a card cannot show a three-section reconciliation as a diff, and
  the picker names every member and every difference before anything runs.
- **It arbitrates nothing, and the picker preselects nothing.** The rule points and stops there.
- **It anchors on a copy that has words**, never an empty one, so a copy the user is filling always
  has somewhere to take the words from.
- **An immediate repeat belongs to `section.immediate-repeat-spacing`.** Two identical choruses with
  nothing between them want one header, not two tied together, so both rules read the same
  `isImmediateRepeat` predicate. Only the adjacent pair steps aside; the rest of the kind stays
  linkable.

**The suppression is in the shell, not in `RuleContext`.** Linked sections keep their shared runs
identical by construction, so the rule would fire on its own result forever unless something knew
about the links — and `filterForEditorState` in `wiring.ts` is where that already happens, because it
runs on every snapshot while the lint itself is memoized on the document. A link made or taken off
changes no text, so a rule that learned about links through its context would keep the answered
suggestion on screen until the next keystroke.

**Which means something has to ask for a snapshot when the links move, because the editor will not.**
An effects-only transaction deliberately emits none (`update-bridge.ts`: the shell reacts to snapshots
by re-applying context, so emitting there would be a cycle), and a link changes no text. This worked
by accident for as long as the only way to make one was the card, which collapses the selection on
its way out — and a selection change _is_ a snapshot. Restoring a draft's links collapses nothing, so
a reload came back with the suggestion still on every linked section and it went away on the user's
first press in the document. `republishForSectionLinks` in `Workspace.svelte` is the explicit ask,
from the two places links move without an edit: `onSectionLinksChanged`, and the `$effect` that hands
a newly mounted editor its handle. It costs nothing it did not already cost — the lint is memoized on
the document, so it re-filters diagnostics already computed, and the snapshot it re-adopts is byte for
byte the one in hand, so no save is dirtied.

**That hand-off runs `untrack`ed, and it has to.** It reads back what it has just written — the
editor's own anchors and links — and an editor holding those in reactive state re-enters the effect
forever. CodeMirror does not, so the real pane never showed it; `MockEditorPane` does, and did.

**The mock publishes its handle a microtask after mount for the same reason.** The real pane awaits a
dynamic import of CodeMirror before it has anything to hand over, so the shell's first lint runs
_before_ the draft's links are re-seated — which is the entire bug. A mock that assigned its handle
at init reversed that order and hid it: the first version of this test passed against the unfixed
shell.

#### Undo, and what is written down

**Undo reverses the link along with the words, and that needs `invertedEffects`.** Undo restores text
by reversing changes, and a `StateField` reverses nothing on its own. Every history event carries the
groups **and their runs** as they stood before it, so undoing a deletion, a difference that was
closed, or an unlink that moved no text at all puts the shape back with the text. The runs travel
with the membership for a specific reason: a half-reversal that restored `again` while the group
still believed the line was shared would overwrite it again on the next keystroke.

Two things it depends on: the restore effect **must** define `map`, because an effect stored in the
history without one is _dropped_ the moment it has to be mapped through a later change, silently; and
it is emitted whenever links exist rather than only where the field actually changed, because
comparing would mean reading the new state from inside the facet that state is still being built for.

**Links are saved on the draft as header line numbers**, exactly as `LineAnchor` is and for the same
reason — an offset shifts on every keystroke earlier in the document, a line does not. **The numbers
are read off the live mapped ranges at save time, never stored and then shifted.** A divergent run is
written the same way, as a line and a column at each end: a column as well as a line because a
difference can be part of a line, which is the case the whole feature was rebuilt for. **Zero width
is meaningful and is kept**: it is where one copy simply has nothing, and it is where the other
copy's words go.

**Which means every hand-written copier had to learn about it, and the count in this file was
wrong.** `copySnapshot` in `persistence/autosave.ts` and `copyDraft` in
`persistence/draft-repository.ts` each spelled out `{ lines: [...link.lines] }`, so a link that
gained a second field was dropped in silence by both.

**And there is a fourth, which this section did not name and which is the one that actually shipped
the bug.** `writeRecord` in `ui/state/draft-store.svelte.ts` assembles the record every autosave
writes, and it rebuilt each link as `{ lines: [...link.lines] }` too — so the differences were
correct in the editor, correct in `sectionLinksFor`, correct on the way into the repository's own
copiers, and thrown away by the one step in between. On screen that is a link whose divergent runs
are marked while you work and gone on the next reload, with nothing anywhere reporting a failure.

There is one `copySectionLinks` in `persistence/copy.ts` now, used by all four. **The rule is not
"there are three copiers" — it is that a `DraftRecord` field is only as safe as the least careful
place that rebuilds one**, and the way to find them is `grep` for the field's siblings rather than
trust a list. `workbench.test.ts` drives the _real_ copier in its editor stub for exactly this
reason: a stub that listed the fields it kept would hide this whole class of bug, and it did.

`backup.ts` validates them, and **a run whose numbers cannot be read is dropped rather than throwing**:
the link itself is still good, and losing a difference costs the user one re-tick while refusing the
whole backup costs them the draft.

And it needs `onSectionLinksChanged`, because **unlinking and closing a difference can move no text
at all**: a shell that saved only on a document change would keep writing a shape the user had just
changed.

**What none of it survives is the document being replaced wholesale.** Select all, cut, paste back
and the links are gone — every header line the membership was written against was erased. Re-attaching
links to re-pasted text would be guessing at which of the new headers used to be which, and a link
that is silently wrong overwrites work. Line anchors behave the same way for the same reason.
`section-links.svelte.test.ts` pins this as a decision rather than leaving it as a surprise.

**The keyboard's way in is `Mod-Shift-L`, beside `Mod-Shift-H`, and deliberately not the `Ctrl-Alt`
family the rest of the editor's commands live in** — `Ctrl-Alt-L` is the transport's forward key,
bound to the window, and two implementations of one keystroke is how every nudge came to fire twice.
Both ways in run `requestSectionLink`, over the same predicate, so they cannot come to mean different
things; the pointer opens silently and the aimed press names its refusal out loud.

Implementation: `src/lib/core/link-shape.ts` (the aligner and the run arithmetic — pure, no
CodeMirror, tested as arithmetic in `link-shape.test.ts`). **It lives in `core` rather than beside
the editor because the rule asks it too**, and a rule may not import the editor: two answers to "how
alike are these copies" is one more than the number that can stay in agreement, `src/lib/editor/section-links.ts` (the
predicates and the body range — no CodeMirror either, so `EditorPane` may import it without pulling
the editor into the landing page's bundle), `src/lib/editor/extensions/section-links.ts` (the two
fields, the mirror, the decorations), and `SectionLinkPicker.svelte`. **`linkableSemantic` lives in
`languages/registry.ts`**, beside the `headerSemanticKey` it is built on, because the rule asks it too
and a rule may not import the editor. The rule is `rules/catalog/section-unlinked-repeat.ts`, its
action is `onLinkSections` on `DiagnosticActions.svelte` — wired to the picker by `startSectionLink`
in `EditorPane.svelte` and by `linkDiagnosticSections` on the controller.

**A body is measured from the end of the header line, not from the first lyric.** That one offset is
what makes an empty `[Chorus 3]` take a peer's words with no special case — replacing an empty range
at the end of a header line with `"\nHold on tight"` is an ordinary edit, while a body measured from
the first lyric of a section that has none has no position to describe at all.

### A copy carries its timings and links in a second flavor, and the plain text never learns

A clipboard entry is a set of representations and the paste target picks the one it understands. So
a copy made in the editor carries two: `text/plain` is the lyrics, byte for byte the selection's own
slice — clean lyrics on the clipboard are this application's entire output, and every text field in
the world reads this flavor and only this flavor — and `text/html` is the same lyrics with the line
anchors and the section links in one `data-lyriclint` attribute, where only the paste handler on the
other side of the trip ever looks. Copy a synced, linked chorus out of one 'scribe and paste it into
another and the timings and the link arrive with it; paste the same clipboard into a Genius lyrics
box and nothing but the words was ever there.

**The paste is the sanctioned exception to wholesale replacement losing everything.** The rule that
a document replaced whole loses its anchors and links is about guessing — re-attaching them to
re-pasted text would mean guessing which of the new headers used to be which, and a link that is
silently wrong overwrites work. A payload riding the paste is the one case where that stops being a
guess: it says which fragment line owns which time and which headers move together, so applying it
is arithmetic rather than inference. Everything in it is **fragment-relative** — 0-based lines into
the copied text, because the paste has no idea where in which document the copy was made — and the
fragment's own line count rides along as the guard: a `text/plain` that no longer splits into that
many lines is not the text the metadata describes (a clipboard manager merging flavors from two
copies is the way this happens), and the honest answer is the text alone, through the default path.

**The editor's copy carries it; the toolbar's `Copy lyrics` deliberately does not.** The toolbar
copy is the application's one output, aimed at a song page, and it stays exactly what
`copyCanonicalMarkup` has always written; the selection copy is a working gesture inside the tool.
Whole-document transfer is select-all and copy, which is the same gesture. The empty-draft
`Paste lyrics` button reads the clipboard through `readText`, so it is plain as well — the keyboard
paste into the editor is the carrying path, and it is also the only one whose read
(`getData('text/html')` on the paste event) no browser gates behind a permission or sanitizes.

**The song rides too, where it is an id and only as a rider.** A remote source — a YouTube video,
a Spotify track, an Apple Music song — is nothing but an id in a known alphabet, which is exactly
what a clipboard can carry; a local file is a handle only this browser can redeem, so it never
travels and its absence is the design rather than a gap. It is a rider, never the trigger: it joins
a copy that already carries timings or links, because it is carried as the thing the timings are
seconds into, and a copy that is only words says nothing about a song — claiming every copy in
every draft with audio attached would put the whole workbench's copy path through this extension
for a fact the words do not state. Four rules on the paste side, and each is an existing rule
arriving here:

- **A draft with audio keeps it.** Attached or pending, an attachment is deliberate work, and a
  paste must not overwrite it (`adoptPastedSource` returns false and nothing changes).
- **A pasted source is a restored record, not a press.** It lands persisted, named, and waiting on
  the press that pays for its script or its sign-in — the exact state a reload restores — because
  the paste was aimed at the document, not at Google. The one shortcut it takes is the one a reload
  takes: consent already given in this session stands, so a pasted video plays at once where
  `youtubeAllowed` is already true, and a pasted track where the session is already signed in.
  Nothing is contacted that a reload would not contact.
- **A build that cannot carry the source out does not adopt it** — a pasted Spotify track in a
  build with no client id would be a pending press whose sign-in has nowhere to go, which is
  `spotifyAvailable`'s rule met from the clipboard.
- **The carried name may be provisional, and a provisional name titles nothing.** A copy made
  before the catalogue answered carries `youtu.be/dQw4w9WgXcQ`; it labels the pending press, and
  the title-suggestion guard the adopt paths already hold applies to the pending path as well, so
  the target draft is never named after an address.

The editor's half of this is two hooks — `onRequestMediaSource` answers the copy,
`onMediaSourcePasted` hands the paste over — both in **`createCallbackProxy`**, and both decisions
are the shell's: the editor has no standing in what a draft's song is or what a pasted one is
worth. `clipboardSource` and `adoptPastedSource` on the media store are the two answers.

Five things the extension owes, and each was a wrong version first:

- **A copy with something to carry is owned outright; every other copy is left to CodeMirror
  untouched.** Adding a flavor beside the built-in handler's cannot work — it opens with
  `clearData()` — so the extension claims the event whole, and it claims only the one shape whose
  plain flavor it can reproduce byte for byte: a single non-empty selection range. Multi-range
  selections, line-wise empty-selection copies, and any copy with no anchors and no whole link in it
  fall through, so the extension cannot drift from the default copy on the copies it adds nothing to.
- **A copy is only claimed where the live DOM selection is the editor's own.** A page-wide selection
  that reaches into the editor bubbles its copy event through `.cm-content`, and CodeMirror's own
  handler steps aside for it by exactly this test; a handler without it would overwrite a copy of
  half the page with whatever the editor's internal selection happened to be.
- **A link travels only where its group is wholly inside the copy.** A member's header line has to
  start inside the fragment and its whole body has to end there, because the paste re-seats
  membership by line arithmetic and a section it only has half of has no lines to seat it on.
  Members outside the copy are dropped and the survivors carry on — the rule deleting a linked
  section already follows — and fewer than two survivors is not a link. On the paste side a header
  that landed mid-line is not a header any more, and the **whole group** stands down rather than one
  member at a time: the members' divergent runs correspond by ordinal, and a partial group would
  carry one copy's differences under another copy's words.
- **Landed links go through `setSectionLinkEffect`, never the restore effect.** The restore is the
  draft being read back and is deliberately invisible to the shell's save — links applied through it
  would be correct on screen and gone on reload, which is the exact class of bug the four-copier
  history of `SectionLink` exists to warn about. One effect per group, exactly as the picker links,
  recorded by the history and reported through `onSectionLinksChanged`. It is a second transaction
  after the insert because it has to be: the effect maps its headers through its own transaction's
  changes, and a position inside text an insertion is still creating is not reachable from the old
  document by any mapping. The anchors need no such step — `anchorLineEffect` reads its positions
  against the new state, so they ride the insert itself.
- **The parse trusts nothing and drops what it cannot read.** The payload is versioned, every line
  index is checked against the stated count, and an unreadable anchor or hole is dropped while the
  rest applies — the same trade `backup.ts` makes, because losing one difference costs a re-tick
  while refusing the whole payload costs the timings beside it. Anybody else's HTML has no
  `data-lyriclint` and reads as no metadata at all, which is what hands an ordinary rich-text paste
  straight back to CodeMirror.

What the HTML flavor costs is named rather than hidden: a rich-text surface — a document editor, an
email composer — picks it over the plain one, so such a paste is an HTML paste. The flavor's markup
is the escaped lyrics in a `<pre>` and nothing else, so what those surfaces paste is still the
words; the attribute is dropped by any editor that does not know it, which is all of them.

Implementation: `src/lib/editor/clipboard-metadata.ts` (the payload, the serializing, the parse —
pure strings, no CodeMirror, tested as arithmetic in `clipboard-metadata.test.ts`),
`src/lib/editor/extensions/clipboard-metadata.ts` (the three event handlers), and
`clipboardSource` / `adoptPastedSource` in `src/lib/ui/state/media-store.svelte.ts`, wired in
`Workspace.svelte`. `clipboard-metadata.svelte.test.ts` drives the real editor with real
`DataTransfer`s and pins the promise both ways: the plain flavor byte-identical on a carrying copy,
and the fall-through — plain pastes, foreign HTML, mismatched counts — landing text and nothing
else. `media-store.test.ts` pins the adoption rules against the stubbed sources, so "contacting
nobody" is its usual assertion — a loads count of zero — rather than a hope.

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
quota-extension request is refused. So `.media-attribution__spotify` is the **one literal color in
this stylesheet outside the favicon**: a third party's brand asset is not a tone from our palette, their
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

### Apple Music is the fourth source, and the only remote one the deployed build ships

It clears both of the things that make Spotify a local-only experiment, which is the whole reason
it exists here. **There is no allowlist and no quota review** — an Apple Developer Program
membership signs the token and any Apple Music subscriber can then use it, so this is the one
remote source a stranger can actually be offered. **And it has a playback rate**, which Spotify
has at no layer, which makes it the better source than YouTube for the job this application is
for.

What it costs instead is a signature, and that is the only real friction: the developer token is a
JWT signed with a Media Services key, and Apple caps it at **six months**.

**The token is not a secret, and treating it as one would break the feature silently.** It is
handed to every browser that loads the workbench — that is what a developer token _is_ — so it is
inlined in the bundle as `PUBLIC_APPLE_MUSIC_TOKEN` and committed to nothing. The `.p8` that signs
it is the secret and never leaves the machine that mints it. The trap this avoids is the one
Spotify's client id documents: `import.meta.env` resolves at **build** time, so a Cloudflare Pages
_runtime_ variable or a `wrangler secret` never reaches the bundle and Apple Music would work
locally and quietly vanish from the deployed picker. Production sets it as a **build** variable.

**`appleMusicConfigured` reads `exp` rather than testing for presence**, and that is not
belt-and-braces. The failure this will actually meet is not a missing token but a stale one, six
months from whenever it was last minted — and a stale one otherwise fails as a 401 under a press,
several steps after the point where anything could have said so. Reading the expiry turns that
into the picker not drawing an answer it cannot carry out, which is the rule `availableRates` and
`spotifyAvailable` both follow. A token the parser cannot read counts as unusable rather than as
unlimited: one this module cannot vouch for is one it should not offer.

Rotating it is `bun run token:apple -- --key <path to the .p8>`, one variable, and a redeploy.
`ieee-p1363` in that script is load-bearing — Node signs ES256 as a DER sequence by default and
JWS wants the raw r‖s pair, and the difference is invisible until Apple answers 401 with nothing
to go on.

**It is the least asymmetric of the three remote sources, and each difference is machinery the
other two need and this one does not.**

- **There is a cue.** `setQueue({ startPlaying: false })` points the player at a song without a
  note of sound, so attaching is silent the way YouTube's is — rather than by deferring the start,
  which is the whole shape of the Spotify module.
- **There is a `playbackTimeDidChange` event**, so nothing here polls. Both other bridges run a
  250ms timer because their players report no such thing.

  **But an event is what feeds the mirror, and it is never what `time` answers from.** That
  distinction shipped wrong and cost a whole feature its accuracy. `known` is written by the event
  handler and by nothing else, so a `position()` returning it handed the same stale number to
  `currentTime` _and_ to `liveTime()` — and `liveTime()` is what a sync tap stamps, precisely
  because the media section says it is "the source's own playhead read at the moment of the press,
  strictly fresher than the mirror it replaces". Here it was the mirror. Every anchor a run wrote
  was early by however long had passed since the last announcement, by a different amount on every
  tap, and on playback the wash led the vocal by a distance that changed line to line — which is
  how it was reported, and which no amount of tuning `tapOffsetSeconds` could have fixed, because
  the error is jitter rather than an offset. `currentPlaybackTime` is the live property, was
  already declared on `AppleMusicInstance`, and was read by nothing; `rawTime()` reads it the same
  defensive way YouTube reads `getCurrentTime()`. **The event goes on driving `events.timeChanged`
  and should**: the follow lagging the audio by up to one announcement is a separate effect, it is
  always in the same direction, and it is not what a tap is measured against.

  **It is behind `started`, for `seek`'s own reason.** Before the first press there is no
  `nowPlayingItem` for the property to describe, so it reads 0 while `known` holds the restored
  position the queue was built around — read live through that window, a reopened draft reports
  0:00 until something presses play.

  **The stub had to learn it too, and that is the half that hides this bug.** A `currentPlaybackTime`
  frozen at 0 while the emitted events climb models a player that does not exist, and it makes a
  source reading either one look correct. `stubMusic`'s `emit` moves the property with the event,
  and `advance()` moves it _without_ one — which is the gap the whole fix is about.

  **The seek hold is what keeps that gap off the screen, and its backstop had to learn the burst.**
  `position()` reports the seek `target` until the player agrees, the way both other bridges hide the
  same async gap — but MusicKit answers a `seekToTime` with a _burst_ of `playbackTimeDidChange`
  events all still carrying the position the skip started from, and the give-up backstop was a tally
  of those events. The burst spent the whole tally before the real position landed, released the
  hold, and dropped the readout back to the origin for a tick — the "yellow line flashes back to the
  previous line before going forward again" a skip was reported to show, in both directions, because
  the stale burst carries the origin whichever way the seek went. So the tally is no longer of all
  events: `origin` is captured at the seek (read from `rawTime()` before `known` is overwritten), an
  event still within `settleToleranceSeconds` of it is the burst and is held through uncounted, and
  only an event that has moved somewhere that is neither the origin nor the target — a seek the player
  redirected or ignored — counts toward giving up, which is the one case the backstop is actually
  for. The landing event (within tolerance of the target) still clears the hold at once.
  `media-apple.test.ts` drives a burst longer than `settleMaxEvents` and pins that the readout never
  reports the origin after the skip.

- **There is a rate**, and the source claims it back on every attach. The transport does not reset
  `availableRates` between attachments, so a song attached after a Spotify track would otherwise
  inherit that source's narrowing to `[1]`.

What it does share with Spotify is that **a seek before the first press has nowhere to land**:
`seekToTime` needs a `nowPlayingItem`, which does not exist until playback has started. So a
restored position is spent as the queue's `startTime` rather than as a seek, and `started` is what
tells the two apart. **A seek made in that window is remembered and spent on the first play**,
which is the debt Spotify settles as `position_ms` — and the window is not a corner case, because
the reconnect press takes seconds and a lyric line tapped while it settles is a seek with no
`nowPlayingItem` yet. Dropped, it produced the worst kind of wrong answer: the readout said the
tapped line while the audio came in from wherever the queue pointed. The queue is built at `known`
rather than at the load's own `startAt`, so a seek that lands mid-load costs nothing extra, and a
first play whose position no longer matches where the queue was built (`queuedAt`) rebuilds the
queue around it before starting — MusicKit's only pre-start positioning.

**A remembered song is always pending, and that is a deliberate divergence.** Spotify can come
back without a press where the session already holds a token, because that question is one
`sessionStorage` read. Apple's cannot: MusicKit keeps its own user token, and the only way to ask
whether it still has one is to load Apple's script — which is the exact thing an untouched page
must not do, and the reason `youtubeAllowed` exists. So the press pays for the script and the
sign-in together, and where Apple already has a session the sign-in step passes straight through,
which is the same trade the file source makes with an already-granted permission.

**But the press may not pay for both in that order, and getting it wrong hangs the whole
workbench.** The sign-in opens a pop-up, and a browser only allows one out of an activation it can
still see — so awaiting Apple's ~600KB script and its `configure()` round trips in front of
`authorize()` spends the very press the pop-up needed. On a cold load it was blocked every time.

What made that a catastrophe rather than an error message is MusicKit's own bookkeeping:

```js
this._window = window.open(e, this.target, m) || void 0;
_startPollingForWindowClosed(e){ this._window && … setInterval(…) }
```

That interval is the only thing that ever settles `authorize()`, and it is guarded on the window
existing. **A blocked pop-up is therefore not a rejection — it is silence for the rest of the
page's life**, and everything downstream inherits it: `load` never returns, `reconnect`'s `finally`
never runs, `busy` stays true, and the picker's search button — disabled on `busy` — reads as a
dead dialog in a part of the workbench the user had not even had open. One unsettled promise
presenting as three unrelated faults is why both halves of the repair are load-bearing.

- **The script is bought with an earlier press.** `prepareAppleMusic` runs when the audio dialog
  opens, so by the time a result is pressed the instance is already configured and `authorize()`
  runs in the same tick. This is not the module-scope load `youtubeAllowed` exists to prevent: it
  is a press, on the one surface that offers Apple Music. `MediaPicker.svelte.test.ts` pins the
  call, because removing it brings the hang back only on slow connections, where nothing else here
  would fail.
- **And `authorizeAppleMusic` watches for the refusal rather than waiting it out**, by patching
  `window.open` for the length of the call: a `null` return resolves the race at once, while
  MusicKit's promise stays pending forever. A duration cannot do this job — a sign-in is somebody
  typing a password and a code from another device, so any timeout short enough to feel like one is
  short enough to cut off a real sign-in. The five-minute backstop exists only so that a MusicKit
  which stops using `window.open` cannot restore an unbounded wait. `blocked` is its own outcome
  because it is the only one whose repair is a browser setting rather than another press, and the
  message says so.

**The reason this went unnoticed is that MusicKit's user token is per origin.** Every subscriber
who had signed in on `127.0.0.1` skipped the branch entirely; moving the dev server to a hostname
behind a proxy was enough to make everyone a first-time user again and light it up. A remote source
whose sign-in path only runs on a new origin is a path no ordinary session will ever test —
`media-store.test.ts` therefore drives it end to end and asserts on `busy`, not on the message.

**The search signs in to nothing.** Apple's catalogue answers to this build's own developer token,
so a user finds their song before being asked for an account — one better than Spotify, where
searching is what triggers the OAuth redirect. It searches `music.storefrontId` rather than a
fixed storefront, because a search against the wrong one returns songs the subscription cannot
play, which is the same class of wrong answer as offering a rate that will not apply.

**The link parser checks `?i=` before the path, and that ordering is the bug it exists to
prevent.** Apple's share sheet copies an _album_ URL with the song hanging off it as a query
parameter, which is the form nearly everybody will paste — and the album id in the path is a
perfectly valid id, so a parser reading the path first attaches the album's opening track for
every share link Apple produces. Silently, and only wrong for songs that are not track one.

**The attribution is Apple's own `Listen on Apple Music` lockup, and every part of how it is drawn
comes from a rule rather than a preference.** Spotify's glyph is one flat shape in one fixed green,
so `.media-attribution__spotify` can draw it from a path and spend a literal color on it. Apple's
guidelines say the opposite three times over — use their artwork and never draw one, never remove
the `Listen on` call to action from the badge, never stretch or recolor it — so this is their file,
whole, at its own aspect ratio, with no hover treatment and no `currentColor`. Even the white
lockup keeps Apple's gradient on the note; only the type is white, so there is no monochrome
version of _this_ asset to tint. (There is one of the standalone icon, which is a different
download and would lose the call to action.)

Four things that follow, and two of them are traps:

- **It is an `<img>`, not an inline SVG.** Both files were exported from Illustrator with the same
  `.st0`/`.st1` class names and the same `SVGID_1_` gradient id, so two of them inlined in one
  document collide on both — and a URL reference is also what makes "unmodified" true by
  construction.
- **It is inlined as a data URI, by an exception in `vite.config.ts`.** Apple's lockups are ~7.5KB
  each because Illustrator exported them, over Vite's 4096-byte `assetsInlineLimit`, so they
  shipped as separate files and the badge visibly popped in a moment after a song attached — a
  request that only starts when the element mounts, which is exactly when the user is looking at
  that row. The obvious fix, minifying the files, is the one thing the guidelines forbid; a data
  URI is byte-for-byte the same file. It is the function form of the option rather than a raised
  global limit, because this is one exception with a reason and not a new threshold.
- **`<picture>` with a `prefers-color-scheme` `<source>`**, not a theme value read in Svelte. The
  theme here _is_ that media query, and this way the browser fetches exactly one of the two files.
- **The aspect ratio is declared in CSS, not in `width`/`height` attributes.** Those are parsed as
  integers, so the artwork's 125.1 × 27.78 rounds to 125 × 28 and squeezes the badge by 0.9%
  horizontally — invisible, and still exactly the stretching the guidelines name.
  `MediaStrip.svelte.test.ts` measures the rendered box rather than trusting the rule.
- **It is 21px tall, matching the Spotify mark** rather than the row, so neither attribution costs
  the strip any height — the same constraint the shortcut captions are measured against.

**The cover takes the video's band, and unlike the video it folds.** It is the same slot at the
foot of the right panel, chosen for the same reason: a picture is looked at rather than operated,
so two hundred pixels of it costs a scroll there and would cost the document anywhere else. What
differs is the one control. YouTube's embed terms require their player visible and unobscured, so
a collapse control on that band would be a control for breaking them; Apple asks for attribution —
which this band carries at the foot of the picture, and under the title once it is folded — and
nothing at all about a picture. So this is the one band in the panel a user can take their height
back from.

**The mark is on the picture, and the folded row is why that is safe.** Overlaid on a cover that
could be folded away, a third party's mark would leave the screen while their song was still
playing — so the folded state carries it under the title rather than dropping it with the
artwork.

**The transport is on the picture, and it is the strip's own transport.** Both surfaces render
`MediaTransport.svelte` rather than mirroring three buttons by hand, for the reason the diagnostic
card and its popover share theirs: two copies of three controls is two copies of every label rule,
and `Previous line` appearing on one while the other still said `Back 2 seconds` is drift nobody
notices for months. **They are identical now, and the caption that used to be the one
difference is gone.** The strip printed the one-modifier fallback under each glyph and this surface
deliberately did not; both name themselves through the shared tooltip instead, so there is no legend
on either to differ about — and no `captions` prop, whose only reader this was.

- **It draws on a scrim, and that is not decoration.** What the glyphs read against is somebody
  else's album art, and half the covers in the world are pale — white alone vanishes on a third of
  them. `--color-scrim`, `--color-text-on-scrim` and `--color-control-hover-on-scrim` are therefore
  one value for both schemes, exactly like `--color-backdrop` and for the same reason: the job is
  to read against whatever is there rather than to match a page. They are the only tokens in the
  system that do not follow the scheme, and a literal here instead would be the second palette
  `editor-token-policy.test.ts` exists to prevent.
- **A gradient, not a flat band**, so the picture is given up gradually. A hard edge across a cover
  reads as a second box drawn over it.
- **Plain state, not a `<details>`, and that is a correction.** A disclosure was right while the
  bar was a name and a chevron — the platform owned the state, the keyboard and the semantics for
  free, the way the drafts menu still does. It stopped being right when controls arrived: a
  `<summary>` is one activation target, so every button inside it has to `stopPropagation` or
  pressing play folds the picture away. Three opt-outs from an element's whole reason for existing
  is the element being wrong, not the buttons. Only the chevron toggles now. (The controls ended up
  on the cover rather than in the bar, which would have settled it anyway — but the rule is the one
  to keep.)
- **The chevron points at the content, not along its own travel.** Open points down at the picture
  it opened; closed points up at the bar the picture folded into. That is the reading that survives
  the band being at the _foot_ of a column, where up is where everything else in the panel lives.
- **It opens by default on a laptop and is folded on a phone**, and either way the fold is
  remembered. There the panel is stacked _under_ the editor rather than beside it, so an open cover
  is a square of picture between the document and the findings — the two things a transcriber moves
  between — on the screen with the least room to give it. `isPhoneLayout()` is the same
  `(pointer: coarse) and (max-width: 68rem)` the touch notice fires on, shared rather than written
  out twice, and it is read once at boot rather than watched: a phone does not become a laptop, and
  re-folding a band the user just opened because they rotated the device would be the layout
  overriding an instruction. A stored preference outranks it, because a default decides what to do
  before the user has said anything rather than instead of what they said. Two things would otherwise forget it: the
  band is destroyed whenever the attached source changes, so a flag held in the component resets on
  every swapped song, and a reload starts over. So the controller owns it and the component is told
  — `artworkOpen` / `setArtworkOpen`, written through `getPreference` / `setPreference` on the draft
  repository. **That round trip is the point rather than an accident of where the code sits:** the
  `appMetadata` table is what the workspace backup copies and what `Delete all local data` clears,
  so a preference kept in `localStorage` would quietly escape both promises this application makes
  about local state. It is a generic key/value pair rather than a method each, because the
  alternative is two more methods on that contract every time a control learns to remember itself.
- **The picture is the surface, and the facts sit on it.** Artist at the top left, title at the top
  right, the transport at the bottom left, the mark at the bottom right, and the fold at the end of
  the title's own row. This band used to be a chrome bar with a cover under it — the strip's bar,
  repeated at the foot of the other column — which spent a whole row of the panel's height on two
  facts and one control, above a picture with four unused corners.
- **Each end is a row, not a pair of corners.** Absolutely-placed corners collide the moment an
  artist and a title are both long; a flex row with the ellipsis on both halves cannot.
- **Two scrims, top and bottom, and they are the contrast.** `--color-scrim-ink` is its own token
  now because the two gradients differ only in direction, and two hand-copied `oklch()`s is what
  `--color-backdrop` already exists to prevent. Each end is a gradient rather than a flat fill, so
  the picture is given up gradually and the middle — the part worth looking at — stays clear of
  both.
- **Artist and title are separate facts, not a split string.** `SongDetails` carries both; `name`
  stays the one-line `Artist — Title` a single readout wants. Splitting that back up would be
  parsing a separator this application chose, which works until an artist has an em dash in their
  name. Both catalogue sources have the two fields already, so Spotify reports them too — and the
  tools panel's list therefore gates on the facts _it_ draws rather than on `songDetails` existing,
  or a Spotify song opens an empty `<dl>` under a heading.
- **Folded, the picture scales down to the left** and the row is three columns: the thumbnail, the
  title over the artist centred against it, and the chevron over the mark at the far end. **No
  transport** — the controls under the document are the ones in use while typing, and a second copy
  beside a thumbnail is a row of buttons for a picture nobody is looking at. The title leads here
  and the artist qualifies it, which is the opposite of the order they take on the picture, where
  they are the two ends of one line. The type is a step up from the overlay's: there the text is a
  caption on a picture, here the two lines _are_ the row and have a thumbnail's height to fill. The `<img>` is the _same element_ in both states, which is what makes the fold a
  scale rather than a swap, and `--media-thumb` is read off `--control-height-lg` rather than
  picked. This is the one animation in the band and a deliberate exception to its own rule that the
  fold is instant: what moves is the picture the user just pressed, and it moves to where it is
  going. It is gated on `prefers-reduced-motion: no-preference`, like every other transition here.
- **The name and the mark are said once, and the band is where a catalogue source says them.** The
  strip draws neither — three words twice on one screen, in the row with least space for them.
- **The hand-off is `drawsCoverBand(sourceKind)`, and it is one function because it is one
  decision.** The panel asks it whether to draw the band and the strip asks it whether to name the
  song itself; two conditions for that would put the title in both rows or in neither.
- **It answers on the kind, and the band gates the picture rather than the other way round.** This
  is a correction, and the version it replaces looked reasonable: the band waited on the cover, on
  the grounds that drawing at `sourceKind === 'apple'` would put a square of empty chrome on screen
  for the round trip the catalogue read takes. What that missed is that a song is _named_ the
  moment it attaches — so the name and the badge sat in the transport strip for the length of the
  read and then jumped down here, which reads as a glitch rather than as a hand-off. **Before the
  cover lands the band draws in the shape it would fold into**, with no thumbnail slot at all —
  reserving an empty square would be a hole in the row for a picture that may never come — so the
  picture arrives into a layout that was already standing and the stage grows in place. The fold
  control waits for the picture too: a control that folds a stage which is not there is a press
  that appears to do nothing.
- **One `MediaAttribution.svelte` for both marks and both surfaces.** The mark travels with the
  name, so it is rendered by the band for a catalogue source and by the strip for anything else;
  two copies of that markup would be two copies of every guideline rule above, and the copy that
  drifted would be the one nobody is looking at.
- **`artwork` is on the transport, not on the Apple source**, because a cover is a fact about what
  is playing and the panel drawing it should not have to know which of four things is playing.
  Sources with no picture simply never call `artworkChanged`, which is every source but this one
  today. It is cleared in `beginAttachment` rather than after the load, or the outgoing song's
  cover sits over the incoming one for as long as its metadata takes.
- **Apple's `artwork.url` is a template, not an address** — `{w}` and `{h}` are still in it, and
  passed through unresolved the panel draws a broken image. The size is chosen in `media-apple.ts`
  at roughly twice the panel's narrowest width, because the CDN renders whatever is asked for and
  the alternative is every surface picking its own.

### The song names the draft, but only while nothing else has

Attaching audio to a fresh draft says what the transcription is _of_, and that is nearly always
what it should be called — so a draft still carrying `Untitled transcription` takes the source's own name.
That placeholder is the whole of the condition: a title the user typed, or one an earlier source
already supplied, is a decision, and a later attachment must not overwrite it.

**What counts as a name worth having is decided in the media store, not in the workbench**, because
that is the one place that can tell. Two kinds of name would be actively worse than nothing:

- **A pasted link is its own URL until the catalogue answers.** A draft called
  `music.apple.com/song/1091453645` is worse than one called nothing, so `adoptVideo`, `adoptTrack`
  and `adoptSong` compare against the provisional label they would have minted and stay quiet when
  it matches. The late `named` from the source arrives through the same hook, so a link paste still
  gets its title a moment later — which is the whole reason the suggestion is a stream rather than
  one call at attach time.
- **A filename is not reliably a title.** `Snøfall.mp3` is a fine one;
  `Artist - Album (2011 Remaster) [FLAC 24-96] - 07 - Title.mp3` is a rip's bookkeeping, and there
  is no way to tell them apart except by how much of it there is. Over `longestFilenameTitle` is
  left alone rather than guessed at — an `Untitled transcription` the user renames beats a title they have
  to clear first. The extension always goes: that is a fact about a file on a disk, not the name of
  a transcription.

`DEFAULT_DRAFT_TITLE` is exported from `draft-repository.ts` and compared against rather than
spelled out. It had been written by hand in four places, which is one edit away from a rule that
silently stops matching.

**No schema bump.** `source` gains `'apple'` and `songId` is unindexed, so the live `version(2)`
`mediaHandles` table takes both without a migration — and `songId` is its own field rather than a
reused `videoId` or `trackId` for the reason the Spotify section already gives. `backup.ts`
validates the source against a set now rather than a chain of inequalities, because a fourth
member made the chain long enough to read wrong.

**Unverified, and worth knowing before trusting it:** whether `playbackRate` holds on a
DRM-protected full track as opposed to on a preview. Apple documents the property and says nothing
about that, and native MusicKit shipped `playbackRate` broken on iOS 15.4 — so Apple is
demonstrably sloppy in this exact corner. Everything above is worth the membership only if the
rate is real; if it turns out not to be, `rates` in `media-player.svelte.ts`'s `apple()` factory
narrows to `[1]` and the picker's meta line gains Spotify's third fact.

Implementation: `src/lib/ui/state/media-apple.ts` (the loader, the token rules, the parser, the
search and the source), `scripts/apple-music-token.mjs`, and `media-apple.test.ts`, whose stub
MusicKit is what makes "attaching plays nothing" an assertion rather than a hope.

### The cover is one fact, drawn in one place and saved in another

Three of the four sources know what the song looks like, and each one already had it in
hand: Apple's catalogue read resolves an artwork template, Spotify's `/tracks/{id}` — the same
read that pays for the name — carries `album.images` widest-first, and a video's still is derived
from its id (`youtubeThumbnailUrl`, `hqdefault` rather than `maxresdefault`, because the latter is
a 404 for any video whose uploader supplied no frame that big and the browser draws a 404 as a
broken picture). None of them costs a request that was not already being made. A local file
publishes nothing, and that is not a gap to fill: reading cover art out of an ID3 frame is a tag
parser this application has no other use for.

**`player.artwork` is that one fact, and the two surfaces read it rather than the source kind.**
The panel's cover band already waited on the picture instead of on `sourceKind === 'apple'`; the
one thing it now has to say about a kind is that a **video does not get one**, because the video's
own player is already drawing that still directly above it and two bands showing one frame is the
same thing twice.

**Saving it is in the tools panel, because it is not part of transcribing.** It is a thing a
transcriber wants once, on the way out, next to `Export .txt` — not a control in the shortest row
in the window, which has no pixel to spare and is operated constantly.

**It shares a section with the video's link, because they are one job.** `Song metadata` is
everything the workbench happens to know about the attached song that is not the words, in the
forms somebody filling in a song page elsewhere has to paste: the cover, the watch URL derived
from the `videoId` the draft already stores, and the catalogue's own facts about the recording.
**Each of them draws only where its own fact exists** — a Spotify track has a cover and no link, a
local file has neither and the heading itself goes. No press contacts anyone: the cover's address
arrived with the song, the link is arithmetic on an id, and the facts came in on the read that was
already paying for the name.

**And it leads the panel**, because it is the only section there that is about the song in front of
the user rather than about the application — everything under it is a setting, a backup, or a way
out. A section that comes and goes has to lead or it lands somewhere different on every draft.

**Those facts are a `<dl>` and not a copied block**, because they go into separate fields on
whatever page they are being typed into — one string holding all of them would only have to be
taken apart again by hand. **The grid is on the list, and the row wrappers are `display:
contents`**: `.metadata-list` began as a `space-between` flex row per pair, which works only while
every value is a version number, and the first real one — three songwriters — wrapped back flush
against its own term and read as `WritersTigergutt101`. Pushing two ends apart is not the same as
putting space between them. The hairline under each row went at the same time: a rule between two
facts of the same kind separates nothing, and five of them turned a short list into a receipt.
`ToolsPanel.svelte.test.ts` measures the boxes rather than trusting the rule, because the failure
it replaces looked exactly like working CSS. `SongDetails` rides the transport beside `artwork`, for the same
reason: it is a fact about what is playing, and the panel listing it should not have to know which
of four sources is playing it. Only Apple fills it; the read asks for **`include=albums`** because
a song carries no label of its own and the album relationship is the only place Apple keeps one —
one request either way.

**Every value in that list is a press, and a writers row is one press per name.** The list exists
to be retyped into fields somewhere else, and the page it is retyped into takes one writer at a
time — so a reader handed four names on one wrapped line has been given the facts and none of the
work, and the gesture they are left with is the one this list is worst at: selecting to a comma
they have to find. The receipt says so in the sentence it already had (`— press one to copy it`),
because a value that is only pressable is a control nobody discovers; the tools panel's copy is
found the way a name in a row is always found here, by underlining under the pointer.

Four things it owes, and the first is what makes it compatible with the rule directly below that a
writer credit is never rewritten:

- **`creditSegments` joins back to the string it was given, byte for byte.** The row goes on
  reading exactly as Apple wrote it and all that changed is where a press lands. That is also the
  whole safety argument for cutting it up at all: a credit split in the wrong place — `Smith, Jr.`
  is the one to worry about — costs a press that copies half a name, in front of a reader who can
  see the boundary because the half they hovered is the half that underlined. A _list_ built on the
  same guess would state a writer who does not exist.
- **Only a credit is cut up**, because it is the only value that is a list. `Bob Marley & The
Wailers` in the artist row is one entity, and splitting it would offer half a band.
- **The confirmation is the copied name in the success color, and nothing is drawn beside it.**
  There was a check at the end of the row and it went: a mark says a second time what the user has
  just pressed and is looking at, and the only place to put one that does not shift the line under
  that press is a slot every row reserves — a permanent indent on six rows for a state showing on
  none of them, which is the complaint the loading mark answers by going in a slot that already had
  a size. The `sr-only` announcement is what carries it for a reader with no pointer. A refused
  clipboard draws nothing at all, exactly as the toolbar's own button says nothing.
- **The row is a flex line with no gap**, so the spacing on it is the credit's own punctuation and
  nothing the stylesheet or the template's indentation added. `SongFacts.svelte.test.ts` measures
  the pieces meeting, because `Kristiansen , Kristofer` is what this looks like when it breaks and
  that looks exactly like working markup.

Three things about it that are the catalogue's limits rather than this code's, and all three cost
a round of disappointment to establish:

- **There are no producers, and there is no way to get them.** Apple's public catalogue has no
  credits resource at all. The Music app's Credits screen — producers, engineers, performers — is
  fed by an endpoint they do not publish, so a producer row here would be one nothing could ever
  fill.
- **Writers are `composerName`, one flat string**, frequently just the lead writer and sometimes
  absent. It is passed through unsplit: a name this application has rewritten is worse than the
  one it was given.
- **The label is the _album's_, and the album is whichever release the song sits on.** For
  "Bohemian Rhapsody" that is a 2000 compilation on Hollywood Records while the song's own
  `releaseDate` is correctly 1975-10-31 — the two disagree inside one response. What is reported
  is the label of the release being played, which is true, rather than the label of the first
  release, which Apple does not say.

A field the catalogue does not carry is **left out rather than emptied**, and a song with none of
them reports `undefined` rather than an empty object, so a list of these is a list of things that
are actually known.

**Going the other way — a name to a YouTube URL — is a link to a search the user runs, and the two
lookups it is not are worth writing down so nobody tries them twice.** The Data API's
`search.list` costs 100 quota units against a 10,000/day default, which is ~100 searches a day for
the whole deployed build, shared by every visitor, behind a key inlined in the bundle for anyone
to lift. Odesli (`api.song.link`) is keyless and resolves an Apple or Spotify id correctly, but it
**returns no `youtube` entry in `linksByPlatform`** for those inputs — verified against four
songs — and it sends no `Access-Control-Allow-Origin`, so it would need a proxy to deliver an
answer it does not have. What is left is the search running where it is free: in the user's own
browser, on Google's own page, with the video they pick pasted back into the field it opened
under.

So the picker's YouTube section carries `Search YouTube for “…”` beneath its line of facts, and
three things about it:

- **The name is the draft's own title first**, because it is the one a person chose — and for a
  file it is _already_ the cleaned filename, since attaching names an untitled draft after its
  source (`titleFromFilename`). The attached or pending source name is the fallback, and
  `DEFAULT_DRAFT_TITLE` is skipped rather than searched for: a placeholder is not a name.
- **It draws only where there is something to search for**, the rule `availableRates` and
  `spotifyAvailable` both follow. An untitled draft with nothing attached is offered no empty
  query.
- **The `href` is built inline from a literal**, like the Spotify and Apple links in the strip,
  because `svelte/no-navigation-without-resolve` cannot see that a variable holds an external URL.
  A helper returning the whole address fails lint; `youtubeSearchTerm` returns the term instead,
  which the control both shows and encodes.

**The bytes come through `fetch`, and the fallback is the point.** `download` on an anchor is
ignored cross-origin and every cover lives on Apple's, Spotify's or Google's CDN, so an anchor
pointed at one navigates the workbench away instead of saving anything. The half that can be
refused is the fetch — an `<img>` needs no CORS header and a fetch does — so a host may perfectly
well draw the cover in the panel and decline to hand it over here, which is a button that does
nothing at all and would only ever be found on somebody else's infrastructure. `downloadImage`
opens the picture in a tab when that happens: one more press rather than silence.

Implementation: `downloadImage` in `src/lib/ui/clipboard.ts` (with `clipboard.svelte.test.ts`
pinning the fallback), `artworkChanged` in `media-spotify.ts` and `media-youtube.ts`, and the
section in `ToolsPanel.svelte`.

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
- **A command is offered once, and the section sits where its command is wanted.** `Copy lyrics`
  went entirely: the toolbar carries it as the window's one contrast action, and repeating it three
  rows down a panel was a second command for a press the user already has. What is left of
  `Document` is the export, which is a thing a transcriber wants once on the way out — so the
  section moved to the foot of the panel, under `Local data`, and only the rule reference is below
  it. Order sections by how often the reader needs them, not by which one is about the document.

The trailing `.offline-note` went with this, and its CSS hook went with it: a selector for markup
nothing renders is the same drift as a fallback color for a token nothing defines.

`ToolsPanel.svelte.test.ts` asserts the heading list in order, the single action row, and the
_absence_ of any audio control or second `Copy lyrics` — re-adding either here is the specific
regression that made the panel messy the first time.

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

**And the uninvited surface does not take the focus**, which is the same rule applied to the caret
rather than to the announcement, and it shipped wrong for a long time. The card focused its first
chip on mount however it had been opened — so a double-click, which is how anybody selects a word
they are about to type over, pulled the caret out of the document a settle later. The replacement
keystroke then landed on the roster, where nothing is bound to a letter, and did nothing at all;
the way back was a _second_ double-click, which only worked because the press outside dismissed
the card first and the dismissal then suppressed its own reopening. Two gestures to replace a
word, in the editor's most common one.

`takesFocus` on the performer overlay is that distinction, and it is deliberately the same flag
name the diagnostic popover already carries for the same split. The two aimed ways in take the
focus, because neither has a pointer behind it to drive the roster with: `Ctrl-Alt-P`, and the
legend action pressed in a diagnostic card — which had already blurred the editor, so there is no
caret there to protect. The pointer-selection path takes `false` and leaves the caret exactly
where the user put it. Typing then retires the card on the next settled anchor, and the character
lands where it was typed, which is the rule sync mode states from the other end.

**The `↵` on the action comes off with the focus.** It is a promise about a key, and Enter only
reaches this card while the card holds focus; opened uninvited, Enter belongs to the document and
breaks the line. A glyph naming a key that does something else is worse than no glyph.
`PerformerPicker.svelte.test.ts` pins the pair at both states, and `EditorPane.svelte.test.ts`
pins the whole regression end to end — double-click, then a typed character replacing the word.

`EditorPane.svelte.test.ts` pins all four cases — pointer opens, keyboard does not, programmatic
does not, a header does not — and `transform-boundaries.test.ts` pins the predicate against the
transform's own `blocked` verdicts, so the two cannot drift apart.

**A picked performer is the chip, not a mark added to the end of it.** Selection used to be a check
glyph after the name, which made the chip change _width_ on being pressed — so choosing one voice
shifted every chip after it sideways, in a row the pointer is in the middle of working along. It is
a border and a light fill now, and nothing in the row moves.

The colour is the **performer's own**, because that is what colour means everywhere else here: the
dot on this chip, the bar in the gutter, the name in the legend. A neutral accent would have made
this the one place a voice is chosen without its identity on it, and with two performers picked at
once — which is the ordinary case the section header's legend exists for — the row reads as the two
colours the gutter is about to draw.

**It is not colour carrying the state**, which is the rule this would otherwise break. What
separates the two is a fill against _no_ fill, a lightness difference that survives a greyscale
print; the hue only says which performer. The border leaves `--color-control-border` at the same
time, so there are two cues, exactly as `.filter-chip` carries two for its unpressed state — and
`aria-pressed` was always the carrier for anything that can see neither. `PerformerPicker.svelte.test.ts`
measures the width across a press as well as the two cues, because the width is the part that looks
like working CSS when it breaks.

**The action has a floor under its width, because its label changes underneath the pointer that is
about to press it.** The two-voice flow rewrites that one button three times without the user going
anywhere: `Next` on step one, `Skip` while step two has nobody picked, `Apply` the moment somebody
is. Each is a different width and the button is the last thing in the row, so the card's right edge
stepped in and out while the reader was working along the roster — and the target moved between
deciding to press it and pressing it. `min-width` on `.actions button` is that floor.

It is sized to the widest of those _three_ and not to the widest label the component has.
`Remove formatting` belongs to a different flow, is far wider, and simply exceeds the floor, which
is correct: reserving room for a label this flow never shows would leave the ordinary case sitting
in a hand of empty pill. The test measures the three against each other **and against the floor**,
because three labels that had all outgrown it would still agree with one another while the
`min-width` had silently stopped doing anything.

**`Skip` rather than `Name later`.** The old label was a promise about the future — it said what the
user would do afterwards rather than what the press does now — and at three words it was also the
widest thing this flow ever put in that slot, which is what made the row move in the first place.
The two facts are one fix: the shorter, plainer word is both the better label and the one the floor
can be sized around.

**And `Skip` is not the contrast tier.** It is a real answer — the rest of the section can be named
later — but it is not the one the card is asking for, and the contrast tier is how a surface says
_this is what you came to press_. Left contrast, the loudest control on the card was advertising not
answering the question. It is the bordered middle tier now, so it stays plainly clickable without
being encouraged, and while nobody is picked the card carries **no** contrast action at all — which
is honest rather than a gap, because at that moment there is nothing to press it _for_. The label
and the tier are one derived answer (`actionLabel` and `showsEmptyAnswer`), not the same
three-branch ternary written once in the markup and again in a class: two copies would disagree the
first time a branch moved, and the one that drifted would be the tier, which is invisible in a diff.

**The step is a bar under the question, not four words appended to it.** `· 1 of 2` spent the one
line of this card that asks something on chrome, and it changed the question's width at every step.
The picker takes `step` and `stepCount` instead and draws one stop per step, filled up to the
current one; a prompt that is not part of a flow passes neither and draws no bar.

Three things it owes:

- **The block is floored at the widest question the flow can put in it.** `Who sings this?` and
  `Who sings the rest?` are different lengths and the roster sits directly beside them, so a prompt
  sized to its own text slid every chip along as the flow advanced. Floored, both steps produce the
  same card width — the whole card, both edges, measured across all three states.
- **The bar spans the block rather than the words**, which is what makes it honest: both steps draw
  the same bar in the same place and only the fill moves. Centring the question is what the floor
  buys — a shorter question left-aligned in a wider box reads as indented rather than as centred.
- **The bar is `aria-hidden` and a `sr-only` sentence carries the fact.** A run of empty spans says
  nothing, and `Step 2 of 2` beside it says everything the old suffix did. Described rather than
  hidden, the two would be announced twice — the same split `SourceCitation.svelte` makes, in the
  direction where the visible copy is the second one.

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

### The assistant's transcript follows its own foot, and a scroll up is the end of that

An answer arrives a token at a time, so a transcript that does not follow its own bottom edge
shows the reader the top of a message and leaves them pressing End for the rest of it. The hard
half is the other one: a reader scrolls up to check what was said earlier **while the stream is
still running**, and a follower that reads "the content grew" as "go to the bottom" hauls them out
of the message they are reading several times a second, with no way to win.

So the rule is not about growth. **It is about which way the scroll moved.** Appending to the foot
of a scroller never moves `scrollTop`, so growth cannot look like a scroll — which is what makes
an upward move a safe signal where the distance to the bottom is not. That distance grows with
every token, so a follower reading _it_ unpins itself in the middle of its own answer. A pinned
transcript is therefore unpinned only by the position moving up, and an unpinned one re-pins only
by reaching the foot, because arriving there is the one gesture that plainly means "I am caught
up".

**One race remains, and it is the one that actually loses somebody's place.** A wheel updates
`scrollTop` at once, but its `scroll` event is dispatched at the top of the next frame — so a
chunk landing in between is followed while the module still believes it is pinned, and the
reader's scroll is eaten with nothing on screen to say so. Two things close it, and both are
needed because neither is true on every frame. The follow is deferred to a
`requestAnimationFrame`, which the frame's specified ordering runs _after_ the scroll steps. And
the pointer gestures are read for intent directly — `wheel` upward, a touch drag downward — which
unpins before the scroll has happened at all. The scroll is instant and never smooth, for sync
mode's reason: a smooth scroll started on one chunk is still animating when the next arrives.

**The way back is a gesture that already exists, and no control was added for it.** Asking a
question is a request to see the answer to it, and switching conversations is a request to see
another transcript — both `pin()`, and both are things the reader was going to press anyway. A
`Jump to latest` button would be a second control for a press already on the surface, over a
transcript the reader can simply scroll; if one is ever wanted, it reads its state from `pinned`
and from nothing else, the way the editor's search toggle reads its own.

`stickToBottom()` is a shared attachment beside `dismissOnOutside` rather than a handler in the
component, because the rule is the same wherever a surface streams into a scroller and the copy
that drifted would be the one nobody is watching.
`src/lib/interaction/stick-to-bottom.svelte.test.ts` drives it against a real scroll port — every
assertion is about `scrollTop` and about the frame something moved in, neither of which exists
under a simulated DOM — and `AssistantPanel.svelte.test.ts` pins the wiring, which is the half
that goes missing silently when the transcript's markup is rearranged.

Implementation: `src/lib/interaction/stick-to-bottom.ts` and the transcript in
`src/lib/ui/assistant/AssistantConversation.svelte`, which is shared by the workbench panel and
the modal, so neither surface can acquire a follow of its own.

### The landing page is a composition, and the workbench is the evidence in it

The rest of this system is a tool. The landing page is the one surface nobody operates, read once
by somebody who has never heard of the product, and it is laid out for that rather than for the
compact UI ramp everything else here uses.

**The hero carries the claim and the proof in the same screen.** The previous arrangement reserved
a viewport for four small centred elements — headline, lede, two actions, a line of facts — and
sized itself to leave a peek of the live demo showing underneath, cut off, as the scroll
affordance. That was the right answer to the problem it had, which is that the evidence was below
the fold. The product shot is _in_ the hero now, directly under the actions, so there is nothing
left to peek at and nothing to reserve: `--site-hero-reserved`, the `svh` arithmetic, and the
`32rem` cap are all gone, and with them three measured numbers that had to be re-measured every
time the heading's margins moved.

Four moves, and each answers a way the page failed before:

- **A claim at display size over a lit grid.** `--lp-display` is a marketing ramp of its own, and
  it is not `--font-size-3xl`: that token tops out at 2.5rem because it is sized for a headline
  sitting in a column of prose, and at 2.5rem, alone on a screen, it reads as a heading rather
  than as a claim. Tracking is negative all the way up, because the spacing that keeps 15px UI
  text legible reads as loose at 60px.
- **Section headings name their sections directly.** They stand on their own, without a small
  label, kicker, category, or mono all-caps text above them.
- **Runs of facts are one bordered object with hairlines inside it**, exactly as the linter draws
  a run of diagnostics, and for the same reason: the run is what is separated from the page, and
  the members are separated from each other by the line where they meet. Four bordered cards with
  gaps between them is four boundaries doing one boundary's job.
- **The measure stays narrow even though the page is wide.** `.lp-container` is `--measure-split`
  because what it sizes is an arrangement; every paragraph inside it caps itself again at
  `--measure-prose`. **The measure goes on the heading itself, never on the block around it** —
  `ch` resolves against the element's own font, so a cap set on the wrapper is a cap in _body_
  text, and the display-sized heading inside it then breaks into three short lines in a narrow
  column with half the page empty beside it.

**The floating marks are the notation, not a logo.** The composition this is modelled on floats
the logos of the products it integrates with; this one integrates with nothing, so the equivalent
is the marks a transcriber actually types — `[Verse 1]`, `<i>Blair</i>`, `[?]`, `(Yeah)` — set in
the face the editor sets them in, which says what the tool is about before a word of copy is read.
They are `aria-hidden` and every one is explained in prose further down, so nothing is carried by
them alone.

Two constraints place them, and both are about what a mark must not land on. Sideways: the
headline is centred and `balance`d, so its longest line reaches the middle two thirds of the
container at every width, and the marks sit outside that band — below `64rem` they are removed
outright, because there is no outside left. Downwards: the product shot occupies the bottom half
of the section and nothing may drift over the evidence, so the marks are confined to the top 40%.
A fifth mark reading `[Chorus: Avery & Blair]` was **cut rather than repositioned**: it is the
longest string of the set, so it reached the words at one width and the screenshot at the next.

**The product shot is generated, not taken.** `scripts/render-workbench-shot.mjs` drives the real
workbench in a real browser and screenshots it, for the reason `render-social-preview.mjs` is a
script — a picture taken by hand goes stale the first time a severity color or the toolbar's
arrangement moves, silently, and it is the first thing anybody sees. Four things it owes:

- **The transcription in it is invented, line by line.** This is the one screenshot that must not
  contain a real transcription: it ships in the bundle and on every social card, so anything
  quoted in it is quoted permanently. It is written to be wrong in several ordinary ways at once,
  because a linter showing an empty panel is a picture of nothing happening.
- **It opens a finding**, which puts the card's explanation, its citation and its fix on screen
  _and_ previews that fix in the document as a diff — so both halves of the product are in one
  frame. It presses the panel's leading diagnostic rather than naming a rule, so the shot follows
  `diagnostics/order.ts` instead of pinning it.
- **The viewport is 1280 and not a laptop's full width.** The lyric column is capped at
  `--measure-editor` and left-aligned, so every pixel past the panel is empty document; at 1440 a
  third of the picture was bare canvas, which reads as an application with nothing in it.
- **`reducedMotion: 'reduce'`, and the focus is blurred before the capture.** The wordmark springs
  open on arrival, and a still taken mid-spring catches the brand halfway; a focus ring in a
  photograph reads as a control the reader is being asked to press.

**And that still is now the poster on a loop, because the one thing it could not show is the
thing a visitor came to find out.** A picture of a workbench with findings in it says the product
detects things. It says nothing about whether pressing the buttons _works_ — which is the whole
question somebody has before pasting a transcription into a stranger's website. So the hero is the
run: `render-motion.mjs --hero` films every safe fix landing in one press, then card after card,
then the two choruses linked, then a panel with nothing left to report, then the document rewound
so it can be watched again.

- **The scene is the still's, shared rather than rebuilt.** `prepareHeroScene` in `shot-scene.mjs`
  is the roster, the paste, the rename, the two-step performer assignment, the opened leading card
  and the re-selected phrase; the still is now that function plus a shutter, and the loop is that
  function plus a camera. It runs **twice** in the loop, because the last frame has to be the
  first — which is also what turns the still into a regression test for the refactor: it came out
  byte-identical.
- **Nothing in the run is scripted.** There is no list of rules and no hand-written repair: at each
  step it presses whatever the leading card offers, so the order is `diagnostics/order.ts` and a
  rule that changes its fix changes the film rather than breaking it. The one card that offers no
  fix is `section.unlinked-repeat`, and it is _created by the bulk fix_ — bracketing the two
  written-out `Chorus:` labels is what makes them sections a repeat can be seen between. Its guided
  action is taken, and from there every chorus fix lands in both copies through the link's own
  mirror, so the counter falls by two and four at a time. The feature demonstrates itself in the
  middle of a video about something else.
- **It rewinds by holding the toolbar's Undo, and it stops on the document rather than on a
  count.** A cut back to the start is one frame in which a finished song becomes a broken one,
  which reads as an edit in a picture whose argument is that nothing here is staged. The stop
  condition is line 1 reading `Verse 1:` again — the bulk fix was the run's first edit and
  bracketing that header was the first thing it did, so that string is exactly "the run is undone
  and the performer assignment underneath it is not". Counting presses instead would mean having an
  opinion about whether applying a link that moved no text costs a history entry.
- **The pointer reads before it presses, and the dwell is graded.** Pressed on arrival, fourteen
  buttons at machine speed read as a macro — no frame in which anybody could have decided anything,
  which is the opposite of what a panel of sourced _suggestions_ asks of a transcriber. The first
  card is read whole, the second nearly, and by the third what is left to check is the line that
  changed. Anything with an unfamiliar surface on screen — the bulk strip, the link picker — resets
  to the slow end. That is what makes it 44 seconds; a constant dwell is either a macro or twice
  as long.
- **This one keeps a `poster`, and the performer loop's rule is why rather than an exception.**
  What that rule is about is two media of _different framings_ in one slot: a `<video>` takes its
  ratio from the poster until metadata arrives and from the media after. Here the poster **is**
  frame one, at the same 2560×1640, so there is no ratio to disagree about — and having one matters,
  because this slot is the page's LCP and the still is 316KB against the loop's ~2.6MB.
  `preload="metadata"` keeps the video out of that race, and both no-JavaScript and
  `prefers-reduced-motion` are left looking at exactly the picture this section carried before.
- **It writes no GIF.** A GIF is the sharing copy for a detail shot — a few hundred frames of one
  column, mostly unchanging. This is the whole window, three times the pixels and five times the
  frames, with both halves moving; the result is tens of megabytes. The still is what `README.md`
  points at and is this loop's sharing copy.
- **First and last frame differ by one glyph, and it is the honest one.** The toolbar's Redo is
  disabled at the start and enabled at the end, because the loop really did just undo seventeen
  things. Everything else in the frame is identical, which is worth keeping true — the check is a
  thresholded difference of the two frames.

**The performer section has a shot of its own, from the same script** (`--performers`), and it is
the opposite of the hero's in every deliberate way. It is **portrait**: it stands beside the
section's copy in an `.lp-split` on a desktop rather than under it, so what fills its height is a
whole short song — three legends, the picker over a pointer selection in Verse 2 — and the crop
is sized off the text's real extent rather than the editor column's, because a `.cm-line`'s own
box is the full content width. It is _clean_, because a column of unrelated underlines would
compete with the one thing the picture is about; that includes the apostrophes, which are
typewriter ones on purpose — a curly `we’d` drew a finding whose fix the document-replacement lead
then previewed as a diff in the shot. The selection is the **last line of Verse 2**, because the
picker prefers the space above the selection and anywhere else it covered a section header — a
hidden header reads as a song with a hole in it — and because that puts the roster beside the
section title's reading path instead of near the foot of the image. The script adds the performers through the roster
before pasting, so the legends resolve instead of arriving as unresolved voices, and it dismisses
the roster's confirmation toasts before capturing — a toast in a product shot is a notification
about work the reader never did. There is deliberately no second chorus: two would raise
`section.unlinked-repeat`, a real finding that is not this picture's subject. `.lp-shot--detail`
is the hero frame without the hero's theatre: no tilt and the bloom turned down, because the tilt
is the opening gesture and repeating it down the page turns a device into a tic.

**That shot is now the poster on a loop, and the loop is the section's actual argument.**
`render-performer-motion.mjs` films the same scene one frame at a time — the pointer drags a
phrase, the picker opens, a name is pressed, `Next`, then _both_ names for the rest of the
section, then `Apply`. A still could only assert that the markup is never typed; watching it
written is the whole claim, and the second step takes two performers on purpose, because one name
per step reads as a radio group and leaves a viewer thinking a passage belongs to exactly one
voice. The scene, the song and the phrase come out of **`shot-scene.mjs`**, which both scripts
import, so the picture and the loop cannot drift — the rule `copySectionLinks` is written down
for, applied to a product shot.

Seven things it depends on, and most of them cost a round to find:

- **Frames, not a screen recording.** Playwright's own bundled ffmpeg is built
  `--disable-everything`: no GIF encoder, no `palettegen`, one MJPEG decoder. Screenshotting each
  beat is lossless and makes the timing _declared_ rather than observed, so the loop is identical
  run to run instead of coming out slower on a busy machine. It needs a **real** ffmpeg on the
  path to encode.
- **Run it with `node`, not `bun`.** Bun resolves `playwright-core` out of its own global cache,
  which is routinely a different version from `node_modules` and then demands a browser build that
  was never downloaded.
- **The cursor is ours.** Playwright's mouse moves the page and draws nothing, so an arrow follows
  the same coordinates the real mouse is given. `pointer-events: none` is load-bearing rather than
  tidy: every transient surface here dismisses on an outside `pointerdown` in the capture phase, so
  anything under the pointer that could take a hit would close the picker being filmed.
- **The crop is the union across time, never the opening frame's.** Assigning the phrase writes the
  header's legend, which runs past the longest line the song had before it — so the still's own
  crop, taken from the opening state, cuts the end off the one line the loop exists to produce.
- **The caret is parked at the top before filming.** CodeMirror's active-line wash follows the
  _selection_, and `activeLineHighlighter` never asks whether the view is focused, so blurring does
  not clear it. Left where the paste ends, the loop opens on a band across its last line that
  vanishes on the first drag, which reads as a rendering fault.
- **The pointer rests inside the crop.** Nudged by an offset from wherever `Apply` landed it left
  the frame entirely, and the loop's longest beat ran with no pointer in it — which reads as the
  recording having stopped.
- **A GIF is written beside the WebM and is not what the page plays.** GIF cannot be paused, has no
  poster, and pays for a dark UI full of antialiased text twice over. It is the sharing copy — a
  README, an issue, a post. `diff_mode=rectangle` with `stats_mode=diff` is what keeps it near the
  WebM's size rather than ten times it.

**On the page it is a `<video>` and nothing else — no `poster`, no `<img>` — and it starts when
the section is read rather than when the page loads.**

The poster went because it was a **layout shift**, and the shape of that bug is worth keeping.
A `<video>` takes its intrinsic aspect ratio from the poster until metadata arrives and from the
media afterwards, and these two are framed differently on purpose: the loop's crop is the union
across time, wide enough for the header legend it is about to write, while the still only ever had
to hold the opening state. 1094×1574 against 1202×1572, in a column that gives it 555px, is a box
798px tall that snaps to 726px the moment metadata lands — under the headline, halfway down the
page. **Matching the numbers in `width`/`height` would not have fixed it**, because those were
already the video's; the poster was the thing disagreeing with them. One medium in the slot is the
only arrangement with one aspect ratio in it.

What replaces it is the video's own first frame: `preload="auto"` has `readyState` at 4 before
anything scrolls, so frame one — the unmarked verse the loop opens on — paints exactly where the
still used to be, at the crop that cannot then shift. That is also the whole no-JavaScript story,
and `static/workbench-performers.png` is deleted rather than left unreferenced. `--performers` on
`render-workbench-shot.mjs` still writes it if a still is ever wanted somewhere else.

An `IntersectionObserver` ties the eleven seconds to the reader, because the shot sits most of a
screen below the hero and a loop started at load has run itself out twice before anybody arrives.
It **rewinds on both edges rather than resuming** — the loop opens on an unmarked verse and ends on
a marked one, so met halfway the result arrives before the gesture that produced it, and a section
scrolled past is left on the state it rests on rather than frozen mid-gesture. It pauses on the way
out, and `prefers-reduced-motion` keeps it on frame one entirely, which is the same argument in the
medium this page used before.

`layout-shift` entries are the check, not the reasoning: with the poster gone the box is 726px from
attach through playback, and no shift entry names the `VIDEO`.

**It carries no play/pause control, which is a decision and not an oversight.** A loop over five
seconds that starts on its own is the one thing a pause control exists for, and the reduced-motion
gate is what stands in for it here. A control was built and taken out: on a marketing shot it is a
button parked permanently over the evidence, and the earlier version of it also shipped the exact
desync the editor's search toggle has a rule about — the label was written from `play()`'s promise,
which resolves when playback is _permitted_, so it read `Pause` over a video that had never drawn a
frame. Anything that restores a control here reads its state from `onplay` / `onpause` and from
nothing else.

**The grammar section is a loop too** (`render-motion.mjs --harper`), and it is the shorter of the
two: the pointer arrives at the underline, the card opens, the fix is pressed, the line is correct
and the underline is gone. Seven seconds. A still could show the open card and stop there; the press
is the half it cannot carry — that the button beside the explanation does what the explanation says.

Two things it taught, and the second is the one that will be re-broken:

- **It opens with its fix already previewed as a diff, and that is the product rather than a
  leftover.** `DiagnosticList` expands the leading card whenever nothing else has been chosen — "so
  the panel is never a wall of closed rows" — and an expanded card previews its fix in the document.
  With exactly one finding there is therefore no state in which that card is closed: moving the
  caret, pressing `Escape` and switching the panel's tab were all tried, and the diff survives each,
  because none of them is a _different_ diagnostic to lead with. So the loop opens the way the
  workbench opens, and what the hover adds is the half a diff cannot carry.
- **The document's length must not silence applicable Harper findings.** Lyrics carry no terminal
  punctuation, so a transcription reads to a proofreader as one enormous run-on sentence. Measured:
  7 lines and 198 characters reported the `I has` agreement; 8 lines and 225 reported nothing; 7
  _longer_ lines at 372 characters also reported nothing. It was not a timing race — a twelve-second
  wait changed nothing — and no error reached the console.

  Harper had not stopped finding the agreement. Past its sentence-length threshold it also produced
  one document-wide `Readability` finding, and `dedup: true` removed every finding overlapping that
  span before returning. LyricLint then correctly dropped the prose-only readability result and was
  left with zero. The provider asks Harper for the un-deduplicated set now, removes findings that do
  not apply to lyrics, and only then removes overlaps among the survivors. `harper.test.ts` drives
  the real WASM above 200 characters so the ordering cannot regress behind a mock. The filming
  script still asserts exactly one finding before it moves the pointer; a changed scene must fail
  loudly rather than record a pointer hovering over text with nothing to say.

Its document was lengthened to seven lines all the same, because the loop's crop is the union across
time and has to hold a card that is only open for half of it — at four lines the frames either side
were two thirds empty editor, which reads as a document that has run out rather than one being
worked on. The extra lines sit behind the card while it is open and fill the frame once it closes.

**Both loops share one `autoplayInView` attachment** rather than a bound element and an `onMount`
each. A rule written per video is a rule that gets copied, and the copy that drifted would be the
one nobody is scrolled to.

**The still it replaced** (`render-workbench-shot.mjs --harper`) replaced a hand-drawn `<pre>`
mock-up of the same card — which is the drift a generated shot exists to prevent: the mock's
wording, marks and layout were already three releases behind the popover it imitated. The script
hovers the flagged word the way a reader does (through `HoverIntent`, so the pointer arrives and
stays) and captures the popover with the fix previewed as a diff in the line, the Harper citation,
and the advisory explanation — the section's own argument in the product's own words. Its document
is four lines with exactly one finding, so the card is most of the picture.

The frame states the image's aspect ratio and the image fills it, or the page reflows by several
hundred pixels when the PNG lands — directly under the headline, which is the worst place on the
site for the layout to move. **The border is inside the radius, drawn by the same element that
clips**, which is the rule `.site-demo` already states at length. And **the glow is behind the
frame rather than on it**: a shadow alone under a near-black screenshot on a near-black page is
invisible, so what separates the two is an accent-tinted bloom cast onto the page from behind the
frame's own edges, which is also what makes the shot read as lit.

**The hero asks for one press, so it draws one button.** The Guidelines are a quiet text link
_under_ the contrast action, not a second button beside it: two buttons of equal weight at the
head of the page are two answers to "what do I do now", asked of a reader who has read nothing
yet. The closing CTA is the other way round on purpose — by then the argument has been made, both
destinations are earned, and the pair sits side by side (`.lp-cta__actions`). Below `32rem` that
pair becomes a column, at one width, because two centred buttons of unequal width stacked on each
other read as a row that broke rather than as a column that was meant; the hero's actions are
already a column at every width.

Implementation: `src/lib/ui/styles/landing.css` (the whole system),
`src/routes/(site)/+page.svelte`, and `scripts/render-workbench-shot.mjs`. `.site-meta__fact`
survives in `site.css` because three surfaces draw a meta line, not one.

### The marketing site pins its scheme, and pinning one is not a handful of overrides

The workbench follows `prefers-color-scheme`, because it is a tool somebody sits in front of for
an hour in whatever light they are in. The site does not. Its whole composition — a lit grid
behind the headline, marks floating over it, a screenshot that reads as a screen standing in the
page — is a dark composition, and rendered light none of it is merely paler: the glow has nothing
to glow against and the shot becomes a rectangle of night stapled to a white page. So `.site`
declares a complete palette and `color-scheme: dark`, and it is the one surface in the system that
does.

**It is a complete palette rather than a few overrides, and it has to be**, because a visitor in
light mode gets none of `tokens.css`'s dark block, and the live demo mounts the real editor inside
this subtree — severity underlines, performer bars, selection, and every fill the diagnostic card
uses all resolve there.

**What it pins is the workbench's own dark scheme, value for value.** It used to be a second
palette: deeper surfaces of the site's own, on the reasoning that a landing page wants contrast
under a display headline where a workbench wants a document somebody can live in. Read one after
the other that was two products — pressing `Open the workbench` lifted every surface in the window
four points of lightness, including the masthead `site.css` goes to some trouble to draw at
_exactly_ the document toolbar's height, so the band arrived a different colour than the band it
was matched to. It was never wrong enough to catch in a screenshot and always wrong in the
transition. The site's numbers won, because they are the ones a composition is built on and
nothing in the workbench was built on the four points it gives up; `tokens.css` states them for
both schemes now, and the ramp is the same shape it was — canvas to paper is still 4.5 points, so
a diagnostic card sits the same distance above the column behind it.

**`--color-chrome` is the one token that re-anchors rather than moving.** It is
`var(--color-fill-subtle)` in light, which puts a band one step from the paper toward the ink; in
dark it is its own value _between_ the canvas and the paper, so the bands read as the window the
document is mounted in rather than as a surface above it. What that costs is the step from a chrome
band to the canvas, 8.5 points down to 2.5 — and the bulk-fix strip reads that step, because it
hangs over a run of cards whose selected member drops to `--color-canvas` and it was made chrome
precisely so it would not be taken for one. The hairline along its bottom edge is what carries it
now (`.linter-panel__bulk` and `__filters` in `linter.css`), which is how the site's own header is
told apart from the hero it sits on. **Do not take that border off.**

The product colors — severity, accent, focus, the performer identities — were always shared, because
they are what the demo is a demonstration _of_, and a page showing a different amber for a warning
than the tool does would be misreporting the thing it is selling.

**The derived tokens have to be restated, and leaving them out looks exactly like working CSS.**
This is the part worth remembering. A custom property is inherited as its _substituted_ value:
`--color-control: var(--color-surface)` is declared on `:root`, so it resolves against `:root`'s
own `--color-surface` — the light one — and what reaches `.site` is already a colour. Overriding
`--color-surface` further down the tree does not reach back and change it. The app's own dark
scheme never meets this because it redeclares the anchors on `:root` too, where every derivation
re-substitutes for free.

The failure is silent and partial: the page renders, most of it is right, and a handful of
surfaces keep light-mode values. It shipped exactly once, as a near-white light-mode fill under
near-white dark-mode text, which made `Browse the rules` beside the hero's contrast action
invisible.

`site-palette.test.ts` is the guard, and it **walks the derivation graph** rather than trusting the
list in `site.css` to stay complete: every token the dark scheme moves is restated, and so is
every token that reaches one of those through any chain of `var()` references. It then asserts the
two blocks **state the same value** for every token both declare, which is what stops a retune of
either one from quietly re-creating the second palette. It deliberately does _not_ assert that a
restated derivation still points at the same base — `--color-chrome` is `var(--color-fill-subtle)`
at `:root` and its own value in dark, so the text of the two declarations differs where the
rendered colour does not. What a token owes is to be declared at all: declared, it is a decision
either way; missing, it is silently the light theme's.

One thing that test had to learn about this repository: **it strips comments before parsing.**
These stylesheets quote the declarations they explain, and the note on `.site` contains the literal
text `--color-control: var(--color-surface)` with no semicolon after it — so a declaration matcher
run over the raw file starts there and swallows everything up to the next `;`, taking the real
declarations in between with it. That is how its first run reported `--color-overlay` missing from
a block that declares it on the line it was pointing at.

Implementation: the `.site` block and `.site::after` in `src/lib/ui/styles/site.css`, and
`src/lib/ui/styles/site-palette.test.ts`.

**The noise film over the page is not decoration.** It is `fixed`, 3% opacity, and never seen as
texture — it is seen as the flat fields under it _not_ banding. This page spends most of its area
on very dark near-neutral surfaces and two large radial gradients, which is precisely the
arrangement an 8-bit-per-channel display draws as visible rings; a fractional dither breaks the
step up. It takes no press, and it sits above the content but below every overlay tier, because a
texture painting over a popover would be the one thing here anybody actually notices.

### On a phone the site header is not a band, and the masthead never underlines

`theme-color` is `--color-canvas`, which means the browser paints the status bar and the safe area
with the **page** color. A header filled with `--color-chrome` therefore met that strip at a seam a
few percent lighter than it, full width, at the very top of the first screen — so the first thing
the page said was that it was two mismatched bands, before it said anything about the product.

Below `46rem` the fill comes off, and the border with it. A band separates pinned chrome from
content moving under it; at this width the header scrolls away with the document like everything
else, so it separates nothing, and a hairline under a band the same color as the page is a rule
drawn across the canvas for no reason. **On a laptop the masthead stays and travels with the
reader** — it is `position: sticky`, its fill is the site's chrome grey, translucent, and a
`backdrop-filter` keeps the type legible once a paragraph or a screenshot scrolls behind it.
Chrome rather than canvas, because what the band sits over is the hero's lit grid, whose hairlines
lift that region a step above bare canvas — a pure-canvas band up there read as a black strip on a
grey field, which is the two-mismatched-bands failure this section opens with, arrived at from the
other direction. Its border is transparent for the same reason a phone's is absent: a hairline
under a band near the colour of the page rules a line across the canvas for nothing.

**Its height is fixed by something outside `site.css` and must not move; its contents align with
the page, not the viewport.** `e2e/lyriclint.spec.ts` asserts that this band is exactly as tall as
the workbench's document toolbar — which is what makes arriving at the tool from here read as the
same window rather than as a second product — and that the wordmark's left edge is the page
container's own gutter (`.site-header__inner`, `--measure-split` plus the `--space-5` every
`.lp-container` carries). A marketing masthead belongs to the column being read; the workbench's
toolbar belongs to the window being operated, which is why the two brands no longer share an x.

The footer keeps its rule and loses its fill at every width — a filled band at the foot of a page
that ends in a call to action is a second surface competing with the last thing the reader is meant
to press, and the hairline already says where the article stops.

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

**The handoff arrives, and the toolbar gives it no room until it does.** The workbench's lockup is
the one the boot screen leaves behind (`entrance="handoff"`), so it draws itself into the toolbar
from the left once the travelling mark has landed. It used to hold its final width from the first
frame and fill that width in place — a hand of empty chrome at the head of the toolbar with the
draft's name already parked to the right of it, which reads as the toolbar waiting for something
rather than as the brand arriving in it. It reserves nothing now, and the name is pushed along at
exactly the rate the word appears.

`--wm-in` is the second registered driver, 0 to 1 across that arrival, and it is spent as a
**width** rather than as a clip: the element takes its own fraction of `--wm-width` and hides the
overflow, so the edge the word is uncovered at and the edge that pushes the name along are the same
edge by construction. Nothing has to agree about a rate, which is `--wm-open`'s own argument applied
to the one gesture that changes the toolbar's layout. Two things it depends on:

- **`--wm-width` is the live sum of the four boxes that draw the lockup**, not a constant for the
  open state, so the fraction is exact at every value of `--wm-open` — the spring's overshoot past
  1 included, and through the contraction that follows the hold. The lead and the brackets take
  their widths from the same custom properties the sum is built from, or the two drift and the
  arrived word is clipped short or trails a gap it never fills.
- **The animation is `both`**, so its delay — the beat the boot lockup is still travelling in — is
  spent at zero width rather than at full.

Both are measured rather than trusted: `AppWordmark.svelte.test.ts` compares the arrived box
against its own parts (by computed width, since the brackets reach past their boxes with a
`scaleX` a client rect would count), and `Workspace.svelte.test.ts` asserts the draft title's left
edge moves right by exactly the width that arrived.

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
in `src/lib/ui/styles/shell.css`. `src/lib/assets/lyriclint-mark.svg` is the static mark and
carries the same geometry — the closed lockup has to keep matching it.

**The favicon is the waveform alone in `#dea645`, and both choices are contrast, not taste.**
There is no tile, and no brackets: at the ~16–18px a tab strip or a search result's chip renders,
brackets and a waveform are three strokes fighting for the same pixels, and the full mark came out
illegible in Google's own results. So the icon is the waveform by itself — the lockup's exact
geometry, not a redrawing — with the `viewBox` cropped to the wave's own bounding box plus half a
unit, which lands its stroke nearly twice as thick at 16px as the full mark managed. The brand's
dark ink is the one thing it may not have, because:

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

### The touch user is told once, beside the workbench rather than in front of it

A phone visitor meets a workbench built for a wide screen and a keyboard, so `touch-notice.ts` says
so on the way in: the lyrics and the findings stack instead of sitting side by side, every fix has
a shortcut they do not have, and it will be quicker on a desktop. It says **everything here works**,
because it does — this is a recommendation, not the gate it replaced.

**It is a toast, and it used to be a modal.** That was out of proportion to what it says. A surface
that dims the window and takes focus is for a question which must be answered before anything else
happens, and this is the opposite of one: nothing here is a decision, there is no second path to
offer, and the workbench behind it works either way. What a phone visitor actually met was a screen
standing between them and the document they had come to open, with a button whose only job was to
take it away again. The toast says the same thing next to the work instead of over it, and retires
itself — so the intrusive part, the part that had to be dismissed before anything could be read,
is gone rather than restyled.

- **It is not a component, because the dialog was the surface.** Markup, styles, a backdrop, a
  focus trap: all of that belonged to the modal. What is left is a rule about when to say
  something, so it is a module in `ui/state/`, and the region that draws it — `ToastRegion`, in the
  `(app)` layout — is already mounted for every other toast in the application. A component that
  rendered nothing and pushed a message on mount would be the old shape kept for its own sake.
- **The message leads with the reassurance**, because it arrives uninvited and the first thing to
  establish is that the visitor has not hit a wall. What follows is the two facts that are actually
  different here, rather than a description of the product they are already looking at. It is one
  sentence: a toast is a `<p>`, and the modal's heading and three paragraphs were only ever
  affordable because the modal had taken the screen.
- **`TOUCH_NOTICE_DURATION` is longer than either toast default**, for two reasons that compound.
  `INFO_TOAST_DURATION` is sized for a confirmation of something the user just did and therefore
  already knows the content of; this is a sentence they have never read. And the countdown pauses
  on hover, which is a gesture a finger does not have — so on the one device this ever appears on,
  the time on screen is the whole of the reading time.
- **It carries no action.** There is nothing to undo and nothing to confirm, and the region's own
  dismiss is the only control such a message needs. It is deliberately not a second `Got it`.
- **It is announced as well as drawn.** The toast region is not a live region, and this is the one
  message in the workbench that arrives without the user having done anything — so a phone visitor
  running a screen reader would otherwise be the only person it is about who never hears it.
  `announce` beside `addToast` is the pattern `commitRoster` already uses.
- **Session-scoped, like the YouTube consent, and remembered on the _showing_.** A warning that has
  been read is noise, and one that is never repeated is a warning the user cannot get back; closing
  the tab forgets it. The dialog could wait for a press because it had to be answered to get out of
  the way; a toast retires itself, so there is no press that means "read" — the X and the countdown
  are the same way out, and gating on either would bring back a notice the user watched go by. A
  browser refusing storage reads as "not seen", which shows it once per load rather than losing it.
- **It still waits for the boot screen, and the page still speaks it**, but the reason has changed
  and the old one is worth keeping straight. As a modal it could not be covered at all: a
  `<dialog>` opened with `showModal()` is in the browser's **top layer**, above every stacking
  context, so **no z-index could have fixed it** and the only repair was for the notice not to
  exist yet. A toast is an ordinary layer and `--layer-boot` outranks `--layer-toast`, so it would
  now simply spend its countdown behind the boot screen and be gone before anyone saw it — a
  quieter failure with the same fix. It is raised from `BootScreen`'s `ondone`, beside the
  `revealed` it sets, because that is page state a layout cannot see. A boot failure never reaches
  it, which is right twice over: there is no workbench behind an error to recommend anything about,
  and spending a session-scoped message on a failed load means never seeing it on the reload that
  works. `e2e/lyriclint.spec.ts` pins the order, because the interaction between a prerendered boot
  screen and a timed message is only observable in a real browser.
- **A coarse pointer _and_ the stacked layout** (`68rem`), not either alone. The pointer alone
  stops a tablet in landscape, where the two-column layout is intact and there is nothing to warn
  about; the width alone stops a narrow window on a laptop, which is a supported size with a
  keyboard behind it.

Implementation: `src/lib/ui/state/touch-notice.ts`, raised from `src/routes/(app)/lint/+page.svelte`
and drawn by the `ToastRegion` in `src/routes/(app)/+layout.svelte`.

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

### The dev tab says which one it is

A workbench tab is named after the draft, which is named after the song — so a dev server and the
deployed build, open on the same transcription, are two tabs carrying the same artist and title
with nothing at a tab's width to tell them apart. `PUBLIC_DEV_TAB_TITLE` is the word that replaces
the pair, `Dev` in `.env.example`, and something more specific where two dev servers are up at
once.

Three things about it:

- **It replaces the whole title rather than prefixing it.** A tab shows the first few characters,
  so a prefix worth having is one that is all that gets read.
- **It is gated on `import.meta.env.DEV` as well as on its own value**, which is a build-time
  constant, so the label cannot reach a production bundle even from an `.env.local` — the hazard
  `.env.example` opens by naming. Unset, the tab is named after the draft exactly as production is.
- **The suite pins it empty in `vite.config.ts`**, beside the Spotify id and the Apple token and
  for the same reason, sharpened: the tests run as a development build, so a developer's own label
  would rename every tab `DocumentTitle` asserts on and the suite would pass on a fresh checkout
  and fail on the machine that had an env file. The test that covers the label stubs it per render,
  which is why the value is read in the component body rather than at module scope.

Implementation: `src/lib/ui/layout/DocumentTitle.svelte`.

### The service worker is an offline snapshot, and it never stands between the user and the network

The worker exists for two promises and nothing else: a workbench somebody opened comes back
offline, and the installed home-screen app does not white-screen without a connection. Its first
version tried to be more than that — cache-first over every same-origin GET, the whole deploy
precached, `skipWaiting` plus `clients.claim` on update — and every one of those choices did harm
the snapshot never required:

- **Registered against the dev server, it broke the dev server.** Every Vite module request went
  through a cache-first worker whose miss path threw, so an ordinary restart or dep re-optimize
  stopped being a retriable network error and became a rejected dynamic import — which the browser
  caches against that module's URL for the life of the document. The tab landed on `+error.svelte`
  and could not route out of it, because the error page's links were client-side navigations asking
  the runtime that had just failed. Both halves are fixed separately: the links carry
  `data-sveltekit-reload`, because a new document with a new module graph is the only thing that
  recovers; and `kit.serviceWorker.register` is off, with the root layout registering the worker
  under `!dev` and **unregistering it under `dev`** — that branch is not tidiness, since a worker
  installed by an earlier build goes on controlling `localhost` until something takes it off.
- **`skipWaiting` was the same poisoning in production.** Activation is when the previous snapshot
  is deleted, and a deploy used to do both mid-session — so a tab still running the old document
  lost the cache its own lazy imports resolved from, on a host that no longer serves the old hashed
  filenames. The worker now waits until no page from the previous version is open anywhere, which
  is when deleting the old cache can no longer break a live document.
- **Cache-first navigations pinned every visitor to the deploy their worker had snapshotted.**
  Navigations are network-first now (with navigation preload, so the worker's own startup is not a
  tax on every page load), which is also what makes waiting free: the site is current the moment it
  is deployed, worker or no. **The worker's version decides nothing about freshness — it is only
  how good the offline copy is.**
- **Precaching the whole deploy made install the most expensive thing the application did.**
  ~8.5MB per visitor, and again in full on every deploy, because the cache key is a per-build
  timestamp and nothing was carried over — although the 1.5MB immutable bundle is content-addressed
  and by definition unchanged. ~6MB of it was the ~57 prerendered rule reference pages, which most
  sessions never open. The precache is now `/`, `/lint/`, the static files, and the non-wasm
  immutable assets; install **copies immutable assets forward** from the previous version's cache
  instead of refetching them; a rules page joins the snapshot by being read, because the navigation
  strategy writes what it serves. The Harper wasm keeps its exclusion — 18MB cached the first time
  the workbench actually loads it — and the motion loop's `.gif` is excluded in `vite.config.ts`,
  since it is the sharing copy and no page references it.

What is left is three strategies, chosen by what a URL can honestly promise, and **anything
matching none of them is not intercepted at all** — failing open is the rule the dev incident
taught, because a worker that proxies traffic it has no strategy for turns somebody else's
transient failure into its own permanent one. A hashed build asset is cache-first forever and
cached on sight from the network; that self-heal is what lets an old worker serve a newer deploy's
page, whose new chunks miss the old snapshot, arrive from the network, and join it. A navigation
is network-first, falls back to its cached copy (then the `/` shell) when the network cannot
answer, and treats a 5xx as an outage worth answering from the snapshot — a 404 is answered
truthfully. A static or prerendered URL can change between deploys, so it is served from this
version's snapshot and never written outside install, except by a navigation landing fresh markup
over its own stale copy.

**A hotfix reaches a long-lived tab on its own next navigation, and nothing is drawn to ask for
it.** The strategies above make every full-page load fresh — but a client-side navigation reuses
the running app, stale code included, so a tab that only ever routed client-side could carry a
superseded build for as long as it stayed open. `kit.version.pollInterval` in `vite.config.ts`
polls `_app/version.json` once a minute, and the root layout's `beforeNavigate` turns the first
navigation after a deploy into a full-page one (`location.href`), which the network-first strategy
then answers with the new build. Three things it depends on:

- **Neither cache layer can pin the poll.** SvelteKit sends it with its own `no-cache` headers,
  which is what keeps Safari's HTTP cache out of it, and `_app/version.json` matches none of the
  worker's three strategies, so it falls open to the network. A worker strategy added later that
  swallows that URL re-opens the exact staleness this exists to close.
- **It is silent on purpose.** Drafts autosave, so the full-page navigation costs nothing the user
  can see, and an "update available" toast would be a control for a press the user's own next
  gesture already makes — the same reason the save readout draws nothing while saving is going
  well. `willUnload` navigations are already leaving the document, so they are left alone.
- **It upgrades on a gesture, never mid-session.** A tab that never navigates keeps running the
  build it opened with, which is the deliberate boundary: reloading a document under someone's
  caret is the class of harm the no-`skipWaiting` rule exists to prevent, arrived at from the
  other side.

Two regressions are pinned in `e2e/lyriclint.spec.ts`: the offline reopen (`offline reopen from
cache via the service worker`), and the precache scope with the read-a-rules-page write (`the
offline snapshot precaches the app and admits a rules page when read`). The waiting-not-activating
update path needs two real builds and is verified by hand rather than in the suite — as is the
version-poll upgrade, whose trigger is a deploy happening under an open tab.

Implementation: `src/service-worker.ts`, the registration and the version upgrade in
`src/routes/+layout.svelte`, the `serviceWorker` and `version` options in `vite.config.ts`, and
the reload links in `src/routes/+error.svelte`.

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

## Final responses

At the end of every turn, begin the final response by explaining what the user asked for, then
explain how it was solved. Include enough context that someone returning to the project among
many parallel projects can understand what is going on from the final response alone.

# The shell: toolbar, tab strip, panels, and the surfaces that float over them

Touches: `src/lib/ui/styles/shell.css`, `src/lib/ui/styles/panel.css`,
`src/lib/ui/styles/linter.css`, `src/lib/ui/layout/RightPanel.svelte`,
`src/lib/ui/layout/EditorActions.svelte`, `src/lib/ui/linter/LinterPanel.svelte`,
`src/lib/ui/state/control-tooltip.svelte.ts`, `src/lib/ui/primitives/ControlTooltip.svelte`,
`src/lib/interaction/dismiss.ts`, `src/lib/interaction/stick-to-bottom.ts`,
`src/lib/ui/tools/` (SongPanel/PreferencesPanel — the decision record below predates the
Tools→Song+Preferences split), `src/lib/ui/layout/DocumentTitle.svelte`,
`src/lib/editor/extensions/document-placeholder.ts`

## The rules

- The toolbar spans the whole window and splits on what a control acts on, not on how loud it
  is; the save readout draws nothing while saving is going well (`sr-only` otherwise).
- Diagnostics are inset rounded rows separated by space, without hairlines. Selection is
  depth, not hue: recessed in dark, lifted in light. No accent wash, no accent ring.
  `RightPanel.svelte.test.ts` pins the spacing, shape, and selection treatment.
- The panel background and controls above the findings use `--color-chrome`;
  `--color-canvas` belongs to the selected finding in dark.
- Severity chips draw only the kinds the document has, unasked; a chip's count is over the
  unignored diagnostics and blind to the filters, or hiding a kind deletes the way back to it.
- The editor's command tray (`.editor-actions`) is an absolutely positioned tray over the
  document's top-right, not a band; glyphs are the marks they insert, tooltips carry name +
  keystroke, four glyphs is the ceiling, and only caret-only commands belong in it.
  `Workspace.svelte.test.ts` measures its width and right edge.
- Find/replace runs under the tray: CodeMirror panels get `--layer-editor-panel` (never
  `isolation: isolate` on the host), the row reserves `--editor-actions-reserve`, and the
  magnifier is the visible exit — its pressed state comes from `onSearchOpenChange`, never
  from the press.
- `describeControl`/`ControlTooltip` is the one tooltip: an attachment, never a wrapper; one
  box per application, mounted in `Workspace.svelte`; placement read off the control by
  `placeControlHint`; `aria-hidden` because both facts are already the control's own.
- A control with a keyboard twin names it in that box; only the leading fix names `Mod-.`,
  which answers from the whole window; a control with no twin names nothing. Gutter cells use
  the imperative `showControlHint` pair and disclose only on the caret's own line. Pins:
  `diagnostic-parity.svelte.test.ts`, `line-anchoring.svelte.test.ts`.
- The empty document is one message split across surfaces: ghost transcription in the editor,
  `Paste lyrics` in the toolbar (refusals toast *and* announce via `report`), a waiting panel,
  a silent status bar. `controller.isEmpty` / `canLoadSample` are the single answers;
  `.right-panel__pane` must keep `[hidden]` out of its `display` rule
  (`RightPanel.svelte.test.ts` asserts exactly one pane draws).
- A panel section is a heading over at most two things; a claim is made once, where the
  reader is deciding; a command is offered once. `SongPanel.svelte.test.ts` and
  `PreferencesPanel.svelte.test.ts` pin the heading lists and the absences.
- The grammar-checking section draws only while the document's language is English
  (`isEnglishLanguage`, the same predicate the catalog rules gate on). Harper refuses every
  other language before its download, so under Norwegian the switch would be an answer that
  cannot be carried out. The app-scoped preference keeps its stored value; only the control
  waits. Pinned in `PreferencesPanel.svelte.test.ts`.
- Every transient surface dismisses on `Escape`, its own control, and an outside press — use
  `dismissOnOutside`, never a hand-rolled listener; the callback moves no focus and abandons
  pending state. Dropping the closing control requires naming the visible exit that replaces it.
- The assistant transcript follows its own foot via `stickToBottom()`: unpinned only by an
  upward move (or wheel/touch intent), re-pinned only at the foot; instant scroll, deferred to
  `requestAnimationFrame`. No `Jump to latest` control.
- Moving to a different 'scribe starts the assistant on a blank chat without deleting history;
  loading an earlier conversation is the explicit cross-'scribe path.
- The dev tab title (`PUBLIC_DEV_TAB_TITLE`) replaces the whole title, is gated on
  `import.meta.env.DEV`, and is pinned empty in `vite.config.ts` for the suite.

## Decision record

### A calmer workbench replaces the ruled grid

The workbench now uses chrome as the continuous window background. The document is inset
from the left edge, with rounded top corners, and the panel separates from it by tone rather
than a vertical hairline. The toolbar and status row no longer draw horizontal rules.
Controls take the medium radius within the workspace; this does not change the public site.
The active tab has a filled rounded target and stronger type, replacing its underline.

Findings retain their depth cue but gain an inset, rounded corners, and a gap between rows.
This supersedes the gapless geometry recorded below: repeated findings earn independent
surfaces, while the panel itself has no enclosing border. Filters and bulk commands keep
chrome so they cannot merge with the selected finding, but lose their bottom rules.

The set-aside disclosure remains at the panel foot, with accurate ignored/accepted counts
and restoration focus behavior. A rotating chevron replaces the blue `Show` label; the
whole row is a quiet hover target and `aria-expanded` carries its state. About LyricLint
keeps link semantics and its accessible name but uses a quiet control target, without a
permanent website-style underline; an information glyph identifies the destination.
The desktop panel can grow to 26rem so its tabs and diagnostic prose have breathing room. Pins: `RightPanel.svelte.test.ts`,
`LinterPanel.svelte.test.ts`, and `Workspace.svelte.test.ts`.

The earlier decisions below explain the interaction and depth choices that still hold;
the square seams and connected bands described in their history have been superseded.


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

**Only commands a caret alone can carry out.** `Ctrl-Alt-P` and `Mod-Shift-L` are
deliberately absent: each needs a selection or shared lyrics in an existing link and
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
The transport is one component (`MediaTransport.svelte`), so any surface that draws one gets the
box with it — today that is the strip alone, since the cover band gave up its second transport.

Implementation: `src/lib/ui/state/control-tooltip.svelte.ts` (the store, the placement, the
attachment), `src/lib/ui/primitives/ControlTooltip.svelte`, and `.control-tooltip` in
`overlays.css`.

### A control with a keyboard twin names it, where the press is already aimed

The expert layer was more complete than the UI admitted. `Mod-.` opens the nearest fixable
finding with focus landed on its fix; guided actions have exact keyboard twins
(`Mod-Shift-H`, `Ctrl-Alt-P`); the pending reconnect answers a bare `Escape` —
and none of it appeared in any user-visible string. There is deliberately no legend, no tips system and no
one-shot "did you know" toast to repair that: the pointer crosses these controls on every press,
so the shared box is the disclosure, arriving beside the action at the moment it is being aimed
at — which is a better moment than any toast can buy, and it recurs until the keystroke sticks.
The one removed legend (`F8` and `⌘.` in the status bar) stays removed; this is its function
carried by the box instead of its pixels.

So `describeControl` rides the diagnostic action row — the most-pressed surface in the
workbench, and one component, so the card and the popover cannot disclose differently. Three
rules on it:

- **Only the leading fix names `Mod-.`**, because it is the one that keystroke lands on; an
  alternate wearing the same caption would promise a key that reaches its sibling. And with
  focus already on that control, **the same keystroke applies** — the box over it names `⌘.` as
  the control's own press, so a second `⌘.` that only re-opened the popover was the disclosure
  exposed as a lie by the very keystroke it teaches, and it shipped that way once too. The
  apply is bound on the claimant itself (`applyOnOwnShortcut`), where it also covers the demo;
  the window's listener stands down for a press landing on anything carrying the
  `aria-keyshortcuts` claim, which keeps one implementation of "apply". Pressed repeatedly,
  the chord walks the panel: reach, apply, reach the next.
- **And `Mod-.` answers from the whole window, or the tooltip teaches a lie.** The row that
  teaches it lives in the panel, which is exactly where the caret is not — so as an
  editor-only keymap binding, the keystroke did nothing at the very moment it was being read,
  and it shipped that way once. It is bound beside the editor's window-level `Mod-F` now, same
  gate (`windowFind`, so the landing page's demo opts out of both for the same reason), same
  modal deferral, and it runs the same exported `openAvailableFix` the keymap binds — capture
  plus stopPropagation is what keeps that one implementation rather than two. `Mod-Shift-.` is
  the same chord one modifier up and walks the findings instead, wrapping past the last —
  matched on `event.code`, because `Shift+.` never reports `.` as its key — and it rides the
  same window listener, so it too answers from the panel.
- **The box repeats the visible label on purpose.** The label is the accessible name, the
  keystroke is `aria-keyshortcuts` (added with every disclosure, or the `aria-hidden` box's own
  premise — that both facts are already the control's — goes false), and nothing announces
  twice.
- **`Ignore`, `Fix all N` and `Close` get nothing**, because they have no keystroke and a box
  that only repeated the label would be the label twice, six pixels apart.

**The gutters disclose through the imperative half, and it exists because they must.**
`showControlHint`/`releaseControlHint` are `describeControl` without the listeners: the
timestamp column builds its cells outside Svelte and rebuilds them whenever the playhead
crosses a line, so an attachment's listener pair would be orphaned mid-hover — the hover is
delegated off the gutter instead, and every hint is read off the element's own data, never off
editor state, so a hover cannot disagree with the cell it is over. The cells' native `title`s
went with it (two tooltips for one control is the platform's and ours disagreeing), and a press
hides the box by hand, because a delegated hover has no click listener to do it. What each
control teaches is exact: the timestamp and the anchored line number teach `Ctrl-Alt-Enter`,
the pin teaches `Ctrl-Alt-M`, and the pencil teaches nothing — it opens the ± pair, and
re-stamping is `Ctrl-Alt-M`'s own press, so it names no keystroke it does not perform.

**And the keystroke is named only on the caret's own line, because that is the only line it
acts on.** A cell is any line the pointer happens to cross; `Ctrl-Alt-Enter` and `Ctrl-Alt-M`
act at the caret — so taught on another row, the caption promised "the keystroke that does the
same thing" and delivered an action somewhere the user was not looking, which is exactly how it
was reported. The gate is `.cm-activeLineGutter` read off the cell itself, the same field the
commands answer from, and it also lands the disclosure at the moment it is wanted: the keyboard
flow these keys serve is replay-and-restamp of the line being worked on. None of this touches
the gutter's accessibility posture: the rail is still `aria-hidden` all the way down, and the
box it feeds is `aria-hidden` too.

**A control with no twin names nothing.** `Manage linking` and the `⇄` marker both open the link
picker, and neither has a keystroke to claim — `Mod-Shift-L` belongs to `Type only here` — so
neither carries `aria-keyshortcuts` or a box that would only repeat the label. The marker also
refuses the box for a second reason: a hover there is already serving `HoverIntent` toward
opening the card itself, and a tooltip racing the surface it names would lose to it or cover it.
`Mod-Shift-L` itself is taught where it is answered — the `Type only here` button's own tooltip,
and one sentence in the picker's linked-state note, because a reader looking at an already-linked
group is exactly who wants words of their own in one copy.

**What this deliberately does not do is nudge.** A behavioral tip — "you have pressed this five
times, try `⌘.`" — was considered and refused: touch users have no keyboard, keyboard users
already found the keys, and pointer users hover the button on every press, which is the tooltip's
own moment. The touch notice was re-anchored in the same pass — both of its facts now hang on
the laptop, because the old wording hung "every fix has a keyboard shortcut" on a device that
has no keyboard.

Implementation: the imperative pair in `control-tooltip.svelte.ts`, the row in
`DiagnosticActions.svelte`, the delegated hovers in `extensions/line-anchors.ts` (spread into
`lineNumbers` in `create-editor.ts`), the reconnect control in `MediaStrip.svelte`, and the note
in `SectionLinkPicker.svelte`. The pins are `diagnostic-parity.svelte.test.ts` (the row's twins,
leading fix only), `line-anchoring.svelte.test.ts` (the cells, the numbers, the absence of
titles), `MediaStrip.svelte.test.ts` (the reconnect's `Esc`), and
`section-links.svelte.test.ts` (the picker's sentence).

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

`SongPanel.svelte.test.ts` asserts the heading list in order, the single action row, and the
_absence_ of any audio control or second `Copy lyrics` — re-adding either here is the specific
regression that made the panel messy the first time. (The panel described here was
`ToolsPanel.svelte` at the time; it has since split into `SongPanel.svelte` and
`PreferencesPanel.svelte`, and the pins moved with their sections.)

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

**A different 'scribe starts with no conversation selected.** The assistant state lives above
the workbench so its modal and panel share one transcript, but that lifetime must not make the
last song's conversation the next song's default context. When the workspace registers a new
draft id, the active transcript is cleared while its stored chat remains in Conversations. An
intentional selection from that list may load any earlier conversation against the current
'scribe; that is the cross-reference escape hatch, and it is explicit rather than automatic.
A pending turn is marked interrupted before it is detached, so a late answer or tool decision
cannot land on the replacement draft. `assistant-state.test.ts` pins both the blank transition
and the ability to reload the prior chat.

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

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
background color for the reader to parse. Full-page messages — the phone gate, boot and error
states — are prose on the canvas: constrain the measure with `max-width`, center it, and stop
there.

Canonical implementation: `.small-screen-notice` in `src/lib/ui/styles/responsive.css`.

### The shell is one window, and the linter is one column

The document toolbar spans the whole window, above both columns — the draft's name, its save
state, and the commands that act on the whole document belong to the window, not to the editor
half of it. The right panel's tab strip hangs directly under it, at `--panel-tabs-height` rather
than the toolbar's `--header-height`. Toolbar, tab strip, ignored-rules footer, and status bar
are all `--color-chrome`; the scrolling content between them is not.

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

Implementation: `src/lib/editor/extensions/fix-preview.ts` renders the diff,
`src/lib/core/fix-preview.ts` picks the fix, and `src/lib/diagnostics/DiagnosticActions.svelte`
binds it to its own mounted lifetime — which is the open/close lifetime of whichever surface
rendered it. `leadAfterFix` in `src/lib/ui/state/panel-view.svelte.ts` is the advance, armed by
`applyFix` and consumed on the snapshot that dispatch emits.

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
(`DiagnosticMeta.svelte`). The severity is a colored glyph and a colored word, not a chip. The
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
button holds the message and stretches its hit area over the whole head with an inset `::after`,
the citation and its disclosure ride above that layer with `z-index`, and hover and the focus ring
are read off the head with `:has()` — off the button alone they would light up only the message.

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

### The mark and the wordmark are one object

There is one pair of brackets in the brand, not two. The mark's brackets and the `[Lint]`
brackets were always the same shape drawn twice, so the lockup is a single rig that opens and
closes: closed, the brackets hold the waveform and it _is_ the mark; open, the waveform has
flattened onto the baseline, `Lint` has grown out of that line, and `Lyric` has been uncovered by
the left bracket sweeping right off it. It holds open on load for as long as the word takes to
read — a saccade to land on it, ~400ms for a nine-letter compound, a beat to register it — then
contracts, and reopens on hover or on a press that latches.

**A press is not a hover, and on touch it cannot be faked with one.** Tapping an element that
carries `:hover` styles does apply them, so a tap looks like it opens the lockup — but they stay
applied until the next tap somewhere else, which means a second tap on the lockup changes nothing.
A toggle has to be a real toggle. So the press latches its own state, that latch outranks hover in
both directions (or sticky hover would hold open the thing the second tap just closed), and only a
**mouse** leaving releases it: a touch pointer is destroyed when the finger lifts, so
`pointerleave` fires after every tap and releasing there would undo each press on the frame it
happened.

It is used twice, and the second place is not a toolbar. On the phone gate the lockup is not a
logo above the message but the **first word of the message**: the h1 reads `Lyric[Lint] needs a
bigger screen`, and `role="img"` is what puts `LyricLint` back into the heading's accessible name.
That is also why the component's root is a `span` — a heading takes phrasing content only, and a
flow-content root gets spaced apart from the text beside it during name computation, so the
heading announced as two fragments.

**On the phone gate hover opens nothing** (`responsive.css`) — the press is the whole affordance
there. That surface is `pointer: coarse`, where `:hover` is not a state anyone entered on purpose:
it lands on whatever was tapped last and stays. Left in, it would fight the toggle for the exact
tap the toggle exists to serve.

**The headline also reserves the taller of its two heights**, because the lockup is a word in a
wrapping sentence and opening it can add a line. Left alone that line comes out of the layout and
everything below it climbs; reserving it holds the paragraph still and lets the title drop into
the space its own second line vacated. This is also what kept an earlier hover-driven version from
oscillating — the lockup moved a line up the page, out from under the pointer that opened it — and
it is worth knowing the trap is still there for anything that keys off pointer position here.

The reservation is banded, and the band is measured rather than guessed: below it the sentence
needs two lines in both states, above it one in both, and only in between does the count change.
Outside the band the same `min-height` would be empty space above the headline, which is what a
landscape phone would get. Re-measure the threshold if the copy, the padding, or the display size
changes.

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
  waveform's `vector-effect: non-scaling-stroke` width, both slot widths. The phone gate resizes
  the whole brand with one declaration, and that is the only override it is allowed.

Implementation: `src/lib/ui/layout/AppWordmark.svelte` (state and markup only) and the arithmetic
in `src/lib/ui/styles/shell.css`. `src/lib/assets/lyriclint-mark.svg` and the favicon are the
static mark and are unchanged — the closed lockup has to keep matching them.

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
above it. It is a **colored glyph and a colored word** now (`.severity`, no fill, no border, no
radius), and it leads the card's meta line ahead of the line number:
`⚠ Warning · Line 47 · Use song part headers`. Severity is one more fact about the finding, so it
sits with where the finding is and what says so. The color is the whole signal and it is the
text's own color, which is why the shape question stops arising.

Three button tiers, and no more: `.button--quiet` (borderless) < `.button` (bordered default) <
`.button--contrast` (theme-inverting, one per surface). `.button--primary` is gone — an
accent-filled button competed with the contrast tier for the same job. Pick the tier from what
the action _is_, not from which panel it landed in; if a command appears twice, only its home
surface gets the contrast tier.

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

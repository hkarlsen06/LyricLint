# Touch and small screens: what is supported, refused, and said once

Touches: `src/lib/ui/styles/responsive.css`, `src/lib/ui/layout/LandscapeNotice.svelte`,
`src/lib/ui/state/touch-notice.ts`, `src/app.html`

## The rules

- Below `46rem`, toolbar identity and commands occupy separate rows. Commands retain
  their visible labels and wrap when necessary; no document action clips outside the
  viewport. `Workspace.svelte.test.ts` measures their bounds at 320, 390, and 736px.

- The tool dock becomes horizontal below `78rem`; the editor and panel still stack at
  `68rem`. In the stacked panel, `.right-panel__content` grows with ordinary panes but
  fits the available height for Assistant, preserving its transcript scroll port and
  the media/footer below it. `RightPanel.svelte.test.ts` pins pane layout.
- Expand editor replaces the split with one writing region at every width; Show tools
  restores the selected tool. Hidden panels are removed from layout and the accessibility
  tree while their state and the editor's identity survive. `Workspace.svelte.test.ts`
  measures the extra writing space and focus return at phone and desktop widths.
- The phone is supported upright and refused on its side: `(pointer: coarse) and
  (max-height: 30rem)` hides `.app-shell` (CSS, never `matchMedia` — the app is prerendered)
  and `LandscapeNotice` takes its place. Height *and* coarse pointer, never height alone;
  `e2e/lyriclint.spec.ts` pins both halves. The gate lives in the `(app)` group layout.
- The touch notice is a toast, not a modal: leads with the reassurance, one sentence, no
  action, announced as well as drawn (`announce` beside `addToast`), `TOUCH_NOTICE_DURATION`
  longer than either toast default, session-scoped and remembered on the *showing*. It waits
  for the boot screen (raised from `BootScreen`'s `ondone`; a boot failure never reaches
  it); gated on coarse pointer *and* the stacked layout (`68rem`). Order pinned in
  `e2e/lyriclint.spec.ts`.
- Nothing a finger types into is smaller than 16px: under `(pointer: coarse)` inputs step to
  `--font-size-lg` and the editor moves through `--font-size-editor` (which the landing
  stand-in shares). Never fix this with `maximum-scale=1` — `src/app.html` stays
  `width=device-width, initial-scale=1`. A new field given `--font-size-sm` reintroduces the
  iOS focus-zoom lurch silently.

## Decision record

### The split is a starting point, not a permanent cost

Wrapped lyrics, playback, and a software keyboard compete for a phone's writing space. The
default remains the familiar 3:2 editor/panel split, but the icon-only Expand editor control in the editor tray hides the
panel and gives the editor the remaining height. Desktop uses the same command to gain width.
This is an explicit choice, never an automatic focus-triggered reflow while typing. Show tools
stays in the same tray slot and restores the previous tool. The finding count is in its
accessible name; the icon has no visible text. The tray now holds up to five controls. Neither the editor nor the panel is remounted, and playback stays attached.
Expansion preserves the current left inset; only the available writing area grows. The desktop
inset must not shrink to the phone inset when the panel disappears.
Matching grid tracks animate width on desktop and height when stacked, using the slow motion
token and ease-out curve. The panel becomes inert and leaves the accessibility tree immediately;
visibility hides it when its track finishes collapsing to zero. Reopening reverses the transition
without remounting either surface. Reduced-motion preferences skip the transition.

### The toolbar gives its commands a reachable row

The wider draft title and generous desktop toolbar did not fit a phone: the identity
remained visible while language, Compare, and Copy extended beyond the clipped workspace.
Below `46rem`, identity and commands each get a row. The title absorbs the space between
brand and creation; the command row uses compact padding and retains every text label.
Redundant icons give their width to the words, while Undo and Redo keep their glyphs.
At the smallest widths, commands wrap instead of requiring a hidden sideways scroll.
A failed-save message may wrap too, so a refusal remains visible beside the draft.


### The dock stays reachable in a short desktop window

The desktop tool dock also scrolls vertically when the window is short. Fixed-size targets
must not clip Preferences below the panel; keyboard focus scrolls the tool into view.
`RightPanel.svelte.test.ts` exercises the final tool in a short dock.

### The dock changes direction before the document stacks

A vertical dock is useful only while its labels leave enough room for review prose. It becomes
a horizontal row below `78rem`, before the established `68rem` stacked layout takes over.
Labels remain visible in both arrangements, and Bits UI uses the matching orientation for
arrow-key navigation (owned by `RightPanel.svelte`).

The new content wrapper must inherit the old column's two sizing behaviors: normal panes grow
and the outer panel scrolls, while Assistant fits and its transcript scrolls. Its `:has()`
selectors must reach through that wrapper, or the assistant grows past the media and footer.
The sticky horizontal dock, document inset, and software-keyboard transport remain in place.

### The softened document keeps its inset when stacked

The stacked editor has a small inset on both sides. The panel below it separates by tone
rather than a top hairline; the existing grid, scroll ports, and sticky tabs are unchanged.


### The phone is supported upright and refused on its side

The workbench runs on a phone. The editor and the linter stack (the `68rem` breakpoint), each
scrolls in its own port, every fix has a button, and the transport's own controls are all a
touch user needs for playback — nobody transcribes a song on a phone by keyboard shortcut.

**One orientation is refused, and only one.** Turned sideways there is no height left to divide:
the toolbar and the tab strip are fixed costs, and what remains would be a couple
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


### The player travels as a unit

The keyboard-pinned `.media-strip` includes catalogue identity and playback together,
and publishes that whole height for toast clearance. At phone widths its timing row
wraps below the transport and scrubber; overflow stays within the timing row during
long sync flows. Both pending and loaded controls reserve those two rows, so loading
does not change the control bar's height. The document and panel retain their existing scroll ownership.

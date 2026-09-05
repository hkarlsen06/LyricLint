# Touch and small screens: what is supported, refused, and said once

Touches: `src/lib/ui/styles/responsive.css`, `src/lib/ui/layout/LandscapeNotice.svelte`,
`src/lib/ui/state/touch-notice.ts`, `src/app.html`

## The rules

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

### The softened document keeps its inset when stacked

The stacked editor has a small inset on both sides. The panel below it separates by tone
rather than a top hairline; the existing grid, scroll ports, and sticky tabs are unchanged.


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


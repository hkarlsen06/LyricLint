# The marketing site: the landing composition, its shots and loops, the palette, the brand

Touches: `src/routes/(site)/+page.svelte`, `src/lib/ui/styles/landing.css`,
`src/lib/ui/styles/site.css`, `scripts/render-workbench-shot.mjs`,
`scripts/render-motion.mjs`, `scripts/shot-scene.mjs`,
`src/lib/ui/layout/AppWordmark.svelte`, `src/lib/assets/lyriclint-mark.svg`

## The rules

- The landing page is a composition read once: claim and proof in one screen, `--lp-display`
  is its own marketing ramp, section headings stand alone (no eyebrows), runs of facts are
  one bordered object with hairlines inside, the measure goes on the heading itself. The
  hero's backdrop is bare canvas (no grid, no pattern, no glow — every candidate is in the
  decision record), the shot sits flat with the amber bloom behind it (no tilt), and the
  floating marks are two corrections — a flagged form wearing the editor's wavy underline,
  over the form the linter writes — `aria-hidden`, confined away from the headline band and
  the shot.
- Every product shot is generated (`render-workbench-shot.mjs` / `render-motion.mjs` over
  the shared `shot-scene.mjs` — the still and the loop must not drift). Transcriptions in
  shots are invented; nothing in the hero run is scripted (it presses whatever the leading
  card offers); the rewind stops on the document, not a count.
- Loops are frames encoded by a **real** ffmpeg (Playwright's bundled one decodes almost
  nothing), run with `node` not `bun`, with our own drawn cursor (`pointer-events: none` is
  load-bearing — anything hittable under it dismisses the surface being filmed). Crops are
  the union across time; the caret is parked at the top first.
- The performers loop is a `<video>` and nothing else — no poster, no `<img>`: two media of
  different framings in one slot is a layout shift. `preload="auto"`, rewound on both edges
  by the shared `autoplayInView` attachment, frame one under `prefers-reduced-motion`, no
  play/pause control (any future control reads `onplay`/`onpause` only). The hero loop keeps
  its poster because the poster *is* frame one at the same size.
- Harper loops/shots must keep their scene honest: lyric documents read as run-on sentences,
  and past Harper's length threshold a document-wide `Readability` finding plus `dedup: true`
  swallowed everything — the provider de-dups *after* filtering, pinned against real WASM in
  `harper.test.ts`; the filming script asserts exactly one finding.
- `.site` pins the workbench's own dark scheme value for value — a complete palette, because
  derived tokens inherit substituted values (`--color-control: var(--color-surface)` resolves
  at `:root`). `site-palette.test.ts` walks the derivation graph and strips comments first.
  `--color-chrome` re-anchors; the bulk strip's bottom border carries the chrome/canvas step
  — do not remove it. The noise film is anti-banding, not decoration.
- On a phone the site header loses fill and border below `46rem`; on a laptop it is sticky
  chrome whose height must equal the workbench toolbar's (pinned in `e2e/lyriclint.spec.ts`)
  and whose gutter is the prose gutter. The nav is chrome and does not underline.
  `theme-color` and the top of the page are one decision (`theme-color.test.ts`).
- The demo editor is as tall as its verse: `autoHeight` + `sectionGhosts={false}`; the host
  owns no size and paints nothing; the prerendered stand-in must be the shape the editor
  will be; `autoHeightTheme` wins specificity via `&.cm-editor`.
- The wordmark is one rig driven by `--wm-open` alone (a registered `@property`); nothing
  else transitions (`AppWordmark.svelte.test.ts` asserts it). The landing page parks it open
  (`animated={false}`); the prop is `entrance`, never `intro` (a Svelte mount option). The
  press latches; only a mouse leaving releases. The toolbar handoff spends `--wm-in` as a
  width against the live `--wm-width` sum. Everything is `em`; `ch` is exact because it is
  monospaced.
- The favicon is the waveform alone in `#dea645` — Safari plates any icon under its
  undocumented contrast threshold against the tab bar, `prefers-color-scheme` inside an SVG
  favicon resolves in the wrong context, and a mid-tone picks one scheme (dark won). Never
  resize by rewriting the SVG's attributes; Safari verifies only after clearing website
  data.

## Decision record

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

- **A claim at display size on bare canvas.** `--lp-display` is a marketing ramp of its own, and
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

**The floating marks are corrections now — not notation, and never logos.** The composition this
was modelled on floats the logos of the products it integrates with. The first draft here swapped
the logos for the notation a transcriber types — `[Verse 1]`, `<i>Blair</i>`, `[?]`, `(Yeah)` —
which changed the gesture's content and kept the gesture, and four scattered chips of borrowed
choreography still read as that composition's hero. What floats now is the product's action in
miniature: two chips, each a flagged form wearing the editor's wavy warning underline over the
form the linter writes it as (`Verse 1:` over `[Verse 1]`, `yeah` over `(Yeah)`), set in the
editor's face, muted ink over full ink so the output is the emphasized line. Notation said what
the tool is about; a correction says what it *does*, before a word of copy is read, in the
product's own visual language — the squiggle is a shape cue, so the pairing never rests on color
alone. They are `aria-hidden`, and both corrections are made again in prose and in the live demo
further down, so nothing is carried by them alone.

The backdrop under them has been four things, and the failures are worth keeping because each
candidate is the first thing the next redesign will reach for. The lit grid of hairlines — the
reference composition's field, and the field of every dev-tool landing page of its generation —
went because a grid says infrastructure and this page is about a song. Ruled lines read as a
gimmick. Rows of the brand's waveform, tiled as a mask over `--color-warning`, kept the
template's *texture* with the shape swapped and looked wrong on sight — a patterned field in a
design language that has no patterned fields anywhere. A soft radial wash of the mark's amber was
the last candidate and the same failure from the other side: a glow behind a centred headline is
the other half of the template the grid came from, the atmospheric move every generated landing
page makes. What stands is nothing — the bare canvas the rest of the system is built on, with the
depth carried by the content: the drifting corrections, and the shot below with the bloom that
has a functional job (separating a near-black screenshot from a near-black page). Anything
proposed for this slot has to answer why it is not one of these four again.

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
is the hero frame with the bloom turned down, because repeating the hero's full glow down the
page turns a device into a tic.

**That shot is now the poster on a loop, and the loop is the section's actual argument.**
`render-motion.mjs` films the same scene one frame at a time — the pointer drags a
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
still used to be, at the crop that cannot then shift. That is also the whole no-JavaScript story.
`--performers` on `render-workbench-shot.mjs` still captures the documented still scene, converts
its transient PNG to the shipped `static/workbench-performers.webp`, and removes the intermediate.

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
invisible, so what separates the two is a bloom cast onto the page from behind the frame's own
edges, which is also what makes the shot read as lit. The bloom is the warning-soft amber — the
mark's own hue, the one color this brand claims — where it began as the accent's blue, which lit
the evidence in the default dev-tool color. It earns its place where the hero's backdrop
candidates did not because it is doing separation work, not atmosphere. **And the frame is
flat.** It carried a two-degree backward tilt that straightened under the pointer — the
screen-standing-in-space gesture — but the site header is drawn at exactly the workbench
toolbar's height so that arriving at the tool reads as the same window, and a screenshot hovering
in perspective was the one element in the hero arguing against that. A document meets the page
the way a document does.

**The hero's column is the contrast action over the Discord invite.** The workbench keeps the
page's one contrast tier; the invite under it wears Discord's identity color instead
(`--color-discord`, blurple in both schemes because the livery is theirs, not ours — the
bordered tier's quiet fill disappeared into the hero's canvas next to the contrast action). It
is not a fourth button tier: nothing else may take that fill. The two buttons share one width —
`.lp-hero__actions` is a single centred grid column, so both stretch to the widest label — and
the invite opens a new tab (`target="_blank"`, with an `sr-only` note saying so), because it
leaves the site for an external service. The invite's hero placement is the maintainer's call,
the community door promoted to the first screen. The
Guidelines are a step away as the fact line's first entry (`.site-meta`, beside `Open source`),
not a link of their own between the buttons and the facts. The closing CTA draws its pair after
the argument — by then the argument has been made, both destinations are earned, and the pair
sits side by side (`.lp-cta__actions`): the workbench as the contrast action and the repository
as the bordered one. Below `32rem` that pair becomes a column, at one width, because two centred
buttons of unequal width stacked on each other read as a row that broke rather than as a column
that was meant; the hero's actions are already a column at every width. The community section
above the CTA draws its own bordered pair (`.lp-join`), left-aligned against its copy: the
Discord invite again and a Guidelines button beside it.

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


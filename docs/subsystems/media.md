# The transport: playback, its keys, the strip, and what the song tells the draft

Touches: `src/lib/ui/state/media-player.svelte.ts`, `src/lib/ui/state/media-store.svelte.ts`,
`src/lib/ui/state/media-shortcuts.ts`, `src/lib/ui/state/keyboard-inset.ts`,
`src/lib/ui/media/MediaStrip.svelte`, `src/lib/ui/media/MediaTransport.svelte`,
`src/lib/ui/media/MediaPicker.svelte`,
`src/lib/ui/media/MediaPickerBody.svelte`,
`src/lib/ui/styles/media.css`, `src/lib/persistence/media-repository.ts`,
`src/lib/ui/clipboard.ts`

## The rules

- One transport, four sources behind `MediaSource`; a source reports, it never decides. Every
  rule (resume rewind, clamps, `liveTime()`, run-in cancellation) is written once against the
  interface. `media-test-audio.ts` is the stub both test files drive.
- Nothing draws while there is nothing to control. Attaching is one shared dialog
  behind two state-dependent ways in: the tray's note glyph while nothing is
  attached, the strip's pencil once something is. Each answer inside is a control
  plus a meta line of facts, unboxed.
- Keys: `F7/F8/F9` and platform-modifier `J/K/L` (`Ctrl-` on macOS, `Alt-` elsewhere,
  `Ctrl-Alt-` universal); the reach-for keys are the `Escape` family (bare toggles,
  `Shift+Esc` back, `Alt+Esc` forward) — bubble phase, standing down on `defaultPrevented`
  and on presses targeted inside an open dialog. `Edit this section only` stays active while
  attached audio takes Escape; without audio, that mode can claim Escape to exit.
  A bare `Escape` with nothing attached loads
  the pending source. Only the one-modifier fallback is named on screen, in the shared
  tooltip.
- `bindTransportShortcuts` is window-level, capture phase, physical-key matched
  (`event.code`), and prevents nothing it did not handle; the editor does not know these keys
  exist. Alt-letter bindings never fire on a mac (`Alt-p` history) — the alias tests pin
  existence, not the macOS failure. `keyboard-commands.svelte.test.ts` asserts the triad
  reaches the window from inside the editor.
- A press made before the source is ready is remembered (`playWhenReady`), reported
  (`playing` includes intent, so a second press cancels), cleared by failure, and drawn
  (`player.starting` puts the `LoadingMark` in the glyph's own slot; label stays `Pause`,
  `aria-busy` carries the wait). The loading mark is deliberately scarce: `currentColor`,
  `1em`, slowed not stopped under reduced motion, always in a slot that already had a size.
- Back/forward step between cue points only within `cueStepReach` (10s); beyond that the 2s
  nudge takes over in both directions (`cueBefore`/`cueAfter`, pinned in
  `media-player.test.ts`).
- Catalogue searches return an explicit `attached` outcome for a pasted link. Existing
  source state never decides whether a search should close (`MediaPicker.svelte.test.ts`).
- Side-control labels use the same cue lookup as transport: outside the 10s cue reach they
  name the 2s nudge, even when other lines are timed (`MediaStrip.svelte.test.ts`).
- A replay passage is explicit and session-scoped: Loop, End here, then press the active range to stop.
  It clears on source changes, outside seeks, and sync entry; pausing stays inside the passage
  (`media-player.test.ts`, `MediaStrip.svelte.test.ts`).
- Two defaults do the work: resume backs up 2s (cancelled by deliberate placement) and
  `preservesPitch` is on.
- The player lives in the stable `.workspace-media` sibling of `.editor-region`, on `--color-chrome`. Catalogue song
  identity and attribution sit above the controls in the same surface; the control row
  keeps compact targets on desktop and 44px transport targets on touch devices (`MediaStrip.svelte.test.ts`). On phones,
  Audio explicitly discloses artwork and timing in the existing strip; playback and seek stay visible.
  With a software keyboard up, the whole phone workspace fits the visual viewport and the
  transport stays in flow; task navigation hides until the keyboard is dismissed. Wider layouts retain the `--keyboard-top` fallback (visualViewport
  only — never `window.innerHeight`). `keepFocus` preserves focus on mouse and touch presses.
- The player is an unboxed chrome area with spacing from the editor and footer. Its seek input clears the shared input shadow and hover
  background, so only the track and thumb draw; Play uses the default button tier beside
  quiet step controls. `MediaStrip.svelte.test.ts` pins the scrubber reset.
- Audio and playhead belong to the draft, in the `mediaHandles` table (bytes never stored;
  handle, name, number). The boot draft goes through `openFor` directly; a restored position
  is held until metadata; the hide-flush reads `player.liveTime()`; writes go against
  `ownerDraftId`. `delete`/`deleteAll` clear media in their own transactions.
- The song names the draft only over `DEFAULT_DRAFT_TITLE`, decided in the media store: a
  pasted link's URL and an over-long filename are worse than nothing and stay quiet; the late
  `named` arrives through the same suggestion stream.
- `player.artwork` is the one cover fact; the player identity row draws on the *name*, not the
  picture; a video gets no band (its player already shows the frame). Artwork commands are
  one `ArtworkActions.svelte`; `downloadImage` falls back to opening a tab
  (`clipboard.svelte.test.ts`). Song metadata is a `<dl>` with `display: contents` rows,
  every value a press, credits split by `creditSegments` (joins back byte-for-byte —
  `SongFacts.svelte.test.ts` measures the pieces meeting). A copied value gains a double
  underline and an announcement without moving neighboring values. Clipboard refusal clears
  earlier success feedback and uses the shared visible and announced error report.
- `drawsCoverBand(sourceKind)` decides whether the player has a catalogue identity row; the
  third-party mark travels with the name (`MediaAttribution.svelte`, one component).

## Decision record

### Mobile views share one mounted player

`Workspace` owns `.workspace-media` and `.workspace-video` as siblings of the editor and
panel. On desktop, audio sits under the editor and a 16:9 video (about 356×200px)
always floats at the editor’s bottom-right, including when writing is expanded.
Both editor and video explicitly name grid column 1 so the overlay cannot displace
lyrics into an implicit column. On portrait phones
the active writing, review, or tool region is followed by the video, audio, and view navigation.
Landscape phones place the video beside the active task. A portrait keyboard plus YouTube's
200px video floor may need a scrolling workspace to preserve usable writing height.
Neither media component belongs to a hidden view, so switching Write, Review, and Tools
keeps transport and the YouTube frame visible without rebuilding the player or losing its
playhead. `MobileMedia.svelte.test.ts` pins the frame identity, visibility, minimum dimensions,
and playback across those transitions. `RightPanel` still renders its own video by default
when used independently; Workspace passes `renderVideo={false}` so there is one mount. `DesktopMedia.svelte.test.ts` pins real lyric visibility, the full-height dock,
the desktop overlay's 16:9 bounds, and the same provider through resizing and mobile view switches.

Mobile playback has one compact row for stepping, play/pause, elapsed time, seek, and
Audio. The Audio disclosure uses the shared base button plus its quiet modifier; omitting
the base class let Safari draw a native blue rectangular control. Its expanded details
use separate unboxed rows for speed/loop/follow, timing, and file identity. During sync,
Stop and Tap share a stable row, with optional Skip timed lines below it. Mobile hides
the duration readout and keyboard-only hint; the seek control still exposes total time
in its accessible value. Desktop retains its inline controls and duration.
`MediaStrip.svelte.test.ts` checks the 320px/390px control bounds and sync row arrangement.

The software keyboard now sizes the whole phone workspace. `trackKeyboardInset` publishes
`--visual-viewport-height` from `visualViewport.height` and `--visual-viewport-offset` from
`visualViewport.offsetTop`, alongside the existing bottom-edge `--keyboard-top`. The phone
workspace takes that height and offset; playback remains in its grid row, and the editor
or tool composer receives the space above it. This avoids a transport overlay obscuring the
last lyric lines or a tool's focused field. The inset flag still uses the observed drop
in visual viewport height, resets its baseline on rotation, and polls while the keyboard
is up. The values are cleared together on dismissal and teardown. Wider layouts retain
the original fixed-strip fallback described below.

This supersedes the historical editor-region ownership and phone fixed-strip positioning
recorded below; source state, keyboard detection, and focus preservation remain shared.

### Song identity belongs with playback

The compact catalogue artwork row now lives inside `MediaStrip`, above playback, rather
than beneath the diagnostic panel. Seeing a track on the right and its controls on the
left made them feel unrelated and put the attribution beside Preferences. One player area groups the song, source link, and controls under the lyrics.
It shares window chrome rather than drawing a full-width filled rectangle. Compact bottom
padding separates its controls from footer text. Wide layouts place artwork, song, playback,
and attribution in that order on one row; narrower layouts preserve seek width by stacking them. The pending state
names the song at the row's start, with the pencil immediately to its right, and parks Load at the far end, so the Load
control keeps a stable home instead of sliding with the length of the song's name. It
uses one control row with the same outer padding as loaded playback. Narrow desktop
windows reserve no empty second row: loading grows the strip only when the playback
and timing controls actually wrap. `MediaStrip.svelte.test.ts` checks pending height
and wrapped playback on both sides of the 40rem breakpoint. Equal block padding centers both states in the
space below the editor; a separate top margin previously added to the top padding and
pushed the controls down. Inline clearance inside the controls' scrollport keeps the
outer buttons' shadow rings visible without moving their aligned edges. The whole loaded player settles upward by
`--space-2` over `--duration-slow` with `--ease-out-quart`, leaving its reserved height
intact. Animating the shared strip includes catalogue identity and the Apple Music / Spotify
link, even when the wide artwork layout uses `display: contents`. Animating only the control
row left those siblings snapping into place. `MediaStrip.svelte.test.ts` measures the source
link and playback moving together. The entrance runs on attachment, never on playhead updates
or timing-control changes, and is omitted under reduced motion. The
editor has its own complete rounded edge with a gap above the player. YouTube keeps its
visible video in the sidebar; its minimum frame cannot be charged to the lyric viewport.

The Load audio / Reconnect audio button keeps the full source-specific label for
accessibility and the shortcut hint. Loading occupies the same button with a busy mark,
going quiet while it answers; forgetting the remembered source is the audio dialog's
detach section, the same deliberate press that detaches an attached one.
The loaded catalogue pencil sits immediately to the right of the title and artist, in the identity row at every width, rather than leading playback. `MediaStrip.svelte.test.ts` pins both pencil placements.
No playback controls draw before attachment. Catalogue identity still draws before artwork
arrives, and is rendered once through `MediaArtwork`, preserving its full-size-art dialog.

The audio dialog returns keyboard focus after the attachment state has rendered. If the
original opener disappeared, Workspace supplies the surviving audio control: the strip's
Change audio source after attaching, or the tray's Add audio source after detaching.
The lazy strip and this focus handoff share one import promise before awaiting the
render tick. Separate imports can resolve in different turns, leaving focus on the
body because the handoff ran before the strip mounted. A failed import clears the
shared promise so Retry can load again; focus still stays put if the user moved it.
`Workspace.svelte.test.ts` exercises both transitions through the dialog. Pending controls
keep their visible Load audio / Reconnect audio wording inside the accessible name, with
the song and source following it; the busy label likewise includes Loading….
`MediaStrip.svelte.test.ts` covers those names.

The complete player publishes its measured height for toast clearance. The phone workspace
fits above the software keyboard with playback in flow. On phones, the labelled Audio disclosure reveals artwork,
source changes, speed, looping, follow, and syncing. Playback and seek remain visible while
those secondary controls are collapsed; an active timing run keeps its controls visible.
Expanded timing controls wrap, and the disclosure dismisses on its own control, Escape,
and an outside press. A playback press preserves the caret and leaves disclosure state alone.
`MediaStrip.svelte.test.ts` pins the compact view, touch target size, expansion, dismissal,
and playback after dismissal. Focus retention cancels `mousedown` only, including the
compatibility mouse event from a touch. Cancelling `pointerdown` preserved focus but
suppressed WebKit's activation click: Play stayed Play and the song never started.
The component test pins the uncancelled touch pointerdown, and the real WAV playback
flow in `e2e/mobile-workbench.spec.ts` pins a working Safari tap with the editor still focused.
`MediaStrip.svelte.test.ts` covers attribution before artwork, controls, pending actions,
focus retention, and measured toast clearance. Earlier records below describe the layouts
this arrangement supersedes; source loading, playback, and persistence rules still apply.


### The transport reads as playback controls

The strip shares the window chrome without a top rule. Play takes the default button tier
so the central playback control is easier to find beside the quiet step controls. The seek
input explicitly clears both the shared input shadow and its hover background: inheriting
those paints a second rounded field around the track, making a scrubber look like a text
input. The track and thumb already supply its shape and interaction target; keyboard focus
keeps the shared focus treatment. `MediaStrip.svelte.test.ts` checks the missing field shadow.

### The audio is a transport, and it is never at rest

Nobody opens LyricLint to listen to music. The loop is listen, pause, type, back up, replay, so the
control that matters is the one nobody looks at — and most of the value is in two defaults and three
keys rather than in anything on screen.

**The strip is the second row of `.editor-region`, not a row of the workspace grid.** A workspace
row would run under both columns and shorten the right panel, whose linter pane is a full-height
column with its recent drafts pinned to the foot. Hanging it under the document alone is also the
honest reading: it controls what the document is transcribed from, not the window. The row is
`auto`, so it costs nothing until a file is attached, and it is `--color-chrome` like the toolbar
above it — the bulk-fix strip's lesson, that a row drawn as bare canvas
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

**Attaching opens one question, through two state-dependent ways in.** It sat in the tools panel
first, which meant three tabs away from the document and, worse, split across two commands —
`Attach audio…` and `Use a YouTube video…` — so the user had to know which kind of answer they had
before they could start. It moved to the footer's readout row next, as that row's one exception.
Both are gone now: while nothing is attached the tray's note glyph opens the one shared dialog
(`MediaPicker.svelte`), and once something is — attached or remembered — the strip's pencil
takes over from the row the transport itself draws in. The two never show together, so the
command is still offered once, and neither is a control that vanishes on the press it answers:
the note stands down because the pencil stands up. The answers sit side by side inside a modal.

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

The portable workspace backup has a separate playback budget. Rewriting every lyric in the library
after each five-second position checkpoint made listening alone repeatedly serialize and replace a
multi-megabyte file. Position-only mutations now wait up to 30 seconds for that secondary copy;
the browser's own position record still lands every five seconds. The backup compares only changed
media records with the portable metadata in the last successful backup, excluding position and file
handles. New attachments, source names, detachment, and lyric changes keep the 750ms deadline.
Unknown mutation ranges or failed classification take the ordinary prompt path when necessary.

A pause, ending, or seek asks for that prompt backup after its position write succeeds. Hiding the
tab still flushes the final position and then the complete workspace backup immediately. A clean
flush performs no rewrite, but waits for a write already in flight; failed writes remain dirty for
retry. A restored backup handle starts dirty: the previous session may have failed or been interrupted,
so its first authorized flush refreshes the file even without another edit. Only a successful write
in this session establishes that it is clean. Mutations arriving during a write retain their deadline,
while an explicit flush drains them in order. Portable backups remain complete, coherent JSON snapshots, with no change to primary lyric
autosave or attachment durability. `backup.test.ts` pins the two deadlines, final progress, no-op
flushes, failed-write retry across sessions, and overlapping flushes; `media-store.test.ts` pins the
settled callback after a successful position write.

Implementation: `src/lib/ui/state/media-player.svelte.ts` (the transport and its arithmetic),
`media-store.svelte.ts` (attachment, permission, and the durable position),
`src/lib/ui/media/MediaStrip.svelte`, `src/lib/ui/styles/media.css`, and
`src/lib/persistence/media-repository.ts`. `media-test-audio.ts` is the stub both test files drive —
a real `<audio>` rejects `play()` on a synthetic object URL and ignores `currentTime` until metadata
arrives, so what is under test is the transport's arithmetic rather than the browser's.

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

**Saving it is never in the strip, because it is not part of transcribing.** It is a thing a
transcriber wants once, on the way out — not a control in the shortest row in the window, which
has no pixel to spare and is operated constantly. The two commands it comes to, `Copy image URL`
and `Download album art`, are one component (`ArtworkActions.svelte`), drawn in the Song panel's
metadata section and in the artwork dialog the cover band's thumbnail opens — the two places a
reader is already looking at the picture — so the pair cannot drift between the surfaces that
offer it.

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
`SongPanel.svelte.test.ts` measures the boxes rather than trusting the rule, because the failure
it replaces looked exactly like working CSS. `SongDetails` rides the transport beside `artwork`, for the same
reason: it is a fact about what is playing, and the panel listing it should not have to know which
of four sources is playing it. Only Apple fills it; the read asks for **`include=albums`** because
a song carries no label of its own and the album relationship is the only place Apple keeps one —
one request either way.

**Every value in that list is a press, and a writers row is one press per name.** The list exists
to be retyped into fields somewhere else, and the page it is retyped into takes one writer at a
time — so a reader handed four names on one wrapped line has been given the facts and none of the
work, and the gesture they are left with is the one this list is worst at: selecting to a comma
they have to find. The values live in Song, where each underlines under the pointer and
remains keyboard reachable. Copy lyrics no longer opens an automatic metadata receipt:
its confirmation stays on the existing copy button, and metadata remains on its home surface.

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
- **Copy feedback preserves the row's geometry.** The earlier implementation used success
  color alone and silently ignored clipboard refusal. That behavior is superseded: a double
  underline supplies a visible non-color success cue, and the copied value is announced.
  Refusal clears the success state and produces the shared visible error report and announcement.
  The names and separators keep their positions; no confirmation text is inserted into a credit.
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
section in `SongPanel.svelte`.


The source dialog shares the studio overlay geometry: an unruled header,
spaced source sections, and rounded result hover targets. Source selection and
attachment behavior remain unchanged.

### A search result is not an attachment state

Changing an Apple Music song and searching for another used to close the picker immediately:
the existing source still identified itself as Apple, which the picker treated as proof that
this request had attached a link. Spotify had the same failure. The store now returns
`{ attached: true }` only when the submitted link attaches; ordinary results, including an empty
list, stay in the dialog. Provider catalogue response types remain unchanged because attachment
is the store's job. `MediaPicker.svelte.test.ts` covers replacement searches for both sources.

### Replay a difficult passage without repeatedly navigating back

One persistent repeat control records the live playhead with Loop, then changes to End here.
The user plays or seeks ahead and presses it again to repeat the interval; it stays disabled
until the passage is at least a quarter second long. While choosing the end, a quiet X beside
it cancels the pending start. A live-region instruction and the shared tooltip explain the
next step and name the start time. Once active, the repeat glyph and time range occupy the
button itself, with a pressed state and a Stop loop accessible name and tooltip. Pressing it
removes the interval without pausing. Separate range text and full-width cancel wording
made the short transport grow around a secondary action; the range now earns its space as
the stop control, and the same main button remains mounted through each step.

The shared player owns the repeat, so every source uses the same behavior. It follows source
position events rather than promising sample-accurate audio boundaries; remote sources can take
longer to seek. The sources retain their existing pending-seek guards; the transport adds no latch that would
require an in-range tick, because a short passage can fall entirely between provider reports. A pause keeps the range,
and the normal resume rewind is clamped to its start. Deliberately seeking or stepping outside
the range clears it, so a timestamp press cannot be pulled back into an old loop. Changing the
source or draft clears it too; it is listening state, never saved timing data. Sync entry clears
it before tapping starts, because a repeating tape cannot advance a timing run sensibly.
`media-player.test.ts` exercises replay, pause/resume, refusal of an empty interval, outside seek,
source replacement, and stopping without pausing; `MediaStrip.svelte.test.ts` exercises its controls.

Mobile viewport geometry is published even while no keyboard is detected, including a rotation
with the keyboard already open. Pinch zoom freezes the unzoomed layout dimensions. The keyboard
flag continues to own the wide-layout floating transport, but mobile sizing does not depend on
an unoccluded baseline. The desktop editor spans the media grid row with its bottom margin read
from the strip's published height, so a taller video never shortens the lyric column.

### The audio picker builds its fields when opened

The shared picker and its native dialog stay mounted so a resumed Spotify query can reopen
and search automatically. Its forms, search logic, and result surfaces load from
`MediaPickerBody.svelte` only when opened, avoiding unused JavaScript and dialog DOM during
editor startup. The heading and Close control remain available during loading or a failed
import; the shared lazy loader offers Retry. Closing before loading completes cannot focus
a hidden field or run a resumed search. Search text survives reopening, while errors and
results reset. Opening still prepares Apple's SDK
synchronously on the user's gesture, before waiting for the fields to render and selecting the
YouTube link. Native close events retire the fields on every dismissal path; attachment,
search, and focus restoration keep their existing owners. `MediaPicker.svelte.test.ts` pins
the absent initial fields, resumed query, and synchronous preparation.

### The transport surface loads when a source exists

Workspace loads `MediaStrip` when audio is attached or a remembered source has a pending
name. The existing `media-strip` region hosts the shared lazy loader's loading and retry
states; once loaded, the same strip instance survives desktop and phone view changes.
The player, store, and keyboard handling remain available from startup, so source recovery
and transport shortcuts do not wait for the surface module. The desktop and mobile media
component tests wait for the actual strip before checking its layout and retained instance.

### Startup attachment recovery must finish before offering Add audio

The media store exposes `restoring` for the current `openFor` generation. The editor
actions tray waits for it to finish before interpreting an absent attachment and pending
name as an empty draft. Otherwise a remembered source makes Add audio flash before
its strip appears. Superseded recovery cannot clear the newer draft's pending state.
Recovery errors still report visibly and accessibly, and release the pending state.

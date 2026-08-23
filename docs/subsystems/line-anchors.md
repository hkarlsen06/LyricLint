# Line anchors and sync mode: timing lines against the audio

Touches: `src/lib/editor/extensions/line-anchors.ts`,
`src/lib/editor/extensions/lyric-sync.ts`, `src/lib/editor/keymap.ts`
(`Ctrl-Alt-M`, `Ctrl-Alt-Enter`), `src/lib/editor/contracts.ts`
(`onLyricSyncChange`, `onSeekMedia`, `onRequestMediaPlayback`)

## The rules

- The audio never moves the document (sync mode is the one exception); the document never
  moves the audio unless the gesture meant only that (timestamp press, anchored line-number
  press, `Ctrl-Alt-Enter` — nothing else); typing writes no anchor at all. There is no
  automatic stamp, and it must not come back: a timing derived from when someone typed is
  wrong by an amount nobody can see.
- An anchor is a range over the line's text, never a point at `line.from`; erasure is
  detected by mapping the ends toward each other, never by `touchesRange` (whose `'cover'`
  verdict cannot tell a deletion from an edit). On a merge the earlier time wins.
- Anchors live on the draft; every `DraftRecord` copier must carry them (see
  `docs/subsystems/drafts.md`); setting one schedules its own save through
  `onLineAnchorsChanged` (quiet for document changes and for `setLineAnchorsEffect`).
- Restore rides `pendingLineAnchors` → `setEditorHandle`; the capability is **checked**, not
  optionally called (`?.` once dropped a whole synced song into the headless placeholder
  handle), and `bindings.lineAnchors` falls back to the pending list, never `[]`.
  `workbench.test.ts` pins both halves.
- The timestamp column: the time is the play control; one glyph beside it (stamp on untimed,
  ± pair on timed, step 0.25s, precise `m:ss.cc` only while open); `.ll-time-gutter` is
  `overflow: visible`; the reserve is the widest state written out padding included; the
  inline end is the overlay scrollbar's lane, measured against the scrollport in
  `line-anchoring.svelte.test.ts`. Everything in the gutter is `aria-hidden` all the way
  down — do not give a gutter control an accessible name and call it done.
- The marked cell is the last anchor at or before the playhead, keyed on `currentFrom`; a
  cell is one line tall regardless of wrap; every row reserves the same width.
- Sync mode: the editor owns the mode, the shell reacts (`onLyricSyncChange`); typing ends
  the run (read off the document changing, via a `transactionExtender`); pausing holds the
  run and a tap against a paused tape is refused out loud; no `preventDefault: true` on any
  sync binding (it swallows keys when the command returns false — cost a green suite once).
- Taps stamp `liveTime()` minus `tapOffsetSeconds` (50ms wall-clock, multiplied by rate), and
  publish the reading they took in the same transaction; the caret lands on the line just
  timed, advance deferred to the next tap; `Backspace`/`ArrowUp` clear and seek back through
  `onSeekMedia`; blank lines and headers are skipped via the parser's own
  `isSectionHeaderLine`; the run resumes on the last timed line, armed.
- A selection scopes a run (`selectionCoversLyricLine` ↔ `selectionScope`, both over
  `isLyricLine`); a scoped run does not scroll and withholds the skip; absent `startAt`
  means leave the tape alone. The document otherwise follows at a reading line a third from
  the top (`holdReadingLine`, instant, only once the caret would pass it).
- The linked fill times a repeat from an earlier tapped peer's intervals — shape, never
  times — with six refusals (way-in only, earlier copy, stop at gaps, at time reversals, at
  structure divergence via `linePairingLimits`, once per section per run) and one toast
  (`onLyricSyncNotice`; the editor announces, the shell must not announce again). Inside a
  run the line number's seek also moves the caret, armed (`syncMoveTo`) — and stays armed.
- The tap is also a control (`Tap each line`), bound to the `lyricSyncTap` command, drawn on
  every pointer, never focusing the editor; entry focus is deferred one frame. While a run is
  on, a bare space taps from anywhere short of a surface that types or presses with it.

## Decision record

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


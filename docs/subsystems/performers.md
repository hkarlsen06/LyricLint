# Performers: the roster, the two-way rename, and the picker that opens itself

Touches: `src/lib/performers/`, `src/lib/editor/overlays/PerformerPicker.svelte`,
`src/lib/editor/extensions/performer-decorations.ts`,
`src/lib/ui/state/roster-store.svelte.ts`, `src/lib/ui/state/workbench.svelte.ts`,
`src/lib/ui/styles/performers.css`

## The rules

- A rename runs in both directions: `headerRenameFilter` mirrors header edits into the roster
  (`adoptHeaderRename`, alias kept), and `renamePerformer` on the controller is the reverse —
  one atomic edit over `headerNameAtoms`, roster adopted *before* the dispatch, Undo as the
  same rename in reverse, `isMirrorableHeaderName` refused out loud. Regressions:
  `workbench performer renames` in `workbench.test.ts`.
- Only a settled rename re-derives the color (`recolorPerformer`), never `adoptHeaderRename`,
  which fires per keystroke — re-deriving there strobes every bar through the palette.
- A live IME/dead-key preedit follows the editor-wide `isCompositionChange` policy: map the settled
  performer payload and decorations through its transaction, never clear every other line's wash,
  and wait for the committed snapshot before fresh performer resolution. Pin:
  `EditorPane.svelte.test.ts` (*keeps every settled context decoration…*).
- Mapping a performer range may change its positional identity on every provisional character. The
  caret announcer updates that identity during composition but stays silent, so it neither repeats
  the performer over the IME nor mistakes the first settled caret move for entering a new voice.
  Pin: `EditorPane.svelte.test.ts` (*announces performer identity only…*).
- `narrowEdit` in `performers/transform.ts` keeps every edit's range honest (common text at
  both ends trimmed, clamped to the selection's span, never splitting a surrogate pair). This
  is what keeps performer tagging from ending section-link differences nobody touched — the
  fix lives in the transform, not the mirror. Pinned in `transform-boundaries.test.ts` and
  `section-links.svelte.test.ts`.
- The picker opens uninvited on exactly two conditions — `select.pointer` gestures only, and
  `canAssignVoiceGroup` ranges only — and is **silent** when either fails; `Ctrl-Alt-P` asks
  the same predicate and refuses out loud. One flag on the anchor, `offersAssignment`. An
  anchor with nothing to offer leaves an open picker standing; only `undefined` retires it.
- The uninvited surface does not take focus (`takesFocus`, same flag the diagnostic popover
  carries); the `↵` glyph on the action comes off with it. Pinned in
  `PerformerPicker.svelte.test.ts` and end to end in `EditorPane.svelte.test.ts`.
- A picked performer is the chip — border and fill in the performer's own color, no width
  change on press, `aria-pressed` the carrier. The action button has a `min-width` floor
  sized to its three flow labels (`Next`/`Skip`/`Apply`); `Skip` is bordered, never contrast,
  and the labeled `Add voice` button sits beneath it in the action column, away from the voice
  chips. Add voice carries contrast until a named answer is ready; then Apply takes it
  (`actionLabel`/`showsEmptyAnswer`, one derived answer).
- The roster never scrolls: chips wrap onto further rows in stable roster order, so no chip —
  above all no *pre-selected* chip, which is part of what Apply writes — is ever off screen.
  The pre-selection stays: it is the voice groups overlapping the selection, read against
  `assignmentSelectionRange` — the transform's own reading of what the assignment would
  rewrite, never the raw range — and it is what keeps Apply from silently stripping a covered
  voice and what the deselect-everyone route to `Remove formatting` runs on. Pinned in
  `PerformerPicker.svelte.test.ts` and `transform-boundaries.test.ts`.
- The step indicator is an `aria-hidden` bar spanning a question block floored at the widest
  question, with a `sr-only` `Step 2 of 2` carrying the fact.
- The roster is `.list-row`: the name *is* the rename (press to edit in place, no pencil), no
  `<strong>`, trash via the shared `RemoveButton`.
- An **unknown voice** is derived from the text, never stored: a styled slot the section's
  legend does not name (`unaccountedStyledSlots` in `legend-cleanup.ts`, the one owner). The
  picker draws one act-on-press chip per unaccounted slot in that slot's own styling (no dot,
  no performer colour — an unknown has no identity) plus a quiet dashed `+ Unknown voice` chip
  while a styled slot is free of both legend and body (`unknownVoiceOffers`, the transform's own
  reading). Adding a named identity is the labeled `Add voice` button in the separate action
  column beneath Apply: it takes the contrast tier until a named answer is ready, then steps
  down to the filled default tier, so it always outranks the unknown fallback without
  competing with Apply. Pressing an unknown chip wraps the selection via `assignUnknownVoice`
  and **never writes a
  legend edit** — the missing legend group is what records the voice as unidentified, and
  `performer.inline-mismatch` records the remaining work. That finding arrives *already
  accepted* when the state came from these chips: the press is the answer
  `The performer is unknown`, so `Workspace.svelte` writes the acceptance as the wrap applies
  (`unknownVoiceAcceptanceKey`), and the card only shows for styled markup that arrived by
  typing or paste — `docs/subsystems/diagnostics.md` carries the keying, which is on the
  voice's name (`unknownVoiceName`, the shared owner beside the predicate), never on the
  lyrics it flags. No second step ever: nothing
  goes in the header, so there is no rest-of-section question. Chips appear only in the plain
  selection flow, not the legend flow or step two. Pinned in `unknown-voice.test.ts`,
  `PerformerPicker.svelte.test.ts`, and `EditorPane.svelte.test.ts`.
- A new named voice inserts ahead of retained unknown slots: the named group takes the next
  canonical legend slot and the contiguous unknown run moves down atomically (`<i>` → `<b>` →
  `<i><b>`). It never writes a legend that skips the unknown slot and immediately triggers
  `performer.style-order`; a full run with nowhere to move refuses as `too-many-groups`. Pin:
  `performers.test.ts` (*moves an earlier unknown voice down* and *cascades contiguous unknown
  voices*).

## Decision record

### A provisional character does not erase settled performers

A dead key is a real IME composition even when its preedit is only one visible accent. Until the
next character or Space commits it, WebKit reports `insertCompositionText` and correctly keeps the
composition open. LyricLint must not lint the provisional character, offer a section header for a
provisional new line, or dispatch fresh decorations into the composition DOM.

But `performerGroupsField` and `performerDecorationField` used to answer every document change by
emptying themselves wholesale. That is right for an ordinary edit while the shell derives a fresh
parse, but wrong for a composition: an accent being composed on the last line erased the settled
performer bars and washes from the entire song until Space committed it. The browser had not
crashed and the snapshot gate was not stuck; the editor was deliberately holding the preedit while
LyricLint unnecessarily discarded unrelated display state.

During composition, both performer fields now follow the shared `isCompositionChange` predicate and
map what they already know through the transaction.
Ranges before and after the preedit stay attached to the same words, erased ranges drop, and the
visual `DecorationSet` and gutter `RangeSet` travel with the same change. This does not derive any
new claim from provisional text: the shell still rebuilds the exact performer payload only after
composition commits. The browser test holds a dead-key preedit open and checks performer decoration
alongside every other context-derived display so this remains one editor policy rather than a
performer exception.

The caret announcer consumes the same mapped payload, which makes its range key move even while the
caret remains in one voice. It updates that key during composition but does not announce it: the IME
owns the speech channel while provisional text is changing, and carrying the key forward is what
keeps the first ordinary move inside the same settled voice silent too.

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


### The roster wraps, because the pre-selection is part of the answer

The picker opens with chips already pressed. That is not leftover state from its last use —
`performerIdsForRange` reads the voice groups overlapping the selection on every open, so the
opening state is the document's own claim about who already sings the selected text. It is
load-bearing twice over: Apply writes the picked set for the range, so the initial set is what
keeps an assignment over already-formatted text from silently stripping a voice, and
deselecting everyone is how `Remove formatting` is asked for at all.

The roster was a horizontally scrollable track — hidden scrollbar, an edge fade before the add
control — and that broke the pre-selection in the worst direction: a pre-selected chip
scrolled past the edge was still in the answer, so Apply wrote a joint group with a performer
the card never showed. State the user cannot see deciding what a press writes is the failure,
and two smaller fixes were rejected before the layout one. *Opening with nobody selected*
keeps the surprise and flips its sign — the same forgetting then silently removes the covered
voice instead of visibly adding a wrong one, and the removal flow loses its only way in.
*Sorting the selected chips to the front* keeps the selected chips visible but not the rest of
the ballot, and gives up positional stability between opens in a control used dozens of times
per song — the same churn the check-glyph and the action floor were removed for.

So the roster wraps. It is a ballot over a small closed set, not content to browse, and a
horizontal scroller is the wrong container for a row whose every entry must be seen before
pressing a button whose effect depends on all of them. A roster that fits changes nothing; a
crowded one costs the card a row of height, transiently, instead of costing an assignment. The
track, the fade, and the `.add-slot` sibling existed only to manage the scroller's clipping,
so they went with it — the voice chips sit in one wrapping flex row, and the focus-ring padding
went too, since rings only needed reserved room while an overflow edge could clip them. The
`Add voice` command instead sits beneath Apply in the adjacent action column, separating it
from the unknown-voice chips. `PerformerPicker.svelte.test.ts` pins the wrap (a crowded roster
on more than one row, every chip inside the card), the single-line case, the action-column
placement, and the absence of the old structure.

And the range the pre-selection reads is the transform's, not the selection's.
`assignmentSelectionRange` exposes `normalizeSelection` — whitespace trimmed, a lone
parenthetical shrunk inside its parens, a caret grown to its line — and `performerIdsForRange`
and `canRemoveFormattingForRange` are asked about that range, falling back to the raw one only
while the shell's parse has not arrived. On every selection that reaches the picker today the
two readings agree, but the agreement rests on invariants that live in other files: the
keymap refuses a collapsed selection, and a voice group can only be overlapped through its own
non-whitespace characters. Let either drift — a future `Ctrl-Alt-P` that accepts a caret and
grows it to the line is the obvious one — and a raw-range pre-selection opens empty over a
line whose voice Apply then silently strips. This is the same argument `canAssignVoiceGroup`
records above: the question is what applying touches, so it has to be the transform's own
answer rather than a second opinion that happens to agree. `assignmentSelectionRange` is
pinned in `transform-boundaries.test.ts`; the wiring runs in `EditorPane.svelte.test.ts`'s
pre-selection case.

### An unknown voice is the text's own fact, and the roster never learns it

Genius transcription runs formatting-first: a transcriber who hears a distinct voice styles it
immediately, before anyone knows who sings — the styling helps the reader now, and the
transcriber who can name the voice completes the header later. The workbench used to treat that
state as a defect with two exits, add a legend or strip the formatting, and the second exit
deletes exactly the information the next transcriber needs. What was missing was the third
answer: *these voices are distinct and unidentified*.

**The model: an unknown voice is a styled slot the section's legend does not name, derived from
the document on every read and stored nowhere.** The obvious alternative — three "unknown"
performers in the roster — was rejected for two structural reasons. An unknown is a
*per-section* fact and the roster is *per-document*: a global "unknown in italic" identity would
silently claim the italic voice in the Refreng and the italic voice in Vers 2 are the same
person, a claim the transcriber never made, with the same colour drawn in the gutter of both.
And a roster entry drags in everything identity means here — a colour hashed from the name
(three "unknown"s collide), the two-way rename mirror, import dedup, and `context.performers`
counts that gate the very rules involved. Deriving from the text costs none of that, survives
copy to Genius, and needs no `DraftRecord` field for the copiers to lose.

Three consequences hold the feature together:

- **One derivation, one owner.** `unaccountedStyledSlots` (in `legend-cleanup.ts`, beside the
  `usedStyleSlots` it mirrors) answers "which voices are unknown" for both the rule
  (`performer.inline-mismatch`, one finding per slot) and the picker's chips. The picker's
  offers come from `unknownVoiceOffers` in `transform.ts` — the transform's own reading, so a
  chip drawn is an assignment that will not refuse when pressed: an *existing* slot is offered
  unless the whole selection already carries it (a no-op), and a *new* slot only while one is
  free of both the legend and the body.
- **The user never picks the styling.** The picker asks *who*; the transform decides *which
  slot* (`assignVoiceGroup`'s allocation, and `assignUnknownVoice`'s the same way). The chips
  are therefore not "unknown italic / unknown bold" choices to select among — the existing ones
  are the section's actual unnamed voices, rendered in the styling they already have, and the
  dashed chip mints whatever slot is next free. Presentation is self-limiting: chips exist only
  where unaccounted styling exists, so the ordinary roster never carries them.
- **A press is a whole answer, so the unknown chips act on press.**
  An unknown cannot join a named group — a joint group with an unidentified member has no
  legend to be written into — so there is no selection state for Apply to accumulate, and no
  legend write means the two-voice flow's second question never arises. This is also what lets
  an unknown answer step past an armed `Who sings this?` step.

The resolve path needed no new code: selecting a styled passage and picking a named performer
already reuses the passage's slot and writes the legend, converting the unknown into a named
voice in one gesture — which is the flow `performer.inline-mismatch`'s guidance describes.

Naming a different passage while an earlier styled slot is still unknown is an insertion, not an
allocation around it. The first implementation treated every body-held slot as unavailable, so an
italic unknown forced the selected named voice into bold while the header jumped directly from
plain to bold. The assignment itself therefore created `performer.style-order`. The transform now
keeps the named voices contiguous in the legend and moves the retained unknown run down one slot
in the same atomic edit. Unknowns preserve their relative order, and only the contiguous run moves:
an unknown already beyond the first free slot has no reason to change. If slots 2–4 are all occupied,
there is no fifth representation and the existing `too-many-groups` refusal applies.

**The rejected design was already shipped once, and it survived in the import path.** Long
before this model, `extractPerformers` answered the same text state — a styled slot with no
header entry — by minting a real roster performer named `Unresolved voice N` per slot, plus an
"Unresolved voices" section in the Performers panel listing them. That is the alternative the
paragraph above rejects, live in production: a pressable stranger with a hashed colour in every
picker, inflating the `context.performers` counts that gate the performer rules, and — pressed —
writing a legend that names `Unresolved voice 2` into a header. Once the derived model shipped,
the same picker offered both answers to one question, which is how the leftover was noticed. The
minting, the `unresolvedVoiceGroups` plumbing, and the panel section are gone; the only trace is
`isRetiredUnresolvedVoiceName` in `import.ts`, which `importFromSnapshot` uses to retire the
records old drafts still carry — exact-named placeholders no extracted group references. A
placeholder someone renamed no longer matches the name, and one a header genuinely names stays
referenced, so both are kept. Pinned in `performers.test.ts` (extraction mints nothing; the
recognizer's edges), `workbench.test.ts` (import without minting; retirement sparing a named
placeholder), and `PerformersPanel.svelte.test.ts` (no section, no roster row).

Implementation: `assignUnknownVoice` / `unknownVoiceOffers` in `performers/transform.ts` (the
wrap machinery is `wrapSelectionTransforms`, shared with `assignVoiceGroup` so the named and
unknown paths cannot disagree about what a wrap does), `unaccountedStyledSlots` in
`performers/legend-cleanup.ts`, the chips in `PerformerPicker.svelte`, the offer and the
one-press apply in `EditorPane.svelte`, and `createUnknownVoiceEdit` through
`createCallbackProxy` into `Workspace.svelte` and `LiveDemo.svelte`. Pinned in
`unknown-voice.test.ts`, `PerformerPicker.svelte.test.ts`, and `EditorPane.svelte.test.ts`.

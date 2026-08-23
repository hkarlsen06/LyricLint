# Drafts: the menu, the switcher, and what persistence owes a record

Touches: `src/lib/ui/layout/DraftMenu.svelte`, `src/lib/ui/primitives/RemoveButton.svelte`,
`src/lib/ui/styles/rows.css`, `src/lib/ui/drafts/draft-date.ts`,
`src/lib/ui/state/draft-store.svelte.ts`, `src/lib/persistence/`

## The rules

- A draft is one line: glyph commands on the name's own row, muted until hover/focus, each
  keeping the draft in its accessible name. The confirm takes the trigger's own slot
  (`RemoveButton`, shared by every list that offers a way out of a row) and moves focus onto
  itself; the armed row is the list's state, one question open at a time.
- A draft with nothing in it is never written: `createDraft` loads a transient record, the
  first save with text creates the row, `discardEmptyDraft` gives it back, and
  `recoverStartupDraft` sweeps blanks — but spares a wordless draft with attached audio
  (`hasAttachment`, consulted on **every** save).
- A landed save re-reads the drafts list, bounded by `sawPendingSave`; `noteSaveStatus` in
  `draft-store.svelte.ts` is the one place `saveStatus` is assigned.
- The way into the list is the draft's own name (`.draft-switcher`): field plus chevron, one
  bordered group, popover anchored to the switcher's left edge. Dates are read, not parsed,
  and English like the rest of the chrome.
- The menu deletes one 'scribe at a time, never all of them. `Delete all local data…` lives
  in the tools panel beside the claim it undoes, and nowhere else.
  `DraftMenu.svelte.test.ts` asserts the absence at both list states.
- **A `DraftRecord` field is only as safe as the least careful place that rebuilds one.**
  The copiers are `copySnapshot` (`persistence/autosave.ts`), `copyDraft` and `createRecord`
  (`persistence/draft-repository.ts`), and `writeRecord` (`ui/state/draft-store.svelte.ts`);
  shared shapes live in `persistence/copy.ts` (`copySectionLinks`). Adding a field means
  grepping for its siblings, not trusting a list. `persistence.test.ts` populates every
  optional field and asserts the record comes back whole; `workbench.test.ts` drives the real
  copier in its editor stub on purpose.
- The song names the draft only while it still carries `DEFAULT_DRAFT_TITLE` (exported from
  `draft-repository.ts`, compared against, never respelled) — see
  `docs/subsystems/media.md` for what counts as a name worth having.

## Decision record

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


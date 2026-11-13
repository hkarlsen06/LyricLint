# Drafts: the menu, the switcher, and what persistence owes a record

Touches: `src/lib/ui/layout/DraftMenu.svelte`, `src/lib/ui/layout/DraftMenuBody.svelte`, `src/lib/ui/primitives/RemoveButton.svelte`,
`src/lib/ui/styles/rows.css`, `src/lib/ui/drafts/draft-date.ts`,
`src/lib/ui/state/draft-store.svelte.ts`, `src/lib/persistence/`, `src/lib/core/handoff.ts`,
`src/lib/ui/state/handoff-links.ts`, `src/hooks.client.ts`, `src/app.html`

## The rules

- Each draft owns one main writing format, fixed after original content or semantic formatting
  begins, including after clearing the lyrics. Only an untouched new draft offers inline
  creation choices. The last deliberate choice is the `newDraftProfile` preference; opening
  or importing a saved draft never changes it. Legacy records use their saved conversion
  profile, or Genius when absent, regardless of retained model ancestry.
  A successful workspace reset clears the creation preference and starts again in Genius.
- The populated toolbar names the main format, copies its exact text, and offers Export to
  the other format. The native export dialog edits independent plain output, never editor
  history, source metadata or selection. Copy and Download use the exact edited output.
  Edited output persists per draft until a real original text, formatting, language, roster,
  anchor or link change. Selection, title, ignored findings and playhead do not expire it.
  Invalidation happens before constructing the complete saved snapshot; Undo cannot restore
  an expired copy. Target generation uses pure `planProfileSwitch` without upgrading primary
  storage. Historical live switching decisions below are superseded for the application UI;
  the pure conversion engine and editor history APIs remain internal.

- Genius `.txt` import extracts the complete source-header roster before model construction
  and persists both together. Opening the imported draft must not be the first discovery:
  reconciliation preserves existing anonymous assignments. Scribe and saved rich drafts
  keep their retained assignments without a retroactive identity migration.

- A refused delete or reset restores every canceled pending save, including retained failures
  and side records, so departure recovery and a later retry retain the latest work. Successful
  deletion keeps those saves canceled. A refused reset keeps the running preferences unchanged.
  The draft store serializes all destructive operations through one queue, including row delete
  versus workspace reset. Each operation owns an autosave suspension and settles it exactly once:
  restore on refusal, discard deleted saves after committed deletion and editor replacement.
  The reservation exists even without entry saves and holds new complete snapshots without
  timers or writes until the outcome. Physical deletion waits for already-issued and queued
  autosave drains to settle. Draft opening and creation wait for the destructive queue before
  replacing the editor. Departure refuses its checkpoint while a destructive outcome is pending,
  so navigation warns instead of claiming held work is recoverable. Suspended snapshots follow in-flight
  conflict copies with their media identity and storage generation. A later edit or cancellation
  of the adopted copy prevents restoring its older suspended work. A successful row deletion
  resumes held work that forked to a different draft; reset discards all held work. Ordinary cancellation keeps
  its optional restore callback and registers no long-lived suspension.

- A deliberate roster edit keeps a metadata-only draft through the normal guarded save path,
  including its Undo. An empty lyric document does not discard named performers on switching
  drafts or reload. Roster toast actions are scoped to their originating draft load session;
  a stale action never writes to a different draft, including a duplicate with shared IDs.

- In-app navigation checkpoints pending drafts before leaving the workbench. A failed
  synchronous checkpoint cancels that navigation and keeps the editor available for saving
  or export. Teardown also captures a checkpoint before its asynchronous flush. When a
  guarded save creates a conflict copy, pending media references follow the new draft ID,
  so a subsequent checkpoint validates and recovers the complete pending snapshot.

- Rich drafts store the exact active text with a versioned `conversion` envelope. Its pinned
  renderer, guideline versions, model, and recovery projection must validate together. The
  guideline versions are each format's representation identity (`profiles/versions.ts`), not the
  lint rule set's version: publishing a rule set must leave every saved rich draft readable.
  `readsPolicyVersions` admits the saved identities the current renderer reads, reading keeps
  the saved identity, and the envelope must still re-render to its exact saved text. Change an
  identity only when what the renderer writes for that format changes, and keep the old one in
  the readable list unless a reviewed migration replaces it. Legacy
  line-number anchors and links are omitted after migration; the model owns their stable records.
  A metadata-only rich draft survives every blank-document sweep. Unreadable rich state is never
  downgraded over its original row: startup creates a separately labeled text recovery and keeps
  the original bytes available through `exportRawDraft`. A text recovery is a stand-in, not
  a fork: when startup finds that its source row reads again and nobody wrote in the recovery
  (same lyrics and language as the source, the title it was created with, no performers), it
  deletes the recovery at the generation it read and opens the source. Any difference keeps
  both.
- A rich model owns `defaultLanguage`; the top-level draft language is its compatibility copy
  and mismatches are refused at reads/imports. This keeps language changes, rendered text,
  persistence, and undo in the same document transaction.
- Schema 7 uses physical `draftsV7`, `appMetadataV7`, `mediaHandlesV7`, and `draftIgnoresV7`
  stores, atomically copied from V6. Deletion clears V6 and pre-V6 copies too. The public database properties retain their
  existing names. A version number alone is insufficient: Dexie retries `VersionError` without
  a requested version, allowing an older bundle to reopen. Its legacy stores cannot overwrite
  current rich records or their attachments. Mutation readers use the actual table names.
  Blocked upgrades report a close-other-tabs notice before opening finishes. A superseded
  connection closes explicitly and stops Dexie's default version-change handler, which would
  otherwise re-enable automatic reopening; the editor keeps its local state and offers Scribe
  export while further storage operations refuse.
- Autosave compares `storageGeneration` within the write transaction. A stale writer creates a
  separate conflict copy with its local ignored choices and media reference in that same
  transaction, then continues under the new ID without replacing the editor or restarting audio.
  The editor and entrance follow the document load session, not the saved record ID: adopting
  a conflict copy preserves native history, focus and selection; Open and New start a fresh editor.
  Roster Undo actions use that same load session, so a save fork keeps them valid while a real
  document switch still refuses stale actions.
  A failed transaction retains the complete pending snapshot and reports failure. Editor undo
  revisions and timestamps never arbitrate competing writers. Media attachment, detach, title,
  playhead, and ignored-diagnostic changes remain local until that same guarded transaction.
  Consumers without a draft generation context retain their legacy direct-storage behavior.
- Immediate reload uses a versioned, tab-scoped session-storage departure checkpoint, written
  synchronously on `beforeunload`, `pagehide`, or hidden visibility before async flushing. It keeps
  the latest complete snapshot per draft plus any in-flight predecessor identity, at most 16
  drafts and 2 Mi UTF-16 code units. Normal typing retains its debounce and does no checkpoint
  serialization until departure. `storageWriteId` makes interrupted writes and conflict forks
  idempotent. Recovery validates the existing workspace-file boundary and replays through CAS
  atomically before startup selection or ignore-store hydration. It never trusts timestamps or
  overwrites a competing generation. Malformed or failed recovery keeps its bytes and offers a
  download with an alert; a refused departure checkpoint warns visibly and announces, and asks
  the browser to confirm leaving. File capabilities never enter JSON or request permission:
  recovery reuses only the same recording's committed handle; unsaved files need reconnecting.
  Recovery consumes both current and legacy session keys when they coexist. Identical write
  identities deduplicate; dependent writes replay after their predecessors, and independent
  writes use the normal guarded save, including conflict copies. Unreadable or contradictory
  files preserve both raw values for download. Acknowledgement removes only the exact files
  read before replay; a file changed during recovery is retained and blocks startup.
- Backups and Scribe files carrying grouped `writing` ownership and output use version 3.
  Rich version 2 and ordinary legacy version 1 remain accepted. Import
  refuses unknown or mismatched rich state before writing. Reconciliation recovery carries both
  latest visible text and the last valid checkpoint; unreadable originals carry a source-draft
  reference as portable provenance, and inputs beyond the engine limit retain exact text without inventing a checkpoint.

- A recovery's `sourceDraftId` is portable provenance, never lookup authority. Its separate
  `localSourceDraftId` names the original owned by this workspace; null means unavailable.
  Scribe serialization and parsing clear that association, including hand-edited files. Backups
  remap associations only to originals carried by the same archive; dangling references become
  unavailable. Older local recoveries regain an association only through the repository's
  remembered recovery ownership, never through a matching draft ID alone. Local duplication,
  conflict copies, autosave and departure checkpoints preserve verified associations. Deliberate
  original export refuses unavailable data visibly; Song offers it only with a local association.
  Legacy archive ownership is checked against its original IDs and remembered owner before
  remapping. Departure recovery resolves ownership before adopting a predecessor or conflict
  identity. Replaying an already committed legacy fork records the verified association once,
  advances its storage generation and leaves later replay idempotent.

- At five saved drafts the menu offers case-insensitive title/full-lyric search. Filtering never
  changes the saved records; a no-match result retains the search field, and closing the
  menu clears search and pending row actions. `DraftMenu.svelte.test.ts` pins recovery.
  Escape and outside presses close the native menu even before its queued toggle event updates
  the bound state. Escape returns focus to Open; an outside press retains its own focus target.

- Every row names its draft's main format in a chip beside the date, and adds the other
  format when the draft carries an edited export (`Genius + Musixmatch`, with `export` for
  screen readers). Both are derived in `summarizeDraft` and never persisted. The title is
  what truncates; the chip and the date stay whole. Two versions of one song share a title
  and an opening line, so the chip is what tells them apart before one is opened.
- A uniquely titled draft has one identity row with its title, format, date and Actions disclosure.
  Only one row reveals its named Rename, Duplicate, Export Scribe and Delete controls below
  that trigger. Search, another row, Escape and closing the menu abandon pending actions.
  The confirm takes the trigger's own slot
  (`RemoveButton`, shared by every list that offers a way out of a row) and moves focus onto
  itself; the armed row is the list's state, one question open at a time.
  Cancel returns focus to the restored Delete control, keeping Escape within the menu.
- An untouched new blank draft is transient: it writes no record. New still moves the
  current-draft pointer to it (`setCurrent(id, { unsaved: true })`), so a reload reopens a blank
  draft under that id, in the most recent language, rather than the newest saved one. Any
  ordinary `setCurrent` clears the unsaved mark, and a pointer at a missing record without it
  still falls through to the newest draft. Backup import never carries the mark. A deliberate
  clear of saved work is a guarded save, including an empty conflict copy, and survives reload. `recoverStartupDraft` sweeps
  historical blanks without a storage generation only after rechecking that generation in the
  deletion transaction; a concurrent save wins. Audio, a Genius page link, and rich metadata
  also keep wordless drafts recoverable. Explicit Delete remains the way to remove saved work.
- A landed save re-reads the drafts list, bounded by `sawPendingSave`; `noteSaveStatus` in
  `draft-store.svelte.ts` is the one place `saveStatus` is assigned.
- The list caches derived summaries in memory, never on disk. Committed Dexie mutation keys
  invalidate changed drafts; broad changes rebuild the list. Imports and other connections use
  that same invalidation path, and closing the database releases the cache and its subscription.
- Duplicate flushes pending edits and opens the new copy through the existing guarded draft
  loader. The original stays unchanged. A copy that cannot be opened remains saved and the
  failure is visible and announced. `workbench.test.ts` pins the active copy and independent edits.
- The way into the list is beside the draft's name (`.draft-switcher`): title field and named Open disclosure, one
  bordered group, popover anchored to the switcher's left edge. Dates are read, not parsed,
  and English like the rest of the chrome.
- The menu deletes one 'scribe at a time, never all of them. Deleting everything is
  `Reset LyricLint…` under Preferences > Local data, beside the claim it undoes, and nowhere else.
  `DraftMenu.svelte.test.ts` asserts the absence at both list states.
- **A `DraftRecord` field is only as safe as the least careful place that rebuilds one.**
  The copiers are `copySnapshot` (`persistence/autosave.ts`), `copyDraft` and `createRecord`
  (`persistence/draft-repository.ts`), and `writeRecord` (`ui/state/draft-store.svelte.ts`);
  `cloneDraft` (`ui/state/in-memory.ts`) also copies full records;
  shared shapes live in `persistence/copy.ts` (`copySectionLinks`). Adding a field means
  grepping for its siblings, not trusting a list. `persistence.test.ts` populates every
  optional field and asserts the record comes back whole; `workbench.test.ts` drives the real
  copier in its editor stub on purpose.
- A link hands over a lyric as `/workbench/#open=1.<payload>` (`core/handoff.ts`): base64url of
  `deflate-raw` UTF-8 JSON `{ text, title?, geniusUrl? }`. An inline script at the top of
  `src/app.html` takes the fragment out of the address while the page parses, the client `init` hook
  (`handoff-links.ts`) collects it and takes later ones before the router reads them,
  `decodeHandoff` trusts nothing in it, and `openHandoff` writes a new 'scribe through the tail it shares with `importScribe`. It
  never calls `replaceDocument`, a failed flush refuses and stays put, and a refused payload creates
  nothing. Hand-overs run one at a time; one whose text is already open creates nothing; a page opens
  at most `MAX_HANDOFFS_PER_PAGE` and then says to reload. Its messages are fixed text that never
  repeats the link's title, and they wait for the workspace to draw. `static/_headers` severs a
  cross-origin opener of `/workbench/`. It owns no `DraftRecord` field and no control.
- The song names the draft only while it still carries `DEFAULT_DRAFT_TITLE` (exported from
  `draft-repository.ts`, compared against, never respelled). See
  `docs/subsystems/media.md` for what counts as a name worth having.

## Decision record

### Departure can interrupt an IndexedDB flush

A native immediate reload after typing ` tonight` lost the new words in Chromium and WebKit,
while the toolbar still read Save pending. WebKit could fire `pagehide` while visible before
hidden visibility. Starting another async flush in that lifecycle is insufficient: the page can
be destroyed before the transaction commits. Departure now checkpoints synchronously and fresh
startup replays a validated full document, including format, model, selection and side records.
The ordinary debounce and native navigation stay intact.

The latest pending edit subsumes an in-flight edit for the same draft. Its predecessor identity
allows recovery to distinguish a landed local transaction from a competing writer; neither
undo revision nor wall-clock time grants overwrite authority. A deterministic conflict ID and
write identity recognize a commit whose acknowledgement was interrupted, avoiding duplicate
copies on repeated startup. Checkpoint acknowledgement follows the atomic recovery transaction.
A recovery failure blocks editing over the retained checkpoint rather than replacing it with a
new document. Session storage bridges a same-tab navigation; it does not promise recovery after
browser eviction or closing the tab. A checkpoint beyond the bounded budget refuses departure
instead of truncating lyrics.

`departure-checkpoint.test.ts` covers retained failures, stale writers and side records,
interrupted predecessor writes, repeated recovery, malformed inputs and unreadable rich originals.
`e2e/immediate-reload.spec.ts` drives native typing and real fresh-document reloads.

### Recovery references cross workspace boundaries

Previously the Scribe and backup copiers preserved `sourceDraftId` as both provenance and a
local lookup. A foreign ID collision exported an unrelated destination song; backup collision
remapping also left the recovery pointing to the old ID. The controller regression uses real
Dexie repositories to reproduce the wrong download. Recovery parsers now preserve local
associations for internal copies and checkpoints while the Scribe boundary clears them. Backup
restore remaps carried associations and the repository recovery cache together, without changing
portable provenance, visible text, checkpoints, reasons or the destination's existing rows.

### Profile switching keeps one durable document

`persistence/conversion.ts` validates the entire envelope and exact active projection at each
storage or file boundary. Every copier keeps recovery fields and storage generations. Duplication
copies media references and ignored diagnostics atomically with the document. Local database
recovery leaves unrecognized rich bytes untouched and creates a separate blocked text copy; a
remembered recovery reference prevents repeated startup from producing duplicates.

`conversion-persistence.test.ts` covers the complete export/import and reopen path, metadata-only
drafts, rollback when a conflict copy cannot be saved, continuing edits after a fork, and the
actual older-Dexie reopening behavior. Explicit deletion also clears the retained legacy rows so
the database barrier does not leave deleted lyrics behind.

### Deliberate clears and side records share the conflict boundary

Clearing saved lyrics used to call unconditional deletion, bypassing the generation check and
allowing a stale tab to remove another tab's newer lyrics, audio, and ignores. Saved clears now
use the normal CAS save and remain recoverable, including an empty local conflict copy. Only
never-saved blank documents stay transient; old blank cleanup checks its read generation again.

The media and ignore stores used to write before lyric autosave, so a conflict fork could occur
after local side records had already overwritten the newer original. The workbench now routes
those mutations through its captured draft snapshot. Standalone legacy consumers keep direct
writes. Backups read committed side records for generation-bearing drafts, so a stale session
mirror cannot substitute local ignored choices onto the newer original. Opening another draft
refreshes its ignore mirror; explicit deletion clears that mirror without scheduling a new save. The actual controller-order regressions in `workbench-conflicts.test.ts` cover a stale
clear, local attachment and ignores before flush, detach, playhead, and a racing historical sweep.

### A longer draft list can be searched without opening each document

Five saved drafts is the point where the menu offers a title or full-lyric search. Small libraries retain
their compact rows. The field filters titles and complete document text, including section headers, without changing recency order or fetching
individual documents. It stays present through no-match results and deletions, and reopening the menu
starts with the full library. Editing the query abandons pending rename/delete controls so an
action cannot remain armed on a row that the search hid.

### Duplicate names need a lyric opening

Rows whose titles collide (ignoring case and surrounding whitespace) show a muted opening lyric
beneath the title. Unique titles keep their single-line layout; headers and blank lines do not
qualify as the opening. The whole-document parser owns that classification so an annotation whose
fragment crosses a line break remains sung text rather than looking like a section header. The
bounded snippet is derived by `persistence/draft-summary.ts`, shared by the Dexie and in-memory
repositories. It is optional `DraftSummary` metadata, never a `DraftRecord` field or a stored copy
that can go stale.

Collision detection uses the whole library, so searching down to one matching duplicate does not
remove the snippet that identified it. The opening is part of the row's accessible name and stays
visible when deletion is armed. A header-only or wordless audio draft simply has no snippet.
`DraftMenu.svelte.test.ts` pins duplicate-only display, search by lyric, and opening the intended
copy; `persistence.test.ts` pins header skipping and the absence of the derived field on records.

### A draft is one line; untouched new blanks stay transient

The glyph-only draft commands described below were superseded by the single Actions disclosure.
The resting list remains compact; only the chosen row shows action words. The roster description
is historical too; its current interaction contract is in `performers.md`.

The drafts menu used to spend two rows on every draft: its name, then `Rename Duplicate Export
Delete` spelled out underneath. Seven drafts came to twenty-eight words of chrome around seven
names, the same four repeated down the page, and a column of red `Delete`s warning about nothing.
The row is not dangerous, the press is. The commands are glyphs on the name's own line now, each
keeping the draft in its accessible name (`aria-label="Rename Sensommer"`, `title="Rename"`) so
"Rename" alone is never all a screen reader hears. They are muted until the row is hovered or holds
focus, and the trash earns `--color-danger` only under the pointer. The hairline between rows went
with the second line: a compact row that lights up says where one draft ends, and the only rule
left worth drawing is the one under the heading.

**The confirm takes the trigger's own slot.** `Delete` armed a `Yes` at the far side of the row,
which is a pointer journey to undo a press the user has already aimed. `RemoveButton.svelte`
swaps itself for the confirm in place, `Cancel` beside it, the row's other commands hidden and the
row itself no longer pressable while the question is open, and it moves focus onto the confirm,
because a control that replaces another has to inherit the focus that was on it. **Every list that
offers a way out of one of its rows shares the component**: the drafts menu, the linter panel's
recent-drafts list (which is where a returning user actually meets the drafts they want rid of),
and the performer roster. The shared component supports an icon or labelled trigger; the verb
distinguishes deleting a draft from removing a performer. The armed row is the list's state, never the row's: only one
question may be open at a time, and closing the surface has to abandon it.

**The roster is the same list, and there the name _is_ the rename.** A performer was two rows as
well (a colored dot and a bold name, then `Rename Remove` underneath), so six performers filled a
panel with `Rename` printed six times and `Remove` in red beside it, and the roster's actual
content, the six names, was the smallest thing in it. It is `.list-row` now: dot, name, trash. No
pencil, because pressing the name opens the field in its place, and a glyph beside it would be a
second control for the thing the pointer is already on. The name draws nothing to advertise that (a bordered
field on every row is six boxes for a name that is usually only read); it just takes the
row's free width, underlines under the pointer, and keeps `Rename Mul` as its accessible name. While
a removal is pending it is plain text again, because that question is the row's only one. The name
also lost its `<strong>`: six bold rows in a column are the same repetition the commands were, and a
name is not an emphasis.

A draft's name is not this, and the difference is what the row is for. A draft row is a way _into_
the draft, so its name opens it and the pencil stays; a performer row is nothing but the name, so
the name is the only thing there to press.

**Attached audio and a saved Genius page are deliberate work.** A song chosen for a
draft with no words yet is deliberate work (the user said what this transcription is _of_), and
without this it was thrown away on every reload, silently and in two places at once: the draft was
never written, so the media row pointed at a transient id no later boot would produce; and had it
been written, `recoverStartupDraft`'s blank sweep would have deleted it, taking the attachment with
it, because `delete` clears the media record in the same transaction. So `scheduleSave` consults
`hasAttachment`, `recoverStartupDraft` takes the media repository and spares a wordless draft that
has a row in it, and `claim()` in the media store calls `onAttached`, one call at the single point
every attachment path already passes through, rather than three that each have to remember.

The predicate is read on **every** save, not only the one attaching triggers. The document is still
wordless on the next snapshot, so a one-shot write would be undone a keystroke later by the very
discard it was working around. This costs a wordless draft with a song in it a row in the drafts
list, which is the right trade: an `Untitled transcription` the user can see and delete beats an attachment
that vanishes with no sign it existed.

**An untouched new draft stays transient.** Every "new draft" used to create a record
immediately, leaving a list of `Untitled transcription`s that had never held a character.
`createDraft` now writes nothing until there is work to preserve. Historical builds also discarded
a saved draft when its text was cleared; that behavior is superseded by the guarded clear-save
contract above. `recoverStartupDraft` only sweeps historical blanks without a storage generation,
rechecking that generation before deletion. A deliberate saved clear survives reload.

**Which makes a landed save the moment a draft joins the list, so a landed save is what re-reads
it.** The list was fetched once at boot and thereafter only by the operations that change it
(open, rename, duplicate, delete), and none of those is what a first-timer does. They type, they
wait, and they open the menu to find out whether any of it is safe: `drafts` was still the empty
value it booted with, so the menu said `No saved 'scribes yet. This one will appear after its first
local save` over a record that had been on disk for six seconds. It is the only question that menu
exists to answer, and the toolbar deliberately draws nothing while saving is going well, so both of
a nervous new user's signals said no while the data was written.

Every landed save re-reads it, not only the record-creating one, because the row carries the
draft's own `updatedAt` and the list is ordered by it: refreshed once, the menu would report
`Yesterday` under a draft being typed into now. The read is bounded by `sawPendingSave` rather than
by the status alone: a settle arrives twice, once from the store's own 250ms poll and once from the
autosave controller's `onStatusChange`, so a status that has not passed through `scheduled` or
`saving` since the last read has nothing new to show. `noteSaveStatus` in `draft-store.svelte.ts` is
therefore the **one** place `saveStatus` is assigned; an assignment that goes around it is a save
the list never hears about.

That read now refreshes a derived summary cache. Reading every complete draft and parsing every
unchanged lyric after each save made typing in one document pay for the entire library. The first
read still derives every summary with the shared document parser. Later reads fetch only committed
changed IDs, preserving the first-save appearance, recency order, and annotation-aware lyric opening.
The cache includes full document text for search alongside the bounded display preview. It creates no
second durable record and refreshes search text through the same committed-write invalidation path.

Invalidation follows Dexie's committed primary-key mutation ranges instead of assuming all writers
use the repository. Direct imports, recovery deletes, and writes through another connection therefore
refresh the same cache, even when a writer leaves `updatedAt` unchanged. Broad mutation ranges rebuild
it; concurrent reads share work and retain invalidations arriving during an outstanding read. Failed
reads retry from the database, and close removes the global subscription. `persistence.test.ts` pins
changed-record reads, external writes, bulk/range changes, reopening, and the in-flight read race.

Dates are read, not parsed: `Today`, `Yesterday`, `3 days ago`, then `15 Jun`, and the year only
outside this one. They are English like the rest of the chrome (the browser locale put a Norwegian
month on the line under `Yesterday`), and the exact timestamp stays in `datetime` and the tooltip.

**The way into that list is the draft's own name.** It used to be a hamburger at the far end of the
command strip: a glyph that names nothing, sitting among the commands that act on the document,
nowhere near the thing it actually switched. The name was already in the toolbar as an input, so the
two are one control now: `.draft-switcher`, the field plus a chevron at its end. Typing in it
renames this draft; the chevron opens the ones it could be swapped for, anchored to the switcher's
left edge so the list opens under the name it would replace. That anchoring is why the `<details>`
goes `position: static` inside a relative switcher; the popover hangs from the group, not from the
chevron. Border and fill belong to the group and nothing inside it draws a box of its own (a border
inside a border is two rectangles for one control), and hovering either half, or opening the menu,
lights the whole thing. The trigger keeps `Drafts` as its accessible name; only the glyph changed.

**And the menu deletes one 'scribe at a time, never all of them.** It carried `Delete all local
data…` as a footer under the list (red, ruled off, one scope up from the row deletes above it), and
on a fresh install that footer _was_ the menu: a sentence saying there is nothing saved yet, and
beneath it the most destructive command in the application, offering to delete the nothing. This is
the menu a first-timer opens out of curiosity, because it is the one control in the toolbar whose
label does not say what it does, so the first thing the workbench showed them was a way to wipe it.
The command was already in the tools panel, which is the second half of the complaint and the reason
this is a deletion rather than a move: the same press in two places is two places for it to drift,
and the copy that drifted would be the one nobody is looking at.

The panel is where it stays, and not because that surface was there first. **A destructive command
belongs beside the claim it undoes**, under `Local data`, directly below the paragraph saying
'scribes stay in this browser and audio stays on your disk, which is the only place in the workbench
that says what "all local data" _means_. In the menu the phrase had nothing to define it and a list
of song titles beside it, so it read as being about the seven names on screen; the confirm underneath
even said `Delete all 'scribes`, promising something narrower than the trigger above it. That is also
why the menu's own footer could not simply be relabelled: the scope was ambiguous because the surface
was wrong, not because the words were.

What is left in the menu is per-draft, aimed, and in the row it belongs to: `RemoveButton` in the
slot the trigger vacated. A user who wants everything gone deletes them one at a time or opens Tools,
and neither is a path anybody reaches by accident. `DraftMenu.svelte.test.ts` asserts the absence at
both list states, because re-adding it to the empty menu is the specific regression.

Implementation: `src/lib/ui/primitives/RemoveButton.svelte` (the shared confirm) and
`src/lib/ui/styles/rows.css` (`.list-row` and its commands, shared by the drafts menu and the
performer roster); `src/lib/ui/drafts/draft-date.ts` for the dates; what each surface adds on top in
`DraftMenu.svelte`, `DraftMenuBody.svelte`, `LinterPanel.svelte`, and `PerformerEditor.svelte`; and the persistence rule in
`draft-store.svelte.ts` and `persistence/recovery.ts`.

Preview extraction shares the `isReadableDraft` boundary predicate with recovery. Unreadable
records remain listed and untouched on disk; they simply have no invented lyric preview. A readable
partial row whose title is absent, blank, or not a string is summarized under
`DEFAULT_DRAFT_TITLE`, so one damaged title cannot prevent the menu from opening for healthy drafts.

### Passage connections survive every draft and file copier

Section links now carry `passages` (including an empty list) and `detached` alongside legacy
`holes`. Presence of `passages` selects the stored passage model; losing an empty list must never
turn an intentionally local group into a legacy whole-body mirror. `copySectionLinks` deeply copies
both nested passage occurrences and explicit exclusions, and the Scribe exporter uses this same
copier. The whole-record persistence fixture exercises live and zero-width connections through
autosave, backup parsing, and database reopening.

`core/link-record.ts` owns validation for backups, Scribe imports, clipboard payloads, and editor
restoration. Passage coordinates, unique member identities, equal text, and non-overlap are checked
as one structure. A corrupt new-format structure retains its group with `passages: []`, suspending
propagation while preserving the lyrics; dropping only one bad field could accidentally activate
legacy mirroring. Legacy hole parsing retains its existing compatibility behavior. New records also
carry whole-body legacy holes so older clients that discard unknown fields leave the text local.

### A Genius page belongs to its transcription

`DraftRecord.geniusUrl` stores the page linked from the Song tab independently of audio. It survives
autosave, renames, duplication, reloads, workspace backups, and Scribe files (`document.geniusUrl`).
A saved link keeps a wordless draft alive on every save and during startup recovery, just as an audio
attachment does. Clearing the link removes that exception when no lyrics or audio remain.

`core/genius-url.ts` owns validation for the field, external link, and imported files: HTTP or HTTPS,
`genius.com` or `www.genius.com`, a page path, and no embedded credentials. Imported invalid links
are refused before workspace state changes; older files with no link still load.


### A link opens a lyric as a new draft

Copying a lyric out of Genius by hand was the first step of every session. A hand-over link carries
it instead, in the URL fragment, because a fragment is never sent in an HTTP request. The `Open in LyricLint`
bookmarklet on the docs (`core/handoff-bookmarklet.ts`, `docs/subsystems/docs.md`) writes these
links from a Genius editing page. The codec loads
with a dynamic `import()` only for such a link; a failed load says to reload and open the link again,
since the link itself may be fine.

Any website can write the link, so `decodeHandoff` refuses a wrong prefix or version, a payload over
400,000 characters, an inflated stream past 1 MiB, invalid UTF-8, a non-object, and a missing or
blank `text`. The inflated bytes are counted while they are read, and the compressed bytes go into
the decompressor 256 at a time, each write waiting for the reader, because a browser can inflate a
whole input chunk before the reader sees any of it: one 300 KB chunk can expand about a thousand
times. A link that `normalizeGeniusUrl` rejects is dropped and the lyric kept. The title becomes one
plain line (line breaks and control characters turn into a space, direction overrides and isolates
are removed), then is trimmed and capped at 200 code points, a cap of its own because the title field
has none.

The lyric becomes a new 'scribe, never a replacement: **Paste lyrics** calls `replaceDocument`,
which keeps the old text only in undo, and a link from another site must not reach that far. The
shared tail with `importScribe` flushes, then refuses if the flush reported a failure (the flush
reports and never throws), then writes and opens the record. The refusal names the cause for both
callers: the open 'scribe could not be saved, so nothing new was opened. On a fresh boot it runs
before the workspace first draws, so the editor mounts on the handed-over lyric.

**The fragment leaves before anything else reads it.** Two readers came first when the page's
mount code cleared it. SvelteKit copies the address into `page.url` as it hydrates, and a shallow
navigation (every right-panel tab switch) writes `page.url` into `history.state` as `pageUrl`; after
leaving the workbench in the app, a Back press restored the payload and opened the lyric a second
time. And Cloudflare injects its analytics beacon as a deferred script at the end of the body, which
on a slow phone runs before any of the application's modules: with the CPU throttled six times, a
stand-in beacon read the fragment even from the client `init` hook's earliest point.

So an inline script at the top of `src/app.html` takes the fragment out of the address while the page
parses and leaves it on `window.__lyriclintHandoff`. `script-src` names its hash, computed from the
file in `vite.config.ts`; the meta policy governs only what follows it, but a header policy would
not. `captureHandoffLinks` runs from the client `init` hook, which SvelteKit awaits before it reads
the address: it collects that fragment, and its `popstate` listener is registered before the
router's, the one that adopts the address of a fragment-only navigation (the same link followed in a
tab already on the workbench). `hashchange` covers a browser that skips `popstate` there. A link
clicked inside the app fires neither before the router acts: the router copies a clicked address
into `page.url` at the click. So the same function takes a plain click on an HTML or SVG anchor to
the workbench in the capture phase and stops it there. On the workbench the fragment goes straight
to the hand-over queue, and from another page the workbench loads in full, which puts the fragment
through the inline script. The page
takes the captured fragments through `receiveHandoffLinks`. This supersedes the first version of
this record, which cleared the fragment at the top of the page's `onMount`, listened for
`hashchange` there, and built tab-switch URLs from `location` because `page.url` kept the fragment.

**A page that opened the tab is bounded three ways.** It can run `window.open` on one click and then
set the window's address to a new fragment in a loop; only the fragment changes, so nothing reloads,
and each tick would write a draft of up to 1 MiB. `static/_headers` answers `/workbench/` with
`Cross-Origin-Opener-Policy: same-origin-allow-popups`, which takes that handle away and keeps the
window the workbench opens itself, Apple Music's sign-in, connected; Spotify signs in with a
full-page redirect. The header exists only on Cloudflare, so the controller bounds hand-overs too:
they run one at a time, a lyric equal to the open text creates nothing and says it is already open,
and after `MAX_HANDOFFS_PER_PAGE` (5) links taken in one page lifetime, opened or refused, the next
is refused with a message to reload the tab. The count belongs to one page load. Where the header is
absent (the local preview, the dev server), a page that opened the tab can force a reload and start
a new count, so there the header's absence is the gap and the count only bounds a single load.

**Its feedback is fixed text and waits for the workspace.** The success message used to repeat the
title, which the linking page chooses, in the app's own voice. It now reads `Opened the linked
lyrics as a new 'scribe.`, and the title, shown in the toolbar anyway, is one plain line. One
announcement still carries that title: `openDraft` tells the live region `Opened <title>.` for any
draft it opens, a handed-over one included, just before the fixed message replaces it. Every
hand-over message takes the notice duration and waits on `workspaceShown`, which the page settles
when the editor reports ready: on a slow phone a confirmation counted down from before the first
paint could expire unseen, and it is the only sign of an action the user did not take in the app.

### The drafts popover initializes on first opening

The native summary remains available immediately, while the saved rows, search, and import
control initialize on the first opening. Building every saved draft row inside closed
`details` extended editor startup in proportion to the library. Once initialized, the
popover and its file input stay mounted across closes so a pending picker or import keeps
its owner. Closing still clears search and pending rename/delete actions. The existing
DraftMenu interaction suite checks the initial absence and retained input alongside search,
imports, and row actions.


### Shared Scribe files load their codec when requested

The workbench imports the Scribe parser and serializer only inside the existing import and
export actions. Export captures the draft and its project fields before waiting for the codec;
subsequent edits cannot change the requested export. Failed loading, serialization, or download
reports a refusal by toast and announcement, without announcing an export. Import checks the
filename and byte ceiling before loading or reading the file, then uses the unchanged parser
validation before writing any draft state. The lightweight format contract owns the byte ceiling
and error class; the codec reexports both for compatibility.

The same import picker accepts `.txt` lyrics. Choosing text reveals a named source-format field,
defaulted to the current profile, before creating a draft. Opening imports the source exactly
after the editor's usual LF line-ending boundary, retains the original decoded text in
`originalText`, and selects that source profile. There is no syntax guessing or conversion during
opening. File-byte and engine work ceilings are checked before creation, and a failed current
autosave blocks opening another document. Tests cover literal Musixmatch brackets, original line
endings, refusal before reading oversized files, and the picker at phone and desktop widths.


### Draft rows load behind the native menu

The native details, summary, heading, import button, and file input remain in `DraftMenu`.
Opening loads `DraftMenuBody` through the shared loading/refusal-and-Retry surface, so the
search, previews, row commands, and confirmation implementation do not run during startup.
The body stays mounted after first use and receives the current open state; closing clears
search and armed row actions while preserving the import input and any pending import.
Escape still returns focus to the summary, and outside presses retain their own focus target.

### A rule set publish made every saved rich draft a text recovery

The Genius policy identity pinned into a conversion envelope was `currentRuleSet.version`, and
the envelope was read only when its pin equalled the current value. On the feature branch the
rule set never changed, so nothing showed. Merging `main` on 2026-11-12 brought rule set
`2026.11.11.0` (four language packs), and every draft whose format had been chosen under
`2026.09.21.2` failed with "The saved guideline version is unavailable", so startup preserved
the row and opened a `(text recovery)` copy with Review reading "Retained details need
recovery". Nothing was lost, but an ordinary publish had locked every rich draft.

The pin now names the format's representation, which a rule set publish does not touch:
`profilePolicyVersions.genius` is the fixed `2026.09.21.2`, and the readable list also
admits `2026.11.11.0`, which builds wrote for a few hours that day. Rows that were turned away
read normally again.

That left the stand-ins: a reload still opened the `(text recovery)` copy, because it was the
last draft open, with the working original one menu away. So startup now removes a text recovery
whose source reads again when nobody wrote in it (same lyrics and language as its source, the
title it was created with, no performers) and opens the source in its place
(`recoverStartupDraft`). A stand-in that was edited, renamed or given performers stays.
The exact re-render check is unchanged and remains the guard against a renderer that would
change saved text. Pins: `conversion-persistence.test.ts`.

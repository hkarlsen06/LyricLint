# The editor's edges: composition, clipboard metadata, and the audio drop

Touches: `src/lib/editor/clipboard-metadata.ts`,
`src/lib/editor/extensions/clipboard-metadata.ts`, `src/lib/editor/create-editor.ts`
(`audioFileDrop`, `createCallbackProxy`), `src/lib/editor/extensions/update-bridge.ts`,
`src/lib/editor/extensions/editor-state.ts`, context-derived decoration fields,
`src/lib/editor/contracts.ts`

## The rules

- Every editor↔shell hook must be added to `createCallbackProxy` in `create-editor.ts` — an
  explicit allow-list where a missing callback looks exactly like a feature that silently
  does nothing.
- The snapshot gate withholds IME preedit, then releases on `compositionend` or on a finalized
  `insertText` from a dead key. Safari may omit the former; CodeMirror repairs its own state from
  the latter, and LyricLint must repair its separate state as well. Active preedit is
  `insertCompositionText` and never takes this fallback. Context queued during that handoff flushes
  on CodeMirror's settled view update, without waiting for another character. Pins:
  `keyboard-commands.svelte.test.ts`, `EditorPane.svelte.test.ts`.
- A finalized `insertText` is only a request to check CodeMirror's recovery, never authority to end
  a composition itself. The gate releases only after public `compositionStarted` becomes false, so
  the Safari workaround cannot truncate a longer-lived composition in another browser. Pin:
  `keyboard-commands.svelte.test.ts` (*does not treat insertText as an ended composition…*).
- Every context-derived display field reads the one `isCompositionChange` predicate. A provisional
  composition transaction maps settled decorations through the change; it does not clear them and
  does not derive replacements from provisional text. An ordinary committed edit still clears
  stale display until the shell refreshes it. Pin: `EditorPane.svelte.test.ts` (*keeps every settled
  context decoration while a dead-key preedit is open*).
- A copy carries timings and links in a `text/html` flavor (`data-lyriclint`); `text/plain`
  stays byte-for-byte the selection's own slice — clean lyrics on the clipboard are this
  application's entire output. The toolbar's `Copy lyrics` deliberately carries nothing.
- The paste is the sanctioned exception to wholesale replacement losing anchors and links:
  the payload is fragment-relative, guarded by the fragment's own line count, versioned,
  parsed trust-nothing (unreadable pieces drop, the rest applies), and timed only where
  it still runs forward — a carried timing lands after the anchor above the paste and
  before the anchor below it, strictly increasing, and anything earlier drops while the
  words still land.
- The extension owns a copy outright or leaves it to CodeMirror untouched — only single
  non-empty ranges with something to carry, and only where the live DOM selection is the
  editor's own. A link travels only where its whole group is inside the copy; landed links go
  through `setSectionLinkEffect` (a second transaction), never the restore effect.
- A media source rides only as an id, only as a rider on a carrying copy, and lands as a
  restored (pending) record: a draft with audio keeps it, a build that cannot carry the
  source out does not adopt it, a provisional name titles nothing. `clipboardSource` /
  `adoptPastedSource` in `media-store.svelte.ts` are the two answers.
  Pins: `clipboard-metadata.test.ts` (arithmetic),
  `clipboard-metadata.svelte.test.ts` (real `DataTransfer`s, both directions),
  `media-store.test.ts` (adoption; loads count of zero).
- The audio drop `preventDefault()`s **only** when actually taking a file — unconditionally
  preventing on `dragover` breaks CodeMirror's native text drop. Detection on `dragover`
  treats an empty `type` as a candidate; `dragleave` ignores a `relatedTarget` inside
  `contentDOM`. The affordance is an inset outline on the editor's own edge, never a box.
  `audio-drop.svelte.test.ts` asserts both halves.

## Decision record

### A dead key may finish without saying composition ended

Snapshots are withheld during IME composition so autosave, diagnostics, performer decoration, and
anchored surfaces never react to a preedit the browser is still rewriting. LyricLint carries that
gate in `editorComposingField`, separately from CodeMirror's own composing state, because
transaction filters and snapshots need the answer in immutable editor state.

Safari occasionally omits `compositionend` after a dead key such as an acute, grave, circumflex,
or diaeresis accent. CodeMirror already recovers its private composing state when the resulting
`beforeinput` arrives as finalized `insertText`, but its recovery calls an internal observer and
does not emit another DOM `compositionend`. LyricLint's field therefore stayed true forever: text
continued to appear in CodeMirror while no snapshot reached linting or autosave, and every surface
suppressed during composition stayed absent.

`createUpdateListener` mirrors CodeMirror's recovery signal after the same short delay, then yields
one timer turn for CodeMirror's earlier-queued Safari timer. It releases only when CodeMirror's
public `compositionStarted` has actually become false: `insertText` can occur without ending a
longer-lived composition on another browser, and the fallback has no authority to overrule it. A
genuine preedit therefore remains withheld for its real end. Each composition run carries an
identity so a delayed finish from one run cannot release a newer one.

There are two gates because there are two things to protect: LyricLint's state gate withholds the
snapshot, while CodeMirror's own flag protects the live composition DOM from decoration updates.
The shell's refreshed context can arrive between those gates releasing. `pendingContext` therefore
flushes from the first settled CodeMirror view update as well as from the snapshot path; otherwise
the new document saves and lints while performer wash and the headerless-section helper remain
cleared until the next ordinary character. The regressions deliberately omit the first
`compositionend`, send the finalized dead-key input, and assert both that one resumed snapshot
escapes with `composing: false` and that decoration returns without another edit.

A dead key that has emitted only `insertCompositionText` is different: that composition has not
ended at all, and Space or the next character is what commits it. Fresh lint, performer resolution,
markup parsing, and headerless-section context correctly wait. But the displayed accent also caused
a real CodeMirror document transaction, and each context field used to interpret any such change as
a committed edit and empty itself. That common invalidation policy—not a Safari crash and not a
performer-only fault—is why the wash, diagnostic underlines and diffs, syntax treatment, and existing
section helpers all vanished in turn.

`isCompositionChange` in `editor-state.ts` is the one owner of the distinction. During provisional
composition, each context-derived field maps its already-settled ranges or decorations through the
transaction. It neither claims the provisional character is valid nor asks the shell to parse it;
interaction with stale diagnostics remains gated while composing. Once the composition commits, the
snapshot reaches the shell and the exact context replaces the mapped display. Ordinary edits retain
the previous clear-then-refresh behavior. The cross-surface regression opens one dead-key preedit
and holds the fix preview, diagnostic underline, performer marker, markup dimming, and section helper
on screen together so another field cannot quietly reintroduce its own definition of composition.

### A copy carries its timings and links in a second flavor, and the plain text never learns

A clipboard entry is a set of representations and the paste target picks the one it understands. So
a copy made in the editor carries two: `text/plain` is the lyrics, byte for byte the selection's own
slice — clean lyrics on the clipboard are this application's entire output, and every text field in
the world reads this flavor and only this flavor — and `text/html` is the same lyrics with the line
anchors and the section links in one `data-lyriclint` attribute, where only the paste handler on the
other side of the trip ever looks. Copy a synced, linked chorus out of one 'scribe and paste it into
another and the timings and the link arrive with it; paste the same clipboard into a Genius lyrics
box and nothing but the words was ever there.

**The paste is the sanctioned exception to wholesale replacement losing everything.** The rule that
a document replaced whole loses its anchors and links is about guessing — re-attaching them to
re-pasted text would mean guessing which of the new headers used to be which, and a link that is
silently wrong overwrites work. A payload riding the paste is the one case where that stops being a
guess: it says which fragment line owns which time and which headers move together, so applying it
is arithmetic rather than inference. Everything in it is **fragment-relative** — 0-based lines into
the copied text, because the paste has no idea where in which document the copy was made — and the
fragment's own line count rides along as the guard: a `text/plain` that no longer splits into that
many lines is not the text the metadata describes (a clipboard manager merging flavors from two
copies is the way this happens), and the honest answer is the text alone, through the default path.

**The editor's copy carries it; the toolbar's `Copy lyrics` deliberately does not.** The toolbar
copy is the application's one output, aimed at a song page, and it stays exactly what
`copyCanonicalMarkup` has always written; the selection copy is a working gesture inside the tool.
Whole-document transfer is select-all and copy, which is the same gesture. The empty-draft
`Paste lyrics` button reads the clipboard through `readText`, so it is plain as well — the keyboard
paste into the editor is the carrying path, and it is also the only one whose read
(`getData('text/html')` on the paste event) no browser gates behind a permission or sanitizes.

**The song rides too, where it is an id and only as a rider.** A remote source — a YouTube video,
a Spotify track, an Apple Music song — is nothing but an id in a known alphabet, which is exactly
what a clipboard can carry; a local file is a handle only this browser can redeem, so it never
travels and its absence is the design rather than a gap. It is a rider, never the trigger: it joins
a copy that already carries timings or links, because it is carried as the thing the timings are
seconds into, and a copy that is only words says nothing about a song — claiming every copy in
every draft with audio attached would put the whole workbench's copy path through this extension
for a fact the words do not state. Four rules on the paste side, and each is an existing rule
arriving here:

- **A draft with audio keeps it.** Attached or pending, an attachment is deliberate work, and a
  paste must not overwrite it (`adoptPastedSource` returns false and nothing changes).
- **A pasted source is a restored record, not a press.** It lands persisted, named, and waiting on
  the press that pays for its script or its sign-in — the exact state a reload restores — because
  the paste was aimed at the document, not at Google. The one shortcut it takes is the one a reload
  takes: consent already given in this session stands, so a pasted video plays at once where
  `youtubeAllowed` is already true, and a pasted track where the session is already signed in.
  Nothing is contacted that a reload would not contact.
- **A build that cannot carry the source out does not adopt it** — a pasted Spotify track in a
  build with no client id would be a pending press whose sign-in has nowhere to go, which is
  `spotifyAvailable`'s rule met from the clipboard.
- **The carried name may be provisional, and a provisional name titles nothing.** A copy made
  before the catalogue answered carries `youtu.be/dQw4w9WgXcQ`; it labels the pending press, and
  the title-suggestion guard the adopt paths already hold applies to the pending path as well, so
  the target draft is never named after an address.

The editor's half of this is two hooks — `onRequestMediaSource` answers the copy,
`onMediaSourcePasted` hands the paste over — both in **`createCallbackProxy`**, and both decisions
are the shell's: the editor has no standing in what a draft's song is or what a pasted one is
worth. `clipboardSource` and `adoptPastedSource` on the media store are the two answers.

Five things the extension owes, and each was a wrong version first:

- **A copy with something to carry is owned outright; every other copy is left to CodeMirror
  untouched.** Adding a flavor beside the built-in handler's cannot work — it opens with
  `clearData()` — so the extension claims the event whole, and it claims only the one shape whose
  plain flavor it can reproduce byte for byte: a single non-empty selection range. Multi-range
  selections, line-wise empty-selection copies, and any copy with no anchors and no whole link in it
  fall through, so the extension cannot drift from the default copy on the copies it adds nothing to.
- **A copy is only claimed where the live DOM selection is the editor's own.** A page-wide selection
  that reaches into the editor bubbles its copy event through `.cm-content`, and CodeMirror's own
  handler steps aside for it by exactly this test; a handler without it would overwrite a copy of
  half the page with whatever the editor's internal selection happened to be.
- **A link travels only where its group is wholly inside the copy.** A member's header line has to
  start inside the fragment and its whole body has to end there, because the paste re-seats
  membership by line arithmetic and a section it only has half of has no lines to seat it on.
  Members outside the copy are dropped and the survivors carry on — the rule deleting a linked
  section already follows — and fewer than two survivors is not a link. On the paste side a header
  that landed mid-line is not a header any more, and the **whole group** stands down rather than one
  member at a time: the members' divergent runs correspond by ordinal, and a partial group would
  carry one copy's differences under another copy's words.
- **Landed links go through `setSectionLinkEffect`, never the restore effect.** The restore is the
  draft being read back and is deliberately invisible to the shell's save — links applied through it
  would be correct on screen and gone on reload, which is the exact class of bug the four-copier
  history of `SectionLink` exists to warn about. One effect per group, exactly as the picker links,
  recorded by the history and reported through `onSectionLinksChanged`. It is a second transaction
  after the insert because it has to be: the effect maps its headers through its own transaction's
  changes, and a position inside text an insertion is still creating is not reachable from the old
  document by any mapping. The anchors need no such step — `anchorLineEffect` reads its positions
  against the new state, so they ride the insert itself.
- **The parse trusts nothing and drops what it cannot read.** The payload is versioned, every line
  index is checked against the stated count, and an unreadable anchor or hole is dropped while the
  rest applies — the same trade `backup.ts` makes, because losing one difference costs a re-tick
  while refusing the whole payload costs the timings beside it. Anybody else's HTML has no
  `data-lyriclint` and reads as no metadata at all, which is what hands an ordinary rich-text paste
  straight back to CodeMirror.

What the HTML flavor costs is named rather than hidden: a rich-text surface — a document editor, an
email composer — picks it over the plain one, so such a paste is an HTML paste. The flavor's markup
is the escaped lyrics in a `<pre>` and nothing else, so what those surfaces paste is still the
words; the attribute is dropped by any editor that does not know it, which is all of them.

Implementation: `src/lib/editor/clipboard-metadata.ts` (the payload, the serializing, the parse —
pure strings, no CodeMirror, tested as arithmetic in `clipboard-metadata.test.ts`),
`src/lib/editor/extensions/clipboard-metadata.ts` (the three event handlers), and
`clipboardSource` / `adoptPastedSource` in `src/lib/ui/state/media-store.svelte.ts`, wired in
`Workspace.svelte`. `clipboard-metadata.svelte.test.ts` drives the real editor with real
`DataTransfer`s and pins the promise both ways: the plain flavor byte-identical on a carrying copy,
and the fall-through — plain pastes, foreign HTML, mismatched counts — landing text and nothing
else. `media-store.test.ts` pins the adoption rules against the stubbed sources, so "contacting
nobody" is its usual assertion — a loads count of zero — rather than a hope.

### Audio arrives by drop, and the drop that is not audio is not ours

Dragging an audio file onto the document attaches it. The rule that matters is the negative one:
CodeMirror has its own drop handling that inserts dropped text at the drop position, and that must
keep working exactly as it did. So the handler `preventDefault()`s **only** when it is actually
taking the file — unconditionally preventing on `dragover` is what breaks native text drop — and the
shell returning false hands the event straight back to CodeMirror.

Detection happens on `dragover`, where the browser withholds the file's name and exposes only
`kind` and `type`, so an empty `type` counts as a candidate (some browsers report nothing for
`.flac` and `.opus`) and the extension is only checkable on `drop`. `dragleave` ignores a
`relatedTarget` still inside `contentDOM`, or crossing between lines blinks the affordance.

The affordance is an inset outline on the editor's own edge, because the thing that will take the
file is the whole document — a tinted sheet or a "Drop here" box would be a card inside the editor
saying what an edge already says.

Implementation: `audioFileDrop` in `src/lib/editor/create-editor.ts`, `onAudioFileDropped` in
`contracts.ts`, and `src/lib/editor/audio-drop.svelte.test.ts`, which asserts both halves of the
regression: dragover is not `defaultPrevented` for text, and dropped text still reaches the document.

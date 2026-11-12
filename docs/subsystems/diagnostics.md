# Diagnostics: the card, the popover, the preview, and the panel's order

Touches: `src/lib/diagnostics/`, `src/lib/diagnostics/order.ts`, `src/lib/diagnostics/decisions.ts`,
`src/lib/editor/extensions/fix-preview.ts`, `src/lib/core/fix-preview.ts`,
`src/lib/rules/bulk-fix.ts`, `src/lib/ui/state/panel-view.svelte.ts`,
`src/lib/rules/harper-ids.ts`

## The rules

- Review keeps its existing checking state while eligible grammar coverage is pending,
  including a suspended navigation attempt. A canceled initialization never claims a
  clean document. Native findings remain available while grammar resumes.

- Ignore, accept and restore show brief, rule-named feedback with Undo. Announcements retain
  full draft context. Action grouping uses draft, rule and decision rather than caption text;
  unrelated findings never gain a shared Undo merely because their copy matches. Undo refuses
  visibly on another draft, preserving its choices and asking the reader to open the original.
  `rules/names.ts` owns readable labels shared by feedback and the ignored list. A label change
  never changes stored rule IDs or per-occurrence choices.

- A bracketed Musixmatch label that is a complete Genius header naming a reviewed song part
  carries `readableAsSection`, set by the rule itself, and both surfaces then offer
  `Convert Genius headers to sections` through `conversionReviewAction`. It is the one
  conversion action that opens no Review task: it converts every such header in the draft in
  one undoable step (`convertGeniusHeaders`). A bracketed vocal keeps `Ignore` alone.
- Conversion diagnostic actions stay in Review. Requests capture the original range, revision, draft and format. Source selection never retargets the decision. Changed lyrics require returning to the current finding. Repeat placeholders replace only the captured standalone notation with an explicitly chosen earlier section and confirmed number of fresh copies; preview precedes application. Song retains its separate metadata tools.

- Repeat review keeps source, blank copy count and Preview above variable source context.
	With no earlier source, the task offers direct lyric editing without source, count or preview controls.
  A native dialog offers readable source rows with the first two lyric lines, including
  distinguishing second lines. Long rows explicitly name their excerpt and offer exact full
  source text before choosing. A visible Selected cue and pressed state identify the choice.
  Opening, inspecting and cancelling never changes the chosen source, count or prepared preview.
  Changed preview facts retire the prepared result, including facts later restored to their
  earlier values. The same source choice and cancellation preserve it. Source selection never
  changes the target.
  The trigger keeps constant wording for a chosen version; complete selected identity follows
  Preview. Short source and result lyrics remain fully readable in the task. Long text has
  named excerpts and native full-text viewers with one scrollport each. The result viewer names
  source, captured target and copy count; closing restores the trigger without editor focus.
	Full replacement lyrics shares the Apply row, preceding Apply in reading order.
	Full source access sits beside the selected section identity, before the proposal.
	The result reader also offers Apply in a fixed footer, using the task's same captured
	target and validated proposal. Reading does not require closing the reader before applying.
	The full result remains one exact text node. Go to copy jumps to a prepared copy boundary,
	and Last line reaches the end without changing the lyrics. Go to copy names the last requested
	destination rather than tracking manual scrolling. Boundaries use the prepared replacement,
	not source markup that fresh copies omit.
  Apply follows the proposal. Source annotations, voices and timing are never copied.

- Text findings precede retained-detail Review, so a section-tag decision never obstructs a lyric finding. Retained-detail Review presents one finding with Previous detail and Next detail when several remain; a lone detail has no redundant navigation. Listening requests open only the relevant quantity or instrumental form. Song keeps saved decisions in a separate disclosure.
	Section-type findings offer a named selector and explicit Save in Review without opening Song.
	An unsaved type belongs to its draft, profile, finding and document revision. Document changes
	clear the shown choice, disable Save and explain that a new choice is needed; selection-only
	changes keep it. Other retained section requests reopen and focus their section even when requested repeatedly;
	missing boundaries open Add a section. Back to Review restores focus to the next retained
	decision, or the Review tab when none remain. `e2e/profile-workbench.spec.ts` pins desktop
	and phone navigation.

- Genius and Musixmatch diagnostics use separate registries, sources and ignore namespaces.
  A profile change recomputes findings against that projection without applying fixes. Native
  checks in both profiles honor explicit language spans; Harper is withheld in Musixmatch until its
  behavior is reviewed for that profile. Metadata-only findings appear in retained-detail review
  with a focused section-type form or a Song destination for other metadata, never at a fabricated text offset.
- Quantity, instrumental, censored-word and repeat findings offer a shared Review action in
  both the card and popover. It selects the actual finding, opens only its focused task within Review
  and focuses its heading without opening the typing keyboard. Edit in lyrics then selects the captured passage and focuses the editor for immediate typing. Song retains metadata separately. The preview uses the commit
  validator and expires when its facts, captured request or document revision change.
  Moving the live editor selection preserves a focused task's original target and preview;
  it never retargets Apply. Song's selection-based decision previews expire when that
  selection changes. Ignoring a
  finding never confirms a semantic fact. `diagnostic-parity.svelte.test.ts` pins the shared
  controls; `e2e/profile-workbench.spec.ts` exercises the quantity workflow.

- The shell's entrance may reveal the initial viewport's diagnostic rows once per ’scribe opening using
  temporary opacity only, in their
  existing reading order. New findings, fixes, filter changes, and later Harper results do not
  replay it. Shared card and popover components contain no entrance animation; see
  [Motion usage](../motion.md).

- Diagnostic row identity follows unchanged occurrences through the editor's actual
  `documentChange`, separately from current diagnostic ranges and revision-bound fixes.
  Repeated text never acquires another occurrence's controls by ordinal or text search.
  Selection, collapse, focus, and row geometry survive edits above the finding. Missing change
  metadata starts fresh for changed text. Pins: `row-identity.test.ts`, `LinterPanel.svelte.test.ts`.
- Review draws one row per decision (`groupDecisions` in `decisions.ts`). `decisionKey` joins
  rule, severity, message, `identityText`, and every fix label; a finding with `relatedRanges`
  or `detectedLanguage` keys `null` and always has its own row, keyed by its row identity. The
  open row shows the unchanged per-place card for one member, held by that member's row
  identity and remounted per member, plus a `Places` group of `Previous place`, `Next place`,
  and `Place 2 of 10, line 9` directly under the meta line and above the explanation, at
  every width, so it sits beside the count it explains and is in view when a row opens on a
  phone. Its meta line reads `Line 7` alone and `10 places` grouped, so the line stays one
  line beside the derivation mark and `Sources`. The place is announced through the shared
  feedback only when the stepper is pressed, never after a fix. A stepper press that lands on
  either end hands focus to the other button; the handoff is decided from the target place
  when pressed and carried out once that place is drawn, because on a phone the open place
  follows a tick later. A fix or an ignore answers one place only. Pins: `decisions.test.ts`,
  `LinterPanel.svelte.test.ts` (*one row per decision*), `MobileWorkspace.svelte.test.ts`
  (*the phone place stepper hands focus…*).
- Rows never reorder on their own. `reviewDecisions` on the panel view is the order Review
  draws: a row that survives from one snapshot to the next keeps its position relative to the
  other surviving rows, whoever answered a place and wherever (the panel, the editor, its
  popover, `Mod-.`, the bulk strip, another row's `Fix all`). The state is every row drawn
  since the last release, absent ones included, so a row that leaves and comes back (a
  finding the native rules withdraw while its line is typed on, or a Harper finding dropped
  by the edit) takes its old slot. Every edit carries Harper's unaffected findings until
  Harper answers (`carryHarperDiagnosticsAcrossEdit`), so they do not blink out. An atomic
  edit (a fix, a `[?]` insertion, a performer or section-header pick, a performer rename, the
  toolbar paste that replaces the document) drops only the findings it touched; any other edit
  (typing, a keyboard paste, a drop, undo) drops every finding on a line it changed. The same
  text re-linted for a new key (the language detector loading, a language or performer
  change) keeps every Harper finding as it is until Harper answers. A row never drawn before enters above the first drawn row ranked below it, or after
  the last drawn row, and among the absent rows at that point by rank from their last members
  (`keepOrder` in `decisions.ts`), so every native row stays above every Harper row. The order
  returns to rank (`orderDiagnostics`) only when the reader changes what the list shows: a
  severity chip is toggled, the draft changes, the document is replaced wholesale (on the
  snapshot after `leadOnNextSnapshot`), or Review is shown again after being hidden
  (`releaseReviewOrder`, called by `LinterPanel.svelte`). Each of those moments drops the
  state. Pins: `decisions.test.ts` (*keepOrder*), `workbench.test.ts` (*the order Review
  draws*), `Workspace.svelte.test.ts` (*…while a keystroke is re-linted*),
  `LinterPanel.svelte.test.ts` (*keeps the open row where it was drawn…*, *keeps every row where
  it was drawn…*, *returns to rank order when a severity chip…*, *…when Review is shown
  again…*).
- An open grouped row does not move while it is answered or stepped. It reserves its
  explanation's height from the tallest of its places at the current width, measured from an
  `aria-hidden` stack of every place's explanation drawn by `attr()`, and separately the height
  under the explanation, so the rows below stay still when `Fix all` leaves with the last
  sibling. Both are measured unrounded (never `offsetHeight`), grow while the row stays open at
  one width, and are measured afresh when the width changes. A row that falls to one place
  keeps an empty slot of the stepper's height while it stays open. A row that opens with one
  place reserves nothing and draws exactly as it did before decisions. Pins:
  `LinterPanel.svelte.test.ts` (*keeps an answered row where it was drawn…*, *holds the actions
  and the stepper still…*, *adds not even a fraction of a pixel…*, *measures its reserve
  afresh…*).
- Collapse and the chosen place are per draft (the list remounts on a draft switch). A row
  that leaves the current rows takes them with it, even while the list is hidden on another
  tab, so the same question arriving later starts fresh; a row that leaves and returns within
  one snapshot never left. Pins: `LinterPanel.svelte.test.ts` (*forgets a collapse whose row
  left while another tab was showing*, *starts each draft’s rows fresh…*).
- Review's counts use one vocabulary: an issue is one place, a decision is one row. Rows are
  counted from one grouping per snapshot (`unignoredDecisions` and `reviewDecisions` on the
  panel view): the tab badge (`3 decisions to review`), the phone `Review (3)`, `Show tools,
  3 decisions to review`, the severity chips, the filter notes (`2 more decisions hidden by the
  severity filters.`), `N of M`, and the navigator (`Navigate decisions`, `Previous decision`,
  `Next decision`). `Fix N issues automatically` and `Fix all N` count the places their press
  changes. The remainder (`2 decisions left`) and the announcement (`Fixed 15 issues
  automatically. 2 decisions left.`) count the rows in `planBulkFix`'s `remaining`. Pins:
  `RightPanel.svelte.test.ts` (*counts Review rows…*), `LinterPanel.svelte.test.ts`.
- Occurrence suppression and the ignored-list location use the same derived match result.
  Repeated line-number queries share `core/line-numbers.ts` and its indexed lookup.

- A line's cluster count is a small tinted tag in its severity's color: a tint and a hairline
  of the same hue, a semibold tabular count in the hue itself, `--radius-xs` corners. It is
  not a filled disc; the count sits with the type rather than over it.
- In phone task views, tapping an editor underline or count badge opens that finding in
  Review, with the real lyric context and shared actions, inside the decision row that holds
  the tapped place and on that place. A count badge starts with its first finding. Previous
  and Next step by decision and open a row on its first place; the place stepper reaches the
  row's other places. No diagnostic popover or cluster menu opens.
  Hover and native text selection do not navigate. `e2e/mobile-workbench.spec.ts` pins taps,
  the selected occurrence, fixes, focus handoff, and the absence of floating diagnostics.
- Only the reader's own press moves the editor to a finding: a row, a stepper, an underline
  or badge tap, or the lead after a fix or an ignore. The list never navigates because the
  row it shows changed. When the open row leaves because the reader typed it away, Review
  shows another row, but the editor's selection and focus stay where the reader is typing.
  Pins: `MobileWorkspace.svelte.test.ts` (*typing away an open phone finding…*, *opening
  another finding after All findings navigates the editor once*).

- Show, don't ask: selecting a diagnostic previews its fix in the document as a diff; the card
  carries one control labelled with the fix itself (no `Apply`, no `Preview`, no `Cancel`).
  Previewing never scrolls and never focuses the editor.
- An open card can be collapsed by pressing its heading again. Collapsing it, leaving Review,
  or hiding the panels releases that card's preview; returning to Review resumes an expanded
  card's preview. Pins: `LinterPanel.svelte.test.ts` (*collapses the open finding…*,
  *retires the review preview…*).
- Review offers Previous/Next and `Alt-Shift-Up/Down` in the order it draws, one
  decision per step, each opening a row on its first place; `F2` and `Ctrl-Alt-.` in the
  editor still step by place. These
  commands and opening a card reveal the lyric range without taking keyboard focus from the
  panel. Text fields, IME composition, and visible pickers keep ownership of their keys. Removing a finding resolves focus against the newly rendered rows, whose keys never
  include their array index. Pins: `LinterPanel.svelte.test.ts` (*moves between findings…*,
  *keeps the next row mounted…*, *hands keyboard focus…*).
- Applying a fix hands the workbench to the next finding (`leadAfterFix`). A fix or an ignore
  on one place of a decision leads first to that decision's next place in document order,
  wrapping within it, so its row stays open and still; otherwise a deliberately
  selected passage advances to the next finding in document order from that passage, wrapping
  to the lead when none remain after it. Default triage leads with the row Review draws first.
  Both leads read the drawn rows, not a fresh ranking, so the panel and the selection agree on
  what comes next. Pins: `workbench.test.ts` (*continues from a deliberately chosen passage…*),
  `LinterPanel.svelte.test.ts` (*leads to the row drawn first…*). Any wholesale
  document replacement arms the same advance through `leadOnNextSnapshot`, which
  `replaceDocument`'s `aroundReplace` hook hands the dispatch: it arms before the dispatch,
  disarms if the dispatch throws, and never runs on a paste that failed.
- One document, one diff: the preview slot belongs to whichever surface mounted last, and a
  surface leaving hands it back (`shownPreviews` in `DiagnosticActions.svelte`).
  `selectDiagnostic` does not clear the preview.
- A hovered diagnostic also dismisses on Escape while focus remains elsewhere. It preserves
  that focus and leaves an already handled Escape or a native modal's Escape with its owner.
  Document-bubble dismissal precedes the window transport fallback regardless of binding order.
- The fix-preview insert widget must override `ignoreEvent` (mousemove only) and resolve
  through `posAtDOM`, or the inserted half of the diff is a dead zone.
- A live IME/dead-key preedit maps the settled diagnostic underline and diff preview through its
  provisional transaction. It does not erase either, expose the stale diagnostic for interaction,
  or re-lint before composition commits. The shared predicate is `isCompositionChange`; pin:
  `EditorPane.svelte.test.ts` (*keeps every settled context decoration…*).
- `presumedCorrect` findings lead with `It's correct` in the contrast tier; it is `onIgnore`
  under the hood, per occurrence. `acceptsAsCorrect` is one derived answer for both surfaces.
  No catalog rule sets `presumedCorrect` today. Its last producer, the ad-lib wrap offer, was
  retired (see *Some findings lead with the answer that nothing is wrong*), but the shell
  contract stays pinned in `diagnostic-parity.svelte.test.ts` for the next judgment-call rule.
  `section.header-unrecognized` still leads with `It's correct`, recognized by id.
  Two acceptances stand in the ignore slot instead of leading: `It really is unintelligible`
  (`unknown.unresolved`) and `The performer is unknown` (`performer.inline-mismatch`). The
  quiet `Ignore` is what each replaces, and `acceptsDiagnosticAsCorrect` in `ignore.ts` is the
  one predicate the button, the key's `accepted` marker, and the toast all read.
- A finding that declares `identityText` keys its per-occurrence ignores on that string in
  place of the flagged text (`performer.inline-mismatch` keys on the voice's name, never the
  lyrics it flags), and the picker's unknown-voice chip writes the acceptance itself at mint
  time (`unknownVoiceAcceptanceKey`, recorded via `recordAcceptedOccurrence`). The round trip
  is pinned in `workbench.test.ts` (*a minted unknown voice arrives accepted…*). The three
  style-derived unknown names are equivalent during matching so an automatic slot-order restyle
  does not revoke that acceptance; pin: `ignore.test.ts` (*keeps the acceptance when slot-order
  insertion restyles the unknown voice*).
- Restorable occurrences name their current section and line through the same occurrence
  matching that suppresses them; the location reveals the lyrics without restoring the finding.
  The section hides when no saved choice matches, without deleting those choices.
  While at least one matches, an unmatched saved choice says `No matching finding in the current lyrics` and offers no fabricated location.
  Pin: `RightPanel.svelte.test.ts` (*distinguishes matching ignored words…*).
- An ignored occurrence belongs to its 'scribe until the reader explicitly restores it (or the
  'scribe is deleted). A lint pass in which the occurrence is absent does not erase that decision;
  if later edits recreate the occurrence, it stays hidden. Pin: `workbench.test.ts` (*keeps an
  ignored diagnostic hidden when edits remove and later recreate it*).
- `Fix all N` batches by rule *and* fix label; the linter's bulk fix plans over the visible
  diagnostics only; a batch is one `AtomicDocumentEdit` (`mergeFixes` drops `selectionAfter`).
  `Fix all N` counts diagnostics, not fixes. The count comes from `countDiagnosticFixBatch` on
  the contract, never the editor's own arithmetic.
- One diagnostic, one implementation: `src/lib/diagnostics/` owns everything from the meta
  line down, shared by the panel card and the popover;
  `diagnostic-parity.svelte.test.ts` renders both and compares them. The directory sits
  outside `src/lib/ui/` because the editor may not depend on the shell.
- The panel's rank (`orderDiagnostics`) puts provider first (native, then Harper), then
  severity, then position, a pure function of the findings, pinned in `order.test.ts`. Review
  draws that rank after each release and then keeps rows where they were drawn (above), so the
  drawn order also depends on what was drawn since the release; it still keeps every native
  row above every Harper row. The editor's document-order
  sorts are deliberately untouched. `harperRuleIds` lives in `harper-ids.ts` so `order.ts`
  never pulls the WASM bridge's imports.
- A diagnostic's facts are one line (severity glyph, line number, citation) with the
  citation's section and verified date in its tooltip (`aria-describedby` there, because the
  visible tooltip is the only copy). Two or more citations fold behind `Sources ⌄`.
  The line number is a small tabular tag on a fill step. The citation is present but quiet:
  the meta line's muted tone, medium weight, no underline and a greyscale favicon at rest;
  under the pointer or focus it takes the text color, its underline and the favicon's color.
  The external-link mark stays at rest, so leaving the page is never carried by color.
  A decision row that opens on a quiet control draws it flush with the text above.
- Expanded native findings offer `Read the guide` in the shared actions row, linking to
  their published `/guidelines/checks/[rule]/` page. The lightweight shipped manifest and
  existing slug helper own the mapping; Harper and unknown IDs get no fabricated page.
  Like citations, this link opens a new tab with an icon and accessible disclosure, keeping
  the draft, selected passage, and preview in the original workbench. It does not replace
  external citations or add another disclosure. Pins: `guide-link.test.ts` and
  `diagnostic-parity.svelte.test.ts`.
- The card is the control all the way down: the stretched `::after` hit layer is measured
  against the `<li>`, the head stays unpositioned, and only interactive controls lift over it.

## Decision record

### Entrance motion belongs to the initial list

Putting an entrance in each card would animate every newly rendered finding while someone
is reviewing or typing. The workspace attachment instead handles the first visible list of each opened ’scribe as
one bounded group, without changing row identity or provider order. A temporary prepaint mask
prevents a flash before rows reveal in sequence; a two-second limit reveals everything if
startup is slow. Interaction cancels the effect and restores full opacity immediately,
preserving stable controls during review; popovers remain unchanged.

### Checking availability is distinct from a clean draft

Before the native catalog has loaded, nonempty lyrics show Checking lyrics in the existing
empty-list surface with a live status. A refused download shows Checking unavailable and
Retry checking, while the workspace also toasts and announces the refusal. Only a completed
native pass can produce No issues found. An untouched empty editor still shows Ready for
your lyrics. The same availability props travel through the lazily mounted document panel,
so opening Review while a download is pending cannot turn an unchecked draft into a clean one.

### Controls follow the occurrence while fixes follow the current revision

The row key formerly embedded absolute offsets. A character inserted at the beginning of an
80-line diagnostic-heavy document destroyed all 139 finding rows, recreating their controls
and losing keyboard focus even though the findings had merely moved. `row-identity.ts` now
maps the preceding snapshot's occurrences through actual editor changes. Only a matching
current range, unchanged flagged text, and unchanged message inherit the presentation key.
Actual diagnostic keys and fix revisions remain current; presentation continuity never carries
an old edit forward. The same mapping follows the selected related occurrence.

Composition combines its withheld changes before publication. Multiple changes in a batch
can therefore retain unaffected findings between them; an inserted identical chorus gets new
controls while the original choruses retain theirs. A whole replacement or missing/stale
mapping cannot guess this continuity. Tests cover these distinctions and verify surviving DOM,
focus, current fix offsets, and control geometry at desktop and phone widths with wrapped text.

Snapshots are immutable replacements in the shell, so `editor-session` stores them with
`$state.raw`. There are no in-place snapshot writers requiring proxies around every parsed
line and diagnostic. Occurrence matching prepares each candidate's immutable context once;
the panel, suppression, and ignored-list locations share its result. Repeated line lookup uses
one indexed implementation, including the shared LF, CRLF, and lone-CR convention.

### Phone review opens one decision beside the lyrics

The mobile overview suppresses default card expansion and its preview. Opening a row
reveals the editor before navigating to the passage, then displays only the selected row.
The same DiagnosticList and DiagnosticDetails own ordering, actions, preview lifetime, and
focus as desktop. All findings returns to the overview; Write and Tools release previews.
Previous/Next and automatic advancement reveal the next passage without opening the keyboard.
Reveal is keyed to the diagnostic identity so a selection snapshot cannot create a navigation
feedback loop. Hidden rows are absent from layout and the accessibility tree. Once the last
finding disappears, focus can return to the visible mobile Review control.

An editor tap uses this same decision surface. Desktop popovers and cluster menus can
extend beyond a phone viewport, and making a second diagnostic surface fit would still
leave two competing ways to review. The shell passes `diagnosticsInPanel` using the task-view
query; the editor suppresses hover overlays and routes deliberate presses through
`onDiagnosticReviewRequest` in the callback proxy. The shell selects the finding, reveals
it after Review has laid out, and focuses its heading to dismiss the software keyboard.
Dragging a text selection remains an editing gesture.

Pin: `e2e/mobile-workbench.spec.ts` (phone review fix flow and editor diagnostic taps).

### Show, don't ask

The best confirm step is the one that never has to happen. Where a change can be shown in place,
show it and offer only the control that keeps it. Do not make the user ask to see it first.

Diagnostic fixes work this way. Selecting a diagnostic (hovering its underline in the editor, or
expanding its card in the linter panel) previews its fix in the document as a **diff**: the text
the fix would drop stays put, struck through, and the replacement sits beside it. Nothing is
hidden and nothing is applied. The card therefore carries one control for the fix, and no
`Preview` or `Cancel`: closing the card is what abandons the change. Previewing is silent and
never scrolls: it happens because a diagnostic is selected, not because the user issued a
command, and whatever selected it has already brought the range into view.

**That control is labelled with the fix, not with a verb in front of it.** Fix labels are already
commands (`Replace with Don't`, `Remove markup`, `Use Refrain`), so `Apply Replace with Don't`
says the same thing twice and reads as two controls crammed into one. The label is the whole
button, and no `aria-label` repeats it back with `Apply:` in front: the visible text is the
accessible name.

**Applying a fix hands the workbench to the next finding, wash included.** The applied card
empties and the panel leads with another diagnostic, but nothing in the document said where that
one sits: the full-line wash stayed on the line the fix had landed in, describing a caret that
was no longer anywhere the user was looking. So the shell selects the leading diagnostic's range
as soon as the fix's re-lint arrives, which moves the wash onto it and previews its fix in place.
It does not reveal deliberately, because the selection's own nearest-edge scroll is enough and a
fix applied to a line already on screen must not throw the document around. It also does not
change which panel tab is showing. The panel's reading order and the order the state follows are one
sort, in `src/lib/diagnostics/order.ts`, because the two disagreeing would leave the wash on a
different finding than the open card.

The editor is deliberately left unfocused through all of this: pressing a control in the panel
already blurred it, and a hovered popover's fix no longer hands focus back either (only its
keyboard-opened twin does, as with dismissal). A wash with no caret in it reads as a location;
a caret parked on text the user never chose would arm their next keystroke over it.

**One document, one diff, and two surfaces that both want it.** A selected diagnostic showing no
preview is the failure this invariant exists to prevent, and it had two causes, both of them one
surface reaching into a slot another one owned. Hovering an underline highlights the finding, which
expands its card, so the panel card and the popover are routinely mounted over the same fix, and
the popover leaving cleared the diff the still-expanded card was showing. The slot therefore
belongs to whichever surface mounted last, and a surface leaving **hands it back** to whoever is
still open rather than clearing it (`shownPreviews` in `DiagnosticActions.svelte`). That also makes
teardown order irrelevant, which matters because moving the panel's selection destroys one card and
creates another in the same flush.

**And selecting a diagnostic does not clear the preview, because selecting one is what asks for
it.** `selectDiagnostic` used to clear first, on the reasoning that the outgoing card's diff had to
go, but the outgoing card's own unmount already retires it, and clearing here silently undid the
request whenever the card was _already_ open on that diagnostic, which is every press on an
expanded card's own row.

**A pointer on the replacement text is a pointer on the finding.** The struck-through half of the
diff is inside the underline and always resolved; the inserted half is a widget outside every mark,
so it revealed nothing and the more interesting half of the change was a dead zone. Two things it
needs, and the second is the one that costs an afternoon: `diagnosticAtPointer` resolves
`.ll-fix-preview-insert` through `posAtDOM` (a widget has no text under it to read coordinates
against), and the widget has to override `ignoreEvent`. CodeMirror stops at the first `ignoreEvent`
on the way up from the target, so a widget swallows every plugin handler by default and the hover
watcher never ran at all. Only `mousemove` is let through: the diff is not text, and a press must
not put a caret inside a change nobody has applied.

Implementation: `src/lib/editor/extensions/fix-preview.ts` renders the diff,
`src/lib/core/fix-preview.ts` picks the fix, and `src/lib/diagnostics/DiagnosticActions.svelte`
binds it to its own mounted lifetime, which is the open/close lifetime of whichever surface
rendered it, plus the hand-off above. `leadAfterFix` in `src/lib/ui/state/panel-view.svelte.ts` is
the advance, consumed on the snapshot that dispatch emits.

**A fix is not the only edit that needs the advance.** Anything that replaces the whole document
(loading the sample, pasting into an empty draft) lands the panel on a leading finding while the
wash sits wherever the edit left the caret, which is the same failure with a different cause. So
the arming is its own call, `leadOnNextSnapshot`, and `replaceDocument` in
`editor-session.svelte.ts` makes it through the `aroundReplace` hook rather than each caller
remembering to. It has to run _before_ the dispatch, because the editor emits the re-linted
snapshot from inside it, and it must not run on a paste that never reached the document, because
a lead left armed fires on whatever the user types next.

### Some findings lead with the answer that nothing is wrong

Most of the time the reason a diagnostic is on screen is that the text is wrong and the fix is
what the user came for, so the fix takes the card's one contrast tier and the way out is a quiet
`Ignore` after it. A few findings are the other way round: they are a guess about intent, and the
likelier answer is that the words are already right. There the quiet `Ignore` is replaced by
`It's correct` (an affirmative control, with a check, in the contrast tier, **leading the row**),
and whatever change the card also offers steps down to bordered, because a surface has one
contrast action.

One finding is like that today, and one was. The one that was is the reason the mechanism
knows its limits.

**A custom section header is the whole of its rule.** `section.header-unrecognized` cannot vouch
for `[Chor]`, and says so; a rule that never has anything else to report can be recognised by its
id, which is how the card has always known.

**An ad-lib after a comma was the other, and leading with the accepting answer did not save it.**
Parentheses mark a vocal sitting _behind_ the lead, so an ad-lib the singer is performing as part
of the line belongs exactly as it is written. Most of what `adlib.parentheses` pointed at was
already correct, and offering `Wrap as (Yeah)` as the loud answer was the linter asserting
something it cannot hear. `presumedCorrect` was the first repair: on the diagnostic rather than
read off the id, because the rule's _other_ finding, a parenthesized `(yeah)` wants a capital,
is a fact about the text and keeps the ordinary shape, so one rule carried two shapes. It was not
enough. Measured against real transcription, a rapper performing `Ayy` as the end of the line is
at least as common as a backing vocal there, so the card was wrong about as often as it was
right, and a finding whose base rate is a coin flip is churn whichever button leads, because every hit
still costs the transcriber a read and a press about something only they can hear. The
presumed-correct wrap offer is retired; what came back in its place (rule version 6) is the same
comma-and-line-end shape gated on the one thing that proves the form wrong either way: a
titlecased ad-lib, `, Ayy`, which mid-line convention allows in neither reading. That finding
needs no `presumedCorrect`, because it is not a guess: it offers `Replace with ayy` and
`Wrap as (Ayy)` and lets the transcriber say which repair their ears heard.
`adlib-parentheses.test.ts` pins that the lowercase form is never flagged. `presumedCorrect`
survives as the mechanism for the next judgment-call finding, with this as the calibration
note: it softens a guess that is usually wrong to flag at all, it does not license one. The
repair here was not softening the coin flip but finding the narrower predicate on which the
claim stops being one.

That is also why `It's correct` is `onIgnore` under the hood and not a new hook. An ignore is
per-occurrence (`diagnostics/ignore.ts` keys on the rule, the message, the text and its
surroundings), so accepting one occurrence says nothing about the next one. Only the words on the
button change, and they change because the user is being asked a different question.

**A styled voice nobody can name yet gets the same slot-standing answer.**
`performer.inline-mismatch` reports an unknown voice, one styling the legend does not account
for, and in the formatting-first workflow that state is often exactly what the transcriber means: they
heard a distinct voice and cannot name it. `Ignore` there asked them to *set aside* a finding
they in fact have an answer to, so the slot's words are `The performer is unknown`, the same
shape `It really is unintelligible` takes for `unknown.unresolved`: recognized by id, standing in
the ignore slot rather than leading, with the guided `Assign section performers` beside it as the
path for whoever can name the voice. Per-occurrence keying is what makes this honest: the key
carries the slot's first span and its surroundings, so confirming the italic voice unknown says
nothing about a bold voice added later, and the acceptance lists as accepted, not ignored, in the
preferences panel. The regression is in `DiagnosticDetails.svelte.test.ts`, beside the guided
assignment's own.

**An acceptance about a voice must not be keyed to the words it sings.** As first shipped, the
answer above did not stick. The occurrence key carried the flagged text (the styled span's own
lyrics), and matching gates on that part exactly, so editing anything between the tags orphaned
the acceptance, the next settled lint used to prune the orphan from the store, and the card asked
`The performer is unknown` again. In a workflow whose whole point is going on transcribing that
voice, every rewrite of its line re-asked a question already answered. The rule now sets
`identityText` on its findings: the voice's name, `Unknown italic voice` and kin, the one
wording `unknownVoiceName` in `legend-cleanup.ts` owns and the picker's chips already speak.
`identity()` in `ignore.ts` keys the text part on it when present. The claim is keyed on
what it is about; the context parts go on ranking which same-named occurrence is meant, so
confirming one section's italic voice still says nothing about another's. The second half of the
annoyance was the workbench arguing with itself: the picker's unknown-voice chip *is* this
card's answer, so `createUnknownVoiceEdit` in `Workspace.svelte` writes the acceptance as it
applies the wrap. `unknownVoiceAcceptanceKey` builds the key against the pre-edit document,
which is sound because matching gates only on the three parts knowable before the finding
exists, and the finding then arrives already accepted. The round trip (minted, hidden on
arrival, still hidden after a full rewrite of the lyrics inside the tags) is pinned in
`workbench.test.ts`. Keys stored before this change carry lyrics in the text part and now match
nothing, so a pre-existing acceptance is re-asked once and then durable.

**Restyling an unknown voice does not make it a different voice.** Named performer assignment can
insert a new canonical slot ahead of an unknown one, moving the unknown from italic to bold (or
bold to bold italic) while its lyrics and section remain the same. The visible/accessibility name
still describes the current styling, but `matchIgnoredDiagnostics` treats those three
style-derived names as equivalent for `performer.inline-mismatch` only, then uses the existing
context and distance ranking to follow the same occurrence. Without that narrow equivalence, the
automatic repair would immediately ask `The performer is unknown` again about a voice the reader
had already answered.

**An absent lint result does not retract the reader's decision.** The store once pruned any saved
occurrence that failed to match the latest settled lint result. That treated a transient state of
the text as an explicit Restore: remove or interrupt a marker, keep editing, and recreate it, and
the diagnostic returned even though the reader had already answered it for this 'scribe. Saved
ignores now remain until Restore is pressed or the 'scribe itself is emptied or deleted. Matching
still keys suppression per occurrence, so the retained decision does not hide a different finding
merely because it comes from the same rule.

**A new `[?]` does not make it a different unintelligible.** `unknown.unresolved` is one card per
document carrying the count in its message, so adding another marker rewrites the message without
changing the question. `matchIgnoredDiagnostics` treats every `unknown.unresolved` message as the
same occurrence for that rule only, then uses the existing context and distance ranking to follow
it. Without that narrow equivalence, each new `[?]` re-asked `It really is unintelligible` with
the new total even though the reader had already answered it for this 'scribe.

Implementation: `presumedCorrect` and `identityText` on `Diagnostic` in `src/lib/core/types.ts`
(`presumedCorrect` currently with no catalog producer); `acceptsAsCorrect` in
`src/lib/diagnostics/DiagnosticActions.svelte`, which is one derived answer for both surfaces.
`diagnostic-parity.svelte.test.ts` renders the card and the popover and compares the row.

### A batch repeats one change, not one rule

Two controls fix more than one finding at a time, and what separates them is what the user has
already been shown.

**The card's `Fix all N` batches by rule _and_ fix label together.** A card previews exactly one
fix as a diff, and that diff is the whole evidence for pressing anything beside it, so the batch
may only hold edits the preview honestly stands in for. Batching by rule alone is the tempting
wrong answer: it sweeps `til` → `'til` into a card showing `Imma` → `I'ma`, both
`spelling.standardized`, neither one the change on screen. The label is the right key rather than
a lucky one, because fix labels are written to name the change, so two fixes share a label
exactly when they read as the same command. The control appears only above one occurrence
(`Fix all 1` is a second button for the press already beside it) and never for a `preview` fix,
which is the kind that exists to be confirmed one at a time.

**The linter's `Fix N issues automatically` batches every safe fix in the panel.** Both plan over
the _visible_ diagnostics. A severity chip switched off is a statement about what the user means
to deal with, and reaching past it is the one thing bulk fixing must never do, as is reaching
past an ignored rule.

**A batch is one `AtomicDocumentEdit`, always.** Every fix in it carries the same `baseRevision`,
so dispatching them one at a time makes the second stale and hands the user one undo step per fix
for something they pressed once. `mergeFixes` drops `selectionAfter` on the way: a batch spread
down the document has no single place for the caret, and `leadAfterFix` is about to select the
leading remaining finding anyway, exactly as it does after a single fix.

Counts were of diagnostics, not of fixes, because the strip's two numbers were read as one
sentence about the list underneath and had to add up to it. That rule is superseded by *Review
draws one row per decision*: the button still counts the diagnostics its press changes, and the
remainder counts the rows the press leaves, so the two no longer add up to one number.

Implementation: `src/lib/rules/bulk-fix.ts` (keys, arbitration through the existing
`collectSafeFixes`, and the merge), `applyFixBatch` / `applyBulkFix` in
`src/lib/ui/state/panel-view.svelte.ts`, and the card's control in
`src/lib/diagnostics/DiagnosticActions.svelte`, the shared row, so the popover and the panel
card cannot offer different batches for the same fix. The shell answers the count for both
surfaces (`countDiagnosticFixBatch` in `src/lib/editor/contracts.ts`); an editor that counted its
own would disagree with the panel.

### Review draws one row per decision

A lyric pasted from a notes app produced 26 cards that were 3 decisions: 15 curly apostrophes,
10 line-end commas, and 1 unlinked repeat. Reading the list meant scrolling past the same
message again and again, and each fix moved the next identical card into place under the
pointer. The list now draws one row per decision and opens one place at a time inside it.

The key keeps the message because the row shows one message, and that message has to be true
of every place under it. `fixBatchKey` has no message, so it would put the opening and the
closing curly quote under one message that is false for half of them. Severity is in the key so
a row never straddles a severity chip, which keeps the chip counts equal to the rows drawn.
Findings with related ranges or a detected language describe something larger than their own
place, so they never fold.

The card inside the row is the existing per-place card, unchanged, so the panel and the popover
stay one implementation. The open place is held by its row identity, never by its index: an
answered place hands over to its decision's next place through `leadAfterFix`, and the
`{#key}` around the card means another place never inherits its controls. The stepper sat
under the actions, so its arrival and departure never moved them (superseded by the second fix
round below: it now sits under the meta line). G1 adds no batch for
`preview` fixes and no group-wide Ignore: ten commas are still ten presses, each with its
diff on screen.

Counts follow the rows, because the badge and the chips describe the list a reader works
through. The bulk command is the exception: it changes places, and its count says how many.

The first version had four ways to move what the reader was aiming at, and an audit found each.
The meta line read `10 places, lines 8 to 33`, which beside the derivation mark and a folded
`Sources` broke onto a second line with a stray separator, so the count stays on the meta line
and the place's line moved into the stepper (`Place 2 of 10, line 9`); the `lines 8 to 33`
wording is superseded. A row sorts by its first place, so answering that place re-sorted the
open row by its next one, and `Don’t` on line 2, a comma on line 3, and `I’m` on line 4 slid
the open card below the comma row; an answered row then held its slot until it left (superseded
by the second fix round below: rows never reorder on their own).
`section.header-prose` gives `Chorus`, `chorus`, and `CHORUS:` one row whose explanations quote
each header and wrap differently, so the explanation reserves its tallest place's height,
measured at the current width from text drawn by `attr()` so it stays out of the page's text.
And a row that fell to one place lost its stepper and lifted the rows below, so the body kept
its tallest height while open (superseded in part by the second fix round below).

Content keys made a row's collapse outlive its draft: collapsing the curly-apostrophe row in
one draft opened the next draft's curly-apostrophe row collapsed. The list remounts per draft
and forgets a choice whose row has left. The stepper's live region announced the place after
every fix, on top of the fix's own announcement, so the place is said only when the stepper is
pressed. `countDecisionsLeft` re-derived `planBulkFix`'s settled test beside it; the plan now
returns `remaining`, and its old promise that the two numbers add up to the list is gone.

The second fix round replaced the held slot, because an audit found it wrong in both halves. A
held row was put back after the row that came before it, so it followed that neighbour: with
X on lines 1 and 40, A on 2 and 30, Y on 5, and Z on 10, answering A's line 2 in the panel and
then X's line 1 in the editor ranked X by line 40, and A, still open, dropped two slots behind
it. Only presses inside the panel started a hold, so the popover, `Mod-.`, the bulk strip, and
another row's `Fix all` moved rows too. And a hold outlived the row closing: with an error
above a held warning, turning the Errors chip off and on drew the warning above the error
until every place in it was answered. The rule is now that rows never reorder on their own.
The panel view keeps the drawn order from one snapshot to the next, because it sees every way a
place is answered and because the lead after a fix has to read the same order the list draws;
a list that kept its own order would open one row while the panel led with another (the
snapshot-to-snapshot memory is superseded by the third fix round below). Returning
to rank order when the reader changes what is shown (a chip, a draft, a wholesale replacement,
Review shown again) is the intentional structural change `DESIGN.md` allows. The passage lead
still advances in document order, which `workbench.test.ts` pins; only the rank-based lead and
its fallback now read the drawn rows.

The same audit found four smaller faults. At 390 by 844 the open comma row was 404 pixels tall
in a 368 pixel scroll area, and the stepper under the actions sat behind the bottom bar, so it
moved under the meta line, beside the count it explains. The body's reserve came from
`offsetHeight`, which rounds, so an open row was half a pixel taller than before decisions
(154.5 became 155) even with one place, and it never shrank, so widening the panel left a blank
band. Both reserves are now unrounded, kept only for a row that opened with several places, and
measured afresh at a new width; the body's became the height under the explanation, measured
without it, so neither reserve feeds on the other. On a phone the editor learns of a new place
a tick late, so the stepper read its own button before it was disabled and focus dropped to
the page; the handoff is now decided from the target place. And the list only refreshed its
rows while visible, so a collapse survived its row leaving on another tab; the forgetting now
reads the current rows.

The third fix round made the drawn order remember rows that are away. Every typed edit
publishes the native findings first and Harper's about 250 ms later, so the first snapshot after
a keystroke has no Harper rows. Remembering only the last snapshot's keys meant every Harper row
returned as a new row, entering after the nearest drawn row ranked above it. With a curly
apostrophe on lines 2 and 6, a line-end comma on line 3, and Harper's `sentnce` on line 4,
answering the apostrophe's line 2 in the panel and typing one character elsewhere put the
grammar row above the comma within 300 ms and moved the comma row from 526 to 600 pixels; two
Harper rows held out of rank snapped back to rank on the next keystroke. The panel view now
keeps every row drawn since the last release, which grows only with the distinct rows seen
until a chip, a draft, a replacement, or Review shown again drops it. A new row anchors on the
drawn rows (above the first one ranked below it, or after the last one), as the round's brief
specified, but appending it at the very end of the remembered rows would put a native row
typed while Harper's rows are away below them once they return, so within the absent rows at
that point it goes by rank from their last members. A seeded run of snapshots in
`decisions.test.ts` pins that every native row stays above every Harper row. The same round
found that `leadOnNextSnapshot` stayed armed when the replace dispatch threw, so the next
keystroke reordered the list and moved the selection; the panel now runs the dispatch and
disarms on a throw. Arming still comes first, because the editor emits the replacement's
snapshot from inside the dispatch.

Remembering slots kept the order, but the live check still failed: on every keystroke each
Harper row was gone for about 280 ms, and an open Harper row came back closed, lifting the rows
below it by 36 pixels. Harper's unaffected findings were carried across a fix but not across a
typed edit, for no recorded reason; the carry now runs on every edit that changes the text. After
a typed edit, a finding on any line the edit changed drops until Harper answers, not only one the
edit touched; an atomic edit keeps the narrower rule, because it is one known replacement:
a word typed one letter at a time only grows at its own edge, so a finding on `Walki` would have
stayed on `Walking` with an applicable fix, and `a` flagged before `apple` would have kept
offering `an` after `apple` became `banana`.

### One diagnostic, one implementation

The expanded card in the linter panel and the popover anchored under an underline are the same
finding seen from two places. They therefore share components rather than mirroring each other by
hand. The previous pair had drifted into two source lists, two ignore labels, two fix buttons,
and a severity tag in only one of them.

`src/lib/diagnostics/` owns everything from the meta line down: `DiagnosticMeta.svelte` (the one
line of facts, built from `SeverityTag.svelte` and `SourceCitation.svelte`),
`DiagnosticActions.svelte` (every decision about a diagnostic, in one row, in one order, plus the
fix-preview lifetime), and `source-url.ts` (no citation is ever linked without going through it).
`SourceLink.svelte` is the block form of a citation and is no longer part of a diagnostic at all;
it belongs to the tools panel's reviewed-source snapshot. The directory sits outside
`src/lib/ui/` on purpose: the editor may not depend on the shell.

Each surface keeps only its own chrome (a row in the run of cards, or a floating overlay) and
the panel's line number, which is the one thing its meta line carries that the popover's does not
(the popover is anchored under the underline it describes). The hovered popover's action row is
the panel card's action row exactly; only the keyboard-opened one adds a control (see below).
Anything else that appears on one and not the other is a bug, and
`src/lib/diagnostics/diagnostic-parity.svelte.test.ts` renders both and compares them.

### The panel reads reviewed rules first, and Harper only after all of them

`orderDiagnostics` is worst-first-then-down-the-document, and it now ranks the **provider** ahead
of both: every native finding, then every Harper one. That is a layout bug's repair, and the bug
was the visible half of something worse.

Harper is a WASM proofreader that answers about 250ms behind the rule engine, so **every edit
publishes twice**: the native findings at once (with Harper's findings the edit did not touch
carried across it), then the union re-sorted when Harper lands
(`scheduleHarper` in `Workspace.svelte`, `mergeHarperDiagnostics`). Interleaved by severity and
position, a Harper finding earlier in the document than the card the reader is on was _inserted
above it_ on that second publish. After a fix that card is the one `leadAfterFix` has just
expanded, so the tall open card (the one whose button the pointer is aimed at, in a panel whose
whole use is pressing fixes in a run) slid down a row on a delay.

Underneath it, `leadAfterFix` was choosing that card from an **incomplete list**: the lead is
picked on the native-only publish, and a late arrival can change which finding is actually first,
leaving the wash on one finding and the open card on another. That is precisely the disagreement
the single sort exists to prevent. Ranking the provider fixes both, because a late Harper finding
can now only ever land _below_ every native card and never above the lead.

Three things about it:

- **It is a rank, not a rule about arrival.** The rank stays a pure function of the findings, so
  the same document lists the same way whether Harper answered first, last or twice. Sorting late
  arrivals to the bottom _because_ they were late would make the list depend on history and this
  sort unrepeatable; `order.test.ts` pins the two orderings against each other. (Review's
  drawn order has depended on history since G1, by design: rows stay where they were drawn
  until a release. It keeps the guarantee that matters here, every native row above every
  Harper row; see *Review draws one row per decision*.)
- **It says something true.** A reviewed rule cites a Genius guideline and carries a checked
  example; Harper is a general-purpose English proofreader that cites itself and knows nothing
  about lyrics. The merge already lets any native finding win a shared range, and the reference
  names Harper and gives it no pages. Reading order now agrees with both.
- **The editor's own sorts are deliberately untouched.** `lint-decorations.ts` orders marks and
  badges _in the document_, where position is the only order that means anything and a provider
  rank would shuffle the marks on one line. This is the panel's reading order, and the panel is a
  list.

`harperRuleIds` moved to `src/lib/rules/harper-ids.ts` for this and is re-exported from
`harper.ts`. `order.ts` is imported by the editor as well as the shell, and `harper.ts` statically
pulls the language registry and the spelling table on its way to the WASM bridge, so asking it
"is this Harper's" there would drag the grammar integration into every chunk that sorts a list. A
second copy of the three strings was the other way out, and it is the one this file keeps a rule
about.

### A diagnostic's facts are one line, and its provenance is on it

The card used to open with a filled severity badge on a line of its own and close with a footer of
block citations, each spelling out its section and verified date. Two blocks of chrome, top and
bottom, for facts that read as one sentence, and between them the reader had to travel the whole
card to learn where the finding was and what said so.

They are one line now, under the message: **severity, line number, citation**, interpuncts between
(`DiagnosticMeta.svelte`). The severity is a colored glyph, not a chip and **not a word**, and
therefore no interpunct follows it, because an interpunct separates facts of the same kind and the
mark that opens the line is not one of the words in the list it introduces. The
citation is a link and only a link; **which part of the page was cited and when it was last
verified are the link's tooltip**, because that is what a reader checks before following it rather
than something they need in front of them on every card.

- The tooltip is `position: fixed`, measured from the link when it opens. The citation sits inside
  the linter panel's scroller and inside the editor popover's, either of which clips a box that
  stays in flow.
- The description is in the accessible tree whether or not the tooltip is showing, through
  `aria-describedby` on the link. The visible tooltip is the same text drawn again and is
  `aria-hidden`, so nothing is announced twice; a screen reader cannot produce a hover.
- **One citation is inline; two or more fold behind `Sources ⌄`.** Two links on the meta line wrap
  it onto a second and a third row, which is the layout this section exists to prevent. The
  label names what is behind it and does not change (`aria-expanded` and the chevron carry the
  state), and unfolded, each citation is the inline one exactly, tooltip included.

The panel card also changed shape for this. The row is still the control, but the button no longer
_contains_ the head: an `<a>` inside a `<button>` is neither valid nor reliably pressable. The
button holds the message and stretches its hit area over the row with an inset `::after`, the
citation and its disclosure ride above that layer with `z-index`, and hover and the focus ring
are read off the head with `:has()`; off the button alone they would light up only the message.

**The card is the control all the way down, not just at its head.** Expanded, it is the message,
the meta line, the explanation, and the decisions; only the first two used to open the diagnostic,
so half the surface the reader was looking at did nothing. The stretched layer is measured against
the `<li>` (which is why the head is deliberately unpositioned, a containing block there stops
the layer at the head's own bottom edge), and what does something else is lifted over it. That is the
**buttons**, not the row holding them: lifting `.diagnostic-actions` would make its whole band dead,
and the slack beside the last control is card, exactly as the head's padding is. The one thing this
costs is selecting the explanation's prose with the pointer, which is the trade a card that is a
control makes anyway.


### A review can pause, and a keyboard review keeps its place

The first finding still starts expanded, but it is a starting point rather than a permanent
preview. Pressing an expanded heading collapses it and releases its preview slot. A hidden
Review panel also stops mounting its details: an invisible card cannot own a diff over the
lyrics or reclaim the slot after an assistant proposal leaves. Reopening Review resumes its
selected card unless the reader explicitly collapsed it.

The card reveals the range without focusing the editor, so keyboard users can open an
explanation and continue through its decisions. Previous and Next name the panel's existing
reading order and disclose their `Alt-Shift-Up/Down` twins. (Superseded in part: since *Review
draws one row per decision* they step by decision and are named `Previous decision` and `Next
decision`.) Row identities no longer contain an
array index: removing one finding must not destroy every subsequent control. A removing action
finds the surviving expanded row after rendering and focuses its heading, with the remaining
row or Review tab as the fallback.

There are two valid ways into review. Default triage works the list from its lead (since
*Review draws one row per decision*, the row drawn first rather than the ranked first), while
someone who deliberately selects a passage has already said where to work. After that person's
fix or acceptance, choose the next remaining occurrence from that passage in document order,
wrapping to the ranked lead only when the rest of the passage is clear. Whole-document
replacement resets this choice and leads the new document as before. The display order stays
provider-stable; no delayed Harper answer inserts itself above the reviewed rules.

Repeated choruses also repeat the text shown in the ignored list. A stored choice is matched
against the current diagnostics with `matchIgnoredDiagnostics`, the suppression's own answer,
and its section and current line become a reveal control. Revealing does not retract the
choice. A choice that currently matches nothing keeps Restore but says so, rather than showing
an old offset as though it still located the occurrence.


### Saved review choices have a readable hierarchy

The hidden findings list leads with the saved text, followed by the rule name and current
location in muted text. Restore holds a consistent column beside each entry; spacing
separates entries without boxes. Mixed lists name each choice as ignored or marked correct.
An unmatched choice says “No matching finding in the current lyrics”: absence of a diagnostic
does not prove the saved words are absent. Current locations still reveal without restoring,
and no historical location is invented. `RightPanel.svelte.test.ts` pins the titles, statuses,
and reveal/restore behavior. On phones, saved locations open Write because an ignored finding
has no visible Review card; focus goes to the Write control without opening the keyboard.
`MobileWorkspace.svelte.test.ts` pins this path and confirms the choice remains ignored.


### Citation images stay outside the initial JavaScript

Source favicons use same-origin hashed asset URLs rather than inline data URIs.
Inlining every host image increased the editor's initial JavaScript even for an empty
document with no citations. Vite keeps the images in the immutable build manifest, so
the offline worker still includes them in its snapshot. The existing fixed favicon
dimensions preserve citation geometry while images load; no third-party favicon service
is contacted. Source coverage and shared diagnostic rendering retain their existing tests.

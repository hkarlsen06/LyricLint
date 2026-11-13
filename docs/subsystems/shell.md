# The shell: toolbar, tab strip, panels, and the surfaces that float over them

Touches: `src/lib/ui/layout/Workspace.svelte`, `src/lib/ui/layout/DocumentToolbar.svelte`,
`src/lib/ui/styles/panel.css`, `src/lib/ui/styles/overlays.css`,
`src/lib/ui/linter/` (each component styles itself), `src/lib/ui/layout/RightPanel.svelte`,
`src/lib/ui/layout/EditorActions.svelte`, `src/lib/ui/linter/LinterPanel.svelte`,
`src/lib/ui/state/control-tooltip.svelte.ts`, `src/lib/ui/primitives/ControlTooltip.svelte`,
`src/lib/interaction/dismiss.ts`, `src/lib/interaction/stick-to-bottom.ts`,
`src/lib/ui/primitives/select/`, `src/lib/conversion/stanzas.ts`,
`src/lib/editor/overlays/SectionTagPicker.svelte`,
`src/lib/ui/tools/` (SongPanel/PreferencesPanel: the decision record below predates the
Tools→Song+Preferences split), `src/lib/ui/layout/DocumentTitle.svelte`,
`src/lib/editor/extensions/document-placeholder.ts`, `src/lib/ui/layout/workspace-entrance.ts`,
`src/lib/ui/layout/DraftStart.svelte`, `src/lib/ui/layout/ExportDialog.svelte`,
`src/lib/ui/layout/ExportChecks.svelte`, `src/lib/ui/state/export-checks.ts`

## Where each surface lives

Find a surface by what it shows, then open its file. Rows routed elsewhere name their doc.

| Surface (what a reader sees)                                                               | File                                                                                                  |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Workbench page: tab title, the second-tab notice (`TabBusyNotice.svelte`, `tab-guard.ts`)  | `src/routes/(app)/workbench/+page.svelte`, `DocumentTitle.svelte`                                     |
| Editor, right panel, media strip, phone `Write` / `Review` / `Tools` views                 | `src/lib/ui/layout/Workspace.svelte`                                                                  |
| Toolbar: wordmark, `New 'scribe`, Undo/Redo, autosave status, language, compare            | `DocumentToolbar.svelte`, `LanguagePicker.svelte`, `CompareDialog.svelte` + `CompareDialogBody.svelte` |
| `'Scribes` menu (`docs/subsystems/drafts.md`)                                              | `DraftMenu.svelte` + `DraftMenuBody.svelte`                                                           |
| Actions tray: `Find and replace`, `Section header`, `Assign voices`, `Show tools`, audio   | `EditorActions.svelte`                                                                                |
| Tab strip and its panes (each pane loads through `LazyContent.svelte`)                     | `RightPanel.svelte`                                                                                   |
| Review tab                                                                                 | `src/lib/ui/linter/LinterPanel.svelte` (cards: `docs/subsystems/diagnostics.md`)                      |
| Performers, Linking tabs (`performers.md`, `section-links.md`)                             | `PerformersPanel.svelte`, `LinkingPanel.svelte`                                                       |
| Song, Preferences tabs                                                                     | `src/lib/ui/tools/SongPanel.svelte`, `PreferencesPanel.svelte`                                        |
| Assistant: tab, site dialog, transcript                                                    | `AssistantPanel.svelte`, `AssistantHost.svelte` + `AssistantDialog.svelte`, `AssistantConversation.svelte` |
| Empty document guidance (`Paste or type your lyrics here`)                                 | `src/lib/editor/extensions/document-placeholder.ts`                                                   |
| New-draft format choice (`Choose a format`)                                                | `src/lib/ui/layout/DraftStart.svelte`                                                                 |
| Tooltips and shortcut disclosure                                                           | `ControlTooltip.svelte`, `src/lib/ui/state/control-tooltip.svelte.ts`                                 |
| Toasts and announcements                                                                   | `ToastRegion.svelte`, `LiveRegion.svelte` (mounted in `src/routes/(app)/+layout.svelte`), `feedback.svelte.ts` |
| Boot screen and navigation splash (`docs/subsystems/site.md`)                              | `NavigationSplash.svelte`, `BootScreen.svelte`                                                        |

## The rules

- Each draft owns one main writing format, fixed after original content or semantic formatting
  begins, including after clearing the lyrics. Only an untouched new draft offers inline
  creation choices. The last deliberate choice is the `newDraftProfile` preference; opening
  or importing a saved draft never changes it. Legacy records use their saved conversion
  profile, or Genius when absent, regardless of retained model ancestry.
- The populated toolbar names the main format, copies its exact text, and offers Export to
  the other format. In a Genius draft the `Musixmatch tools` preference gates the tag and the
  export; while it is off neither draws and the copy reads `Copy lyrics`. A Musixmatch draft
  always draws both (`controller.showsFormatTools`). The native export dialog edits independent plain output, never editor
  history, source metadata or selection. It is a title bar (heading, the edit-scope sentence,
  an icon `Close`), a body, and a chrome action band: `Edit lyrics` at the leading
  end, `Download .txt` and the contrast `Copy` together at the trailing end. Copy and Download use the exact edited output.
  The body is the output pane in the editor's paper and lyric face with no resize grip, and
  beside it a review rail on chrome (`ExportChecks.svelte`): the destination format's own
  rules run over the output as it stands, because the main draft is only ever reviewed in
  its own format. Each finding is underlined in the output on a layer behind the field that
  shares its box, wrap and scroll; opening a row washes its words and line and brings them
  into view without taking focus. From the meta line down a row is the shared diagnostic
  (`DiagnosticMeta`, `DiagnosticActions`): a fix edits the output only, `Ignore` sets the
  finding aside for this open dialog, and `Fix N issues automatically` applies the safe
  fixes together. Findings carry offsets into the text they were found in, and typing is
  re-checked on a short delay, so marks and line numbers are drawn only against that text
  and a fix first settles against the output as it stands, finding its own row again by
  identity (rule, line, flagged text, and which such finding it is). When a fix or an ignore
  removes the row its press was made in, focus goes to the finding that takes its place,
  else the rail's heading. Findings whose only answer lives in the workbench are left out
  (`export-checks.ts`). A Musixmatch export also lists its section tags in song order under
  the findings, since they are not part of its text. Under 52rem the rail stacks below the
  output at up to two fifths of the dialog and scrolls as one column.
  Output too large to persist stays editable and guards departure. Closing points to an
  explicit discard-and-close action; discarding retains the last successfully saved export.
  Edited output persists per draft until a real original text, formatting, language, roster,
  anchor or link change. Selection, title, ignored findings and playhead do not expire it.
  Invalidation happens before constructing the complete saved snapshot; Undo cannot restore
  an expired copy. Target generation uses pure `planProfileSwitch` without upgrading primary
  storage. Historical live switching decisions below are superseded for the application UI;
  the pure conversion engine and editor history APIs remain internal.

- Shared writing commands keep their positions when the format changes. The Genius-only unknown
  marker and contextual voice assignment sit before Section and Find in the right-aligned tray,
  so their removal cannot move the shared commands.
  Section remains available for the active passage in both formats; the workbench omits the
  additional headerless helper rows inside the document.

- Recording invalidation belongs to a captured conversion task. Once its recording changes,
  reselecting the earlier recording does not restore that task's listening confirmation or
  replace its recording-specific refusal with a lyrics-change explanation. Reopening the
  current finding starts a new task.

- Conversion diagnostic actions stay in Review. Requests capture the original range, revision, draft, format and recording identity. A replacement recording visibly asks the user to reopen the finding and reconfirm listening. Source selection never retargets the decision. Changed lyrics require returning to the current finding. Repeat placeholders replace only the captured standalone notation with an explicitly chosen earlier section and confirmed number of fresh copies; preview precedes application. Song retains its separate metadata tools.
- Repeat tasks keep source, count and Preview anchored across version selection and preparation.
  Source context follows Preview while choosing; the prepared proposal replaces that context.
  Apply follows the readable proposal.
	The full replacement viewer shares the Apply row and precedes Apply in reading order;
	full source access sits beside its selected identity before the proposal. The source chooser also offers
  full source inspection before choosing. Native surfaces focus the noneditable opener before
  showModal and restore it directly on dismissal. This is progressive disclosure,
  rather than the combined Preview/Confirm slot used for destructive confirmations.

- Focused conversion tasks show one lyric-line context with a bold target and one Edit in
  lyrics action. On phones the task takes the whole panel height while the editor remains
  mounted and hidden. Quantity values may be prefilled from exact unsigned ASCII digits;
  meaning and pronunciation still require independent confirmation. Role comes first; pronunciation and required exact sung words grow below it. Optional custom output opens deliberately,
  and Apply quantity describes the immediate edit.
  Quantity previews show the resulting lyric line below their Preview control,
  with the replacement emphasized. Censorship shows the same word-aligned local context around
  the complete original target and replacement. Distant context is elided only in these read-only
  views. Censorship previews pair the removed word and inserted replacement using the shared
  inline diff; opening Full lyric line reveals the exact original without lengthening the compact
  comparison at Apply. Short lines have
  no disclosure. The original target stays visible for comparison. Invalid
  quantity values get the shared policy guidance beside the field before Preview is available.
  Censorship offers Decide later beside Preview. It returns to the same Review finding without
  changing lyrics, recording listening facts or ignoring the finding.
  With no audible prefix, its listening confirmation explicitly names full-word censorship and
  the preview explains the single hyphen. Typing a prefix changes the listening fact and clears it.
  The audible prefix label states that it may be absent. Expanding or closing the lyric context
  preserves the captured target, listening facts and prepared preview without changing lyrics.

- Writing exposes Document language in the toolbar and Selection language at the start of the desktop editor actions tray for an eligible selection. On phones both live inside Document. Selection language reuses PassageLanguage in controls-only form, including eligibility, captured scope, effective languages and stale refusal. Its fixed label keeps selection and long language tags from moving commands. Document language always changes the default, regardless of selection. Song retains its metadata disclosure and passage details.
  Opening captures the selected passage before focusing the trigger and showing the modal. Native close returns to that noneditable control directly; it must not briefly refocus the editor before explicit restoration.
  Document and passage language commands share bounded code validation. Invalid custom codes stay in the dialog with an announced field error and leave draft state unchanged. Escape from any dialog control returns to its trigger. Writing controls include their visible Selection language label in the accessible name; the dialog keeps its separate scope heading.

- Song opens on `Sections`, an outline of the song (`SectionOutline.svelte`), before `Document`.
  In a Musixmatch draft the tags live outside the text, so each stanza is a row: its tag as the
  shared `Select` (`Add tag` while untagged, `No tag` to take a removable tag off), its first
  line as a button that goes to it, a one-press `Chorus?` when an identically worded stanza is
  already tagged, and a `…` button that opens that section's options. The row holding the caret
  is `aria-current` with a rail. In a Genius draft the rows are the headers and only navigate,
  because a header is text. A blank line or a section boundary starts a row
  (`conversion/stanzas.ts` owns that, and which stanza a caret belongs to, for the outline and
  the editor's tag card alike). The outline is not a form: nothing is pending, each choice
  applies as one undoable step. This supersedes the earlier rule that Song had no section list
  and that adding a section was a command under Advanced tools; the `Add a section` form and
  the `Edit current section` and `Add section at cursor` commands are removed.
- The section command (`[+]`, `Mod-Shift-H`) answers inside the editor in both formats. Genius
  opens the header picker. Musixmatch opens the tag card (`SectionTagPicker.svelte`) on the
  stanza the caret is in: the stanza's first line, the seven types as a listbox that holds the
  focus, one key per type (`I V P C H B O`), and no confirm step. It starts on the stanza's own
  tag, or on the tag of an identically worded stanza so Enter repeats it. A tag pressed in the
  lyrics opens the same card with `Remove tag` (when no voice is assigned) and
  `Section options`, which opens the section editor in Song. Escape and an outside press
  cancel; every exit but `Section options` returns the caret. The shell carries out the choice
  through `onConversionAction`, so a refusal is the controller's toast and announcement.
- Advanced tools stays closed for normal Song viewing and contains the Genius reference editor, exact line timing and retained metadata. An explicit section request replaces the ordinary Song content with that section’s editor, with type and source label before Boundary and voice options. The requested identity stays fixed while the caret moves. Back to Song closes the editor and returns focus to that section's row in the outline, or to Advanced tools when the section is gone; Review requests retain Back to Review. Removing the last boundary closes the editor instead of leaving an empty chooser. A saved Genius page remains directly reachable as a link. Document language and content type share the named disclosure beside document exports. Available timed exports follow those files before the growing passage tools. Passage language is direct afterward and uses the shared searchable language dialog with an explicit custom-code path. Other selected passage tools and retained details open deliberately. Clear this transcription is separate from export actions. Preferences exposes the `Musixmatch tools` switch and workspace backup actions directly; Local data and Reviewed rules remain secondary disclosures.
  Local data explains reset consequences before its action. The warning and reset target stay
  in place through confirmation and cancellation.
  Escape closes a language picker even when its search has text, returning focus to its trigger.
  Expanded language controls name their document or passage scope visibly. Long choices keep
  the trigger's height and full accessible name. Search matches English names, catalog
  languages' native names and codes, without changing the reviewed-language policy.
  The selected-lyrics excerpt is a bounded, labelled keyboard-scrollable region, so long
  selections do not bury filtered choices. Song owns one section gap, including sections
  rendered by its child components; child sections do not add another inter-section margin.
  Language options identify language-independent coverage; the dialog and expanded Song
  controls explain the selected language's scope. Review keeps unsupported document and passage
  languages visible even without findings, with reviewed languages and grammar limits in
  Checking coverage.

- The empty new draft asks for its format in the document sheet, not the toolbar
  (`DraftStart.svelte`): a heading, one sentence, and two cards named `Lyric format: Genius`
  and `Lyric format: Musixmatch` in a group named `Lyric format`. Each card says what the
  format means and shows a two-line sample in the editor's faces (phones drop the samples).
  The chosen card rises with the accent ring and a filled check, and is pressed; every card
  keeps one box whether chosen or not. Under the cards the tray holds the ways to begin:
  `Paste lyrics` on the contrast tier, one line saying typing works too, and a quiet
  `Load a sample 'scribe` where `canLoadSample` allows it. The sample's row keeps its height
  when the sample is withdrawn, so choosing a format moves nothing above it. The ways to begin
  stay for as long as the document is empty (`controller.isEmpty`), so a cleared draft shows
  them without the format choice. A short phone draws the cards as names alone, and with the
  keyboard up (`data-keyboard-inset`) the tray keeps only the choice and the paste. The tray
  rests at the sheet's foot, clear of where a press starts writing, and is absolutely
  positioned with presses only on its controls, so the ghost transcription, typing and paste
  behave exactly as without it, and its exit moves no lyric line. It fades out over `--duration-fast` once writing begins, instantly under reduced
  motion. While it is open the toolbar draws no format and no format divider. Once writing
  begins the format is a static tag in the toolbar's track, never a raised face that invites
  a press. Once writing begins, the toolbar names that fixed format and offers its direct Copy action and the opposite-format export, unless `Musixmatch tools` hides them in a Genius draft.
  Recognized headings supply their supported section types automatically.
  Review owns the deliberate type choice and Save action for custom or unsupported labels. Song keeps advanced section editing, voices, annotations,
  language spans, authored forms and explicit conversion decisions. Hidden information is reviewed
  through its metadata location, never through invented lyric underlines. Main Copy uses the
  original text; the export dialog copies and downloads its independent output. Scribe export
  preserves both the complete main document and any remembered output.
  A retained-section prompt names its original header and active opening lyric so the passage can
  be recognized before choosing and saving its type in Review. Retained repeat instructions remain
  a separate concern even on typed sections. A Genius main draft can select its exact stable header
  for manual editing. A Musixmatch main draft opens the independent Genius export instead, without
  changing the main format or selecting a repeat source or count. Unsaved choices reset when the
  item changes; saving targets its stable section ID and returns focus to the retained-review
  heading, including after the last item. The Assistant introduction follows the main format.
  The opening excerpt follows the active projection, including authored spellings, without changing
  the retained original. A section with no projected lyric text says no visible lyrics.
  A displaced section uses the existing Review in Song action, focused on its stable section ID.
  Song opens its boundary options for explicit Move to cursor repair at a valid lyric line start.
  A section request opens at the section controls and return action, with focus on the requested
  section. Unrelated Song metadata stays above that reading position.
- Document edits and draft loads reset stale diagnostic and assistant proposals. Opening or
  editing independent output does not change the main editor's revision. Compare always renders
  the Genius projection against the Genius baseline and maps a
  chosen difference back to the active editor. Text checks and retained-detail review never claim
  that listening, attribution or external Musixmatch tagging have been completed.
  Comparison lyrics use the reading face at the normal body size; each desktop line target
  keeps at least the compact control height, and phone targets retain their touch floor.
  Line-break-only changes have a visible count, a named added or removed break, and a
  current-document line target; a different comparison never displays an empty result.
  Comparison rows use the shared passage handoff: phones reveal Write and focus its control,
  while desktop restores editor focus after the modal closes. Closing Compare retires the phone
  Document menu; cancellation and Escape restore its visible Document trigger.
  The active native modal owns Escape even when its focused content has just disappeared.
  Baseline replacement focuses its input; applying or cancelling it returns focus to Change baseline.

- The workspace reveals its initial viewport's lyric lines and diagnostic rows on load and
  each ’scribe identity change, top-to-bottom, using only temporary opacity. A prepaint mask prevents a flash;
  its two-second limit reveals all content if startup is slow. Interaction immediately reveals
  everything; reduced motion and a hidden document skip the effect. Readiness never waits for
  completion, lyrics never wait for diagnostic readiness or an animation download, and ordinary edits never replay it. `../motion.md` owns usage and
  performance limits.

- A tool initializes on first selection, then keeps its local state mounted across tab changes
  and editor expansion. Hidden Review rows, Linking analysis, performer arrangements, and Song
  statistics retain their last displayed values without following document updates. Activation
  reads the current state before the controls are actionable. The unused Assistant loads no
  transcript or preview corpus. `RightPanel.svelte.test.ts` pins lazy initialization and retained
  unfinished input; `LinterPanel.svelte.test.ts` pins row continuity.

- Copying lyrics confirms in the toolbar button and never opens a metadata receipt.
  Song owns the available metadata. `Workspace.svelte.test.ts` pins the non-interruption.
- On desktop, the editor action tray can expand the editor and restore the panels without remounting either.
  Its expand/restore glyph rotates 90 degrees at the `68rem` stacked breakpoint,
  so the pictured panel follows the actual panel below the editor.
  Hidden panels retire their diagnostic preview; opening findings retains panel focus.
  Review offers Previous/Next controls with their shortcuts. `Workspace.svelte.test.ts`
  and `LinterPanel.svelte.test.ts` pin these paths.
- Assistant version skew has its own `ruleset_mismatch` recovery message; only the local
  question-length check asks the visitor to shorten their question. Failed questions stay in
  the transcript. `assistant-state.test.ts` and `api.test.ts` pin the error and retained text.
  Requests identify the exact reviewed corpus with a ruleset version and content hash;
  coordinated publication retains the actual live site's corpus during rollout (`../ci.md`).
- Assistant Enter and Ask share submission, retain refused input, and leave composing Enter
  to the IME. The composer discloses the Unicode character limit before sending and keeps
  oversized input editable. `AssistantPanel.svelte.test.ts` pins both paths and composition.

- The toolbar spans the whole window and splits on what a control acts on, not on how loud it
  is; the save readout draws nothing while saving is going well (`sr-only` otherwise).
  On desktop the fixed format tag is part of the draft's identity, after its title, Open and
  New; a hairline divider parts the command strip into the document's history and language
  (muted quiet controls) and its outputs: Compare and Export at full tone with their
  glyphs, then the contrast action. Dividers are decoration (`aria-hidden`) and never
  children the button order tests count. Phones keep the tag on the command row. When
  `Musixmatch tools` hides the tag and Export, the divider still parts language from Compare
  and the copy.
  The draft-title group shrinks within the identity strip, truncating a long title before
  it can overlap Open, New or the document commands. The complete title remains editable.
- When Undo or Redo exhausts its history while holding focus, focus moves to the available
  opposite command. The phone Document menu stays open; history never opens the editor keyboard.
- Diagnostics are inset rows separated by space, without hairlines. Resting rows are
  transparent; the active or expanded finding takes `--color-surface`, rounded corners,
  and `--shadow-raised` in both schemes, and an accent rail down its leading edge marks it
  as the window's current decision. No accent wash or ring. The panel and controls
  above it use `--color-chrome`. `RightPanel.svelte.test.ts` pins the treatment.
- Every tool panel sets its text on one column, `--panel-inset` in from the panel's content
  edge: Review's heading, chips, bulk command, empty states and finding text, and the
  Song, Preferences, Linking, Performers and Retained details content. A finding row's
  fill reaches back toward the edge and its padding makes up the rest of the inset. A quiet
  button standing alone under text is drawn flush with it.
- Review's heading is the panel heading size. Its finding pager rides the heading's row at
  the far end: two arrows around a tabular `1 of 11`, the words `Previous` and `Next` kept
  in the buttons' accessible names and the tooltip naming each keystroke. Inside an opened phone finding there is no heading, and the pager rides the row of `All findings`, the way back to the list. Severity chips
  carry their kind's color on the mark alone; the label stays in the text color and a
  pressed chip is its kind's tint.
- Desktop tools have an icon and visible name: Review, Linking, Assistant (when available), Performers,
  Song, Preferences. The open tool is a raised key: surface plus the control ring, its glyph in the accent. At `78rem` the dock runs vertically along the outside edge; below
  it runs horizontally. Bits UI orientation follows the same query so arrow keys follow
  the visible order. `.right-panel__content` owns the body, media, and footer independently
  of the dock. `RightPanel.svelte.test.ts` pins orientation and pane visibility.
- The window ends on its columns: the toolbar spans above them and each column
  ends on its own controls, with no status bar under them. The composer's field
  uses the media strip's bottom padding; the pending transport uses
  the same control-row height and outer spacing as loaded playback.
  `Workspace.svelte.test.ts` pins the grid and the absence.
- The desktop dock has equal bottom and outer-side insets, owned by `--panel-edge-inset`.
  The composer field uses `--space-2-5` at its foot to match the media strip. The dock fits its
  labels rather than clipping a fixed width. `RightPanel.svelte.test.ts` pins these bounds.
- Empty, clean, and all-set-aside reviews are centered, unboxed states with distinct words
  and marks; setting findings aside never claims a clean draft. Filter-hidden findings
  stay beside their filters. `LinterPanel.svelte.test.ts` pins the states.
- Severity chips draw only the kinds the document has, unasked; a chip's count is over the
  unignored diagnostics and blind to the filters, or hiding a kind deletes the way back to it.
- On desktop the editor's command tray (`.editor-actions`) floats as a small ringed chrome
  toolbar inset `--editor-actions-inset` from the document sheet's top-right corner; phones
  give their larger labelled controls the sheet's own header strip, inside the sheet's ring
  and parted from the lyrics by a hairline, resting muted. A pressed tray toggle takes a fill as
  well as the accent.
  Desktop glyphs are the marks they insert; tooltips carry the name (and the keystroke where one exists). Up to four editing/source glyphs
  precede the icon-only expand/restore control at the right edge. The audio note
  stays in that row as the source changes. `Workspace.svelte.test.ts` measures its width
  and right edge.
- Find/replace runs under the tray: CodeMirror panels get `--layer-editor-panel` (never
  `isolation: isolate` on the host), the row reserves `--editor-actions-reserve`, and the
  magnifier is the visible exit, and its pressed state comes from `onSearchOpenChange`, never
  from the press. Closing with the magnifier focuses that visible control, including after
  the last replacement removes the focused Replace command. Escape returns to the editor.
  `e2e/search-focus.spec.ts` pins both exits with native input at desktop and phone widths.
- `describeControl`/`ControlTooltip` is the one tooltip: an attachment, never a wrapper; one
  box per application, mounted in `Workspace.svelte`; placement read off the control by
  `placeControlHint`; `aria-hidden` because both facts are already the control's own.
  Escape hides the hint without consuming the key, so a focused control's hint cannot
  block transport shortcuts or an enclosing surface's dismissal.
  Mouse hover and visible keyboard focus disclose hints. Touch entry and a pointer-origin
  programmatic focus handoff stay quiet; Tab still reveals the shortcut.
- A control with a keyboard twin names it in that box; only the leading fix names `Mod-.`,
  which answers from the whole window. A control whose label is already visible
  gets no box (it would only repeat it), but a glyph shows no label, so the
  tray's audio note names itself in the box with no keystroke to teach; a mark
  nobody can name is a control nobody can find. Gutter cells use
  the imperative `showControlHint` pair and disclose only on the caret's own line. Pins:
  `diagnostic-parity.svelte.test.ts`, `line-anchoring.svelte.test.ts`.
- The empty document is one message split across surfaces: ghost transcription in the editor,
  the start tray at the sheet's foot (the format choice while the draft is new, then
  `Paste lyrics` and the sample; refusals toast *and* announce via `report`), a toolbar with no
  contrast action, a waiting panel that offers nothing, and no counts anywhere. `controller.isEmpty` / `canLoadSample` are the single answers;
  `.right-panel__pane` must keep `[hidden]` out of its `display` rule
  (`RightPanel.svelte.test.ts` asserts exactly one pane draws).
- Keep Song and Preferences sections focused on their own decisions. Song does not repeat
  the toolbar's `Copy lyrics` action. Song lists the song's metadata and the files the draft
  turns into; listening decisions and repeat expansion are tasks Review discovers, so they draw
  only once a diagnostic's Review action asks for them. Clearing the lyrics and retained details
  lives in the Document section it clears, confirming in place, and never in the toolbar.
  Contextual actions may appear on other surfaces with
  shared behavior and the emphasis described in `DESIGN.md`. `SongPanel.svelte.test.ts` and
  `PreferencesPanel.svelte.test.ts` cover these sections.
- The grammar-checking section draws in both lyric formats while the document's language is English
  (`isEnglishLanguage`, the same predicate the catalog rules gate on). Harper refuses every
  other language before its download, so under Norwegian the switch would be an answer that
  cannot be carried out. The app-scoped preference keeps its stored value; only the control
  waits. Pinned in `PreferencesPanel.svelte.test.ts`.
- `Musixmatch tools` draws in every language. Its stored value (`musixmatchTools`) wins; with
  none stored it is on once any draft in the workspace is Musixmatch or carries an edited
  export, so Genius-only users start without the other format's tools. Choosing Musixmatch for
  a new draft stores it on. The controller owns the derivation; components read only
  `musixmatchToolsEnabled` and `showsFormatTools`.
- Every transient surface dismisses on `Escape`, its own control, and an outside press: use
  `dismissOnOutside`, never a hand-rolled listener; the callback moves no focus and abandons
  pending state. Dropping the closing control requires naming the visible exit that replaces it.
  A shared `Select`'s list is portalled out of the surface that opened it, so `dismissOnOutside`
  counts a press on a list as inside when that list's combobox is inside the surface, and a
  surface with its own Escape handler stands down while `openListOwnsEscape` holds: the first
  Escape closes the list, the next closes the surface.
- The assistant transcript follows its own foot via `stickToBottom()`: unpinned only by an
  upward move (or wheel/touch intent), re-pinned only at the foot; instant scroll, deferred to
  `requestAnimationFrame`. No `Jump to latest` control.
- Moving to a different 'scribe starts the assistant on a blank chat without deleting history;
  loading an earlier conversation is the explicit cross-'scribe path.
- The dev tab title (`PUBLIC_DEV_TAB_TITLE`) replaces the whole title, is gated on
  `import.meta.env.DEV`, and is pinned empty in `vite.config.ts` for the suite.

## Decision record

### A designed start, an accent for what is current, and Review as the core surface

The owner reviewed the first pass and asked for the transformation it had declined: a window
someone opening it cold calls stunning, with the Musixmatch workbench in focus. Four moves
carry it. A new draft is a designed start: the format decision moved out of the toolbar into
the document it decides, as two described cards at the sheet's foot (Notion and Linear put
the first decision about a new document in the document). The accent became violet and is
spent on what is current, because the old blue was the suggestion blue and could mark
nothing without reading as a finding. Review became the best-built surface. Editor marks
were redrawn to sit with the type.

The tray sits at the foot rather than under the ghost lines because the middle of an empty
sheet is where people press to start typing, and a card there would turn that press into a
format switch; the e2e suites press the editor's centre for the same reason.

### A ringed sheet, segmented choices and grouped commands

Superseded in part by "A designed start, an accent for what is current, and Review as the core
surface": the new-draft format choice left the toolbar for the document sheet.

The owner asked for a look that reads as a polished, modern tool, measured against Geist,
Linear, Raycast, Zed, LanguageTool and Figma UI3. The workbench is now a chrome frame
holding one document sheet: `--shadow-sheet` gives the editor a one-pixel ring, and dark
chrome and surface moved apart (16.5% and 20.5%) so the sheet no longer dissolves into its
frame. The sheet first had a contact shadow and a long soft fall; in WebKit every editor
repaint re-rasterized those layers, and the 1280px export spec went from 14.4s to 23.9s on
average and crossed its 30s fixture budget. A single unblurred ring measured level with the
baseline, so the ring is the whole shadow. Floating surfaces take Geist's material recipe (ring, contact
layer, deep layer with a negative spread). Radii follow control height: 8px controls, 12px
panels, 16px overlays.

The format decision on a new draft became a captioned segmented control, and the fixed
format a tag in the same track, because two loose words did not read as the one choice the
product asks for. The toolbar groups its commands with hairline dividers. The export dialog
became a title bar, an edge-to-edge output pane and an action band. The editor tray stopped
being a notch cut into the sheet's corner and floats inset from it, which supersedes the
corner geometry in "The editor's commands are a tray on the tab strip's own edge" below.
Disclosures draw their own chevron (`.disclosure`) instead of the browser's triangle.

### The public workbench entry can appear in search

PageSpeed flagged `/workbench/` because its `noindex, follow` directive excluded the app
from search. At the user's request, the public entry now allows indexing, declares its own
canonical URL (without panel/query state), and appears in the sitemap. The earlier decision
to exclude the workspace from the sitemap is superseded. Drafts remain browser-local: allowing
indexing of the generic app entry does not publish stored transcriptions. The existing
marketing-navigation and sitemap e2e checks pin this policy.

### Hidden tools keep their state without doing their visible work

Bits UI hides inactive tab contents but still renders their child snippets. Mounting every tool
at startup therefore loaded the assistant preview corpus before a question was asked and kept
linking analysis and review DOM reacting while hidden. `RightPanel` now remembers which tools
have been selected and initializes their content only on first use. Returning to a visited tool,
including after editor expansion, retains the same controls and local input.

Expensive presentation derivations read their inputs only while their pane is active, retaining
their last displayed values otherwise. They catch up synchronously on activation. This pauses
presentation work without pausing editing, linting, autosave, audio, or assistant requests.
Review releases its preview while hidden, as before; its rows and a tool's unfinished inputs
remain mounted. This also avoids eager assistant transcript and reference-data initialization.

Tool views other than Review also download their component code on first selection. Selection
itself remains synchronous. The shared `LazyContent` loader always keeps pending text screen-reader-only, across
panels, dialogs, menus and editor overlays, without per-surface visibility options; a failed load visibly reports the refusal with Retry. Once loaded, the same component instance remains mounted
across tab changes. `LazyContent.svelte.test.ts` covers failed downloads and retry; the panel tests
continue to cover retained inputs. The eager Review view remains ready with the document.

### Startup ends when the editor is ready

Direct workbench startup has no visual splash or loading animation.
Internal navigation into the workbench now starts a splash in the shared root layout;
`site.md` owns that transition. Render the recovered workspace immediately and let the real editor mount without an
animation gate. A screen-reader status reports pending startup; storage and editor
failures retain their visible alert and Reload action, and another tab retains its notice.

The previous pending-only animation still flashed on quick loads, and delaying its
appearance did not produce a satisfactory transition. That workbench-owned splash was removed;
the new navigation splash starts on the page being left instead.

The requested lyric-line and diagnostic-row entrance is a later, narrowly scoped exception.
The user clarified that rows should appear sequentially: moving already visible text did
not satisfy the request. The shell now reveals viewport rows from transparent to opaque
over 400ms, with no translation or other position changes. Starts are 60ms apart, compressed to a maximum
720ms delay across each group. The startup effects may use temporary opacity; it never
communicates application state. The native Web Animations API animates every visible row
from the existing DOM and stops scanning below the viewport. Fixed row and child caps were
removed: they skipped later paragraphs on tall screens or counted offscreen overscan above
a restored scroll position, making those paragraphs visible before the fade reached them.

`data-workspace-entrance` masks rows before their first paint to prevent a visible-then-hidden
flash. Each mask is removed as its group starts. While the navigation cover (`.boot-screen`,
`site.md`) is on screen the scan also waits for its explosion: the cover marks itself
`data-blasting` and dispatches `bootBlastEvent` (`workbench-navigation.ts`) the frame the
shockwave starts, so the rows fade in as the mask opens instead of underneath it. A two-second limit from attachment reveals
all content and abandons the effect if startup is slow. A separate two-second cleanup limit
starts after editor readiness (`data-entrance-pending`). Readiness follows CodeMirror's first
settled viewport measurement, so the scan includes rows absent from its estimated initial DOM.
Native-rule readiness independently
releases diagnostics (`data-diagnostics-pending`), so a slow rules download cannot hide ready lyrics.
Input, focus, visibility or motion-preference changes, failures, and teardown remove masks
and restore opacity immediately. Actual scrolling also retires the reveal, including scrollbar
and programmatic scrolls. Each row has one native opacity animation; inline styles and transforms
are left untouched. The attachment remains outside the draft-keyed subtree, but its effect
reads `controller.draftId`: opening or creating a ’scribe retires the old lifetime and starts
a new one without remounting the workspace. Readiness is keyed to the new editor’s draft ID.
Empty ’scribes reveal their existing placeholder lines without waiting for native rules.
Typing and lint updates do not change identity and never re-arm the effect. Readiness does not wait for completion.

Production CSS can rewrite `400ms` as `.4s`. `millisecondsFromCssTime` respects the unit for
both duration and stagger before passing milliseconds to Web Animations. The earlier Motion implementation's unit assumption made
the built animation last 0.4ms while unminified browser tests still passed. The regression
now covers both spellings and checks the native animation's actual duration and stagger;
the built site must also be checked in WebKit, including intermediate opacity and unchanged row positions.
See [Motion usage](../motion.md) for the limits and the distinction from paid Motion+ features.

### Focus rings stay inside controls

Focus rings use neutral gray in both themes to keep keyboard navigation visible
without the bright blue emphasis. The site's pinned dark palette shares that gray.

The shared focus offset is the negative ring width. Outside outlines were repeatedly
clipped by scroll ports and the tool dock, leaving blue fragments around controls.
Inset outlines preserve keyboard focus visibility without requiring extra layout space
around each control. The diagnostic heading uses the same offset directly rather than
negating it. The reference columns retain their existing clearance lane so changing
focus placement does not move their sticky bars or rounded selection washes.

### The workbench URL names the whole instrument

`/workbench/` is the canonical app entry. The surface writes, reviews, assigns performers, links
sections, times lyrics and manages drafts as well as linting, so the former `/lint/` path named only
one part of the job while the product and its calls to action already called the whole surface the
workbench. Internal links, panel URL updates, OAuth returns, the web app manifest and offline
snapshot all use the canonical path.

Published `/lint` and `/lint/` links remain valid through permanent redirects in `static/_redirects`,
mirrored by Vite for local development and preview and by the legacy route for client navigation.
The redirect preserves query parameters and fragments so a bookmarked panel or in-progress OAuth
return lands in the same state. The sitemap includes the canonical workbench and excludes
its legacy address. Pins: `workbench-redirect.test.ts` and `e2e/lyriclint.spec.ts`.

### Linking opens an overview before a comparison

Linking is a named dock tab between Review and Assistant. It uses the ordinary panel scroll port
and is a tool under the existing phone Tools view. Its overview lists available repeats and stored
groups; a deliberate Set up link or Manage action opens membership selection, with optional difference review.
Each overview group is a connected vertical list of members with aligned line numbers, followed
by its state and action. A group entry carries no implied source section; explicit editor requests
do. Quick linking preserves differences by default. Review differences expands a read-only numbered
comparison below the action row, with clickable lyric-line gutters. Decisions follow the diff:
preserve and link, enable individual wording choices, or choose one full version. The replacement
controls are progressively revealed; the comparison itself never requires choosing an approach first.
The full interaction and preserved-difference rules live in `section-links.md`.

Editor link markers and diagnostic actions forward through the existing callback proxy into the
workspace. The workspace selects Linking, restores collapsed panels, enters Tools on phones, and
focuses the detail heading. Hover and caret movement cannot change the tab. The tab is a URL state
(`?panel=linking`) with no error-count badge: kept differences are valid transcription decisions.

Pins: `RightPanel.svelte.test.ts`, `panel-url.test.ts`, `e2e/linking.spec.ts`, and
`e2e/mobile-workbench.spec.ts`.

### Phone task navigation owns the available space

Write, Review, and Tools replace the split only on primary coarse pointers at or below
68rem, as defined by the shared phone workspace query. Narrow fine-pointer windows keep
the desktop toolbar, panels, and Expand editor control. Write
is the initial view, Review opens an overview and then a passage with one finding, and Tools
remembers the last selected non-review pane. Switching never remounts the editor or media.
The phone action tray takes its own row so the larger labelled controls cannot cover lyrics.
The editor search panel therefore reserves no tray width on phones.
The phone navigation replaces the editor expansion glyph; wide layouts keep that control.
Media now occupies stable sibling grid regions, allowing it to remain available while either
editor or panel is hidden. The desktop audio row sits below the editor. A 16:9 video always floats at the desktop editor’s bottom-right, including expanded
writing, without reserving sidebar space or shortening the dock. The editor and video
both explicitly name their grid column so the overlay cannot displace the lyrics. This supersedes the older two-row workspace and media-inside-editor layout below.

Pins: `e2e/mobile-workbench.spec.ts`, `Workspace.svelte.test.ts`.

### One reference destination from the workbench

The no-script fallback and error page link to the unified transcription guide rather than
presenting separate rules and guidelines choices. Assistant check previews link directly to
`/guidelines/checks/[rule]/`, so following a preview joins the same topic/answer navigation as
a reference search. The assistant dialog and guide browser tests cover these entry points.


### Phone search uses the width beneath its action row

The in-flow phone command tray leaves search its full width. Search groups wrap their
controls within the editor, fields use editor-sized text, and every search action has a
44px touch target. The editor theme mirrors the phone workspace query without importing
shell code. `keyboard-commands.svelte.test.ts` checks multiple-match search and replacement
at 320px, including field type size and the bounds of every visible action.

### Phone commands preserve the selected lyrics

On the phone workspace query, the toolbar keeps the draft title/switcher and Document on its identity
row, with both format buttons and Copy/Paste on its command row. The named Document disclosure owns New, Undo, Redo, language, and Compare;
it dismisses on its trigger, Escape, and `dismissOnOutside`. Its existing dialog triggers
remain mounted so closing a language or comparison dialog returns to a real control.
While either native modal is active, the phone command menu's background and controls are
hidden without hiding the dialog or changing the toolbar geometry. The menu remains mounted
for native modal ownership and focus restoration.
The phone disclosure uses full-width named rows, including Undo, Redo and the full
language name. Icon-only desktop geometry must not constrain these rows. Its toolbar owns
`--layer-menu`, above the editor tray, and the dropdown is bounded by the toolbar edges.
`MobileCommands.svelte.test.ts` mounts the full workspace and hit-tests every menu row over
the tray at 320px and 390px; standalone toolbar geometry cannot catch sibling stacking.
The desktop command order is unchanged. Frequent phone controls consume the 44px
`--control-height-touch` token.

The phone editor tray names Section and Find. Assign voices appears when the shared
`canAssignVoiceGroup` predicate accepts the retained selection and the editor exposes the
assignment command. Mouse down on an editing command preserves the editor selection;
activation runs the existing keyboard command through the editor handle and callback proxy.
Touch pointer down remains uncancelled: preventing it suppresses Safari’s synthetic click,
so the explicit Assign voices tap would otherwise never open the picker. The real WebKit
touch-selection e2e test pins that activation path.
The phone Write/Review/Tools navigation replaces the expansion glyph. Desktop tray glyphs
and shortcut disclosure remain. `MobileCommands.svelte.test.ts` pins menu dismissal and
selection-preserving touch actions; the keyboard command suite covers the shared assignment.

### Header commands share the quiet control tier

The right-hand commands sit directly on chrome: history, language,
and Compare use the shared quiet buttons with muted resting text. Hover and keyboard
focus restore full ink. Copy/Paste remains the single contrast action at the right edge.
The controls use matching icon sizes and strokes. At phone widths the Document disclosure groups the secondary commands, leaving draft identity
and Copy/Paste visible without wrapping.
The existing toolbar interaction and viewport checks in `Workspace.svelte.test.ts`
cover command order, copying, expansion, and narrow-screen bounds.

### Preferences puts settings before reference material

Preferences is a compact list of settings rows on chrome. Headings use the ordinary UI
size and medium weight; each disclosure pairs its name with one short description.
Grammar checking stays directly operable. Workspace backup actions are directly available;
Local data and Reviewed rules open inline, with no nested disclosures, cards, or decorative
separators. Their explanations and actions appear where the user has chosen to work. Reset has
no red resting treatment, and its consequences precede the action inside Local data. The About
link closes the list.

Backup failures stay visible and announced beside the available backup actions.
Routine saving draws nothing. Export and import retain their contents and reconnection
explanations beside the actions.

Reset keeps its button mounted and fixed in position, changes to the contrast tier, and
places Cancel immediately after it. Its consequence text remains above the row, with a hidden live
announcement for confirmation. Protect storage becomes invisible and inert during confirmation, preserving
its space. Cancel and Escape return focus; an outside press or closing Local data abandons
the confirmation. `PreferencesPanel.svelte.test.ts` pins disclosure, reset, and backup paths.

### Writing and copying do not require leaving the current task

Expansion and contraction animate the grid with the shared motion tokens, preserving the left
inset; reduced-motion preferences make the change immediate. Collapsing tools become inert
immediately, while their visible surface travels with the shrinking grid track.

The editor tray's Expand editor control gives the document the available writing space on a phone
or desktop. Show tools occupies the same icon-only slot and, while the tools are hidden, includes
the count of rows Review draws, one per decision, in its accessible name (`Show tools, 3 decisions
to review`); before Review drew one row per decision it counted visible findings. The shared
tooltip names each action; no visible label or count accompanies the icon. The tray ends with this control, and
the document toolbar no longer offers it. The editor and panels remain mounted so selection, scroll position, and
in-progress tool state survive. Expanding focuses the editor; restoring focuses the selected
tab. Choosing a different tool programmatically also restores the panels. The Review preview
is gated on panel visibility, rather than allowing an invisible card to keep proposing a diff.

Copy lyrics no longer opens a modal just because a source knows song facts. Repeated correction
and copy cycles should have the same cost whether audio is attached or not. The existing button
confirms the copy; the Song panel continues to own the metadata and its copy controls.

### An assistant release mismatch is not an oversized question

A Worker published ahead of a website release rejected the previous browser ruleset as
`invalid_request`. The browser translated every such error to “Shorten it”, even for
“Korrekturles”. The Worker now returns `ruleset_mismatch` (409), and the browser explains
that the app and assistant versions differ, with reload/update recovery. Requests now identify
both ruleset version and corpus hash; the Worker accepts only a known bundled corpus before
session checks or provider calls. Its prompt, cache, and citation validation all use that
corpus. Legacy hashless requests resolve only to an explicitly retained legacy corpus.

The September 10 incident showed why recovery copy alone was insufficient: the Worker
published while the old site was still live, so reload fetched the same incompatible app.
The coordinated CI release now retains the actual live site's reviewed corpus while publishing
the new site. Arbitrarily old tabs can still require reload, and their questions stay intact.
No automatic reload interrupts editing. `docs/ci.md` owns the publication sequence and limits.

### The assistant keeps questions that it cannot send

The form restored a question when the chat lock refused submission, but the Enter handler
discarded the result. Both now use one submit function with the same in-flight gate and refusal
recovery. An input typed while the request is pending is never overwritten by that recovery.
The length guard uses the store's Unicode code-point limit rather than HTML maxlength, which
counts UTF-16 units and would silently truncate some pasted questions. The input remains editable
and says how many characters need removing. Enter while composing belongs to the IME.
Limit guidance sits above the field so the composer retains its shared bottom alignment.

### The composer measures its actual text

At every width, the composer measures the placeholder before typing and remeasures when a hidden pane
opens or its width changes. A single `rows="1"` box clipped the second placeholder line
on phones; input-only sizing missed that initial state. Typed questions grow to the CSS
height limit, then scroll. On phones the textarea has no native appearance, fill, or rounding of its
own, even under touch's sticky hover; the enclosing composer field owns that surface.
Desktop retains its rounding and hover treatment. It once sized only on input, which left the
placeholder clipped to one row in the narrow desktop panel (visible in the docs' assistant still).
Phone guidance keeps the character limit and omits the desktop Shift+Enter instruction.
`AssistantPanel.svelte.test.ts` checks initial wrapping, reveal, resize, and typed overflow.

### The composer shares the media strip's bottom padding

The assistant tab uses `--space-2-5` below its field, matching the media strip.
The Review footer appears only while at least one saved choice matches a current finding,
using `matchIgnoredDiagnostics`; unmatched choices remain saved and the section returns
when a match returns (`RightPanel.svelte.test.ts`).
The Review footer uses the same token in both collapsed and expanded states;
the expanded hidden-diagnostics list adds no second bottom margin.
This replaces the earlier dock-edge alignment; the dock retains its equal outer insets.
`RightPanel.svelte.test.ts` measures both gaps. The dialog keeps its own composer gutter.

### The dock's outer edges share one inset

Preferences had more space below it than to its right, and the fixed rail width could
clip its selected label and rounded rim. The desktop header now sizes to its content
and uses `--panel-edge-inset` on every side. The assistant composer reads that same
inset at its foot, aligning the two filled control edges rather than a field edge to
text inside another button. No per-control offset compensates for their geometry.
`RightPanel.svelte.test.ts` measures equal right/bottom gaps in resting and selected states.

Toast badge spacing and boot-message margins use the shared scale. Compare's inline
changes share `--inline-diff-padding` and `--inline-diff-gap` with the editor and link
picker; these scale with type instead of each surface guessing a different inset.
The mock editor uses the standard editor block spacing and a scale-based inline inset.


### Tool names stay readable and counts keep their own space

The dock labels use the small text token rather than the smallest metadata size. A tool
has at least its label's natural width, so a narrow horizontal dock scrolls instead of
letting names overlap. Review's count sits beside its icon in normal flow; an absolute
corner badge could collide with the glyph as counts gained digits. The badge keeps the
full count and its accessible noun. Toolbar reflow is recorded in the responsive subsystem.


### A writing workspace with a dock and one active decision

Softening the old grid helped its edges, but left five competing tab labels across a narrow
column and a blank review reading like a missing result. Every tool now has an icon and a
visible name, including Assistant. Review names the user's task in place of Linter. On wide
screens the dock occupies the outside edge, with Preferences at its foot; the content column
keeps its own scrolling body, media, and set-aside disclosure. Below `78rem` the dock becomes
a horizontal row. The orientation passed to Bits UI changes with the CSS breakpoint, so the
keyboard never has to navigate an invisible layout.

The desktop panel can grow to 30rem to accommodate that dock. More generous toolbar padding
and a wider draft title give the song's identity room without adding another heading to the
document; the toolbar retains the shared site-header height.
Resting findings now sit directly on chrome. Only the selected or expanded finding rises,
in both themes: a surface means there is a decision here, rather than outlining every
potential decision. This supersedes both the filled resting cards and the dark recessed
selection described below; selection still uses depth without a severity-competing hue.

An empty review, a clean review, and a review with every finding set aside each have a composed
message and a different mark. The wording preserves the distinction: saved choices are not a
claim that every rule passes. Only filter-hidden findings remain a caption beside the filters
that bring them back. The sample stays with the waiting message, and recent drafts stay at the
foot. Pins: `RightPanel.svelte.test.ts`, `LinterPanel.svelte.test.ts`, and
`Workspace.svelte.test.ts`.

The window ends on its columns: the toolbar spans above them and each column ends
on its own controls, with no status bar under them. A full-width status row was
tried and left the foot one straight band with nothing on it worth the band:
a readout whose counts moved to the Song tab, a link that belongs with the
application's own settings, and an attach entry that belonged where its
transport appears. Sharing the transport's line was tried before that and could
not hold, because the strip's height changes with its state (pending, loaded,
syncing) while the composer's does not. What holds is one control line at the
foot for the composer's field and the dock's button. Pending transport controls now
share the loaded row's height and spacing (see the media decision record). The named way out, About LyricLint, closes the Preferences tab.
It acts on nothing, so it stays out of the toolbar's strip of document commands.
Within the panel, the composer and dock share the same outer inset. Earlier alignment
to the label's ink was replaced by control-edge alignment, as recorded below.

### A calmer workbench replaces the ruled grid

The workbench now uses chrome as the continuous window background. The document is inset
from the left edge, with rounded top corners, and the panel separates from it by tone rather
than a vertical hairline. The toolbar draws no horizontal rule.
Controls take the medium radius within the workspace; this does not change the public site.
(Superseded: controls now take `--radius-sm`, 8px, and panels `--radius-md`, 12px; see
"A ringed sheet, segmented choices and grouped commands".)
The active tab has a filled rounded target and stronger type, replacing its underline.

Findings retain their depth cue but gain an inset, rounded corners, and a gap between rows.
This supersedes the gapless geometry recorded below: repeated findings earn independent
surfaces, while the panel itself has no enclosing border. Filters and bulk commands keep
chrome so they cannot merge with the selected finding, but lose their bottom rules.

The set-aside disclosure remains at the panel foot, with accurate ignored/accepted counts
and restoration focus behavior. A rotating chevron replaces the blue `Show` label; the
whole row is a quiet hover target and `aria-expanded` carries its state.
The desktop panel can grow to 26rem so its tabs and diagnostic prose have breathing room. Pins: `RightPanel.svelte.test.ts`,
`LinterPanel.svelte.test.ts`, and `Workspace.svelte.test.ts`.

The earlier decisions below retain the interaction history; their square seams, connected
bands, and scheme-specific selection depth have been superseded by the records above.


### The shell is one window, and the linter is one column

The document toolbar spans the whole window, above both columns: the draft's name, its save
state, and the commands that act on the whole document belong to the window, not to the editor
half of it. The right panel's tab strip hangs directly under it, at `--panel-tabs-height` rather
than the toolbar's `--header-height`. Toolbar, tab strip, ignored-rules footer, and video
band are all `--color-chrome`; the scrolling content between them is not.

**The toolbar splits on what a control acts on, not on how loud it is.** The left is the identity
strip: the brand, the draft's name, and the plus that starts another one, which acts on no
document and therefore does not belong in the strip of commands that act on this one. The right
holds only those: the language and the contrast action. The save readout trails the plus and
**draws nothing while saving is going well** (a disk glyph that is always there reports a state
that never changes), but it stays in the accessible tree the whole time (`sr-only`, named and
titled), because the e2e suite and a screen reader both need to know a save landed. A failure is
the one state that draws, with its words and an alert glyph, so what the user must act on is
carried neither by red alone nor by the silence that means everything is fine.

Diagnostics are one continuous run, not a stack of separate cards: no gap, no rounding, a
hairline between neighbours. **Selection is depth, not hue.** It does not get an accent wash or an
accent ring, which put a blue box inside a panel whose entire job is to color things by severity.

**Which way the depth goes is the scheme's answer, and the two differ.** In dark the selected row
drops from `--color-surface` to the recessed `--color-canvas` with `--shadow-recessed` and reads as
cut into the column: the recessed level there is the document's own tone, so a well reads as
somewhere to look into. In light it lifts instead: it stays on `--color-surface`, takes
`--shadow-raised`, and gives up the hairline at both its own foot and the row above it, so the
shadow falls across its neighbours rather than under them. Sinking it there put the one card the
reader has opened (the card carrying the fix they are about to press) into the grey this
workbench spends on things that are _spent_: disabled text, an unpressable control, an ignored
rule. It cannot rise by lightness, because the resting cards are already the paper, so a shadow is
how it rises; that is the same rule `tokens.css` states for anything above `--color-surface` in
light. Nothing moves when it lifts: the border keeps its 1px and loses only its color.

**`--color-canvas` is still spent in this column (on the panel behind the cards at both schemes,
and on the selected card in dark), so nothing else in it may sit on that tone.** Anything hanging
between the tab strip and the run of cards is chrome or it is a card; there is no third material.
The bulk-fix strip learned this the long way: drawn as bare canvas it was the same tone as
whichever card was open below it, the two merged into one region, and its button read as loose
inside the open diagnostic rather than as a command over the list. It is `--color-chrome` now,
like the severity chips it hangs beneath. A strip also carries something at both ends, the
command at one and the count it will not touch at the other, because a lone control in half a row
of empty gutter is the other way this row has failed.

**The severity chips draw one chip per kind the document has, and they draw it unasked.** They
used to have no control of their own: pressing the Linter tab a second time, from inside the
linter, was what showed and hid them. That is a gesture nothing advertises and nobody performs (a
tab announces switching panels and nothing else), so the filters read as a feature the workbench
did not have, which is the same failure the timestamp gutter had while its control only appeared
under a hovering pointer, and worse here because there was no column to hover. It also cost three
handlers to work around Bits UI's activation order, all of them for a press that was never made.

What the reveal was buying was vertical space, and the row buys it back by **drawing only the
kinds that are actually there**. `Errors 0` and `Manual review 0` were two thirds of this row on
an ordinary draft: counts that could not have been otherwise, offering to filter out kinds that
are not in the document, the same discipline the Song tab's counts follow. A clean draft draws no
row at all.

**Each kind is a two-line tile, so four kinds fit one row.** Four names on one line need about
430px and the panel gives 330, so the one-line pills wrapped and left the last kind alone on a
second row. A tile puts the count beside the mark and the name under both (`.filter-chip` in
`controls.css`), which fits all four at every panel width and on a 360px phone, and makes the
count the first thing read. The name never wraps or truncates, because this row is the one place
that pairs the four marks with their names. The accessible name still reads the name, then the
count.

**A chip's count is over the unignored diagnostics and blind to the filters**, exactly as in the
rule reference, and that is what makes drawing on the count safe: a kind the user has switched off
keeps its count, so it keeps its chip, which is the only control that brings it back. Read the
other way, counting what is visible, hiding a kind would delete the way back to it.

The row also earns its place at rest. The card dropped the severity **word** in favour of a glyph,
so this is now the one surface in the workbench pairing the four marks with their names, hanging
directly above the column it is the legend for.

Implementation: `chips` in `src/lib/ui/linter/LinterPanel.svelte`, the panel column in
`src/lib/ui/styles/panel.css`, the `<style>` blocks of `LinterPanel.svelte` (the chips row) and
`src/lib/ui/linter/DiagnosticList.svelte` (the run of cards), `src/lib/ui/styles/diagnostics.css`
and the components in `src/lib/diagnostics/` (what is inside one), and
`src/lib/ui/layout/RightPanel.svelte`.

### The editor's commands are a tray on the tab strip's own edge

Superseded in part by "A ringed sheet, segmented choices and grouped commands": the tray
now floats inset from the sheet's corner with its own ring, and the test measures that inset
rather than a flush right edge. Its contents, order and reserve still follow this record.

The tab strip hangs under the toolbar at `--panel-tabs-height` and used to be the whole of that
band: to the left of it, across the editor column, was nothing. So the editor's own commands had
nowhere to be, and the one that had shipped (inserting Genius's unknown-lyric marker) had ended up
in the old footer's readout row as a second control saying `Insert [?]`, which is
a mark somebody either knows or does not, and the reader who needs the button is by
definition the second kind. A glyph cannot teach the convention it is a glyph for.

**`.editor-actions` is a tray, not a band, and it took three wrong shapes to get there.** Drawn
full width across the editor column it made the _row_ the object: a strip of chrome as wide as the
document with two words at one end and a hand of empty gutter after them, which is the failure the
bulk-fix strip has a rule about arriving from the other side: there a lone control in half a row of
gutter is what carrying something at both ends exists to prevent, and here there is no second end
worth carrying anything, so the answer is not to draw the row at all. Hugged to its contents at the
**left** of the column it was the right size and belonged to nothing: a small box of chrome adrift
on the document, level with a tab strip a thousand pixels away that it had no visible relationship
to. Given a grid row of its own at the **right** it belonged to the tab strip and charged the
document 44px for the privilege, every pixel of it beside the text rather than above it, because
the lyric column is capped at `--measure-editor` and left-aligned, so the space it took was space
that was already empty.

So the row went. It is `position: absolute` over the document's top-right corner, against the panel,
and it costs the document no height at all. `--panel-tabs-height` is kept, so its foot still lands
level with the panel's tab strip: the chrome under the toolbar ends at one height across the window
even though the two surfaces do not touch. It closes on the side it pokes out of: a border and a
radius at the bottom-left corner, nothing at the right where the panel's own border already draws
the edge, and nothing at the top where it meets the toolbar it hangs from.

It is `--color-chrome` for the reason the bulk-fix strip is (a strip drawn as bare canvas takes the
tone of whatever it touches), and that is a live hazard here rather than a remembered one, since the
tray now floats directly over the document.

`Workspace.svelte.test.ts` measures the width and the right edge rather than trusting the rule:
`width: 100%` or a lost `justify-self` restores the band silently, and both halves have to hold or
the tray is back to belonging to nothing.

**Find and replace runs under the tray, not below it.** Stacked, the two were 44px of tray over 74px
of find bar for one job, which is what the overlay exists to stop, so the bar occupies the same band
and the tray floats over its right end. Three things follow, and the first is the one that will be
re-broken:

- **CodeMirror panels default to `z-index: 300`**, above every tier in this application's scale, so
  the bar painted over the very glyph that toggles it and the second press landed on the panel.
  `--layer-editor-panel` is that panel brought into the scale, below `--layer-toolbar`. The tempting
  fix, `isolation: isolate` on the editor host, is wrong: it would cap the editor's own pickers and
  popovers below `--layer-panel`, which is a worse bug than the one it fixes.
- **The row keeps the tray's width clear** (`--editor-actions-reserve`), or its right end sits under
  a surface that is painted over it. `Workspace.svelte.test.ts` measures the tray against that
  number rather than trusting the two to stay in step.
- **The bar has no close button, and the magnifier is the visible exit that replaces it.** The rule
  under _Every transient surface dismisses on an outside press_ allows dropping a closing control
  only by naming what stands in for it, and this one names three things at once: the glyph toggles,
  it sits directly over the row's own right end, and it draws `--color-accent` while the bar is open.
  An `✕` beside that would be a second control for a press the user already has, in the row with the
  least space for one. `Escape` is the third way out, as it is everywhere else here.

**The pressed state is reported by the editor, never assumed from the press.** `Mod-F` is bound to
the window and `Escape` closes the bar, so a glyph that only knew about its own presses would go on
burning accent over a bar that had already gone. `onSearchOpenChange` is the hook, fired from an
`updateListener` that compares `searchPanelOpen` across the update, and, like every other hook, it
has to be added to **`createCallbackProxy` in `create-editor.ts`**. It is `aria-pressed` rather than
a class, because the state is a fact about a toggle and colour is never a state carrier here.

**The controls are glyphs, and what they are is a tooltip.** Spelled out (`Section header` over
`⇧⌘H`, `Unknown lyric [?]` over `⌃⌥U`), the tray was 243px of the document's own top row for two
commands, five times what the glyphs need, permanently, to say something a transcriber reads once.
The name arrives on hover and on focus, with the keystroke beside it where the control has
one; the note that attaches audio has none to teach, so its box carries the name alone.

**The glyph is the mark, not an icon drawn to stand for it.** `[?]` is exactly what the button
writes into the document; `[+]` is that mark's own family saying a header goes in. Both are
`--font-mono`, at the weight the document will draw them in. An abstract pictogram here would be a
second thing to learn on top of the convention this control exists to teach, which is why the
two controls that write nothing, the magnifier and the note, are the two drawn as pictograms.

**What that costs is named rather than hidden, because it is the original complaint coming most of
the way back.** A tooltip is not a thing a finger can produce, so a sighted touch user meets marks
and no words. Two things hold the line. The **accessible name is the whole label** at every state
(`aria-label`, with `aria-keyshortcuts` beside it where a twin exists), so nothing is lost to a
screen reader and nothing here repeats the gutter's mistake of a control that is only a pointer
affordance. And the tooltip is drawn `aria-hidden`, because every fact in it is already the
button's own: described rather than hidden, they would be announced twice. That last part is the
citation tooltip's rule (`SourceCitation.svelte`) applied in the one case where the direction
reverses: there the visible text is the _only_ copy and needs `aria-describedby`; here it is the
second copy and must not announce.

**The box itself is shared, and is the subject of its own section below.**

**Four editing/source glyphs and one workspace toggle.** Three are caret commands; the
optional fourth attaches audio where its transport will appear. The fifth expands the
editor or restores tools, at the editor's right edge. It remains icon-only in both states.
The find bar reserves room for the extra control, and the existing tray geometry and
expansion tests measure the layout and focus behavior. Bold and italic were considered and
refused: `<i>` and `<b>` are the performer voice slots, the picker and the roster are how a voice is
marked here; generic bold and italic buttons would obscure that performer meaning.

**The three caret commands are commands a caret alone can carry out.** `Ctrl-Alt-P` and `Mod-Shift-L` are
deliberately absent: each needs a selection or shared lyrics in an existing link and
announces a refusal the rest of the time, and a bar that spends most of its life offering answers
it cannot give is what `availableRates` and `spotifyAvailable` both exist to prevent.

**It draws at every state, including over an empty document.** A band that appeared on the first
keystroke would shove the editor down at the moment somebody started typing, and the reader who has
never met `[?]` is the one looking at an empty document.

**The editor asks and the shell writes.** `Ctrl-Alt-U` is a keymap binding like `Mod-Shift-H`, but
the command dispatches nothing itself: it calls `onUnknownMarkerRequest` and the shell runs
`controller.insertUnknownMarker()`, so the insertion is an `AtomicDocumentEdit` against the
session's own revision, which is the bookkeeping every fix already goes through. The bar's press
takes the same path. And like every other hook it has to be added to **`createCallbackProxy` in
`create-editor.ts`**, where a missing callback looks exactly like a feature that silently does
nothing.

**That binding carries no `preventDefault: true`, and the reason is the one the sync bindings
document.** The option prevents the default even when the command returns _false_, and this one
returns false whenever no shell is listening, which would swallow `Ctrl-Alt-U` in an editor that
never bound it, the landing page's demo included. Returning true already prevents the default.

Implementation: `src/lib/ui/layout/EditorActions.svelte` (`.editor-actions` in its `<style>`),
`.editor-region` in `src/lib/ui/layout/Workspace.svelte` (the third row it grew for the tray is why
`.editor-host` and `.media-strip` both state their own `grid-row` now), `insertUnknownMarker` in
`src/lib/editor/keymap.ts`, `toggleSearch` on `EditorHandle`, and `onUnknownMarkerRequest` /
`onSearchOpenChange` on the contract.

### One box names a control, and it is drawn once

The shared box uses `--space-4` on both inline edges and `--space-2` vertically.
The wider inline inset keeps text clear of the rounded corners and reduces the
available wrapping width without adding to the box's width cap.

Three surfaces wanted the same thing and were about to solve it three ways. The diagnostic
citation already had a real tooltip (measured, `position: fixed`, `aria-describedby`), the action
tray grew a second copy of it, and the transport's three glyphs were still on `title`, which is
slow, unstyled, and worded differently on every platform. `describeControl` and
`ControlTooltip.svelte` are the one answer: a box carrying **what the control is and the keystroke
that does the same thing**, on hover and on focus.

**It is an attachment, not a wrapper, and that is a constraint rather than a preference.** The
transport row's height is budgeted to the pixel (the stack of glyph, gap and caption has to fit
inside one `md` control, and `MediaStrip.svelte.test.ts` measures it against a sibling), so an
element wrapped around a flex item is a new flex item with its own sizing and its own chance to grow
the row. `describeControl` adds nothing to any control's box.

**One box for the whole application**, held in a module rather than per control, because hover and
focus are separate: a pointer crossing one control while the keyboard sits on another would leave
two up. `ControlTooltip` is mounted in `Workspace.svelte` rather than the app layout, so a workspace
rendered on its own, which is how every component test renders it, still has somewhere to draw.
The section-link picker's `Type only here` action (now `Edit this section only`) later joined these controls rather than growing a
popover-specific tooltip.

**The placement is read off the control, never passed in.** The surfaces occupy different edges and
none should have to say so: the tray hangs at the top-right of the document, the link picker can sit
on either side of its anchor, and the transport is the last row of its column, where there is
no room below at all. `placeControlHint` is that arithmetic, exported and unit-tested against
synthetic rects rather than trusted: it flips to `bottom` when the control is within a two-line box
of the foot, lays out from whichever edge the control is nearer, and clamps at 8px so nothing starts
off screen.

**It is `aria-hidden`, not `aria-describedby`, and this is the one place that direction reverses.**
Every fact in it is already the control's own (the accessible name, and `aria-keyshortcuts`
where a twin exists), so describing would announce each twice. The citation's tooltip is the opposite case: its visible text
is the _only_ copy, which is why that one keeps `aria-describedby` and this one must not grow it.

**On the transport it joins the caption rather than replacing it.** The caption under each glyph is
the one keystroke worth learning, one modifier and one letter, and _The audio is a transport_ says
the tooltip carries the function-row and universal fallbacks, and that split was described there long
before anything implemented it. So the box reads `Play` over `F8 · ⌃K`, and the row is unchanged.
The transport is one component (`MediaTransport.svelte`), so any surface that draws one gets the
box with it, and today that is the strip alone, since the cover band gave up its second transport.

Implementation: `src/lib/ui/state/control-tooltip.svelte.ts` (the store, the placement, the
attachment), `src/lib/ui/primitives/ControlTooltip.svelte`, and `.control-tooltip` in
`overlays.css`.

### A control with a keyboard twin names it, where the press is already aimed

The expert layer was more complete than the UI admitted. `Mod-.` opens the nearest fixable
finding with focus landed on its fix; guided actions have exact keyboard twins
(`Mod-Shift-H`, `Ctrl-Alt-P`); the pending reconnect answers a bare `Escape`.
None of it appeared in any user-visible string. There is deliberately no legend, no tips system and no
one-shot "did you know" toast to repair that: the pointer crosses these controls on every press,
so the shared box is the disclosure, arriving beside the action at the moment it is being aimed
at, which is a better moment than any toast can buy, and it recurs until the keystroke sticks.
The one removed legend (`F8` and `⌘.` in the status bar) stays removed; this is its function
carried by the box instead of its pixels.

So `describeControl` rides the diagnostic action row, the most-pressed surface in the
workbench, and one component, so the card and the popover cannot disclose differently. Three
rules on it:

- **Only the leading fix names `Mod-.`**, because it is the one that keystroke lands on; an
  alternate wearing the same caption would promise a key that reaches its sibling. And with
  focus already on that control, **the same keystroke applies**: the box over it names `⌘.` as
  the control's own press, so a second `⌘.` that only re-opened the popover was the disclosure
  exposed as a lie by the very keystroke it teaches, and it shipped that way once too. The
  apply is bound on the claimant itself (`applyOnOwnShortcut`), where it also covers the demo;
  the window's listener stands down for a press landing on anything carrying the
  `aria-keyshortcuts` claim, which keeps one implementation of "apply". Pressed repeatedly,
  the chord walks the panel: reach, apply, reach the next.
- **And `Mod-.` answers from the whole window, or the tooltip teaches a lie.** The row that
  teaches it lives in the panel, which is exactly where the caret is not, so as an
  editor-only keymap binding, the keystroke did nothing at the very moment it was being read,
  and it shipped that way once. It is bound beside the editor's window-level `Mod-F` now, same
  gate (`windowFind`, so the landing page's demo opts out of both for the same reason), same
  modal deferral, and it runs the same exported `openAvailableFix` the keymap binds, and capture
  plus stopPropagation is what keeps that one implementation rather than two. `Mod-Shift-.` is
  the same chord one modifier up and walks the findings instead, wrapping past the last
  (matched on `event.code`, because `Shift+.` never reports `.` as its key), and it rides the
  same window listener, so it too answers from the panel.
- **The box repeats the visible label on purpose.** The label is the accessible name, the
  keystroke is `aria-keyshortcuts` (added with every disclosure, or the `aria-hidden` box's own
  premise (that both facts are already the control's) goes false), and nothing announces
  twice.
- **`Ignore`, `Fix all N` and `Close` get nothing**, because they have no keystroke and a box
  that only repeated the label would be the label twice, six pixels apart.

**The gutters disclose through the imperative half, and it exists because they must.**
`showControlHint`/`releaseControlHint` are `describeControl` without the listeners: the
timestamp column builds its cells outside Svelte and rebuilds them whenever the playhead
crosses a line, so an attachment's listener pair would be orphaned mid-hover. The hover is
delegated off the gutter instead, and every hint is read off the element's own data, never off
editor state, so a hover cannot disagree with the cell it is over. The cells' native `title`s
went with it (two tooltips for one control is the platform's and ours disagreeing), and a press
hides the box by hand, because a delegated hover has no click listener to do it. What each
control teaches is exact: the timestamp and the anchored line number teach `Ctrl-Alt-Enter`,
the pin teaches `Ctrl-Alt-M`, and the pencil teaches nothing: it opens the ± pair, and
re-stamping is `Ctrl-Alt-M`'s own press, so it names no keystroke it does not perform.

**And the keystroke is named only on the caret's own line, because that is the only line it
acts on.** A cell is any line the pointer happens to cross; `Ctrl-Alt-Enter` and `Ctrl-Alt-M`
act at the caret, so taught on another row, the caption promised "the keystroke that does the
same thing" and delivered an action somewhere the user was not looking, which is exactly how it
was reported. The gate is `.cm-activeLineGutter` read off the cell itself, the same field the
commands answer from, and it also lands the disclosure at the moment it is wanted: the keyboard
flow these keys serve is replay-and-restamp of the line being worked on. None of this touches
the gutter's accessibility posture: the rail is still `aria-hidden` all the way down, and the
box it feeds is `aria-hidden` too.

**Linked-header controls keep separate purposes.** `Link` opens the respective Linking view;
its local-mode counterpart `Unlink` opens the same view rather than unlinking the section. The
adjacent `Pen`/`PenLine` pair toggles “Edit this section only,” with `aria-pressed` exposing the
state. These inline header glyphs follow one character-space, with separate 24px targets
centered around a text-height fill centered on the header’s capital height. The adjacent scope text
is a noninteractive readout.
Each has its own action-only shared hint, without repeating the adjacent scope. Hover and focus
do not navigate or toggle, and each control releases
its hint on leave, blur, activation, or removal. Neither claims a global shortcut for a different
caret's section; `Mod-Shift-L` is taught on the panel's switch, where it is also answered.

**What this deliberately does not do is nudge.** A behavioral tip ("you have pressed this five
times, try `⌘.`") was considered and refused: touch users have no keyboard, keyboard users
already found the keys, and pointer users hover the button on every press, which is the tooltip's
own moment. The touch notice was re-anchored in the same pass: both of its facts now hang on
the laptop, because the old wording hung "every fix has a keyboard shortcut" on a device that
has no keyboard.

Implementation: the imperative pair in `control-tooltip.svelte.ts`, the row in
`DiagnosticActions.svelte`, the delegated hovers in `extensions/line-anchors.ts` (spread into
`lineNumbers` in `create-editor.ts`), the reconnect control in `MediaStrip.svelte`, and the note
in `LinkingDetail.svelte`. The pins are `diagnostic-parity.svelte.test.ts` (the row's twins,
leading fix only), `line-anchoring.svelte.test.ts` (the cells, the numbers, the absence of
titles), `MediaStrip.svelte.test.ts` (the reconnect's `Esc`), and
`LinkingDetail.svelte.test.ts` (the switch and its shortcut).

### The empty document is one message, not three

Resting Review messages (ready, clean, and set aside) center within the full panel width.
Their grid has no prose-width cap; the paragraphs carry `--measure-prose` instead. Capping
the entire grid left it against the panel's start edge and visibly off-center once the
desktop panel stacked below the editor. `DesktopWorkspace.svelte.test.ts` measures the
message's glyph and text against the actual panel body at 750px and 1000px.

A fresh open used to say "empty" four times (a black editor with a bare caret, a panel explaining
how to feed it, and four zeroed counts in the footer's readout row), while the loudest control on the screen,
the contrast-tier `Copy lyrics`, pointed at the exit of a job nobody had started. The fix is not
decoration. It is dividing one message between the surfaces so that no two of them say it:

- **The editor says what belongs there**, with a ghost transcription at the caret
  (`extensions/document-placeholder.ts`). Section headers come from the selected language pack, so
  the shape it models is the shape the linter wants; the one line of guidance between them stays
  English because it is the application talking, not the document.
- **The toolbar says what to do**, by swapping its one contrast action to `Paste lyrics` while the
  document is empty. The slot, the tier, and the tab order are unchanged, only the label follows
  the state, and the surface never carries two contrast actions.

  _Superseded on 2026-11-12:_ `Paste lyrics` moved into the document sheet's start tray
  (`DraftStart.svelte`), beside the format choice and the sample, so every way to begin an
  empty document is in one place. The toolbar's contrast slot is empty while the document is,
  and the tray holds the contrast tier until there is something to copy. The refusal behavior
  below is unchanged.

  **And when that action refuses, it says so where the press can see it.** Safari denies
  `readText()` outside a gesture and Firefox gates it behind a prompt, which is ordinary rather
  than exceptional: the keyboard still pastes, so the fallback puts the caret where that keystroke
  lands. What it must not do is put the _instruction_ in the `sr-only` live region alone, which is
  what `announce` reaches and all it reaches. Over an empty document that is a pixel-identical
  screen: the active line is washed either way, so the whole of the visible change was a blinking
  caret, and the one contrast action on the surface read as doing nothing at all. The three
  refusals of that action (the denied read, the empty clipboard, the failed copy) go through
  `report` in `editor-session.svelte.ts`, which draws a toast **and** announces, because the toast
  region is not a live region and either alone loses an audience.

  Only the refusals. A copy that lands changes nothing on screen and was asked for by the press
  that ran it, so a toast there would be the workbench congratulating itself, the same reason the
  save readout draws nothing while saving is going well. `workbench.test.ts` pins both halves.

- **The panel says what it is waiting for**, and nothing about how to start. Its copy got shorter
  when the editor took over the instructions; re-adding "paste or write some lyrics" here is the
  drift this section exists to prevent.
- **Nothing counts nothing.** A count worth stating is one that could have been
  otherwise, so each count waits until it has something to report, and they live
  in the Song tab's Document section, over the files they describe, rather than in
  a footer readout. The shortcut hints that used to keep that row company are gone
  at every state, not just this one: a legend for `F8` and `⌘.` was help
  nobody had asked for, printed permanently across the quietest row in the window. So was `offline
ready`, which is a fact about the application in a row that summarises the document.

Two things the empty panel offers, both prose on the canvas rather than boxes: the drafts the user
already has (a fresh open is only empty because it opened a _new_ one, and their work should not be
behind a menu they have to find), and the sample. **They are not offered in the same place**, because
only one of them is about this document. The sample answers "nothing to lint yet" and stays with the
sentence it answers, directly under it. The drafts answer nothing (they are somewhere else to be),
so they sit at the **foot of the column**, after everything the panel has to say about the draft in
front of the user, pushed there by `margin-top: auto` rather than by whatever happens to be above
them. Between the two is empty canvas, and that is the whole separation: no rule, no fill, no box.

Pinning a foot means the panel is a column the height of the panel, which is what
`.right-panel__pane` is for. Two traps in that: the pane is only told to fill, never to fit, so
content taller than the panel still grows and scrolls; and its `display` **must** exclude
`[hidden]`, because Bits UI hides the inactive panes with the attribute and a bare `display: flex`
outranks the rule that honours it, and all three panels stack into one column. `RightPanel.svelte.test.ts`
asserts exactly one pane draws.

**The sample is offered only while its own
language is selected**. Under another choice, its English lyrics open with a true
`language.selection-mismatch` about a document the user did not write. Its findings are few, and
`sample-draft.test.ts` pins both the count and the mix, because the sample is only worth loading
while it still demonstrates the split the bulk strip reads out: some fixed mechanically, the rest
named as judgment calls.

`controller.isEmpty` and `controller.canLoadSample` are the single answers to both questions; no
surface decides for itself what "empty" means.

### The tools panel removes redundant actions and explanations

The tools tab stopped being skimmable the ordinary way: nothing in it was wrong on its own. Its
`Document` section had grown to four actions, which wrapped into a ragged two-by-two of mixed tiers,
and the privacy story was told three separate times: once about audio under those buttons, once
under `Local data`, and once more in a trailing sentence with no heading over it at all. Every part
was defensible; the panel was a wall of grey.

The repair was specific to this crowded panel:

- **Its short action row became easier to scan.** Attaching audio moved to its transport,
  and the export label lost words already supplied by the toolbar. This layout does not set
  a universal maximum of two controls per section.
- **A claim is made once, where the reader is deciding.** Everything local is said under
  `Local data`; what YouTube costs is said in the picker, beside the press that spends it. A warning
  met an hour before the decision is a warning already forgotten, and the same warning in two places
  reads as two different warnings.
- **The panel stopped repeating the toolbar's copy action.** `Copy lyrics` was removed from
  `Document`, where it duplicated the visible toolbar button a few rows above. Export remained
  near the foot of the panel. This does not prohibit contextual, keyboard, or responsive paths
  to an action; diagnostic cards and popovers intentionally share the same actions.

The trailing `.offline-note` went with this, and its CSS hook went with it: a selector for markup
nothing renders is the same drift as a fallback color for a token nothing defines.

`SongPanel.svelte.test.ts` asserts the heading list in order, the single action row, and the
_absence_ of any audio control or second `Copy lyrics`. Re-adding either here is the specific
regression that made the panel messy the first time. (The panel described here was
`ToolsPanel.svelte` at the time; it has since split into `SongPanel.svelte` and
`PreferencesPanel.svelte`, and the pins moved with their sections.)

### Every transient surface dismisses on an outside press

Anything that floats over the workbench (a picker, a popover, a menu) closes three ways, and
all three are required: `Escape`, its own closing control, and **a pointer press anywhere
outside it**. The outside press is the one users reach for without being told, so a surface that
lacks it reads as stuck.

The closing control exists to cover a way out the user cannot see, so a surface that already
closes itself on the pointer path does not need one. The hovered diagnostic popover is the case:
nothing in it is pending, and the pointer-leave watcher ends it the moment the user moves away,
so a `Close` there would only sit beside `Ignore` wearing the same quiet tier while one of the
two silences a rule for the session. Its keyboard-opened twin keeps `Close`, because that one
holds focus, is deliberately exempt from the pointer-leave watcher, and would otherwise offer no
exit but a keystroke nobody announced (`closingControl` in
`src/lib/editor/overlays/DiagnosticPopover.svelte`). Dropping the control is only ever justified
by naming the visible exit that replaces it.

Use the shared attachment, never a hand-rolled listener:

```svelte
<div class="picker" {@attach dismissOnOutside(dismiss)}>
```

`src/lib/interaction/dismiss.ts` is the implementation. It listens for `pointerdown` in the
capture phase: waiting for `click` leaves the surface up through the press, and the bubble
phase never arrives for presses that CodeMirror or a picker cancels for its own reasons.

Two rules for the `dismiss` callback:

- **It does not move focus.** The press already named where the user is going; calling
  `returnFocus()` there would drag the caret out of whatever they just pressed. `Escape` and
  `Cancel` are the paths that hand focus back.
- **It abandons the surface's pending state**, so reopening never resurfaces a primed confirm.

Attach it to the surface's outermost node. For a `<details>` menu that is the `<details>`
itself, which keeps a press on the summary inside the surface where the native toggle can do its
job. A modal `<dialog>` is the exception: it already has a backdrop, so it dismisses by
comparing `event.target` to the dialog (`src/lib/ui/layout/LanguagePicker.svelte`).

Canonical implementations: `src/lib/editor/overlays/SectionPicker.svelte`,
`src/lib/editor/overlays/PerformerPicker.svelte`, `src/lib/editor/overlays/DiagnosticPopover.svelte`,
and `src/lib/ui/layout/DraftMenu.svelte`.

### The composer centers its send control

The shared composer centers Send vertically inside its field, in both the panel and dialog.
Bottom alignment put a 36px button against the foot of a taller textarea and made it sag.
The field's outside inset and panel foot alignment stay unchanged. `AssistantPanel.svelte.test.ts`
measures the button's center against the field.

### Stored assistant answers recover without hiding missing content

Normal completion persists the structured answer and its plain text together. For a stored
completed record missing its structured answer, display retained nonblank text as escaped text.
If both are absent (including whitespace-only content), keep the failure message and allow Retry
in place. `hasCompletedAnswer` owns the shared rendering/retry decision; valid completed answers
cannot be retried and overwritten. Recovery uses the existing conversation lock and persistence
path. The panel and assistant state tests pin the fallback and the actual retry.

### The assistant's transcript follows its own foot, and a scroll up is the end of that

**A different 'scribe starts with no conversation selected.** The assistant state lives above
the workbench so its modal and panel share one transcript, but that lifetime must not make the
last song's conversation the next song's default context. When the workspace registers a new
draft id, the active transcript is cleared while its stored chat remains in Conversations. An
intentional selection from that list may load any earlier conversation against the current
'scribe; that is the cross-reference escape hatch, and it is explicit rather than automatic.
A pending turn is marked interrupted before it is detached, so a late answer or tool decision
cannot land on the replacement draft. `assistant-state.test.ts` pins both the blank transition
and the ability to reload the prior chat.

An answer arrives a token at a time, so a transcript that does not follow its own bottom edge
shows the reader the top of a message and leaves them pressing End for the rest of it. The hard
half is the other one: a reader scrolls up to check what was said earlier **while the stream is
still running**, and a follower that reads "the content grew" as "go to the bottom" hauls them out
of the message they are reading several times a second, with no way to win.

So the rule is not about growth. **It is about which way the scroll moved.** Appending to the foot
of a scroller never moves `scrollTop`, so growth cannot look like a scroll, which is what makes
an upward move a safe signal where the distance to the bottom is not. That distance grows with
every token, so a follower reading _it_ unpins itself in the middle of its own answer. A pinned
transcript is therefore unpinned only by the position moving up, and an unpinned one re-pins only
by reaching the foot, because arriving there is the one gesture that plainly means "I am caught
up".

**One race remains, and it is the one that actually loses somebody's place.** A wheel updates
`scrollTop` at once, but its `scroll` event is dispatched at the top of the next frame, so a
chunk landing in between is followed while the module still believes it is pinned, and the
reader's scroll is eaten with nothing on screen to say so. Two things close it, and both are
needed because neither is true on every frame. The follow is deferred to a
`requestAnimationFrame`, which the frame's specified ordering runs _after_ the scroll steps. And
the pointer gestures are read for intent directly (`wheel` upward, a touch drag downward), which
unpins before the scroll has happened at all. The scroll is instant and never smooth, for sync
mode's reason: a smooth scroll started on one chunk is still animating when the next arrives.

**The way back is a gesture that already exists, and no control was added for it.** Asking a
question is a request to see the answer to it, and switching conversations is a request to see
another transcript. Both `pin()`, and both are things the reader was going to press anyway. A
`Jump to latest` button would be a second control for a press already on the surface, over a
transcript the reader can simply scroll; if one is ever wanted, it reads its state from `pinned`
and from nothing else, the way the editor's search toggle reads its own.

`stickToBottom()` is a shared attachment beside `dismissOnOutside` rather than a handler in the
component, because the rule is the same wherever a surface streams into a scroller and the copy
that drifted would be the one nobody is watching.
`src/lib/interaction/stick-to-bottom.svelte.test.ts` drives it against a real scroll port (every
assertion is about `scrollTop` and about the frame something moved in, neither of which exists
under a simulated DOM), and `AssistantPanel.svelte.test.ts` pins the wiring, which is the half
that goes missing silently when the transcript's markup is rearranged.

Implementation: `src/lib/interaction/stick-to-bottom.ts` and the transcript in
`src/lib/ui/assistant/AssistantConversation.svelte`, which is shared by the workbench panel and
the modal, so neither surface can acquire a follow of its own.

### The dev tab says which one it is

A workbench tab is named after the draft, which is named after the song, so a dev server and the
deployed build, open on the same transcription, are two tabs carrying the same artist and title
with nothing at a tab's width to tell them apart. `PUBLIC_DEV_TAB_TITLE` is the word that replaces
the pair, `Dev` in `.env.example`, and something more specific where two dev servers are up at
once.

Three things about it:

- **It replaces the whole title rather than prefixing it.** A tab shows the first few characters,
  so a prefix worth having is one that is all that gets read.
- **It is gated on `import.meta.env.DEV` as well as on its own value**, which is a build-time
  constant, so the label cannot reach a production bundle even from an `.env.local`, the hazard
  `.env.example` opens by naming. Unset, the tab is named after the draft exactly as production is.
- **The suite pins it empty in `vite.config.ts`**, beside the Spotify id and the Apple token and
  for the same reason, sharpened: the tests run as a development build, so a developer's own label
  would rename every tab `DocumentTitle` asserts on and the suite would pass on a fresh checkout
  and fail on the machine that had an env file. The test that covers the label stubs it per render,
  which is why the value is read in the component body rather than at module scope.

Implementation: `src/lib/ui/layout/DocumentTitle.svelte`.

### Floating surfaces share the studio geometry

The app shell owns the rounded control, panel, and overlay tokens so dialogs,
toasts, and shortcut tooltips inherit the same geometry as the workspace. Menus
and dialogs use their overlay shadow for separation, with spacing in place of
decorative header rules. Shared list rows give names and commands more breathing
room without changing the single-row rename and confirmation flows. Buttons,
icon controls, and fields share color transitions and respect reduced motion.
Editor picker shells follow this treatment too; selection marks and functional
internal separators remain intact.

### Separation follows ownership, not outlines

Catalogue identity now lives with playback below the editor, so the tool body's outline
and the vertical rail divider no longer separate the song from Preferences. Both are
removed. The tool pane remains on chrome, with spacing separating it from the document
and navigation. The editor retains rounded corners on its filled surface; the player sits unboxed on
window chrome, with extra clearance above the footer. Large outlines and a second
full-width filled rectangle added shapes without clarifying ownership.

Without a media transport, the editor's bottom inset matches its left inset, including
the smaller inset at narrow widths. Its rounded foot stays clear of the window edge
in both empty and populated documents, including expanded writing.

The smaller mobile inset, scroll ownership, and full-sized action targets remain.
YouTube's visible frame stays below the tool content. See the media decision record.

### The Genius page belongs to the scribe

Song has a Genius page section even before audio or lyrics exist. Its URL field saves on
change and clearing it removes the link. Only validated Genius HTTP(S) page links can be
opened; invalid edits keep the previous saved value and report the refusal. The action row
reserves its height so adding or clearing the link leaves Document in place. Draft switching
resets the field, including any invalid edit. The link travels with Scribe files and backups.

### Closed language dialogs do not build their option list

The language picker keeps its native dialog and trigger mounted, but builds its search and
language rows only while open. The closed picker previously mounted dozens of button rows
at workbench startup, including behind the phone's closed Document menu. Opening still clears
the query and focuses search; the native close event retires the body after selection, Close,
Escape, or a backdrop press. The results status mounts empty before search changes announce
counts. `LanguagePicker.svelte.test.ts` pins the absent initial rows, reopening, and focus.


### Panel code follows the surface that uses it

`Workspace` loads `RightPanel` through the same `LazyContent` boundary as individual tools.
Desktop begins loading it immediately; phone Write waits for Review or Tools. A pending
load or refusal occupies one `aside` in the existing panel grid region, replaced by the
real panel once loaded. There are no nested panels. `LazyContent` shares the announced
loading/refusal text and Retry action across both uses, while its optional pending-surface
snippet supplies only the outer layout. Loaded panels remain mounted across hiding and
resizing, preserving tool input, Review state, and focus behavior. Workspace tests wait
for real controls before asserting their geometry and retained instances.

### Comparison loads inside its native dialog

The Compare launcher keeps its native dialog, title and Close control ready on a press.
Its comparison body and document-diff code load only while open, through `LazyContent`'s
shared loading, refusal and Retry states inside that same surface. Closing removes the
body, so each open resets pasted text and the replacement step while retaining the saved
baseline. The loaded ask focuses its paste field; Close and backdrop presses return to
the original trigger, and row selection keeps its existing next-frame editor focus handoff.

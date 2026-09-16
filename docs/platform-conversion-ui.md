# Platform conversion: UI and edge cases

Status: working-tree implementation, September 16, 2026; release validation in progress. Companion to the
[implementation specification](platform-conversion-implementation.md) and
[product guarantees](platform-conversion-plan.md). The controls below describe the implemented
workflow and its acceptance requirements. All eight reviewed languages share the same workflow.
The [guideline comparison](platform-guidelines-comparison.md) defines the evidence and open
policy questions these controls must respect.

Implemented entry points are `ProfilePicker`, section widgets/Song details, retained metadata
review, Musixmatch `RichLinking`, profile-scoped text findings, the dedicated Musixmatch guide,
and the shared assistant with profile-bound messages and proposals. Comparison uses the Genius
projection and labels it accordingly while Musixmatch is active; caret navigation maps back to
the active lyric view. It does not report missing Musixmatch tags as Genius comparison issues.

Fact actions are explicit: quantities require exact value, role and pronunciation; instrumental
intervals require the current recording, supplied bounds and adjacent tagged sections. Their
eligibility comes from `profiles/decisions.ts`; unsupported or conflicting cases keep their
wording and a local explanation. The editor does not certify listening, authorship, native
submission, complete grammar or unresolved language policy. Public references expose every
researched clause and its remaining scope.

## 1. Format selection

Add one format picker in `DocumentToolbar.svelte`, beside Language on desktop. The trigger
shows the committed value, **Genius ▾** or **Musixmatch ▾**, with accessible name
`Lyric format: Genius` / `Lyric format: Musixmatch`. It is a format choice within one document,
not another draft tab or a Compare view.

Use a two-option menu with a visible selected marker and `menuitemradio`/`aria-checked`
semantics. Arrow keys move option focus without converting. Enter/Space or a pointer activation
selects. Selecting the current profile cancels any pending switch and closes without a transaction. Opening/closing
alone does not change the editor. Use `dismissOnOutside`, Escape, and the trigger to dismiss.

Reserve the trigger's geometry for its widest label and progress indicator. During loading,
the old profile stays selected; a pending indicator and live announcement describe the request.
Do not momentarily show Musixmatch as active while Genius text is still committed.
While a request is pending, the menu offers `Cancel switch` in a reserved action slot.

### Layout sketches

These show placement and ownership; production styling uses existing tokens and control tiers.

```text
Desktop
Song title ▾    [Genius ▾] [English ▾]    Undo  Redo  Compare with Genius  Copy lyrics
Editor actions…                         Review Genius lyrics
Lyrics…                                 Current-profile findings…

Phone
LyricLint                         Song title ▾
[Musixmatch ▾]         [Document] [Copy lyrics]
Active task…
[Write]                    [Review]    [Tools]    ← existing bottom navigation
```

The phone format row exists in both modes and stays visible in Write, Review, and Tools.
Document keeps the existing language/history/Compare/new-draft disclosure. The format must
not disappear inside that disclosure: the reader needs to know what Copy lyrics will emit.
At narrow widths and larger text sizes, reserve wrapping rows from the full control content;
changing the selected profile must not introduce a new toolbar row or truncate its name.
Keep the established bottom task navigation position and keyboard-hide behavior.

### Successful switch

1. The user selects the other profile.
2. After any active composition commits, the engine plans from current state.
3. One transaction updates the text, format, metadata, selection and history. Old-profile
   findings/previews become inactive before new findings are exposed.
4. The trigger shows the committed format. Announce once: `Musixmatch format` and, if relevant,
   `Two decisions need review`. Checker loading uses the existing checking state.
5. Keep the mapped lyric passage in view. The workspace, editor and player stay mounted.

No per-switch modal or mandatory preview appears for authorized mechanical conversions.
Uncertain changes stay unresolved with contextual Review actions. Correctly retained details
are normal state and do not produce a warning count.

Keyboard activation returns focus to the format trigger. Pointer activation does not force
editor focus or summon the phone keyboard. Preserve the editor selection logically in either
case. Undo/redo keeps focus at its invoking control and restores format, lyrics and metadata
together. Switching never replays draft-opening animations or seeks playback.

## 2. Structure and retained details

### Sections in the editor

Musixmatch section boundaries render as editor controls, outside copied lyric text:

```text
[Chorus · Mira and Noor ▾]       ← section control, not a lyric line
We follow the moon
Stay beside me

[Section 2 · Type not set ▾]
We carry the light
```

The accessible control name includes its occurrence: `Section 1, Chorus, Mira and Noor`.
It is excluded from text/plain copy, search matches, lyric line numbering and `.txt` output.
Do not put the only accessible control in CodeMirror's aria-hidden timestamp/line gutter.
Use editor widgets plus the equivalent ordered controls in Song; widget activation calls the
same command through `createCallbackProxy`.

### One section editing surface

Add a **Sections** disclosure in the existing Song panel, with ordered unboxed rows. Each names
its section, known type, assigned performers, and any unresolved placement. Activating an editor
section control opens Song, expands that section, and focuses its heading. On phones this goes
to Tools → Song without opening the keyboard. A return action restores the mapped editor
passage or the originating Review finding, whichever opened the surface.
If that finding has been resolved, return focus to the next surviving finding or Review heading.
Navigation-target headings/detail rows use `tabindex="-1"` for programmatic focus. `Show passage`
returns phone users to Write and focuses its task control; the user's tap decides whether to
open the editor keyboard.

| Control | Behavior |
| --- | --- |
| Type | Choose an explicit supported profile type; keep original labels as retained details |
| Insert section | Insert an untyped boundary at a chosen line boundary; no guessed Verse/Chorus |
| Split here | Split at a chosen line boundary; original identity stays on the original part, new part starts untyped |
| Move boundary | Choose another valid line boundary; preserve lyric text and display which lines change section |
| Merge with previous | Show the affected label/voice/link consequences in the same surface, then apply the selected resolution |
| Remove section boundary | Keep lyrics; use the same merge planner when ownership would conflict |
| Delete section and lyrics | Inline confirmation in the existing action slot; delete this section/body/attachments as one undo event |
| Passage language | Use current document language or choose an explicit override for selected lyrics |

For a merge with differing section types, offer `Keep previous type`, `Use this type`, and
`Leave type unset`, preserving both original labels as retained details. Retain all compatible
range assignments and existing exclusions; new voice-capacity/representation conflicts stay
explicit review items. Never silently discard voices or invent new linked passages to complete
the merge. The action preview states the affected sections and retained conflicts.

Select fields and choices are constrained by reviewed capabilities. A boundary at a line start
can be represented by a Genius header. A boundary inside a line needs a decision: `Move before
this line`, `Move after this line`, or `Split line here`. The last explicitly inserts a lyric
line break with a preview; merely switching must never do that.

Ordered explicit empty sections remain valid and inspectable even when their boundaries share
a position. Sections collapsed by an ambiguous edit show a placement decision. A widget may
summarize multiple boundaries at one location and open their ordered Song rows; it must not
silently combine their identities or invent blank lyric lines.

### Retained details

Below Sections, add a collapsed **Retained details** disclosure when any exist. Each unboxed row
shows platform, kind, exact stored value, and owner. Examples are a Genius annotation, original
section label, known non-vocal description, or a voice arrangement the target cannot express.

- `Show passage` appears only when a real mapped location exists.
- `Needs placement` identifies a detached detail; it is not a fabricated line number.
- `Attach to selected lyrics` appears only for a valid current selection and compatible detail.
  It requires the user's explicit selection, never a similar-text search.
- Without a selection, `Choose passage` returns to Write without opening the keyboard and
  remembers the detail ID. After selection, returning to that same row offers the attach action
  against a freshly validated basis; switching draft/canceling ends this placement flow.
- Removing a detail uses the existing in-place removal pattern and one undo event.
- Per-section retained counts open this same disclosure, filtered/revealed to the owner. They
  do not create another inspector or a second source of detail state.

Representational syntax like an annotation's opening bracket is not shown as a mysterious list
of tokens. Present its meaningful record: annotation ID, attached words where still valid,
and preserved source form. Deleted lyrics are not retained as an active hidden alternative.

## 3. Review and resolution

Use the existing Review list and shared `src/lib/diagnostics/` content/actions. The heading names
the profile: **Review Musixmatch lyrics** / **Review Genius lyrics**. Preserve the existing
native-first, Harper-after ordering and diagnostic settlement rules.

Text findings retain real line/range locations. Metadata findings name `Section 2` or
`Retained detail`. A metadata finding opens the same section/detail surface described above;
on phones it moves to Tools → Song and preserves a return to its stable Review occurrence.
Do not create a fake underline, line zero, or second conversion diagnostics panel.

Example proposed decision:

```text
Choose the Genius section name
Review · Section 2 · Genius guidance

The Musixmatch Hook needs a Genius section name.

( ) Chorus   ( ) Refrain
[Use selected name] [Review later]
```

Available alternatives come from the reviewed language/policy case; the example is not a
universal mapping for all eight languages. Radio selection previews its precise text and metadata
effect within the existing decision surface; the reserved action becomes `Use Chorus` or
`Use Refrain`. Before a choice it is disabled with a visible instruction to choose a name.
Pressing the named action commits one model transaction. Preview/choice changes never move
the action row; reserve its size from the actual alternatives at the current width.
Text-only diagnostic fixes retain the existing immediate diff plus one named fix action.

`Review later` advances without supplying an answer or marking the target compliant. The
decision stays unresolved and reachable. `Keep this wording` records a scoped representation
choice only where the policy offers it. `Ignore` hides an occurrence and does not alter conversion
facts. Those actions must not silently stand in for one another.

Fact questions use policy-specific controls. A number question shows the exact phrase and
parsed value, with `It is a quantity`, `It is a name`, or `It is an identifier` only where those
answers are applicable; the selected answer previews any proposed change before its named
commit action. A quantity answer is not sufficient where a fixed expression, time, pronunciation
or other reviewed exclusion still needs resolution. An instrumental question collects explicit
start/end times, the adjacent sections, and confirmation that the interval has no qualifying
lyrical content. Vocalizations/joik may need their own classification. Show duration/placement
validation beside those fields; enable the marker action only when every requirement and the
applicable reviewed policy hold.
A generic `It's correct` or Ignore action cannot create either fact.

When official sources conflict, the affected Review item says **Guidelines disagree**, links
both sources and explains the specific unresolved requirement. Preserve authored text and offer
review later; do not ask the user to settle platform policy as though it were a missing song fact.
For example, confirming an instrumental interval cannot settle the Japanese blank-line conflict.
The English prohibition on unknown-word placeholders likewise does not justify deleting `[?]`
or guessing a word. Keep the uncertainty visible and explain what still needs transcription.

Where policy needs original/translation/romanization status, expose **Content type** in Song's
document details, with an explicit **Not specified** state for legacy drafts. Review can reveal
that same control with a contextual explanation. Never infer the answer from the script or
section headers. A change reruns affected checks while preserving the text; it does not perform
translation or transliteration.

An ignored Genius finding remains ignored when returning to unchanged Genius content. It cannot
suppress a Musixmatch rule. Saved-choice lists show the active profile's choices without deleting
the other profile's records. Correctly retained annotations never enter the issue count.

Zero findings means `No issues found by the enabled Musixmatch checks` (or Genius), subject to
provider availability. Audio verification, transcription accuracy and successful submission are
not inferred. Coverage limitations belong beside the relevant action/reference; avoid a permanent
global checklist of unverifiable requirements.
The language picker also contains languages beyond the eight reviewed packs. For those, show
`Language-independent conversion only` beside the format choice's options and in Review's
coverage disclosure. Apply only justified language-independent operations/checks, preserve other
wording, and do not fall back to English. A no-findings state must retain that explicit scope.

## 4. Performer and editor capabilities

Reuse the roster, performer picker, assignment gestures and shared predicates. Named performers
belong to the song. Musixmatch assignments modify metadata ranges; Genius renders supported
headers/style wrappers from those same assignments.

Unknown voices need section-scoped anonymous identities. This intentionally supersedes the
current Genius-only contract that unknown voices are derived from styling and never persisted.
Keep them distinct through switches, without adding synthetic Unknown people to the roster.

The picker asks who performs the passage. It does not expose Genius style-slot implementation
details in Musixmatch. More than four groups stay stored and show a Genius representation decision;
never flatten them or offer a fifth style that Apply cannot carry out. Performer renames update
identity-linked assignments in both formats atomically. Neither a group name nor a voice category
is inferred from its spelling.

`EditorActions.svelte` consumes explicit profile capabilities:

- Section header insertion keeps its Genius behavior. In Musixmatch, the Section action and
  its existing keyboard shortcut open the current section's Song controls, where Insert/Split
  are explicit actions; they never insert a lyric label.
- Unknown lyric marker, supported wrappers and formatting actions need reviewed per-profile
  behavior; do not insert Genius `[?]` or HTML by default in Musixmatch. If there is no supported
  marker representation, omit its control and give the existing shared refusal on its shortcut.
- Existing Find, selection, undo, transport and timing gestures keep their meanings.
- Reuse assignment controls; touch selection alone still does not open a picker.

## 5. Import, output, and empty states

Normal paste preserves the exact inserted text. It does not change format or silently interpret
foreign markup. A supported foreign-syntax finding may offer **Interpret as Genius formatting**
with a precise preview. This is an explicit action, not a background “smart paste.”

Plain-text file opening exposes a source-format field, defaulting to the current format. A rich
`.lls` restores its declared profile. Missing Musixmatch structure/performer tags cannot be
recovered from plain lyrics alone; blank-line groups are provisional untyped sections.

Copy lyrics and selection copy use exact active text. Song's output explanation states that
`.txt` contains this format and `.lls` preserves the editable project and retained details.
Separate clipboard HTML metadata remains validated. Do not add a second Copy lyrics control.
Do not claim that pasting lyrics into Musixmatch transfers retained tags; native tagging handoff
must be verified before any corresponding control is offered.

Rename the existing comparison action **Compare with Genius**. It compares the Genius projection
with the saved Genius baseline while leaving the active editor format unchanged. If the Genius
projection is unavailable, explain that before opening a misleading comparison. If it has unresolved
representation details, show that scope in Compare; do not treat its projected text as an approved
submission. The existing Genius page association remains explicitly Genius metadata.

Distinguish three empty states:

| State | Presentation and persistence |
| --- | --- |
| Truly new document, no deliberate work | Existing empty-editor help, adapted to profile capabilities |
| Empty visible text with retained sections/details | **No lyrics in this format** and **View retained details**; retain section controls and save the draft |
| User explicitly clears document and details | Existing deliberate clear behavior, one undo event; retained details cannot reappear after switching |

Selecting all visible Musixmatch lyrics and deleting removes that lyric content and its deleted
attachments, while hidden structural controls can remain. Offer `Clear lyrics and retained details`
in the existing document actions surface for a complete reset, using the same inline confirmation
pattern as other destructive document actions. This differs from ordinary select-all deletion.

## 6. Interaction and failure matrix

| Situation | Required behavior |
| --- | --- |
| Switch produces identical text | Still change profile, controls and checks; create one isolated undo event |
| Click current format | Close menu, no history/save/revision churn |
| Rapidly request several formats | One pending target; last explicit choice wins before commit; already committed switches remain separate history events |
| Switch during IME/dead-key composition | Wait for real commit; preserve preedit; replacing/canceling request does not alter composition |
| Type while converter loads | Keep editing current profile; prepare from latest committed state when loading completes |
| Converter fails or limits exceeded | Keep prior committed state; show local reason plus existing announced feedback; Retry only when meaningful |
| Checker unavailable after valid switch | Keep selected target and text; Review says Checking unavailable with Retry, never clean |
| Open diagnostic diff or bulk-fix preview | Retire before switch; require fresh target-profile actions |
| Open assignment/section picker | Dismiss stale choice surface; preserve selection; no old offsets can apply |
| Pending assistant proposal/Harper result | Reject stale basis; keep historical assistant answer labeled with its original profile |
| Open Find/Replace | Keep query/replacement; recalculate matches; old match ranges and proposed replacements are stale |
| Selection entirely in omitted header/annotation syntax | Collapse at mapped section boundary and make retained detail reachable; no unrelated lyric selected |
| Same lyric occurs repeatedly | Keep the occurrence by identity for selection, timing, links, findings and viewport |
| Sync is active | End sync without seek; preserve playhead and anchors; include “Sync ended” in the single format announcement |
| Undo/redo with absent old findings | Restore document state, then choose surviving review occurrence; never reapply stale preview offsets |
| Language changes without text changes | Rerun correct checks, invalidate dependent decisions, preserve active text and typing focus |
| Invalid external metadata | Preserve plain paste under existing clipboard rules; rich project import refuses before mutation |
| Save fails | Preserve memory and pending snapshot; existing save feedback and full project export remain available |
| Concurrent-tab save conflicts | Preserve local work in a separate recovery draft, announce it, leave the newer original intact |
| Unexpected reconciliation failure | Preserve typed text in recovery state; stop unsafe mapped actions and expose recovery/export without replacing it with old lyrics |

## 7. Lexical and language edge cases

These apply to both the converter and its shared policy predicates. A precise recognizer declining
a case is different from silently passing it as conforming.

| Input or uncertainty | Handling |
| --- | --- |
| Number may be a name/title/address/code | Preserve unless reviewed context or an explicit scoped fact establishes its role |
| Leading zeros or integer beyond JS safe range | Preserve as strings; any supported numeric operation uses exact bounded arithmetic, never rounding |
| Decimal/range/fraction/ordinal/currency/percentage | Separate reviewed recognizers; cardinal parsing must decline these forms |
| Time/date/phone number or o'clock phrase | Apply only its dedicated policy/context, not a general number replacement |
| Arabic-Indic/fullwidth/CJK numeric forms | Require the corresponding reviewed script/parser case; no Unicode-wide digit substitution |
| Phrase spans language overrides | No whole-phrase rewrite across incompatible scopes |
| `****`, `f***`, `[?]`, or unknown heard syllables | No fabricated letters, pronunciation, or cutoff position |
| Final hyphen | Cannot by itself establish censorship rather than interruption or ordinary punctuation |
| Acronym period, ellipsis, punctuation inside quotes/brackets | Context-aware terminal-punctuation predicate; no last-character stripping |
| Parenthetical vocals | No blanket lowercase/uppercase operation |
| `Cuz`, `'Cause`, `Yo`, `Yo'` | Meaning-dependent choices; never unconditional spelling-table swaps |
| Bracketed sound description or potentially sung word | Retain ambiguous text; hide only recognized, justified non-vocal information |
| Repeat multiplier | Require explicit repeat scope/count; otherwise review; new repetitions get new untimed identities |
| Eleven actual lyric lines | Section review; no split every ten lines; soft wrapping does not count as extra lines |
| Instrumental marker | Require known/user-confirmed interval and placement; exactly 15 seconds and a gap between lyric starts do not prove the source condition |
| Transliteration/romanization | No automatic linguistic conversion; apply only reviewed guidance/exception handling |
| Combining marks, emoji, bidi text | Preserve exact code units; logical UTF-16 mapping, with valid user-visible caret boundaries |

## 8. Component ownership and validation

| Owner | Planned change |
| --- | --- |
| `ui/layout/DocumentToolbar.svelte`, new `ProfilePicker.svelte` | Visible format, accessible menu, stable responsive slots |
| `ui/layout/Workspace.svelte`, `ui/state/workbench.svelte.ts` | One command/state owner, pending requests, mobile routing and focus |
| `ui/layout/EditorActions.svelte` | Capability-based structural/marker commands |
| `ui/tools/SongPanel.svelte`, shared section/detail content | Canonical Sections and Retained details; exact output explanation |
| `editor/extensions/` | Noncopied stable boundary widgets and mapped navigation |
| `editor/overlays/PerformerPicker.svelte`, performer components | Metadata assignments and representation limits |
| `ui/linter/LinterPanel.svelte`, `diagnostics/` | Active-profile heading, metadata locations and shared typed decision actions |
| `ui/state/panel-view.svelte.ts` | Profile-scoped Review selection and saved choices |
| `ui/styles/shell.css`, `responsive.css` | Reserved geometry, semantic tokens and touch layout |

Use the existing `vitest-browser-svelte` renderer and browser/e2e coverage. Test observable
behavior at desktop, narrow phone and enlarged text, with long names, wrapped lyrics, Arabic
RTL and Japanese/Korean IME. Required acceptance:

1. Format stays visible in every phone task; switching keeps trigger/copy geometry and avoids
   unexpected keyboard opening. Selection, reading occurrence and playback survive.
2. Keyboard menu semantics, visible focus, selected marker and a single format announcement
   work with both profiles. Touch targets and reduced-motion behavior follow current design rules.
3. Section widgets are excluded from copy/search/line counts and have equivalent accessible
   Song controls. Explicit empty sections and metadata-only drafts are reachable and saved.
4. Panel and editor share diagnostic/decision content and actions. Metadata-only findings have
   honest locations and phone navigation returns to the originating decision.
5. Switching, undo and redo restore profile/lyrics/timing/links/voices as specified. Pending
   previews/providers/assistant actions cannot mutate a later state.
6. Fifth voice group, detached annotation, collapsed boundary and literal foreign markup each
   have an executable resolution path with exact preservation before resolution.
7. Converter failure preserves the old state; checker failure never says clean; saved-text
   recovery retains the user's newest input.

Update the relevant current subsystem contracts only with the implementation that changes them,
especially anonymous voices, line/section identity, metadata-only snapshots, empty-draft handling,
profile-specific reference behavior, and exact active-format output.

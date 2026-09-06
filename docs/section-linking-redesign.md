# Linking passages across section variations

Design proposal, September 6, 2026. This describes a replacement, not shipped behavior.
`subsystems/section-links.md` remains authoritative for the current implementation.

## The promise

Linking saves the user from making the same correction repeatedly. A section group describes
which performances belong together; it must not require every performance to contain every
shared phrase. Matching passages stay synchronized with their actual copies. Different wording
is preserved, and the editor tells the user where an edit will go.

Adding an intro to two linked choruses must never disable synchronization between those choruses.
Conversely, a shared word somewhere else in the song is not enough to authorize changing it.

## What the reported song establishes

Running the existing `alignBodies` and `holeContaining` functions against the supplied lyrics
produces these results:

| Passage in Refreng 1 | Only the choruses linked | Intro, both choruses, Outro linked |
| --- | --- | --- |
| `På vingård` | Shared | Local |
| `FaceTime` | Shared | Local |
| `Jeg kan gi deg melodi` | Shared | Shared |
| `badeker` | Local | Local |

The user clarified that both choruses said `badekar` when linked. `badeker` was an edit made
afterward, just before copying the example. Its failure to propagate is the bug, not evidence
of an intentional wording difference. Repeating the check with identical chorus bodies confirms
that `badekar` is shared with just the choruses and becomes local with all four sections.

There are two root causes: the universal intersection discards matches belonging to subsets,
and the tokenizer includes surrounding punctuation in a word token. Consequently `badekar`
and `badekar,` do not match even though both lines contain the exact passage `i et badekar`.
The intro/outro's comma and `ri-ri` should remain independent while the word itself stays linked
across all four. Line-level linking alone would not solve the reported problem.

The current implementation also changes its interpretation according to selection boundaries:
an edit contained in a difference stays local, whereas an edit crossing the difference's edge
can replace that difference in every peer. A slightly larger selection must not implicitly
authorize reconciliation of other performances.

## Editing contract

1. **Exact corresponding passages synchronize automatically.** Each stored passage names its
   actual occurrences. The destination set can be two choruses, an intro and outro, or all four.
   Intervening unique lines do not terminate matches after them.
2. **Shared words remain shared inside different lines.** In this song, establish `i et badekar`
   across the choruses and intro/outro. Replacing or deleting `badekar` then reaches all four,
   automatically, while the surrounding variations remain intact. Typing `badeker` in a linked
   occurrence also reaches all four: the connection follows the edit, not the old spelling.
   No confirmation is required for a connection already established by linking.
3. **Correspondence comes from lyric context.** Use ordered, unambiguous surrounding passages
   to bound word alignment. Whole-line matches are strong evidence, not a prerequisite:
   different lines and intervening extra lines can contain shared words. Separate surrounding
   punctuation from complete Unicode words, retaining internal apostrophes and lexical hyphens.
   Never match character fragments inside unrelated words. Verify intervening whitespace exactly.
   A tied or contradictory match remains unresolved and can be explicitly paired in the comparison.
4. **A group is never a song-wide search-and-replace.** A common word's spelling alone is
   insufficient; its occurrence must fit the surrounding anchors. Here `i et badekar` and its
   position among the surrounding corresponding passages provide that evidence. Normalized text
   can help discovery; automatic editing uses the stored, exact correspondence. Words already
   different when linking was established remain independent until explicitly reconciled.
5. **Selection size does not grant additional permission.** An edit can automatically reach
   a peer only if the entire replaced range and both insertion boundaries have an unambiguous
   stored correspondence there. Crossing independent wording leaves that peer unchanged and
   offers a preview when a meaningful corresponding replacement exists. Do not split arbitrary
   replacement text across disconnected matches or widen an edit to consume a variation.
6. **Boundaries have explicit ownership.** Interior insertions inherit the passage's recipients.
   A boundary between passages with different recipients stays local unless both sides establish
   the same target boundary; show that scope before typing. Preserve the existing distinction
   between adding lyrics and opening space for a new section. Deleting a complete shared passage
   retains its paired empty positions so replacing it continues to work.
7. **Editing this section only detaches only this occurrence of the edited passage.** Other
   copies remain synchronized with each other. Ending the mode preserves that choice, even if
   text later happens to become equal. Explicit reconnection is available.
8. **Matching text does not silently reconnect.** After an explicit wording reconciliation,
   reconnect only the occurrences named by that action. Ordinary typing and unrelated membership
   changes must not erase deliberate independence.
9. **One edit has one result and one undo.** Build all automatic destinations from the same
   pre-edit snapshot; apply text and link changes atomically. Generated edits never recursively
   trigger another round of mirroring. An optional later application to a different version is
   its own undoable action.

## What the user sees

The overview starts with existing links. Each group lists its sections once, with
`Matching passages stay in sync` and a `Manage` action. Details explain which passages share
which destinations; the overview does not count internal diff fragments as outstanding work.

Discovery offers specific next actions: `Link another section` or `Combine linked groups`.
Combining can reference the existing group names without repeating both complete member lists
as though they were unlinked. Membership selection previews the resulting passage connections;
linking itself changes no lyrics. Empty-section filling remains a separately disclosed action.

The active section's header carries a compact, stable scope readout beside its name, in the
same position as the existing `Editing this section only` label. Moving the cursor between
passages updates that header's text to name the actual destinations. Examples:

- `Also edits Refreng 2`
- `Also edits Intro, Refreng 2 and Outro`
- `Only this section`

The readout describes the current caret or selection. A local passage shows `Only this section`;
a shared passage lists the other sections that will receive the edit. Explicit section-only mode
takes precedence and retains `Editing this section only` in the same slot, with its established
mode styling. A naturally local passage does not imply that mode is enabled. Selecting mixed
scopes shows `Some selected wording is independent` rather than claiming one destination set
for the entire selection. Only the active section shows the contextual readout, and it clears
when the selection no longer belongs to one linked section. The persistent Linking panel still
follows explicit navigation, not caret movement.

A corresponding alternative is shown in lyric context with its section name when wording was
already different at link time or was deliberately detached. Explicit reconciliation previews
the precise destination edit; it never silently substitutes a whole version. The reported
`badekar` edit does not belong in this flow: it is an ordinary automatic edit to a shared word.
Declining a reconciliation does not interrupt typing or create an issue count. Previews expire
on a document change rather than guessing how old decisions map to new text.

This is editing scope, not a warning on every keystroke: no success toast, modal, or compulsory
review. Scope changes are accessible without live announcements of every character. Reserve
geometry at desktop and phone widths, including long names. Any refused explicit application
reports visibly and accessibly. Text, focus, and copy remain clean; editor annotations use marks.

## Representation and application

Replace the single group-wide list of divergent holes with stored passage occurrences and
their recipient memberships. A shared passage has an identity and a range in each participating
section. Each occurrence belongs to exactly one shared passage at that range; different shared
passages may name different subsets of the group. Corresponding alternatives and explicit
independence are separate facts from exact equality.

Persist the distinction between automatic correspondence and deliberate independence. Today
both become an indistinguishable hole, which prevents safe upgrades and makes later assistance
guess at intent. Coordinates continue to map through edits and serialize as line/column ranges;
zero-width positions remain meaningful.

The builder can use pairwise alignment as evidence, but cannot simply store every independent
pairwise LCS result. Repeated words can pair different occurrences in different comparisons.
Normalize compatible correspondences into non-overlapping passage memberships; leave conflicts
unresolved. Deterministic tie-breaking alone is not evidence that a repeated occurrence is right.
Existing memberships and explicit exclusions constrain any additional section's alignment.

The transaction planner validates the old text at every destination, deduplicates destinations,
and checks the proposed edits for overlap. It must update every affected passage relationship,
including relationships touched by generated peer edits. Merely mapping offsets leaves stale
equality claims when an edit reaches some copies and not others. Keep structural-boundary,
composition, performer-markup, and history behavior in this same plan rather than inventing
independent mirroring paths.

One owner supplies actual edit scope to the transaction planner, editor readout, comparison,
and performer transforms. Discovery similarity remains a hint, not an editing permission.
Use a versioned persistence representation and bounded alignment work; expensive or unresolved
matching must never freeze typing or present a connection that cannot carry an edit.

## Existing drafts

Do not automatically realign legacy holes. They conflate a naturally different lyric with a
passage deliberately made independent, including passages that now happen to be equal.
Translate legacy shared runs into equivalent passage memberships and retain old holes as
exclusions. Offer an explicit `Review passage connections` upgrade for the remaining wording.
That review names the connections being added and preserves lyrics.

Every copier, backup import/export, clipboard metadata path, and undo effect must preserve the
new representation. Invalid saved passage metadata must not turn excluded text into shared text:
keep lyrics, suspend affected connections, and expose the need to review them. Do not silently
drop an exclusion and resume automatic mirroring. Old applications' handling of a new-format
record must be addressed before enabling writes of the new format.

## Acceptance cases for implementation

- With all four reported sections linked, editing `På vingård` or `FaceTime` reaches the other
  chorus, and editing an intro-only phrase reaches the outro. Shared ending phrases reach all
  four while the outro's `(Sammendrag)` remains intact.
- Start from the user's actual link-time state: both choruses say `badekar`, and the
  intro/outro say `badekar, ri-ri`. Link all four, then replace any occurrence of `badekar`
  with `badeker`, correct it again, or delete that word. Every edit automatically reaches all
  four; surrounding punctuation, ad-libs, and differing line text remain unchanged. Repeat
  from each source section. Do not model the post-edit typo as an original intentional variant.
- Adding or removing a section does not reduce existing passage connections or reconnect
  explicit local wording. A local edit in one of three copies leaves the other two connected.
- Shared lines after inserted unique lines still synchronize. Shared words inside differing
  lines synchronize where surrounding anchors identify their occurrences. Ambiguous repeated
  words do not cross-match silently, and whole-word matching never connects `love` to the
  prefix of `lover`. Commas and trailing ad-libs do not detach the preceding shared word.
- Deletion, replacement, paste, Unicode, punctuation, shared/independent boundaries, terminal
  Enter, medial blank-line filling, composition, and performer assignment preserve destination
  scope. Selecting extra whitespace cannot authorize replacing a peer's variation.
- Undo/redo restores lyrics and exact memberships. Reload, autosave, duplicate draft, recovery,
  backup, and supported metadata paste preserve exclusions and empty positions.
- The active header's scope follows cursor movement between shared and local passages, including
  passage boundaries and mixed selections. Section-only mode overrides it in the same slot.
  Changing the label does not shift lyrics or headers at desktop or phone widths with long names.
- Overview and editor scope agree with actual transaction recipients. Explicit alternative
  applications reject stale previews. Desktop, phone, keyboard, and screen-reader flows expose
  destinations without layout shifts, duplicated group lists, or mandatory difference review.

Implement the core model, versioned storage, mirror, and scope communication as one coherent
replacement. Changing only the overview wording would conceal the limitation; changing only
the universal intersection to pairwise diffs would leave persistence and local intent unsafe.

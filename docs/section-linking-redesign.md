# Linking passages across section variations

Implementation record, September 6, 2026. The replacement is implemented in the workspace;
this document does not claim a production deployment. The authoritative current invariants
and retained failure history are in [the section-links subsystem record](subsystems/section-links.md).

## The problem the reported song exposed

The user linked an Intro, two Refreng sections, and an Outro. Both choruses contained `badekar`
when linked; `badeker` in the pasted example was a later typo that failed to propagate.
The intro and outro contained `Vin-vin-vin, i et badekar, ri-ri`, while the choruses contained
`På vingård, drikker vin i et badekar`.

The previous model shared only text common to **every** section and included surrounding
punctuation in its word tokens. Adding the intro disconnected identical chorus-only wording,
and `badekar,` could not match `badekar`. The overview's `10 differences kept` neither explained
that limitation nor helped the user predict where an edit would go.

The implemented correspondence is:

| Passage | Automatic recipients |
| --- | --- |
| `i et badekar` | Intro, both Refreng sections, Outro |
| `På vingård`, `FaceTime` | Both Refreng sections |
| `Vin-vin-vin` | Intro and Outro |
| Shared ending phrases | All four sections |
| Outro's `(Sammendrag)` | Only Outro |

The connection follows the edit, not the original spelling. Replacing `badekar` with `badeker`,
correcting it again, appending at its word edge, or deleting and retyping it uses its stored
recipients. Each section keeps its comma, differing surrounding lyrics, and trailing ad-lib.

## Correspondence is explicit and bounded

`core/link-passages.ts` establishes word-level correspondence when linking is requested.
Unicode words retain internal apostrophes and lexical hyphens; surrounding punctuation stays
separate. Existing syntax recognizers keep performer tags and Genius annotation IDs out of
lyric matching. Formatting in the middle of a word cannot manufacture smaller lexical anchors.

The algorithm uses pairwise longest-common-subsequence evidence. A pairing is accepted only
when every optimal alignment agrees on that occurrence, with neighboring confirmed words as
context. Isolated words require nearby anchors on both sides unless the complete word sequences
already agree. Compatible pairings become disjoint passage memberships; contradictory positions
and order are rejected. Exact text between corresponding neighboring words can join passages,
so differing spaces, punctuation, or inserted lines are never silently treated as equal.

This is a word-level matcher, not a line-first algorithm. Repeated lines can remain ambiguous;
the implementation offers no arbitrary manual pairing of tied occurrences. A common word's
spelling alone does not create a connection across otherwise unrelated lyrics.

Syntax and alignment work have explicit ceilings: 32,768 UTF-16 units per non-identical body,
2,000 words, one million matrix cells per pair, and four million per build. Exact duplicate
bodies and subsets retain an efficient complete-range path. Discovery scores the same passage
builder, with its lower 400-word ceiling and half-of-the-shorter-body threshold.

## Editing preserves the established scope

Passages are stored intent. Typing maps their coordinates rather than rerunning alignment.
Each peer receives a replacement only when the entire selected range maps contiguously and
exactly there. Different subset scopes can be crossed when that peer participates throughout;
crossing independent wording leaves that peer unchanged. Replacement text is never split among
disconnected matches, and selecting extra characters cannot authorize replacing a variation.

Insertion ownership is concrete: a unique paired empty position wins, then an interior passage,
then the adjacent word's passage, with the word before the caret taking precedence. Remaining
non-word boundaries prefer the passage starting there, then the passage ending there. Thus a
letter appended to shared `badekar` stays shared even beside a local comma. Deleting a shared
word retains its paired empty positions, which remain distinct during coalescing and storage.

`Edit this section only` detaches only the edited source occurrence. Untouched peers remain
connected to each other, and turning the mode off preserves local exclusions. Adding sections
uses `extendPassages` to retain established connections and add compatible recipients without
reconnecting previously independent wording. Merely becoming equal again is insufficient.

Source and peer edits, mapping, and passage transfers are one transaction and one undo event.
IME leaves peers untouched during preedit, then propagates the minimal net committed correction
through the same planner. Cancellation restores the original passage state. Terminal Enter still
opens local space for a new section; subsequent lyrics can extend the existing section. Filling
a medial blank line mirrors its gap once without duplicating the linked tail. Performer edits
continue to use honest minimal ranges and the common destination planner.

## Scope is visible where the user edits

The active linked header shows `Also edits …` or `Only this section`, based on the current
caret or complete selection. Explicit local mode takes precedence with `Editing this section only`.
A selection with no complete peer correspondence explains its independent wording in the hint.

At a boundary where insertion, Backspace, and Delete differ, the label becomes `Typing also edits …`
or `Typing only in this section`. The shared hint and accessible name disclose the two deletion
scopes. The label therefore makes a precise promise instead of implying every key has identical
destinations at one caret.

A fixed-size marker anchors the out-of-flow label. Long names ellipsize within the available width,
with the complete text retained in its accessible name. Button tooltips state only the action. Scope changes briefly
highlight without shifting headers or lyrics; reduced-motion preferences disable the animation.
Selection changes announce scope, while ordinary typing does not speak every character. IME retains
the last settled scope. The header’s `Link`/`Unlink` control opens the respective Linking view.
The adjacent `Pen`/`PenLine` control toggles `Edit this section only`, exposing its state through
`aria-pressed` and its own tooltip. Shared mode uses `Link` and `Pen`; local mode uses `Unlink`
and `PenLine`. Both controls retain separate 24px targets after one character-space from
`]`, centered around a text-height fill centered on the header’s capital height. Artwork stays no
taller than the bracket. The scope text is a
noninteractive sibling of the buttons. The persistent Linking panel continues to
follow explicit navigation.

The overview lists existing groups first. It distinguishes `Set up link`, `Add sections`, and
`Combine groups`, summarizes existing members in discovery actions, and explains the shared/local
behavior once. It no longer presents internal difference counts as work awaiting attention.

## Reconnection and wording choices are explicit

`Link matching lyrics again` appears only when compatible additions exist. It shows the affected
lyrics and named sections, explaining that subsequent edits will update those copies even where
they were previously edited separately. `Link these lyrics again` establishes those connections
without changing wording. Already-connected lyrics are not listed. Preview and application use the
same extension builder. Only exclusions covered by the actual connections are cleared; unrelated
local wording and ambiguous matches remain independent.

Different wording remains in the existing `Review differences` flow, with named destination
previews and explicit choices for individual differences or a whole version. Those approaches
are exclusive. A populated copy's absent phrase can win, while a wholly empty copy cannot erase
populated copies. Empty-copy filling is separately disclosed. Ordinary typing does not silently
reconcile versions or open a compulsory review.

## Persistence and existing drafts

The presence of `passages` selects the new representation; `passages: []` means no automatic
connections. Each passage contains header/line/column occurrences, and `detached` records explicit
local exclusions. Empty positions are meaningful. All draft copiers, backups, Scribe files,
clipboard metadata, and undo preserve this representation through the common helpers.

New records also include whole-body legacy `holes`. An older reader that ignores `passages`
therefore leaves lyrics local; saving from that reader can lose connections but cannot accidentally
gain permission to overwrite variations. On legacy import, exact gaps between holes become passages
and the holes become exclusions. They are not rediscovered automatically. The older no-hole format
uses its legacy alignment while preserving words that already differ.

Malformed new metadata suspends the group's connections as a unit and keeps the lyrics. It cannot
fall back to legacy universal sharing. Explicit connection review is available to rebuild compatible
relationships. Replacing the entire document still loses links unless validated clipboard metadata
explicitly restores them.

## Regression coverage

The implementation is exercised by these focused suites, alongside the existing workbench tests:

| Behavior | Tests |
| --- | --- |
| Reported song, word/punctuation matching, ambiguity, bounded work | `core/link-passages.test.ts`, `editor/passage-linking.svelte.test.ts` |
| Membership additions, old independence, conflicting occurrence mappings | `core/link-passage-extension.test.ts` |
| Exact replacement scope, local edits, mapping, empty positions | `editor/link-passage-edits.test.ts` |
| Composition, undo, persisted state, legacy migration | `editor/passage-transactions.svelte.test.ts`, `editor/section-links.svelte.test.ts` |
| Caret and selection scope, directional boundaries | `editor/passage-scope.svelte.test.ts` |
| Stable desktop/phone header geometry and scope highlight | `editor/extensions/section-link-marker.svelte.test.ts` |
| Connection review and explicit refresh | `ui/linking/PassageConnections.svelte.test.ts` |
| Metadata validation, copy, backup, Scribe, clipboard | `core/link-record.test.ts` and the corresponding persistence/clipboard suites |

Paths in this table are relative to `src/lib/`. These tests establish behavior in the workspace;
deployment remains a separate action.

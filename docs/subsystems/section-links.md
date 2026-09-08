# Section links: shared passages retain their actual copies

Touches: `src/lib/core/link-passages.ts`, `src/lib/core/link-passage-extension.ts`,
`src/lib/core/link-record.ts`, `src/lib/core/link-shape.ts`,
`src/lib/editor/link-passage-edits.ts`, `src/lib/editor/pasted-section-links.ts`,
`src/lib/editor/section-links.ts`,
`src/lib/editor/extensions/section-links.ts`, `src/lib/editor/extensions/section-link-marker.ts`,
`src/lib/ui/linking/`, `src/lib/rules/catalog/section-unlinked-repeat.ts`,
`src/lib/performers/transform.ts`, `src/lib/persistence/copy.ts`

## The rules

- A section group records which performances belong together. Each stored **passage** names
  the actual subset sharing exact text; a chorus-only passage remains connected when an intro
  joins the group. Occurrences have non-overlapping absolute ranges and at most one occurrence
  per header in a passage. Linking preserves lyrics; changing wording requires an explicit choice.
- `alignPassages` establishes peer correspondence only on a linking or explicit reconnection action.
  Replacement paste may align each old body with its own new version to map existing intent;
  it never discovers connections between pasted peers.
  It matches complete Unicode lyric words, retaining internal apostrophes and lexical hyphens
  while separating surrounding punctuation. Performer tag names and annotation IDs are not
  lyric tokens: use `extractLineStyleSpans` and `scanAnnotations`, their existing owners.
  Mid-word formatting must not create standalone word fragments.
- Pairwise LCS evidence is accepted only where the pairing is forced in every optimal alignment.
  Neighboring matched words supply context; an isolated word needs nearby anchors on both sides,
  unless the complete lexical sequences already agree. Normalize pair evidence into compatible
  components; contradictory occurrences or order stay local. Intervening punctuation, whitespace,
  and line breaks join passages only when their exact text and adjacent word anchors agree.
- Work is bounded before syntax scanning and quadratic alignment. Non-identical bodies over
  32,768 UTF-16 units, over 2,000 words, or over the pair/total matrix budgets are not aligned.
  Exact duplicate bodies and subsets still connect without quadratic comparison. Discovery uses
  `linkBodySimilarity`, which scores `alignPassages` ranges and shares its lexical counting owner;
  the automatic discovery ceiling remains 400 words and the threshold half the shorter body.
- Discovery reuses lexical facts and pair scores by complete body text, plus the boolean answer
  for unchanged same-kind groups. Cache limits never skip candidate pairs or retain diagnostic
  ranges. A pair with no common lexical word can be rejected before alignment; a shared word
  still requires the ordinary ambiguity-aware aligner. Caller token ceilings apply on cache hits.
- Stored correspondence is editing intent, never a fresh diff after typing. Membership changes
  use `extendPassages`: retain established connections, split at their boundaries, add compatible
  recipients, and preserve old local wording. Equal text does not silently reconnect exclusions.
- `passageTargets` owns automatic destinations for the mirror, header scope, and performer edits.
  A replacement reaches a peer only when its **entire** range maps contiguously and exactly there,
  including every intervening boundary. It may cross different passage subsets if that peer
  participates throughout. Never split arbitrary replacement text or widen it over a variation.
- An insertion first belongs to a unique stored empty passage, then an interior passage, then the
  adjacent word's passage (word before the caret first, otherwise word after it). At a remaining
  non-word boundary, prefer the passage starting there, then the one ending there. This lets a
  letter appended to `badekar` remain linked despite a local comma. The scope label reports this
  insertion policy; Backspace and Delete can have different destinations at the same caret.
- A deleted shared passage retains its paired empty positions. Coalescing must not absorb that
  insertion owner into its adjacent nonempty passages, including across membership subsets.
  Explicit local insertion points take precedence and also prevent coalescing across them; a
  selection spanning one stays local. Identical collapsed connections have one stored owner.
  Mapping splits only touched relationships; peers left unchanged remain connected to each other.
- Mirroring is a `transactionFilter` with `sequential: true`: all destinations are planned from
  one pre-edit snapshot and applied atomically with link changes. Reject overlapping destination
  edits. Multiple edits in one linked source can mirror; edits spanning sections or headers do
  not acquire a guessed source. Undo/redo replay the complete transaction without remirroring.
- IME preedit does not update peers or rederive scope. On commit, `narrowEdit` derives the minimal
  **net** correction from the saved precomposition document; that operation mirrors through the
  same passage planner. The committed correction and exact passage state form one undo event,
  even after a long character-selection pause. Cancelled composition restores its saved intent.
- A terminal bare line break stays local to leave room for a new section. If subsequent lyrics
  prove the same section grew, only the extension mirrors; a new header does not. A medial
  blank line retains the linked tail so filling the gap mirrors once, without duplicating that
  tail. Section-only mode and independently worded endings keep their extensions local.
- Every edit must report its honest range. `narrowEdit` in `performers/transform.ts` prevents a
  performer wrapper from claiming to replace a whole line. An ad-lib present in one copy stays
  there; assignment on shared words uses the same exact destinations and updates linked legends
  through the established performer transaction.
- `Edit this section only` (`Mod-Shift-L`) remains a section-scoped toggle. It detaches only that
  occurrence's touched range; the other copies stay connected. Moving the caret does not disable
  the mode. Turning it off resumes untouched shared passages and preserves its local exclusions.
  The persistent panel renders a switch; the header retains its danger rail, wash, and explicit
  `Editing this section only` label. `makeDifferent` likewise records a source-only exclusion.
- Only the active linked section shows ordinary caret/selection scope beside its header:
  `Also edits …` or `Only this section`. If directional deletion differs from insertion, use
  `Typing also edits …` / `Typing only in this section` and disclose Backspace/Delete scopes in
  the accessible name. A mixed selection reports the actual complete-operation
  recipients; if none, its accessible description explains the independent wording. Section-only mode takes precedence.
- The scope label is out of flow beside the fixed-size marker and bounded by the available line
  width. Long labels ellipsize visually but remain complete in the accessible name. Button
  hints state only their action, without repeating the adjacent scope. Scope changes briefly highlight without changing text geometry, respect reduced motion,
  and do not restart the highlight for an unchanged label. Selection-driven scope changes are
  announced; typing does not announce every character. Provisional IME retains settled scope.
- The persistent Linking panel follows explicit navigation, never caret movement or hover. Its
  overview lists existing groups first and distinguishes `Set up link`, `Add sections`, and
  `Combine groups`. Existing members are summarized in discovery actions rather than repeated
  as unlinked sections. Explain once: matching passages stay in sync and variations stay local;
  internal diff counts are not an outstanding-work status.
- `Link matching lyrics again` appears only when compatible exact connections can be added.
  It previews only the affected lyrics and named sections, explaining that future edits will
  update those copies even where the user previously edited them separately. `Link these lyrics
  again` clears only covered exclusions and changes no wording. Do not list already-connected
  lyrics or draw an empty recovery surface. There is no arbitrary manual pairing of ambiguous
  repeated occurrences. Wording alternatives remain the explicit comparison flow.
- Comparisons preserve readable lyric context, real line breaks, named destinations, and clickable
  lyric gutters. `Review differences` is optional. Individual wording choices and choosing one
  whole version are exclusive; switching clears pending choices. A populated copy's absent phrase
  can win, but a wholly empty copy cannot erase populated peers. Empty-copy filling is separately
  disclosed. No nested comparison scrollbar or mandatory review to preserve variations.
- The picker offers same-semantic chorus/pre-/post-chorus sets plus sufficiently similar differently
  named sections, and always retains existing peers. `section.unlinked-repeat` remains a
  same-semantic suggestion with no fix, gated by the same core similarity owner. Its action uses
  the exact primary or related occurrence that opened it. `filterForEditorState` suppresses it
  only when one group covers every reported occurrence; link-only changes republish the snapshot.
- Undo's mapped restore effect carries groups, passages, and exclusions. Persistence uses header
  lines plus occurrence line/column ends read from live coordinates. Presence of `passages` selects
  the new format; `passages: []` means no automatic connections. Every copier, backup, Scribe file,
  and supported clipboard path preserves passages, `detached`, and zero-width positions through
  `copySectionLinks` / `validateLinkPassages`.
- New records include whole-body legacy `holes` so an older reader leaves lyrics local rather than
  treating missing metadata as universal sharing. Legacy holes migrate as exclusions and their
  valid exact gaps become passages; do not rediscover inside those holes. A legacy record with
  no holes uses its old word alignment, preserving mismatched words rather than overwriting them.
  Invalid new metadata suspends the group's passages atomically, preserves lyrics, and cannot
  fall through to legacy alignment. Explicit connection review is the recovery route.
- Membership is a range over the header line; deleting it retires that member, and fewer than two
  members is no group. A replacement paste recovers known members when heading, occurrence order,
  and lyric evidence identify their new sections. Ambiguous or unrelated members drop; existing
  local exclusions remain local. Validated clipboard metadata takes precedence over recovery.
  Deletion followed by a separate plain paste retains no hidden link history.
  The link icon opens that section in Linking on click,
  Enter, or Space. The management icon is Lucide `Link` during shared editing and `Unlink`
  during local editing; both open management rather than unlinking the section. The adjacent
  mode control uses `Pen` for shared editing and `PenLine` for `Edit this section only`, with a
  stable accessible name, `aria-pressed`, and its own shared hint. It preserves the panel and
  caret. These inline actions follow one header-character space after `]`, with separate
  24px targets centered around a text-height background centered on the header’s capital height.
  The targets extend beyond the fill without increasing the line height. Artwork is no taller
  than the bracket. The scope
  readout is a noninteractive sibling, never part of either button. A subtle shared fill groups
  the two controls; the scope uses regular-weight muted text, retaining danger text in local mode.
  Local lyric ranges are dotted `Decoration.mark`s, never content widgets.

## Decision record

### A Genius refresh carries forward the links the draft already knows

Replacing the lyrics with a fresh copy from Genius used to erase every linked header, even
when the same sections returned unchanged. The transcriber was refreshing the wording, not
discarding their editing decisions. `pasted-section-links.ts` now recovers those decisions for
`input.paste` transactions that erase an existing member header.

Sections match by heading name and occurrence order when the count is stable, with the existing
body-similarity predicate supplying lyric evidence. A unique exact body takes precedence; conflicting
reordering is rejected. When the count changes, only bodies unique in both versions identify a
survivor. Unrelated lyrics with familiar headings and indistinguishable inserted/deleted repeats
therefore cannot inherit links. Groups need two surviving members and never acquire new ones.

The bounded passage aligner compares each old body only with its identified new version. Its
exact anchors produce a finer mapping for metadata, which `mapPassageState` applies to the stored
passages and exclusions. Equal corrections inside previously shared spans retain their connections
through `passageTargets` and `applyPassageTransfer`; changes across local boundaries cannot invent
connections. Empty passage lists, paired insertion points, and deliberately equal local words keep
their meaning. The paste itself remains the exact incoming text and is never mirrored by recovery.

Recovery uses the mapped restore effect in the same transaction as the paste, so undo/redo and the
existing link-change notifier carry the words and decisions together. A validated carrying clipboard
opts out: its own stored intent wins. Ordinary body editing keeps the normal mirror; deleting the
document and later pasting plain text has no previous document to recover from. Browser regressions
in `clipboard-metadata.svelte.test.ts` cover refresh, later propagation, preserved exclusions,
ambiguity, unrelated lyrics, and atomic history.

### Discovery keeps unchanged work without a pair-count cliff

The old 64-entry pair-score cache cleared itself on overflow. Eleven unrelated chorus bodies made
55 comparisons and stayed warm; twelve made 66 and repeatedly discarded the scores they were about
to need. Every native lint pass therefore paid the full alignment cost again on unchanged lyrics.

Discovery now retains lexical facts for up to 128 bodies and 262,144 UTF-16 units of body text.
Pair scores use weak body endpoints, so evicting a body releases its comparisons without retaining
its lyrics in each pair key. `passageLexicon` uses correspondence's existing word, markup,
annotation and body-length guards. No common lexical word proves that two non-identical bodies
have no shared passage; finding a common word proves nothing until `alignPassages` accepts it.
The caller's token ceiling is checked before a cached score, and exact copies still bypass it.

The rule also caches up to 16 complete group answers, bounded to 65,536 units per key and 262,144
units in total. This preserves unchanged groups beyond the body cache's capacity when another
section is edited. Only the boolean answer is stored: source selection, related ranges and the
current finding are rebuilt. Oversized or evicted inputs follow the same complete comparison
path, never a truncated candidate list. Tests cover all 66 pairs, late valid pairs, groups beyond
the body-cache capacity, shifted ranges, eviction and parity with the full aligner.

### September 6, 2026: an intro must not disconnect two identical choruses

The reported Norwegian song contains an intro and outro with `Vin-vin-vin, i et badekar, ri-ri`
and two choruses with `På vingård, drikker vin i et badekar`. Both choruses said `badekar` when
linked. The pasted `badeker` was a subsequent typo which failed to propagate, not an intentional
variant to preserve.

The old model had two failures. Its shared runs were the intersection of **every** member, so
adding the intro discarded chorus-only connections such as `På vingård` and `FaceTime`. Its
whitespace tokenizer treated `badekar,` as a different word from `badekar`, so even the common
`i et badekar` could not carry a correction across all four. Listing `10 differences kept`
explained neither failure and made ordinary variations look like work to resolve.

A passage now records its actual copies. `i et badekar` connects all four; chorus-only wording
connects the two choruses; intro wording connects the intro and outro. The outro's `(Sammendrag)`
remains its own. Replacement, deletion, correction, and appending at the word boundary follow
those stored connections regardless of the current spelling. This is the behavior exercised by
`core/link-passages.test.ts` and `editor/passage-linking.svelte.test.ts`.

#### Ordered evidence is useful; arbitrary tie-breaking is not intent

`alignPassages` uses word-level LCS, not a line-first matcher. Prefix and suffix LCS tables
identify every possible pair at each rank of an optimal alignment. A pair is accepted only if
that rank has one possibility. Adjacent accepted words anchor each other; an isolated match
requires anchored words before and after it within 24 lexical positions in both copies. Exact
whole lexical sequences supply their own positional evidence, including a one-word refrain.
A repeated `hold on` line inserted among identical `hold on` lines remains ambiguous; choosing
one by scan direction would fabricate an occurrence identity.

Compatible pair evidence is merged into disjoint components. More than one occurrence from one
section in a component, or conflicting order across sections, rejects that correspondence.
Only exact glue between corresponding neighboring words can merge their ranges. This preserves
punctuation and spacing while letting the preceding complete word remain shared. Tag names and
annotation IDs are omitted using the parser's recognizers: sung Norwegian `i` must never connect
to the `i` inside `<i>`, and annotation `123` must never connect to a sung number. A formatted
fragment such as `lo<i>ve</i>` cannot introduce standalone `lo` and `ve` anchors.

Pair matrices are limited to one million cells, with four million across one build. Syntax
scanning also has a body-length ceiling because malformed tag-like input can be costly before
word alignment starts. Identical bodies still have a direct path, including oversized duplicate
subsets. Refusal to align uncertain or oversized material leaves it local rather than freezing
link setup or fabricating editable connections.

#### Existing connections win when membership grows

A fresh global diff cannot tell a correction from an intentional variation. The replacement
therefore keeps the old decision to store intent, but stores positive passage membership and
explicit exclusions separately. `extendPassages` splits candidate ranges at established
boundaries, inherits all existing peers of those slices, and refuses contradictory positions or
order. It also refuses reconnection between formerly grouped headers where their old passages
did not establish that relationship. Adding an intro cannot reduce an existing chorus pair,
and a previously local edit cannot reconnect merely because its wording later happens to match.

`Link matching lyrics again` is the explicit way to reconsider that choice. Its preview and
application use the same compatible-extension builder. It names recipient groups and quotes the
passages about to reconnect. The action clears only exclusions actually covered by connected
ranges; different wording and unresolved matches remain independent. It does not rewrite lyrics
or offer arbitrary pairing controls for a tied repeated occurrence.

#### Selection size never authorizes replacing a variation

The historical mirror treated crossing a hole boundary as permission to swallow the whole
variation in every peer. Replacing `there tonight` could silently replace a peer's `there again`.
The new planner checks each destination separately: every selected character and intervening
boundary must have a contiguous exact correspondence there. A selection across four-way and
chorus-only passages can reach the other chorus if its complete range is connected, while the
intro remains unchanged. A selection spanning local wording stays local to that peer.

The entire replacement is carried as one operation; its inserted characters are not distributed
among disconnected matches. Mapping updates all relationships touched by source and generated
edits, retaining unchanged peer subsets. One transaction and one undo restore text and the exact
connections, including a shared word deleted to paired empty positions. Those positions remain
separate during coalescing and serialization because they own a later insertion. A sequence of
local deletions followed by the same deletion in the other copies exposed two additional hazards:
intermediate merging could close an earlier recipient’s cut, and a subset’s empty position could
be swallowed by a larger shared passage. Transfers now preserve all cuts until their replacement
is installed; coalescing respects empty positions across every subset and explicit local boundary.
When a deletion collapses a shared position onto a local exception, the exception retains ownership.

IME follows the same operation contract after composition ends. Repeated provisional replacements
can make the accumulated ChangeSet much wider than the final correction. Deriving the narrow
net change from the saved document prevents a single composed character from claiming a whole
word or losing its insertion relationship. Peers wait until commit; cancellation restores the
precomposition passage state; a delayed commit still belongs to the same undo event.

#### The header describes this caret, not the entire group

At the end of shared `badekar` followed by a local comma, typing extends the shared word,
Backspace removes its shared last letter, and Delete removes the local comma. One undifferentiated
`Also edits …` promise would be false for one of those actions. The header therefore says
`Typing also edits …` when the three destination sets differ, and the accessible
name describes Backspace and Delete. Selections use their actual whole-operation recipients.

The readout occupies an out-of-flow slot beside the fixed-size link control. Long destinations
fit the remaining width with ellipsis and stay fully available through the accessible name. Changing scope uses a short background highlight, disabled under reduced
motion, rather than shifting the header or lyrics. The existing section-only danger treatment
remains distinct from naturally local wording. `editor/passage-scope.svelte.test.ts` and
`editor/extensions/section-link-marker.svelte.test.ts` exercise scope and geometry.

#### The header controls editing; recovery offers a concrete action

The first passage UI exposed the stored connection inventory even when there was nothing to do.
Two identical refrains produced a large highlighted lyric list headed “Already connected,” below
“No additional matching passages.” That taught neither a useful action nor an understandable
state. The recovery disclosure now exists only for additions, shows only the affected lyrics,
and explains what linking them again will change about subsequent edits. Already-connected text
stays in the editor rather than becoming another review task.

The same release made the header hint say “Manage linking,” burying “Edit this section only” in
the panel. The header is where a transcriber is deciding whether this edit should spread, but
repurposing the familiar `⇄` control to toggle that mode changed its established meaning. Keep
the linking control opening the respective Linking view. It uses `Link` during shared editing
and `Unlink` during local editing, while the adjacent mode control uses `Pen` and `PenLine`.
The icons communicate state without changing what either control does. Both pairs sit inline
after one character-space from the bracket. Glyph-sized targets crowded the icons and made
them difficult to press; baseline alignment also lifted the controls above the header. Each
now has a separate 24px target, vertically centered beside the header. The scope readout is
a noninteractive sibling so its text cannot accidentally open Linking. Separate floating icons
and a bold scope sentence still read as unrelated additions. A subtle shared fill now groups
the two controls, while regular-weight muted scope text follows outside that group. The spacing
token initially produced 32px targets; the compact targets now use the actual 24px token.
The visible group now uses the header’s text height and capital-height alignment, while the 24px
targets extend around it. Target size must not determine the visible fill or lift the line.
Button hints name only the action, without repeating the adjacent scope.
Each control has its own hint and keyboard activation; the mode control exposes `aria-pressed`
and retains the explicit header treatment. Hover and focus change neither the mode nor the panel.

#### Stored passage metadata must fail local in an older reader too

The presence of `passages` is the format discriminator, not a truthiness check: an empty list
means all wording is local. `detached` records deliberate source-only exclusions, including
empty positions. Drafts, copies, backups, Scribe, clipboard metadata, and undo all carry those
fields. The common validator rejects a malformed new-format group as a unit and retains the
empty passage list so no fallback can silently turn it into a universally shared legacy link.

New records additionally store whole-body legacy holes. An older tab or importer ignoring the
new fields therefore sees entirely local bodies. If it saves again, newer code imports those
holes as exclusions; it can lose automatic connections, but cannot gain permission to overwrite
lyrics. For genuine legacy holes, exact gaps are translated without rediscovering inside the
holes. The older no-hole format has no such recorded exclusion and uses its legacy alignment
while preserving any differing words that have arrived since it was saved. Explicit connection
review can recover compatible connections without changing text.

Validation lives in `core/link-record.test.ts`, `editor/passage-transactions.svelte.test.ts`, the
clipboard suites, and the persistence/backup/Scribe suites. `editor/section-links.svelte.test.ts`
retains the existing performer, local-mode, terminal-line, structural, and undo regressions while
asserting actual passages and exclusions instead of the legacy fallback hole count.


### Historical record: the group-wide hole model (superseded September 6, 2026)

> Historical scope: every subsection below describes the superseded implementation and its
> failure history. Its universal shared runs, hole-swallowing mirror, IME exemption, and hole-only
> persistence are not current contracts. The current rules and September 6 record above take
> precedence; retained UX, discovery, and data-loss incidents explain the decisions that survived.

A song's second chorus is its first chorus, so transcribing it means typing the same lines
again — and the mistake that follows is the one nobody catches: one of them has a typo, or a
correction lands in one and not the others, and the page ships with two versions of a line that is
sung once. Linking is the answer.

**A group used to be one body repeated, and that was the whole problem.** Linking overwrote every
copy from the one the picker was opened on, and the mirror rewrote each peer's entire body on every
edit — so the commonest shape in pop music, two choruses that are identical apart from the last
line, could not be linked at all. The only offer on the table destroyed the difference the
transcriber meant to keep, and the linter deliberately went quiet rather than make it. The feature
worked exactly where it was least needed.

**So a group is a merge structure now, not a body.** Each member's body is a partition into
alternating **shared runs** and **divergent runs**, and two facts hold at all times:

- every member has the same number of divergent runs, and
- the shared text between run `k-1` and run `k` is identical in every member.

Which means a position in shared text is expressible in coordinates every member agrees on — _so
many characters into the run after hole 3_ — and that one property is what everything else is built
out of. An edit made in one copy is carried to the others by translating its span; nobody's body is
rewritten wholesale, and nobody's own words are touched.

**Only the divergent runs are stored.** The shared runs are the gaps between them, so the second
half of the invariant is true by construction rather than by two lists agreeing.

**Linking therefore writes nothing.** `alignBodies` works out what the copies already share, that
becomes the shared runs, and everything else is set aside as each copy's own. Pressing `Link` on two
choruses that differ by a line changes not one character of the document — it only says that from
now on they move together, apart from the words named in the card. Making copies actually agree is
available through an explicit whole-version choice or individual differences, so replacing lyrics
is something the user requests rather than the price of linking at all.

**The section kind is a discovery hint, not a link gate.** Chorus, pre-chorus and post-chorus
(`LINKABLE_SEMANTICS`) are still offered as complete same-kind sets, including empty copies and
intentional variations, because those are the parts a transcriber ordinarily repeats verbatim. A
verse repeats its shape and not its words, so verses are not offered merely for both being verses.
But any headed section can open the picker, and a differently named section is offered when the
aligner says it shares at least half of the shorter body. That admits the real cross-name case — an
Intro whose lyrics return under Chorus or Outro — without filling the card with structurally similar
but lyrically unrelated verses. The person still confirms the selected candidates; similarity never links them automatically.

**Existing peers bypass discovery.** After an Intro and Chorus are linked, `Edit this section only`
can make their current bodies less than half alike. Hiding the Chorus on the next opening would
present the group as unlinked and remove the way to manage it, so the stored membership is unioned
into the candidate list regardless of its current score.

**The kind is the language pack's `semanticPart`, never the spelling.** That is what makes this work
in every supported language without a word of it being written twice: `[Hook]` and `[Refreng]` and
`[코러스]` are all `chorus`, and `Chorus 2` matches `Chorus` because the ordinal is stripped by the
same `headerSemanticKey` the section picker orders its suggestions with — one answer to "is this a
chorus", exported from `languages/registry.ts`, because two would disagree the first time a pack
gained a term. **English is consulted second**, not instead: Genius pages in every language carry
English headers routinely — `ja` is an English pack outright, `no` lists `Chorus` beside `Refreng` —
so a German draft with `[Chorus]` in it links exactly like one with `[Hook]`, while the selected pack
still wins where the two disagree.

#### The alignment is decided once, and that is not an optimisation

The tempting design is to re-derive the shape on every edit — git-style, re-diff and see what lines
up. It is wrong, and the reason is worth stating because it will be proposed again.

**Git can re-align because it has three versions.** Base, ours, theirs: it knows which side moved.
Here there is no stored common ancestor, so a live aligner has to guess whether an edit meant the
copies to converge or to diverge further. Fix a typo in one chorus and it must decide whether you
were making them agree — in which case it should propagate — or writing a deliberate variation, in
which case it must not. **A diff cannot tell a mistake from a decision.** Guess one way and it eats a
difference the user meant to keep; guess the other and the typo stays in one copy for good.

So the shape is worked out once, when a link is made or its membership changes, and is **stored
intent** from then on. It is re-derived only where there is no intent to honour: a group loaded from
a draft written before differences existed, or one whose members somehow ended up with different
numbers of runs, where every translation downstream would refuse anyway.

Three things about the aligner itself:

- **It matches words and line breaks, never characters.** A character-level alignment finds the `to`
  inside both `tonight` and `together` and calls it a common anchor — a shared run nobody would
  recognise as shared, which then propagates edits the user never asked to propagate. Line breaks are
  tokens of their own so a lyric's line structure survives instead of words drifting across it.
- **Matched tokens are not enough; the text between them is verified.** The whitespace between
  tokens is not tokenized, so two copies can match word for word and still differ by a double space.
  A run whose full span is not byte-identical in every member is not a shared run.
- **Whitespace at a run's edges is handed back to the shared text.** A run begins where the last
  matched word ended, so `my love` against `my friend` opens the difference at the space and reports
  ` love` against ` friend` — a difference whose first character is the same in both copies, which is
  the one thing a difference is not. **Whitespace only, never a letter**: `love` and `lover` share
  four characters, and trimming those would end the shared run mid-word, which is the coincidental
  anchor that tokenizing by word exists to prevent arriving through the back door.

#### The mirror carries a run, and the rule is contained against overlapping

An edit lands in one member's body. What happens next is two lines:

- **A change wholly _contained_ in a divergent run stays where it was made.** The run absorbs it,
  nothing is carried to the peers. This is the half that makes two choruses differing by a line
  linkable at all.
- **A change that merely _overlaps_ a run took that run with it, in every copy.** Retyping a line
  that contains a difference, or deleting across one, is the user writing over words that were
  deliberately their own — so the difference ends, the words become shared, and the mirrored span is
  widened to swallow the same run everywhere.

`carryHoles` in the field and `expandOverHoles` in the mirror name **the same set from opposite
ends**, which is why the counts stay equal without anything having to count them.

**Which puts the whole invariant at the mercy of every edit reporting its own size honestly, and one
did not.** An edit's range is a claim about what the user wrote over, and the two rules above are
read off nothing else — so an edit that says it replaced more than it did ends differences nobody
touched. `transformLine` in `performers/transform.ts` renders a lyric line whole, every piece
concatenated, and used to hand back `{ from: line.from, to: line.to }` for it. Tagging a performer
on an ad-lib that exists in one chorus only is an insertion of two tags around five characters; it
arrived as a claim to have rewritten the line, so the difference died and the ad-lib was copied into
every other copy. Silently, with the source line correct, and only visible on the peer the user was
not looking at. It was reported from a real transcription, on an ad-lib in the middle of a line —
the position decides nothing, and the trailing one that looked fine was fine only because it had
been styled before the sections were linked.

`narrowEdit` is the repair: the common text at both ends stays put and the range covers what
changed, so wrapping words that are this copy's own is an edit _contained_ in the run and the rule
above answers correctly on its own. Two things it owes. The trims are **clamped to the selected
content's own span**, because `insertedOffset` maps the selection as an offset into the edit's
`insert` and an edit that started after that offset would have nothing to measure. And neither trim
may stop **between the halves of a surrogate pair**, which is the one way a shorter range could be
worse than the long one it replaces.

The fix is deliberately in the transform and not in the mirror. An exemption for performer markup
would be a second rule beside the containment one, and the copy that drifted would be the one nobody
is looking at — while the honest range is owed to line anchors and to undo granularity anyway. The
pair in `section-links.svelte.test.ts` pins both halves: an ad-lib tagged in one copy stays there
whichever position it sits in, and a performer tagged on **shared** words still reaches every copy.
`transform-boundaries.test.ts` pins the seeds themselves, so a rewrite that goes back to claiming
whole lines fails there rather than in somebody's second chorus.

**A run's ends map outwards** — `from` backwards, `to` forwards — so it is greedy at its edges:
typing at the end of a word that was deliberately this copy's own leaves it this copy's own. The
containment rule agrees with this by construction, because an insertion at either edge is contained.

**What gets carried is the whole shared run, not the characters that changed**, and that is
correctness rather than convenience. A shared run is identical in every member _by definition_, so
writing all of it is idempotent where the group is in step and **repairs** it where it is not.
Carrying only the edited slice trusts every offset inside the run to already line up, and leaves the
copies disagreeing forever the first time one does not. It is also what makes a group with no
differences behave exactly as the old whole-body link did — one run, the whole body, replaced — so
a draft saved before any of this still mirrors the way it always did.

Four things it still refuses, and the refusals are the design:

- **Undo, redo, and IME composition are exempt**, so history replays byte for byte and a preedit is
  never interrupted.
- **Only a single contiguous edit inside exactly one member's body is mirrored.** An edit reaching a
  header, spanning two sections, or arriving scattered is a restructuring rather than a rewrite of
  the words, and guessing at those is how a link eats work the user meant to keep.
- **Membership is a range over the header's own line, never a point at its start.** The distinction
  `line-anchors.ts` documents at length: a point sits on the _boundary_ of the deletion that removes
  the line, so a deleted section would leave its membership behind for whatever line moved up into
  its place. Erasure is detected the same way — map the start forward, map the end backward, and if
  they meet, every character it described is gone.
- **A group with fewer than two members is not a group.** Delete a linked section and the rest carry
  on; delete all but one and the link is simply off. That is also what makes unlinking one effect
  rather than two: `setSectionLinkEffect` names the whole resulting group, every named header leaves
  whatever group it was in first, and a lone survivor comes loose.

**And it is a `transactionFilter`, not a follow-up dispatch.** The mirrored edits are appended to the
transaction that caused them with `sequential: true`, exactly as `headerRenameFilter` mirrors a
performer's name: the document is never briefly inconsistent, one snapshot is emitted, and one undo
restores every section at once. A second `view.dispatch` would give the user one undo step per linked
section for something they typed once.

#### The last line is both lyric text and a way out of the section

Press Enter in the middle of a linked body and the intent is clear: a repeated lyric line is being
split or a new one is being inserted among the repeated words, so the break mirrors. Press Enter at
the body's exact right edge and the intent is not clear yet. It may extend the chorus, or it may be
the blank space before `[Verse 3]`. Mirroring immediately chose the first interpretation and added
blank lines beneath every earlier chorus while the transcriber was trying to continue the song at
the foot of the document.

**The bare terminal break is therefore structural and local.** The post-change parse decides what
happens next. If a header begins, the old section's body still ends where it did and every character
of the new section remains outside the link. If ordinary lyric text begins instead, the parser
extends the same section across the waiting break; that is the first unambiguous evidence that the
chorus itself grew, so the complete new tail is inserted at every peer's body end. From the next
character onward it is ordinary shared text again. This keeps both natural sequences intact:
Enter, Enter, `[Verse]` creates one new section, while Enter followed by another lyric adds that
line to each linked copy.

An explicit local mode or a divergent run already reaching the body's end keeps the extension
local. In that case the new tail extends the existing difference (or creates a corresponding
zero-width run in each peer), preserving the rule that a divergent run owns edits at its greedy
edge. The boundary regressions in `section-links.svelte.test.ts` pin all four cases: middle break,
terminal break before a header, shared terminal lyric, and local terminal lyric.

**A break at the end of a lyric line is a middle break that parses as two sections.** Splitting
`Hold` mid-word keeps one section, but pressing Enter at the line's end inserts before the break
already there, so `Hold\nNever` becomes `Hold\n\nNever`: a blank physical line, which closes the
section and leaves a headerless tail. The bare break still mirrors — every peer splits the same
way and the group stays in step on its truncated bodies — but the terminal extension must not
answer the fill that follows. It would carry the whole tail (`\nNew\nNever`) to each peer's body
end, duplicating the `Never` the peer already holds, and the copies read as two separate sections
from then on. The fill is therefore its own path (`medialGapFill`): only the filled gap travels,
replacing each peer's blank gap, so every copy merges back with the same new line. Local mode or
a final divergent run stays local here too.

#### Making copies agree is asked for per difference

`keepDifferent[i] === false` collapses difference `i` to one wording. The individual winner in
`replaceFromByDifference[i]` takes precedence over the group-wide `replaceFrom`; absent both,
the opened copy is the source. An absent phrase in a populated source wins exactly as written.
Only a **wholly empty source body** falls back to the first populated wording in the group: an
untyped `[Chorus 3]` should fill rather than erase the copies with lyrics.

The picker omits wholly empty sections from replacement choices; their absent rows remain visible
in the comparison. If populated and empty sections share an absent wording, the populated copy
represents that choice. Thus every visible wording action can produce the absence or words it
names. **The group, never the document** supplies the fallback: an unticked copy is outside the
user's decision.

#### Setting words aside by hand is a selection and a press — and the press was retired

The former `requestSectionLink` popover could offer a lyric selection as a new difference.
Its old `Mod-Shift-L` chord now enables `Edit this section only` instead, which covers the ordinary
job: writing words in one copy. The Linking panel resolves explicit requests to the containing
section and leaves creating local differences to this mode. The lower-level `makeDifferent`
command remains available on the editor handle.

Its span is **translated** into every peer rather than searched for, through the same arithmetic
the mirror uses: a position in shared text is the same distance from the nearest difference in
every copy. It lands in every member or in none, because mismatched run counts would make the
mirror refuse. `linkTargetAt` still resolves explicit commands from the caret or lyric selection;
`linkableHeaderAt` is selection metadata, and selecting a header no longer opens a linking surface.

**And the answer about existing differences is resolved before a new one is added.** Inserting first
would shift every index the user's ticks were given against, silently, and collapse the wrong
difference.

**`Edit this section only` belongs to the section, not to a caret position.** The one-shot design made the
user predict which edit CodeMirror would report next, then quietly retired itself after that edit.
Moving to another line of the same chorus restored mirroring without a visible mode change. The
toggle now survives edits and selection movement and is available anywhere in a linked member,
including inside an existing difference and at an empty run.

**A local edit changes the smallest coherent part of the merge shape.** If it is wholly inside an
existing divergent run, that run simply maps through the edit. In shared text, the exact changed
span becomes a new run in every member. If the edit crosses one or more existing runs, those runs
and only the shared text crossed between them become one run. The untouched words on either side
remain linked. This is what “only this section” means without throwing away word-level linking for
the rest of the chorus.

**Turning the toggle off never reconciles words.** It changes the scope of future edits only;
differences made while it was on remain explicit divergent runs. Shared text mirrors again, while
typing inside a preserved run remains local by the ordinary containment rule. Reconciliation stays
in the Linking panel, where the versions and the winning copy are visible before text changes. The old
caret-based `rejoinLinkedWordsAt` command had no remaining callers after the toggle replaced it
and was removed; the panel remains the reconciliation path.

**The panel uses a switch and changes in place.** This is a live mode with two durable states,
so flipping it does not leave the group or move focus back into the editor. Its On/Off explanation
updates beneath the same control. Pending membership or wording choices disable the switch until
that decision is finished or cancelled.

#### Linking shows the groups, their wording policy, and their differences

The old popover put membership checkboxes, a miniature scrolling comparison, per-wording actions,
and a global replacement radio pair on one surface. Choosing one wording left both radios
unchecked. Its `Between … and …` fragments saved repetition but asked a transcriber to reconstruct
the sung line before making a decision. More width alone would not repair that order of questions.

**The Linking tab opens on the song's repeats.** Available candidate sets and existing linked
sets are separate lists. Each group draws its members vertically, with section names in one
column and line numbers in another. Repeated literal section names get document-order numbers
from `linkingSectionNames`, shared by the overview, membership, version choices, and diff sources;
filtering or deselecting members never renumbers them. Group boundaries use a divider and generous
spacing, including space below each list heading. Line numbers are navigation buttons in both
the overview and membership list: they select and reveal the actual header without toggling
membership, changing the linking source, or discarding wording choices. On phones they open Write
without focusing the typing surface. `LinkingPanel.svelte.test.ts` pins navigation and retained choices.
A dashed connector groups proposed repeats; a solid connector
groups existing links. Set up link opens the Link sections screen; it does not apply a link.
The label names the normal linking task instead of implying that lyric comparison is required. Its state and Set up link or Manage action sit beneath those members.
Concatenating names and dotted metadata into a paragraph obscured the relationship the list exists
to show, so visual structure now carries that relationship. No repeated
sections means a short explanation on the canvas, not an empty comparison or a boxed tutorial.
Stored differences read as differences kept, never warnings or a queue that needs to reach zero.

`overview.ts` asks `linkOccurrences` for candidate sets, reusing the core-owned discovery predicate
and its token ceiling. It deduplicates identical sets but never merges overlapping ones into a
transitive cluster: A resembling B and B resembling C does not establish A resembling C. Existing
peers bypass discovery as before. Candidate rows do not compute an alignment or promise a
comparison count before membership has been selected; linked rows count the first member's stored
holes rather than re-deriving intent from today's lyrics.

**An overview group is not a source section.** Set up link and Manage record both the overview origin
and the exact member offsets of the row the user chose. The first header remains a discovery
representative, never a claim about the user's location. All members of that chosen row start in the
comparison and all can be deselected; this previews a group and still requires the final Link
command before any membership changes. An available row that adds a new section to an existing
group therefore compares the whole proposed set, while Manage compares only its stored members.
With fewer than two members a group comparison cannot apply or unlink an arbitrary first member.

Only an editor marker or diagnostic action has a real source. That source stays checked, has the
This section label, and can expose Edit this section only. Its new candidate peers remain unchecked
until chosen. Caret updates preserve the origin; a different explicit request replaces it. Source
identity never follows from the first matching header or the selected replacement version.

**The normal decision is selecting sections and linking them.** The initial view shows membership,
a short assurance that differences stay as written, and the Link action. It asks for no wording
policy choice and displays no comparison. Review differences expands the numbered comparison beneath
the existing summary and action row. Its first view is read-only: every distinct version is visible,
but no wording checkbox or whole-version source list asks for a decision before the user has seen
the lyrics.

**Show the evidence before asking how to change it.** The decision area follows the differences,
headed What would you like to do?. Its footer omits Hide differences; Cancel appears in a
reserved slot beside the decision heading only while wording changes are pending. The top review control still
collapses the comparison.
A thin divider with a centered or separates the preservation action from the replacement choices.
Once wording changes are pending, it becomes a continuous hairline: applying the selected changes
is no longer an alternative to choosing them. Clearing all choices restores or, with the same
reserved divider height in both states.
Preserving and linking is the default action; Choose wording per difference enables optional version
checkboxes in the existing comparison, while Use one section’s full version reveals source choices
and makes that same comparison a read-only replacement preview. Only one set of editing controls
is shown at a time. Reopening review or changing membership returns to the read-only comparison;
cancelling wording changes keeps the current review visible. There is no initial approach gate,
per-difference accordion, or source dropdown. The earlier two-button gate reduced the initial control
count but made users choose a replacement strategy without seeing what differed. Progressive
disclosure belongs to the replacement controls, not to the evidence needed to decide.

Compare and linking share their inline change renderer and lyric-line presentation. Compare's
two-document diff treats one text as the baseline and the other as changes, so it cannot own linking's
multi-section alignment: a differing chorus is not an edit to an authoritative original. Linking
continues to render the editor's aligned runs, grouping identical versions and using exactly the
winner contract that application will carry out. A second diff must never re-derive the meaning of
a preserved run.

Hide differences explicitly names a visibility action, not a completion or linking action.
It returns to the compact view when no wording edits are pending. While replacements are pending,
Cancel occupies that same secondary-action slot. Cancelling clears winners without closing review,
so a compact Link action never hides destructive choices and neither control shifts its neighbors. Membership changes still clear wording choices. Empty-copy fills retain their visible
preview and explicit action because that default operation changes lyrics.

**A comparison repeats each distinct wording once, with enough lyrics to read it.** Identical
versions share one excerpt and choice, with their names grouped above the lyrics; unlike the old per-section full-line comparison, the new
view does not repeat every identical copy. It retains the affected lyric line and real
line breaks rather than printing technical return glyphs or detached `Between` fragments. Multiline
variations can include adjacent shared lines. An excerpt that reaches a neighboring difference
mid-line ends with an ellipsis, so omitted words cannot look like an intended deletion. The
changed phrase is highlighted and dotted-underlined, so color does not carry the distinction alone.
Each physical lyric line in the excerpt has clickable absolute document numbers right-aligned after the lyric text,
one for each grouped source in heading order. They navigate to the lyric line, not the section
header; inserted preview-only lines show a plus instead of an invented document number. The editor
supplies the original divergent-run offset, so clipping context never guesses a location from text.
An absent phrase needs no missing-words label: the surrounding lyrics and highlighted alternative show what differs.
Every difference has its own heading and a single code-style surface containing its lyric excerpts.
A muted background and separators between versions distinguish the comparison from the actions
below; there are no nested boxes or inner scrollbars. Every distinct version remains visible. The panel owns scrolling,
so no short inner diff window hides the alternative just beneath the first one.

**Preservation means no version is chosen.** Read-only review offers no wording checkboxes.
A decorative list dot occupies the checkbox slot beside each source name until a choice is enabled,
so the indentation has a visible purpose without moving the heading. After
Choose wording per difference, each numbered difference owns its own optional choice, labelled
beside the source names. Checking one version clears the other choice
for that difference; unchecking it returns only that difference to preservation. Choices for other
differences stay intact. The subtitle states both the one-version-per-difference rule and the
meaning of no selection. Readable Same lyrics and Differs clues in membership come from the
editor's comparison field, with its reference described on the clue, before review is opened.

**Use one section’s full version is an alternative approach.** It reveals populated source radios
below the comparison and requires a source before applying replacements. Choosing one resolves every
difference to that source, including intentionally absent phrases. The already visible comparison
becomes a read-only replacement preview and contains no per-difference checkboxes. Switching approaches clears pending winners and the whole-version
source, so hidden choices cannot carry across. A wholly untyped section can never erase populated
copies. Cancelling returns to preservation without collapsing the current review. The comparison
remains present when the selected source is cleared.

Each version has one stable lyric footprint. It shows the original text at rest and a labelled
inline change preview when affected: removed original words stay visible with strikethrough and
replacement words are inserted beside them. The checkbox always selects that source's **original**
wording, as the subtitle explains. Hidden, noninteractive, aria-hidden sizing text lays out every
possible replacement in the same CSS grid cell; actual wrapping determines the maximum footprint.
There is no guessed fixed height, clipping, second preview paragraph inserted on selection, or
hidden focusable control. There is no redundant As written label or separate status line. Pending Preview/Selected status
shares a measured slot in the source-name row, so selecting or cancelling never adds vertical space. Section names, location, and outcome have separate
visual roles instead of a dot-separated sentence. The removed text is struck through and inserted
text underlined; state never depends on color alone.

**No incidental movement during a decision.** Summary prose is constant; pending counts are
announced in the existing live region and named by the primary action. The action row has two
stable columns, with labels measured invisibly in the same slot so wrapping cannot change its
height. Cancel replaces Review/Hide instead of becoming a third button. The footer offers the final
action after the diff, labelled Keep differences and link when creating a link without replacements.
It spans the same full width as the other two choices; footer Cancel sits beside the heading so
the primary choice never narrows or shifts when edits are pending.
It draws only when the top action has scrolled out of view, observed against the panel's scroll port;
its slot stays reserved so transferring visibility cannot move the decision controls. There is only
one visible primary action. The approach-switch note is an accessible description, not inserted
visible prose. Version choices and following differences
keep their positions when selecting, unselecting, switching winners, or cancelling. Geometry tests
in `LinkingDetail.svelte.test.ts` cover narrow multiline alternatives; the mobile browser flow pins
the tapped checkbox's viewport position. This implements the zero-layout-shift standard in DESIGN.md.

Unchecking the selected version returns an individual difference to preservation; Cancel beside the final apply action
clears all wording choices without undoing membership selection. The final action names pending
changes as well as linking, and membership changes clear pending winners because difference indexes
belong to that set. The editor's per-difference winner contract applies both whole-version and
individual choices atomically, with one undo restoring the previous lyrics and link structure.

**An empty copy is disclosed as a fill.** When the selected populated copies agree and the only
other bodies are wholly untyped, the panel names the source and empty destination and the final
button says Fill … and link. The visible fill preview shows the same edits the engine will make.
An absent phrase inside a populated copy remains selectable, including when it wins by removing
an ad-lib elsewhere. Mixed populated variants plus an empty copy preserve the differences unless
specific wordings or a whole version are chosen; their explanatory sentence says the empty copy remains empty.

**The panel is persistent, and navigation is deliberate.** Back to linking returns to the
reference list. Click, Enter, or Space on the editor marker, or Manage linking on a diagnostic,
opens the exact source in the tab and moves focus to its heading. The workspace restores the panel
when the editor was expanded and opens Tools on phones. Hover, marker focus alone, header
selection, and caret movement do not switch tools or replace an ongoing comparison. Switching
other tools keeps the chosen section, while leaving the mounted pane may discard unapplied choices.
The Edit this section only switch remains here, together with its actual Mod-Shift-L binding.

**Pending offsets cannot survive a different document.** A text change or draft switch returns
Linking to its overview; caret and lint-only updates leave the current group alone. A stored shape
or membership change remounts the detail against the new truth. The overview refreshes stored
header lines and run coordinates on ordinary text revisions as well as explicit link notifications. Immediately before application,
`LinkingPanel` checks both live text and the serialized links against the rendered baseline; a
race refuses visibly and audibly. The editor continues to own the atomic edit, preserved runs,
selection collapse, and undo. No diff is re-derived to guess which pending decisions still apply.

Pins: `overview.test.ts`, `LinkingDetail.svelte.test.ts`, `LinkingPanel.svelte.test.ts`,
`workbench.test.ts`, `RightPanel.svelte.test.ts`, `e2e/linking.spec.ts`, and the phone Linking flow
in `e2e/mobile-workbench.spec.ts`. The earlier pinning/placement and radio-pair rules are superseded
by this panel flow; their useful lessons are retained above in the reasons for grouping and
explicit, per-difference choices.

#### What is drawn

**A linked header says so on its own line** through `⇄`, a widget outside the text. While `Type only
here` is on, that header gains a danger rail, a red wash, and the words `Editing this section only`.
The signal belongs to the section rather than the caret, so it stays prominent while the user moves
between the lines they intend to edit.

**The marker opens the Linking panel only on a deliberate press.** A click, Enter, or Space
forwards the source header through `onSectionLinkRequest`. Hover and focus alone leave the current
tool alone, showing only the shared Manage linking tooltip. The marker uses no native `title` and
claims no shortcut; leaving, blurring, pressing, or removing it releases the hint. The previous hover wait was appropriate to a transient popover; navigating a persistent
panel under the same gesture would replace a decision while the user was only crossing the lyrics.

**A divergent run is a `Decoration.mark`, never a widget**, and that distinction is the same one the
`⇄` earns its exception from: a widget in the content flow participates in selection and copy, and
clean lyrics on the clipboard are this application's entire output. A mark adds nothing to a paste.
It is drawn as a **dotted** underline because every other underline in the editor is wavy and belongs
to a diagnostic — this is not a finding, it is a note about what an edit here will and will not
reach. A run that is empty in this copy draws nothing, because there is nothing there to draw on;
the Linking panel is where those are named. `Editing this section only` is reserved for the explicit mode,
not inferred from whichever divergent run happens to contain the caret.

**The mark on the header stayed as it was, and that is a decision.** `⇄` means one thing — this
section moves with others — and giving linkable-but-unlinked headers a dimmer copy of it would
separate a warning from an invitation by tone alone, which is what the severity glyphs were reworked
to stop doing.

#### The linter is how anyone finds this, and it is no longer timid

`section.unlinked-repeat` used to name only the copies that **already agreed**, and at the time the
reason was sound: linking overwrote, so pointing at a chorus that genuinely differed was an
invitation to destroy the difference. Two rounds of narrowing went into keeping that offer honest —
first the whole song part had to match, then the most-repeated wording had to.

All of it is gone, because the hazard is. Linking keeps what the copies disagree on, so there is no
wording left for a suggestion to endanger — and the song the rule was quietest about is exactly the
one this rebuild was for. The narrowing was silence on the common case, bought against a risk that
no longer exists.

**So the song part is the group now — but only where the copies have something in common.** The
widening went one step too far in its first version, and the report was a diagnostic offering to
link two pre-choruses with _completely different_ words. Those share nothing, so linking them ties
no text together at all: every word is a difference, the mirror can never carry an edit, and the
finding is an offer to do nothing. `worthLinking` gates on `alignBodies`, and three things about it
are decisions rather than tuning:

- **Half of the shorter copy**, as a fraction rather than a count, so it means the same for a
  two-line pre-chorus and a twelve-line one. Against the _shorter_ one, so a copy that repeats
  another in full and then carries on still qualifies — the short one is wholly inside the long one,
  which is exactly what linking is for.
- **Some pair, never all of them together.** A song whose first and last chorus match while the
  middle one departs shares almost nothing across all three, and is still two choruses worth
  linking. Asking it of the whole set is how this rule went quiet on that shape once already.
- **Empty copies are not counted and do not count against.** An untyped `[Chorus 3]` shares nothing
  with anything by definition, and it is the case this rule most wants to catch.

**The gate is on what the linter volunteers, not on what the card will do.** Open the picker on two
sections that share nothing and you may still link them; the diff shows exactly what that means.
The rule only decides what to raise unasked.

Four things it still owes:

- **It is a `suggestion` with no fix, and its action opens the picker.** Linking is a state effect
  and `DiagnosticFix` carries text edits, so this joins `Choose header` and `Assign section
performers` as a guided action on the shared row rather than inventing a fourth kind of fix. The
  picker is also the honest surface: a card cannot show a three-section reconciliation as a diff, and
  the picker names every member and every difference before anything runs.
- **The occurrence that exposed the diagnostic is the picker source.** A repeat diagnostic has one
  primary header and draws the same underline over every related header. Its popover already stays
  anchored to the particular underline under the pointer; `Manage linking` carries that range
  forward too. Reverting to the diagnostic's primary range made a card opened from Pre-Chorus 2 call
  Pre-Chorus 1 “this section”, even while the pointer and popover were beside the second copy.
- **It arbitrates nothing, and the picker preselects nothing.** The rule points and stops there.
- **It anchors on a copy that has words**, never an empty one, so a copy the user is filling always
  has somewhere to take the words from.
- **An immediate repeat belongs to `section.immediate-repeat-spacing`.** Two identical choruses with
  nothing between them want one header, not two tied together, so both rules read the same
  `isImmediateRepeat` predicate. Only the adjacent pair steps aside; the rest of the kind stays
  linkable.

**The suppression is in the shell, not in `RuleContext`.** Linked sections keep their shared runs
identical by construction, so the rule would fire on its own result forever unless something knew
about the links — and `filterForEditorState` in `wiring.ts` is where that already happens, because it
runs on every snapshot while the lint itself is memoized on the document. A link made or taken off
changes no text, so a rule that learned about links through its context would keep the answered
suggestion on screen until the next keystroke.

**It is answered only when one link covers every occurrence the diagnostic reports.** The rule has
one primary range and the other copies as related ranges. Checking only the primary made a partial
link look complete, because that primary is the first copy with words and is ordinarily one of the
two already tied together. Paste a third copy lower in the document and its nearby `Manage linking`
action disappeared with the finding; the only route left was scrolling back to a `⇄` marker on the
old group, where the third copy happened to appear in the list. The complete set is checked now, so
the same finding and underline reach the new header. Two separate link groups stay visible too:
every occurrence has membership, but no correction crosses from one group to the other.

**Which means something has to ask for a snapshot when the links move, because the editor will not.**
An effects-only transaction deliberately emits none (`update-bridge.ts`: the shell reacts to snapshots
by re-applying context, so emitting there would be a cycle), and a link changes no text. This worked
by accident for as long as the only way to make one was the card, which collapses the selection on
its way out — and a selection change _is_ a snapshot. Restoring a draft's links collapses nothing, so
a reload came back with the suggestion still on every linked section and it went away on the user's
first press in the document. `republishForSectionLinks` in `Workspace.svelte` is the explicit ask,
from the two places links move without an edit: `onSectionLinksChanged`, and the `$effect` that hands
a newly mounted editor its handle. It costs nothing it did not already cost — the lint is memoized on
the document, so it re-filters diagnostics already computed, and the snapshot it re-adopts is byte for
byte the one in hand, so no save is dirtied.

**That hand-off runs `untrack`ed, and it has to.** It reads back what it has just written — the
editor's own anchors and links — and an editor holding those in reactive state re-enters the effect
forever. CodeMirror does not, so the real pane never showed it; `MockEditorPane` does, and did.

**The mock publishes its handle a microtask after mount for the same reason.** The real pane awaits a
dynamic import of CodeMirror before it has anything to hand over, so the shell's first lint runs
_before_ the draft's links are re-seated — which is the entire bug. A mock that assigned its handle
at init reversed that order and hid it: the first version of this test passed against the unfixed
shell.

#### Undo, and what is written down

The browser suite separates deliberate undo steps with `vi.setSystemTime`, advancing only
transaction timestamps beyond CodeMirror's grouping window. Linking and restoration dispatch
synchronously; their state assertions need no settling sleep. Browser timers and animation
frames remain real, and the negative hover test still observes a full delay before concluding
that Linking did not open. Date is restored after every test.

**Undo reverses the link along with the words, and that needs `invertedEffects`.** Undo restores text
by reversing changes, and a `StateField` reverses nothing on its own. Every history event carries the
groups **and their runs** as they stood before it, so undoing a deletion, a difference that was
closed, or an unlink that moved no text at all puts the shape back with the text. The runs travel
with the membership for a specific reason: a half-reversal that restored `again` while the group
still believed the line was shared would overwrite it again on the next keystroke.

Two things it depends on: the restore effect **must** define `map`, because an effect stored in the
history without one is _dropped_ the moment it has to be mapped through a later change, silently; and
it is emitted whenever links exist rather than only where the field actually changed, because
comparing would mean reading the new state from inside the facet that state is still being built for.

**Links are saved on the draft as header line numbers**, exactly as `LineAnchor` is and for the same
reason — an offset shifts on every keystroke earlier in the document, a line does not. **The numbers
are read off the live mapped ranges at save time, never stored and then shifted.** A divergent run is
written the same way, as a line and a column at each end: a column as well as a line because a
difference can be part of a line, which is the case the whole feature was rebuilt for. **Zero width
is meaningful and is kept**: it is where one copy simply has nothing, and it is where the other
copy's words go.

**Which means every hand-written copier had to learn about it, and the count in this file was
wrong.** `copySnapshot` in `persistence/autosave.ts` and `copyDraft` in
`persistence/draft-repository.ts` each spelled out `{ lines: [...link.lines] }`, so a link that
gained a second field was dropped in silence by both.

**And there is a fourth, which this section did not name and which is the one that actually shipped
the bug.** `writeRecord` in `ui/state/draft-store.svelte.ts` assembles the record every autosave
writes, and it rebuilt each link as `{ lines: [...link.lines] }` too — so the differences were
correct in the editor, correct in `sectionLinksFor`, correct on the way into the repository's own
copiers, and thrown away by the one step in between. On screen that is a link whose divergent runs
are marked while you work and gone on the next reload, with nothing anywhere reporting a failure.

There is one `copySectionLinks` in `persistence/copy.ts` now, used by all four. **The rule is not
"there are three copiers" — it is that a `DraftRecord` field is only as safe as the least careful
place that rebuilds one**, and the way to find them is `grep` for the field's siblings rather than
trust a list. `workbench.test.ts` drives the _real_ copier in its editor stub for exactly this
reason: a stub that listed the fields it kept would hide this whole class of bug, and it did.

`backup.ts` validates them, and **a run whose numbers cannot be read is dropped rather than throwing**:
the link itself is still good, and losing a difference costs the user one re-tick while refusing the
whole backup costs them the draft.

And it needs `onSectionLinksChanged`, because **unlinking and closing a difference can move no text
at all**: a shell that saved only on a document change would keep writing a shape the user had just
changed.

**Deleting the document still retires its links.** A later plain paste has no previous document
to recover from; `section-links.svelte.test.ts` pins that two-step boundary. A replacement paste
now has the evidence described in “A Genius refresh carries forward the links the draft already
knows” above. A carrying clipboard can instead supply its own validated links.

**`Mod-Shift-L` belongs to `Edit this section only` now, and the picker's ways in are the pointer's own** —
the `⇄` marker and the diagnostic's guided action. The chord opened this card for a while, and a
whole card arriving under a keystroke read as the workbench doing something nobody asked; toggling
the section-local mode is the aimed answer, and the Linking panel teaches the chord beside
the `Edit this section only` switch and in its tooltip. Pressing it again turns the mode
off without reconciling the differences made while it was on; see the type-only-here section above.
`Mod-Shift` and
deliberately not the `Ctrl-Alt` family the rest of the editor's commands live in — `Ctrl-Alt-L` is
the transport's forward key, bound to the window, and two implementations of one keystroke is how
every nudge came to fire twice. The keymap binding and the panel's own key handler run the same
`typeOnlyHere` machinery, and the aimed press names its refusal out loud.

Implementation: `src/lib/core/link-shape.ts` (the aligner and the run arithmetic — pure, no
CodeMirror, tested as arithmetic in `link-shape.test.ts`). **It lives in `core` rather than beside
the editor because the rule asks it too**, and a rule may not import the editor: two answers to "how
alike are these copies" is one more than the number that can stay in agreement, `src/lib/editor/section-links.ts` (the
predicates and the body range — no CodeMirror either, so `EditorPane` may import it without pulling
the editor into the landing page's bundle), `src/lib/editor/extensions/section-links.ts` (the two
fields, the mirror, the decorations), and `ui/linking/LinkingDetail.svelte`. **`linkableSemantic` lives in
`languages/registry.ts`**, beside the `headerSemanticKey` it is built on, because the rule and the
same-kind discovery path ask it too and a rule may not import the editor. Cross-name discovery and
the rule share `comparableSectionBody`, `linkBodySimilarity`, the half-body threshold and the
automatic-discovery ceiling from `core/link-shape.ts`; two answers to “how alike are these” would
make the workbench disagree with itself. The rule is
`rules/catalog/section-unlinked-repeat.ts`, its
action is `onLinkSections` on `DiagnosticActions.svelte` — wired to the panel by `startSectionLink`
in `EditorPane.svelte` and by `linkDiagnosticSections` on the controller.

**A body is measured from the end of the header line, not from the first lyric.** That one offset is
what makes an empty `[Chorus 3]` take a peer's words with no special case — replacing an empty range
at the end of a header line with `"\nHold on tight"` is an ordinary edit, while a body measured from
the first lyric of a section that has none has no position to describe at all.

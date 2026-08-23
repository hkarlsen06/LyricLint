# Section links: a chorus typed once, and the merge structure that keeps repeats honest

Touches: `src/lib/core/link-shape.ts`, `src/lib/editor/section-links.ts`,
`src/lib/editor/extensions/section-links.ts`,
`src/lib/editor/overlays/SectionLinkPicker.svelte`,
`src/lib/rules/catalog/section-unlinked-repeat.ts`, `src/lib/performers/transform.ts`,
`src/lib/persistence/copy.ts`

## The rules

- A group is a merge structure, not a body: stored divergent runs with shared text between
  them identical in every member by construction. Linking writes nothing (`alignBodies`);
  making copies agree is asked per difference. Only verbatim-repeating parts link
  (`LINKABLE_SEMANTICS`, via `linkableSemantic`/`headerSemanticKey` in
  `languages/registry.ts` — semantics, never spelling; English consulted second).
- The alignment is decided once and stored as intent — never re-derived live, because a diff
  cannot tell a mistake from a decision. The aligner matches words and line breaks, verifies
  inter-token text byte-for-byte, and hands edge whitespace (only) back to the shared text.
- The mirror: an edit *contained* in a divergent run stays local; one that *overlaps* a run
  carries the whole shared run to every peer (`carryHoles` ↔ `expandOverHoles`). It is a
  `transactionFilter` with `sequential: true` — one snapshot, one undo. Undo/redo/IME are
  exempt; only a single contiguous edit inside one member's body mirrors; membership is a
  range over the header's line; fewer than two members is not a group.
- The whole invariant rests on every edit reporting its honest size — `narrowEdit` in
  `performers/transform.ts` is that repair, and it belongs in the transform, never as a
  mirror exemption. Pinned in `section-links.svelte.test.ts` and
  `transform-boundaries.test.ts`.
- `Type only here` (`Mod-Shift-L`) is a toggle: arms the local exception, and pressed where
  the `Typing only here` marker stands it rejoins that one difference
  (`rejoinLinkedWordsAt`, one isolated history event, announced with the way back).
  `canTypeOnlyHere` answers on the run's *width* — zero-width runs are the feature's most
  ordinary case. The marker outlives the mode and leaves only with the caret.
- The card shows a diff (context = the shared runs either side, never "the rest of the
  line"), decides by radio pair, names the winning copy in a dropdown (`replaceFrom`), and
  turns rows into what would happen (`del`/`ins`, struck through as well as coloured).
  `winningText` follows `winningWording`: the picked copy unless empty, then the first with
  words. The card is pinned by its top (`pinnedTop`); applying collapses the selection —
  load-bearing, or the card reopens.
- `section.unlinked-repeat` gates on `worthLinking` (some pair sharing half the shorter
  copy; empty copies neither count nor count against); it is a `suggestion` with no fix
  whose action opens the picker; suppression lives in `filterForEditorState`, and links
  moving without an edit must ask for a snapshot (`republishForSectionLinks`, run
  `untrack`ed).
- Undo needs `invertedEffects` carrying groups *and runs*, and the restore effect must
  define `map` or the history silently drops it.
- Links persist as header line numbers plus per-run line/column ends, read off live ranges at
  save time; zero width is meaningful and kept. Every record rebuilder uses
  `copySectionLinks` in `persistence/copy.ts` — the fourth copier (`writeRecord`) is the one
  that shipped the bug. `backup.ts` drops an unreadable run rather than the backup.
- Wholesale document replacement loses links and anchors by design (re-attaching would be
  guessing); the clipboard-metadata paste is the one sanctioned exception
  (`docs/subsystems/editor.md`).
- `linkTargetAt` answers the keyboard; `linkableHeaderAt` stays pointer-narrow. The `⇄`
  marker opens through `HoverIntent` and has no click path; a divergent run is a
  `Decoration.mark` (dotted), never a widget — widgets participate in copy.

## Decision record

### A chorus is typed once, and what its repeats do differently is said out loud

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
still available and is asked for **per difference**, so the destructive act is something the user
requests about specific words rather than the price of linking at all.

**Only what a song repeats verbatim may be linked**, which is chorus, pre-chorus and post-chorus
(`LINKABLE_SEMANTICS`). A verse repeats its shape and not its words, so offering to link two of them
would be a standing offer to overwrite one with the other. Refrain is deliberately out for now.

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

#### Making copies agree is asked for per difference

`keepDifferent[i] === false` collapses difference `i` to one wording. **That wording is the source's**
— the copy the card was opened from, the words the user is looking at — **unless the source has
nothing there**, which is the one case where the section in front of the user cannot win: an untyped
`[Chorus 3]` is a request to be _filled_, and letting its emptiness win would answer it by emptying
the chorus that had the words. Then the words come from the first member of the group that has any.
**The group, never the document**, because a copy the user did not tick is not part of what they
asked for.

This is the same rule the old whole-body link had for bodies, now applied per difference — and the
empty-section special case collapses into the general model rather than needing its own branch.

#### Setting words aside by hand is a selection and a press — and the press was retired

`requestSectionLink` opens the card with a lyric selection offered as a difference, ticked. Its
keystroke was `Mod-Shift-L`, and that chord now arms `Type only here` instead — a whole card
arriving under a keystroke read as the workbench doing something nobody asked, and the local
exception covers the job this flow was mostly used for (writing your own words in one copy). The
machinery stays, on the handle, because the translation below is what `Type only here` and the
picker's own selection path are built on. The span is **translated** into every peer rather than
searched for, through
the same arithmetic the mirror uses: a position in shared text is the same distance from the nearest
difference in every copy, so "these five characters" means the same five characters everywhere
without a word of either copy being compared. It lands in every member or in none — a run that
appeared in some copies and not others would leave the group with different counts, which every
translation downstream refuses, so the link would go quiet rather than fail, which is the worse
failure.

**`linkTargetAt` answers the keyboard, and `linkableHeaderAt` stays exactly as narrow as it was.**
That second predicate answers the _pointer_ path, where a card opens uninvited on a bare selection,
and teaching it about lyric ranges would put the link card on the most common gesture in a text
editor — beside the performer picker, which is already there. An aimed press has been asked; a
selection has not. That is the rule _A surface that opens itself has to have been asked_ already
states, applied to a second surface that wanted the same gesture.

**And the answer about existing differences is resolved before a new one is added.** Inserting first
would shift every index the user's ticks were given against, silently, and collapse the wrong
difference.

**`Type only here` is refused inside a difference that is already there, and the empty ones are the
exception.** The reasoning for the refusal is sound and stays: the mode would be a fact standing
true, and a control for that appears to do nothing. What it missed is that the fact is only
_visible_ where the run has words in it — the dotted underline the caret is sitting in is what says
so. A run that is empty in this copy draws nothing, because there is nothing there to draw on, so
those were the one set of positions in a linked body where typing already stays put and no mark
anywhere says it.

That is not an edge case, it is the feature's most ordinary use. A peer with an ad-lib the other
copy lacks puts an empty run at exactly the caret a transcriber goes to when they want to write
their own — the end of the line for a trailing `(Yeah)`, mid-sentence for an inline one — so the
button vanished precisely where it was being looked for, and read as the workbench refusing. It was
reported as being unable to write a second chorus's ad-lib at all, on a caret where typing would in
fact have stayed local the whole time.

So `canTypeOnlyHere` answers on the run's **width** rather than on its existence. Pressing it there
arms the mode, the `Typing only here` marker draws, and the mirror's own "already local" branch
spends the press without adding a second run beside the difference already recorded — machinery
that was written for this and could not previously be reached. Nothing about a run with words in it
changed.

**And the marker outlives the mode, because the fact it names does.** Armed-only, it vanished on
the first keystroke — while the caret stood in the run that keystroke had just created, where
typing on still stayed local. The reported version of the confusion was worse: local text erased
back to nothing leaves a zero-width run at the caret, where a further deletion eats _shared_ text
and reaches every copy while an insertion still stays in this one, and nothing on screen told the
two apart. So `Typing only here` draws for as long as it is true — whenever the collapsed caret
stands where an insertion would be contained in one of this copy's runs, read with the mirror's own
edge-inclusive containment so the label and the next keystroke cannot disagree — and it leaves only
with the caret. Zero-width runs are exactly the case this is for: they are the one difference the
dotted underline cannot show.

**And the chord is a toggle, keyed to the state the marker names.** `Mod-Shift-L` armed and
pressed again stands down; pressed while the marker stands — the caret in one of this copy's runs —
it closes that one difference (`rejoinLinkedWordsAt`): this copy's wording wins, is written over
every peer's, and the mirror carries edits here again. The existing ways back were too blunt for
the question: undo only works immediately, and the card's replace collapses every difference in
the group at once. Three rules on the rejoin. **This copy's words win unless they are empty**, in
which case the first copy with words does — `winningWording`'s own rule, because an erased run
rejoined has nothing to offer and emptying every peer to match it is the one thing rejoining must
never do. **It is one isolated history event** (`isolateHistory`), because it is pressed right
after typing and the history otherwise joined it into the typing's group — one undo then silently
took the local words along with the rejoin, so "undo brings the difference back", which the
announcement promises, was false. **And it announces with the way back named**, because several
sections may have changed and only one of them is on screen.

#### The card asks one thing at a time, and shows a diff

The sections list is what it was: tick the copies to tie together. **Nothing is said about the words
until some are ticked**, because what two copies differ on is a question about a set the user has
not chosen yet. Once a peer is ticked, the card grows a **diff** and then the one decision, as a
**radio pair**:

- ◉ Respect differences between them
- ○ Replace them with `Chorus 1 ⌄`

**The second radio names the copy, and it names it in a control rather than in its label.**
`Replace them with this chorus's words` is ambiguous the moment there are three of them — the reader
has to work out which chorus "this" is from the greyed row further up — so the copy is the dropdown
that follows the words, which is the same control described under _Whose version wins is a dropdown_
below. The radio's own accessible name says what it does without it
(`Replace them with another section's version`), because a name that stops mid-sentence at a
`<select>` is not a sentence.

**The diff shows each version inside its own line.** `før, du kunne spørt meg` on its own says
nothing about where in the chorus it sits, or that the other copies simply stop there. So each row
is the run with its neighbours around it: the shared halves muted, the divergent run marked, and the
versions stacked so the only thing that moves between them is the run.

**That context is the shared runs either side, and never "the rest of the line".** Clipped to the
line it was drawn from, the context stopped at whatever line boundary each copy happened to have —
and a run that spans lines ends on a _different_ line in each copy, so the text drawn beside it was
different text. On screen that put a word inside one copy's run and in another copy's context, with
the insertion caret sitting in front of a word the row above was showing as shared. A shared run is
identical in every member by construction; a line is not. It is trimmed towards the middle with a
leading `…`, because the shared run either side of a difference can be the whole rest of the chorus.

**The lyric wraps rather than truncating.** Set to one line with an ellipsis, the run itself — the
one thing the row exists to show — was the part that got cut off, and there was nowhere to scroll to
see it. Wrapping means the run is always whole and only the context is ever abbreviated, which is
the right way round. The list keeps a `max-height` so a long comparison scrolls.

**A copy that has nothing there gets an insertion caret, not the words "nothing here".** It is the
mark a diff already uses, it sits at the exact point the other copies' words would go, and it costs
the row no width it would have to take from the lyric.

**The highlight ends where the run ends.** It carried a one-pixel `box-shadow` spread to fake
padding, which drew a band a pixel out on every side — read down a column of rows that is a stripe
lying behind words that are not part of the difference at all. Inline padding grows the box around
its own text instead.

**Whose version wins is a dropdown, not the opened section.** Hard-wired to the copy the card
happened to be opened from, noticing that a _later_ chorus has the wording worth keeping made the
repair "close the card and open it again from the right one". `replaceFrom` rides the choice, the
dropdown lists the ticked copies, and choosing one selects the replace outcome — picking a version
is asking for it. Unticking the chosen copy falls back to the opened one, because a section that is
not in the group cannot be the one whose version wins. An empty wording still never wins.

**Choosing to replace turns each row into what would happen to it**, rather than recolouring what
is already there. A row that is changing keeps the words it loses, struck through, with the words it
gains beside them — the editor's own fix-preview idiom, and the only arrangement that answers "what
would actually happen". Colouring the losing rows red said only that something was wrong with them,
and left the reader to imagine the result.

Three states follow from it, and the third is the one worth naming:

- **The picked copy** is already saying the winning version, so it shows no change at all, only its
  run marked green.
- **A copy that differs** shows `del` then `ins`, in `--color-danger` and `--color-success`. Struck
  through **as well as** coloured, because colour alone is never a state carrier here.
- **A copy that happens to match the winner already** is not changing either, so it is marked as the
  version rather than as an edit. Marking it as a change would promise an edit that never runs.

**Switching the dropdown turns the whole diff around**, because the diff is derived from
`replaceFrom` rather than from the opened section — otherwise the card would go on describing an
outcome nobody chose.

**And the card's `winningText` follows the same rule as the editor's `winningWording`**: the picked
copy's version, unless it is empty, in which case the first copy with words wins. The two have to
agree, because this row is a promise about what that function is going to do.

**An insertion caret only survives into the replacing state on a row that is not changing.**
Everywhere else the green insertion has taken its place, which is a better answer to "where do the
words go" than a bar.

**The two outcomes are one control each, not two rows apart.** Given `--control-height-sm` and their
own padding they sat a whole row apart with nothing between them, which reads as two separate things
rather than as one either/or. The heading over the diff takes the opposite correction: with only the
card's uniform gap above it, the section rows and the comparison ran together as one list of six.

**This replaced a checkbox per difference, and the reason is worth keeping.** Ticked meant _keep
these words apart_, six pixels under a list where ticked meant _include this section_. One control,
two opposite meanings, on one card — and the row beside it ran both versions together with an
interpunct into a single truncated line, so which words were whose could not be read at all. The
lesson is the general one: **a novel control is a bug unless the familiar one genuinely cannot do
the job.** A diff and a radio pair are what everyone has already met in a file-conflict dialog, and
neither can be read two ways.

The diff is **information, not a control**. Nothing in it is pressable.

#### The card is pinned, not frozen

What the old "must not resize" rule was really protecting is the **position** of whatever the
pointer is on. The card hangs from its bottom edge, so anything appearing lower down pushes the
section list — the very checkboxes being ticked — up the screen.

Freezing the card's size was the wrong way to stop that, and it cost two rounds. Reserving the
diff's height meant reserving it for the largest set the user _might_ tick, which opened the card as
a tall empty box; filling that space with a preview meant showing a comparison and a decision about
copies nobody had picked yet, which is a question asked before the one it depends on has been
answered.

**So the top is pinned instead.** `pinnedTop` is measured in a `requestAnimationFrame` after the
card has drawn, after which the card extends downwards into space the user is not pointing at.
Three things go with it:

- Only the `above` placement needs it; `below` is already measured from its top.
- `--ll-room` is what is left below the pinned top, so a long diff scrolls rather than putting the
  actions out of reach.
- The diff list keeps a `max-height` of its own for the same reason.

`section-links.svelte.test.ts` asserts the card's top **and the ticked row's own top** are unchanged
across a tick, and that the card did grow — a pin that pins nothing would pass the first two.

The note is still one sentence per **opening** rather than one per tick (`openedComplete`), because
two sentences of different length rewrap to different heights and that is a change nothing asked
for.

**Applying collapses the selection**, and that is load-bearing rather than tidiness: the card opens
_because_ a header is selected whole, and the selection survives the edit, so leaving it there would
reopen the card the user just answered on the next settled anchor report. A collapsed selection
reports no anchor at all. **Which is exactly why a missing anchor does not retire this card**, unlike
the performer picker — that one exists solely because a range of lyrics is selected, while this one
is anchored to a _header_ that is still there.
It leaves the way every other transient surface does: Escape, Cancel, an outside press, or applying.

**A card no anchor describes takes the side that has room**, rather than `above` unconditionally.
`anchorPlacement` takes the fallback from the caller, and the caller measures with
`selectionAnchorForView`'s own comparison, so the pointer-opened card and the keyboard-opened one
land on the same side.

**The keyboard keeps the section list and the radios apart.** Arrows rove the section rows only; the
radio group answers its own arrows, which is what a radio group is for.

`apply` asks for the differences of the ticked copies again rather than reading the list on screen,
so the answer can never be given against a set that is no longer showing.

#### What is drawn

**A linked header says so on its own line** through `⇄`, a widget outside the text.

**And it serves the editor's one hover wait before it opens anything.** It opened on the bare
`pointerenter`, which made it the only pointer target in the document that answered instantly — so a
mouse crossing the editor on its way to the panel dragged a card open behind it for every linked
header it passed over. `HoverIntent` in `extensions/hover-intent.ts` is that wait, shared with the
severity underline and the count badge at the end of a line, so a pointer crossing a crowded
document meets one rule rather than a different one per target. The keyboard is exempt, as it is on
the badge: reaching the marker with `Tab` is a decision already made, so `focus` cancels the wait and
opens at once. There is deliberately **no click path** — a press focuses the button, and a second
`open()` behind the first would reset a card the user had already started answering.

**A divergent run is a `Decoration.mark`, never a widget**, and that distinction is the same one the
`⇄` earns its exception from: a widget in the content flow participates in selection and copy, and
clean lyrics on the clipboard are this application's entire output. A mark adds nothing to a paste.
It is drawn as a **dotted** underline because every other underline in the editor is wavy and belongs
to a diagnostic — this is not a finding, it is a note about what an edit here will and will not
reach. A run that is empty in this copy draws nothing, because there is nothing there to draw on;
the card is where those are named — and the caret is where the `Typing only here` marker names
them, standing whenever typing at the caret would stay in this copy (see the type-only-here
section above).

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

**What none of it survives is the document being replaced wholesale.** Select all, cut, paste back
and the links are gone — every header line the membership was written against was erased. Re-attaching
links to re-pasted text would be guessing at which of the new headers used to be which, and a link
that is silently wrong overwrites work. Line anchors behave the same way for the same reason.
`section-links.svelte.test.ts` pins this as a decision rather than leaving it as a surprise.

**`Mod-Shift-L` belongs to `Type only here` now, and the picker's ways in are the pointer's own** —
the `⇄` marker and the diagnostic's guided action. The chord opened this card for a while, and a
whole card arriving under a keystroke read as the workbench doing something nobody asked; arming
the local exception is the aimed, caret-sized answer, and the card is where the chord is taught
(its linked-state note, and the `Type only here` button's own tooltip). It is a toggle — pressed
where the `Typing only here` marker stands, it shares the words again; see the type-only-here
section above. `Mod-Shift` and
deliberately not the `Ctrl-Alt` family the rest of the editor's commands live in — `Ctrl-Alt-L` is
the transport's forward key, bound to the window, and two implementations of one keystroke is how
every nudge came to fire twice. The keymap binding and the card's own key handler run the same
`typeOnlyHere` machinery, and the aimed press names its refusal out loud.

Implementation: `src/lib/core/link-shape.ts` (the aligner and the run arithmetic — pure, no
CodeMirror, tested as arithmetic in `link-shape.test.ts`). **It lives in `core` rather than beside
the editor because the rule asks it too**, and a rule may not import the editor: two answers to "how
alike are these copies" is one more than the number that can stay in agreement, `src/lib/editor/section-links.ts` (the
predicates and the body range — no CodeMirror either, so `EditorPane` may import it without pulling
the editor into the landing page's bundle), `src/lib/editor/extensions/section-links.ts` (the two
fields, the mirror, the decorations), and `SectionLinkPicker.svelte`. **`linkableSemantic` lives in
`languages/registry.ts`**, beside the `headerSemanticKey` it is built on, because the rule asks it too
and a rule may not import the editor. The rule is `rules/catalog/section-unlinked-repeat.ts`, its
action is `onLinkSections` on `DiagnosticActions.svelte` — wired to the picker by `startSectionLink`
in `EditorPane.svelte` and by `linkDiagnosticSections` on the controller.

**A body is measured from the end of the header line, not from the first lyric.** That one offset is
what makes an empty `[Chorus 3]` take a peer's words with no special case — replacing an empty range
at the end of a header line with `"\nHold on tight"` is an ordinary edit, while a body measured from
the first lyric of a section that has none has no position to describe at all.


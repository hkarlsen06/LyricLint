# Adding guidance-catalog entries

How to turn a Genius guideline — a screenshot, a pasted annotation, a forum
thread — into entries in the guidance catalog behind `/guidelines/` and the
rules assistant. This is the checklist a session follows when the user supplies
source material; the design reasoning lives in `docs/rules.md` under "Guidance
catalog".

## What the catalog is

`src/lib/guidance/` holds reviewed transcription conventions the linter cannot
check whole. An entry is **one checkable claim** — "a brand name keeps exactly
the punctuation it owns", not "the punctuation annotation" — written as
LyricLint's own paraphrase, never quoted Genius prose, with pointers into the
same source registry every linter rule cites. A convention the linter later
learns to check graduates into a rule and its entry retires in that rule's
favor; `relatedRuleIds` is for partial coverage only.

Ground rules, all enforced by `src/lib/guidance/guidance.test.ts`:

- Ids are `guidance.<topic>.<slug>`, stable forever — the slug is also the
  entry's anchor on its topic page, and the assistant corpus carries the id.
- The title **states what the guideline says**, as a compressed instruction —
  `Questions always end with a question mark`, the register of Genius's own
  guide items — under 44 characters, never ending with a period. This is
  deliberately **not** the rule reference's failure-naming register: a rules
  reader arrives with a symptom and wants its rule, a guidelines reader
  arrives wondering how something works and searches for the convention.
- The statement is a paraphrase. **Never store Genius prose**: a quotation
  would be hand-written content in a generated artifact with no generator to
  re-derive it, and annotations change under us.
- Examples are **invented**, never a real transcription's lyrics — anything
  shipped here is quoted permanently. Brand names and facts are fine
  (`Guess Who?, Yahoo!`); Lady Gaga's lyrics are not, even when the annotation
  itself quotes them. An example is a `{ correct, incorrect }` pair of
  **verbatim samples** — text exactly as it would stand in a document, with no
  connective prose, which inside the sample face reads as part of the thing
  being quoted. Explanation belongs in the statement or the note.
- `authority` must equal the highest tier among the entry's cited sources.

## The authority ladder

Every source in `src/lib/rules/data/sources.ts` declares an `authority` tier,
highest first:

| Tier        | Meaning                                                                         |
| ----------- | ------------------------------------------------------------------------------- |
| `staff`     | Genius staff wrote or touched it: badged page text, roster staff, forum replies |
| `editorial` | A reviewed annotation with no staff in its contributor roster                   |
| `external`  | Authority outside Genius: dictionaries, academies, platform docs                |
| `community` | The floor: ordinary community voice in any venue — unreviewed annotations, unbadged page text, ordinary forum posts, unrecorded states |

**The venue never decides a tier — the rank of who wrote it on Genius does**
(ruled 2026-08-10, twice over: staff among an annotation's contributors is the
staff signal, and a staff forum reply ranks exactly as staff guide content).
Three signals decide a Genius item's tier — none of them is the annotation
box's header, which reads "Genius Annotation" regardless of state. The track's
verified badge covers only the page's own body text.

- *The unreviewed banner*, per annotation: the red striped **"This annotation
  is unreviewed"** band means unreviewed → `community`.
- *The contributor roster*, per reviewed annotation: expand the contributors
  list; **Genius staff present** (the circle role badge — Gary, streetlights —
  or an "Accepted by" naming a staff member) → `staff`, at any attribution
  percentage. No staff → `editorial`.
- *The track's verified-by-staff badge*, per page, for the page's **own body
  text** only: badged (How to Add Songs) → `staff`; unbadged (Song Sections &
  Headers Guide) → `community`. The badge does not lift the annotations on
  the page.

Where a claim lives in both a page's highlighted body text and the annotation
expanding it, cite the annotation, which is nearly always the sharper
statement anyway.

**Promotion is evidence, never an edit.** Raising an entry's tier means adding
the confirming higher-tier source to its `sourceIds` and raising the enum to
match; editing the enum alone fails `guidance.test.ts`. Demotion follows the
same rule in reverse. `external` ranks below `editorial` because a dictionary is
authoritative about language, not about Genius.

## Adding entries from supplied material

The user supplies screenshots or pasted text, because genius.com is not
fetchable from an agent session. **Never write an entry from memory of what a
Genius page probably says** — no source material, no entry.

1. **Register or update the source** in `src/lib/rules/data/sources.ts`.
   - A guide-page annotation uses the `annotation()` helper (pass the authority
     as the fifth argument; the default is the conservative `community`). A
     forum thread or non-annotation page is an object literal — permalink to
     the specific post, the author's role stated in `sectionTitle`.
   - Set `retrievedAt`/`lastVerifiedAt` to today for a new source. For an
     existing source whose content the material re-verifies, update
     `lastVerifiedAt` only.
   - Mirror the source in the `docs/rules.md` source-registry table, and update
     `src/lib/rules/data/sources.test.ts`: `retrievedOn`/`verifiedOn`, the
     `authorityOf` mapping, and the registry-size count.
2. **Write the entries** in `src/lib/guidance/entries.ts`, one per claim.
   Where a claim is mechanically checkable, still add it — with a `note` naming
   it a candidate to graduate into a linter rule. Where the linter partially
   covers it, list the rule ids in `relatedRuleIds`.
3. **A new topic** additionally needs: its title in `guidanceTopicTitles`, its
   linter rule families in `guidanceTopicRuleGroups` (both in
   `src/lib/guidance/guidance.ts` — the families draw the topic's derived
   linter-rule lookups in the index column), and the pinned topic-page count in
   `e2e/lyriclint.spec.ts` (`guidelinePages`) bumped — the topic page and its
   sitemap URL are generated from the data. That e2e count runs only in CI, so
   verify it locally: `bunx playwright test -g "sitemap"` (~1 minute, builds
   the site).
4. **Regenerate the assistant corpus**: `bun run assistant:corpus`. The
   committed `services/rules-assistant/generated/rules-context.json` carries
   the catalog, and `assistant-corpus.test.ts` fails while it is stale.
5. **Verify**:

   ```bash
   bun run test:unit -- --run src/lib/guidance src/lib/rules/data/sources.test.ts src/lib/rules/assistant-corpus.test.ts
   bun run check
   bun run lint
   ```

## Verifying annotation states

For each Genius annotation source, two facts decide its tier per the rules
above: the unreviewed banner, and whether staff appear in the expanded
contributor roster. To record a verification: set the authority in
`sources.ts` (with a comment naming the evidence), mirror it in
`sources.test.ts` (`staffAnnotations` / `editorialAnnotations`), note it in the
`docs/rules.md` table row, and re-run the two tests plus
`bun run assistant:corpus` (entry authorities may rise with their sources —
`guidance.test.ts` names each one that must).

**The whole registry was verified on 2026-08-10** — the maintainer checked
every annotation's banner and roster in-session. No annotation carried the
unreviewed banner; most carry staff contributors (`staff`), the section-hook
deprecation and most of the language-header annotations are editor-only
(`editorial`), and the Song Headers in Different Languages page's track is
unbadged, so its own text stays `community`. The per-source record is the
`docs/rules.md` Status column and the two sets in `sources.test.ts`. A **new**
annotation source enters at the tier its evidence shows, by the same three
signals; only a source whose state genuinely could not be read stays at the
conservative `community` default.

## How the catalog reaches its surfaces

- `/guidelines/` is a master and a detail, on the rule reference's own shell
  (`SectionSplit.svelte`): the index column (`GuidanceIndex.svelte`) lists every
  topic's entries and its derived linter-rule lookups, searchable, and the open
  guideline reads on the right. Entry rows deep-link `#<slug>` fragments on the
  prerendered topic pages, which draw straight from
  `src/lib/guidance/entries.ts`; the linter lookups ride the section layout's
  server load, because they are derived from the server-only rule reference.
  Each topic page closes with its "Checked by the linter" run — the same rows
  the index column lists, kept on the page so a topic reads whole where the
  list is off screen — and every row that leaves for the rule reference wears
  the citations' external-link mark.
- The assistant corpus carries a `guidance` section (format v3). A guidance
  entry has **no citable id of its own** in the answer schema: the assistant
  cites the entry's `sourceIds`, which the Worker already validates. Giving
  entries first-class citation cards in the assistant UI is a possible later
  step, noted here so nobody half-implements it by accident.

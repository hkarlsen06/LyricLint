# Roadmap — August 2026 to July 2027

This is the optimistic reading of the next year: what LyricLint looks like if the pace of the
first weeks holds, every source review lands, and nothing external refuses us. It is written
against what is actually in the tree on 2026-07-30 — 54 enabled rules, 8 reviewed language packs,
four audio sources, a rule reference derived from the linter, and a workbench that already syncs,
anchors, and links.

Optimistic does not mean unbounded. Two things stay off this roadmap all year, and they are the
same two `PRODUCT.md` names as anti-references: **automatic transcription** and **anything that
sends a lyric to a server**. Everything below is a local-first tool getting better at the job a
transcriber is already doing by hand.

Each quarter states a theme, what ships, and the gate that proves it — because this project's
definition of done has always been a test rather than a demo.

---

## Q1 · August–October 2026 — The timings become an output

**Theme: everything the workbench already knows is currently trapped in it.**

Line anchors are the clearest case. Sync mode times a whole song, the anchors survive reload, the
timestamp column corrects them a quarter second at a time — and none of it leaves the browser in
any form. A transcriber who has timed a song has done real work that the application cannot yet
hand back.

**Ships:**

- **Timed export.** `.lrc` first, because it is the format every karaoke and player tool reads,
  then WebVTT for the same anchors. The export sits with `Export .txt` in the tools panel, draws
  only where the draft has anchors, and copies the same canonical text the clipboard does — a
  timed export that disagrees with the plain one is two documents.
- **Timed import.** An `.lrc` dropped on the editor is a document and a set of anchors in one
  edit, which is how a transcriber brings work in from elsewhere and picks up where sync mode
  left off.
- **The five `needs-review` sources clear review.** `G-QUOTES`, `G-SYMBOLS`, `G-AS-SPOKEN`,
  `G-NON-ENGLISH` and `G-INSTRUMENTAL` are each blocking candidate rules that are already
  designed. Clearing them takes the catalog from 54 to roughly 65 without inventing a single new
  policy claim.
- **Language packs 8 → 20.** `docs/genius-language-source-inventory.md` holds 60+ annotation IDs
  and each one is its own review unit. The next twelve are chosen by where transcription volume
  actually is: Portuguese, Italian, Dutch, Russian, Turkish, Polish, Swedish, Danish, Finnish,
  Indonesian, Hindi, Chinese.
- **The Apple Music rate question is answered.** `docs/` records it as unverified: whether
  `playbackRate` holds on a DRM-protected full track rather than a preview. It is either real —
  and Apple becomes the recommended remote source, because it is the only one with a rate and no
  allowlist — or `rates` narrows to `[1]` and the picker grows Spotify's third fact. Either way it
  stops being a maybe.

**Gate:** a Norwegian song timed in sync mode, exported as `.lrc`, re-imported into an empty
draft, and byte-identical on both sides — anchors included — in `e2e/`.

---

## Q2 · November 2026–January 2027 — The album, not the song

**Theme: nobody transcribes one song.**

The drafts list is a flat list ordered by `updatedAt`, which is right for seven drafts and wrong
for the forty a transcriber accumulates over an album and its features. Everything a project needs
already exists per draft — the roster, the language, the attached audio — and is retyped for each
one.

**Ships:**

- **Collections.** A group of drafts sharing a roster, a language, and an attached release. The
  drafts menu groups by it; the switcher opens within it. A collection is not a new record type
  the way a draft is — it is a field on `DraftRecord` and an index, so the three copiers and
  `copySectionLinks` learn one more field and nothing else changes.
- **The roster outlives the draft.** A featured artist typed once is offered on the next song in
  the collection. The roster stays per draft as the source of truth; what is shared is the
  suggestion list.
- **Cross-draft consistency rules.** The first rules in the catalog that read more than one
  document: a performer spelled two ways across an album, a section header localized in one song
  and English in the next. They are `suggestion` tier and they cite consistency rather than a
  Genius page, exactly as `line.prose-density` does now.
- **Rule reference reaches 80 pages** and gains the one thing it cannot derive: a short
  worked example per rule family, in the language pack the reader has selected.
- **The phone stops apologizing.** The touch notice says a desktop will be quicker, and for
  editing that is true — but timing a song is one finger tapping in rhythm, which the phone is
  *better* at than a trackpad. Sync mode gets a phone-first pass: the tap target takes the row, the
  reading line holds, and the notice's wording changes from "quicker on a desktop" to naming the
  one job the phone is best at.

**Gate:** an eleven-track collection where renaming a performer in track three offers the same
spelling in track nine, and `workbench.test.ts` proves no draft's own roster was written to.

---

## Q3 · February–April 2027 — Meeting the transcriber where the lyrics go

**Theme: the last step is still a copy and a paste into somebody else's textarea.**

This is the deferred decision worth taking, and it is takeable without breaking a single promise
in `PRODUCT.md`. The application does not scrape Genius. An **extension** does not either: it
reads the page the user has already opened and is already editing, with their own session, on
their own machine.

**Ships:**

- **A browser extension that lints in place.** The Genius editor gets the same underlines, the
  same cards, the same fixes — because it is the same rule engine, bundled, with no network call
  and no account. The extension is a second front end over `src/lib/rules/`, which is why that
  directory has never been allowed to import the editor or the shell.
- **Round trip.** `Open in LyricLint` from a Genius editing page, and `Send back` when the
  transcription is clean. The lyric travels through the user's own clipboard and their own tab,
  never through us.
- **Shareable drafts with no server.** A draft encoded into a URL fragment — compressed, never
  sent, since a fragment is not transmitted in an HTTP request. Two transcribers can pass a
  work-in-progress back and forth without either of them having an account, and the privacy claim
  in the footer stays true word for word.
- **Rule contributions open.** The review checklist in `docs/rules.md` becomes a pull-request
  template: exact URL, paraphrase, verified date, and the three policy-case examples the type
  already demands. A rule ships when a human has reviewed it, and never because it was submitted.

**Gate:** the extension lints a real Genius editing page with the network disabled, and a
DevTools trace showing zero requests to anything.

---

## Q4 · May–July 2027 — Stewardship

**Theme: a linter is only as good as the freshness of what it cites, and community annotations
change under you.**

Every rule carries a last-verified date. In a year the earliest of them are ten months old, and
the honest position is that some of them are now wrong.

**Ships:**

- **Maintainer-only source sync**, exactly as `docs/architecture.md` specifies it and no further:
  a credentialed job that fetches the reviewed annotations, produces a **proposed diff**, and
  cannot publish. A rule whose source moved is flagged for review, not silently updated, and the
  previous known-good snapshot stays shipped until a person says otherwise.
- **Staleness is visible to the reader.** A citation tooltip already carries the verified date; a
  rule past its review window says so on its reference page, because a reference that hides its own
  age is asking to be trusted on nothing.
- **Language packs 20 → 40**, with the review unit unchanged: one annotation, one human, one
  reviewed pack. Half the inventory, and the half where the transcribers are.
- **Rules 80 → 100**, with the tier discipline held — every judgment call a `suggestion` with a
  `preview` fix, and `collectSafeFixes` still touching only what is mechanically safe.
- **Optional encrypted sync**, and it is optional in the strong sense: off by default, a key the
  user holds, and a workbench that is exactly as functional with it off as it is today. The
  local-first promise is not that syncing is impossible — it is that nothing depends on it.

**Gate:** the sync job runs against the live annotation set, opens a diff, and the suite still
passes on the *previous* snapshot — proving a Genius outage or an edited annotation cannot
interrupt anybody's editing.

---

## What a year of this adds up to

| | Today | July 2027 |
|---|---|---|
| Enabled rules | 54 | ~100 |
| Reviewed language packs | 8 | 40 |
| Audio sources | 4 | 4 (deliberately) |
| Outputs | Genius markup, `.txt` | + `.lrc`, `.vtt`, cover art, song facts |
| Surfaces | Web workbench | + browser extension, phone-first sync |
| Reaches a network | YouTube, Spotify, Apple, the rules assistant — each opted into | unchanged |

## What stays off the roadmap, and why it is written down

- **Automatic transcription.** Whisper in the browser is technically available and would make
  LyricLint an automated transcription product, which `PRODUCT.md` names as an anti-reference. The
  tool's value is that a person heard the words.
- **Lyrics on a server.** Not in analytics, not in error telemetry, not in a sync default. The
  footer's claim is load-bearing. The rules assistant (shipped August 2026) does not move this
  line: it answers questions about the guidelines, receives only what is typed into its own
  composer, and can never see a draft — a boundary its own tests pin.
- **AI edits to the document.** The assistant explains rules; it does not hold a pen. Fixes stay
  deterministic, reviewed, and pressed by the user.
- **A fifth audio source.** Four is already more integration surface than the transcription loop
  needs, and every one of them is a third party whose terms this repository has had to read.
- **Accounts as a requirement.** Optional in Q4 means optional forever.
- **Collaborative editing.** Two carets in one document is a different product, and the Q3 share
  link answers the actual need — passing work to somebody — for a fraction of the cost.

## The three risks this plan is optimistic about

1. **Source review is the bottleneck, not code.** Twelve language packs a quarter means twelve
   community annotations read carefully by somebody who can judge the language. That is the one
   line item here that cannot be sped up by writing more of it.
2. **The extension depends on Genius's editor staying scrapeable-by-the-user.** A markup change
   breaks it, and the mitigation is that the workbench never depends on the extension.
3. **Apple's rate.** Q1 answers it. If it is false, the remote source with the best terms loses
   the feature that made it the recommended one, and YouTube stays the practical default.

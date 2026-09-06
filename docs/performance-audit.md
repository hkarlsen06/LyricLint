# Performance audit — September 6, 2026

Audit only: no application behavior, dependencies, assets, or persistence policy changed.
The priority is responsive editing and a polished interface, followed by reducing background
work and download costs. Existing measurements in [performance.md](performance.md) and
[loading-audit.md](loading-audit.md) informed this review; already implemented optimizations
are not proposed again.

## Recommended order

| Priority                    | Opportunity                                              | Evidence                                                                               | Implementation constraint                                                            |
| --------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| High                        | Retain unaffected diagnostic rows through edits          | A leading character recreated all 139 rows in an 80-line fixture                       | Preserve occurrence identity, current fix ranges, keyboard focus, and reading order  |
| High                        | Stop refreshing the entire draft library after each save | Real IndexedDB list refresh: 10.9 ms at 100 drafts; 51.7 ms at 500                     | Keep summaries derived and invalidate them on every relevant mutation                |
| High, when backup is linked | Avoid repeated full backup work for playback progress    | Five-second position writes trigger whole-workspace serialization and file replacement | Preserve lyric durability, coherent snapshots, final progress, and failure handling  |
| Medium                      | Defer work in inactive panels                            | Hidden assistant downloads and evaluates 27.7 KB gzip of reference data                | Preserve mounted panel state, unfinished input, and editor/media lifetime            |
| Medium                      | Revisit the current landing-video bandwidth budget       | Mobile hero is 8.07 MB; desktop hero is 19.03 MB                                       | Preserve readable glyphs, smooth gestures, stable geometry, and still-image fallback |
| Medium                      | Update editor effects independently                      | Unchanged performer effect accounts for 3.09 ms of an 800-line state-only update       | Preserve diagnostic-dependent helpers and IME mapping                                |
| Medium, stress input        | Remove the repeated-section cache cliff                  | 11 distinct choruses fit the cache; 12 repeatedly overflow it                          | Preserve discovery completeness and the shared similarity predicate                  |

## 1. Diagnostic rows are recreated when their offsets move

[`DiagnosticList.svelte`](../src/lib/ui/linter/DiagnosticList.svelte), line 300, keys each row
with `diagnosticKey` plus its message. [`order.ts`](../src/lib/diagnostics/order.ts), line 8,
includes absolute `from` and `to` offsets in that key. Inserting before a finding consequently
destroys its row and creates another, even when the finding itself is unchanged.

A production-browser probe retained references to every diagnostic row before an edit:

| Synthetic lyric lines | Findings after leading insertion | Existing rows retained |
| --------------------- | -------------------------------: | ---------------------: |
| 24                    |                               41 |                      0 |
| 80                    |                              139 |                      0 |
| 240                   |                              419 |                      0 |

Caret movement retained every row. The 80-line case had approximately 5,100 DOM elements
across the workbench. Desktop Event Timing medians over five individual character insertions
were 48 ms at the end and 136 ms at the beginning. This comparison includes the complete
interaction; it does not attribute the entire difference to row recreation or predict an
optimization's speedup. The fixture deliberately contains many findings and is not a claim
about every 80-line song.

Retain unaffected row DOM using transaction-mapped occurrence continuity or equivalent
validated matching. Keep semantic diagnostic identity and revision-bound fixes intact;
index-based or rule-only keys would confuse repeated occurrences. First verify that the same
controls survive insertions above them, then measure input latency again. Preserve ranked
reading order, passage navigation, delayed Harper arrival, preview ownership, and focus after
fix/ignore actions on desktop and phone.

Related smaller costs: `LinterPanel.svelte:157` scans from the start of the text for every
displayed line number; `panel-view.svelte.ts:197`, `RightPanel.svelte:54`, and
`IgnoredRules.svelte:32` repeat occurrence matching. Reuse a line index and one derived match
result if profiling still identifies these after row reuse. Their individual cost was not
isolated in this audit.

## 2. Every landed autosave reloads every full draft

[`draft-store.svelte.ts`](../src/lib/ui/state/draft-store.svelte.ts), line 258, refreshes the
draft list after each save. [`draft-repository.ts`](../src/lib/persistence/draft-repository.ts),
line 165, reads all full records. [`draft-summary.ts`](../src/lib/persistence/draft-summary.ts),
line 12, parses every document to produce its short opening preview, including unchanged drafts.

Real Chromium/IndexedDB measurements with synthetic 100-line, approximately 4.6 KB lyrics,
including stored original text:

| Saved drafts | List refresh median |     p95 |
| ------------ | ------------------: | ------: |
| 25           |              2.9 ms |  7.5 ms |
| 100          |             10.9 ms | 16.7 ms |
| 500          |             51.7 ms | 82.8 ms |

These are asynchronous operation durations, not main-thread blocking measurements. At 500
drafts, summary parsing alone took 11.2 ms median.

Cache previews for unchanged text as a small first step. Maintaining the derived summary list
incrementally can additionally remove the repeated full-record read. Invalidate on saves,
imports, deletions, recovery, and external mutations. Preserve recency and first-save visibility,
and continue using the parser's annotation semantics. Do not add a second persisted preview
field or defer the primary lyric save to make the list cheaper.

## 3. Playback progress can rewrite the entire backup every five seconds

[`media-store.svelte.ts`](../src/lib/ui/state/media-store.svelte.ts), line 499, persists playback
progress every five seconds. [`backup.ts`](../src/lib/persistence/backup.ts), line 532, observes
media-record mutations and schedules a backup after 750 ms. Lines 551–553 serialize the whole
workspace and replace the linked backup file.

With a linked backup and granted permission, uninterrupted playback can therefore cause
approximately 720 complete rewrites per hour. A synthetic 500-draft backup was 4.88 MB;
database reads plus serialization took 58.6 ms median, excluding file writes. Multiplying that
payload by the cadence gives roughly 3.5 GB/hour of logical JSON output. This is an inference
from the code and payload, not measured physical disk traffic or a claim about typical libraries.

Distinguish progress-only background work from content changes, or reuse unchanged serialized
content. Any change to backup cadence must explicitly preserve the required recovery freshness;
do not casually lengthen lyric autosave or drop final playback position. Retain coherent
snapshots, serialized file writes, and dirty state on failure. `backup.ts:758` also forces a clean
backup dirty during `flush`, which merits checking for redundant work.

## 4. Inactive panels still initialize and react

[`RightPanel.svelte`](../src/lib/ui/layout/RightPanel.svelte), lines 171–200, instantiates every
pane. The installed Bits UI tab content hides its content but still renders the child snippet.
For example, `LinkingPanel.svelte:23` derives the overview from the current parsed document
without an activity gate.

[`AssistantConversation.svelte`](../src/lib/ui/assistant/AssistantConversation.svelte), line 132,
loads reference previews on mount. A fresh workbench downloaded and evaluated its generated
corpus before the assistant was selected: 102,750 bytes raw, 27,672 bytes gzip. Service workers
were blocked in this probe, establishing that this was page initialization rather than offline
precaching.

Gate expensive derivations and optional initialization on actual use while retaining stateful
panes. Load assistant previews when the pane is used or an existing transcript needs them.
Preserve unfinished composer input, conversations, selections, and the existing no-remount
behavior when expanding the editor or switching phone tasks. Do not hide legitimate loading
failures. The broader CPU saving from activity gates remains unmeasured.

## 5. Current marketing videos exceed the earlier audit's sizes

Current generated assets, measured with `ffprobe`:

| Asset                   |      Bytes | Average bitrate | Frame rate |
| ----------------------- | ---------: | --------------: | ---------: |
| `workbench.webm`        | 19,029,697 |     3.96 Mbit/s |     60 fps |
| `workbench-mobile.webm` |  8,071,288 |     1.68 Mbit/s |     60 fps |
| `workbench-player.webm` |  8,315,578 |     3.13 Mbit/s |     60 fps |

The previous audit's 2.7/1.3 MB hero figures no longer describe the current assets. The mobile
hero's average bitrate alone exceeds that audit's 1.6 Mbit/s network profile, before other
requests. This establishes bandwidth pressure, not an observed playback failure or LCP result.

Evaluate encoding and expensive animated-grain sections in
[`render-motion.mjs`](../scripts/render-motion.mjs) and device-specific output in
[`render-mobile-loop.mjs`](../scripts/render-mobile-loop.mjs). Compare actual playback and
seeks visually: [site guidance](subsystems/site.md) records why clear sections use lossless
encoding and why cursor gestures use 60 fps. Preserve those quality requirements, responsive
sources, reserved geometry, reduced-motion stills, and visibility-based playback. Existing
`preload="none"` and exclusion from service-worker precaching are already valuable.

## 6. Diagnostics-only updates rebuild unrelated editor decorations

[`create-editor.ts`](../src/lib/editor/create-editor.ts), line 994, dispatches all context
effects whenever any context input changes. `performer-decorations.ts:436` rebuilds visual
decorations on every performer effect; `markup-dim.ts:74` rebuilds on the headerless-section
effect. Thus a Harper result or an ignored finding can rebuild unchanged visual state.

In real CodeMirror StateFields under Node V8, with two performers and mixed markup on every
lyric line, reapplying an unchanged full context took 0.45 ms at 80 lines and 3.62 ms at 800.
Omitting only the unchanged performer effect took 0.06 and 0.53 ms respectively. These are
component measurements excluding DOM work and Svelte proxies; small timings are sensitive to
JIT order.

Compare inputs per effect and keep unchanged decoration fields. A document edit still needs
fresh ranges, and headerless helpers can legitimately change when a diagnostic is ignored.
Preserve IME preedit mapping until composition commits. Voice-group resolution already caches
by document and roster identity; another cache there is not warranted.

## 7. Repeated-section discovery has a cache-capacity cliff

[`section-unlinked-repeat.ts`](../src/lib/rules/catalog/section-unlinked-repeat.ts), line 48,
checks same-kind section pairs. [`link-shape.ts`](../src/lib/core/link-shape.ts), line 59,
retains 64 pair scores and clears the entire cache at capacity on line 357.

Distinct synthetic 100-word chorus bodies, repeatedly checked without changing the document:

| Choruses | Pairs |                 Warm rule-only time |
| -------- | ----: | ----------------------------------: |
| 11       |    55 |                          0.9–1.5 ms |
| 12       |    66 | Usually 17–21 ms; one 40 ms outlier |
| 16       |   120 |                            28–33 ms |
| 24       |   276 |                            65–72 ms |

This is a stress-case risk. Reuse unchanged group analysis and safely eliminate impossible
candidates before alignment. Simply changing eviction to a 64-entry LRU still misses during
a sequential 66-pair scan. Do not cap work by silently skipping candidates: a later pair may
contain the valid repeat. Preserve exact duplicates and the shared alignment semantics.

## Follow-up measurements and smaller opportunities

- **Measure language detection after it loads.** The existing native browser benchmark never
  initializes the statistical detector. On its 80-line fixture in Node, full-rule median time
  increased from 2.05 to 4.41 ms after loading it; detection alone took 1.98 ms. At 800 lines,
  detection alone took 10.59 ms. Update benchmark coverage first, then use browser profiling
  to decide whether incremental or worker-based detection is justified. Preserve language
  thresholds, stale-result checks, and the single editor deferral gate.
- **Split CSS by route where practical.** `global.css` produces 121,310 raw / 20,334 gzip bytes.
  Initial coverage used approximately 15–21% across the landing page, empty workbench, and
  guide. Coverage does not justify deleting interaction styles. Preserve cascade order,
  embedded editor demos, responsive rules, shared dialogs, and error pages.
- **Trim redundant guide metadata.** The guide layout ships full sections where the index
  needs their count and topics. A compact shape saved 8,696 raw / 2,469 gzip bytes in a
  serialization probe, without removing the search corpus. This is lower priority.
- **Verify the video observer threshold.** The shared attachment tests `isIntersecting`
  despite specifying a 0.35 threshold. Starting at a smaller visible fraction is plausible;
  browser confirmation is still needed before treating this as a verified finding.

## Method and limits

Source HEAD observed when preparing this report: `8fd9028`. Tools: Bun 1.3.14, Node 24.18.0,
Playwright Chromium 153. Browser checks used fresh isolated contexts and synthetic documents;
no personal drafts, external messages, or assistant requests were used. Persistence probes used
five warmups and twenty measured samples per operation.

The diagnostic fixture repeats numbered verse sections containing these four lines:

```text
Imma walk through the city when the sun goes down.
And idk if tommorrow will ever feel alright.
Shawdy, take me home (yeah)
You bring the light, Yeah
```

Browser UI probes used a preserved production build, 1350×940 desktop viewport, grammar
checking disabled to isolate the native/rendering path, and service workers blocked. The
80-line fixture is 3,229 characters. Structural probes counted surviving actual DOM nodes;
timing probes used Event Timing entries with interaction IDs and a 16 ms reporting threshold.
Reported desktop samples preceded an external browser-test workload. Subsequent 4× CPU samples
overlapped that workload and were discarded. These are exploratory lab observations, not field
INP, real-device measurements, or before/after optimization results.

A concurrent build initially caused an output-directory collision; a completed build was
preserved before browser inspection. No full CI run was necessary for this audit. Scripted UI
probes completed without page errors. Existing parser caching, spelling lookup caching, prepared
reference search, worker-based Harper, restrained media polling, and offline-download
deduplication should remain intact.

# Performance improvements — September 6, 2026

Implementation follow-up to [the performance audit](performance-audit.md), whose measurements
remain the historical baseline. These changes address every verified finding and the smaller
follow-ups without changing lyric rules, primary autosave deadlines, or diagnostic fix safety.

## Editing and background work

- Diagnostic row identity follows the editor's actual changes, including composed IME edits.
  Only an unchanged, transaction-mapped occurrence with the same finding and message retains
  its controls. Current diagnostic objects and revision-bound fixes always replace old data.
  Selection and related occurrences follow the same mapping. Snapshots use immutable state
  replacement; line numbers share an index, and ignored-occurrence matching is derived once.
- Draft summaries remain derived, in memory. Committed IndexedDB mutation keys invalidate
  changed records, including external connections, imports and deletes. Unknown ranges trigger
  a complete refresh, and mutations arriving during a read are drained before returning.
- Playback-only portable backups coalesce for at most 30 seconds. Primary playback checkpoints
  still land every five seconds; lyrics, attachment changes and settled playback use the
  existing 750 ms backup deadline. Explicit flushes preserve final progress, skip clean writes,
  await concurrent writers, and retain failed changes for retry.
- Optional panels initialize on first use and retain their state afterward. Hidden review,
  linking, performer and document-stat presentation stops reacting to irrelevant edits, then
  reads current data on activation. The assistant no longer initializes its reference corpus
  before its pane is used; unfinished composer input survives navigation and expansion.
- Editor context effects compare their own inputs. Diagnostics-only changes retain performer
  and markup decorations; diagnostic-dependent headerless helpers still update. A changed
  CodeMirror document forces restoration even after an edit is reversed.
- Repeated-section discovery caches bounded body analysis and complete group answers. Weak
  pair-score keys release comparisons with retired bodies. The shared lexical parser safely
  rejects pairs with no common word before alignment; every remaining candidate is checked.
- Language detection reuses unchanged line analysis and identical normalized statistical
  inputs. Thresholds and current offsets are recalculated. Both native benchmarks now load
  the statistical detector, closing the original coverage gap.

## Browser measurements

The audit's unchanged 24-, 80- and 240-line diagnostic fixtures were replayed against an
isolated production build in Chromium 153, at 1350 × 940 with Harper disabled and service
workers blocked. After an insertion at the top, surviving actual row elements were:

| Lyric lines | Findings | Rows retained before | Rows retained after |
| --- | ---: | ---: | ---: |
| 24 | 41 | 0 | 41 |
| 80 | 139 | 0 | 139 |
| 240 | 419 | 0 | 419 |

No page errors occurred. Focused component tests additionally check retained focus and control
geometry at 390 px and 1350 px with a long wrapped message, current fix ranges/revisions,
inserting and deleting identical copies, delayed lint results, and exact IME change composition.

A fresh paired Event Timing check on the 80-line fixture used two pages per revision in
before/after/after/before order, with five single-character inputs at each position per page.
Browser processes used CPUs 4–7 while a separate test workload was confined to CPUs 0–3.
The median reported interaction duration was 64 → 40 ms at the end and 136 → 40 ms at the top.
These complete-interaction timings include all implementation changes, with the browser's
16 ms reporting threshold; they do not isolate row reconciliation from the other improvements.

Real Chromium IndexedDB timings below use the audit's approximately 100-line synthetic drafts.
Each sample commits a changed lyric and verifies the returned preview; the measurement covers
list refresh only, excluding the preceding write and UI rendering.

| Drafts | Before median | After median | After p95 |
| --- | ---: | ---: | ---: |
| 25 | 2.9 ms | 0.3 ms | 1.2 ms |
| 100 | 10.9 ms | 0.3 ms | 0.5 ms |
| 500 | 51.7 ms | 0.4 ms | 2.3 ms |

These are synthetic local measurements, not field INP or promises for every document/library.

The updated native browser benchmark awaits the statistical language detector before timing.
Six alternating Chromium before/after pairs used 30 warmups and 100 measured edits per page,
with the same 80-line, 3,989-character fixture and CPU affinity. Parse plus native-rule median
time changed from 2.20 to 2.00 ms; the median page p95 changed from 3.00 to 2.70 ms. Every complete
diagnostic hash matched. These timings exclude Harper and DOM work.

Repeated-section rule measurements used distinct 100-word bodies and three alternating fresh
processes per revision. Warm timings pool calls two through seven at each fixture size:

| Same-kind sections | Before median | After median |
| --- | ---: | ---: |
| 12 | 19.281 ms | 0.054 ms |
| 16 | 31.034 ms | 0.063 ms |
| 24 | 69.180 ms | 0.119 ms |

This deliberately pathological discovery workload establishes that the cache-capacity cliff
is removed; it does not predict the same reduction in ordinary whole-editor latency.

## Downloads and motion

Shared CSS retains the common controls, diagnostics, overlays and touch rules. Workbench,
site and landing layouts load their own styles in the original cascade order; the embedded
live editor imports its required workbench styles. Same-DOM computed-style comparisons cover
the landing page, workbench and guide, including phone widths.

| Initial route CSS | Before gzip | After gzip |
| --- | ---: | ---: |
| Landing | 20,334 B | 14,789 B |
| Workbench | 25,957 B | 21,567 B |
| Guide | 21,211 B | 13,348 B |

The accelerated tape sections now have a separate encoding budget. Clear desktop spans
retain their original encoded data: every decoded clear frame matched the baseline exactly
(1,948 hero frames and 1,185 player frames). The mobile generator reads frame boundaries from
the master, keeps the original clear-section quality, and compresses only the tape sections
more strongly. Frame-based trimming and timestamp normalization retain all frames and 60fps
timing. Resolution, reserved geometry and still-image/reduced-motion behavior remain intact.

| Asset | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| Desktop hero | 19,029,697 | 13,274,746 | 30.2% |
| Mobile hero | 8,071,288 | 3,589,435 | 55.5% |
| Player video | 8,315,578 | 3,976,117 | 52.2% |
| Player sharing GIF | 7,897,519 | 6,436,978 | 18.5% |

The hero and mobile copy retain all 2,305 frames; the player retains all 1,274 frames.
Representative clear and tape frames were visually compared, in addition to decoded hashes
and timestamp checks. Both generation scripts use the same budget for future captures.

Guide layout data now carries a count and topic names instead of duplicate full guidance
sections. The complete search corpus remains available. The audit's serialization probe
measured an 8,696-byte raw / 2,469-byte gzip reduction for this shape.

The suspected video-observer threshold issue was not reproduced in Chromium or WebKit:
partially visible videos below the threshold stayed ineligible. A separate Chromium probe at
10% intersection also reported `isIntersecting: false` with a 0.35 threshold. Existing behavior
is retained; no speculative observer change is included.

## Validation

- Type checking, formatting, oxlint, ESLint and an isolated production build passed.
- The complete unit run passed 2,712 tests, with one existing AppWordmark animation assertion
  failing. The same assertion failed against the original CSS and test setup in an isolated
  baseline. Subsequent focused linking and diagnostic-parity tests passed all 31 cases,
  including the added inactive-panel range check.
- All 60 Chromium and mobile WebKit end-to-end tests passed, including offline reopening,
  route navigation, linking, phone editing, playback, recovery and reference search. After
  replacing the videos, all three media tests passed again against the final assets.
- A fresh production-page probe confirmed zero assistant corpus requests before selecting
  Assistant, one on first use, and unchanged unfinished composer input after tab navigation.
- Language-detection differential checks matched all 3,744 cases exactly, covering loaded and
  unloaded detection, scripts, whitespace, formatting and selected languages.

Subsystem rules and decision records document the new ownership, cache invalidation, backup
freshness and activation behavior. No dependencies or persisted schema fields were added.

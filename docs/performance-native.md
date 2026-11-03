# Native lint performance, November 2026

The five fixes from the profile-led review reduce the 80-line native parse-and-lint pass from
6.869 ms to 3.686 ms, a 46% reduction. The separate Chromium fixture improves from 3.80 ms to
2.95 ms, a 22% reduction. These are local synthetic CPU measurements, not total editor latency
or field interaction timings. Baseline revision: `e1b5fdd`.

## Changes

- Statistical language scoring resolves sample trigrams to integer IDs once, then reads model
  ranks from a flat `Uint16Array`. The existing dependency still supplies the full profiles,
  sample parser, Unicode narrowing data and ISO names. All ordered scores remain identical.
- Markup masking returns plain text directly and replaces tags with equal-length spaces.
  The text-keyed result cache and whole-line character arrays are removed.
- Ad-lib checks reuse fixed regexes and skip scans without the required punctuation.
- Title-case detection streams word counts instead of allocating and filtering word arrays.
- Censored-word detection rejects lines without an asterisk and matches only candidates
  containing one.
- Symbol detection uses one scan and preserves language, spacing, brand-name and ordering rules.

No result caches were added. Existing bounded language preprocessing and last-input score reuse
remain. The new model table uses 751,296 bytes, about 734 KiB, plus a fixed 7,224-entry trigram-ID
index. Both initialize only when statistical detection loads. This trades model memory and
initialization work for faster scoring of changed text. The sample parser remains unchanged.

## Node measurements

Linux, four logical CPUs, Node 24.18.0 and Bun 1.4.2. Five fresh processes per revision, in
alternating before/after order. Each process runs the existing `scripts/benchmark-lint.ts`:
12 revisions per workload, three warmup cycles and nine timed batches. The detector is loaded
before warmup. Values below are medians of the five process medians; ranges span those medians.
Heavy test suites, builds and browser measurements ran separately from the comparisons.

| Workload | Before median | After median | Before range | After range |
| --- | ---: | ---: | ---: | ---: |
| 24 lyric lines | 4.064 ms | 1.434 ms | 4.034–4.113 ms | 1.422–1.643 ms |
| 80 lyric lines | 6.869 ms | 3.686 ms | 6.562–7.132 ms | 3.607–3.816 ms |
| 800 lyric lines | 35.698 ms | 28.023 ms | 35.107–37.995 ms | 27.798–29.643 ms |
| 240 unique-token lines, cache churn | 22.935 ms | 16.113 ms | 22.774–23.404 ms | 15.920–16.341 ms |

Complete parsed-document and diagnostic hashes match across all ten process runs for all four
workloads. The churn workload demonstrates improvement when spelling-cache reuse is unavailable,
although spelling itself was not changed.

A separate instrumented comparison wraps each rule's `check` call on the same 80-line fixture.
Each process has nine batches of 48 complete passes after warmup. Five alternating process pairs
give the following medians and ranges of process medians:

| Rule pass | Before median | After median | Before range | After range |
| --- | ---: | ---: | ---: | ---: |
| `language.selection-mismatch` | 3.395 ms | 0.962 ms | 3.327–3.557 ms | 0.923–1.059 ms |
| `adlib.parentheses` | 0.262 ms | 0.097 ms | 0.253–0.271 ms | 0.095–0.112 ms |
| `capitalization.title-case` | 0.223 ms | 0.156 ms | 0.216–0.234 ms | 0.149–0.188 ms |
| `censored.mask` | 0.220 ms | 0.005 ms | 0.214–0.233 ms | 0.005–0.006 ms |
| `symbols.special-characters` | 0.192 ms | 0.054 ms | 0.189–0.207 ms | 0.048–0.060 ms |

These are final combined-change timings, not isolated attribution experiments. Shared masking
improvements affect several rules. The censored-word result benefits from this fixture having
no asterisks; dense censored text will not receive the same reduction. Every instrumented process
produced the same 20,844 findings across its 432 timed passes. Per-rule timer overhead and independent
medians mean these values must not be summed as an exact end-to-end timing.

## Chromium measurements

The existing browser harness uses an 80-line, 3,989-character plain-text fixture, rather than the
Node benchmark's 3,399-character fixture containing markup and reviewed spelling errors. Six
alternating fresh-page pairs each run 30 warmups and 100 measured edits. Median page medians
improve from 3.80 ms to 2.95 ms; their ranges are 3.70–3.90 ms and 2.90–3.10 ms. Median page p95
values improve from 5.55 ms to 3.85 ms. All 12 complete diagnostic hashes match.

The browser harness bundles the actual native parser, catalog and lazy detector for Chromium.
It excludes DOM rendering, asynchronous Harper, cold initialization and network latency. It is
not a measurement of the complete production editor interaction. The production build separately
checks the adapter's dependency imports and lazy chunk generation.

## Reproduction and correctness

Build `scripts/benchmark-lint.ts` against each revision with the same Bun version, then run the
resulting standalone bundles with Node in alternating order at least five times:

```bash
bun build scripts/benchmark-lint.ts --target=node --outfile=/tmp/lint-after.mjs
node /tmp/lint-after.mjs
```

For Chromium, build the same browser entry at each revision, then use the paired driver:

```bash
bun build scripts/performance/lint-browser-entry.ts --target=browser --outfile=/tmp/lint-after.js
bun scripts/performance/lint-browser.mjs /tmp/lint-before.js /tmp/lint-after.js
```

The raw comparisons and separate CPU profiles from this run are retained locally under
`.audit/performance-fixes/`. Reusable comparison, per-rule timing and differential runners now
live in `scripts/performance/`; their [usage guide](../scripts/performance/README.md) describes
the checked-in interfaces. Profiler runs were excluded from reported timings.
The initial profile identified string-keyed distance scoring, sample analysis and repeated
matching and masking work. The follow-up profile no longer contains the old distance scorer.
Repeated matching and the dependency sample parser now lead sampled CPU time.

The dense detector's tests compare complete ordered scores against the installed original
implementation across all 52 model profiles, multilingual lyrics, unseen trigrams, Unicode
edges, deterministic generated inputs and oversized text. A separate differential sweep compares
all diagnostics and fixes from the four other changed rules for 24,000 generated cases across
English, French and Norwegian. All match, including unsupported markup and literal UTF-16 ranges.
Type checking, linting and all 1,983 Node tests pass. An independent Sol review found no concrete
semantic or browser-runtime issues. A production-build Chromium smoke test loaded the lazy
detector and displayed the expected Norwegian-language mismatch with no page errors.

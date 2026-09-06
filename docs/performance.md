# Performance measurements — September 2026

These changes target native lint CPU time, redundant startup downloads and repeated CI lint
work. Baseline source: `2c170e1`. Measurements are local Linux runs using Bun 1.3.14,
Node 24.18.0 and the repository's Playwright Chromium. They are component measurements,
not claims about total page-load latency or hosted CI duration.

## Offline snapshot installation

The worker previously requested missing immutable assets with `cache: 'reload'`. Missing from
CacheStorage does not mean missing from the browser's HTTP cache: the opening page already
loaded many of those assets before registering the worker. Reusing the normal HTTP cache for
content-addressed assets eliminates that second download. Page snapshots still request fresh
HTML, and response validation and cache-copy-forward behavior remain intact.

Three fresh browser contexts per entry route, before and after:

| Entry route | Immutable HTTP requests before | After | Redundant uncompressed bytes eliminated |
| --- | ---: | ---: | ---: |
| Landing `/` | 115 | 81 | 316,184 |
| Workbench `/workbench/` | 135 | 81 | 1,509,180 |

All six after runs had zero repeated immutable downloads and retained the same 115 cached URLs,
including both offline shells. The measurement excludes WASM. It counts uncompressed origin
response bodies, not compressed CDN transfer bytes; unrelated bundle changes between the two
builds are not counted as savings. Both offline reopen and reference-page cache-admission e2e
tests passed.

Reproduce after a production build:

```bash
bun scripts/performance/precache.mjs --verify
```

The script serves the build with the immutable caching policy from `static/_headers`. It counts
requests at the HTTP server, without Playwright routing (which disables browser HTTP caching).
An optional directory argument selects a preserved baseline build; omit `--verify` when measuring
a baseline that still duplicates requests.

## Native linting

The spelling lookup now caches bounded line/language results and indexes cold fuzzy candidates
by Unicode code-point length. Returned candidates are copied; complete diagnostics, document
offsets and revision-bound fixes are always constructed afresh. The cache retains at most 1,000
entries, skips lines longer than 2,048 UTF-16 units, and clears when full.

`scripts/benchmark-lint.ts` measures parsing plus all native rules over 12 typing revisions of
24-, 80- and 800-line synthetic lyrics, plus a workload of new tokens that exceeds the cache.
It hashes complete parsed documents and diagnostic outputs to compare correctness. Each timing
is a median of nine batches after warmup. Run directly with Bun, or bundle and run with Node:

```bash
bun build scripts/benchmark-lint.ts --target=node --outfile=/tmp/benchmark-lint.mjs
node /tmp/benchmark-lint.mjs
```

The browser benchmark uses an 80-line, 3,989-character fixture, 30 warmup edits and 100 measured
edits per fresh Chromium page. Six before/after pairs alternate execution order. Both bundles
must use the same `scripts/performance/lint-browser-entry.ts`; build each against its respective
source revision, then compare them:

```bash
bun build scripts/performance/lint-browser-entry.ts --target=browser --outfile=/tmp/lint-after.js
bun scripts/performance/lint-browser.mjs /tmp/lint-before.js /tmp/lint-after.js
```

The browser driver checks equality of all 100 diagnostic outputs in every run. These timings
exclude asynchronous Harper, DOM rendering and language detection outside the native rule pass.

Final results on the simplified single-cache implementation:

| Workload | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| Chromium, 80 lines (median across six pages) | 2.600 ms | 1.500 ms | 42.3% |
| Chromium, median of page p95 values | 3.700 ms | 2.100 ms | 43.2% |
| Node V8, 24 lines | 1.121 ms | 0.786 ms | 29.9% |
| Node V8, 80 lines | 3.362 ms | 2.234 ms | 33.6% |
| Node V8, 800 lines | 29.154 ms | 18.890 ms | 35.2% |
| Node V8, 240 lines of new tokens each revision | 7.589 ms | 7.767 ms | −2.3% |

Node values are medians across three process runs per version, alternating order, with no test
suite or build running alongside them. The adversarial all-new-token case is slightly slower
and its sample ranges overlap (before 7.531–7.855 ms, after 7.609–8.212 ms): there is no verified
gain for cache-thrashing input. The cache is aimed at editing lyrics whose other lines remain
unchanged. A redundant token cache was removed after this workload exposed its overhead.

All four Node document/diagnostic hashes match across versions. The Chromium checksum across
all 100 revisions is `764e1668f5c27e450cb59c82c5d79d855e7811498d8b4c0f04187eb4af984ff1` in
every before/after page. An additional differential sweep compared 89,388 spelling lookups
against the baseline: generated one-edit forms, canonical and excluded forms, three languages,
and astral-character offset prefixes all matched.

## CI

See [CI measurements and cache invalidation](ci.md). Formatting and ESLint caches use content
hashes and a dependency/configuration fingerprint; oxlint still checks everything. All three
production gates remain. Superseded PR runs are canceled, and e2e now explicitly installs both
configured browser engines. Actual workflow duration and cache-transfer overhead require a
hosted run after these changes are pushed.

The quiet local uncached lint baseline took 45.202 seconds. Three warm-cache runs took
4.008, 3.889 and 3.965 seconds (median 3.965 seconds): **91.2% less lint time**. This is a
warm-cache stage measurement; cold caches and total hosted CI duration have no claimed gain.

## Validation

- Full logic/component suite: 205 files, 2,536 tests passed.
- Final focused spelling, catalog, engine and subsystem-document suite: 204 tests passed.
- Full uncached lint, cached lint and type checking passed.
- Production build and all six final-build precache verification contexts passed.
- Assistant service type checking and all 145 tests passed.
- Full production e2e suite: 54 tests passed in Chromium and mobile WebKit, including offline
  reopen and reference cache admission. The preview server was restarted after rebuilding so
  the suite exercised one consistent build.

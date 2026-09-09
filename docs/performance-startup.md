# Editor startup — September 9, 2026

The workbench now downloads and initializes the editor without waiting for optional tools or
the boot animation to finish. The production build preloads the editor's static dependency
graph, then evaluates it separately from shell mounting. CodeMirror receives its initial display
state before its view is attached, avoiding repeated layout of the surrounding workbench.

Review and tool panels, editor popovers, comparison, saved-draft rows, and media-picker contents
load when needed.
Scribe import/export loads its codec within the action, retaining the file-size guard before
reading and capturing the exported document before waiting for the module.
Native rules load with the first nonempty document; Harper and statistical language data load
when checking requires them. Pending checking is shown explicitly, and saving continues while
the rules load. Failed loads offer recovery instead of reporting a clean document. The editor
still opens with the recovered text and selection before its loading screen leaves.

The variable fonts retain every character and the continuous weight range the design tokens
use, starting at 400. Their generator verifies outlines and advance widths at the supported
token weights. The static Mono fonts remain unchanged.

## Results

Three cold mobile runs per build, reported as medians:

| Measurement | Before | After |
| --- | ---: | ---: |
| Performance score | 84 | **95** |
| First contentful paint | 1.00 s | 0.98 s |
| Largest contentful paint | 3.64 s | 2.95 s |
| Total blocking time | 249 ms | 61 ms |
| Cumulative layout shift | 0.00133 | 0.00040 |
| Transferred page bytes | 526 KiB | 402 KiB |

Individual performance scores were 85, 84, 84 before and 95, 94, 95 after. Accessibility,
best practices, and SEO were 100 in every run. One final desktop audit
scored 100 in all four categories, with 0.61 s LCP and zero total blocking time.

A separate applied-throttling probe used three fresh mobile contexts per build, 4× CPU slowdown,
150 ms latency, and 1.6 Mbit/s bandwidth. It pasted and typed immediately after the real editor
became visible, waited for a native finding, then reloaded and compared the exact lyrics.
Median observed editor readiness improved from 3.94 s to 2.84 s. The median of each run's
largest observed input interaction was 88 ms before and 72 ms after; every recovery comparison
passed, with no page errors. These are lab Event Timing observations, not field INP.

The existing browser-vitals script also passed its typing, Find, and task-navigation checks
in a final mobile and desktop run, with no page errors or horizontal overflow. Its largest
observed interactions were 80 ms mobile and 32 ms desktop.

All 62 production end-to-end tests passed in Chromium and mobile WebKit, including exact
clipboard output, text/selection recovery, draft switching, offline reopening, and mobile
review and playback. The suite caught a first-open Review focus race: the pending panel now
receives focus while its code loads, then transfers focus to the finding if the user has not
moved elsewhere. Focused component and parser tests, type checking, formatting, Oxlint, and
ESLint also passed.

## Measurement method

These are local production-build measurements, not a deployed PageSpeed Insights result or
field Core Web Vitals. Lighthouse 13.4.1 uses the project's Playwright Chromium, default mobile
simulation, a cold browser, HTTP/2, and Brotli quality 5. Chromium was 153.0.0.0.
The preserved baseline already contains
the earlier SEO and stylesheet-loading fixes. Its score is not interchangeable with the
earlier live PageSpeed score of 71, which used a different origin and delivery environment.

Run builds, tests, and browser audits separately to avoid CPU contention. Preserve each build
in a separate directory before comparing it; the audit server creates compressed sidecars.

```bash
bun run build
openssl req -x509 -newkey rsa:2048 -nodes -days 1 \
  -keyout /tmp/lyriclint-perf-key.pem -out /tmp/lyriclint-perf-cert.pem \
  -subj /CN=127.0.0.1
node scripts/performance/serve.mjs build 4183 \
  /tmp/lyriclint-perf-cert.pem /tmp/lyriclint-perf-key.pem
```

With that server running, in another terminal:

```bash
PERF_ROUTES=/workbench/ PERF_INSECURE_TLS=1 \
  bun scripts/performance/lighthouse.mjs https://127.0.0.1:4183 /tmp/lyriclint-startup 3
PERF_ROUTES=/workbench/ PERF_INSECURE_TLS=1 \
  bun scripts/performance/browser-vitals.mjs https://127.0.0.1:4183 /tmp/lyriclint-interactions.json 3
```

The second script applies network and CPU throttling in the browser and exercises typing,
search, and phone task navigation. Its Event Timing numbers are lab observations, not field INP.

## Build dependency patch

The checked-in Bun patch for SvelteKit 2.70.3 fixes its preload traversal when a dependency is
first visited through a dynamic import and later through a static import. Previously the first
visit suppressed the static preload, introducing an avoidable network dependency at startup.
The traversal tracks both the file and whether JavaScript is being collected; dynamic-only
JavaScript stays deferred and dynamic CSS discovery remains intact. Focused graph tests cover
shared dependencies and cycles. A clean frozen Bun install was verified to apply the patch.

The editor preload helper reads the emitted chunk graph and inserts only missing hints into
the prerendered workbench, after Kit's hints and before inline styles. It does not hard-code
hashed filenames or preload optional dynamic dependencies.

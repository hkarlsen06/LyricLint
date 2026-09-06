# Loading and responsiveness audit — September 6, 2026

This audit compares the working tree at the start of this task (the changes subsequently
committed as `ced4eb3`) with the implementation described below. The earlier lint CPU and
service-worker improvements in [performance.md](performance.md) are included on **both** sides.
Nothing was deployed as part of this audit. Marketing media were regenerated concurrently during
the task. Those same latest assets were copied into **both** final comparison builds, so their
content changes are not counted as an optimization. Timing samples overlapping that generation
were discarded; the final timing baselines were repeated against the common assets.

## Changes

- Serve generated 640/1280/1920-pixel hero WebPs with `srcset` and high fetch priority.
  The original 168,842-byte image remains available; the 640-pixel variant is 27,830 bytes
  and the 1280-pixel variant is 75,296 bytes. No native video poster duplicates that request.
- Below 30rem, select the same hero video at 1280×820: 1,312,149 bytes instead of
  2,726,255 bytes (52% smaller). Desktop retains the original. Generation is part of the
  existing screenshot/loop pipeline; the sequence and duration are unchanged.
- Exclude marketing WebMs from service-worker precaching. Keep all stills and the editor
  offline; video loops become an online enhancement. This prevents the worker from defeating
  deferred playback by downloading every video resolution on installation.
- Lazy-load detail images and the Discord widget. Videos use `preload="none"` and start
  at the existing visibility threshold. Decode the overlay only on arrival, then retain it
  until a video frame is ready. Reduced motion and no JavaScript keep visible stills.
- Correct the detail videos' declared dimensions to their decoded dimensions. In real-browser
  checks the old performer frame grew/shrank by 41.59px on mobile and 67.92px on desktop;
  that was an observation of the initial assets, not a gain attributed entirely to this task.
  After concurrent asset regeneration, declared dimensions were checked again against the latest
  media. All three final video frames keep their dimensions across loading and playback.
- Prepare guide-search normalized fields, fuzzy vocabulary and alias tokens once per corpus,
  instead of rebuilding them for each typed character. Matching, ranking, snippets, URL
  behavior and synchronous input semantics remain unchanged.

## Consistent local lab experiment

Two preserved production builds are served on loopback by the same `serve.mjs` driver, with
precompressed gzip responses, range requests and the existing immutable-asset cache policy.
The local server uses HTTP/1.1; the deployed observations use HTTP/2.
This approximates static production delivery; it does not measure Cloudflare, DNS, TLS, global
network latency, or real devices. The live host uses Brotli. Chromium is 151.0.7922.34 on an eight-vCPU KVM Linux host (AMD EPYC 9645);
Node is 24.18.0 and Bun is 1.3.14. Each navigation starts with a fresh browser profile/context;
service workers remain enabled. No build, test suite or other audit runs alongside measurements.
Third-party resources use their normal network behavior and can vary.

Lighthouse is pinned to 12.8.2, using its default simulated mobile throttling (412×823, DPR1.75,
150ms RTT, 1,638.4Kbit/s, 4× CPU) and desktop preset (1350×940, DPR1, 40ms RTT,
10,240Kbit/s, 1× CPU).
Each route/profile is measured three times. The separate Playwright/CDP experiment also uses
three fresh contexts per route/profile, records PerformanceObserver and navigation entries,
then exercises actual editor typing, Find/Escape, mobile Tools/Write, guide search/clear and the
landing page's live editor. The browser experiment uses applied CDP throttling:

| Profile | Viewport | DPR | CPU slowdown | Network latency | Download/upload |
| --- | --- | ---: | ---: | ---: | ---: |
| Mobile | 390×844, touch | 1 | 4× | 150ms | 1.6Mbit/s |
| Desktop | 1350×940 | 1 | 1× | 40ms | 10Mbit/s |

Browser load snapshots are taken ten seconds after DOMContentLoaded, before interactions.
CLS is the largest session window excluding shifts with recent input. Interaction latency is
the largest observed Event Timing duration with an interaction ID in the scripted sequence,
with a 16ms reporting threshold. It is **not field INP**. Lighthouse TBT is a separate load-time
proxy, not INP either ([Chrome's explanation](https://web.dev/articles/tbt)). Page-target transfer
counts may exclude service-worker background requests and partial video transfers; they are not
full offline-install sizes. Page-target bytes can increase when video delivery moves from the
worker to on-demand page requests. The separate origin request audit below includes installation. Raw settings and per-run values are retained with the reports.

## Measurements

Medians of three Lighthouse runs; times in milliseconds. Before → after.

| Profile / route | Score | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | ---: |
| mobile / | 82 → 92 | 2573 → 1990 | 4291 → 3058 | 2 → 0 | 0.0000 → 0.0000 |
| mobile /lint/ | 70 → 68 | 2510 → 2804 | 5891 → 5785 | 242 → 290 | 0.0013 → 0.0013 |
| mobile /guidelines/ | 93 → 93 | 2051 → 2059 | 2913 → 2930 | 0 → 3 | 0.0000 → 0.0000 |
| desktop / | 98 → 100 | 718 → 481 | 959 → 720 | 0 → 0 | 0.0000 → 0.0000 |
| desktop /lint/ | 96 → 95 | 595 → 601 | 1226 → 1238 | 12 → 26 | 0.0010 → 0.0010 |
| desktop /guidelines/ | 100 → 100 | 484 → 485 | 708 → 709 | 0 → 0 | 0.0000 → 0.0000 |

Medians of three browser/CDP runs; times in milliseconds. These applied-throttling results are
a separate experiment from simulated Lighthouse results and must not be pooled with them.

| Profile / route | Local TTFB | FCP | LCP | Load CLS | Lab interaction latency |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| mobile / | 3.2 → 2.5 | 1272 → 1096 | 6248 → 1928 | 0.0413 → 0.0413 | 80 → 72 |
| mobile /lint/ | 2.8 → 2.6 | 820 → 808 | 4548 → 4396 | 0.0011 → 0.0006 | 312 → 352 |
| mobile /guidelines/ | 2.9 → 3.1 | 1012 → 1004 | 1012 → 1004 | 0.0003 → 0.0003 | 288 → 264 |
| desktop / | 2.8 → 2.6 | 356 → 364 | 1012 → 616 | 0.0022 → 0.0022 | 32 → 32 |
| desktop /lint/ | 2.0 → 2.4 | 208 → 208 | 924 → 916 | 0.0010 → 0.0010 | 40 → 32 |
| desktop /guidelines/ | 2.3 → 2.8 | 312 → 316 | 312 → 316 | 0.0002 → 0.0002 | 72 → 72 |

The homepage gains are consistent across the two lab methods. There is **no verified overall
workbench responsiveness improvement**: mobile Lighthouse FCP rose from 2,510 to 2,804ms,
TBT rose from 242 to 290ms, and its score fell from 70 to 68. Applied-throttling browser FCP
was 820→808ms, with overlapping ranges; worst scripted interaction medians were 312→352ms,
also with overlapping ranges. These mixed results remain an open performance concern, rather
than being hidden by the homepage score. The search CPU reduction below does not establish an
INP improvement. Automated Lighthouse accessibility scores were 100 in all 36 final runs;
all 36 final browser interaction sequences passed without page errors or horizontal overflow.

[Machine-readable per-run values, medians and ranges](loading-audit-results.json) preserve the
measurements behind these tables.

## Search CPU and complete installation requests

The isolated browser search benchmark compares identical full outputs, using 114 real documents
and 64 typed query prefixes. Each page performs one warmup sweep and three measured sweeps;
three fresh-page before/after pairs alternate execution order. Preparation is measured separately.
These values exclude DOM rendering, URL writes and interaction scheduling; they are not INP.

| CPU slowdown | Median query CPU before → after | Query p95 before → after | New one-time preparation |
| --- | ---: | ---: | ---: |
| 1× | 4.6 → 0.3ms | 6.5 → 0.6ms | 12.6ms |
| 4× | 22.0 → 1.3ms | 30.3 → 2.6ms | 39.6ms |

This is about 94% less per-query computation at 4× slowdown. All output hashes match:
`babca51b6158de321a783cfd6971f1382aaea1a37ab5013d600b2973143a4064`.

`scripts/performance/precache.mjs` counts requests at the origin, including worker installation,
with reduced motion enabled. Three fresh contexts per route produced identical counts:

| Entry route | Origin response-body bytes before → after | Video requests before → after |
| --- | ---: | ---: |
| `/` | 9,158,759 → 3,239,895 | 4 → 0 |
| `/lint/` | 6,101,181 → 3,134,940 | 3 → 0 |

The driver serves full uncompressed bodies and does not model video range responses. These are
origin body counts, **not CDN wire-byte or timing claims**. The workbench no longer requests
3,193,146 bytes of unique marketing clips for its offline snapshot. Both versions still hold
115 cached URLs: responsive stills replace the excluded loops. Immutable duplicate downloads
remain zero, and both offline HTML shells remain cached. Viewed videos use ordinary network/HTTP
cache behavior; offline home retains stills rather than promising playback.

## Deployed observations and real user data

The public [mobile PSI report](https://pagespeed.web.dev/analysis/https-lyriclint-com/3e73b3gn6r?form_factor=mobile)
and [desktop report](https://pagespeed.web.dev/analysis/https-lyriclint-com/3e73b3gn6r?form_factor=desktop)
reported **No Data** for real users. The
[workbench report](https://pagespeed.web.dev/analysis/https-lyriclint-com-lint/6uxgyf49u4?form_factor=mobile)
also had no field data. No available RUM integration was found. Consequently no field p75
TTFB/FCP/LCP/INP/CLS values, or field improvement, can be claimed. Lack of public data does not
establish why the data are unavailable. No telemetry was added.

The same homepage PSI report contains single remote **lab** runs from September 6, 02:50 UTC:
mobile score 83, FCP 2.6s, LCP 3.7s, TBT 20ms, CLS 0; desktop score 99, FCP 0.5s, LCP 0.9s,
TBT 0ms, CLS 0. These use Lighthouse 13.4.1 and Chrome 151.0.7922.71, with Moto G Power/Slow4G
for mobile. They are context only, not the baseline for the local comparison: the deployed
source and test conditions differ.

Five fresh, unthrottled HTTPS/HTTP2 connections per deployed route through Cloudflare FRA:

| Route | Median synthetic TTFB | Range |
| --- | ---: | ---: |
| `/` | 81.194ms | 72.778–138.971ms |
| `/lint/` | 96.517ms | 89.745–130.927ms |
| `/guidelines/` | 88.594ms | 69.400–142.003ms |

HTML already uses Brotli and revalidation; hashed JS/CSS already use Brotli and one-year
immutable caching. The site is prerendered. These single-location observations provide no
reason to prioritize server changes. Local responseStart/server-response-time results are
loopback timings, not estimates of deployed TTFB. Navigation timestamps in this CDP setup do
not include all injected delivery delay; their small values must not be read as Internet TTFB.

## Validation and limits

- Production build and type checking passed. Full lint passed; changed configuration and
  benchmark files were checked again after the final cache change.
- Search, ReferenceIndex and subsystem documentation: 30 tests passed; 2,442 complete old/new
  search result comparisons matched over the real 114-document corpus.
- Full production e2e run: 54 passed, one video test initially needed to scroll into view under
  deferred loading. Both video tests passed after that correction. The final build then passed
  all seven affected landing, geometry, sitemap and offline scenarios, including all stills
  offline. The broader run includes Chromium and mobile WebKit workbench flows.
- Mobile/desktop, DPR3/DPR1 visual checks preserved the hero composition and readable media.
  Responsive source selection avoids duplicate full-size page requests. Reduced-motion and
  no-JavaScript states retain stills. Video frame geometry is pinned at 390px and 1280px.
- Repeated final browser interactions and Lighthouse accessibility results are included in the
  measurement tables and raw results.

A tested workbench UI-font preload made first paint approximately 60–80ms slower in the
applied-throttling runs and was removed; the existing site-only preload remains.

Shared render-blocking CSS remains a possible follow-up. Splitting it requires preserving
cascade order across responsive controls, the shared wordmark, error pages, assistant and lazy
editor. No blanket async-CSS loading or font-display change was introduced. Workbench profiling
confirmed editor/diagnostic costs during paste; a repeated slow keyup could not be confidently
attributed to application code rather than runtime/emulation scheduling. The CPU trace includes
automation overhead, so it does not justify a speculative language-detector change.

After deployment, repeat PSI against the same public URLs and collect representative field
percentiles when available. The local improvements below do not guarantee field thresholds.

## Reproduction

Preserve the baseline build **before** editing. The audit server precompresses its input, so
use disposable build copies rather than a source directory. Run only one timing command at a time.

```bash
bun run build
cp -a build /tmp/lyriclint-before
node scripts/performance/serve.mjs /tmp/lyriclint-before 4183
# In another terminal, with the server running:
bun scripts/performance/lighthouse.mjs http://127.0.0.1:4183 /tmp/lighthouse-before 3
bun scripts/performance/browser-vitals.mjs http://127.0.0.1:4183 /tmp/browser-before.json 3
# After changes, build/copy again and repeat with the same server/profile settings.
```

The Lighthouse driver installs its pinned CLI through bunx without changing project dependencies.
It writes HTML and JSON reports plus summary.json. The browser driver writes raw load,
interaction, resource and long-task entries alongside functional assertions. Optional
`PERF_SCREENSHOTS=1` retains screenshots of the scripted final state. The mobile video can be
regenerated from the current full loop with `node scripts/render-mobile-loop.mjs`.

Raw HTML/JSON Lighthouse reports, browser observations, CPU profiles, screenshots and validation
logs are preserved locally under `test-results/performance/` (gitignored). Open
`test-results/performance/lighthouse-after/mobile-landing-2.report.html` for a representative
final mobile report. The committed JSON above retains every final per-run metric and its range.

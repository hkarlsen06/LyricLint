# CI and build performance audit — 6 September 2026

The audit below records the original findings against `8fd9028`; its descriptions of current code refer to that baseline. The audit initially changed only this report. The subsequently requested implementation and validation are recorded at the end.

## Scope and baselines

Local source: `8fd9028` (`chore: upgrade Vitest and await browser renders`). Bun 1.3.14, Node 24.18.0, Linux, 8 reported CPUs. Dependencies already installed. The audit's timing experiments ran sequentially. The shared machine was not reserved exclusively, so these are local exploratory samples, not isolated-runner guarantees. Hosted timings belong to earlier revisions and are not an exact baseline for this newer checkout.

[Latest inspected successful hosted workflow](https://github.com/hkarlsen06/LyricLint/actions/runs/34040000520): **209 seconds through the deployment hook**.

| Job | Execution | Main costs |
| --- | ---: | --- |
| e2e | 199 s | Browser installation 48 s; build and preview startup about 23 s; tests about 110 s |
| checks | 162 s | Cold lint 50 s; unit tests 66 s; browser installation 20 s; type checking 6 s |
| assistant | 14 s | Package-cache restore 4 s; service install/check/test about 3 s |
| deploy | 3 s | Triggers a separate Cloudflare pipeline |

The hosted green run had 45 Chromium and 13 mobile WebKit tests, with no retries. E2E is the current critical path. Job durations overlap and must not be added together. Across 11 recent main runs, median initial queue time was 4 s for checks/e2e and 3 s for assistant; the 72 s checks delay in the old documentation was an outlier.

Cloudflare reported success about **148 seconds after the deployment hook**, bringing push-to-Pages completion to roughly **5m55s**. Its check publishes equal start/completion timestamps, so that interval cannot be separated into queue, installation, build, and upload time. The preceding run added about 70 seconds; 148 seconds is one observed pipeline duration, not guaranteed removable build time.

## Confirmed build opportunity: direct icon imports

The installed `lucide-svelte@1.0.1` exports individual icons under `lucide-svelte/icons/*`. Current imports in 34 source files traverse its full barrel. An isolated source copy replaced each named import with the corresponding public icon subpath, retaining the same underlying Svelte component and local name. No dependency or application behavior was deliberately changed.

Six complete builds, in baseline/candidate, candidate/baseline, baseline/candidate order:

| Variant | Wall times | Median | Modules transformed, server/client |
| --- | --- | ---: | --- |
| Current imports | 15.821 / 15.228 / 15.685 s | 15.685 s | 4,700 / 4,724 |
| Direct icon imports | 10.648 / 10.495 / 10.308 s | 10.495 s | 1,172 / 1,196 |

**5.190 seconds saved locally, a 33.1% reduction.** All six builds succeeded. The candidate also passed type checking with zero errors/warnings and the full 60-test E2E suite in both tracing runs described below. These measurements exclude package installation and do not establish hosted savings. They also do not claim a runtime bundle-size reduction: tree shaking already removes unused icons from the shipped output. The opportunity is avoiding compilation before tree shaking. This fits [Vite's guidance on barrel imports](https://vite.dev/guide/performance#avoid-barrel-files).

To reproduce, compare `bun run build` on the same source/dependencies before and after direct icon imports, with three sequential runs per variant and alternating pair order. An initial build in the original checkout took 16.937 s; it is separate from the paired comparison above. Raw logs and JSON results from this audit are retained locally under `/tmp/lyriclint-ci-build-audit-s5xd57sz/`.

Prerender/post-client processing was about 2.3–2.4 seconds; gzip reporting about 0.24 seconds in these builds. Neither explains the dominant build cost. Disabling compressed-size reporting is a small optional optimization, not the first target. Do not change rendering, minification, or offline coverage to make the build appear faster.

## CI browser setup

[Workflow installation commands](../.github/workflows/ci.yml) (line 48) download full Chrome as well as headless shell. Current CI Chromium instances are headless and do not choose a browser channel.

- Add CI-only `--only-shell`: the green hosted run spent **4.984 s in e2e** and **4.405 s in checks** downloading/extracting unused full Chrome. Keep WebKit installation and local headed-browser support. [Official Playwright support](https://playwright.dev/docs/browsers#chromium-headless-shell).
- Benchmark a version-matched Playwright image: about **35 s of e2e's 48 s installation** was operating-system dependencies; about 13 s was browser downloads. Measure image pull/startup as part of total job time before adopting it. [Playwright's image includes browser binaries and system dependencies](https://playwright.dev/docs/docker).
- Browser-binary caching alone targets the smaller cost and retains apt work. [Playwright explicitly warns that cache restoration can cost as much as downloading](https://playwright.dev/docs/ci#caching-browsers).

## E2E execution candidates

[Current tracing](../playwright.config.ts) (line 14) is `retain-on-failure`. Playwright records all initial successful attempts, with screenshots and snapshots, and discards the recordings afterward. `on-first-retry` avoids that work on green first attempts while retaining the existing two retries. Its tradeoff is loss of the original failing attempt's trace when a flake disappears on retry; the first retry trace is retained even if it passes.

A local comparison uses the same already-built candidate artifact, two workers, fresh test contexts, both browser projects, the full suite, and an independently verified preview server. It measures test execution only, excluding build and browser installation. An earlier attempted run collided with an existing server and was discarded; its failures and timings are not product or performance evidence.

The completed exploratory pair passed all 60 tests (47 Chromium, 13 mobile WebKit) in each run, with no failures, skipped tests, or retries:

| Trace configuration | Wall time | Test-runner duration |
| --- | ---: | ---: |
| `retain-on-failure` | 82.688 s | 82.162 s |
| `on-first-retry` | 64.354 s | 63.868 s |

The observed reduction was **18.334 s / 22.2%**. This is one pair, baseline first: order, warmed filesystem state, and machine activity have not been eliminated as contributors. It is enough to prioritize a hosted comparison, not to promise a 22% CI improvement. The same candidate build was served throughout, with no change to test coverage or retry policy.

Other candidates require separate measurement:

- Use the existing reduced-motion preference for editing/persistence/mobile functional cases. The normal boot sequence contains 620 + 380 + 420 ms of stages before its exit. There are 28 `openWorkspace` calls, plus direct navigation and reloads. Keep normal-motion boot/CSP/marketing checks and real animation component tests.
- Investigate repeated service-worker installation per isolated browser context. The current precache contains 118 URLs / about 3.04 MiB of uncompressed bodies, excluding WASM. Blocking workers in unrelated functional tests could save requests, but narrows incidental integration coverage. Preserve both explicit offline/cache tests and an enabled-worker smoke; do not adopt this without measuring and reviewing that tradeoff.
- Benchmark E2E worker counts or sharding after cheaper improvements. Current hosted execution uses two workers and already enables file parallelism. Include added build/browser setup and queue time. Preserve the required `checks`, `assistant`, and `e2e` gates.

## Unit-suite waits

Hosted slowest files were section-links 22.223 s, BootScreen 18.568 s, line-anchoring 17.733 s, and EditorPane 13.727 s. These execute concurrently; file durations are not additive savings.

- [Section-link helper](../src/lib/editor/section-links.svelte.test.ts) (line 657): seventeen 600 ms source sites expand through helpers and parameterized tests to 26 executions / **15.6 s of explicit waiting**. Linking dispatches synchronously. Remove waits for synchronous assertions and use controlled Date advancement where history separation is required. Keep real browser timers and the intentional hover-negative timing assertion.
- [BootScreen tests](../src/lib/ui/layout/BootScreen.svelte.test.ts) (line 97): three ready=true tests replay the same real animation to inspect different properties. Capture one timeline and retain all the visual/history assertions. Seven fixed observation windows total 12.3 s. Fake CSS animation would weaken the regression coverage.
- Line anchoring has eight 500 ms waits, but they guard scrolling and negative movement assertions. They need a controlled progression mechanism, not blanket deletion.

Worker-limit comments cite an older suite; current source has 149 node and 67 browser files. Re-measure before changing pool limits. Mixed-input instances prevent a documented Chromium pointer-state leak and must retain that isolation.

## Build once and deploy that artifact

[E2E builds the application](../playwright.config.ts) (line 31); [the deployment hook then requests another build](../.github/workflows/ci.yml) (line 85). The largest architectural opportunity is to build with the production configuration in CI, test that artifact, and upload it after all three required checks succeed. [Cloudflare supports deployment of prebuilt assets from CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

The present E2E artifact cannot simply be published: production build variables currently live in Cloudflare and control available features. Establish equivalent build inputs, artifact identity, deployment credentials, and branch behavior first. Upload/provisioning still costs time; none of the observed 148 seconds is promised as a net saving. Preserve the existing deployment gate and preview behavior.

## Existing caching and workflow volume

- Lint result caching is already implemented correctly with content hashes and a dependency/configuration fingerprint. Both recent hosted runs missed because fingerprints differed; there is no hosted warm-cache result yet. One 52 KiB entry exists. Cold lookup and successful save each cost about 4 s. The documented 91% local warm-lint gain must not be claimed as a hosted workflow gain.
- Bun package caches already hit; restores cost 4–7 s versus 1–3 s for warm installation. That is not evidence that an uncached install would be faster.
- [Dependabot has no groups](../.github/dependabot.yml) (line 3). September 2 produced nine simultaneous dependency workflows, totaling 27 validation jobs. Group compatible minor/patch updates per package to reduce weekly CI volume; preserve manual-update exclusions. [GitHub grouping guidance](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/optimizing-pr-creation-version-updates).
- Preserve the intentional TypeScript 6 / native TypeScript 7 split. Removing ESLint projectService silently disables relevant Svelte checks; replacing ESLint with the current oxlint configuration drops coverage.

The latest remote run failed lint and correctly blocked deployment; local history contains a later lint fix. This is why the older successful hosted run is the baseline, rather than treating the newest run as a completed performance measurement.

## Recommended order

1. Direct icon imports and CI-only headless-shell installation: simple, concrete, supported by measurements.
2. Measured tracing change and replacement of avoidable section-link waits, with the stated debugging/undo contracts retained.
3. Browser-image and E2E scheduling experiments, using full hosted job duration and stability.
4. Build-once production deployment, which has the largest pipeline opportunity but needs configuration/artifact integration.
5. Group dependency updates to reduce total workflow volume.


## Implementation and validation

The follow-up implements direct icon imports in all 34 files, disables gzip-size
reporting, installs only headless Chromium in `checks`, and runs E2E in the matching
official Playwright image. CI records first-retry traces, uploads them when present,
and uses all available runner CPUs. The existing two retries and all 60 browser
cases remain. Dependabot groups minor/patch updates within each ecosystem while
preserving major-update separation and manual exclusions.

Twenty-five functional E2E cases use the application's reduced-motion preference;
normal-motion integration, startup/CSP/landing, and animation checks remain.
Service-worker blocking was rejected: the exploratory full-suite run took 51.987 s
and needed two retries, versus 48.875 s with workers enabled everywhere. The result
did not justify narrowing integration coverage. Three linking fixtures now advance
Date beyond the undo grouping interval without advancing browser timers; the mobile
caret assertion polls for the completed theme change. Those four cases passed three
repetitions each without retries.

The component suite removes 25 unnecessary section-link sleeps, retains its
intentional negative hover observation, and uses Date-only undo separation. Four
boot-ready scenarios share one real three-second animation history with all their
assertions retained. The two pause-wash deadlines use controlled timeout progression;
negative-scroll observation windows still run in real time. The three affected files
passed with 153 cases (three fewer test wrappers after consolidation). A true cold
browser-optimizer run passed without reloads or additional Vite configuration.

Additional exploratory measurements, run sequentially:

| Comparison | Result | Scope and limitation |
| --- | ---: | --- |
| Cold official image pull + startup | 16.648 + 0.744 s | Local Docker; compare with the hosted E2E baseline's ~35 s OS setup, then verify actual hosted job totals |
| Functional E2E reduced motion | 63.970 → 48.875 s | Same prebuilt artifact and first-retry tracing; one local pair |
| E2E two → four workers | 62.810 → 53.761 s | Both constrained to four CPUs; all 60 cases passed without retries |
| Three affected component files | 23.116 → 19.330 s wall | Local comparison also includes direct imports; not a whole-suite saving attributable solely to waits |

Production now builds with the existing public Apple Music, assistant, and Turnstile
configuration supplied through GitHub repository variables, tests that artifact,
and uploads it to Pages after all three gates succeed. The artifact includes hidden
files and is selected by revision within the same workflow run. Deployment is
serialized and skips a superseded `main` revision. Pages' existing preview settings
and disabled automatic production builds are preserved. The public variables and
account ID were configured; the user supplied `CLOUDFLARE_API_TOKEN`, whose presence
was verified. Private signing keys and local OAuth credentials stay outside CI.

Validation used an isolated copy of `8fd9028` with only this CI/build patch applied,
because the shared working tree also contains concurrent application-performance
changes. All checks below passed:

| Check | Wall time | Result |
| --- | ---: | --- |
| `bun run check` | 4.247 s | No errors or warnings |
| `bun run lint` | 36.473 s | Full uncached lint |
| `bun run test:unit -- --run` | 59.722 s | 2,680 tests |
| `bun run assistant:test` | 2.166 s | 145 tests |
| Production-configured `bun run build` | 12.834 s | Existing public production values |
| Prebuilt E2E in the official image, four CPUs | 72.248 s | 60 passed, no skips, failures, or retries |

The final container run validates the CI runtime and production-configured artifact;
it is not directly comparable with the earlier host-based timing pairs. Workflow
syntax also passed actionlint. No commit, push, or deployment was performed during
this implementation. A hosted run must still verify the supplied token's permissions,
artifact upload/deployment, image pull overhead, and total push-to-production duration.
Do not add the individual local savings together or present them as hosted savings.

# CI and deployment

`.github/workflows/ci.yml` keeps the three required checks (`checks`, `assistant`,
`e2e`) and only publishes the production deploy after all three succeed. PRs retain
all checks, but a new commit cancels the superseded run. Production pushes have
unique workflow concurrency groups, so PR cancellation cannot interrupt a
production gate. The deploy job retains its separate serialized production
concurrency group and checks that its revision is still the tip of `main` before
deploying, so a slower, superseded run cannot publish an older artifact afterward.

## Build once, test, then deploy

The E2E job runs `bun run build` explicitly. `PLAYWRIGHT_PREBUILT=1` tells
Playwright to start a fresh, strict-port preview server for that build; it does
not reuse an existing server, even outside CI. The ordinary local Playwright
command still builds automatically. `PORT` remains the explicit opt-in for an
externally managed server.

On production pushes, the build receives these GitHub Actions repository
variables, copied from the Pages production build configuration:

- `PUBLIC_APPLE_MUSIC_TOKEN`
- `PUBLIC_ASSISTANT_ANSWERS_URL`
- `PUBLIC_TURNSTILE_SITE_KEY`

They are public browser configuration, not private credentials. A missing value
fails the production build before it can silently remove a configured feature.
Spotify stays unconfigured in production. PR validation builds do not inherit
production values, and Cloudflare's existing PR preview behavior is unchanged.

Only a successful production E2E job uploads `build/`, named for `github.sha`.
The deploy job downloads that artifact from the same workflow run after all three
checks succeed and uploads it with a pinned Wrangler version. It never rebuilds.
Uploads replace the same named artifact on a job rerun; rerunning only deployment
can still download the artifact from the earlier successful E2E attempt.
The Cloudflare Pages project is `lyriclint`, with branch `main`; its automatic
production builds remain disabled. The old deploy hook is no longer used.

Deployment requires the GitHub Actions variable `CLOUDFLARE_ACCOUNT_ID` and
secret `CLOUDFLARE_API_TOKEN`. Give the token only Account → Cloudflare Pages →
Edit on the account hosting this project; it does not need Worker deployment
access. Configuration is checked explicitly before upload. A Wrangler OAuth
login is a local interactive credential and must not be copied into CI.

Rotate the Apple developer token in the GitHub Actions repository variable and
ship a new revision to rebuild it into the tested artifact. Keep the Pages
production build variable synchronized if retaining the old hook for manual
recovery. The token's signing key remains outside this repository and CI.

## Lint result caching

CI runs the same three linters as `bun run lint`: Prettier, oxlint, and ESLint.
Prettier and ESLint cache successful results using file contents, since a fresh
checkout changes modification times even when the file has not changed. Oxlint
continues to run over the complete configured input on every run.

The cache lives under the already ignored `node_modules/.cache/ci-lint`. Its key
includes the lockfile, package manifest, lint configuration, ignore files,
TypeScript configurations, and Vite configuration. A SHA suffix saves results for
each revision; the restore prefix only accepts results with the same dependency
and configuration fingerprint. Do not add a broader restore prefix: Prettier does
not include plugin versions or implementations in its own cache key. If a new
local lint plugin or configuration input is introduced, add its path to both key
expressions. `bun run lint` stays uncached locally and remains an independent full
validation command.

The `checks` browser suite needs Chromium. E2E uses both Chromium and mobile
WebKit. CI installs only Chromium's headless shell with `--only-shell`; local
`bun run test:browsers` retains the full browser for headed debugging. Browser
coverage and behavioral assertions remain intact, including real boot-animation
observations and the offline/cache-admission scenarios.

CI traces the first E2E retry rather than recording and discarding every green
first attempt. The two-retry policy is unchanged. This loses the original failing
attempt's trace when a flake disappears on retry; the first retry is still traced
even if it passes. Local runs retain their original-failure traces because they
normally have no retries.

The E2E job uses the versioned official Playwright image, which includes Chromium,
WebKit, and their OS dependencies. Refresh its tag alongside Playwright upgrades.
It does not include `unzip`, so the job installs it before `setup-bun` extracts
the Bun release archive.
If a package update needs browser revisions absent from the image, the job falls
back to the complete headless-shell/WebKit installation, including OS dependencies.
The `checks` job keeps the ordinary runner: its Chromium-only installation is
already comparable to the measured image startup cost.

E2E uses all available CI CPUs. Editing/persistence/linking functional cases use
the application's real reduced-motion preference, while normal startup, animation,
CSP, and desktop/mobile integration scenarios retain normal motion. Service
workers remain enabled for every case. Fixture text gets its own undo interval
through a Date-only clock adjustment; browser timers and rendering stay real.
Retry traces are uploaded when trace files exist, including recovered flakes;
clean first-attempt runs do not upload an empty debugging artifact.

## Dependency updates and build work

Dependabot groups compatible minor/patch updates within each package ecosystem.
Major changes remain separate, and all existing manual-update exclusions stay in
place, including the intentional TypeScript split.

Icon imports use the library's public `lucide-svelte/icons/*` subpaths. Each
resolves to the same component as the former barrel import, while avoiding
compilation of the full icon library before tree shaking. Production builds also
skip gzip-size reporting; dedicated size audits can still compress emitted files.

## Vitest 5 browser compatibility

The browser suite disables the runner UI because its scaled iframe places some
component controls under the runner's resize divider, intercepting native clicks.
Tests still use Playwright and the same desktop and phone browser instances.

`browserKitDefines` in `vite.config.ts` decodes SvelteKit's JSON literals in
Vitest's browser runtime globals while preserving Vite's compile-time expressions.
Vitest 5 otherwise assigns encoded strings directly: the empty base path becomes
quote characters and the `false` hash-routing flag becomes truthy. The existing
navigation assertions exercise the correct URLs.

## Measurements

### Earlier lint-cache work

The completed baseline inspected for the earlier lint-cache change was
[33970952837](https://github.com/hkarlsen06/LyricLint/actions/runs/33970952837).
Its `checks` job took 157 seconds, including 7 seconds for type checking,
49 seconds for lint, 29 seconds for browser installation, and 59 seconds for unit
tests. E2E took 105 seconds. The checks job also waited 69 seconds to start, which
is why this change does not add more jobs simply to parallelize its commands.

For that change, a quiet local `bun run lint` passed in 45.202 seconds.
After priming the workflow's result caches, three complete runs of its Prettier,
oxlint, and ESLint commands passed in 4.008, 3.889, and 3.965 seconds: a median of
3.965 seconds, saving 41.237 seconds (91.2%, 11.4× faster). The warm runs and the
uncached baseline ran without the unit suite or performance benchmarks competing
for CPU. An earlier overlapped baseline was discarded. `bun run check` also passed
in 4.873 seconds. Cold caches still run all checks; the speedup is for repeated
linting with reusable results, not an initial checkout without a cache.

Lint cache invalidation was checked by warming both caches with a clean JavaScript
file, changing its contents to contain formatting and ESLint errors, and restoring
its original modification timestamp. Both tools rejected the changed file. Cache
hits therefore do not depend on checkout timestamps and do not suppress errors
in changed files.

To reproduce the local comparison, time `bun run lint`, run the workflow's
three `Lint` commands once to populate the caches, then time those same three
commands again with unchanged sources. Run these sequentially on an otherwise
idle machine; do not overlap them with the unit or browser suites.

Actual GitHub cache restore/save overhead and total workflow improvement must be
measured after the changed workflow runs. Local warm-cache timing is not a claim
about the duration of a hosted GitHub runner or a cold-cache run.


### September 6 build and E2E work

The newer audit baseline, [34040000520](https://github.com/hkarlsen06/LyricLint/actions/runs/34040000520),
took 209 seconds through the deployment hook, followed by about 148 seconds until
Pages reported completion. E2E was the critical path at 199 seconds. Across eleven
recent runs, median initial queue time was 3–4 seconds; the earlier long queue was
an outlier. The [audit and implementation record](ci-build-audit.md) contains the
individual experiments and their limitations.

Direct icon imports reduced the median of three local builds per variant from
15.685 to 10.495 seconds. Separate full-suite comparisons supported first-retry
tracing, reduced motion for functional cases, and four E2E workers on four CPUs.
A cold local image pull plus startup took 17.392 seconds; hosted image setup still
needs measurement. Blocking service workers was slower and introduced retries,
so every E2E case retains them.

The final CI/build patch passed type checking, full uncached lint, all 2,680 unit
and 145 assistant tests, and a production-configured build. All 60 E2E cases then
passed without retries in the official Playwright image on four CPUs. Validation
used an isolated copy of the original revision with this patch, separating it from
concurrent application changes in the shared working tree. The production variables
and deployment-secret presence were verified. The next hosted run must establish
actual pipeline savings and confirm the token's deployment permissions.

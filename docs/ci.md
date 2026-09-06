# CI and deployment

`.github/workflows/ci.yml` keeps the three required checks (`checks`, `assistant`,
`e2e`) and only triggers the production deploy after all three succeed. PRs retain
all checks, but a new commit cancels the superseded run. Production pushes have
unique workflow concurrency groups, so PR cancellation cannot interrupt a
production gate or its deploy hook. The deploy job retains its separate serialized
production concurrency group.

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
WebKit, so it calls `bun run test:browsers`, the same installation script as the
complete local test chain. Neither browser coverage nor a test is removed to
reduce CI time.

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

The last completed baseline run inspected before this change was
[33970952837](https://github.com/hkarlsen06/LyricLint/actions/runs/33970952837).
Its `checks` job took 157 seconds, including 7 seconds for type checking,
49 seconds for lint, 29 seconds for browser installation, and 59 seconds for unit
tests. E2E took 105 seconds. The checks job also waited 69 seconds to start, which
is why this change does not add more jobs simply to parallelize its commands.

On the final working tree, a quiet local `bun run lint` passed in 45.202 seconds.
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

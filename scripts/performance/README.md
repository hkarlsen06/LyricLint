# Performance harnesses

Use `workbench.mjs` for production-editor startup, paste-to-settled-diagnostics and separate main
and worker CPU profiles. Read [the workbench harness](../../docs/performance-workbench.md) for its
fixtures, completion evidence and exclusions. Native lint measurements below exclude Harper,
rendering, startup and networking. Neither harness alone ranks every operation in the project.

## Native comparisons

Build the same benchmark entry in each revision's checkout, after installing that revision's
locked dependencies. The builder stamps the source revision and whether the checkout is dirty:

```bash
bun scripts/performance/build-lint.ts /tmp/lint-before.mjs
# In the other revision's checkout:
bun scripts/performance/build-lint.ts /tmp/lint-after.mjs
node scripts/performance/compare-lint.mjs /tmp/lint-before.mjs /tmp/lint-after.mjs .audit/comparison.json
```

The comparator launches five fresh process pairs in alternating order. It verifies scenario and
fixture identity, runtime, completed work, diagnostic counts and complete document/diagnostic
hashes before summarizing medians and ranges of process medians. Both bundle files are hashed
before measurement and checked before and after every child run; revision and dirty-state metadata
must remain stable within each side. Nonzero exits, timeouts and
invalid or incompatible results fail the command. The report remains `complete: false` until
all pairs and summary validation succeed. Output parent directories must already exist.

For per-rule timings, pass `--rules` to the comparator. These instrumented timings include timer
overhead and are separate from uninstrumented end-to-end native-pass timings. Shared-helper gains
cannot be attributed independently to every caller. Build both bundles before measuring; run
comparisons without concurrent builds, browser suites or other benchmarks.

`scripts/benchmark-lint.ts` still runs directly with Bun and prints nine-batch distributions for
24-, 80- and 800-line typing revisions plus cache churn. Its fixture definitions live in
`lint-workloads.ts`. Direct runs are marked `unstamped`; use the builder for paired comparisons.

## Exact diagnostic comparisons

The differential entry compares the four text rules changed in the November 2026 optimization:
ad-libs, title case, censored masks and symbols. It is a scoped correctness sweep, not a performance
measurement or complete catalog audit. Compile the same entry against each source revision:

```bash
bun scripts/performance/build-lint.ts /tmp/check-before.mjs --differential
# In the other revision's checkout:
bun scripts/performance/build-lint.ts /tmp/check-after.mjs --differential
node scripts/performance/differential-lint.mjs /tmp/check-before.mjs /tmp/check-after.mjs
```

The driver checks complete ordered diagnostics and fixes across 24,000 deterministic generated
cases in English, French and Norwegian, including Unicode, markup and literal UTF-16 ranges.
A mismatch prints its input and exits nonzero. Detector equivalence is covered separately by
`src/lib/languages/statistical-detector.test.ts` against the original dependency.

## Verification

`bun run perf:test` exercises the tooling's failure paths in CI and the full local test chain.
It rejects mismatched outputs, incompatible fixtures and runtimes, missing work, stale rule
scopes, failed children and incomplete editor settlement. These are deterministic checks, not
speed thresholds. For published-release verification, use `bun run release:check` as described
in [deployment guidance](../../docs/ci.md).

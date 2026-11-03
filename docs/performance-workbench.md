# Profile the production workbench, including Harper

`workbench.mjs` measures the actual workbench page. It complements the native-lint microbenchmark
and `browser-vitals.mjs`, whose route and Event Timing audit does not profile Harper's worker.
It does not produce a project-wide ranking by itself.

## Run

Build once, start a production preview, and run the harness without a concurrent build, test
suite or benchmark:

```bash
bun run build
bun run preview -- --host 127.0.0.1 --port 4188 --strictPort
```

In a second shell:

```bash
bun scripts/performance/workbench.mjs http://127.0.0.1:4188 .audit/workbench 5
```

The last argument is the number of fresh browser contexts. Five is the default. The harness
uses Chromium at 1350 by 940, English, normal motion and no CPU or network throttling. It rejects
a dev server and requires the built release manifest. Every sample and the separate profile
must identify the same release revision.

Each context measures navigation to a painted editable field, the first bulk insertion, and
two changed-text replacements. `editor.fill` is a browser bulk-input action, not a measurement
of system clipboard access. The first insertion includes lazy native and language initialization,
Harper's debounce, worker startup and WASM loading. Later replacements reuse those initialized
modules. Fresh contexts do not imply a cold operating-system or origin-server cache.

## What counts as settled

The timer starts at the browser's input event, before the editor processes it. Completion requires:

- Native rules are no longer pending.
- The observed Harper worker answers a `lint` request for the current operation.
- No worker RPC remains pending.
- Native and Harper diagnostic rows exist at the current fixture's exact offsets.
- Two animation frames have elapsed after the worker response and the diagnostic DOM has been
  quiet for at least 100 ms.

The fixture intentionally contains `tommorrow` for the native spelling rule and `sentnce` for
Harper. Each replacement shifts their offsets, preventing stale rows from satisfying the check.
The fixture, required findings and worker protocol are maintained together. A dependency change
that removes either finding fails the harness rather than yielding an apparently faster sample.

After recording the endpoint, the harness copies the editor's lyrics and checks them exactly.
This validation is outside the reported insertion time. Visual DOM text is not canonical lyric
text because fix previews and other widgets can add words. Browser and worker errors invalidate
samples. The report starts with `complete: false` and becomes complete only after all samples
and worker profiles succeed. Missing native findings, disabled Harper, absent worker replies or stale rows time out
and leave failure details in `report.json`. The wait is bounded at 60 seconds.

## CPU profiles are a separate run

After the unprofiled samples, one additional fresh context repeats the scenario with Chromium's
sampling profiler enabled. CDP attaches to dedicated workers before their code runs. The run
writes `main.cpuprofile`, a profile for each worker, and per-target sampled self-time summaries.
Each invocation uses a unique `profiles-<runId>/` folder named in `report.json`, so captures from
a previous invocation cannot be mistaken for the current run.
It fails if no worker target is captured, so a main-thread-only trace cannot stand in for Harper.
The raw profiles can be opened in a compatible DevTools performance viewer.

`report.json` keeps profiled observations separate from reported wall-time samples. CPU summaries
exclude idle, root and unattributed program samples. They estimate sampled self CPU, not total
process CPU, wall latency, or additive end-to-end time. Worker and main-thread work can overlap.
Profiles include observer, automation and copy-validation overhead. Inspect raw stacks before
attributing a hot function to the application. The quiet-window duration is also part of the
reported wall endpoint, not application compute time.

## Coverage and checks

Coverage includes startup, native linting, the actual Harper RPC and worker, diagnostic merging,
and painted diagnostic presentation. It excludes media playback, remote assistant inference,
offline/service-worker lifecycle, compositor/GPU CPU attribution and field INP. Service workers
are blocked so each context exercises the supplied build rather than a retained offline shell.
Use the route audit and offline tests for those separate scenarios.

`workbench-observer.test.mjs` checks that missing replies, pending work, stale rows, absent input,
unpainted output and worker errors cannot count as success. It also verifies that sampled CPU
summaries exclude idle and unattributed time. A real production-build run is still required to
verify the current browser, fixture, Harper serialization protocol and worker profiling support.

# Motion in Svelte

LyricLint uses native Web Animations through a Svelte attachment in
`src/lib/ui/layout/workspace-entrance.ts`. `Workspace.svelte` keeps it on the workspace root
and restarts its lifetime when `controller.draftId` changes. The opacity reveal needs no
animation-library download. The installed Motion package remains available for effects
that need it.

## Current behavior

On load, opening another ’scribe, or creating a new one, the initial viewport’s lyric lines and diagnostic rows reveal from transparent to opaque
in top-to-bottom order within each group, without changing position. This explicitly
requested startup reveal and the navigation splash may use temporary opacity; opacity never
communicates disabled, selected, or other application state. Duration uses
`--duration-workspace-entrance` (400ms), and easing uses `--ease-in-out-cubic`.
Rows start `--duration-workspace-stagger` (60ms) apart, compressed when necessary to fit
`--duration-workspace-stagger-limit` (720ms). Each group finishes within 1,120ms of its start.

Only existing children intersecting the viewport are eligible, and every visible row participates.
The scan stops below the viewport; it has no fixed child or row count that could cut off a
tall viewport or spend its budget on overscan above a restored scroll position.
The editor contributes its existing viewport `.cm-line` elements, or
`.ll-placeholder-line` elements in an empty ’scribe; diagnostics keep their current list order.
Hidden or inert panes are skipped. Editing, scrolling, and later lint results never restart it.
Reopening an earlier ’scribe does replay it; opening the already active one does not.

The attachment skips animation when reduced motion or a hidden document is already active. A temporary
mutation observer waits for the initial groups, batching scans through `requestAnimationFrame`.
It disconnects when both groups have been handled. Before asynchronous content can paint,
`data-workspace-entrance` activates a temporary opacity mask in `shell.css`, avoiding a
visible-then-hidden flash. Each group's mask is removed once its animations are created;
untargeted rows then appear immediately. The mask has a two-second limit from attachment:
slow startup reveals everything and abandons the effect instead of leaving text hidden.
A separate two-second cleanup deadline starts after the editor is ready. Lyrics follow
`data-entrance-pending`; diagnostics independently follow `data-diagnostics-pending`, so a
rules download cannot hold ready lyrics invisible. Editor readiness belongs to the newly
mounted draft ID, so the previous editor cannot release the new reveal early.
The editor reports readiness after CodeMirror's first viewport measurement settles. Its
initial DOM is only an estimate; scanning it before measurement misses rows added below it.
Input, pointer presses, focus, scrolling, visibility changes,
reduced-motion changes, and unmounting remove the mask and cancel animation immediately.
Animations never write inline styles; cancellation exposes the original styling. Failure also reveals the workspace. Readiness,
focusability, document structure, and layout never wait for animation completion.

Internal navigation between different pathnames starts the root layout's `NavigationSplash`
while the destination loads, including Back/Forward and parameter changes in a dynamic route.
Browsing within the mounted guide (its index, topics, and checks) skips the splash, including
Back/Forward; entering or leaving the guide still uses it. Query and fragment changes on the
same page also skip it. Regular pages signal readiness on
navigation completion; the workbench retains its editor-readiness and refusal handling.
Two native View Transitions handle page-to-splash and splash-to-destination; their callbacks
wait only for a Svelte DOM flush.
The route's DOM swap waits for the entry transition's update callback, so a cached destination
cannot flash before the splash. Downloads and the spring continue independently.
`BootScreen` restores the spring and radial reveal removed in `456a34c8`, without the old
reading delay: immediately pull to `--wm-open: 1.22` over 380ms using `--ease-out-quart`,
then release over 420ms with
`cubic-bezier(0.5, 0, 0.85, 0.25)`. A ready destination waits visually for the spring and
420ms radial explosion to finish; navigation and editor readiness continue independently.
If still loading after landing, the shared waveform runs until readiness starts the explosion.
Input skips native snapshots and dismisses the splash immediately. Skipped update callbacks use
the current requested visibility, preserving a fast navigation's full animation without
resurrecting an explicitly dismissed splash. Missing API support uses the same CSS animation
with a direct DOM handoff. Reduced motion parks the mark and wave and skips the minimum and
explosion. Direct page loads and draft switches do not show it. See
[site guidance](subsystems/site.md) for its lifetime and refusal paths.

## Best practices

- Keep startup motion in the workspace attachment. Do not add per-card or per-line mount
  effects: those would replay on normal document updates.
- Animate only temporary `opacity` for this startup reveal, using semantic
  tokens. Avoid layout properties, permanent `will-change`, per-frame layout reads, or reactive
  state updates for animation progress. Ordinary state styling retains full opacity.
- Read CSS time units explicitly. The production minifier can change `400ms` to `.4s`;
  `millisecondsFromCssTime` normalizes either spelling to native milliseconds. Never assume that
  a computed custom property keeps the unit written in the source stylesheet.
- Batch geometry reads before animation writes, target only visible rows, and preserve
  cancellation and the mask deadline. Restore each row’s opacity on completion or cancellation; leave transforms untouched.
- Preserve CodeMirror's text and DOM structure. Do not use text-splitting helpers on the editor,
  add wrapper elements, or materialize the full document for an entrance.
- Use CSS or Svelte's existing facilities for simple unrelated transitions. Add another Motion
  entry or paid feature only when the requested effect requires it.
- Verify with a long document at desktop and phone widths, reduced motion, immediate typing,
  and a slow or failed chunk request. Check that focus, copy, row order, and subsequent edits
  remain stable. Compare the production chunk and a browser performance trace when expanding
  scope; bounded animation still has a rendering cost, not a zero-cost guarantee.

## Motion+ access

This entrance needs no paid feature. The installed dependency is public `motion`; no Motion+
package, private registry configuration, or account credential has been added.

For a future paid JavaScript feature, follow the official
[Motion+ installation instructions](https://motion.dev/docs/motion-plus-installation): the
private `@motionplus/core` package is installed under the `motion-plus` alias, with registry
authentication supplied through `MOTION_TOKEN`. Keep the token in local or CI secrets, never
in committed configuration or a client-exposed environment variable. Check that the chosen
feature supports the JavaScript API before adapting its examples to Svelte.

## AI Kit for Codex

Installed with `bunx motion-ai` (project scope, Codex). The kit's skill lives in
`.agents/skills/motion/`; `.codex/config.toml` registers the hosted `motion` and
`motion-plus` MCP servers. These are development tools, not browser dependencies.
Start a new Codex session to load them and use `/motion` for animation guidance.

The current kit uses account sign-in rather than the old API-token flow. Enable
Motion+ through Codex's MCP sign-in or `codex mcp login motion-plus`. Paid tools require
that separate authentication; installing the kit alone does not sign in. See the official
[AI Kit installation guide](https://motion.dev/docs/ai-kit-install).

The checked-in skill is adapted to this Svelte project: ordinary animation work
can reuse local patterns, and MotionScore runs only when explicitly requested.
To update the kit, run `bunx motion-ai@latest` with the same scope and agent, review
the resulting diff to retain those local integration choices, then format the
Markdown with `bunx prettier --write .agents/skills/motion`.

## Verification

An isolated production-build WebKit reload verified that early lyric lines and cards have
intermediate opacity while later rows are still transparent, followed by full opacity and
no remaining masks or inline animation styles. Native durations remain 400ms after CSS
minification. The test build uses a separate directory and port so verification does not
invalidate the running development preview's asset index.

The previous implementation downloaded a separate `motion/mini` chunk before revealing
rows. The native implementation removes that wait. Browser tests cover both 1440px and 390px widths, bounded ordered
stagger, a partially revealed first row while the next remains transparent, unchanged text
and layout, cleanup, input cancellation, reduced motion, and unmounting before asynchronous
startup completes. Slow-startup coverage verifies that lyrics do not wait for diagnostics,
and that exceeding the masking budget shows all content and suppresses a later entrance.
API failure and actual scrolling also restore visibility. These checks do not guarantee identical
performance on every device.

Tall-viewport and restored-scroll regressions assert that every visible lyric row starts
transparent on the same bounded stagger. The previous 48-row animation cap and 64-child
scan cap let later paragraphs appear immediately while earlier lines were still fading.
A real-editor regression holds CodeMirror's first measurement, then checks that its added
viewport rows join the initial fade. The mask stays in place until that measurement completes.

Animation counts alone missed a production-only timing bug: the minifier's `.4s` was
interpreted as 0.4 milliseconds. The regression now uses both `ms` and `s` tokens and
asserts 400ms native duration, the bounded 60ms stagger, intermediate rendered movement,
and sequential opacity. Production verification must inspect rendered opacity and stable positions,
not just count animation objects.

The real-editor browser test opens another ’scribe, creates a blank one through the toolbar,
checks its staggered placeholder lines, and reopens the first. The workspace node survives
all switches; typing does not replay the reveal.

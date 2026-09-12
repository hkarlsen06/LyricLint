# Motion in Svelte

LyricLint uses the public `motion` package's JavaScript `motion/mini` entry through a Svelte
attachment in `src/lib/ui/layout/workspace-entrance.ts`. `Workspace.svelte` keeps it on the workspace root and restarts its lifetime when
`controller.draftId` changes. Mini uses native browser animation APIs and supports the
`opacity` property needed here; a React or Vue adapter is unnecessary.
[Motion's animate documentation](https://motion.dev/docs/animate) describes the entry points.

## Current behavior

On load, opening another ’scribe, or creating a new one, the initial viewport’s lyric lines and diagnostic rows reveal from transparent to opaque
in top-to-bottom order within each group, without changing position. This explicitly
requested startup reveal is the sole temporary-opacity exception; opacity still never
communicates disabled, selected, or other application state. Duration uses
`--duration-workspace-entrance` (400ms), and easing uses `--ease-in-out-cubic`.
Rows start `--duration-workspace-stagger` (60ms) apart, compressed when necessary to fit
`--duration-workspace-stagger-limit` (720ms). Each group finishes within 1,120ms of its start.

Only existing children intersecting the viewport are eligible: at most 64 are inspected and 48 are
animated per group. The editor contributes its existing viewport `.cm-line` elements, or
`.ll-placeholder-line` elements in an empty ’scribe; diagnostics keep their current list order.
Hidden or inert panes are skipped. Editing, scrolling, and later lint results never restart it.
Reopening an earlier ’scribe does replay it; opening the already active one does not.

The attachment imports `motion/mini` asynchronously without delaying editor readiness. It
skips the import when reduced motion or a hidden document is already active. A temporary
mutation observer waits for the initial groups, batching scans through `requestAnimationFrame`.
It disconnects when both groups have been handled. Before asynchronous content can paint,
`data-workspace-entrance` activates a temporary opacity mask in `shell.css`, avoiding a
visible-then-hidden flash. Each group's mask is removed once its animations are created;
untargeted rows then appear immediately. The mask has a two-second limit from attachment:
slow startup reveals everything and abandons the effect instead of leaving text hidden.
A separate two-second cleanup deadline starts after Motion, the editor, and initial native
checking are ready. Readiness belongs to the newly mounted draft ID, so the previous
editor cannot release the new reveal early. Empty ’scribes do not wait for a rules download. Input, pointer presses, focus, scrolling gestures, visibility changes,
reduced-motion changes, and unmounting remove the mask, cancel animation, and restore original
inline opacity immediately. Failure also reveals the workspace. Readiness,
focusability, document structure, and layout never wait for animation completion.

## Best practices

- Keep startup motion in the workspace attachment. Do not add per-card or per-line mount
  effects: those would replay on normal document updates.
- Animate only temporary `opacity` for this startup reveal, using semantic
  tokens. Avoid layout properties, permanent `will-change`, per-frame layout reads, or reactive
  state updates for animation progress. Ordinary state styling retains full opacity.
- Read CSS time units explicitly. The production minifier can change `400ms` to `.4s`;
  `secondsFromCssTime` normalizes either spelling to Motion's seconds. Never assume that
  a computed custom property keeps the unit written in the source stylesheet.
- Batch geometry reads before animation writes, keep target counts bounded, and preserve
  cancellation and the mask deadline. Restore each row’s opacity on completion or cancellation; leave transforms untouched.
- Preserve CodeMirror's text and DOM structure. Do not use text-splitting helpers on the editor,
  add wrapper elements, or materialize the full document for an entrance.
- Use CSS or Svelte's existing facilities for simple unrelated transitions. Add another Motion
  entry or paid feature only when the requested effect requires it.
- Verify with a long document at desktop and phone widths, reduced motion, immediate typing,
  and a slow or failed chunk request. Check that focus, copy, row order, and subsequent edits
  remain stable. Compare the production chunk and a browser performance trace when expanding
  scope; bounded animation still has a download and rendering cost, not a zero-cost guarantee.

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

The production build emits `motion/mini` as a separate chunk: 7,488 bytes raw,
2,915 bytes gzipped with the installed Motion 13.2.0. It is not a static dependency
of the editor. Browser tests cover both 1440px and 390px widths, bounded ordered
stagger, a partially revealed first row while the next remains transparent, unchanged text
and layout, cleanup, input cancellation, reduced motion, and unmounting before asynchronous
startup completes. Slow-startup coverage verifies that exceeding the masking budget shows
all content and suppresses a later entrance. These checks do not guarantee identical
performance on every device.

Animation counts alone missed a production-only timing bug: the minifier's `.4s` was
interpreted as 0.4 milliseconds. The regression now uses both `ms` and `s` tokens and
asserts 400ms native duration, the bounded 60ms stagger, intermediate rendered movement,
and sequential opacity. Production verification must inspect rendered opacity and stable positions,
not just count animation objects.

The real-editor browser test opens another ’scribe, creates a blank one through the toolbar,
checks its staggered placeholder lines, and reopens the first. The workspace node survives
all switches; typing does not replay the reveal.

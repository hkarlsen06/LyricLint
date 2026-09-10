# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` is a symlink to this file.

## Project

LyricLint is a SvelteKit (Svelte 5, runes) workbench for linting Genius lyric transcriptions.
Reference docs: `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Adding entries to the guidance catalog behind `/guidelines/` — turning supplied screenshots or
pasted Genius guideline text into reviewed entries, registering sources with their authority
tier, and verifying annotation acceptance states — follows **`docs/guidelines.md`** exactly.

## Read relevant subsystem guidance

Before changing behavior, read **The rules** and the relevant **Decision record** in the
subsystem doc routed below. These are authoritative invariants and their supporting failure
history; passing tests alone does not justify breaking them. Read the relevant record before
challenging a rule, and update the doc when changing behavior it describes.

For trivial edits that do not affect behavior, such as spelling or formatting, skip unrelated
decision history. Still read guidance relevant to the edit, including content, accessibility,
and data-safety constraints. If an edit could affect behavior, use the full guidance above.
`src/lib/subsystem-docs.test.ts` pins routing and claimed paths.

| Working on                                                                                                                                                                          | Read first                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Toolbar, tab strip, panels, the editor actions tray, tooltips and shortcut disclosure, the empty document, transient-surface dismissal, the assistant transcript, the dev tab title | `docs/subsystems/shell.md`          |
| Diagnostic cards and popovers, fix previews, batch fixes, the panel's reading order, the Harper merge                                                                               | `docs/subsystems/diagnostics.md`    |
| Adding or changing a lint rule, `settlesOn`, shared cross-rule predicates, policy cases, Harper tuning                                                                              | `docs/subsystems/rules-catalog.md`  |
| The drafts menu and switcher, autosave, recovery, any `DraftRecord` field                                                                                                           | `docs/subsystems/drafts.md`         |
| The performer roster, renames, the performer picker, `performers/transform.ts`                                                                                                      | `docs/subsystems/performers.md`     |
| The transport and its keys, `MediaStrip`/`MediaPicker`, attachment persistence, cover art, draft naming from a song                                                                 | `docs/subsystems/media.md`          |
| The YouTube source                                                                                                                                                                  | `docs/subsystems/media-youtube.md`  |
| The Spotify source and its auth                                                                                                                                                     | `docs/subsystems/media-spotify.md`  |
| The Apple Music source and its token                                                                                                                                                | `docs/subsystems/media-apple.md`    |
| Line anchors, the timestamp gutter, sync mode, the linked fill                                                                                                                      | `docs/subsystems/line-anchors.md`   |
| Section links, the mirror, the Linking panel, `Type only here`                                                                                                                      | `docs/subsystems/section-links.md`  |
| Clipboard copy/paste metadata, the audio drop, editor↔shell hooks (`createCallbackProxy`)                                                                                           | `docs/subsystems/editor.md`         |
| The landing page, generated shots and loops, the site palette and header, the wordmark, the favicon                                                                                 | `docs/subsystems/site.md`           |
| `/rules/`, `/guidelines/`, their search, `SectionSplit`                                                                                                                             | `docs/subsystems/reference.md`      |
| Phone/touch behavior, `responsive.css`, mobile task views                                                                                                                           | `docs/subsystems/responsive.md`     |
| The service worker, offline behavior, deploy freshness                                                                                                                              | `docs/subsystems/service-worker.md` |

The guidance catalog's content pipeline — adding entries, authority tiers, verification —
stays in `docs/guidelines.md` and is followed exactly.

## Tooling

Use **bun**, never npm.

```bash
bun run test
bun run check
bun run lint
bun run test:unit -- --run
bun run assistant:test
bun run test:e2e
```

`bun run test` is the complete local CI-equivalent chain and installs Chromium
before either browser-mode suite. The individual commands assume their normal
project dependencies are already installed; `test:e2e` installs Chromium on a
clean machine.

### Two TypeScripts are installed on purpose

`typescript` stays on 6 and `@typescript/native` is 7, aliased (`npm:typescript@7`). That is not a
half-finished migration — it is the arrangement svelte-check documents. TS 7 ships no JS compiler
API, so **svelte-check** refuses to start and **typescript-eslint** throws on a naive bump.
`bun run check` opts in with `--tsgo`; `bun run lint` is untouched.

`--tsgo` writes transpiled Svelte to gitignored `.svelte-kit/.svelte-check` (why it cannot be the
default), reports a smaller file count that is a reporting difference rather than a coverage gap
(the planted-error probes establish that), and inherits `--incremental`'s limitation: a Svelte file
outside `src/` is not properly checked, and every `.svelte` file here lives under `src/`.
Dependabot skips both halves for the root package, so bump TS 7 by hand alongside svelte-check.
`services/rules-assistant` runs TS 7 directly (plain `tsc`, neither blocking tool in front of it).
When svelte-check supports TS 7, this collapses to one dependency and the flag goes away.

## Git history

Prefer rebasing over merge commits when integrating branches. Rebase the topic branch onto the
current target branch, then use a fast-forward merge so history stays linear. Do not create a
merge commit unless the user explicitly requests one or rebasing would rewrite shared history.

### Undo your own hunks, never the file

**Do not run `git checkout -- <file>` (or `git restore <file>`) unless you have just checked that
the file contains no changes but your own.** It discards everything uncommitted in that file, and
work that was never staged is not recoverable — not from the reflog, not from a stash.

This working tree is normally carrying a large set of the user's own modified files, so any file
worth experimenting in is likely to already hold work that is not yours. Backing an experiment out
means inverting **your** edits: `Edit` them back, or reverse-apply your own hunks from `git diff`.
Where you know in advance that you are about to try something you may abandon, `git stash` the
file first and restore it after.

The cost of getting this wrong is not a rerun. It is somebody's unsaved afternoon, and the only
place it may still exist is their editor's undo buffer — so if it happens, say so immediately and
tell them to check that before you offer to rebuild anything from memory.

## Parallel work

Parallelize independent work with subagents where it saves time or improves quality —
independent subsystems, rule families, doc plus code plus test triples. Keep messages to other
agents legible, with proper spacing between words, since a human may read them.

## UI rules

For UI changes, read `DESIGN.md` and `docs/ui-agent-guidance.md` for detailed patterns,
examples, and canonical implementations. Keep these boundaries in every UI change:

- No eyebrow labels above headings; headings name their own sections.
- Keep controls and reading positions stable through interaction; progressive disclosure grows
  below its trigger. Verify geometry at desktop and phone widths with long text.
- Never nest cards or confirmation boxes; confirm in the existing surface. Borders must mark
  a real grouping, independent action region, or floating surface.
- Preserve visible focus, accessible names and announcements, reduced-motion preferences,
  and WCAG 2.2 AA. State must have a non-color cue; never use opacity to convey it.
- Consume semantic design tokens, including in the editor, without literal fallbacks. Ordinary
  buttons share one silhouette and the three established emphasis tiers; pills are for categories.

### Cross-cutting invariants

These govern any new code, whichever subsystem it lands in. The subsystem docs carry the full
argument for each.

- **One diagnostic, one implementation.** The panel card and the editor popover share
  `src/lib/diagnostics/` from the meta line down; `diagnostic-parity.svelte.test.ts` compares
  them. That directory sits outside `src/lib/ui/` because the editor may not depend on the
  shell.
- **One predicate, one owner.** Where two rules or surfaces can answer the same question, one
  owns the predicate and the others import it (`isProseHeaderLine`, `isImmediateRepeat`,
  `canAssignVoiceGroup`, `headerSemanticKey`…). A locally re-derived copy presents as the
  workbench arguing with itself.
- **Every rule declares `settlesOn`** (default `line`), and there is exactly one deferral
  gate, `filterForEditorState`. A rule added at the wrong tier fails `typing-churn.test.ts`.
- **Every editor↔shell hook goes in `createCallbackProxy`** (`create-editor.ts`) — a missing
  callback looks exactly like a feature that silently does nothing.
- **A `DraftRecord` field is only as safe as the least careful place that rebuilds one.**
  Grep for the new field's siblings across every copier (`docs/subsystems/drafts.md` names
  them); `persistence.test.ts` round-trips every optional field.
- **Every transient surface dismisses on Escape, its own control, and an outside press** —
  use `dismissOnOutside` from `src/lib/interaction/dismiss.ts`, never a hand-rolled listener.
- **Nothing in the content flow that is not the lyrics.** Editor decorations that must not
  reach the clipboard are `Decoration.mark`s, never widgets — clean lyrics on the clipboard
  are this application's entire output.
- **Never offer an answer that cannot be carried out.** A control, a rate, or a source that
  will refuse when pressed does not draw (`availableRates`, `spotifyAvailable`,
  `appleMusicConfigured` are the pattern).
- **Color is never a state carrier, and neither is opacity.** Every state has a second cue
  (shape, fill-vs-none, `aria-pressed`); disabled uses the disabled tokens.
- **A claim is made once, where the reader is deciding; a command is offered once**, on its
  home surface.
- **Success is silent; refusal is loud on both channels.** Nothing draws while things go well
  (the save readout is the canon); a refusal that changes nothing on screen both toasts and
  announces (`report`).
- **Counts pinned in two suites move together.** The rule totals live in `engine.test.ts`
  _and_ the sitemap assertion in `e2e/lyriclint.spec.ts`, which no local command runs —
  `bunx playwright test -g "sitemap"` before calling it done. Adding a rule follows the
  checklist in `docs/subsystems/rules-catalog.md`, including `bun run assistant:corpus`.
- **Nothing a finger types into is smaller than 16px** — new fields inherit from the body or
  name `--font-size-editor` (`docs/subsystems/responsive.md`).

## Testing

Run the checks appropriate to the change. Do not write new tests for reversible, low-impact
changes that mirror the implementation. Once the relevant suite passes, broaden or repeat
testing only when new changes, failures, or unresolved concerns justify it.

Component behavior is covered by `vitest-browser-svelte` tests next to the component. When a
UI interaction changes, update the test to assert the new structure — including the absence of
the thing that was removed.

The renderer is `vitest-browser-svelte`, and nothing else mounts a component.
`render`, `rerender`, and `unmount` are asynchronous in renderer v3; await them, including
through shared setup helpers, before inspecting or interacting with the component.
`@testing-library/dom` is the query and event layer beside it, for tests whose assertions inspect real elements —
`within(view.container)` scoping in particular, which the browser locators have no equivalent
for. It is configured once in `vitest-setup-client.ts`, where `eventWrapper: flushSync` and an
`asyncWrapper` that awaits `tick()` teach it Svelte's flush boundaries. Adding a second component
renderer is the drift this split exists to prevent; adding a DOM query helper is not.

## Final responses

At the end of every turn, begin the final response by explaining what the user asked for, then
explain how it was solved. Include enough context that someone returning to the project among
many parallel projects can understand what is going on from the final response alone. Keep it
brief: short paragraphs, only the detail the return-reader needs, no stock phrases or summary
headers.

# Bro keep going

Before you stop, ask yourself "is there a next step that the user would want me to do?" if so, keep going jobs not finished.

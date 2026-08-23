# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` is a symlink to this file.

## Project

LyricLint is a SvelteKit (Svelte 5, runes) workbench for linting Genius lyric transcriptions.
Reference docs: `PRODUCT.md`, `DESIGN.md`, and `docs/`.

Adding entries to the guidance catalog behind `/guidelines/` — turning supplied screenshots or
pasted Genius guideline text into reviewed entries, registering sources with their authority
tier, and verifying annotation acceptance states — follows **`docs/guidelines.md`** exactly.

## Read the subsystem doc before touching its code

This repository documents decisions, not code. Each file in `docs/subsystems/` records, for
one area, the rules that hold there and — more importantly — the failures that taught them:
the tempting fix that was shipped and reverted, the API that looks right and is not, the edit
that silently ate a user's work. Most of the bugs you could introduce here have already been
introduced once, and the doc is where that is written down. The code will not warn you;
several of these failures looked exactly like working code and passed the suite.

So: **before editing a subsystem, read its doc** — the table below routes by what you are
touching, and the most load-bearing source files carry a `Decision record:` pointer to theirs
(a file without a pointer is not a file without a doc — the table is what routes). Each doc
opens with **The rules** (the current invariants, each naming its pinning test) and follows
with the **Decision record** (the full history — read it before arguing with a rule). Treat
the docs as authoritative the way `DESIGN.md` is. And when your change alters behavior a doc
describes, **update the doc in the same commit** — a doc that has drifted is worse than none,
because the next reader obeys it. `src/lib/subsystem-docs.test.ts` pins that every doc is
routed here and that every path a doc claims to govern exists.

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
| Section links, the mirror, the link picker, `Type only here`                                                                                                                        | `docs/subsystems/section-links.md`  |
| Clipboard copy/paste metadata, the audio drop, editor↔shell hooks (`createCallbackProxy`)                                                                                           | `docs/subsystems/editor.md`         |
| The landing page, generated shots and loops, the site palette and header, the wordmark, the favicon                                                                                 | `docs/subsystems/site.md`           |
| `/rules/`, `/guidelines/`, their search, `SectionSplit`                                                                                                                             | `docs/subsystems/reference.md`      |
| Phone/touch behavior, `responsive.css`, the touch notice                                                                                                                            | `docs/subsystems/responsive.md`     |
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

`typescript` is 6 and `@typescript/native` is 7, aliased (`npm:typescript@7`). That is not a
half-finished migration — it is the arrangement svelte-check documents, and both halves are load
bearing.

TypeScript 7 is the native Go port, and the package no longer ships the JS compiler API: its `.`
export is `lib/version.cjs`, which carries `version` and `versionMajorMinor` and nothing else.
Everything that reads the compiler API off the name `typescript` therefore breaks on a naive bump —
**svelte-check** refuses to start, and **typescript-eslint** throws `does not support TS 7.0` before
a single file is linted. Two of the three commands above, from one version number.

So the name `typescript` stays on 6, where those two tools find the API they expect, and the Go
binary arrives under a second name that nothing else resolves. `bun run check` opts in with
`--tsgo`; `bun run lint` is untouched and never learns any of this happened. Measured here, that is
~9.9s to ~3.7s on `check`, with identical diagnostics — a planted error in a `.ts` file and in a
`.svelte` file are both still reported at the same line and column, and `check` still exits
non-zero.

Four things it depends on:

- **`--tsgo` writes transpiled Svelte to disk** (`.svelte-kit/.svelte-check`, ~1.1MB) and spawns the
  binary against an overlay tsconfig. That path is already inside the gitignored `.svelte-kit`, so
  it costs the repository nothing — but it is why the mode cannot simply be the default.
- **It reports a much smaller file count** — 75 against 1298 — and that is a reporting difference,
  not a coverage gap. Do not read the smaller number as the check having quietly stopped looking;
  the planted-error probes above are what actually establishes that, and they are the thing to
  re-run if this is ever doubted.
- **It inherits `--incremental`'s limitation**: a Svelte file outside the tsconfig's root dir is not
  properly type-checked. Every `.svelte` file here lives under `src/`, so the cost today is zero —
  and a Svelte file added anywhere else is what would silently change that.
- **Dependabot is told to skip both halves for the root package only**, and each for its own
  reason. `typescript` is held at major 6, because that bump always reconstructs the broken
  arrangement. `@typescript/native` is skipped outright, because **it is not a package on npm** —
  it is only the name the alias is installed under, so Dependabot's lookup 404s and the whole
  update run for this directory reports a failure while still opening everyone else's PRs. That
  cost one red run before it was noticed. The consequence is that **TS 7 does not update itself
  here**: bump it by hand alongside svelte-check, which is what decides the `--tsgo` flag anyway.
  `services/rules-assistant` carries neither hold and runs TS 7 as `typescript` directly, because
  it is plain `tsc` with neither svelte-check nor typescript-eslint in front of it — which is also
  the cleanest demonstration that the blocker is those two tools rather than the compiler.

The whole thing is a workaround with an expiry date. When svelte-check supports TS 7 without the
dual install, this collapses to one dependency and the `--tsgo` flag goes away.

## Git history

Prefer rebasing over merge commits when integrating branches. Rebase the topic branch onto the
current target branch, then use a fast-forward merge so history stays linear. Do not create a
merge commit unless the user explicitly requests one or rebasing would rewrite shared history.

### Undo your own hunks, never the file

**Do not run `git checkout -- <file>` (or `git restore <file>`) unless you have just checked that
the file contains no changes but your own.** It discards everything uncommitted in that file, and
work that was never staged is not recoverable — not from the reflog, not from a stash, not from
Vite's caches, which hold transforms in memory only and drop them the moment the watcher sees the
file change.

This working tree is normally carrying a large set of the user's own modified files, so any file
worth experimenting in is likely to already hold work that is not yours. Backing an experiment out
means inverting **your** edits: `Edit` them back, or reverse-apply your own hunks from `git diff`.
Where you know in advance that you are about to try something you may abandon, `git stash` the
file first and restore it after.

The cost of getting this wrong is not a rerun. It is somebody's unsaved afternoon, and the only
place it may still exist is their editor's undo buffer — so if it happens, say so immediately and
tell them to check that before you offer to rebuild anything from memory.

## UI rules

### Never use eyebrows

**NEVER EVER USE EYEBROWS.** Do not place a small label, kicker, category, or mono all-caps text
above a heading. Write a heading that names the section on its own.

### No cards inside cards

Never nest a card, panel, or bordered/filled box inside another one. If an action needs a
follow-up step, it happens **in place** in the existing surface — swap the control's label,
reveal a sibling control in the same row, or change the surface's own state. Do not open a
second bordered box inside the card the user is already looking at.

Concretely, for a two-step confirm:

- The trigger keeps its slot and changes its label (`Preview` → `Confirm`).
- The confirming control is the high-contrast CTA (`.button--contrast`, the theme-inverting
  white/black action).
- `Cancel` sits immediately to the right of it, quiet emphasis.
- Competing actions on the same surface (for example `Ignore this session`) are hidden while
  the confirm step is pending, so exactly one decision is on screen.
- Announce the pending state with a visually hidden `aria-live` region rather than a visible
  status box.

This applies to destructive confirms too: a warning reads as prose in the section it belongs to,
not as a tinted danger box that pops into existence.

Canonical implementations: `src/lib/ui/tools/PreferencesPanel.svelte` and
`src/lib/ui/layout/DraftMenu.svelte`.

### A card has to earn its border

A card is a boundary, and a boundary has to separate something from something. Before drawing
one, name the job: it groups items that repeat (a diagnostic among other diagnostics), it marks
a region the user acts on independently of its neighbors, or it lifts a surface above the page
(a popover, a menu). If none of those apply, the border is decoration — drop it and let the
content sit directly on the page background.

The tell is a card with nothing beside it. A single centered box on an otherwise empty page
separates its contents from nothing at all; it only adds a rectangle, an inset, and a second
background color for the reader to parse. Full-page messages — boot and error states — are prose on
the canvas: constrain the measure with `max-width`, center it, and stop there.

Canonical implementation: `.error-page` in `src/lib/ui/styles/overlays.css`.

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

### Design system

`DESIGN.md` is authoritative. Components consume semantic tokens from
`src/lib/ui/styles/tokens.css` — never literal colors, radii, spacing, or timings. All ordinary
buttons share one silhouette; emphasis changes through color, not shape. There is no pill-shaped
button variant — the legacy `.button--pill` hook has been removed, so do not reintroduce it. Pill
radii belong to categorical chips and badges only (`.tab-count`,
`.linter-panel__filter-chip`), never to an action button.

The severity on a diagnostic is no longer a chip at all. It was a filled badge holding a line of
its own above the message, which spent a whole line of a card's height saying one word — and it
had to be squared off to keep from reading as one of the pressable severity filters directly
above it. It is a **colored glyph** now (`.severity`, no fill, no border, no radius), and it leads
the card's meta line ahead of the line number: `⚠ Line 47 · Use song part headers`. Severity is one
more fact about the finding, so it sits with where the finding is and what says so, and the color
is the text's own color, which is why the shape question stops arising.

**The word went because it was the same word every row.** A panel of nine findings printed
`Suggestion` eight times, in one blue, down one column — repetition that never varies stops being
read by the second row, and what the eye was actually using was the shape and the color. Dropping
it also gives the column a left rail of glyphs to scan instead of a ragged mix of `⚠ Warning ·` and
`ⓘ Suggestion ·`, and buys back width in a panel where a long rule name already runs to the edge.
Three things hold it up, and removing any one of them puts severity back on color alone:

- **The four glyphs separate at 12px in greyscale.** `SeverityIcon.svelte` owns them, and
  `SeverityIcon.svelte.test.ts` asserts no two severities draw the same outline. Error used to be
  `!` in a circle and suggestion `i` in one — the same ring with the bar and the dot swapped, which
  is a coin flip at this size — so error is a cross now: `✕`, `!`, `i`, `✓` in four different marks.
- **The word is still in the accessible tree**, `sr-only` inside the tag, and in its `title` for
  the pointer. Nothing about the change is visual-only in the sense that costs a screen reader.
- **The filter chip wears the same mark** (`LinterPanel.svelte`), because the row's word was half
  of what tied `Suggestions` to the rows it hides; without the glyph on both, the tie is color.

`SeverityTag.svelte` therefore takes `labelled`, and **the rule reference keeps the word**
(`/rules` and `/rules/[rule]`). Nothing repeats there the way it does in the panel, the reader may
never have opened the workbench, and a severity in a document is a fact to be read rather than a
mark to be scanned.

Three button tiers, and no more: `.button--quiet` (borderless) < `.button` (bordered default) <
`.button--contrast` (theme-inverting, one per surface). `.button--primary` is gone — an
accent-filled button competed with the contrast tier for the same job. Pick the tier from what
the action _is_, not from which panel it landed in; if a command appears twice, only its home
surface gets the contrast tier.

**A control that draws no fill draws no inset.** A quiet button's inline padding is invisible
until the pointer arrives, so a quiet button standing alone in a column of prose starts a few
pixels right of every paragraph edge around it and reads as a misalignment rather than as
something deliberate — which is exactly how `Delete all local data…` sat under its own paragraph
in the tools panel. `.button--flush` cancels the inset with a negative inline margin, so the label
lines up with the text and the hover fill keeps its padding. It is for a quiet button whose edge
is read against text; inside a row of controls the gap _is_ the alignment and this would close it.
The other way out is to give the control a real background — but a permanently filled red trigger
for an action that already arms a `.button--danger` confirm would put two red buttons in one
section, so flush is the default answer.

**The editor is part of the design system.** CodeMirror styles live in CSS-in-JS
(`create-editor.ts` and `src/lib/editor/extensions/*.ts`) where the stylesheet cannot reach them,
so they must reference tokens directly and must not carry literal fallbacks — a fallback is a
second palette waiting to drift, and one of them (`--ll-focus`) was live for months because the
variable it guarded never existed. `editor-token-policy.test.ts` enforces this.

**Opacity is never a state carrier.** No `opacity` for disabled, excluded, empty, or de-emphasized
anything. Use `--color-text-disabled` / `--color-control-disabled` / `--color-border-disabled`, or
an opaque muted color, plus a non-color cue. Opacity stacks, drops contrast below AA, and dims the
focus ring along with the label.

Component tests load `global.css` through `vitest-setup-client.ts`, so a computed-style assertion
sees the real tokens. Do not reintroduce literal fallbacks to make a test pass.

## Testing

Component behavior is covered by `vitest-browser-svelte` tests next to the component. When a
UI interaction changes, update the test to assert the new structure — including the absence of
the thing that was removed.

The renderer is `vitest-browser-svelte`, and nothing else mounts a component. `@testing-library/dom`
is the query and event layer beside it, for tests whose assertions inspect real elements —
`within(view.container)` scoping in particular, which the browser locators have no equivalent
for. It is configured once in `vitest-setup-client.ts`, where `eventWrapper: flushSync` and an
`asyncWrapper` that awaits `tick()` teach it Svelte's flush boundaries. Adding a second component
renderer is the drift this split exists to prevent; adding a DOM query helper is not.

## Final responses

At the end of every turn, begin the final response by explaining what the user asked for, then
explain how it was solved. Include enough context that someone returning to the project among
many parallel projects can understand what is going on from the final response alone.

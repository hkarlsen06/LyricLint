# UI implementation guidance

Consult the relevant patterns here alongside `../DESIGN.md` when changing UI.
`../AGENTS.md` retains shared product, accessibility, token, and data-safety contracts.
The examples explain current implementations; they do not expand an unrelated task.

### Never use eyebrows

**NEVER EVER USE EYEBROWS.** Do not place a small label, kicker, category, or mono all-caps text
above a heading. Write a heading that names the section on its own.

### Zero layout shifts

**Design toward zero layout shifts as the golden standard.** Selection, pending previews, status,
and cancellation keep existing controls and reading positions anchored. Reserve space using real
content and wrapping; keep action slots stable and swap labels/actions in place. Never insert a
warning or Cancel button above the user's current decision, and never substitute animation for
stable geometry. Intentional progressive disclosure grows below its trigger. Test interaction
geometry at desktop and phone widths, including long text. `DESIGN.md` defines the full rule.

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

### Design system

`DESIGN.md` is authoritative. Components consume semantic tokens from
`src/lib/ui/styles/tokens.css` — never literal colors, radii, spacing, or timings. All ordinary
buttons share one silhouette; emphasis changes through color, not shape. There is no pill-shaped
button variant — the legacy `.button--pill` hook has been removed, so do not reintroduce it. Pill
radii belong to categorical chips and badges only (`.tab-count`,
`.linter-panel__filter-chip`), never to an action button.

The severity on a diagnostic is a **colored glyph** (`.severity`, no fill, no border, no radius),
leading the card's meta line ahead of the line number: `⚠ Line 47 · Use song part headers`. No chip,
no word, no line of its own — repetition that never varies stops being read, and a chip reads as one
of the pressable severity filters directly above it.
Three things hold it up, and removing any one of them puts severity back on color alone:

- **The four glyphs separate at 12px in greyscale.** `SeverityIcon.svelte` owns them, and
  `SeverityIcon.svelte.test.ts` asserts no two severities draw the same outline: `✕`, `!`, `i`, `✓`.
- **The word is still in the accessible tree**, `sr-only` inside the tag, and in its `title` for
  the pointer.
- **The filter chip wears the same mark** (`LinterPanel.svelte`); without the glyph on both, the tie is color.

`SeverityTag.svelte` therefore takes `labelled`, and **the rule reference keeps the word**
(`/guidelines/checks/[rule]`).

Three button tiers, and no more: `.button--quiet` (borderless) < `.button` (bordered default) <
`.button--contrast` (theme-inverting, one per surface). `.button--primary` is gone — an
accent-filled button competed with the contrast tier for the same job. Pick the tier from what
the action _is_, not from which panel it landed in; if a command appears twice, only its home
surface gets the contrast tier.

**A control that draws no fill draws no inset.** A quiet button standing alone in prose
misaligns against the paragraph edges around it, so `.button--flush` cancels the inset with a
negative inline margin while keeping the hover padding. It is for an edge read against text;
inside a row of controls the gap _is_ the alignment. Flush is the default answer over a
permanently filled trigger.

**The editor is part of the design system.** CodeMirror styles live in CSS-in-JS
(`create-editor.ts` and `src/lib/editor/extensions/*.ts`), so they must reference tokens directly
with no literal fallbacks. `editor-token-policy.test.ts` enforces this.

**Opacity is never a state carrier.** No `opacity` for disabled, excluded, empty, or de-emphasized
anything. Use `--color-text-disabled` / `--color-control-disabled` / `--color-border-disabled`, or
an opaque muted color, plus a non-color cue. Opacity stacks, drops contrast below AA, and dims the
focus ring along with the label.

Component tests load `global.css` and the route styles through `vitest-setup-client.ts`, so a
computed-style assertion sees the real tokens and surface styles. Do not reintroduce literal
fallbacks to make a test pass.

# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` is a symlink to this file.

## Project

LyricLint is a SvelteKit (Svelte 5, runes) workbench for linting Genius lyric transcriptions.
Reference docs: `PRODUCT.md`, `DESIGN.md`, and `docs/`.

## Tooling

Use **bun**, never npm.

```bash
bun run check
bun run lint
bun run test:unit -- --run
```

## UI rules

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

Canonical implementations: `src/lib/ui/linter/DiagnosticDetails.svelte`,
`src/lib/editor/overlays/DiagnosticPopover.svelte`, `src/lib/ui/tools/ToolsPanel.svelte`, and
`src/lib/ui/layout/DraftMenu.svelte`.

### Design system

`DESIGN.md` is authoritative. Components consume semantic tokens from
`src/lib/ui/styles/tokens.css` — never literal colors, radii, spacing, or timings. All ordinary
buttons share one silhouette; emphasis changes through color, not shape. `.button--pill` is a
legacy compatibility hook, not a style to reach for in new markup.

## Testing

Component behavior is covered by `vitest-browser-svelte` tests next to the component. When a
UI interaction changes, update the test to assert the new structure — including the absence of
the thing that was removed.

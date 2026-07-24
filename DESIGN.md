# LyricLint Design System

## Design Direction

LyricLint is a precise editorial instrument for long transcription sessions. The interface uses a restrained, warm-neutral palette so source text remains primary, with color reserved for actions, diagnostics, and performer identity. It should feel dense, trustworthy, and native to expert workflows rather than decorative.

The dark theme is tuned for a transcriber working at a desktop in a dim room. The light theme supports daylight editing without turning the canvas into stark white.

## Token Source

The canonical implementation is `src/lib/ui/styles/tokens.css`. Components consume semantic custom properties instead of literal colors, dimensions, radii, or timings.

### Color

- Canvas and surface tokens establish hierarchy: `--color-canvas`, `--color-surface`, `--color-surface-subtle`, `--color-surface-strong`, and `--color-overlay`.
- Text and borders use `--color-text`, `--color-text-muted`, `--color-border`, and `--color-border-strong`.
- Controls use the `--color-control-*` family.
- Accent is reserved for primary action, selection, and current state.
- Error, warning, suggestion, success, and manual-review colors each have foreground and soft-surface roles.
- Every color is expressed in OKLCH. Pure black and pure white are intentionally absent.

### Typography

- UI: `--font-ui`
- Source and markup: `--font-mono`
- Fixed product scale: `--font-size-2xs` through `--font-size-xl`
- Line-height roles: tight headings, compact UI, body copy, and editor text
- Weight roles: regular, medium, semibold, bold, and heavy

Body text is `--font-size-md`; compact metadata is `--font-size-xs` or `--font-size-sm`. Prose explanations should remain below 70 characters per line where layout permits.

### Spacing and Shape

- Spacing follows the `--space-*` scale from 0.125rem to 3rem.
- Standard controls use `--radius-control`.
- Panels use `--radius-panel`; floating overlays use `--radius-overlay`.
- Pills are reserved for compact categorical chips and badges, not ordinary action buttons.
- Circular icon targets use `--radius-round`.

All ordinary buttons share the same control radius, height, padding, focus ring, disabled opacity, and state transition. A control may change emphasis through color or border, not through an unrelated silhouette.

### Interaction

- Standard control heights are small, medium, and large.
- Focus uses `--focus-ring-width`, `--focus-ring-offset`, and `--color-focus`.
- State transitions use 120 to 240 milliseconds and `--ease-out-quart`.
- Reduced-motion preferences suppress transitions and animations.
- Disabled controls retain legibility and use `--opacity-disabled`.

### Elevation and Layers

- Raised in-flow elements use `--shadow-raised`.
- Menus and anchored popovers use `--shadow-popover` or `--shadow-overlay`.
- Named layer tokens keep toolbars, panels, menus, pickers, diagnostics, and toasts predictable.

## Component Rules

- Ordinary actions use `.button`; icon-only actions use `.icon-button`.
- Primary actions add `.button--primary`; quiet actions add `.button--quiet`.
- `.button--pill` is limited to chips or unusually compact categorical actions.
- Inputs, selects, and textareas share control surface, border, height, radius, focus, hover, disabled, and error vocabulary.
- Diagnostic cards use severity colors only for labels and state emphasis. The source explanation remains neutral.
- Preview, apply, cancel, and ignore actions must use the same control geometry even when their emphasis differs.
- Performer identity must include text or markup cues in addition to color.

## Accessibility

The shell targets WCAG 2.2 AA. Focus is always visible, color is never the only carrier of state, touch targets grow at narrow breakpoints, and motion respects user preference. Exact lyric markup remains visible and is never replaced by decorative rendering.

# LyricLint Design System

## Design Direction

LyricLint is a precise editorial instrument for long transcription sessions. The interface uses a restrained, warm-neutral palette so source text remains primary, with color reserved for actions, diagnostics, and performer identity. It should feel dense, trustworthy, and native to expert workflows rather than decorative.

The dark theme is tuned for a transcriber working at a desktop in a dim room. The light theme supports daylight editing without turning the canvas into stark white.

## Token Source

The canonical implementation is `src/lib/ui/styles/tokens.css`. Components consume semantic custom properties instead of literal colors, dimensions, radii, or timings.

### Color

- Surfaces come in two families with different jobs, and the split is load-bearing.
  - **Elevation** is `--color-canvas` (recessed) and `--color-surface` (raised), plus `--color-overlay`. Two levels, deliberately. The light theme runs out of headroom just short of white, so anything above `--color-surface` earns its place with a shadow rather than more lightness.
  - **Fill** is `--color-fill-subtle` → `--color-fill` → `--color-fill-strong`, stepping from the surface _toward the text color_: darker in light, lighter in dark. Because the direction is perceptual rather than a lightness value, hover, selection, and emphasis read the same way in both themes. `--color-chrome` aliases the first step for flat bands like the toolbar and status bar.
  - A card or panel never takes a fill step deeper than `--color-fill-subtle`, so no card can cross its own canvas. Dropping a row to `--color-canvas` to mark it as recessed is the elevation family, not the fill ramp, and is allowed — that is what the recessed level is for.
  - The dark anchors are charcoal, not near-black. A canvas down at the bottom of the range compresses every level above it into the darkest fifth, which is how a tab strip and the list beneath it ended up reading as one unbroken black field. Surfaces also carry very little chroma, so a violet cast never competes with the diagnostics colored on top of them.
  - **Both schemes spend comparable tonal range, and the light one is the wider of the two on purpose.** Its whole ladder used to fit inside 6.3 points of lightness where dark spent 8.5, and the step carrying the most area on screen — a chrome band against the document beside it — was 2.8 points of that. The model was never wrong; the steps simply did not arrive, so every boundary in the window fell to its hairline and the workbench read as one white sheet ruled into boxes. The paper stayed put and the levels under it moved down, because there is no room above it. Light gets the wider steps because the eye adapts to the brightest thing in view, so a near-white grey separates less than the same delta does among the charcoals — and this is the scheme meant for a lit room.
  - **Light-mode shadows are not a garnish on the lightness step, they are the only cue above `--color-surface`** — which is why they used to be the weakest thing in the system, at 8%–18% against dark's 35%–55%, and are not any more. `--shadow-raised` is what a full-width row lifted out of a run of touching rows takes; it casts at both its top and bottom edges, because such a row is clipped left and right by its own column and a shadow below it alone reads as the row _beneath_ being lower.
  - **Recessed and raised are not fixed to a state — a state picks whichever one its scheme has a word for.** A selected diagnostic sinks in dark and lifts in light; see the linter section in `AGENTS.md` for why, and for the one surface (`.rules__index`) that stays recessed in both because its container clips an outer shadow.
- Every performer identity has a solid (`--performer-*`, the roster swatch, picker dot, and editor gutter segment) and a tint (`--performer-*-tint`, used for legend names and every voice on mixed lyric lines) on the same hue. Adjacent physical lines led by the same performer merge into one fully rounded gutter run; hovering any part of the run reveals its performer label. Hues stay fixed across themes; only lightness and chroma move.
- Text and borders use `--color-text`, `--color-text-muted`, `--color-border`, and `--color-border-strong`.
- Controls use the `--color-control-*` family.
- Accent is reserved for primary action, selection, and current state.
- Error, warning, suggestion, success, and manual-review colors each have foreground and soft-surface roles.
- Every color is expressed in OKLCH. Pure black and pure white are intentionally absent.

### Typography

- UI: `--font-ui` — IBM Plex Sans, shipped as a self-hosted variable face.
- Source and markup: `--font-mono` — IBM Plex Mono, shipped as self-hosted static weights, since no variable cut of Plex Mono exists.
- Fixed product scale: `--font-size-2xs` through `--font-size-xl`
- Line-height roles: tight headings, compact UI, body copy, and editor text
- Weight roles: regular, medium, semibold, bold, and heavy — but IBM Plex tops out at 700, so `--font-weight-heavy` (750) renders identically to bold. Treat the scale as four distinct faces and do not use heavy to mean "heavier than bold".

Both faces are self-hosted from `static/fonts` and declared in `src/lib/ui/styles/fonts.css`. The mono faces carry explicit `font-weight` _ranges_ rather than single values: with static weights and default CSS matching, 550 would resolve to the 600 face and 650 to the 700 face, silently collapsing medium, semibold, and bold into one another in the editor.

Body text is `--font-size-md`; compact metadata is `--font-size-xs` or `--font-size-sm`.

Line length is a token, not a per-component decision: `--measure-prose` (66ch) caps explanatory copy, `--measure-reference` (76ch) caps the rule reference's pages, and `--measure-editor` (96ch) caps both the CodeMirror surface and the mock editor so the two wrap at the same column. A measure cap belongs to the text, never to a box that also carries structure — a `max-width` on an element drawing a divider shortens the divider with it, so cap such an element with end padding instead and let its border box span the surface.

**The editor's measure is a runaway-line cap, not a reading measure**, which is why it is half again as wide as prose and does not follow the same reasoning. A wrap costs more in the editor than anywhere else in the product: the line number, the timestamp cell, the performer bar and the anchor all address a lyric line by sitting against one visual row, so a wrapped line draws one lyric line as two rows with a single number and a single timestamp cell beside the pair, and the gutters the anchoring design rests on start disagreeing with the document. At a prose-width 76ch that was happening to ordinary lines — a lead vocal with a parenthesized ad-lib after it runs to about 80 characters routinely — and because the cap is carried by end padding, the active-line wash went on running to the edge of a pane a third wider than the text, so the editor appeared to wrap with visible room to spare. The number is set where a line stops being a lyric and starts being a transcription error.

The rule reference's pages are `--measure-reference` rather than the editor's measure for the same reason read from the other side: they are pages of copy that happen to quote short reviewed examples, so following a lyric-line cap upwards would widen the prose around the samples without ever changing where a sample wraps.

### Spacing and Shape

- Spacing follows the `--space-*` scale from 0.125rem to 3rem.
- Standard controls use `--radius-control`.
- Panels use `--radius-panel`; floating overlays use `--radius-overlay`.
- Pills are reserved for compact categorical chips and badges, not ordinary action buttons.
- A label is not a chip. A diagnostic's severity is a colored glyph and a colored word on the card's meta line — no fill, no border, no radius — rather than a badge on a line of its own; it costs no vertical space and cannot be mistaken for the pressable severity filters above the list.
- A diagnostic states its facts on one line under the message: severity, line number, citation. Provenance is the link on that line, not a footer of block citations; the section cited and the verified date are the link's tooltip. One citation sits inline, two or more fold behind a `Sources` disclosure so the line stays one line.
- Circular icon targets use `--radius-round`.

All ordinary buttons share the same control radius, height, padding, focus ring, disabled treatment, and state transition. A control may change emphasis through color or border, not through an unrelated silhouette.

### Interaction

- Standard control heights are small, medium, and large.
- Focus uses `--focus-ring-width`, `--focus-ring-offset`, and `--color-focus`.
- State transitions use 120 to 240 milliseconds and `--ease-out-quart`. The cap is what it costs to answer an action: the result has to be settled before the user looks for it, and an overshoot past the target reads as the control missing and correcting. Nothing that reports state may reach past this.
- The brand lockup is the one exception, and it is one because it reports nothing: `--duration-brand` and `--ease-spring-out` exist for it alone. Its easing overshoots on purpose.
- Travel between rests — a whole surface pulled from one place to another, like the reference sections' column push — uses `--ease-in-out-cubic`. `--ease-out-quart` launches at full speed, which is right for a state answer and reads as thrown when the thing moving is a column rather than a control.
- Reduced-motion preferences suppress transitions and animations.
- Disabled controls recede through `--color-text-disabled`, `--color-control-disabled`, and `--color-border-disabled` — never through opacity.
- Every transient surface — picker, popover, menu — is dismissed three ways, and all three are required: `Escape`, its own closing control, and a pointer press outside it. The outside press is read on `pointerdown` and never moves focus: the press has already named where the user is going. Modal dialogs get the same behavior from their backdrop. The closing control covers an exit the user cannot see; a surface that closes itself on the pointer path — the hovered diagnostic popover, which ends when the pointer leaves — drops it rather than parking a second quiet button beside a consequential one.
- Opacity is never a state carrier anywhere in the system. It stacks, it drags contrast below AA, and it fades the border and focus ring along with the label. State that must be seen is carried by an opaque color plus a non-color cue (a strikethrough, a border style, an icon).

### Elevation and Layers

- Raised in-flow elements use `--shadow-raised`.
- Menus and anchored popovers use `--shadow-popover` or `--shadow-overlay`.
- Named layer tokens keep toolbars, panels, menus, pickers, diagnostics, and toasts predictable.

## Component Rules

- There are exactly three button tiers, keyed to the _action_ and never to the surface it happens to sit on:
  - `.button--quiet` — borderless text button, for reversible and secondary actions.
  - `.button` — bordered default, for ordinary actions. Icon-only actions use `.icon-button`.
  - `.button--contrast` — theme-inverting, for the one destination action per surface.
- `.button--danger` is a color modifier on the contrast tier and `.danger-text` on the quiet tier; neither is a fourth tier. There is no `.button--primary` — an accent-filled button duplicated the contrast tier's role, which is how one command ended up rendered two different ways on screen at once.
- One command gets one emphasis. If the same action appears on two surfaces, the surface that owns it takes the contrast tier and the other steps down to the default.
- There is no pill-shaped button variant; compact categorical elements are chips and badges, not buttons.
- Inputs, selects, and textareas share control surface, border, height, radius, focus, hover, disabled, and error vocabulary.
- Diagnostic cards use severity colors only for labels and state emphasis. The source explanation remains neutral.
- Every decision about a diagnostic — the fix, ignore, the guided actions, a popover's close — shares one control geometry and one type size, in one row, in one order. Emphasis is carried by the button tier alone.
- A proposed edit is shown in the document as a diff — outgoing text struck through in `--color-danger`, incoming text washed in `--color-suggestion` — rather than behind a preview step. The surface that shows it offers one control for the fix, labelled with the fix itself (`Replace with Don't`), never with a verb prefixed to a label that is already a command.
- A diagnostic looks the same wherever it is shown. The linter panel's card and the editor's popover render the same severity marker, action row, and provenance from the same components, stacked in the same order — message, meta line, reasoning; each adds only its own chrome.
- Performer identity must include text or markup cues in addition to color.

## Accessibility

The shell targets WCAG 2.2 AA. Focus is always visible, color is never the only carrier of state, touch targets grow at narrow breakpoints, and motion respects user preference. Exact lyric markup remains visible and is never replaced by decorative rendering.

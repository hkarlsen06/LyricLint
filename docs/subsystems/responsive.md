# Mobile workbench: writing, reviewing, and tools

Touches: `src/lib/ui/styles/responsive.css`, `src/lib/ui/styles/responsive-shared.css`,
`src/lib/ui/state/phone-layout.ts`,
`src/lib/ui/layout/Workspace.svelte`, `src/lib/ui/state/keyboard-inset.ts`, `src/app.html`

## The rules

- Phones open in Write, with the lyrics taking the available height. The labelled
  Write, Review (with the visible finding count), and Tools controls switch task views.
  The editor remains mounted; selection, undo history, and scroll position survive.
  Linking is a tool within Tools: deliberate editor or Review requests open its detail and
  focus its heading without opening the keyboard. Its comparison uses the panel scroll port.
  Linking line buttons return to Write and reveal the header, retaining linking choices and
  focusing the Write control instead of opening the typing keyboard.
  `e2e/mobile-workbench.spec.ts` pins the writing, tools, rotation, and recovery flow.
- `PHONE_WORKSPACE_QUERY` selects task views only on primary coarse pointers at or below
  `68rem`. It aliases the shared interaction query used by the editor. The matching CSS
  query must move with it. Fine-pointer windows retain the split, document commands, and
  explicit Expand editor control at every width. `DesktopWorkspace.svelte.test.ts` pins narrow
  mouse-driven windows; `MobileWorkspace.svelte.test.ts` uses real coarse-pointer task views. `Workspace.svelte.test.ts` pins expansion.
- Review opens the list with no automatic preview. Selecting a finding reveals the real
  editor above one decision surface, sharing the ordinary diagnostic implementation and
  diff. Tapping an editor underline or count badge opens the chosen finding in this same
  Review surface and transfers focus out of the editor; mobile diagnostic popovers and
  cluster menus stay closed. All findings returns to the list. `e2e/mobile-workbench.spec.ts` pins the fix flow.
- Revealing a saved ignored or accepted finding opens its passage in Write without restoring
  the finding or opening the typing keyboard. `MobileWorkspace.svelte.test.ts` pins the reveal,
  selection, retained choice, and focus on the Write control.
- Portrait and landscape both work. There is no orientation gate or desktop recommendation
  toast. `e2e/lyriclint.spec.ts` pins both orientations and the absence of the recommendation.
- Mobile document commands live behind the named Document disclosure; identity and Copy or
  Paste remain visible. Touch editing actions are named, and assignment uses the shared
  voice-group predicate. `MobileCommands.svelte.test.ts` pins bounds, dismissal, and selection.
- Frequent buttons, icon controls, and severity filters use `--control-height-touch` (44px)
  on touch screens at every width. Shared size floors outrank compact route styles even
  when those sheets load later. Nothing a finger types into is smaller than 16px. Preserve pinch zoom:
  `src/app.html` stays `width=device-width, initial-scale=1`. The reference search field
  has an explicit override because its class otherwise outranks the input selector. Workbench
  fields have a stronger workspace-scoped floor to beat component font shorthands, including
  the Assistant composer. Language search repeats the font floor in its component, where
  Svelte's scoped descendant selector otherwise outranks the shared rule.
- The media strip and visible YouTube frame have stable workspace lifetimes outside the
  editor and tool regions. Switching views never remounts playback. Audio discloses artwork
  and secondary timing controls in its own surface; active sync keeps its controls visible.
  `MediaStrip.svelte.test.ts` pins disclosure, target bounds, and playback focus behavior.
- The mobile workspace always fits the visual viewport's height and offset, including
  rotation with an already-open keyboard. Pinch zoom keeps the pre-zoom layout. Transport remains in flow. Write/Review/Tools hides while the keyboard is open and
  returns after dismissal; it never rides above the keys. This gives the editor or Assistant
  composer the remaining height. `MobileWorkspace.svelte.test.ts` pins hide and restore. Desktop keeps its existing floating transport behavior.
  `keyboard-inset.svelte.test.ts` pins measurement and cleanup; native keyboard behavior
  also needs simulator/device validation.

## Decision record

### Shared touch and motion rules stay available on every route

`responsive.css` now follows the workbench-only styles. The common button/input floors and
motion preferences live in `responsive-shared.css`, loaded by the root stylesheet, so opening
the guide or the assistant modal directly retains them. The finder's class-specific font-size
override follows its declarations in `site.css`. Moving these rules with the workspace would
silently shrink the guide's touch controls; their ownership follows the controls they protect.

The shared button size floors qualify their selectors with `:root`, because route styles load
after them. Equal-specificity compact classes otherwise shrink controls again: the Review bulk
action fell from 44px to 28px on a 1400px touch viewport, beyond the phone workspace override's
68rem ceiling. The narrow-window floor uses the same priority for fine pointers. These remain
minimum sizes, so controls with longer labels or larger destination treatments can still grow.

### Touch emulation stays inside its test file

Chromium can report `pointer: none` after `Emulation.setTouchEmulationEnabled` is
disabled, even though the page began with `pointer: fine`. Vitest's file isolation
recreates the tester iframe but reuses its containing browser page. A later desktop
test therefore inherits the wrong input mode: narrow toolbar wrapping disappears,
and desktop media and caret preconditions fail depending on file order. Waiting for
the media query cannot repair the retained state.

`phoneTestFiles` and `mixedInputTestFiles` in `vite.config.ts` exclude files changing
touch emulation from the shared desktop instance. Phone-only files explicitly enable
touch before every test and share a phone instance. Each mixed-input file gets its
own instance, so it begins with a fine pointer and no other file reuses its page.
Add new files using that CDP command to the appropriate list. Mixed desktop-to-touch
tests retain their real input transitions. Desktop assertions keep
requiring a fine pointer; they must not accept `none` to hide this leak. Cleanup still
disables touch emulation on failure. The full browser suite, including
`DesktopMedia.svelte.test.ts`, `DesktopWorkspace.svelte.test.ts`,
`Workspace.svelte.test.ts`, and `caret-layer.svelte.test.ts`, exercises the separation.

### Task views replace the permanent phone split

The earlier `3fr / 2fr` stacked layout made two independently scrolling regions share
whatever remained after the toolbar, player, and software keyboard. Expand editor helped,
but finding that glyph was a prerequisite to comfortable writing. The default phone view
now spends its space on the document, with visible navigation to Review and Tools.

Switches are explicit, never triggered by focusing the editor. They hide the inactive
region from layout and accessibility without destroying its state. Returning to Write
never opens the keyboard automatically. A selected tool is remembered when returning from
Write or Review. Desktop keeps its split and animated expansion at every width. Narrow mouse-driven windows
wrap the document toolbar and transport as before, without entering mobile task views.
YouTube always floats at the desktop editor’s bottom-right with a 16:9 frame
(about 356×200px), leaving the dock at full height. Both video and editor explicitly
name grid column 1: otherwise the video displaces the auto-placed lyrics into an
implicit second column when stacked. `DesktopMedia.svelte.test.ts` uses the real
editor to check lyric visibility and horizontal bounds as well as height.

### Review has a list and a decision

The list gives an overview without spending space on a default expanded finding. Opening
one changes the layout to show the actual lyric passage and a single finding's actions.
The list's shared ordering, preview, and focus logic still owns Previous, Next, fix, and
set-aside behavior. Other rows leave layout and the accessibility tree during the decision.
All findings restores the overview and releases the preview; Write restores the writing area.

Saved choices have no active decision card. Their location controls therefore reveal the
passage in Write, after the editor becomes visible, and return focus to the Write control.
Calling ordinary diagnostic navigation from the overview left the editor hidden and inert,
so the location appeared to do nothing. Revealing never restores the saved choice.

### Task navigation stays out of typing

The first mobile pass raised Write/Review/Tools above the keyboard along with the player.
That spent another control row on navigation during the interaction that needed the most
room and made the whole interface follow the keys. The keyboard flag now removes the
navigation from layout and accessibility until dismissal. The active task and editor
remain mounted; playback remains available for the listen/pause/type loop.

### The keyboard defines the usable window

Pinning only the player above the keyboard left the editor and tool composer sized against
space they could not use. The existing viewport tracker now publishes height and offset
alongside its bottom edge. Mobile always fits the whole workspace into that rectangle, so keyboard
opening allocates real layout space instead of covering the caret with a floating player.
This does not depend on the keyboard-detection flag: rotation may start with a keyboard
already open, with no full-height baseline to compare against. During pinch zoom the
layout keeps its last unzoomed geometry. Mobile positions the workspace with `top`, not
a transform, so its fixed editor pickers keep the viewport as their containing block. Safe-area insets are applied at the workspace edges and below navigation.

The tracker still uses visualViewport alone. `innerHeight - visualViewport.height` failed
on a real phone because engines disagree about layout-viewport resizing. Rotation resets
its baseline; polling while the keyboard is up catches system UI changes that fire no event.
Pinch zoom remains available. The existing small-drop threshold distinguishes browser chrome
from a keyboard; browser emulation cannot establish native keyboard correctness on its own.

### Both orientations are supported

The portrait-only gate was an answer to the permanent split's lack of landscape height.
Task views remove that premise, so the gate and its component are removed. The recommendation
to move to a laptop is removed too: a phone visitor starts with the document and the same
available capabilities. YouTube's visible 200px minimum still has to be respected; its
frame stays outside the hidden task regions rather than becoming a hidden audio player.
In short landscape layouts the frame sits beside the active task. In portrait with a
keyboard, if the frame and controls exhaust the viewport, the workspace may scroll to
retain a minimum writing area. This is the explicit exception to independent task scroll
ports; it preserves access to both the lyrics and the required visible player.

### Touch targets and labels follow the input

The toolbar has a compact phone arrangement; less frequent commands open in a single
unboxed disclosure. Section, Find, and applicable voice assignment are readable actions,
not desktop shortcuts a touch user has to discover through hover. The mobile tray takes
its own row, because full-sized labelled controls overlap the first lyric line if they
inherit the desktop overlay placement. Pointer presses preserve
the lyric selection before opening the existing pickers. Controls use semantic touch-size
tokens, while inputs and the document retain the 16px floor that prevents iOS focus zoom.

The reference pages, intermediate stacked layout, horizontal dock below `78rem`, and
Assistant's dedicated transcript scroll port keep their earlier ownership. The panel's
content wrapper must continue reaching the fitted Assistant pane through `:has()`; growing
that pane like ordinary prose pushes its composer out of reach.

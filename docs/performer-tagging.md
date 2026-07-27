# Performer tagging and section interaction

## Terminology

- **Performer:** one named vocalist or credited voice.
- **Voice group:** one or more performers singing the same selected passage together.
- **Differentiation:** a distinct voice group within one section.
- **Style slot:** the Genius HTML formatting associated with a differentiation.
- **Section:** a header plus lyric content until the next header or blank-line boundary.

A joint group counts as one differentiation. For example, `A`, `B`, and `A & B` are three distinct voice groups.

## Section creation

One Enter creates a lyric line. An empty line creates a section boundary.

When a blank line creates a headerless section, show a non-document ghost row above its first lyric line:

```text
+ Add section header
```

Activating it opens a searchable section picker:

- Results come from the draft's selected lyric language.
- Frequently used headers appear first.
- Numbered headers suggest the next ordinal, such as `Verse 2`.
- Custom header text remains available.
- Choosing a header inserts it as one undoable transaction.
- Dismissing the picker leaves the document unchanged.

Deleting a blank line never silently deletes a recognized header. Spacing problems become diagnostics.

## Performer roster

The right panel contains the draft roster.

Each performer has:

- Stable ID
- Display name used for export
- Normalized matching key
- Optional aliases
- Stable accessible color

Users can add, rename, merge, reorder, recolor later, or remove performers. A performer may remain in the roster after their last assignment is undone.

## Import extraction

When lyrics are pasted or imported:

1. Parse recognized section headers.
2. Extract performer legends from headers.
3. Correlate plain, italic, bold, and bold-italic header entries with matching inline styles.
4. Add exact performer names to the roster.
5. Preserve original spelling and markup for export.
6. Use normalized keys only for matching.

Never fuzzy-merge names automatically. Offer merge suggestions for casing or likely aliases.

Do not split every comma, ampersand, or word `and` blindly. Performer names may contain separators, and a joint voice group is semantically different from two independent performers.

If inline styling has no resolvable header mapping, preserve it and create `Unresolved voice 2`, `Unresolved voice 3`, or `Unresolved voice 4` with a diagnostic.

## Selecting and assigning performers

When a non-whitespace selection settles inside one section:

1. Show an anchored toolbar near the selection.
2. Display roster performer chips.
3. Toggling multiple chips creates one pending joint voice group.
4. Enter or Apply commits the group.
5. Escape cancels.
6. Focus returns to the editor after commit or cancel.

The permanent roster in the right panel exposes the same actions. Hover is never the only way to assign performers.

Preserve exact character selections so a performer can own part of a lyric line. Trim leading and trailing whitespace before generating tags.

For the MVP:

- One contiguous selection only.
- Selection must remain inside one section.
- A caret with no selection may offer the current lyric line as an explicit convenience.
- Cross-section and multiple-selection assignments are deferred.

Clicking the anchored toolbar must not destroy the editor selection.

## Style allocation

Genius source annotation [9250687](https://genius.com/9250687) defines four section-local differentiation slots:

| Slot | Header and lyric markup |
| --- | --- |
| 1 | No formatting |
| 2 | `<i>...</i>` |
| 3 | `<b>...</b>` |
| 4 | `<i><b>...</b></i>` |

The first slot is the performer with the most lines or the first chronologically. The fourth is the performer with the fewest lines or fourth chronologically.

Within a section, preserve assigned slots once established. Do not silently recalculate all formatting after each edit.

The header serializes individual voice groups with commas and an ampersand before the last group. A joint group uses an ampersand inside one style slot.

```html
[Chorus: A, <i>B</i>, <b>A & B</b> & <i><b>C</b></i>]
```

Applying a group to selected text must:

- Update or insert the section-header legend.
- Wrap or replace exactly the selected lyric range.
- Merge adjacent equivalent spans.
- Avoid wrapping surrounding whitespace.
- Form one undoable transaction.

## More than four voice groups

Attempting to create a fifth differentiation must never silently strip existing markup.

The four-slot format cannot represent a fifth distinct style. Genius annotation 9250687 says to omit vocalist names when there are too many vocalists to format a section concisely. It gives an explicit more-than-four threshold for multiple vocal samples, but does not define one universal numeric threshold for every song. LyricLint should explain that distinction rather than claiming Genius always mandates removal at exactly five.

Block the assignment and offer:

- Merge the pending group with an existing voice group.
- Split the content into another section.
- Explicitly remove vocal differentiation from the section.
- Cancel.

Imported documents with more than four groups are preserved and warned on, not normalized destructively.

The Genius source says that when too many vocalists prevent concise formatting, names should be omitted from the header and identification moved to an annotation. LyricLint can explain this but cannot create the Genius annotation in the MVP.

## Visual performer highlighting

Inline highlighting is a view decoration and never changes exported text.

- Single performers use their stable tint.
- Joint groups use a segmented combination of member colors.
- Large groups cap visible segments and show a `+N` label.
- Hover, focus, and the section legend expose names.
- Color is never the only identifier.
- Highlighting remains behind text and lint indicators.

The copy action always copies the literal Genius markup.

## Lint presentation

Do not permanently place large bubbles over lyric text.

Use:

- A range highlight or squiggle.
- A compact positioned badge.
- A popover on hover, focus, or activation.
- A complete mirrored entry in the right-panel linter.

When badges overlap on the same line, collapse them into one severity-marked count. Expanding the count lists diagnostics in this order:

1. Errors
2. Warnings
3. Suggestions
4. Manual review

Every popover includes:

- Concise problem statement
- Explanation
- Safe fix, when available
- Exact Genius source title and URL
- Last-verified date
- Ignore rule for this session

If a source becomes unavailable, retain the cached citation metadata and diagnostic.

## Ignoring diagnostics

`Ignore for this session` stores the draft ID and one diagnostic fingerprint in `sessionStorage`.

- It survives reload in the same tab.
- It does not persist into a new browser session.
- The right panel shows the number of ignored diagnostics.
- Users can inspect and restore ignored diagnostics.
- A toast offers immediate undo.
- Ignore state is not part of editor undo.
- Fingerprints include nearby text so unrelated edits can shift offsets without restoring the finding.
- Workspace backups include ignored diagnostic fingerprints.

## Keyboard behavior

Proposed defaults, subject to platform-conflict testing:

| Action | Shortcut |
| --- | --- |
| Assign performers | `Alt+P` |
| Insert section header | `Ctrl/Cmd+Shift+H` |
| Next diagnostic | `F2` |
| Previous diagnostic | `Shift+F2` |
| Open available fixes | `Ctrl/Cmd+.` |

Inside the performer picker:

- Arrow keys move.
- Space toggles a performer.
- Enter applies.
- Escape cancels.

Suppress selection popovers during IME composition and debounce linting until composition completes.

## Required edge-case tests

- Partial word and partial line selections
- Whitespace-only selection
- Existing mixed performer styles
- Malformed, nested, and unsupported HTML
- Adjacent equivalent spans
- Duplicate or differently cased performer names
- Names containing commas, ampersands, brackets, or HTML characters
- Joint voice groups
- Headerless sections
- Stale names in headers
- Fifth voice group
- Imported documents with more than four groups
- Cross-section selection
- Deleting section boundaries
- Undo and redo after autosave
- RTL, combining marks, emoji, and IME composition
- Selection toolbar near viewport edges
- Copying while markup is decorated

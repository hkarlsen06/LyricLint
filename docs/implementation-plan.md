I reviewed all seven requested files completely. References below use:

- **P** — [PRODUCT.md](/Users/hjalmarkarlsen/Repositories/LyricLint_for_Genius/PRODUCT.md)
- **A** — [docs/architecture.md](/Users/hjalmarkarlsen/Repositories/LyricLint_for_Genius/docs/architecture.md)
- **R** — [docs/rules.md](./rules.md)
- **T** — [docs/performer-tagging.md](/Users/hjalmarkarlsen/Repositories/LyricLint_for_Genius/docs/performer-tagging.md)
- **L** — [docs/genius-language-source-inventory.md](/Users/hjalmarkarlsen/Repositories/LyricLint_for_Genius/docs/genius-language-source-inventory.md)
- **F** — [fixtures/lyrics/cases.json](/Users/hjalmarkarlsen/Repositories/LyricLint_for_Genius/fixtures/lyrics/cases.json)

## 1. Module map

### Proposed layout

```text
src/
├── app.html
├── service-worker.ts
├── lib/
│   ├── domain/
│   │   ├── text/
│   │   │   ├── ranges.ts
│   │   │   └── graphemes.ts
│   │   ├── document/
│   │   │   ├── types.ts
│   │   │   ├── edits.ts
│   │   │   └── derive.ts
│   │   ├── parser/
│   │   │   ├── index.ts
│   │   │   ├── lines.ts
│   │   │   ├── section-header.ts
│   │   │   └── voice-markup.ts
│   │   ├── performers/
│   │   │   ├── types.ts
│   │   │   ├── identity.ts
│   │   │   ├── import.ts
│   │   │   ├── allocation.ts
│   │   │   └── transform.ts
│   │   ├── serialization/
│   │   │   ├── genius-markup.ts
│   │   │   └── export-validation.ts
│   │   ├── rules/
│   │   │   ├── types.ts
│   │   │   ├── engine.ts
│   │   │   ├── registry.ts
│   │   │   ├── catalog/
│   │   │   │   └── <one file per MVP rule>.ts
│   │   │   └── data/
│   │   │       ├── sources.ts
│   │   │       ├── spelling.ts
│   │   │       └── rule-set.ts
│   │   └── languages/
│   │       ├── types.ts
│   │       ├── inventory.ts
│   │       ├── en.ts
│   │       ├── no.ts
│   │       └── registry.ts
│   ├── persistence/
│   │   ├── types.ts
│   │   ├── database.ts
│   │   ├── draft-repository.ts
│   │   ├── autosave.ts
│   │   ├── recovery.ts
│   │   └── session-ignores.ts
│   ├── editor/
│   │   ├── contracts.ts
│   │   ├── EditorPane.svelte
│   │   ├── create-editor.ts
│   │   ├── transaction-adapter.ts
│   │   ├── keymap.ts
│   │   ├── extensions/
│   │   │   ├── lint-decorations.ts
│   │   │   ├── performer-decorations.ts
│   │   │   ├── section-ghosts.ts
│   │   │   ├── selection-anchor.ts
│   │   │   └── update-bridge.ts
│   │   └── overlays/
│   │       ├── PerformerPicker.svelte
│   │       ├── SectionPicker.svelte
│   │       └── DiagnosticPopover.svelte
│   ├── ui/
│   │   ├── state/
│   │   │   └── workbench.svelte.ts
│   │   ├── layout/
│   │   │   ├── Workspace.svelte
│   │   │   ├── DocumentToolbar.svelte
│   │   │   ├── DraftMenu.svelte
│   │   │   └── RightPanel.svelte
│   │   ├── linter/
│   │   │   ├── LinterPanel.svelte
│   │   │   ├── DiagnosticList.svelte
│   │   │   ├── DiagnosticDetails.svelte
│   │   │   └── IgnoredRules.svelte
│   │   ├── performers/
│   │   │   ├── PerformersPanel.svelte
│   │   │   ├── PerformerRoster.svelte
│   │   │   ├── PerformerEditor.svelte
│   │   │   └── PerformerLegend.svelte
│   │   ├── tools/
│   │   │   └── ToolsPanel.svelte
│   │   ├── primitives/
│   │   │   ├── LiveRegion.svelte
│   │   │   ├── ToastRegion.svelte
│   │   │   └── SourceLink.svelte
│   │   └── clipboard.ts
│   └── styles/
│       ├── tokens.css
│       └── global.css
└── routes/
    ├── +layout.ts
    ├── +layout.svelte
    ├── +page.svelte
    └── +error.svelte
```

### Framework-independent foundation

| Module | Public API |
|---|---|
| `domain/text/ranges.ts` | `Offset`, `TextRange`, `SerializedSelection`, `isValidRange`, `intersects`, `containsRange`, `trimWhitespaceRange`, `mapRangeThroughEdits`; all offsets are UTF-16 code-unit indexes and all ranges are half-open `[from, to)`. |
| `domain/text/graphemes.ts` | `isGraphemeBoundary`, `expandToGraphemeBoundaries`, `segmentGraphemes`; uses `Intl.Segmenter` so transforms never split combining sequences, emoji, or joined graphemes. |
| `domain/document/types.ts` | `ParsedDocument`, `SyntaxDocument`, `Section`, `SectionHeader`, `LyricLine`, `VoiceGroup`, `VoiceSpan`, `ParseIssue`, `LineEndingKind`. |
| `domain/document/edits.ts` | `TextEdit`, `AtomicDocumentEdit`, `validateEditSet`, `applyTextEdits`; edit sets are non-overlapping, refer to one base revision, and are applied atomically. |
| `domain/document/derive.ts` | `buildParsedDocument(syntax, context)` and `findSectionAtOffset(document, offset)`; resolves syntax against language and roster context without changing source text. |
| `domain/parser/index.ts` | `parseSyntax(text)` and `parseDocument(text, context)`; always returns a recoverable model and issues rather than rejecting malformed input. |
| `domain/parser/lines.ts` | `scanLines(text)` and `partitionSections(lines)`; preserves LF/CRLF exactly and treats recognized headers and blank lines as section boundaries. |
| `domain/parser/section-header.ts` | `parseSectionHeader(range, text)`; returns raw header ranges, semantic part text, ordinal, raw legend entries, and bracket issues. |
| `domain/parser/voice-markup.ts` | `scanVoiceMarkup(range, text)`; recognizes only plain, `<i>`, `<b>`, and canonical `<i><b>…</b></i>` slots while preserving malformed or unsupported markup as raw text. |

The parser must never use a browser DOM, `innerHTML`, or HTML normalization. Parsing an unchanged document must not create a rewritten serialization; the original string remains canonical.

### Performer domain and serialization

| Module | Public API |
|---|---|
| `performers/types.ts` | `PerformerRecord`, `PerformerId`, `PerformerColorId`, `VoiceGroupKey`, `ImportExtraction`, `ImportSuggestion`, `AssignmentRequest`, `AssignmentResult`, `AssignmentBlockReason`. |
| `performers/identity.ts` | `normalizePerformerKey`, `makeVoiceGroupKey`, `findExactPerformer`, `suggestPerformerMatches`; normalization is for matching only and never rewrites display names. |
| `performers/import.ts` | `extractPerformers(syntax, knownRoster)`; correlates styled header groups and inline spans, returns roster additions, unresolved voices, and non-destructive merge suggestions. |
| `performers/allocation.ts` | `allocateStyleSlot(section, groupKey)` and `analyzeSlotOrder(section)`; preserves established section-local slots and reports an unavailable fifth slot without editing. |
| `performers/transform.ts` | `assignVoiceGroup(request)`, `insertSectionHeader(request)`, `removeDifferentiation(request)`; each successful operation returns one `AtomicDocumentEdit`, including the mapped semantic selection. |
| `serialization/genius-markup.ts` | `serializeLegend`, `wrapVoiceSpan`, `mergeEquivalentSpans`, `escapeLegendText`; generates only supported Genius markup and escapes performer text rather than treating it as HTML. |
| `serialization/export-validation.ts` | `validateExport(text, parsed)` and `prepareCanonicalCopy(text, parsed)`; validates supported markup without sanitizing or mutating the canonical document. |

`PerformerRecord` should be fixed as:

- `id`: opaque stable UUID.
- `displayName`: exact user-visible/export name.
- `normalizedKey`: matching key only.
- `aliases`: explicit user-approved aliases.
- `colorId`: stable palette identifier stored with the draft.
- `order`: roster/display order.

Automatic identity resolution should require an exact display-name or approved-alias match. Case-folded or similar normalized keys produce merge suggestions, not silent merges. The normalization routine must not remove accents, punctuation, commas, ampersands, brackets, or HTML-significant characters.

### Rule engine, rule data, and language packs

| Module | Public API |
|---|---|
| `rules/types.ts` | `SourceReference`, `RuleDefinition`, `RuleContext`, `Diagnostic`, `DiagnosticFix`, `Fixability`, `RuleSetManifest`. |
| `rules/engine.ts` | `runRules(document, context, registry)`, `sortDiagnostics`, `collectSafeFixes`; ignores are filtered outside the engine, and only `safe` fixes enter bulk fixing. |
| `rules/registry.ts` | `enabledRules`, `getRule(id)`, `validateRuleRegistry`; rejects duplicate IDs and enabled rules lacking reviewed sources. |
| `rules/catalog/*.ts` | Each file exports one `RuleDefinition`; filenames mirror IDs, such as `syntax-unbalanced-brackets.ts`. |
| `rules/data/sources.ts` | `sourceRegistry`, `getSource(id)`, `assertReviewedSources`; contains canonical URLs, titles, sections, dates, hashes, and review state. |
| `rules/data/spelling.ts` | `standardizedSpellings`, `lookupSpellingCandidates`; data includes explicit context gates and exception predicates. |
| `rules/data/rule-set.ts` | `currentRuleSet`, `previousKnownGoodRuleSet`; exposes version and source snapshot metadata. |
| `languages/types.ts` | `LanguagePack`, `HeaderVocabulary`, `HeaderPolicy`, `LanguageInventoryEntry`; policy distinguishes localized, English-preferred, contextual, and unreviewed behavior. |
| `languages/inventory.ts` | `languageSourceInventory`; stores every language/annotation mapping from L without implying that it is a reviewed translation pack. |
| `languages/en.ts` | `englishLanguagePack`; reviewed English semantic headers backed by `G-LANG-EN`. |
| `languages/no.ts` | `norwegianLanguagePack`; reviewed Norwegian alternatives backed by `G-LANG-NO`. |
| `languages/registry.ts` | `getLanguagePack(tag)`, `resolveLanguageTag(tag)`, `canLintHeaderLanguage(pack)`; returns non-enforcing fallback packs for unreviewed languages. |

`SourceReference` should refine the architecture contract to include both retrieval and review dates:

```text
id, url, annotationId?, pageTitle, sectionTitle,
retrievedAt, lastVerifiedAt, contentHash?,
reviewStatus: reviewed | needs-review | retired
```

A `DiagnosticFix` has `kind: "safe" | "preview"`, a label, and one validated edit set. `Fixability: "safe" | "preview" | "none"` belongs to the rule definition.

### Persistence

| Module | Public API |
|---|---|
| `persistence/types.ts` | `DraftRecord`, `DraftSummary`, `DraftRepository`, `AutosaveSnapshot`, `AppMetadataRecord`. |
| `persistence/database.ts` | `LyricLintDatabase`, `openDatabase`, `closeDatabase`; Dexie schema/version declarations only, with no Svelte dependency. |
| `persistence/draft-repository.ts` | `createDraftRepository(db)` implementing `list`, `get`, `create`, `save`, `rename`, `duplicate`, `delete`, `deleteAll`, `setCurrent`, and `getCurrent`. |
| `persistence/autosave.ts` | `createAutosaveController(repository, options)` returning `schedule`, `flush`, `cancel`, `status`; writes are revision-ordered so an older async save cannot overwrite a newer snapshot. |
| `persistence/recovery.ts` | `recoverStartupDraft(repository)`; restores the current draft, otherwise the most recently updated recoverable draft, and creates a blank draft only if none exists. |
| `persistence/session-ignores.ts` | `createSessionIgnoreStore(storage)` with `isIgnored`, `ignore`, `restore`, `list`, and `clearDraft`; keys contain both draft ID and a diagnostic occurrence fingerprint. |

`DraftRecord` must match A, with `performers: PerformerRecord[]` and `editorSelection: SerializedSelection`. `originalText`, when present, is immutable import provenance. All dates are ISO strings.

### CodeMirror editor boundary

| Module | Public API |
|---|---|
| `editor/contracts.ts` | `EditorHandle`, `EditorSnapshot`, `EditorContext`, `EditorCallbacks`, `EditorAnchorRequest`; this is the sole bridge between the CodeMirror worker and shell worker. |
| `editor/EditorPane.svelte` | Props: initial text/selection, current context and callbacks; bindable `EditorHandle`; owns creation/destruction of the CodeMirror view. |
| `editor/create-editor.ts` | `createLyricEditor(host, options)`; browser-only and called exclusively during `onMount`. |
| `editor/transaction-adapter.ts` | `dispatchAtomicEdit(view, edit)`; converts one domain edit into exactly one CodeMirror transaction. |
| `editor/keymap.ts` | `lyricLintKeymap(callbacks)`; defines performer, section, diagnostic, and fix commands with platform-conflict overrides. |
| `editor/extensions/lint-decorations.ts` | `setDiagnosticsEffect`, `lintDecorationField`; squiggles, clustered badges, and current-range navigation. |
| `editor/extensions/performer-decorations.ts` | `setVoiceGroupsEffect`, `performerDecorationField`; view-only single/joint highlighting and accessible labels. |
| `editor/extensions/section-ghosts.ts` | `sectionGhostField`; creates non-document “Add section header” widgets for headerless sections. |
| `editor/extensions/selection-anchor.ts` | `selectionAnchorPlugin`; reports stable screen coordinates without changing the editor selection. |
| `editor/extensions/update-bridge.ts` | `createUpdateListener(callback)`; emits snapshots after committed transactions and suppresses lint/pickers during composition. |
| `editor/overlays/*.svelte` | Anchored accessible pickers/popovers; receive ranges and domain data, never own canonical text. |

The fixed editor contract should be:

- `EditorSnapshot`: `{ revision, text, selection, parsed, diagnostics, composing, canUndo, canRedo }`.
- `EditorHandle`: `focus`, `getSnapshot`, `dispatchAtomic`, `undo`, `redo`, `revealRange`, `setSelection`.
- `EditorCallbacks`: `onSnapshot`, `onAssignRequest`, `onSectionHeaderRequest`, `onDiagnosticActivate`, `onAnnouncement`.
- Every snapshot is internally consistent: its text, parsed model, diagnostics, and revision come from the same CodeMirror state.
- A stale lint result from another revision is discarded, never mapped heuristically onto current text.

### Svelte application UI

| Module | Public API |
|---|---|
| `ui/state/workbench.svelte.ts` | `createWorkbenchController(dependencies)`; owns active tab, filters, draft metadata, roster actions, ignore state, toasts, and editor orchestration without owning live document text. |
| `ui/layout/Workspace.svelte` | Two-region editor/right-panel layout with responsive panel collapse and a minimum readable editor width. |
| `ui/layout/DocumentToolbar.svelte` | Draft title, save state, undo/redo, section/performer commands, copy, and panel toggle. |
| `ui/layout/DraftMenu.svelte` | List, open, create, rename, duplicate, `.txt` export, delete, and delete-all commands. |
| `ui/layout/RightPanel.svelte` | Linter/Performers/Tools tabs and ignored-diagnostic count. |
| `ui/linter/*` | Complete diagnostic list, filtering, navigation, fixes, citations, ignore/restore, and mirrored details. |
| `ui/performers/*` | Roster add/rename/merge/reorder/recolor/remove and persistent textual section legend. |
| `ui/tools/ToolsPanel.svelte` | Canonical copy, draft export, rule-set/source information, and local-data controls. |
| `ui/primitives/LiveRegion.svelte` | Restrained announcements for applied fixes, copy, ignore/restore, save failures, and blocked assignments. |
| `ui/primitives/ToastRegion.svelte` | Toast actions for roster metadata and ignore-state undo; independent of CodeMirror undo. |
| `ui/primitives/SourceLink.svelte` | Safe external link with cached title, verification date, and `target="_blank" rel="noopener noreferrer"`. |
| `ui/clipboard.ts` | `copyCanonicalMarkup(text)`; copies the canonical string rather than DOM text. |
| `routes/+layout.ts` | Exports `prerender = true`; SSR remains enabled. |
| `routes/+layout.svelte` | Loads global tokens/styles and accessibility regions without touching browser-only APIs during SSR. |
| `routes/+page.svelte` | Creates the repository/workbench and renders the root workspace. |
| `routes/+error.svelte` | Offline-safe, lyric-free error presentation. |
| `service-worker.ts` | Precaches generated application assets so an already-installed app can reopen without the network. |

Roster-only changes receive toast undo. Renaming or merging roster metadata must not silently rewrite canonical markup. If the user chooses to update existing legends, that is a separately previewed atomic document edit.

## 2. Dependency order

### Phase 0: scaffold

One foundation owner creates:

- SvelteKit/Svelte 5 strict TypeScript scaffold.
- Static adapter and prerender configuration.
- SSR-safe browser boundaries.
- Vitest, Testing Library, Playwright, ESLint, and Prettier configuration.
- Global CSS tokens and test fixture loader.
- No worker should independently edit `package.json`, shared config, barrel exports, route roots, or fixture helpers after this handoff.

### Phase 1: shared foundation

Complete and contract-test these before starting the five workers:

1. UTF-16 range and grapheme utilities.
2. Document, performer, rule, persistence, language, and edit types.
3. Recoverable syntax parser.
4. `AtomicDocumentEdit` validation and application.
5. Rule/source/language interfaces.
6. Persistence repository interfaces.
7. `EditorSnapshot`/`EditorHandle` bridge.
8. Fixture loader and common test assertions.

The foundation parser should already prove:

- Exact text and CRLF preservation.
- Recoverable unbalanced headers.
- Supported and unsupported style recognition.
- Blank-line and recognized-header section boundaries.
- Correct half-open ranges on Unicode input.
- No DOM or Svelte imports in `src/lib/domain`.

### Interfaces that must be frozen before parallel work

1. **Offsets:** UTF-16 CodeMirror-compatible offsets, half-open ranges, exact unnormalized input. No worker may use byte, Unicode code-point, line/column, or grapheme indexes as document offsets.

2. **Atomic edits:**

   - One base revision.
   - Non-overlapping edits sorted by ascending `from`.
   - Every offset refers to pre-edit text.
   - Optional mapped `selectionAfter`.
   - Header and lyric edits for an assignment are one edit object and one CodeMirror dispatch.
   - Invalid or overlapping edit sets are rejected before dispatch.

3. **Parser result:** `ParsedDocument` contains the original `text`, sections, raw header/style ranges, resolved groups, lyric lines, and syntax issues. Raw syntax and resolved performer identity are separate fields.

4. **Performer identity:** stable opaque IDs; exact display names preserved; normalized keys never appear in exported text; no automatic fuzzy or case-only merge.

5. **Style identity:** a joint group key is based on its performer-ID set, while serialization order follows roster order. It consumes one slot.

6. **Rule provenance:** enabled `RuleDefinition.sourceIds` must resolve to reviewed `SourceReference` records. Language-dependent rules resolve source IDs through the selected reviewed pack.

7. **Diagnostics:** all diagnostic ranges refer to the same revision as the parsed document. Each has a deterministic ID within that revision, rule ID, severity, range, message, explanation, source IDs, and optional fixes.

8. **Fix safety:** only `kind: "safe"` fixes may enter bulk fixing. Preview fixes require explicit confirmation and are applied as one atomic edit.

9. **Editor bridge:** the shell consumes snapshots and invokes `EditorHandle`; it never imports CodeMirror state types or controls text reactively.

10. **Persistence:** repository and autosave accept serializable snapshots only. CodeMirror objects, parsed models, diagnostics, and DOM state are never stored in IndexedDB.

### Phase 2: five parallel workers

| Worker | Exclusive file ownership | Can proceed using |
|---|---|---|
| **(a) Rules + data** | `domain/rules/**`, `domain/languages/**` | Frozen parser/model/rule contracts and fixture loader. |
| **(b) Performer transforms** | `domain/performers/**`, `domain/serialization/**` | Frozen parser ranges, performer types, and atomic edit contract. |
| **(c) Persistence** | `persistence/**` | Frozen `DraftRecord`, repository, selection, and performer contracts. |
| **(d) CodeMirror editor UI** | `editor/**` | Frozen editor bridge, parser, diagnostics, atomic edits; stub rule output and transform results until integration. |
| **(e) App shell/right panel UI** | `ui/**`, `routes/**`, global styles | Frozen editor bridge and repository interfaces; mock editor snapshots and in-memory persistence until integration. |

Minimal-overlap rules:

- Worker (a) does not edit parser or common types.
- Worker (b) does not dispatch CodeMirror transactions.
- Worker (c) does not own UI save status or browser lifecycle listeners; it exposes them.
- Worker (d) does not own draft menus, permanent roster state, ignore state, or right-panel filtering.
- Worker (e) does not import CodeMirror packages or mutate text directly.
- Only the integration owner updates shared barrels/configuration after worker branches merge.

### Phase 3: integration order

1. Integrate rule engine into the editor update pipeline.
2. Integrate performer transform results through `dispatchAtomicEdit`.
3. Connect app roster/context changes to derived parsing and decorations.
4. Connect snapshots to revision-ordered autosave.
5. Connect visibility changes to `autosave.flush()`.
6. Connect diagnostics to inline decorations and the mirrored right panel.
7. Connect session ignores after diagnostics are generated.
8. Connect copy/export validation to canonical text.
9. Add service worker/offline verification.
10. Run all fixture, component, accessibility, persistence, and browser tests.

## 3. Risk register

| Risk | What a naive implementation gets wrong | Proof test |
|---|---|---|
| **1. Performer assignment atomicity** | Dispatches the header edit and selected-text wrapping separately, creating two undo steps, transient invalid lint state, or a lost selection. | Starting from `selection-transform-seed`, Apply produces the exact expected output in one transaction; one Undo restores the exact input and original semantic selection; one Redo reapplies both changes. |
| **2. Four-slot allocation stability** | Recounts lines after every change and reassigns slots, rewriting existing `<i>/<b>` markup when relative voice frequency changes. | Establish A=1, B=2, C=3; add more B lines and later D. Assert A/B/C retain slots and D receives 4. Undo/redo and reparsing preserve the mapping. Joint A&B consumes one slot. |
| **3. Fifth-group handling** | Reuses a slot, strips old markup, silently merges performers, or interprets the source as a universal five-performer ban. | Attempting a fifth distinct group returns `blocked: too-many-groups`, makes no edit, and presents merge/split/remove/cancel choices. `too-many-voice-groups` remains byte-for-byte unchanged and emits both expected warnings with qualified source copy. |
| **4. Non-fuzzy import extraction** | Splits every comma/ampersand/“and,” merges differently cased names, or rewrites imported spelling. | `performer-name-with-ampersand` resolves “Echo & The Glass” as one known performer. Separate tests cover names containing commas, brackets, `&`, and HTML characters; casing/alias candidates appear only as suggestions. |
| **5. IME, RTL, and grapheme safety** | Opens pickers mid-composition, lints incomplete text, splits combining marks or emoji, or positions ranges using visual order in RTL text. | Run compositionstart/update/end in Japanese: no picker or lint refresh before compositionend. Transform around the decomposed `Café` and emoji fixture without separating graphemes. Parse/copy the Arabic fixture exactly and navigate diagnostics by logical offsets. |
| **6. Offset-stable diagnostics** | Keeps diagnostics from an old revision, indexes CRLF as LF, or uses code-point indexes incompatible with CodeMirror. | Insert text before every diagnostic and assert the next snapshot contains only freshly computed ranges. CRLF, emoji, and combining-mark cases resolve exact substrings. Delayed results tagged with an old revision are discarded. |
| **7. Autosave and flush ordering** | Debounces indefinitely when hidden, allows a slower old write to overwrite a newer one, loses undo/redo state, or creates a blank draft despite a recoverable draft. | With fake timers and delayed repository writes: edit A, edit B, hide the page, flush, reload; B wins exactly, including CRLF/Unicode and latest selection. Undo/redo followed by hide/reload restores the post-undo/post-redo text. |
| **8. Session-scoped ignores** | Stores ignores in IndexedDB/localStorage, keys only by rule, puts them in editor undo, or cannot restore them. | Ignore a rule for draft A; reload the same tab and it remains hidden. Draft B is unaffected. A new sessionStorage instance shows it again. Toast undo and panel restore work, while CodeMirror Undo changes only text. |
| **9. Language policy exceptions** | Flattens all inventory entries into translation dictionaries, emits unreviewed claims, or flags English headers where a language prefers them. | English and Norwegian reviewed packs emit supported results, including Norwegian `Verse` warning. Unreviewed Arabic/custom headers remain preserved without a language claim. Japanese/Thai/Indonesian/Dutch are modeled as English-header policies but cannot emit until their individual source is reviewed. Korean, Czech/Slovak, Finnish, and German retain contextual policy types. |
| **10. Lossless round trip and untrusted markup** | Parses through the DOM, normalizes tags/line endings/entities, sanitizes canonical text, injects pasted HTML into UI, or copies rendered text. | Every fixture passes `parse → no edit → copy` exact-string equality. `autosave-recovery-unicode` preserves CRLF. `malformed-nested-html` and `<u>` remain unchanged but diagnosed. UI tests assert pasted markup renders as text/decorations, never executable HTML. Export validation reports unsupported markup without mutation. |

## 4. Acceptance checklist

### Application architecture and shell

- [ ] SvelteKit/Svelte 5, strict TypeScript, `adapter-static`, prerendered root route. SSR remains enabled. CodeMirror is created only during `onMount`. **[A §Decision, §Stack]**
- [ ] The workspace has a dominant editor region and Linter/Performers/Tools right panel. The panel collapses at narrower widths without shrinking the editor below a readable lyric column. **[A §Product layout]**
- [ ] CodeMirror alone owns live text, cursor/selections, undo/redo, viewport, decorations, and atomic transactions. Svelte receives snapshots, not a continuously controlled document value. **[A §State ownership—CodeMirror]**
- [ ] Svelte owns tabs, pickers, filters, draft metadata, toasts, accessibility announcements, and non-document undo. **[A §State ownership—Svelte]**
- [ ] Parsing and linting initially run synchronously on the main thread; no worker is introduced without profiling evidence. **[A §Editing pipeline]**
- [ ] Brand/UI remains a focused editorial tool: no Genius clone, AI-chat framing, decorative color noise, silent rewriting, or irrelevant IDE chrome. **[P §Brand Personality, §Anti-references]**

### Canonical text, parsing, serialization, and export

- [ ] Canonical state is one exact plain-text string containing literal Genius-compatible markup. **[P §Design Principles; A §Canonical document]**
- [ ] Parser recovers from malformed input and returns useful ranges/issues rather than rejecting the document. **[A §Canonical document]**
- [ ] Sections, recognized headers, lyric lines, voice spans, and syntax issues use exact half-open UTF-16 ranges. **[A §Canonical document; T §Required edge-case tests]**
- [ ] LF and CRLF are not normalized merely by parsing, saving, loading, or copying. **[F `autosave-recovery-unicode`]**
- [ ] Only plain, `<i>`, `<b>`, and canonical `<i><b>…</b></i>` performer styles are supported for generated output. Unsupported/malformed markup is preserved and diagnosed. **[A §Canonical document; T §Style allocation]**
- [ ] Unchanged parse/derive/render cycles never serialize the document or alter source spelling, whitespace, tag order, entities, bidi text, or Unicode normalization. **[T §Import extraction; F]**
- [ ] Raw lyric text is escaped outside CodeMirror and never passed to `innerHTML`. **[A §Canonical document, §Security and privacy]**
- [ ] Export validation allows only supported lyric markup but reports failures without modifying the source. **[A §Canonical document]**
- [ ] Copy returns the canonical markup string, never rendered DOM text or performer-highlight labels. **[A §Security and privacy; T §Visual performer highlighting]**

### Section editing

- [ ] Enter creates a lyric line; an empty line creates a section boundary. Recognized headers also remain section boundaries when adjacent spacing is malformed. **[T §Section creation]**
- [ ] Every headerless lyric section receives a non-document “+ Add section header” ghost row. **[T §Section creation]**
- [ ] Activating the ghost row opens a searchable picker using the selected language pack. Frequent headers lead; numbered headers suggest the next ordinal; custom text remains available. **[T §Section creation]**
- [ ] Choosing a header inserts it as one undoable transaction; dismissing changes nothing and returns focus predictably. **[T §Section creation]**
- [ ] Deleting a blank line never silently deletes a recognized header. Spacing anomalies remain visible as parser/product-safety issues rather than destructive normalization. **[T §Section creation]**
- [ ] `Ctrl/Cmd+Shift+H` opens section insertion, subject to platform-conflict testing and user overrides. **[T §Keyboard behavior]**

### Performer roster and import

- [ ] Each performer has a stable ID, exact display/export name, normalized matching key, aliases, stable accessible color, and roster order. **[T §Performer roster; A §Performer colors]**
- [ ] Users can add, rename, merge, reorder, recolor, and remove roster entries. **[T §Performer roster]**
- [ ] Roster-only operations use toast undo and are not part of CodeMirror undo. Undoing an assignment may leave the performer in the roster. **[A §Undo boundaries]**
- [ ] Import recognizes section legends and correlates plain/italic/bold/bold-italic header entries with matching inline spans. **[T §Import extraction]**
- [ ] Exact imported spelling and markup remain canonical. Normalized keys are never exported. **[T §Import extraction]**
- [ ] No automatic fuzzy merge occurs. Case/likely-alias similarities are suggestions requiring approval. **[T §Import extraction]**
- [ ] Commas, ampersands, brackets, the word “and,” and HTML-significant characters do not trigger blind name splitting or injection. **[T §Import extraction, §Required edge-case tests]**
- [ ] Unresolvable styled spans are preserved and represented as `Unresolved voice 2`, `3`, or `4`, with `performer.inline-mismatch`. **[T §Import extraction]**

### Performer selection, allocation, and transforms

- [ ] A settled, non-whitespace, contiguous selection inside one section can open the anchored picker without losing the CodeMirror selection. **[T §Selecting and assigning performers]**
- [ ] Leading/trailing whitespace is excluded from generated tags; partial-word and partial-line selections remain supported. Grapheme clusters are never split. **[T §Selecting and assigning performers, §Required edge-case tests]**
- [ ] Multiple selected chips represent one pending joint voice group. Apply/Enter commits; Escape cancels; focus returns to the editor. **[T §Selecting and assigning performers]**
- [ ] The right-panel roster exposes equivalent assignment actions; hover is never required. **[T §Selecting and assigning performers]**
- [ ] A caret-only convenience may explicitly select the current lyric line. Multiple selections and cross-section selections are rejected without edits. **[T §Selecting and assigning performers]**
- [ ] Slot mapping is exactly: 1 plain, 2 `<i>`, 3 `<b>`, 4 `<i><b>`. **[T §Style allocation]**
- [ ] Established section-local slots remain stable after later edits; they are not silently recalculated by line count. **[T §Style allocation]**
- [ ] A joint group consumes one differentiation slot. **[T §Terminology, §Style allocation]**
- [ ] Generated legends place commas between groups and an ampersand before the last group; member ampersands remain inside the group’s style slot. **[T §Style allocation]**
- [ ] Applying a group updates/inserts the legend, changes exactly the selected range, merges adjacent equivalent spans, excludes surrounding whitespace, preserves semantic selection, and forms one undoable edit. **[T §Style allocation; A §Undo boundaries]**
- [ ] Creating a fifth group is blocked with no source mutation and offers merge, split section, explicitly remove differentiation, or cancel. **[T §More than four voice groups]**
- [ ] Imported documents with more than four groups are preserved and warned, never normalized destructively. **[T §More than four voice groups]**
- [ ] Copy explains that the source discusses concise formatting and gives a specific more-than-four case for samples; it must not claim a universal five-performer ban. **[R §Language header data; T §More than four voice groups]**

### Performer highlighting

- [ ] Highlighting is a CodeMirror view decoration and never affects copied/exported text. **[T §Visual performer highlighting]**
- [ ] Single performers use their stable tint; joint groups use segmented member colors rather than averaged colors. **[A §Performer colors; T §Visual performer highlighting]**
- [ ] Large groups cap visible segments and show `+N`. Hover, focus, and persistent legends expose names. **[T §Visual performer highlighting]**
- [ ] Color is never the only identity cue. Lint marks remain distinguishable above performer highlighting in light and dark themes. **[A §Performer colors; T §Visual performer highlighting]**

### Rule catalog

The fixability classes below normalize the catalog into `safe`, `preview`, and `none`. “Safe” remains conditional where the source says only exact/unambiguous cases qualify.

| Rule ID | Default severity | Fixability | Required source IDs | Acceptance condition |
|---|---|---|---|---|
| `syntax.unbalanced-brackets` | Error | Safe only when the missing delimiter is unambiguous | `G-SECTIONS` + parser contract | Detect uneven header brackets while explaining that malformed syntax is partly a product-safety rule, not an explicit Genius catalog of malformed cases. |
| `syntax.unsupported-voice-markup` | Error | Preview | `G-SECTIONS` | Detect performer differentiation outside supported `<i>/<b>` combinations, including malformed nesting. |
| `section.header-missing` | Warning | Preview/user choice | `G-SECTIONS` | Detect a blank-line section containing lyrics without a header and offer the localized/custom picker. |
| `section.header-language` | Warning | Preview/confirmation | `G-SECTIONS` + selected reviewed language source (`G-LANG-EN` or `G-LANG-NO`) | Warn only when a recognized header conflicts with a reviewed selected pack; preserve custom/unreviewed headers. |
| `section.header-unrecognized` | Manual review | None | `G-SECTIONS` + reviewed language sources | Flag a bracketed name absent from every reviewed header catalog without guessing a replacement or changing custom text. |
| `performer.header-required` | Warning | Safe | `G-SECTIONS` | Detect inline differentiation in a multi-vocalist section without a performer legend and offer removal of the supported formatting wrappers. |
| `performer.style-order` | Warning | Preview | `G-SECTIONS` | Detect header groups that do not follow plain, italic, bold, bold-italic slot order. |
| `performer.inline-mismatch` | Warning | None | `G-SECTIONS` | Detect inline style with no resolvable legend group and offer guided performer assignment for the plain and styled voices. |
| `performer.too-many-groups` | Warning | None | `G-SECTIONS` | Detect more than four distinct style groups and explain options without asserting a universal performer ban. |
| `performer.line-label-forbidden` | Warning | Preview | `G-SECTIONS` | Detect names/symbols in brackets used to label individual lyric lines and offer removal of the inline label, leaving the lyric and any indentation intact. |
| `spelling.standardized` | Suggestion | Safe for context-free entries; selected meaning-sensitive entries use preview | `G-SPELLING` | Detect reviewed non-preferred forms only when context is sufficiently certain. |
| `spelling.language-variant` | Manual review | None | `G-SPELLING` | Identify inconsistent British/American variants relative to chosen performer language. |
| `quotes.typewriter` | Warning | Safe outside unsupported markup | `G-TYPEWRITER` | Detect curly apostrophes/quotation marks in lyric text and replace exact characters only. |
| `contraction.apostrophe` | Warning | Preview | `G-CONTRACTIONS` | Detect likely missing contraction apostrophes conservatively. |
| `unknown.marker` | Warning | Safe for exact known markers | `G-UNKNOWN` | Detect recognized nonstandard unknown markers such as `(?)` and offer `[?]`. |
| `repeat.placeholder` | Warning | None | `G-REPEATS` | Detect placeholders such as `[Chorus x2]` or “repeat chorus” used instead of lyrics. |
| `sound-effect.asterisks` | Warning | Preview | `G-SFX` | Detect likely sound effects using braces/unsupported wrappers. |
| `censored.mask` | Warning | Preview | `G-CENSORED` | Detect censored-word masks other than exactly four asterisks. |
| `adlib.parentheses` | Suggestion | Preview | `G-ADLIBS` | Conservatively identify likely ad-libs lacking parentheses or initial capitalization. |
| `capitalization.line-start` | Suggestion | Preview | `G-CAPS` | Detect lowercase lyric-line starts only when no known contextual exception applies. |
| `punctuation.line-ending` | Warning | Preview | `APPLE-LINE-PUNCTUATION` + `G-QE-MARKS` | Detect a comma or period at a lyric-line ending, including before closing quotes or parentheses. Exclude ellipses and describe the Apple/Genius provenance distinction. |
| `punctuation.question` | Suggestion | Preview or explanation | `G-QE-MARKS` | Detect only clearly interrogative lines lacking a question mark. |
| `punctuation.dropped-word-dash` | Warning | Preview | `G-DASHES` | Detect incorrect dropped-word dash forms and em dashes followed by commas. |
| `line.prose-density` | Suggestion | None | `G-LINES` | Flag likely prose-like multi-line content without imposing a fixed character limit. |
| `numbers.spell-out` | Suggestion | Preview | `G-NUMBERS` | Detect reviewed numeric cases only when no documented exception applies. |

For every rule:

- [ ] At least one valid, invalid, and ambiguous unit fixture exists. **[R §Policy, §Rule review checklist]**
- [ ] Every emitted diagnostic resolves all its source IDs to reviewed metadata. Registry validation fails tests/build otherwise. **[A §Rule engine; R §Policy]**
- [ ] Diagnostic explanations distinguish mechanical findings from contextual judgment. **[P §Design Principles]**
- [ ] Only safe fixes participate in bulk fixing. Preview fixes require explicit confirmation and one undoable transaction. **[A §Rule engine]**
- [ ] Rule and rule-set versions increment when behavior/data changes. The previous known-good snapshot remains shipped. **[A §Genius source ingestion; R §Rule review checklist]**

### Standardized spelling dataset

The shipped spelling data must include these policies exactly, with word boundaries, punctuation, case, markup exclusions, and contextual tests:

- `I'mma`, `Ima`, `Imma` → `I'ma`.
- `cause`, `cos`, `cuz` → `'cause`, except `cuz` meaning cousin.
- `ok`, `O.K.` → `okay`.
- American `til` → `'til`; British `till` remains valid.
- `trynna` → `tryna`; `aye`/`ay` → `ayy`; `hoe` → `ho`, except literal tool meaning.
- `tho` → `though`.
- `yah` → `ya` only for you/your; `yah` remains valid for yeah/yes.
- Curly `ya’ll` → `y'all`.
- `skrt` → `skrrt`.
- `Perk`/`Percy` → `Perc'` or `Perky` only for Percocet.
- `boujee`/`boujie` → `bougie`.
- `shawty` and `shorty` are both pronunciation-dependent.
- `lil`/`li'l` → `lil'`.
- `whoa` → `woah`; `dawg` → `dog`; `choppa` → `chopper`; `oughtta` → `oughta`.
- `naïve` → `naive`; `cliche` → `cliché`.
- `alright` and `all right` are both accepted.
- `AKA`, `AKAs`, `A.K.A`, `A.K.A.s` → `a.k.a.`/`a.k.a.s`, with `A.K.A.` at line start.
- Dotted GOAT/VIP variants → `GOAT`/`GOATs` and `VIP`/`VIPs`.
- `A.S.A.P.` → `ASAP`, except `A$AP` names.
- `CREAM`/`C.R.E.A.M.` → `cream` for money; keep `C.R.E.A.M.` for the Wu-Tang Clan song.
- `H.A.M.` → `HAM`. **[R §Standardized spelling data]**

### Language packs and source inventory

- [ ] English and Norwegian are the only reviewed localized MVP packs. **[R §Language header data]**
- [ ] English vocabulary covers Intro, Verse, Chorus, Refrain, Pre-Chorus, Post-Chorus, Bridge, Interlude, Instrumental, Outro. **[R §Language header data]**
- [ ] Norwegian covers Intro, Vers, Refreng (preferred over Chorus), Pre-Chorus, Post-Chorus, Bro (preferred over Bridge), Mellomspill, Instrumental, Outro. **[R §Language header data]**
- [ ] Missing translations never become blocking export errors. Custom headers remain intact. **[R §Language header data]**
- [ ] The full inventory retains the exact language/annotation-ID mappings from L as untrusted inventory metadata until individual review. **[L]**
- [ ] Japanese, Thai, Indonesian, and Dutch model English-header policy; Korean models original-versus-translation context; Czech/Slovak and Finnish model English/local alternatives; German models genre-dependent behavior. Unreviewed policies do not emit production claims. **[L §Known policy exceptions]**
- [ ] Arabic, Japanese, and other fallback languages can preserve and edit content without requiring a localized pack. **[P §Accessibility & Inclusion; F]**

### Source provenance and runtime behavior

- [ ] Reviewed source registry includes `G-ADD-SONGS`, `G-SPELLING`, `G-SECTIONS`, `G-LANG-HEADERS`, `G-LANG-PURPOSE`, `G-LANG-EN`, `G-LANG-NO`, `G-NUMBERS`, `G-QE-MARKS`, `G-DASHES`, `G-CAPS`, `G-UNKNOWN`, `G-CONTRACTIONS`, `G-TYPEWRITER`, `G-ADLIBS`, `G-REPEATS`, `G-LINES`, `G-SFX`, and `G-CENSORED`. **[R §Reviewed sources]**
- [ ] `G-QUOTES`, `G-SYMBOLS`, `G-AS-SPOKEN`, `G-NON-ENGLISH`, and `G-INSTRUMENTAL` remain `needs-review`; dependent candidate rules are disabled. **[R §Located sources awaiting body review, §Candidate rules]**
- [ ] Source metadata contains exact URL/annotation, title, paraphrased section, retrieval date, last-verified date, review status, and hash/ETag where available. **[A §Genius source ingestion; R §Policy]**
- [ ] No Genius page or undocumented API is scraped at runtime. No OAuth/client token is shipped. Editing and linting depend only on bundled reviewed data. **[A §Genius source ingestion]**
- [ ] Source links may fail offline without suppressing diagnostics; cached citation metadata remains visible. **[T §Lint presentation]**
- [ ] Any future source sync is maintainer-only, credentialed, creates a proposed diff, and cannot publish without human review. It is not part of MVP runtime. **[A §Future authorized sync]**

### Diagnostic presentation and ignores

- [ ] Inline presentation uses range marks/squiggles, compact badges, and activation popovers—not permanent large bubbles. **[T §Lint presentation]**
- [ ] Overlapping same-line badges collapse to a severity-marked count. Expanded order is errors, warnings, suggestions, manual review. **[T §Lint presentation]**
- [ ] Every popover shows problem, explanation, available safe/preview fix, exact source title/link, last-verified date, and session-ignore action. **[T §Lint presentation]**
- [ ] The right-panel linter mirrors every visible diagnostic and can navigate/focus the exact editor range. **[P §Accessibility & Inclusion; T §Lint presentation]**
- [ ] `F2`, `Shift+F2`, and `Ctrl/Cmd+.` navigate next, previous, and available fixes, subject to conflict testing. **[T §Keyboard behavior]**
- [ ] Ignores use `sessionStorage` keyed by draft ID and diagnostic occurrence, survive same-tab reload and unrelated offset shifts, expire in a new browser session, enter workspace backups, and never enter editor undo. **[A §Session state; T §Ignoring rules]**
- [ ] Ignored-diagnostic count, inspection, restore, and immediate toast undo are available. **[T §Ignoring rules]**

### Persistence, recovery, and offline operation

- [ ] IndexedDB/Dexie stores the exact `DraftRecord` fields from A, including optional original text and serialized selection. **[A §IndexedDB]**
- [ ] A short debounce follows committed document or metadata changes. The latest selection is captured in the pending snapshot. **[A §IndexedDB]**
- [ ] `visibilitychange` to hidden immediately flushes the newest pending snapshot. Revision ordering prevents stale writes from winning. **[A §IndexedDB]**
- [ ] Local editing never waits for a server response. No lyric content leaves the browser. **[A §IndexedDB, §Security and privacy]**
- [ ] Startup restores the current recoverable draft, otherwise the most recently updated draft, and creates a blank draft only if none is recoverable. **[A §IndexedDB]**
- [ ] Draft menu supports all saved drafts, creation, rename, duplication, exact UTF-8 text export, deletion, and explicit delete-all. **[A §IndexedDB, §Security and privacy]**
- [ ] Autosave after undo/redo persists the resulting canonical text without altering CodeMirror undo history. **[T §Required edge-case tests]**
- [ ] The static shell and cached assets reopen offline after installation; editing, linting, saving, and copy remain functional without Genius/network access. **[P §Product Purpose; A §Genius source ingestion]**
- [ ] IndexedDB failure/quota errors produce restrained, actionable status without claiming the draft is durable. No lyric text appears in error telemetry. **[P §Design Principles; A §Security and privacy]**

### Accessibility, Unicode, and responsive behavior

- [ ] All editing, assignment, section insertion, lint navigation, ignore/restore, roster, draft, and copy actions are keyboard operable. **[P §Accessibility & Inclusion]**
- [ ] Performer picker supports arrows, Space, Enter, and Escape; focus returns to the editor on apply/cancel. **[T §Keyboard behavior]**
- [ ] Focus is visibly styled and returns predictably after anchored overlays close. **[P §Accessibility & Inclusion]**
- [ ] Important state changes use restrained live regions without announcing every keystroke. **[P §Accessibility & Inclusion]**
- [ ] Reduced-motion preference disables decorative transitions. **[P §Accessibility & Inclusion]**
- [ ] RTL, CJK, emoji, combining marks, bidi text, and IME composition are preserved. Selection popovers and linting pause during IME composition. **[P §Accessibility & Inclusion; T §Keyboard behavior]**
- [ ] Anchored toolbars remain usable near every viewport edge and do not obscure the selected text unnecessarily. **[T §Required edge-case tests]**
- [ ] Application shell and custom interactions meet WCAG 2.2 AA. Bits UI is used only where its accessible primitive behavior is beneficial. **[P §Accessibility & Inclusion; A §Stack]**

### Security and privacy

- [ ] Pasted/imported content is always untrusted plain text. **[A §Security and privacy; fixture README]**
- [ ] External source links use safe new-tab attributes. **[A §Security and privacy]**
- [ ] Analytics, if ever enabled, cannot include lyrics, selections, performer names, draft titles, or source markup. **[A §Security and privacy]**
- [ ] Local data has an explicit delete-all action. **[A §Security and privacy]**
- [ ] Copy uses canonical markup rather than any rendered or highlighted DOM. **[A §Security and privacy]**

### Fixture acceptance

| Fixture ID | Must prove |
|---|---|
| `valid-single-performer` | Minimal English document parses cleanly with no diagnostics. |
| `missing-section-header` | A blank-line headerless lyric section emits only `section.header-missing` and receives a ghost-row insertion point. |
| `unbalanced-section-bracket` | Malformed header remains editable/recoverable and emits `syntax.unbalanced-brackets` at the correct range. |
| `valid-four-voice-slots` | All four supported style slots parse and correlate without warnings or source changes. |
| `valid-joint-voice-group` | “Avery & Blair” is one plain joint group and Casey is one italic group. |
| `too-many-voice-groups` | Imported five-group markup is preserved and emits exactly `performer.too-many-groups` plus `syntax.unsupported-voice-markup`. |
| `inline-style-without-legend` | Styled lyric without mapping emits `performer.header-required` and `performer.inline-mismatch`, creating an unresolved voice rather than dropping style. |
| `forbidden-line-labels` | Per-line bracketed performer names emit `performer.line-label-forbidden`. |
| `standardized-spelling-context-free` | `Imma` and American `til` trigger `spelling.standardized`; fixes respect word boundaries. |
| `standardized-spelling-contextual-cuz` | “cuz” meaning cousin is not replaced or diagnosed. |
| `american-british-variant` | British `till` is accepted without a spelling diagnostic. |
| `norwegian-valid-headers` | Reviewed `Vers`/`Refreng` parse without warnings. |
| `norwegian-english-header` | Recognized English `Verse` in Norwegian emits `section.header-language` with `G-LANG-NO`. |
| `rtl-arabic-document` | Arabic/bidi content, joint grouping, styles, ranges, save, and copy remain exact without an unreviewed language diagnostic. |
| `cjk-ime-content` | Japanese/CJK and full-width punctuation remain exact; `[Verse]` is accepted by fallback policy; IME tests use this text. |
| `emoji-and-combining-marks` | Decomposed `é` and emoji remain whole graphemes through selections, edits, persistence, and copy. |
| `performer-name-with-ampersand` | Exact known performer “Echo & The Glass” is not split into a joint group. |
| `malformed-nested-html` | Crossed style tags remain exact and emit `syntax.unsupported-voice-markup`; no DOM normalization occurs. |
| `selection-transform-seed` | Exact partial-line selection produces the exact expected header/body output as one transaction with single-step undo/redo. |
| `autosave-recovery-unicode` | IndexedDB snapshot, hidden flush, reload, export, and copy preserve apostrophe, accented name, `<i>` markup, spacing, and CRLF exactly. |

Additional required edge-case tests from T:

- [ ] Whitespace-only selections produce no picker/edit.
- [ ] Existing mixed styles are replaced only within the chosen range.
- [ ] Adjacent equivalent spans merge without changing their text.
- [ ] Duplicate and differently cased names produce suggestions, not automatic merges.
- [ ] Names containing commas, ampersands, brackets, or HTML characters remain safe and identifiable.
- [ ] Stale header names are diagnosed/resolved without source loss.
- [ ] Cross-section selections are blocked.
- [ ] Deleting boundaries preserves recognized headers.
- [ ] Undo/redo remains correct after autosave.
- [ ] Toolbar positioning works at viewport boundaries.

### Explicit MVP exclusions

No implementation should quietly add direct Genius editing, runtime scraping, accounts, cloud sync, collaboration, audio playback, browser-extension integration, hidden/WYSIWYM markup, mobile-first editing, or authorized guideline synchronization. **[P §Product Purpose; A §Deferred decisions]**

## 5. Pipeline

The finished `package.json` should expose exactly these core scripts:

| Script | Command | Purpose |
|---|---|---|
| `dev` | `vite dev` | Local SvelteKit development server. |
| `build` | `vite build` | Static adapter/prerender production build. |
| `preview` | `vite preview` | Serve the completed static build. |
| `test:unit` | `vitest run` | Domain, rule, transform, persistence, and Svelte component tests. |
| `test:e2e` | `npm run build && playwright test` | Build once, then run browser tests against production preview. |
| `lint` | `prettier --check . && eslint .` | Formatting verification and static lint. |
| `format` | `prettier --write .` | Apply repository formatting. |
| `check` | `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json` | Generate SvelteKit types and run strict Svelte/TypeScript checking. |
| `assistant:corpus` | `bun scripts/generate-rules-context.ts` | Regenerate the rules-assistant knowledge corpus from the reviewed data; parity tests fail while it is stale. |
| `assistant:test` | `cd services/rules-assistant && bun install --frozen-lockfile && bun run check && bun run test` | Type-check and test the answering Worker (validation, quotas, sessions, structured output). |

The rules-assistant Worker (`services/rules-assistant`) is its own package with its own
`wrangler.jsonc`, deployed separately from the Pages build; see `docs/architecture.md` for its
design and `services/rules-assistant/eval/` for the release-gate evaluation set.

`playwright.config.ts` should start `npm run preview -- --host 127.0.0.1` through `webServer`, use a fixed local port, and test Chromium at minimum. Firefox/WebKit should be added for the IME/selection/IndexedDB-sensitive release gate where CI capacity permits.

The CI-equivalent local definition-of-done sequence is:

```sh
npm ci
npm run check
npm run lint
npm run test:unit
npm run test:e2e
```

That sequence proves strict compilation, Svelte validity, formatting, linting, domain/component coverage, static prerendering, production startup, IndexedDB recovery, keyboard workflows, copy/export fidelity, offline behavior, and all fixture-driven browser paths.

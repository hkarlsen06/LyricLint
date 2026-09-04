# Architecture

## Status

Accepted initial direction, 2026-07-24.

## Decision

Build LyricLint as a statically generated SvelteKit application using Svelte 5, TypeScript, and CodeMirror 6.

The lyric document, parser, rules, transformations, and source metadata are framework-independent TypeScript. Svelte owns the product interface. CodeMirror owns editing state.

## Stack

| Concern | Choice |
| --- | --- |
| Application | SvelteKit and Svelte 5 |
| Language | TypeScript with strict checking |
| Deployment | `@sveltejs/adapter-static`, prerendered routes |
| Editor | CodeMirror 6, integrated directly |
| Local database | IndexedDB through Dexie |
| Accessible primitives | Bits UI, used selectively |
| Styling | Scoped Svelte CSS and global CSS custom properties |
| Unit tests | Vitest |
| Component tests | Vitest browser mode through `vitest-browser-svelte` |
| Browser tests | Playwright |

Do not disable SSR globally. Prerender the application shell and create the CodeMirror view during `onMount`.

## Product layout

The primary workspace uses two structural regions:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Document toolbar                                                        │
├───────────────────────────────────────────────┬─────────────────────────┤
│ Editor commands                                │ Panel tabs              │
├───────────────────────────────────────────────┤ Linter                  │
│                                               │ Performers              │
│ Lyrics editor                                 │ Song                    │
│                                               │ Preferences             │
│                                               │ Assistant (when enabled)│
│                                               │                         │
│ Inline marks, clustered badges,               │ Issue list, sources,    │
│ selection performer picker                    │ roster, ignored issues  │
│                                               │                         │
└───────────────────────────────────────────────┴─────────────────────────┘
```

The right panel can collapse on narrower screens. The editor is the primary surface and must not become narrower than a readable lyric column.

## State ownership

### CodeMirror

CodeMirror is authoritative during editing for:

- Document text
- Cursor and selections
- Undo and redo
- Viewport and scroll position
- Editor decorations
- Atomic document transactions

Do not bind the entire document as a continuously controlled Svelte value. Use an update listener to derive snapshots and relevant UI state.

### Svelte

Svelte owns:

- Active right-panel tab
- Performer picker state
- Current diagnostic filters
- Draft metadata
- Section-header picker state
- Toasts and non-document undo
- Accessibility announcements

### IndexedDB

Persist:

```ts
interface DraftRecord {
  id: string;
  title: string;
  text: string;
  originalText?: string;
  language: string;
  performers: PerformerRecord[];
  createdAt: string;
  updatedAt: string;
  ruleSetVersion: string;
  editorSelection?: SerializedSelection;
}
```

Autosave after committed editor transactions using a short debounce. Flush pending saves on `visibilitychange` when the document becomes hidden. Never wait for a server response before considering a local edit saved.

Opening the application creates a blank draft only when there is no current recoverable draft. A menu provides all saved drafts, creation, rename, duplicate, export, and deletion.

### Session state

Ignored diagnostics live in the `draftIgnores` IndexedDB table, keyed by draft
ID and occurrence fingerprint. They survive browser sessions, are removed with
their draft or by delete-all, and are included in workspace backups. Ignoring a
diagnostic is not part of CodeMirror undo history.

## Canonical document and derived model

The canonical document is a single plain-text string containing literal Genius-compatible markup.

```ts
interface ParsedDocument {
  sections: Section[];
  syntaxIssues: ParseIssue[];
}

interface Section {
  from: number;
  to: number;
  header?: SectionHeader;
  language: string;
  voiceGroups: VoiceGroup[];
  lines: LyricLine[];
}

interface VoiceGroup {
  id: string;
  performerIds: string[];
  styleSlot: 1 | 2 | 3 | 4;
}
```

The parser must recover from malformed input. It should return useful ranges and parse issues rather than reject the document.

Raw HTML is always escaped when rendered outside CodeMirror. Canonical serialization emits only explicitly supported lyric markup. Never pass pasted lyric text to `innerHTML`.

## Editing pipeline

```text
CodeMirror transaction
        │
        ├── update derived document model
        ├── run eligible lint rules
        ├── update decorations and issue panel
        └── debounce local draft snapshot
```

Most lyric documents are small. Run the parser and rules on the main thread initially. Introduce a Web Worker only after profiling demonstrates a problem.

## Rule engine

```ts
interface SourceReference {
  id: string;
  url: string;
  annotationId?: number;
  pageTitle: string;
  sectionTitle: string;
  retrievedAt: string;
  contentHash?: string;
  reviewStatus: "reviewed" | "needs-review" | "retired";
}

interface RuleDefinition {
  id: string;
  version: number;
  defaultSeverity: "error" | "warning" | "suggestion" | "manual-review";
  sourceIds: string[];
  check(document: ParsedDocument, context: RuleContext): Diagnostic[];
}

interface Diagnostic {
  ruleId: string;
  severity: "error" | "warning" | "suggestion" | "manual-review";
  from: number;
  to: number;
  message: string;
  explanation: string;
  sourceIds: string[];
  fixes?: TextEdit[];
}
```

A production diagnostic must reference at least one reviewed source. Tests should fail if an enabled rule has no reviewed source metadata.

Rules are divided into:

- Mechanical syntax and structure
- Context-aware conventions
- Consistency checks within the document
- Manual-review guidance

Only provably safe mechanical fixes may participate in bulk fixing.

## Genius source ingestion

### Observed constraints

- `genius.com` pages and its undocumented `/api/*` responses do not include cross-origin permission for a static LyricLint client.
- Genius `robots.txt` disallows `/api` and `/api/*`.
- Genius Terms of Use prohibit scraping and similar automated extraction without written authorization.
- The official `api.genius.com` API supports annotation reads but requires OAuth credentials.
- A client access token must not be shipped in public JavaScript.

Therefore LyricLint must not scrape Genius at runtime.

### Initial source process

1. Maintain a registry of exact Genius page and annotation URLs.
2. Manually review and normalize the relevant rules into version-controlled data.
3. Store retrieval date, annotation ID, review status, and a content hash or ETag when available.
4. Require a human-reviewed diff before publishing a new rule-set version.
5. Keep the previous known-good snapshot.
6. Ship the reviewed snapshot with the static application.

### Future authorized sync

If Genius grants permission, add a maintainer-only synchronization command or scheduled job using the documented API and a secret token. It may create a proposed data diff, but must not publish rule changes without review.

The editor never depends on a live refresh. A Genius outage or changed annotation must not interrupt editing.

## Performer colors

Each normalized performer name derives a stable hue, which is matched to the nearest performer
color token and stored with the draft. If that token is already used in the roster, the new
performer takes the nearest least-used token; existing performers are never recolored to settle a
collision. Once every token is occupied, the same least-used rule balances unavoidable reuse.
Use color-blind-aware palettes for light and dark themes.

Single performers receive a low-opacity background or underline. Joint voice groups use a segmented multi-color treatment rather than averaging colors into an indistinguishable brown or gray. A text label, accessible name, or section legend always accompanies color.

Lint decorations must remain visually distinguishable above performer highlighting.

## Undo boundaries

The following is one CodeMirror transaction:

- Wrap or replace selected lyric markup
- Add or update the section-header performer legend
- Preserve the semantic selection around the affected lyric text

Roster-only metadata changes use a separate action with toast undo. A normal document undo does not unexpectedly remove a performer from the draft roster.

## Security and privacy

- Draft linting is entirely local. The rules assistant normally transmits only
  its composer text; if it asks to read the open 'scribe, the browser shares at
  most the configured draft limit only after the visitor's explicit per-'scribe
  decision. Edit proposals use that same consent-gated tool session.
- Analytics, if added, must never include lyric text, selections, performer names, draft titles, or source markup.
- Pasted content is treated as untrusted plain text.
- External source links open with safe new-tab attributes.
- Local data has an explicit delete-all control, and it covers assistant conversations as well as drafts.
- The copy action copies canonical Genius markup, not rendered DOM text.

## The rules assistant service

The one backend in the product is not draft storage or synchronization.
`services/rules-assistant` is a separate Cloudflare Worker behind Cloudflare AI
Gateway answering `POST /v1/answers` for the accountless "Ask LyricLint" modal.
It gives ordinary proofreading and transcription-convention help without
demanding a citation, while attaching reviewed rules whenever they materially
support the answer; only Genius- and LyricLint-specific claims must be grounded
in the corpus. Its optional draft-reading and edit-proposal tools run only after
the consent boundary described above.

- **Knowledge corpus.** `src/lib/rules/assistant-corpus-types.ts` is the producer-owned, dependency-free corpus contract. `bun run assistant:corpus` copies it into the independently deployable Worker and writes both the JSON artifact and a typed data module beside it. The content comes from `currentRuleSet`, the `RuleReference` derivations, the reviewed source registry, the eight reviewed language packs, and the policy sections of `docs/rules.md`. Parity tests in `src/lib/rules/assistant-corpus.test.ts` fail when the copy or artifact is stale, when anything unreviewed leaks in, or when its version drifts from the frontend ruleset.
- **Model call.** OpenAI Responses API (`gpt-5.6-luna`, medium reasoning, `store: false`, 16,384 output tokens) through an authenticated Cloudflare AI Gateway, using LyricLint's OpenAI project API key. Strict structured output contains typed blocks, each carrying zero or more rule ids. The Worker rejects unknown ids, duplicate rich-reference assignments, more than four distinct references, reviewed claims without reviewed citations, and invented source ids — an invalid answer is a 502, never partially rendered. Every block stays in the language of the visitor's latest question across tool rounds and repairs; the selected song language, quoted lyrics, corpus, tool output, and earlier assistant prose never select the answer language. Prompt order is stable instructions → corpus → cache breakpoint → pruned history → question, cached under a key derived from the ruleset version and corpus hash.
- **Abuse control, layered.** WAF, Worker Rate Limiting bindings, and a SQLite-backed Durable Object enforce the minute, daily, concurrency, and spend limits defined in `services/rules-assistant/src/config.ts`; that module is the canonical source for the current operational values. The AI Gateway adds the deployment-wide spend ceiling, and `ASSISTANT_DISABLED` is a kill switch requiring no frontend deploy. First request passes Turnstile and earns a signed, `HttpOnly`, `SameSite=Strict` 24-hour anonymous session cookie; rechallenge after ten successful requests. Session and IP identifiers are HMAC-hashed before storage or metrics; raw IPs and prompt text are never logged, and gateway payload logging is off.
- **Frontend.** The browser resolves cited rule ids against the same generated corpus and renders each as a compact, visibly attached canonical reference with a new-tab link to the complete rule page — model text is never trusted for rule facts. Validated answers use an NDJSON content stream, so prose arrives incrementally while citations appear only when their supporting block is complete. Conversations live in Dexie (`assistantChats` / `assistantMessages`, database version 5), stay in the browser, and are cleared by delete-all; the workspace backup deliberately excludes them.

## Deferred decisions

- Direct Genius integration or browser extension
- Accounts and cross-device sync
- Collaborative editing
- Hidden-markup or WYSIWYM editing
- Authorized guideline synchronization
- Mobile-first editing

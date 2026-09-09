# Assistant eval runner

`run.mjs` sends every case in `eval-set.json` to the configured Worker and
checks response structure, known rule/source ids, expected scopes, citation
counts, and required phrases.

Two boolean expectations use intentionally simple prose heuristics:

- `refusesInjection` requires refusal language, a mention of the assistant's
  Genius/guideline/transcription scope, and no demanded identifier, corpus
  marker, or corpus hash in the answer. Refusal text may name the system prompt
  it is declining to reveal.
- `mustExplainNoDraftAccess` requires both a draft/document/lyrics reference
  and an explicit statement that the assistant cannot read, see, view, or
  access it.
- `answerLanguage: "no"` is the narrow regression gate for the observed
  Norwegian-to-German switch. It requires multiple Norwegian prose markers and
  refuses any German prose marker; it is not a general-purpose detector.

These checks cover the accountless question-only eval path. They do **not**
exercise the browser agent/tool path or verify the `read_scribe` untrusted-data
fence; those remain covered by the Worker and frontend unit suites.

`tool-language.ts` is a separate opt-in live regression for the annotation path.
It uses the real provider with fictional Norwegian lyrics and the short question
`Korrekturles`, simulates sharing and rejected edits, and checks each tool note
separately from the final answer. It requires at least one annotation; tool
selection remains the model’s decision. Each note is checked for German markers,
while Norwegian markers are counted across the notes so short labels are allowed.
Lyric anchors and replacements are excluded from language checks. This is a
narrow heuristic, not a general language detector; inspect printed prose on failure.
Set `TOOL_LANGUAGE_EVAL_QUESTION` to run a longer Norwegian control question.
It makes at most five provider requests and never changes a real document.

From the repository root, with `AI_GATEWAY_BASE_URL`, `OPENAI_API_KEY`, and
`AI_GATEWAY_TOKEN` available in the environment or the service's `.dev.vars`:

```bash
bun --env-file=services/rules-assistant/.dev.vars services/rules-assistant/eval/run-tool-language.ts
```

The base URL is also documented in `services/rules-assistant/wrangler.jsonc`;
set it explicitly if `.dev.vars` only contains secrets. This check spends provider
tokens and is not part of the default unit suite.

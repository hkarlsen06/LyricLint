# GPT-6.1 Terra for the rules assistant

Researched 28 October 2026. This is a qualitative market and prompt-design analysis for LyricLint's existing assistant. Product documentation establishes advertised capabilities, and vendor case studies establish what their authors report. Neither establishes Terra's quality on LyricLint. No market-share estimate or independent product benchmark is claimed.

## The workload and model

The assistant answers questions against a versioned, reviewed Genius and LyricLint corpus, gives broader transcription advice, and uses browser tools to inspect and propose changes to a visitor's 'scribe. It receives text, not the recording. Its central correctness requirement is to preserve the performed words while correcting their written representation.

OpenAI identifies `gpt-6.1-terra` as suitable for clear writing from supplied material. Its documented reasoning settings include `none`, `low`, `medium`, `high`, `xhigh`, and `max`. Function calling requires Responses. The model page lists standard rates of $1 input, $0.05 cached input, $1.25 for 30-minute cache writes, and $5 output per million tokens. These are token prices, not a forecast of cost per successful answer. [Terra model documentation](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

Use medium reasoning as an explicit starting configuration. OpenAI's family guide recommends medium for Terra, then increasing effort only when quality justifies the added time and tokens. The guide explicitly says its broader prompt examples address observed Astra behavior and need evaluation on the chosen model. They are useful hypotheses for Terra, not Terra-specific experimental evidence. [GPT-6 guide](https://developers.openai.com/api/docs/guides/latest-model).

## Market comparison

| Product and category                     | Published capability                                                                                                                                                    | Implication for LyricLint                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Musixmatch Pro, lyric workflow           | Official lyrics, structure and credits, AI transcription and synchronization, distribution, and optional expert curation.                                               | Competing lyric products connect assistance to an editable lyric workflow. LyricLint's useful distinction is explaining reviewed Genius conventions beside a precise, reversible edit. It cannot promise audio verification from text alone. [Publisher's App Store description](https://apps.apple.com/us/app/musixmatch-pro/id1588257741). |
| Grammarly, general writing assistance    | Voice profiles adapt suggestions to an author's style, role, and dialect.                                                                                               | Context-sensitive corrections matter. For a released recording, the artist's wording is fixed, so generic rewriting or register normalization would damage the task. Preserve dialect and slang. [Grammarly voice profiles](https://support.grammarly.com/hc/en-us/articles/23153676821773-View-and-customize-your-voice-profile).           |
| WRITER, enterprise style enforcement     | Team style guides configure terminology, punctuation, capitalization, and proofreading and can apply to agent output.                                                   | Keep domain conventions in the generated corpus and lookup tables. A prompt should explain how to use them rather than maintain a second hand-written policy catalog. [WRITER style-guide documentation](https://support.writer.com/articles/2607647594-customizing-your-team-s-style-guide).                                                |
| Intercom Fin, knowledge-grounded support | Content guidance prioritizes relevant sources. Guidance is tested before publication, and source availability is an enforced configuration rather than a prose promise. | Keep source eligibility, tool permissions, argument validation, citation IDs, and budgets enforced in code. Prompt wording complements these controls. [Fin guidance documentation](https://www.intercom.com/help/en/articles/10210126-provide-fin-ai-agent-with-specific-guidance).                                                         |

The opportunity is a specialized transcription reviewer with explainable corrections. General writing tools cover language improvement, and lyric platforms cover catalog production. This is an inference from the compared product descriptions, not evidence of an unoccupied market or willingness to pay. No claim is made that those products lack other capabilities.

## Case studies and their limits

### Intercom's Fin versus Zendesk evaluation

Intercom describes a comparison using 48 synthetic help articles and 200 questions. Four model judges assessed answers against those articles. Intercom reports no statistically significant difference in hallucination levels and a 96% versus 78% answer rate on questions requiring multiple sources. The publisher acknowledges synthetic-data and model-judge limitations. These are vendor-reported historical results, not a current independent ranking. [Intercom's evaluation and limitations](https://www.intercom.com/blog/intercom-vs-zendesk-two-ai-agents-put-to-the-test).

The transferable method is to hold questions and sources constant, then measure correctness, directness, and useful completion separately. LyricLint should also score citation support, language of tool notes, preserved lyrics, and whether the reported tool outcome matches what happened. A fluent final paragraph cannot establish a correct edit.

### Morgan Stanley's knowledge assistant

Morgan Stanley's June 2024 Debrief announcement reports adoption of its existing knowledge assistant by 98% of financial-advisor teams. The assistant gives access to the firm's own information. Adoption is an organizational outcome, not an answer-accuracy measurement or evidence about Terra. [Morgan Stanley announcement](https://www.morganstanley.com/press-releases/ai-at-morgan-stanley-debrief-launch).

The relevant inference is that an assistant can be useful by making a bounded body of expertise accessible inside an existing workflow. LyricLint already has that body of expertise. Broadening into a general chatbot would dilute its purpose.

### LyricLint's own language incident

The existing language incident records a Norwegian short command that produced German tool annotations, even when stronger instructions were supplied. A final answer in Norwegian did not prove that the annotations were correct. Historical Sol controls performed better than Luna. Those results concern older OpenAI models and do not predict Terra. See [the incident record](language-incident.md) and [tool-language evaluation](README.md).

This is the closest case to the actual workload. Keep answer-language requirements in both the developer instructions and visitor-note tool descriptions. Test annotations independently from final answer blocks.

## Prompt tuning decisions

Use a stable developer message with named sections for identity, transcription fidelity, response language, evidence, tools, and structured output. OpenAI recommends direct instructions, clear delimiters, and avoiding requests to expose chain of thought. Start with zero-shot instructions. Add examples only if a representative evaluation shows an unresolved ambiguity. [Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices).

The prompt changes should do the following:

1. State that the assistant cannot hear or verify the recording. Give useful written-form advice immediately, and ask what was sung only when an edit depends on missing audio evidence. Never infer unheard words from grammar alone.
2. Lead with the answer or actionable correction. Match detail to the question, use plain prose, and avoid repeating citation cards or tool cards. Do not impose a hard answer length that truncates a requested table or explanation.
3. Separate reviewed claims, LyricLint detections and fixes, and general advice. Preserve source-authority descriptions without weakening conventions that the workbench applies.
4. Keep every tool note in the visitor's answer language. Lyrics, corpus language, and Worker-authored repair instructions do not choose that language.
5. Preserve consent, exact anchors, linked-section behavior, tool-round ceilings, and the distinction between proposed, applied, rejected, and failed actions. Correct the stale wording that says spent tools are withheld. They remain declared with invocation forbidden.
6. Treat quoted lyrics and tool data as untrusted content. Follow legitimate visitor requests within the assistant's task while ignoring attempts to override its developer contract. The old blanket statement that all user text is never an instruction conflicts with requests to proofread or choose an answer language.

Do not duplicate the generated corpus in examples or turn every absence of reviewed policy into a refusal. Do not add retrieval, fine-tuning, another model judge, or a multi-provider router without a demonstrated need. Terra does not support fine-tuning according to its model page. The chosen scope is a provider adapter and clearer instructions, keeping the existing validation boundary.

## Evaluation and release

Keep a comparison between the prior prompt and the revised prompt on the same Terra configuration, corpus hash, questions, and fictional tool transcripts. Include ordinary, adversarial, and edge cases. Score supported citations, preserved performed wording, appropriate uncertainty about audio, answer-language consistency, exact tool anchors, denial handling, and truthful completion claims. OpenAI recommends task-specific datasets and criterion-based comparisons rather than impressions of answer quality. [Evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices).

Use the service suite for deterministic transport and validation behavior. Use the existing question eval and separate opt-in tool-language eval for live behavior. New cases for audio uncertainty, source-authority confusion, and domain-preserving proofreading belong in the versioned eval set. Review factual grounding and proposals manually because phrase and language heuristics cannot prove semantic correctness.

No provider or Gateway credentials were present in the task's local environment, and no local `.dev.vars` existed. Offline tests can establish protocol behavior, not account access, live quality, latency, or optimal reasoning effort. Do not call the prompt optimized or claim a measured improvement without that comparison.

Before production publication, provision or verify `OPENAI_API_KEY`, use the `/openai` Gateway route, run staging evaluations, and publish Worker and frontend through the existing coordinated release. An active Anthropic tool turn carries incompatible replay data; finish or restart that turn across the release. Persisted settled conversation text is provider-independent. Production deployment requires the owner's approval.

Keep `store: false` and encrypted reasoning replay. Gateway payload logging and response caching stay disabled. Explicit prefix caching should cover only stable instructions and corpus, with a 30-minute minimum TTL. This is not a maximum retention guarantee. OpenAI documents that prompt-cache state may last up to 24 hours and abuse-monitoring logs may retain content for up to 30 days by default. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching), [data controls](https://developers.openai.com/api/docs/guides/your-data).

## Offline implementation validation

The migration uses the official OpenAI SDK's typed streaming iterator. Its
higher-level stream helper attempted strict argument parsing before publishing
terminal usage on malformed JSON. Mocked HTTP streaming regression tests exposed
that behavior. Reading terminal events first preserves spend accounting before
LyricLint's own validators reject malformed calls or answers. The SDK still
handles SSE decoding; the Worker has no manual SSE parser.

Replay validation allows only encrypted reasoning, assistant messages, and known
function calls. It validates argument schemas and matches declared ids, names,
and parsed argument values. Comparing raw argument strings would incorrectly
reject harmless whitespace or property-order differences introduced when the
browser serializes validated calls. Regression coverage includes both an
accepted reserialization and refused changed argument values.

A quota test initially failed near UTC midnight because its simulated
200-second delay crossed the daily reset. Reproduction isolated the wall-clock
dependency, and the elapsed-time quota tests now start at a fixed midday.
Production quota behavior was not changed.

Live question and tool-language evaluations were not run: `OPENAI_API_KEY`, `AI_GATEWAY_TOKEN`,
and `AI_GATEWAY_BASE_URL` were absent from the local process, and the service's
`.dev.vars` did not exist. No secret search, production-secret change, push, or
deployment was performed. Account availability, live model behavior, latency,
cache hits, and prompt improvement remain unverified.

Final offline checks passed:

- `bun run assistant:test`: 48 deployment/release tests, service type checking,
  and 187 service tests across five files.
- `bun run check`: no Svelte errors or warnings; service-worker type checking passed.
- `bun run lint`: Prettier, oxlint, and ESLint passed.
- `bun run test:unit -- --run --project server src/lib/rules/assistant-corpus.test.ts src/lib/prose-em-dash.test.ts src/lib/subsystem-docs.test.ts src/lib/ui/docs/docs-search.test.ts`:
  24 tests across four files passed.
- `bun run test:unit -- --run --project client src/lib/ui/assistant/AssistantDialog.svelte.test.ts`:
  14 tests passed. No full browser or E2E run was performed.
- `git diff --check`: passed before commit.

Independent review removed an undocumented cast for settled assistant messages.
Settled assistant text now uses the string-content form in OpenAI's
[manual conversation-history example](https://developers.openai.com/api/docs/guides/conversation-state).
Live tool replay still preserves the full validated assistant and reasoning items.
The transport regression includes a settled exchange before the new question.

# LyricLint rules assistant

The one backend in the product, and deliberately not draft storage or sync: a
Cloudflare Worker behind Cloudflare AI Gateway that answers questions about the
Genius transcription guidelines and offers general proofreading and convention
help for the accountless "Ask LyricLint" modal. Reviewed claims carry canonical
references when relevant; general language advice does not need one.
Draft linting stays in the browser. The service normally receives only the
assistant's composer text; its draft tools can receive the open 'scribe only
after the visitor's explicit per-'scribe decision, and only for that tool
session.

Design notes live in `docs/architecture.md` at the repository root ("The rules
assistant service"). The public contract is `POST /v1/answers` and `GET /health`.
The answer endpoint returns its documented JSON response by default, except for
a turn that calls a browser tool: a tool call has no JSON response shape, so it
is answered as NDJSON whatever the request asked for. Clients
that send `Accept: application/x-ndjson` receive answer text as the model writes
it. Scope, block starts, and text deltas are soft-gated by a tolerant partial
parse; citation-bearing block completions and the final quota event are emitted
only after the complete answer passes validation. A `block_done` carries a
`text` field where validation did not merely extend what was streamed — a
stripped trailing citation run is the one thing that does — and the client
replaces that block's assembled text with it. A provider or validation
failure after streaming starts is an in-stream `error` event, and no `done`
event follows it.

## Layout

- `src/index.ts` — router, CORS, the layered checks, and the answer pipeline.
- `src/schema.ts` — request validation and the structured-answer gate (unknown
  rule ids, duplicate or excessive citations, scope/citation combinations).
- `src/quota-do.ts` — the `QuotaCounter` Durable Object: exact daily counts,
  concurrency slots, and spend accounting per hashed identifier.
- `src/identity.ts` — Turnstile verification, the signed anonymous session
  cookie, and the HMAC hashing that keeps raw IPs out of storage and metrics.
- `src/provider.ts` — the OpenAI Responses call through the Gateway (model and
  reasoning settings from `src/config.ts`, `store: false`, strict JSON schema
  output, prompt cache keyed on ruleset version + corpus hash).
- `generated/rules-context.json` and `generated/rules-context-data.ts` — the
  knowledge corpus and its cast-free TypeScript loading form. The producer owns
  their dependency-free contract in `src/lib/rules/assistant-corpus-types.ts`;
  `bun run assistant:corpus` at the repository root copies that contract here
  as `generated/rules-context.ts` and writes both artifacts deterministically.
  Parity tests in `src/lib/rules/assistant-corpus.test.ts` (root suite) fail
  when the copy or corpus is stale.
- `eval/` — the versioned release-gate evaluation set and its runner.

## What the corpus is, and what it is deliberately not

A rule enters the corpus as its reference page does: derived by running the
rule against its reviewed `invalid` policy example. That is right for a rule
that is a judgment and wrong for one that is a **table**, because a page is
written about the occurrence in front of the reader. `spelling.standardized`
arrived here as the single pair `Imma` → `I'ma`, so the assistant, asked what
the standardized spellings are, answered with one pair — correctly, and
uselessly.

`lookups` is the rest of those seven rules: the reviewed spellings, the common
English misspellings, the texting-shorthand expansions, the two contraction
maps, the digits, the curly quotes, and the Norwegian header preferences, in
full. It is built by `src/lib/rules/lookup-tables.ts` from the same constants
the rules check against, so a spelling added to `data/spelling.ts` reaches the
assistant without anybody remembering to copy it, and `lookup-tables.test.ts`
fails if a flattened entry drifts from its source table.

Two things it carries that a bare list would lose, both of them load-bearing
for what the assistant is allowed to say:

- **`curatedMisspellings` are LyricLint's own.** `coz`, `couse` and `tryina`
  are detected like an alternate and named by no reviewed guideline. Merged
  into `instead` they would read as Genius policy, which is the one thing the
  developer instructions forbid.
- **`fix` is per entry.** A rule's `fixability` is a ceiling — most reviewed
  spellings are a one-press fix under `spelling.standardized`'s `preview`
  ceiling — so reporting the rule's kind for a whole table would tell the
  visitor every spelling needs confirming.

**A source is still a pointer, and no Genius prose is stored.** `sources.ts`
holds an id, a URL, a page and section title, and a verified date; nothing in
this repository quotes a guideline. Transcribing some would make it the only
hand-written content in an artifact whose entire design is that it is
generated and hash-checked — there would be no generator to re-derive it, and
`docs/rules.md` already states that community annotations change and that live
scraping is not part of the editing path. If reviewed excerpts are ever wanted,
they belong on `SourceReference` beside `lastVerifiedAt`, so re-verifying a
source is what re-verifies its quotation.

## The tool budget is spent by withholding the tools

A turn may use the browser-executed 'scribe tools `MAX_TOOL_ROUNDS` times, and
what happens on the round after that is the difference between an assistant
that finishes and one that throws away everything it did. The Worker used to
call the model with tools still offered and then refuse the call that asked for
one: the model has no way to know a budget exists, so it asked, and the turn
died as an `invalid_answer` — which the browser words as _the model returned an
answer that failed validation_. A turn that had read the 'scribe, applied two
headers and gone back for fresh line numbers ended with nothing shown.

So the budget is spent one call earlier, and quietly: with the rounds gone, the
provider is called with **no tools** and `FINAL_ROUND_INSTRUCTION` appended
after the cache breakpoint, so the only thing the model can do is answer with
what it has and say what is still outstanding. `toolsAvailable` on the request
keeps its own separate meaning throughout — it is what a `draft-work` answer is
validated against, and a turn that used tools is still a turn that used them.
The prompt states the ceiling as well, because a model that knows what a round
costs spends them differently. The refusal in `index.ts` stays as a backstop for
a provider that offers tools anyway; it is no longer a path a turn can reach.

The same failure had a second cause on the browser side, and it is written down
in `src/lib/core/text-anchors.ts`: an anchor's line number is measured against
the 'scribe the model read, so applying the first proposal in a batch moves the
lines under every proposal after it, and between repeated verses — whose
neighbours are identical — the rest were then refused as ambiguous. They were
the model's own correct proposals, invalidated by the linter applying the ones
before them, and the rounds spent re-proposing them are what exhausted the
budget above. Each anchor is pinned to the copy it landed on when its call
arrived, and the pin outranks the line for exactly as long as the number of
copies is unchanged.

## Commands

```bash
bun install
bun run check     # tsc
bun run test      # vitest — validation, quotas, sessions, structured output
bun run dev       # wrangler dev (see below)
bun run deploy    # wrangler deploy
```

From the repository root, `bun run assistant:test` does install + check + test.

Worker deployment is manual by design. CI gates the Pages application, but the
repository has no Cloudflare API-token secret with authority to publish this
Worker. After the root and Worker checks pass, `bun run assistant:deploy` at the
repository root delegates to this package's `deploy` script. Do not treat a
Pages deployment as a Worker deployment.

## Configuration

Vars (in `wrangler.jsonc`): `ASSISTANT_DISABLED` (the kill switch — flip to
`"true"` in the dashboard to refuse new requests with `service_disabled`, no
frontend deploy needed), `ALLOWED_ORIGIN` (a comma-separated exact allowlist),
`TURNSTILE_ALLOW_LOCALHOST` (keep `"false"` outside local development),
`AI_GATEWAY_BASE_URL` (replace
`ACCOUNT_ID` with the real account).

Secrets (`wrangler secret put …`, never committed):

| Secret                   | Purpose                                             |
| ------------------------ | --------------------------------------------------- |
| `OPENAI_API_KEY`         | OpenAI project API key used for model calls         |
| `AI_GATEWAY_TOKEN`       | Token created in AI Gateway Authentication settings |
| `TURNSTILE_SECRET`       | Turnstile server-side verification                  |
| `ABUSE_HMAC_SECRET`      | Hashing session/IP abuse identifiers                |
| `SESSION_SIGNING_SECRET` | Signing the anonymous session cookie                |

Gateway settings that are policy, not code: raw request/response payload
logging **off**; response caching **off**; Gateway authentication **on**; and a
$15/day spend limit as the outermost spend stop. The Worker supplies
LyricLint's own OpenAI API key to the provider-native Gateway endpoint. It also
sends per-request headers that authenticate to the Gateway, disable payload
collection, and skip response caching because Gateway caching buffers the
provider stream. Request, daily, concurrency, and spend allowances live in
`src/config.ts`; operational launch values and dashboard checks live in
`LAUNCH.md`.

`SESSION_RULES.requestsPerChallenge` is the one allowance that is advisory
rather than enforced: the count lives in the signed cookie, so replaying the
first cookie issued skips the rechallenge for the cookie's TTL. Everything that
costs money is keyed on the hashed session and IP in the Durable Objects, which
a replayed cookie cannot move. `src/identity.ts` states the trade in full.

## Local development

1. Copy `services/rules-assistant/.dev.vars.example` to `.dev.vars` and replace
   `YOUR_ACCOUNT_ID`, `AI_GATEWAY_TOKEN`, and `OPENAI_API_KEY` with a
   non-production Gateway, its authentication token, and an OpenAI project API
   key. The provided Turnstile secret is Cloudflare's always-passing test
   secret.
2. Copy `.env.example` to `.env.development.local`. Its assistant URL and
   Turnstile site key already point at Wrangler and Cloudflare's matching test
   widget.
3. Run `bun run dev` in `services/rules-assistant`, then `bun run dev` at the
   repository root. Use `http://127.0.0.1:5173`, which matches `ALLOWED_ORIGIN`.
4. Check `http://127.0.0.1:8787/health`, then ask a question in `/rules/`.

## Cloudflare setup and deployment

1. Create production and staging AI Gateways and enable Gateway authentication.
   Use the provider-native `/openai` endpoint; do not configure Unified Billing
   or store the OpenAI key in Cloudflare. Disable Gateway payload logging,
   disable response caching, and add a $15 UTC-daily spend rule to production.
   Configure 50%, 80%, and 100% budget notifications.
2. Create production and staging Turnstile widgets restricted to their exact
   frontend hostnames. Put each public site key in the corresponding Pages build
   as `PUBLIC_TURNSTILE_SITE_KEY`; keep the secret in its Worker.
3. Replace `ACCOUNT_ID` in `wrangler.jsonc`, then set all five secrets with
   `bunx wrangler secret put NAME`. Use a project-scoped OpenAI key for
   `OPENAI_API_KEY`; never commit it or paste it into an issue or chat.
4. Create the WAF rules for outer flood protection on
   `api.lyriclint.com/v1/answers`. The rate-limit bindings and Durable Object
   handle the finer browser/IP, daily, concurrency, and session/IP/global spend
   limits after that outer layer.
5. Generate and verify the corpus, then deploy:

   ```bash
   bun run assistant:corpus
   bun run assistant:test
   cd services/rules-assistant
   bun run deploy
   ```

6. Configure Pages with
   `PUBLIC_ASSISTANT_ANSWERS_URL=https://api.lyriclint.com/v1/answers`
   and the production Turnstile site key. Keep `ASSISTANT_DISABLED=true` until
   the staging evals and multilingual review pass, deploy Pages, then set it to
   `false` and deploy a Worker version containing only that variable change.

## Evaluating

The declared behavioral heuristics and their limits are documented in
`eval/README.md`.

Run the eval set against `wrangler dev` (when `.dev.vars` uses Turnstile's test
secret) or against staging:

```bash
ASSISTANT_EVAL_URL=http://127.0.0.1:8787 \
ASSISTANT_EVAL_ORIGIN=http://127.0.0.1:5173 \
node eval/run.mjs
```

Gates: 100% structurally valid, 100% known rule ids, no invented source ids,
≥95% expected scope classification. The runner exits non-zero when a gate
fails.

## Rollout

1. Deploy Worker + Gateway config to staging; run the eval set and a manual
   multilingual review.
2. Deploy production with `ASSISTANT_DISABLED = "true"`.
3. Deploy the frontend. Its entry points will show the service-disabled state
   until the Worker kill switch is flipped.
4. Flip the kill switch off.
5. Watch metadata-only metrics (Analytics Engine dataset
   `rules_assistant_metrics`); alert at 50/80/100% of the daily budget.
6. The kill switch is the answer to provider instability, unexpected spend, or
   abuse — it needs no deploy in either direction.

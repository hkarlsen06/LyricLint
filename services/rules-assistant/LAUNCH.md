# Rules assistant launch checklist

## Tighten testing quotas

Change the testing values in `src/config.ts` before launch:

| Limit                  | Testing | Launch |
| ---------------------- | ------: | -----: |
| `sessionPerDay`        |     100 |     25 |
| `ipPerDay`             |     300 |     75 |
| `sessionDailySpendUsd` |      $2 |  $0.50 |
| `ipDailySpendUsd`      |      $4 |     $1 |

Keep the global Worker ceiling at $15/day and confirm global concurrency and
per-request spend reservations remain enabled.

## Cloudflare dashboards

- AI Gateway payload logging is off.
- AI Gateway authentication is on.
- The Gateway has a $15/day spend cap.
- Budget alerts are configured at 50%, 80%, and 100%.
- The production Pages environment contains the real Turnstile site key as
  `PUBLIC_TURNSTILE_SITE_KEY`, not Cloudflare's testing key.

## Build and release

1. From the repository root regenerate the corpus with
   `bun run assistant:corpus`.
2. Run the scoped checks and staging evaluation.
3. Complete the CI token setup in [CI and deployment](../../docs/ci.md), then
   commit and push to `main`. All three checks must pass before the serialized
   deploy job publishes the Worker and the exact tested Pages artifact.
4. Confirm the deploy job verified that Worker health supports the new and actual
   previous live corpus, and that `/assistant-release.json` identifies the new
   site and its built-in production assistant endpoint. The final Worker bundle
   is checked and tested before publication; deployment inherits the live kill
   switch and preserves routing.
5. If publication needs retrying, use `bun run assistant:deploy` at the root or
   `bun run deploy` in this package. Both request a CI retry; raw Wrangler
   publication bypasses the compatibility protocol and is not a recovery step.
   A retry of an already published revision verifies it without redeploying or
   discarding the retained corpus.

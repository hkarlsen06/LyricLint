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
3. From `services/rules-assistant`, deploy with `bunx wrangler deploy`.
4. Verify health with `/health?cb=1`; `/health` can be served from an edge cache
   and hide a just-deployed version or kill-switch change.

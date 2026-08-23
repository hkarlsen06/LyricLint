# The service worker: an offline snapshot that never stands between the user and the network

Touches: `src/service-worker.ts`, `src/routes/+layout.svelte`, `src/routes/+error.svelte`,
`vite.config.ts` (`serviceWorker`, `version`)

## The rules

- Three strategies, chosen by what a URL can promise; **anything matching none is not
  intercepted at all** — failing open is the rule the dev incident taught. Hashed build
  assets: cache-first forever, cached on sight (the self-heal that lets an old worker serve
  a newer deploy). Navigations: network-first with preload, falling back to the cached copy
  then the `/` shell; a 5xx is an outage, a 404 is answered truthfully. Static/prerendered:
  this version's snapshot, written only at install or by a navigation landing fresh markup.
- No `skipWaiting`/`clients.claim`: activation deletes the previous snapshot, so it waits
  until no page from the previous version is open. The worker's version decides nothing
  about freshness — it is only how good the offline copy is.
- The precache is `/`, `/lint/`, static files, and non-wasm immutable assets; install copies
  immutable assets forward from the previous cache; rules pages join the snapshot by being
  read. The Harper wasm and the motion `.gif` stay excluded.
- Registration is app code, not `kit.serviceWorker.register`: registered under `!dev`,
  **unregistered under `dev`** (an installed worker controls `localhost` until something
  takes it off). The error page's links carry `data-sveltekit-reload`.
- `kit.version.pollInterval` + `beforeNavigate` turn the first navigation after a deploy
  into a full-page load — silent on purpose, upgrade on a gesture, never mid-session.
  Neither cache layer may pin `_app/version.json`: it must keep matching none of the
  worker's strategies.
- Pinned in `e2e/lyriclint.spec.ts` (`offline reopen`, precache scope + read-admission);
  the waiting-update and version-poll paths are verified by hand.

## Decision record

### The service worker is an offline snapshot, and it never stands between the user and the network

The worker exists for two promises and nothing else: a workbench somebody opened comes back
offline, and the installed home-screen app does not white-screen without a connection. Its first
version tried to be more than that — cache-first over every same-origin GET, the whole deploy
precached, `skipWaiting` plus `clients.claim` on update — and every one of those choices did harm
the snapshot never required:

- **Registered against the dev server, it broke the dev server.** Every Vite module request went
  through a cache-first worker whose miss path threw, so an ordinary restart or dep re-optimize
  stopped being a retriable network error and became a rejected dynamic import — which the browser
  caches against that module's URL for the life of the document. The tab landed on `+error.svelte`
  and could not route out of it, because the error page's links were client-side navigations asking
  the runtime that had just failed. Both halves are fixed separately: the links carry
  `data-sveltekit-reload`, because a new document with a new module graph is the only thing that
  recovers; and `kit.serviceWorker.register` is off, with the root layout registering the worker
  under `!dev` and **unregistering it under `dev`** — that branch is not tidiness, since a worker
  installed by an earlier build goes on controlling `localhost` until something takes it off.
- **`skipWaiting` was the same poisoning in production.** Activation is when the previous snapshot
  is deleted, and a deploy used to do both mid-session — so a tab still running the old document
  lost the cache its own lazy imports resolved from, on a host that no longer serves the old hashed
  filenames. The worker now waits until no page from the previous version is open anywhere, which
  is when deleting the old cache can no longer break a live document.
- **Cache-first navigations pinned every visitor to the deploy their worker had snapshotted.**
  Navigations are network-first now (with navigation preload, so the worker's own startup is not a
  tax on every page load), which is also what makes waiting free: the site is current the moment it
  is deployed, worker or no. **The worker's version decides nothing about freshness — it is only
  how good the offline copy is.**
- **Precaching the whole deploy made install the most expensive thing the application did.**
  ~8.5MB per visitor, and again in full on every deploy, because the cache key is a per-build
  timestamp and nothing was carried over — although the 1.5MB immutable bundle is content-addressed
  and by definition unchanged. ~6MB of it was the ~57 prerendered rule reference pages, which most
  sessions never open. The precache is now `/`, `/lint/`, the static files, and the non-wasm
  immutable assets; install **copies immutable assets forward** from the previous version's cache
  instead of refetching them; a rules page joins the snapshot by being read, because the navigation
  strategy writes what it serves. The Harper wasm keeps its exclusion — 18MB cached the first time
  the workbench actually loads it — and the motion loop's `.gif` is excluded in `vite.config.ts`,
  since it is the sharing copy and no page references it.

What is left is three strategies, chosen by what a URL can honestly promise, and **anything
matching none of them is not intercepted at all** — failing open is the rule the dev incident
taught, because a worker that proxies traffic it has no strategy for turns somebody else's
transient failure into its own permanent one. A hashed build asset is cache-first forever and
cached on sight from the network; that self-heal is what lets an old worker serve a newer deploy's
page, whose new chunks miss the old snapshot, arrive from the network, and join it. A navigation
is network-first, falls back to its cached copy (then the `/` shell) when the network cannot
answer, and treats a 5xx as an outage worth answering from the snapshot — a 404 is answered
truthfully. A static or prerendered URL can change between deploys, so it is served from this
version's snapshot and never written outside install, except by a navigation landing fresh markup
over its own stale copy.

**A hotfix reaches a long-lived tab on its own next navigation, and nothing is drawn to ask for
it.** The strategies above make every full-page load fresh — but a client-side navigation reuses
the running app, stale code included, so a tab that only ever routed client-side could carry a
superseded build for as long as it stayed open. `kit.version.pollInterval` in `vite.config.ts`
polls `_app/version.json` once a minute, and the root layout's `beforeNavigate` turns the first
navigation after a deploy into a full-page one (`location.href`), which the network-first strategy
then answers with the new build. Three things it depends on:

- **Neither cache layer can pin the poll.** SvelteKit sends it with its own `no-cache` headers,
  which is what keeps Safari's HTTP cache out of it, and `_app/version.json` matches none of the
  worker's three strategies, so it falls open to the network. A worker strategy added later that
  swallows that URL re-opens the exact staleness this exists to close.
- **It is silent on purpose.** Drafts autosave, so the full-page navigation costs nothing the user
  can see, and an "update available" toast would be a control for a press the user's own next
  gesture already makes — the same reason the save readout draws nothing while saving is going
  well. `willUnload` navigations are already leaving the document, so they are left alone.
- **It upgrades on a gesture, never mid-session.** A tab that never navigates keeps running the
  build it opened with, which is the deliberate boundary: reloading a document under someone's
  caret is the class of harm the no-`skipWaiting` rule exists to prevent, arrived at from the
  other side.

Two regressions are pinned in `e2e/lyriclint.spec.ts`: the offline reopen (`offline reopen from
cache via the service worker`), and the precache scope with the read-a-rules-page write (`the
offline snapshot precaches the app and admits a rules page when read`). The waiting-not-activating
update path needs two real builds and is verified by hand rather than in the suite — as is the
version-poll upgrade, whose trigger is a deploy happening under an open tab.

Implementation: `src/service-worker.ts`, the registration and the version upgrade in
`src/routes/+layout.svelte`, the `serviceWorker` and `version` options in `vite.config.ts`, and
the reload links in `src/routes/+error.svelte`.


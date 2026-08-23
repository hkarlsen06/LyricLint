# Spotify: the third source — no cue, no rate, and a sign-in that must survive itself

Touches: `src/lib/ui/state/media-spotify.ts`, `src/lib/ui/state/spotify-auth.ts`

## The rules

- The rate is `[1]` permanently (`reconcileRates` narrows and announces once); the picker
  states it as a fact under the control.
- The way in is a search (one field, link-or-query); a sign-in redirect carries the intent
  through `sessionStorage`, and `resumeSignIn` re-parses it — a link attaches, a query
  reopens the picker (`takeResumedQuery`, cleared on read).
- There is no cue: attaching fetches metadata only, the `PUT /me/player/play` is deferred to
  the first `play()` (`started`), and a restored playhead is spent as `position_ms` there,
  never as a seek. Both layers are used on purpose — SDK for playback/position, Web API for
  exactly two calls; never the Connect poll.
- The deployed build ships without Spotify (`PUBLIC_SPOTIFY_CLIENT_ID` unset in production,
  `spotifyAvailable` gates the picker). Local opt-in goes in `.env.development.local` — the
  `.development.` is load-bearing, `.env.local` reaches `vite build`. The suite pins its own
  value in `vite.config.ts`. Dev mode is permanent (5-user allowlist, `/search` capped at
  10, no batch endpoints — do not "optimise" the metadata read into one).
- Tokens live in `sessionStorage`, neither longer (credential at rest; untouched-page reach)
  nor shorter (module memory dies on reload); a refused refresh clears storage too.
- Spotify refuses the *name* `localhost`, and its `Insecure` error means the host: dev runs
  on `https://127.0.0.1:5173/`. `spotifyRedirectAllowed()` reports, never rewrites — a
  retargeted origin loses the PKCE verifier.
- The sign-in is a full-page redirect; `attachSpotify` is re-entrant and runs **after**
  `openFor` at boot. The client id is committed (not a secret; runtime env vars never reach
  the bundle — `envPrefix` carries `PUBLIC_`).
- The attribution mark is a brand requirement: the one literal color in the stylesheet
  outside the favicon, 21px floor, opens in a new tab. `trackId` is its own field, never a
  reused `videoId`; the store's `forget()` exists because pending fields are cleared in
  several hand-written runs.
- `media-spotify.test.ts`'s stub SDK makes "attaching plays nothing" an assertion.

## Decision record

### Spotify is a third source, and it is the one with no cue and no rate

Most transcribers' audio is on Spotify, and the two things that make it awkward are worth stating
before the code: it costs the speed control, and it is the only source that needs an account.
Neither is a reason to refuse it — a transcriber who has the song in the tool is better off than
one who has it in another tab — but both shape the module.

**The rate is `[1]`, permanently.** Spotify exposes no playback-rate control at any layer, so the
source reports one rate and `reconcileRates` narrows the workbench's offer to it and announces the
narrowing once. Nothing pretends otherwise, `preservesPitch` has no counterpart to set, and the
picker states it as a fact under the control — `No speed control`, beside `Needs Spotify Premium` —
rather than leaving the user to discover it when the menu they were reaching for has one entry.

**The way in is a search, because a link is a trip to another application.** YouTube has to be
pasted — there is no public search without an API key — but Spotify's `/v1/search` needs no scope
beyond the token the sign-in already produced, so asking the user to go and fetch a URL would be
making them do work this application can do for them. One field takes both: a query that parses as
a track link attaches outright and anything else is searched, so a paste still works and costs no
second control in a section that has room for one row. Results are six rows on the dialog with the
track at one end and its length at the other — not a boxed list, which would be the card inside a
card the design rules forbid.

**A sign-in interrupts that search, so the query rides across the redirect with it.** The intent
carried through `sessionStorage` is therefore one of two things, and `resumeSignIn` tells them
apart with the same parser: a link attaches on the way back, a query is handed to the picker
through `takeResumedQuery` for it to reopen and re-run. Reading it clears it, because a query left
standing would reopen the dialog on every later render. Without this, a user's first search — the
one that triggered the sign-in — was silently thrown away and they came back to an untouched
workbench.

**There is no cue, and that is the whole shape of the source.** `cueVideoById` is what keeps
attaching a YouTube video from playing it; Spotify's only way onto a device is
`PUT /me/player/play`, which plays. So attaching fetches the track's name and length over the Web
API — no sound — and the `PUT` is deferred to the user's first `play()`. That is what `started` is
for: the first press starts the track at whatever position was restored, and every press after it
resumes. A restored playhead is therefore spent as `position_ms` on that first call rather than as
a seek, because before the first press there is nothing on the device to seek in.

**Both Spotify layers are used, and each does the one thing the other cannot.** The Web Playback
SDK is playback and position; the Web API is exactly two calls, the metadata read and the start.
The Connect API alone would have been less code and was rejected on the poll: `GET /me/player`
against a rate limit of a few requests a second would make every line anchor sloppier than the file
source's, where the SDK's `getCurrentState()` is answered inside this tab and costs nothing.

**The deployed build ships without Spotify, and that is the feature working as designed.** It draws
only where `PUBLIC_SPOTIFY_CLIENT_ID` is set, and production leaves it unset — because a visitor
who is not on the five-slot allowlist gets no polite refusal, but a trip to Spotify, a sign-in, and
Spotify's own error page. Offering an answer that cannot be carried out is the thing
`availableRates` and `spotifyAvailable` both exist to prevent.

A machine on the allowlist sets it in **`.env.development.local`**, and the `.development.` is
load-bearing: Vite loads `.env.local` for `vite build` as well, so the obvious filename bakes a
local opt-in into any bundle built on that machine and deploys it. The suite pins its own value in
`vite.config.ts` and reads neither file — without that, the picker's tests passed on the machine
that had an env file and failed on a fresh checkout.

**This app cannot leave development mode, and the code is written for that.** Since May 2025
extended quota is organizations only — a registered business, a launched service, **250,000 monthly
active users** — so LyricLint stays capped at a hand-added allowlist (5 users for apps registered
after February 2026), and the owner's account must be Premium. The February 2026 dev-mode changes
also cap `/search` at `limit=10` and remove the _batch_ fetch endpoints; this module is on the
surviving side of both, because it asks for 6 results and reads one track at a time through
`GET /tracks/{id}`, which that migration names as the replacement. Player endpoints were untouched.
Do not "optimise" the metadata read into a batch call.

**Tokens live in `sessionStorage`, and neither longer nor shorter.** A refresh token in
`localStorage` is a credential at rest in a tool whose whole promise is that it keeps nothing, and
it would let an untouched page reach Spotify on load — which is the exact thing `youtubeAllowed`
exists to prevent. So being signed in _is_ the consent, `spotifySignedIn()` stands where
`youtubeAllowed` stands, and a remembered track comes back waiting for a press exactly as a
remembered file handle does.

They were held in module memory first, and that was stricter than this rule rather than safer than
it: module memory dies on **reload**, so every refresh of the workbench bounced the user through
Spotify's authorize screen to re-establish a session the browser still considered open. A browser
session survives a reload and ends with the tab, which is what "session-scoped" meant all along, and
script that could read the stored copy could already read the in-memory one. A refused refresh
clears storage as well, or every later reload rehydrates a dead token and spends a round trip
rediscovering that.

**The mark beside the track name is a requirement, not decoration.** Spotify's Design Guidelines
want their content attributed wherever it plays — the mark, the track and artist named beside it,
and a way back to the track on Spotify — and a missing one of those is the most common reason a
quota-extension request is refused. So `.media-attribution__spotify` is the **one literal color in
this stylesheet outside the favicon**: a third party's brand asset is not a tone from our palette, their
green is fixed, and their floor is 21px. A semantic token here would be the design system claiming
ownership of something it does not own, and would drift the moment the theme moved. It opens a new
tab, because the workbench is a document being typed into.

**Spotify refuses the name `localhost`, not merely insecure origins, and its error says the
opposite.** `redirect_uri: Insecure` on a blank white page is what comes back from
`https://localhost:5173/lint/` — a real TLS origin with an mkcert certificate behind it — because
the rule is about the host and Spotify wants `127.0.0.1`. Read as a statement about the scheme,
that message sends you to fix the one thing that was already right, and it cost two wrong guesses
here before anyone doubted the word "Insecure". `spotifyRedirectAllowed()` refuses `localhost` and
`[::1]` at any scheme and otherwise wants HTTPS or the loopback literal, and the picker names the
URL to open rather than the rule to satisfy — a user told "needs HTTPS" while looking at a padlock
has been told nothing. **Dev therefore runs on `https://127.0.0.1:5173/`,** which the certificate
`bun run certs` writes already covers.

It reports rather than repairs, and the rewrite it declines to do is the interesting part:
retargeting `localhost` to `127.0.0.1` on the way out would send the user back to a **different
origin**, where `sessionStorage` cannot see the PKCE verifier that was written under the first one
— so the flow would fail one step later with a far stranger message. The origin has to be one the
user is actually on.

**The sign-in is a full-page redirect back to `/lint/`, not a popup.** A popup costs another
prerendered route, a `postMessage` bridge and a blocker to fall foul of, to save a reload at the one
moment a reload is free — the draft is autosaved, and attaching audio is not typing. `attachSpotify`
is therefore re-entrant: it either attaches or leaves for Spotify carrying the link, and
`resumeSignIn` calls it again with that link on the way back. It runs **after** `openFor` at boot,
because the returning load has already restored this draft's pending track and `openFor` arriving
second would detach what the user just signed in to hear.

**The client id is committed, because it is not a secret and the alternative fails silently.** A
client id travels in the authorize URL and is inlined in the bundle however it is supplied; PKCE is
the flow for clients that can hide nothing, so there is no secret to leak. The trap it avoids is
that `import.meta.env` is resolved at **build** time: a value set as a Cloudflare Pages _runtime_
variable, or through `wrangler secret`, never reaches the bundle at all, so Spotify would work
locally and quietly vanish from the deployed picker. `PUBLIC_SPOTIFY_CLIENT_ID` still overrides it
for a fork, and setting it empty turns the feature off — when it resolves to nothing,
`spotifyAvailable` is false and the picker does not draw an answer it cannot carry out, the same
rule `availableRates` follows. `envPrefix` in `vite.config.ts` is what carries `PUBLIC_` onto
`import.meta.env`.

**`trackId` is its own field on the record, not a reused `videoId`.** They are different lengths in
different alphabets, and a record that confused them would fail as a 404 a long way from here. Both
are unindexed, so the live `version(2)` `mediaHandles` table takes them without a migration. The
store's `forget()` exists for the same reason the three draft copiers are called out above: the
pending fields were cleared by three hand-written runs of assignments, and a fourth source is a
field added to all three or silently dropped by two.

Implementation: `src/lib/ui/state/spotify-auth.ts` (PKCE, tokens, the redirect),
`media-spotify.ts` (the source and the link parser), and `media-spotify.test.ts`, whose stub SDK is
what makes "attaching plays nothing" an assertion rather than a hope.


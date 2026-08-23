# Apple Music: the fourth source, and the only remote one production ships

Touches: `src/lib/ui/state/media-apple.ts`, `scripts/apple-music-token.mjs`

## The rules

- The developer token is not a secret: inlined as `PUBLIC_APPLE_MUSIC_TOKEN` (a **build**
  variable — runtime vars never reach the bundle), signed by the `.p8` that never leaves the
  minting machine, capped at six months. `appleMusicConfigured` reads `exp` — the real
  failure is a stale token, and it must surface as the picker not drawing, not as a 401
  under a press. Rotate with `bun run token:apple -- --key <path>`; `ieee-p1363` in that
  script is load-bearing.
- `setQueue({ startPlaying: false })` is the cue; `playbackTimeDidChange` feeds the mirror
  but `time` answers from `currentPlaybackTime` (`rawTime()`, behind `started`) — a tap
  stamps `liveTime()`, and reading the event-fed mirror there made every sync anchor early
  by a jitter no offset could fix. The stub's `emit` moves the property with the event and
  `advance()` moves it without one, or the bug is invisible.
- The seek hold reports the target until the player agrees, and its give-up tally ignores
  the burst of stale events still carrying the origin (`settleToleranceSeconds` /
  `settleMaxEvents`); only an event that is neither origin nor target counts.
  `media-apple.test.ts` drives a burst longer than the tally.
- A seek before the first press is remembered and spent on the first play; the queue is
  built at `known` and rebuilt (`queuedAt`) if the position moved before starting.
- A remembered song is always pending — asking MusicKit whether it holds a token means
  loading Apple's script, which an untouched page must not do.
- The press may not pay for the script and the pop-up in that order: `prepareAppleMusic`
  runs when the audio dialog opens (pinned in `MediaPicker.svelte.test.ts`), and
  `authorizeAppleMusic` watches `window.open` for the blocked pop-up — MusicKit's promise
  stays pending forever on one, and everything downstream (`busy`, the picker) hangs with
  it. `blocked` is its own outcome. The user token is per origin, which is why no ordinary
  session tests this path; `media-store.test.ts` drives it end to end and asserts on `busy`.
- The search uses the developer token (no sign-in) against `music.storefrontId`. The link
  parser checks `?i=` before the path — Apple's share sheet copies album URLs, and the album
  id in the path is valid.
- The attribution is Apple's own lockup, unmodified: an `<img>` (inline SVGs collide on
  Illustrator's ids), inlined as a data URI via the `vite.config.ts` exception, `<picture>`
  with a `prefers-color-scheme` source, aspect ratio in CSS not integer attributes
  (`MediaStrip.svelte.test.ts` measures the box), 21px tall.
- Catalogue limits are the catalogue's: no producers exist to fetch, writers are one flat
  `composerName` passed through unsplit, the label is the played release's. Absent fields
  are left out, not emptied. The read asks `include=albums` for the label.
- Unverified: whether `playbackRate` holds on DRM-protected full tracks. If not, `rates`
  narrows to `[1]` in the `apple()` factory and the picker gains the third fact.

## Decision record

### Apple Music is the fourth source, and the only remote one the deployed build ships

It clears both of the things that make Spotify a local-only experiment, which is the whole reason
it exists here. **There is no allowlist and no quota review** — an Apple Developer Program
membership signs the token and any Apple Music subscriber can then use it, so this is the one
remote source a stranger can actually be offered. **And it has a playback rate**, which Spotify
has at no layer, which makes it the better source than YouTube for the job this application is
for.

What it costs instead is a signature, and that is the only real friction: the developer token is a
JWT signed with a Media Services key, and Apple caps it at **six months**.

**The token is not a secret, and treating it as one would break the feature silently.** It is
handed to every browser that loads the workbench — that is what a developer token _is_ — so it is
inlined in the bundle as `PUBLIC_APPLE_MUSIC_TOKEN` and committed to nothing. The `.p8` that signs
it is the secret and never leaves the machine that mints it. The trap this avoids is the one
Spotify's client id documents: `import.meta.env` resolves at **build** time, so a Cloudflare Pages
_runtime_ variable or a `wrangler secret` never reaches the bundle and Apple Music would work
locally and quietly vanish from the deployed picker. Production sets it as a **build** variable.

**`appleMusicConfigured` reads `exp` rather than testing for presence**, and that is not
belt-and-braces. The failure this will actually meet is not a missing token but a stale one, six
months from whenever it was last minted — and a stale one otherwise fails as a 401 under a press,
several steps after the point where anything could have said so. Reading the expiry turns that
into the picker not drawing an answer it cannot carry out, which is the rule `availableRates` and
`spotifyAvailable` both follow. A token the parser cannot read counts as unusable rather than as
unlimited: one this module cannot vouch for is one it should not offer.

Rotating it is `bun run token:apple -- --key <path to the .p8>`, one variable, and a redeploy.
`ieee-p1363` in that script is load-bearing — Node signs ES256 as a DER sequence by default and
JWS wants the raw r‖s pair, and the difference is invisible until Apple answers 401 with nothing
to go on.

**It is the least asymmetric of the three remote sources, and each difference is machinery the
other two need and this one does not.**

- **There is a cue.** `setQueue({ startPlaying: false })` points the player at a song without a
  note of sound, so attaching is silent the way YouTube's is — rather than by deferring the start,
  which is the whole shape of the Spotify module.
- **There is a `playbackTimeDidChange` event**, so nothing here polls. Both other bridges run a
  250ms timer because their players report no such thing.

  **But an event is what feeds the mirror, and it is never what `time` answers from.** That
  distinction shipped wrong and cost a whole feature its accuracy. `known` is written by the event
  handler and by nothing else, so a `position()` returning it handed the same stale number to
  `currentTime` _and_ to `liveTime()` — and `liveTime()` is what a sync tap stamps, precisely
  because the media section says it is "the source's own playhead read at the moment of the press,
  strictly fresher than the mirror it replaces". Here it was the mirror. Every anchor a run wrote
  was early by however long had passed since the last announcement, by a different amount on every
  tap, and on playback the wash led the vocal by a distance that changed line to line — which is
  how it was reported, and which no amount of tuning `tapOffsetSeconds` could have fixed, because
  the error is jitter rather than an offset. `currentPlaybackTime` is the live property, was
  already declared on `AppleMusicInstance`, and was read by nothing; `rawTime()` reads it the same
  defensive way YouTube reads `getCurrentTime()`. **The event goes on driving `events.timeChanged`
  and should**: the follow lagging the audio by up to one announcement is a separate effect, it is
  always in the same direction, and it is not what a tap is measured against.

  **It is behind `started`, for `seek`'s own reason.** Before the first press there is no
  `nowPlayingItem` for the property to describe, so it reads 0 while `known` holds the restored
  position the queue was built around — read live through that window, a reopened draft reports
  0:00 until something presses play.

  **The stub had to learn it too, and that is the half that hides this bug.** A `currentPlaybackTime`
  frozen at 0 while the emitted events climb models a player that does not exist, and it makes a
  source reading either one look correct. `stubMusic`'s `emit` moves the property with the event,
  and `advance()` moves it _without_ one — which is the gap the whole fix is about.

  **The seek hold is what keeps that gap off the screen, and its backstop had to learn the burst.**
  `position()` reports the seek `target` until the player agrees, the way both other bridges hide the
  same async gap — but MusicKit answers a `seekToTime` with a _burst_ of `playbackTimeDidChange`
  events all still carrying the position the skip started from, and the give-up backstop was a tally
  of those events. The burst spent the whole tally before the real position landed, released the
  hold, and dropped the readout back to the origin for a tick — the "yellow line flashes back to the
  previous line before going forward again" a skip was reported to show, in both directions, because
  the stale burst carries the origin whichever way the seek went. So the tally is no longer of all
  events: `origin` is captured at the seek (read from `rawTime()` before `known` is overwritten), an
  event still within `settleToleranceSeconds` of it is the burst and is held through uncounted, and
  only an event that has moved somewhere that is neither the origin nor the target — a seek the player
  redirected or ignored — counts toward giving up, which is the one case the backstop is actually
  for. The landing event (within tolerance of the target) still clears the hold at once.
  `media-apple.test.ts` drives a burst longer than `settleMaxEvents` and pins that the readout never
  reports the origin after the skip.

- **There is a rate**, and the source claims it back on every attach. The transport does not reset
  `availableRates` between attachments, so a song attached after a Spotify track would otherwise
  inherit that source's narrowing to `[1]`.

What it does share with Spotify is that **a seek before the first press has nowhere to land**:
`seekToTime` needs a `nowPlayingItem`, which does not exist until playback has started. So a
restored position is spent as the queue's `startTime` rather than as a seek, and `started` is what
tells the two apart. **A seek made in that window is remembered and spent on the first play**,
which is the debt Spotify settles as `position_ms` — and the window is not a corner case, because
the reconnect press takes seconds and a lyric line tapped while it settles is a seek with no
`nowPlayingItem` yet. Dropped, it produced the worst kind of wrong answer: the readout said the
tapped line while the audio came in from wherever the queue pointed. The queue is built at `known`
rather than at the load's own `startAt`, so a seek that lands mid-load costs nothing extra, and a
first play whose position no longer matches where the queue was built (`queuedAt`) rebuilds the
queue around it before starting — MusicKit's only pre-start positioning.

**A remembered song is always pending, and that is a deliberate divergence.** Spotify can come
back without a press where the session already holds a token, because that question is one
`sessionStorage` read. Apple's cannot: MusicKit keeps its own user token, and the only way to ask
whether it still has one is to load Apple's script — which is the exact thing an untouched page
must not do, and the reason `youtubeAllowed` exists. So the press pays for the script and the
sign-in together, and where Apple already has a session the sign-in step passes straight through,
which is the same trade the file source makes with an already-granted permission.

**But the press may not pay for both in that order, and getting it wrong hangs the whole
workbench.** The sign-in opens a pop-up, and a browser only allows one out of an activation it can
still see — so awaiting Apple's ~600KB script and its `configure()` round trips in front of
`authorize()` spends the very press the pop-up needed. On a cold load it was blocked every time.

What made that a catastrophe rather than an error message is MusicKit's own bookkeeping:

```js
this._window = window.open(e, this.target, m) || void 0;
_startPollingForWindowClosed(e){ this._window && … setInterval(…) }
```

That interval is the only thing that ever settles `authorize()`, and it is guarded on the window
existing. **A blocked pop-up is therefore not a rejection — it is silence for the rest of the
page's life**, and everything downstream inherits it: `load` never returns, `reconnect`'s `finally`
never runs, `busy` stays true, and the picker's search button — disabled on `busy` — reads as a
dead dialog in a part of the workbench the user had not even had open. One unsettled promise
presenting as three unrelated faults is why both halves of the repair are load-bearing.

- **The script is bought with an earlier press.** `prepareAppleMusic` runs when the audio dialog
  opens, so by the time a result is pressed the instance is already configured and `authorize()`
  runs in the same tick. This is not the module-scope load `youtubeAllowed` exists to prevent: it
  is a press, on the one surface that offers Apple Music. `MediaPicker.svelte.test.ts` pins the
  call, because removing it brings the hang back only on slow connections, where nothing else here
  would fail.
- **And `authorizeAppleMusic` watches for the refusal rather than waiting it out**, by patching
  `window.open` for the length of the call: a `null` return resolves the race at once, while
  MusicKit's promise stays pending forever. A duration cannot do this job — a sign-in is somebody
  typing a password and a code from another device, so any timeout short enough to feel like one is
  short enough to cut off a real sign-in. The five-minute backstop exists only so that a MusicKit
  which stops using `window.open` cannot restore an unbounded wait. `blocked` is its own outcome
  because it is the only one whose repair is a browser setting rather than another press, and the
  message says so.

**The reason this went unnoticed is that MusicKit's user token is per origin.** Every subscriber
who had signed in on `127.0.0.1` skipped the branch entirely; moving the dev server to a hostname
behind a proxy was enough to make everyone a first-time user again and light it up. A remote source
whose sign-in path only runs on a new origin is a path no ordinary session will ever test —
`media-store.test.ts` therefore drives it end to end and asserts on `busy`, not on the message.

**The search signs in to nothing.** Apple's catalogue answers to this build's own developer token,
so a user finds their song before being asked for an account — one better than Spotify, where
searching is what triggers the OAuth redirect. It searches `music.storefrontId` rather than a
fixed storefront, because a search against the wrong one returns songs the subscription cannot
play, which is the same class of wrong answer as offering a rate that will not apply.

**The link parser checks `?i=` before the path, and that ordering is the bug it exists to
prevent.** Apple's share sheet copies an _album_ URL with the song hanging off it as a query
parameter, which is the form nearly everybody will paste — and the album id in the path is a
perfectly valid id, so a parser reading the path first attaches the album's opening track for
every share link Apple produces. Silently, and only wrong for songs that are not track one.

**The attribution is Apple's own `Listen on Apple Music` lockup, and every part of how it is drawn
comes from a rule rather than a preference.** Spotify's glyph is one flat shape in one fixed green,
so `.media-attribution__spotify` can draw it from a path and spend a literal color on it. Apple's
guidelines say the opposite three times over — use their artwork and never draw one, never remove
the `Listen on` call to action from the badge, never stretch or recolor it — so this is their file,
whole, at its own aspect ratio, with no hover treatment and no `currentColor`. Even the white
lockup keeps Apple's gradient on the note; only the type is white, so there is no monochrome
version of _this_ asset to tint. (There is one of the standalone icon, which is a different
download and would lose the call to action.)

Four things that follow, and two of them are traps:

- **It is an `<img>`, not an inline SVG.** Both files were exported from Illustrator with the same
  `.st0`/`.st1` class names and the same `SVGID_1_` gradient id, so two of them inlined in one
  document collide on both — and a URL reference is also what makes "unmodified" true by
  construction.
- **It is inlined as a data URI, by an exception in `vite.config.ts`.** Apple's lockups are ~7.5KB
  each because Illustrator exported them, over Vite's 4096-byte `assetsInlineLimit`, so they
  shipped as separate files and the badge visibly popped in a moment after a song attached — a
  request that only starts when the element mounts, which is exactly when the user is looking at
  that row. The obvious fix, minifying the files, is the one thing the guidelines forbid; a data
  URI is byte-for-byte the same file. It is the function form of the option rather than a raised
  global limit, because this is one exception with a reason and not a new threshold.
- **`<picture>` with a `prefers-color-scheme` `<source>`**, not a theme value read in Svelte. The
  theme here _is_ that media query, and this way the browser fetches exactly one of the two files.
- **The aspect ratio is declared in CSS, not in `width`/`height` attributes.** Those are parsed as
  integers, so the artwork's 125.1 × 27.78 rounds to 125 × 28 and squeezes the badge by 0.9%
  horizontally — invisible, and still exactly the stretching the guidelines name.
  `MediaStrip.svelte.test.ts` measures the rendered box rather than trusting the rule.
- **It is 21px tall, matching the Spotify mark** rather than the row, so neither attribution costs
  the strip any height — the same constraint the shortcut captions are measured against.

**The cover takes the video's band, and it is one compact row.** It is the same slot at the
foot of the right panel, chosen for the same reason: a picture is looked at rather than operated,
so its pixels cost a scroll there and would cost the document anywhere else. The row is the whole
band — thumbnail, title over artist, the mark at the far end — and that is a correction with a
history worth keeping. The band used to expand into a stage: the full-width picture with the facts
scrimmed onto its two ends, a second transport drawn over it, a chevron to fold it away, and a
stored preference (`artworkOpen`) remembering the fold per workspace, defaulted by
`isPhoneLayout()`. Every part of that was machinery for managing a height the compact row simply
does not cost. The stage spent two hundred pixels of the findings column on a picture nobody
operates, and the transport on it was a second copy of the controls already under the document — a
row of buttons for a picture nobody is looking at. The stage went, and the fold, the chevron, the
preference, `isPhoneLayout()` and the `--color-scrim*` tokens all went with it, because each
existed only to serve it.

**Looking at the picture bigger is a press on the picture.** The thumbnail is a button
(`View album art`) and the full-size cover opens in a modal — a modal because looking at artwork
is a detour from transcribing, and the way back is every way out a dialog already has: `Escape`,
its own close control, and the backdrop press. The dialog names the track in its header, and its
width caps against the viewport's _height_ as well as its width, because the surface is a square
picture plus two rows of chrome — a width-only cap pushes the actions below the dialog's own foot
on a short window.

**The dialog carries the two artwork commands, and they are one implementation.** `Copy image URL`
and `Download album art` ride under the picture they act on, and the Song panel's metadata section
offers the same pair beside the song's facts — both render `ArtworkActions.svelte` rather than
mirroring the buttons by hand, for the reason the diagnostic card and its popover share their row:
two copies would be two copies of the copied-confirmation swap and the download's open-in-a-tab
fallback, and the copy that drifted would be the one nobody is looking at.

**The mark is on the row, which never leaves the screen.** A third party's mark must stand
wherever their song is playing, and the row stands for as long as one is attached. The modal is
extra, so nothing a guideline requires rides only inside it.

- **Title over artist, centred against the thumbnail.** The song is what the row is about and the
  artist qualifies it. The type is a step up from caption size, because these two lines _are_ the
  row and have a thumbnail's height to fill — and `--media-thumb` is read off `--control-height-lg`
  rather than picked, which keeps the thumbnail in the same family as the strip at the foot of the
  other column.
- **Artist and title are separate facts, not a split string.** `SongDetails` carries both; `name`
  stays the one-line `Artist — Title` a single readout wants. Splitting that back up would be
  parsing a separator this application chose, which works until an artist has an em dash in their
  name. Both catalogue sources have the two fields already, so Spotify reports them too — and the
  Song panel's list therefore gates on the facts _it_ draws rather than on `songDetails` existing,
  or a Spotify song opens an empty `<dl>` under a heading.
- **The name and the mark are said once, and the band is where a catalogue source says them.** The
  strip draws neither — three words twice on one screen, in the row with least space for them.
- **The hand-off is `drawsCoverBand(sourceKind)`, and it is one function because it is one
  decision.** The panel asks it whether to draw the band and the strip asks it whether to name the
  song itself; two conditions for that would put the title in both rows or in neither.
- **The row draws on the name, and the picture only decides whether there is a thumbnail.** This
  is a correction, and the version it replaces looked reasonable: the band waited on the cover, on
  the grounds that drawing at `sourceKind === 'apple'` would put empty chrome on screen for the
  round trip the catalogue read takes. What that missed is that a song is _named_ the moment it
  attaches — so the name and the badge sat in the transport strip for the length of the read and
  then jumped down here, which reads as a glitch rather than as a hand-off. Worse, a catalogue
  read that answers 404 or 403 reports no artwork _ever_, so a band gated on the picture left that
  song anonymous — playing, with neither required mark drawn — for as long as it was attached. The
  row stands the moment the source names the song, reserves no empty square for a picture that may
  never come, and the thumbnail grows in at its head when the cover lands.
- **Both copies of the cover are decorative (`alt=""`).** The track is named in the row beside the
  thumbnail and in the dialog's own header, and the press carries its name on the button
  (`View album art`) — an alt on either image would announce the same fact twice.
- **One `MediaAttribution.svelte` for both marks and both surfaces.** The mark travels with the
  name, so it is rendered by the band for a catalogue source and by the strip for anything else;
  two copies of that markup would be two copies of every guideline rule above, and the copy that
  drifted would be the one nobody is looking at.
- **`artwork` is on the transport, not on the Apple source**, because a cover is a fact about what
  is playing and the panel drawing it should not have to know which of four things is playing.
  Sources with no picture simply never call `artworkChanged`, which is every source but this one
  today. It is cleared in `beginAttachment` rather than after the load, or the outgoing song's
  cover sits over the incoming one for as long as its metadata takes.
- **Apple's `artwork.url` is a template, not an address** — `{w}` and `{h}` are still in it, and
  passed through unresolved the panel draws a broken image. The size is chosen in `media-apple.ts`
  at roughly twice the panel's narrowest width, because the CDN renders whatever is asked for and
  the alternative is every surface picking its own.


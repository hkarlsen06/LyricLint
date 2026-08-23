# YouTube: the second source, asked for every session

Touches: `src/lib/ui/state/media-youtube.ts`, `src/lib/ui/media/MediaVideo.svelte`,
`src/lib/ui/state/media-test-youtube.ts`

## The rules

- The opt-in is per session and deliberately not persisted; `loadYouTubeApi()` is the whole
  network surface and nothing calls it at module scope; the host is `youtube-nocookie.com`.
  A remembered video comes back pending, waiting on a press.
- The source hides the async gap: `seekTo`'s target is reported from `time` until the player
  agrees (back-2-then-resume must not move five seconds — there is a test with read
  latency). `getCurrentTime` polls at 250ms while playing only.
- `playbackRates` is the offer; `availableRates` is that list intersected with what the
  source can do. `preservesPitch` has no YouTube counterpart and is not faked.
- No schema bump: `source`/`videoId` are unindexed on the live `version(2)` `mediaHandles`
  table, and absence reads as `'file'`.
- The player must be visible (embed terms, 200×200 minimum — `px` deliberately, not `rem`).
  It draws at the foot of the right panel, outside the panes (a tab switch must not rebuild
  the iframe — `RightPanel.svelte.test.ts` pins element identity), below the ignored-rules
  footer, `min-height` allowed to pillarbox.
- `media-test-youtube.ts`'s load count is what makes "nothing has contacted Google" an
  assertion rather than a hope.

## Decision record

### YouTube is a second source behind the same transport, and it is asked for every session

Transcribers' audio is usually on YouTube, so it is the source most of them actually have. It is also
the only thing in this application that contacts a third party, and both facts have to stay true at
once.

**One transport, two sources.** `MediaPlayer` holds a `MediaSource` — `time`, `duration`, `rates`,
`play/pause/seek/setRate/clear/destroy`, reporting upward through events — and every rule worth
having is written once against that interface: the two-second resume rewind, the clamp to both ends,
nudge and scrub cancelling the run-in, `liveTime()`, the `'progress' | 'settled'` reasons. A source
reports; it never decides. The evidence the abstraction did not disturb the default is that
`media-player.test.ts` needed no changes at all.

**The source hides the async gap; the transport must never learn about it.** The media element is
synchronous and the IFrame API is a postMessage bridge, so `createYouTubeSource` records the target
of a `seekTo` and reports _that_ from `time` until the player agrees. Without it, back-2-then-resume
moves five seconds, and there is a test pinning exactly that against a stub with read latency.
`getCurrentTime` is a poll rather than an event, so it runs at 250ms while playing and stops on
pause, end, clear and destroy — a poll that outlives its player is a leak that costs battery on a
page nobody is looking at.

**The opt-in is per session and deliberately not persisted.** A stored "yes" would load Google's
script on a page nobody has touched, which is the thing the consent exists to prevent. So a
remembered video comes back as a pending source waiting on a press, exactly as a file handle waits on
a gesture. `loadYouTubeApi()` is the whole network surface and nothing calls it at module scope. The
host is `youtube-nocookie.com`. The sentence stating the trade is prose in the Tools panel, not a
tinted warning box, and it says the two things that are actually true: Google sees which video is
being transcribed, and that draft stops working offline.

**Offering a rate that will not apply is worse than offering fewer.** `playbackRates` is now the
_offer_; `MediaPlayer.availableRates` is that list intersected with what the source says it can do,
and the strip renders the latter. The offer stands until the source contradicts it, because
collapsing to one option and growing back is worse than either. `preservesPitch` has no YouTube
counterpart — the player pitch-corrects itself and exposes no control — so there is nothing to set
and that is documented rather than faked.

**No schema bump.** `source?: 'file' | 'youtube'` and `videoId?` are unindexed, so the live
`version(2)` `mediaHandles` table takes them without a migration, and **absence reads as `'file'`** —
which is what keeps every record written before YouTube existed working. That is why the discriminant
is optional rather than required.

**The video cannot be a hidden iframe**: YouTube's embed terms require a visible player, minimum
200×200. That minimum is `px` and not `rem` — the one place in the system where a literal length is
right, because a rem shrinks below a third party's stated floor on a smaller root font.

**It draws at the foot of the right panel, not in the editor column.** It began above the strip,
on the reasoning that the picture and the controls under it are one band; what that missed is that
they are used differently. The transport is operated constantly — three keys, a scrubber — and
belongs under the document because it controls what the document is transcribed from. The picture
is only looked at, and two hundred pixels of it taken off the editor is two hundred pixels off the
thing being typed into, where the same two hundred off a scrolling list of findings costs a scroll.

Three things that placement depends on:

- **It is the panel's _last_ band, under the ignored-rules footer rather than over it**, and the
  order is by scope: the pane, then the chrome belonging to that one pane, then the chrome
  belonging to the window. A picture that survives every tab switch cannot sit above a bar that
  exists only inside the linter, or changing tabs would move it.
- **It is outside the panes**, so a tab switch does not destroy and rebuild the iframe — which is a
  black flash and a lost playhead every time. `RightPanel.svelte.test.ts` pins the element's
  identity across a switch.
- **The frame takes the panel's width and holds 200px as a floor.** At 21rem the panel is narrower
  than the 356px a 200px-tall 16:9 box wants, so `min-height` overrides `aspect-ratio` and the
  picture is pillarboxed by a few pixels. A couple of pixels of black beside the video costs
  nothing; a frame 189px tall is a term broken quietly.

Implementation: `src/lib/ui/state/media-youtube.ts`, `MediaVideo.svelte`, and the stub in
`media-test-youtube.ts`, which is what makes "nothing has contacted Google" an assertion rather than
a hope — its load count is the number of times the real loader would have injected a script tag.


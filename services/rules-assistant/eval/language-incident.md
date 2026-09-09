# Norwegian tool annotations switching to German

On September 9, 2026, the visitor sent `Korrekturles`. The assistant displayed
German `show_lyrics` and `propose_edits` notes, followed by a Norwegian final
answer. Checking only final answer blocks had missed the annotation failure.

## What the reproduction established

The baseline was commit `2f3d5cc`, using `gpt-5.6-luna`, medium reasoning,
`reasoning.context: current_turn`, and the committed corpus. Tests used the
same Responses request builder and parser through the configured AI Gateway,
inside a temporary authenticated Wrangler remote preview. Production traffic
and stored drafts were not involved. The fixture was fictional Norwegian lyrics
with punctuation, doubled spaces, and repeated refrains; `tool-language.ts`
contains the fixture.

Each complete run started with the visitor question alone. The harness granted
`read_scribe`, acknowledged lyric references, rejected proposed edits/links,
replayed the returned provider items, and withheld tools after four rounds.
Annotations were inspected separately from the final answer. The experiment
used the non-streaming Responses transport to collect complete results;
production's provider and the checked-in eval use streaming.

| Change from the baseline                                                   |                 Complete runs | Observed language                                                                       |
| -------------------------------------------------------------------------- | ----------------------------: | --------------------------------------------------------------------------------------- |
| None; question `Korrekturles`                                              |                             3 | German annotations in all three, beginning with the first visible tool note             |
| Question `Kan du korrekturlese denne teksten?`                             |                             2 | Norwegian annotations and final answer in both                                          |
| Remove the reviewed corpus; keep `Korrekturles`                            |                             1 | German annotations and answer                                                           |
| Omit encrypted reasoning items from replay; keep all other history         |                             2 | Norwegian annotations and answer in both                                                |
| Strengthen the general language instruction and tool-note descriptions     |                             1 | German annotations and answer                                                           |
| Add a specific Norwegian explanation of `Korrekturles`                     | 1 Norwegian, 1 German control | Norwegian for `Korrekturles`, but incorrectly Norwegian for German `Korrekturlesen` too |
| Change only the model to `gpt-5.6-sol`; original prompt and `Korrekturles` |                             3 | Norwegian annotations and answer in all three                                           |
| Sol with original prompt and German `Korrekturlesen`                       |                             1 | German annotations and answer                                                           |

Two additional Luna prompt-variant attempts ended in a malformed final answer
and are excluded from the completed-run counts. These small samples establish a
reproduction, not a general model accuracy rate. The three Sol Norwegian runs
took 32–44 seconds for the complete tool sequence; they are not a latency SLA.

This points to an early language-identification failure on the short command,
carried into the tool continuation. The encrypted reasoning was not inspected;
the replay ablation is evidence of its influence, not access to the model's
internal explanation. Corpus removal shows that German material in the corpus
is not necessary for the failure. The application does not send browser locale,
geolocation, or selected song language as a response-language setting.

## The resulting change

The production provider uses Sol at the same medium reasoning effort. The
visitor chose the stronger model after reviewing the cost difference. At the
published September 9 prices, input/cached-input/output cost $4/$0.40/$20 per
million tokens; explicit cache writes cost $5. The rates in `src/config.ts`
move with the model so quota accounting and output-spend reservations remain
accurate. Existing dollar limits still apply. Source:
[OpenAI's Sol model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

The prompt and all three visible tool-note schemas explicitly apply the visitor
language requirement to annotations as well as final blocks. No word-specific
Norwegian override is shipped, and reasoning replay remains intact. The opt-in
live tool-language eval exercises the entire continuation and checks notes
independently, so a Norwegian final answer cannot hide German annotations.

The final streaming-provider regression with the shipped Sol configuration passed:
five Norwegian notes across `manage_links` and `propose_edits`, followed by a
Norwegian final answer. The unit regression separately verifies that a German
`show_lyrics` note fails even when the final answer is Norwegian.

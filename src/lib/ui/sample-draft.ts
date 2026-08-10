/**
 * A short transcription for the empty linter panel to load on request.
 *
 * A linter is unrecognizable until it has found something, so the fastest way
 * to explain this one is to let it run. The lyrics are invented, and the
 * problems in them are deliberate and chosen for range rather than volume —
 * along two axes at once:
 *
 * - **Both fix kinds.** Two curly quotes the fixer can settle mechanically,
 *   and the rest judgment calls it can only offer, so the bulk strip gets both
 *   of its numbers ("Fix 2 issues automatically" beside the decisions), the
 *   card its `Fix all 2` batch, and the severity chips more than one row.
 * - **Every provenance the panel can cite.** The contraction, the quotes and
 *   the lowercase pronoun cite Genius annotations; `Definately` cites the
 *   language authorities that correct it; the trailing period is a LyricLint
 *   reading and wears the derivation mark; and `I has` is left for Harper,
 *   which arrives a beat later under its own citation. A sample that only
 *   ever showed one citation would misrepresent what the meta line says.
 *
 * `sample-draft.test.ts` pins the count and the mix, because the sample is
 * only worth loading while it still demonstrates that spread: a new rule that
 * happens to fire here would quietly turn the introduction into the
 * warning-heavy validator this product is not. The Harper half is pinned in
 * `harper.test.ts`, beside the other real-WASM assertions, so this file's own
 * suite stays fast.
 *
 * English only, and `sampleDraftLanguage` is why. The lyrics would otherwise
 * trip `language.selection-mismatch` the moment they were loaded under another
 * selection, which is a true finding about a document the user did not write
 * and a poor first impression. Surfaces offer the sample when the selected
 * language matches and stay quiet when it does not.
 */
export const sampleDraftLanguage = 'en';

export const sampleDraftText = `[Verse 1]
I dont need a map to find the way back
Streetlights counting down the block
She said “hold on” and the whole street listened
The door still knows my name.

[Chorus]
Hold the line, hold the line
Definately loud enough to carry over water
Hold the line, hold the line

[Verse 2]
Morning came in sideways through the glass
I has kept the porch light burning
Every window i pass is another year`;

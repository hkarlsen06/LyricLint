/**
 * A short transcription for the empty linter panel to load on request.
 *
 * A linter is unrecognizable until it has found something, so the fastest way
 * to explain this one is to let it run. The lyrics are invented, and the four
 * problems in them are deliberate and chosen for range rather than volume: two
 * curly quotes the fixer can settle mechanically, and two judgment calls it can
 * only offer. That gives the bulk strip both of its numbers ("Fix 2 issues
 * automatically" beside "2 need a decision"), the card its `Fix all 2` batch,
 * and the severity chips more than one row to show — without handing someone
 * who has been here for ten seconds a wall of findings.
 *
 * `sample-draft.svelte.test.ts` pins the count and the mix, because the sample
 * is only worth loading while it still demonstrates that spread: a new rule
 * that happens to fire here would quietly turn the introduction into the
 * warning-heavy validator this product is not.
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
The door still knows my name

[Chorus]
Hold the line, hold the line
Loud enough to carry over water
Hold the line, hold the line

[Verse 2]
Morning came in sideways through the glass
Every window i pass is another year`;

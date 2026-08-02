/*
 * The invented documents the product shots are taken of, and the scene setup
 * the performer shots share.
 *
 * These lived inline in `render-workbench-shot.mjs` until a second script
 * needed the performer scene — the still and the motion loop are the same
 * workbench, the same roster and the same song, photographed once and filmed
 * once, so a copy of either in two files is a copy that drifts. The rule is the
 * one `copySectionLinks` is written down for: a thing rebuilt in two places is
 * only as correct as the least careful place that rebuilds it.
 *
 * Every document below is invented, line by line. A product shot of a lyric
 * linter is the one screenshot that must not contain a real transcription: the
 * picture ships in the bundle and on every social card, so anything quoted in
 * it is quoted permanently.
 */

/** The performers used throughout the product-shot scenes. */
export const performerNames = ['Avery', 'Blair'];

/** The phrase the performer scene hands to Avery. */
export const assignedPhrase = 'Somewhere past the bridge';

/**
 * The hero shot's document — written to be wrong in several ordinary ways at
 * once (a written-out section label, a lowercase line start, a subject and verb
 * that disagree, a typewriter apostrophe, a trailing comma, a bare ad-lib),
 * because a linter showing an empty panel is a picture of nothing happening.
 * Verse 2 is the clean, initially untagged passage from the performer scene;
 * the hero-shot script runs that scene's assignment before it captures.
 */
export const transcription = `Verse 1:
i has counted every streetlight on the way
you said we'd drive until the radio gave out, yeah
and the "quiet" part was never really quiet

Chorus:
hold the line, hold the line
we was never gonna make it definately
hold the line til the morning comes, yeah

[Verse 2]
The map you drew was a coffee ring and a guess
I keep it folded in the door where the cold gets in
We counted three exits and took none of them
Somewhere past the bridge the signal dropped again

Bridge:
(dont look back)
so tell me what the quiet part was for
tell me what the quiet part was for   `;

/**
 * The performer-tagging document — invented like the other, but deliberately
 * *clean*: its subject is the picker over a selection, and a column of
 * unrelated underlines would compete with it. It is a whole short song rather
 * than an excerpt, because the still is cropped *portrait* — it sits beside the
 * section's copy on a desktop, so what fills its height is a long
 * transcription. The chorus and the bridge are already marked up, legend and
 * spans, so the roster's colours are on screen above the selection being
 * assigned. There is deliberately no second chorus: two of them would raise
 * `section.unlinked-repeat` on the headers, which is a real finding and not
 * this picture's subject.
 *
 * Verse 2 is deliberately the one section with no legend, because it is the
 * section the shot assigns. The apostrophes are typewriter ones on purpose —
 * a curly `we'd` draws a finding whose fix the document-replacement lead then
 * previews as a diff, in a picture whose whole subject is the picker.
 */
export const performersTranscription = `[Verse 1]
I counted every streetlight on the way
You said we'd drive until the radio gave out (Yeah)
And the quiet part was never really quiet
We let the engine hum instead of answering

[Chorus: Avery & <i>Blair</i>]
Hold the line, hold the line
<i>We were never gonna make it quietly</i>
Hold the line before the morning comes

[Verse 2]
The map you drew was a coffee ring and a guess
I keep it folded in the door where the cold gets in
We counted three exits and took none of them
Somewhere past the bridge the signal dropped again

[Bridge: Blair]
Tell me what the quiet part was for
You can say it now, no one is on the road

[Verse 3]
The morning came in sideways through the glass
You wrote our names in breath and let them fade
I held the wheel like it was listening
And hummed the part we never wrote down

[Outro: Avery]
Leave the radio on for me
Leave the radio on`;

/**
 * The grammar shot's document. One Harper finding and nothing else, so the
 * hovered popover — message, Harper citation, previewed fix — is the whole
 * picture. `I has` is the disagreement; every other line is clean, the header
 * is unnumbered because a single `[Verse 1]` raises `section.verse-numbering`
 * on the `1`, and the lines are short so the crop hugs the popover instead of
 * trailing empty editor to the right of it.
 *
 * **It runs past the popover's foot on purpose.** The still crops to the card
 * and stops, so four lines were enough for it — but the loop's crop is the
 * union across time, and it has to hold a card that is only open for half of
 * it. At four lines the frames either side of that were two thirds empty
 * editor, which reads as a document that has run out rather than as one being
 * worked on. The extra lines sit *behind* the card while it is open and fill
 * the frame once it closes, and they are clean, because a column of unrelated
 * underlines would compete with the one finding this picture is about.
 *
 * **The scene's length is a regression the integration now owns.** Lyrics carry
 * no terminal punctuation, so a whole transcription reads to Harper as one
 * enormous run-on sentence. Past roughly 200 characters Harper adds a
 * document-wide Readability finding; its own overlap removal used to let that
 * prose-only result swallow the useful `I has` agreement before LyricLint
 * filtered Readability out. The provider removes inapplicable findings before
 * it removes overlaps now, and the real-WASM regression in `harper.test.ts`
 * crosses that threshold. `render-motion.mjs` still asserts that this document
 * produces **one** finding before it films, so a later change fails loudly
 * instead of recording a pointer hovering over text with nothing to say.
 */
export const harperTranscription = `[Verse]
I has counted every streetlight
You said we'd drive all night
And the quiet part was never quiet
We let the engine hum instead
The map you drew was a coffee ring
I keep it folded in the door`;

/**
 * Wait for the workbench to be the workbench: the editor present, and the boot
 * screen — which owns the window above every layer in the scale, including
 * anything a script could otherwise wait on inside the shell — gone.
 */
export async function waitForWorkbench(page) {
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await editor.waitFor({ state: 'visible', timeout: 60_000 });
	await page.locator('.boot-screen').waitFor({ state: 'detached', timeout: 60_000 });
	return editor;
}

/**
 * Populate the product-shot roster before its tagged document is pasted.
 *
 * The roster comes first so the pasted chorus's legend resolves against real
 * performers instead of arriving as unresolved voices — the same order the
 * landing page's own copy tells a reader to work in.
 */
export async function preparePerformerRoster(page) {
	await page.getByRole('tab', { name: 'Performers' }).click();
	for (const name of performerNames) {
		await page.locator('#new-performer').fill(name);
		await page.getByRole('button', { name: 'Add', exact: true }).click();
	}

	// Each add raises a confirmation toast, and a toast in a product shot is a
	// notification about work the reader never did. Dismissed by their own
	// control rather than waited out, because their countdown is longer than
	// anything else these scripts wait for.
	const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
	while (await dismiss.count()) await dismiss.first().click();
	await page.locator('.toast').first().waitFor({ state: 'detached', timeout: 10_000 });
}

/** The performer detail scene: a populated roster, then the full song. */
export async function preparePerformerScene(page, editor) {
	await preparePerformerRoster(page);

	await editor.click();
	await page.keyboard.press('Control+A');
	await editor.fill(performersTranscription);

	// The `document`-tier rules settle 1500ms after typing stops. Nothing in
	// this scene is about a finding, but the panel is still filling until they
	// land and a re-lint mid-capture moves the document under the pointer.
	await page.waitForTimeout(2000);
}

/**
 * Where the drag that selects the phrase starts and ends.
 *
 * Measured off the line's own text rather than guessed in pixels, or the shot
 * selects a different phrase every time the editor font moves.
 */
export async function selectionPoints(page, phrase = assignedPhrase) {
	const points = await page.evaluate((text) => {
		const line = [...document.querySelectorAll('.cm-line')].find((candidate) =>
			candidate.textContent.includes(text)
		);
		if (!line) return undefined;
		const phraseFrom = line.textContent.indexOf(text);
		const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
		let node = walker.nextNode();
		let offset = 0;
		let start;
		let end;
		while (node) {
			const length = node.textContent?.length ?? 0;
			if (!start && phraseFrom >= offset && phraseFrom < offset + length) {
				start = { node, offset: phraseFrom - offset };
			}
			const phraseTo = phraseFrom + text.length;
			if (phraseTo > offset && phraseTo <= offset + length) {
				end = { node, offset: phraseTo - offset };
				break;
			}
			offset += length;
			node = walker.nextNode();
		}
		if (!start || !end) return undefined;
		const range = document.createRange();
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
		const box = range.getBoundingClientRect();
		return {
			from: { x: box.left + 1, y: box.top + box.height / 2 },
			to: { x: box.right, y: box.top + box.height / 2 }
		};
	}, phrase);
	if (!points) throw new Error(`no editor line starts with "${phrase}"`);
	return points;
}

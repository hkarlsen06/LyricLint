/** Shared scene setup for generated product stills and motion.
 * Detail scenes use invented lyrics. The hero uses the author's City Lights,
 * with permission, through hero-shot-scene.mjs.
 */

import { performersTranscription } from './shot-lyrics.mjs';
export { performersTranscription };
export { installHeroScene, prepareHeroScene } from './hero-shot-scene.mjs';

/** The performers used throughout the product-shot scenes. */
export const performerNames = ['Avery', 'Blair'];

export { installPlayerScene, preparePlayerScene, playerLineTimes } from './player-shot-scene.mjs';

/** Keep the timed lyrics and the transport together in a compact detail frame. */
export async function playerShotRegion(page, scene) {
	return page.evaluate((kind) => {
		const editor = document.querySelector('.editor-region').getBoundingClientRect();
		const media = document.querySelector('.workspace-media').getBoundingClientRect();
		const metadata = document.querySelector('.song-panel > section').getBoundingClientRect();
		const even = (value) => Math.ceil(value / 2) * 2;
		return kind === 'song'
			? {
					x: Math.floor(metadata.left - 16),
					y: Math.floor(metadata.top - 16),
					width: even(metadata.width + 32),
					height: even(metadata.height + 32)
				}
			: {
					x: Math.floor(editor.left),
					y: Math.floor(editor.top),
					width: even(editor.width),
					height: even(media.bottom - editor.top)
				};
	}, scene);
}

/** The phrase the performer scene hands to Avery. */
export const assignedPhrase = 'Somewhere past the bridge';

/** The shared browser window for every still and motion scene. */
export function shotViewport(scene) {
	if (scene === 'player') return { width: 1100, height: 620 };
	// Artwork commands keep their rows when the copied confirmation appears.
	if (scene === 'song') return { width: 1280, height: 620 };
	// Give the floating action tray room outside the portrait crop.
	return {
		width: scene === 'performers' ? 1440 : 1280,
		height: scene === 'performers' ? 1150 : 820
	};
}

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

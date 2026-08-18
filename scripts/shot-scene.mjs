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

/** The shared browser window for every still and motion scene. */
export function shotViewport(scene) {
	return { width: 1280, height: scene === 'performers' ? 1150 : 820 };
}

/**
 * The hero shot's document — written to be wrong in several ordinary ways at
 * once (a written-out section label, a lowercase line start, a subject and verb
 * that disagree, a typewriter apostrophe, a trailing comma, a bare ad-lib),
 * because a linter showing an empty panel is a picture of nothing happening.
 * Verse 2 is the clean, initially untagged passage from the performer scene;
 * the hero-shot script runs that scene's assignment before it captures.
 *
 * The chorus repeats after the bridge, as a chorus does — the same four lines
 * again, so the panel reports that section's findings twice, which is what a
 * transcription of a real song produces. It also fills the editor column: at
 * one chorus the document ran out two thirds of the way down and the rest of
 * the picture was empty canvas, which is the failure the shot's own viewport
 * width is chosen to avoid, arrived at from the other direction.
 *
 * **Two of them do not raise `section.unlinked-repeat` here, and the reason is
 * the reason the sibling document below gives for having only one.** That rule
 * reads `section.header`, which a *bracketed* header is; these labels are
 * written out, so the parser hands each one over as a lyric and every section
 * in this document is headerless. `section.header-prose` is what answers them —
 * one card per label, which is the subject — and the repeat is invisible to the
 * link rule. Bracket these headers and a real link suggestion appears.
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
tell me what the quiet part was for   

Chorus:
hold the line, hold the line
we was never gonna make it definately
hold the line til the morning comes, yeah`;

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

/**
 * Drag across a phrase the way a reader does, and wait for the picker it opens.
 *
 * The performer picker opens on a *pointer* selection and on nothing else, so
 * neither the still nor the loop may reach for it programmatically: the gesture
 * is the API. Shared because three scenes now make it — the still, the
 * performer loop, and the hero loop, which makes it twice.
 */
export async function dragPhrase(page, phrase = assignedPhrase) {
	const points = await selectionPoints(page, phrase);
	await page.mouse.move(points.from.x, points.from.y);
	await page.mouse.down();
	await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
	await page.mouse.up();
	const picker = page.locator('.picker-layer .picker');
	await picker.waitFor({ state: 'visible', timeout: 10_000 });
	return picker;
}

/**
 * Expand the panel's leading finding — the card whose explanation, citation and
 * fix are half of what the hero scene is a picture of, and whose expansion is
 * what previews that fix in the document as a diff.
 *
 * It presses the row rather than naming a rule, so the scene follows
 * `diagnostics/order.ts` instead of pinning it.
 *
 * **The press is made whether or not the card is already open, and skipping it
 * when it is breaks the scene two steps later.** `DiagnosticList` expands the
 * leading card on its own, so the obvious guard here is to press only a closed
 * one — but selecting a diagnostic also selects its range in the document, and
 * that is what leaves the editor's selection somewhere other than the phrase
 * the scene re-drags across afterwards. Skipped, the drag re-selects a range
 * that is already selected, CodeMirror emits no new selection, and the picker
 * that opens on `select.pointer` never opens at all.
 */
export async function openLeadingDiagnostic(page) {
	const first = page.locator('.diagnostic-list > li').first();
	await first.waitFor({ state: 'visible', timeout: 30_000 });
	await first.locator('.diagnostic-list__navigate').click();
	await page.waitForTimeout(600);
}

/** Nothing carries a focus ring in a still: it reads as a control to press. */
export async function blurEverything(page) {
	await page.evaluate(() =>
		document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
	);
}

/**
 * The hero scene: the whole workbench in use, which is what the landing page's
 * first screen is a picture of.
 *
 * It is here rather than in the shot script because the loop films the same
 * scene the still photographs — and now films it *twice*, since the loop has to
 * come back to this exact state for its last frame to be its first. Three
 * copies of a setup this long is three copies that drift, which is the rule
 * this file opens with.
 *
 * The order is load-bearing at both ends. The roster comes first so the legend
 * the assignment writes resolves against real performers; the leading card is
 * opened before the phrase is re-selected, because opening it is a press in the
 * panel and would dismiss the picker if it came second.
 */
export async function prepareHeroScene(page, editor) {
	// The hero borrows the performer detail scene's roster before pasting its
	// untagged Verse 2. The assignment below then resolves its generated legend
	// against real performers and draws both colours in the editor.
	await preparePerformerRoster(page);

	await editor.click();
	await page.keyboard.press('Control+A');
	await editor.fill(transcription);

	// A draft called `Untitled transcription` in a product shot says the workbench
	// has not been used. The switcher's field is the rename, so this is the same
	// press a reader would make.
	const title = page.getByRole('textbox', { name: "'Scribe title" }).first();
	if (await title.count()) await title.fill('Hold the Line');

	// Run the performer detail's actual two-step assignment on Verse 2: Avery
	// sings the selected phrase, then Avery and Blair are chosen for the rest.
	// The resulting legend, markup and colours are therefore produced by the
	// workbench instead of being hand-written into a second fixture.
	const picker = await dragPhrase(page);
	await picker.getByRole('button', { name: performerNames[0], exact: true }).click();
	await picker.getByRole('button', { name: 'Next', exact: true }).click();
	await picker.getByRole('button', { name: performerNames[0], exact: true }).click();
	await picker.getByRole('button', { name: performerNames[1], exact: true }).click();
	await picker.getByRole('button', { name: 'Apply', exact: true }).click();
	await picker.waitFor({ state: 'detached', timeout: 10_000 });

	// The `document`-tier rules settle 1500ms after typing stops, and they are the
	// ones that say the most about a whole song. Capturing before they land
	// photographs a panel that is still filling.
	await page.waitForTimeout(2500);
	await page.getByRole('tab', { name: 'Linter' }).click();
	await openLeadingDiagnostic(page);
	await blurEverything(page);

	await restoreHeroSelection(page);
}

/**
 * Re-open the Avery-only assignment the scene's first pass wrote.
 *
 * The picker derives its initial selection from the legend and span already in
 * the document, so Avery must come up pressed without anything choosing a
 * performer this time — that is the assertion, and it is what makes this a
 * picture of the workbench reading its own markup back rather than of a script
 * pressing two buttons.
 *
 * The loop calls this a second time, after its rewind, so its last frame is its
 * first: the same phrase selected, the same card open, the same roster showing.
 */
export async function restoreHeroSelection(page) {
	await dragPhrase(page);
	await assertHeroSelection(page);
}

/**
 * The assertions `restoreHeroSelection` makes, without the drag that produces
 * them — the loop films its own drag frame by frame and then asks for these.
 */
export async function assertHeroSelection(page) {
	const picker = page.locator('.picker-layer .picker');
	const avery = picker.getByRole('button', { name: performerNames[0], exact: true });
	await avery.waitFor({ state: 'visible' });
	if ((await avery.getAttribute('aria-pressed')) !== 'true') {
		throw new Error(`${performerNames[0]} was not preselected for the tagged Verse 2 phrase`);
	}
	const blair = picker.getByRole('button', { name: performerNames[1], exact: true });
	if ((await blair.getAttribute('aria-pressed')) !== 'false') {
		throw new Error(`${performerNames[1]} was selected for the Avery-only Verse 2 phrase`);
	}
	await page.waitForTimeout(400);
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

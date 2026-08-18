/*
 * The landing page's product shot: the real workbench, driven by a real browser,
 * screenshotted.
 *
 * It is a script rather than a checked-in picture taken by hand for the reason
 * `render-social-preview.mjs` is one — the shot has to be reproducible when a
 * severity color, a card's shape, or the toolbar's arrangement moves. Re-run it
 * against a dev or preview server and commit what comes out:
 *
 *     bun run vite dev --host 127.0.0.1 --port 5173
 *     bun scripts/render-workbench-shot.mjs
 *
 * `ORIGIN` overrides the server it drives; `--performers` writes the
 * performer-tagging detail shot — the
 * editor cropped portrait around a pointer selection with the performer picker
 * open over it, roster and all; `--harper` writes the on-device-grammar detail
 * shot — a hovered Harper underline with its popover open, fix preview and
 * citation included. Every file lands in `static/`.
 *
 * The documents these are taken of, and the performer scene's own setup, live
 * in `shot-scene.mjs` — `render-motion.mjs` films the same scene this
 * photographs, and a second copy of either is a copy that drifts.
 */
import { execFile } from 'node:child_process';
import { mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import {
	harperTranscription,
	prepareHeroScene,
	preparePerformerScene,
	selectionPoints,
	shotViewport,
	waitForWorkbench
} from './shot-scene.mjs';

const run = promisify(execFile);
const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5173';
const performers = process.argv.includes('--performers');
const harper = process.argv.includes('--harper');
const stem = performers ? 'workbench-performers' : harper ? 'workbench-harper' : 'workbench';
const outputPath = resolve(`static/${stem}.png`);
const webpPath = resolve(`static/${stem}.webp`);

await mkdir(resolve('static'), { recursive: true });

const browser = await chromium.launch();

try {
	const page = await browser.newPage({
		// Narrower than a laptop's full width on purpose. The lyric column is capped
		// at `--measure-editor` and left-aligned, so every pixel of window past the
		// panel is empty document — at 1440 the shot was a third bare canvas, which
		// in a picture reads as an application with nothing in it. The performers
		// shot is taller instead: its crop is portrait, and the window has to hold
		// the whole song plus the picker below the selection.
		viewport: shotViewport(performers ? 'performers' : harper ? 'harper' : 'hero'),
		// A product shot is scaled down in the page, so it is rendered at 2x and
		// let the browser resample it — a 1x capture set into a 1180px frame is
		// visibly soft on every display anybody reads this page on.
		deviceScaleFactor: 2,
		colorScheme: 'dark',
		// The transport, the drafts menu, and the wordmark all animate on arrival.
		// A shot taken mid-spring catches the brand halfway open.
		reducedMotion: 'reduce'
	});

	await page.goto(`${origin}/lint/`);

	const editor = await waitForWorkbench(page);

	if (performers) {
		await preparePerformerScene(page, editor);

		// The picker opens on a *pointer* selection and on nothing else, so the
		// selection is made the way a user makes one: a drag across the words.
		// The last line of a verse, so the picker — which prefers the space above
		// the selection — covers two plain lyric lines rather than a section
		// header (a hidden header reads as a song with a hole in it). Verse 2
		// specifically: the shot stands beside the section's heading, so the
		// picker lands in the upper half of the picture, where the eye already is
		// while reading the title.
		const points = await selectionPoints(page);

		await page.mouse.move(points.from.x, points.from.y);
		await page.mouse.down();
		await page.mouse.move(points.to.x, points.to.y, { steps: 12 });
		await page.mouse.up();

		const picker = page.locator('.picker-layer .picker');
		await picker.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForTimeout(400);

		// Cropped portrait, to the width the lyric actually occupies rather than
		// the editor column's: this shot sits *beside* the section's copy on a
		// desktop, so its height is the whole song — first header to the picker
		// under the selection — and its width is the text plus the gutter. The
		// rest of the window is the hero shot's job.
		const clip = await page.evaluate(() => {
			const region = document.querySelector('.editor-region').getBoundingClientRect();
			const card = document.querySelector('.picker-layer .picker').getBoundingClientRect();
			const lines = [...document.querySelectorAll('.cm-line')];
			const boxes = lines.map((candidate) => candidate.getBoundingClientRect());
			const first = boxes.reduce((a, b) => (b.top < a.top ? b : a));
			const last = boxes.reduce((a, b) => (b.bottom > a.bottom ? b : a));
			// A `.cm-line`'s own box is the full content width, so the text's real
			// right edge comes from a range over each line's contents.
			const textRight = lines.reduce((edge, candidate) => {
				const range = document.createRange();
				range.selectNodeContents(candidate);
				return Math.max(edge, range.getBoundingClientRect().right);
			}, card.right);
			const top = Math.max(region.top, first.top - 20);
			const bottom = Math.min(region.bottom, Math.max(card.bottom, last.bottom) + 24);
			return {
				x: Math.round(region.left),
				y: Math.round(top),
				width: Math.round(Math.min(region.width, textRight + 28 - region.left)),
				height: Math.round(bottom - top)
			};
		});

		await page.screenshot({ path: outputPath, type: 'png', clip });
		console.log(`wrote ${outputPath} (${clip.width * 2}x${clip.height * 2})`);
	} else if (harper) {
		await editor.click();
		await page.keyboard.press('Control+A');
		await editor.fill(harperTranscription);
		// Harper runs beside the native rules and arrives a beat later; the settle
		// wait covers both.
		await page.waitForTimeout(2500);

		// Hover the underline the way a reader does. The popover opens through
		// `HoverIntent`, so the pointer has to arrive and *stay*. Target the
		// diagnostic decoration rather than looking for the line's original text:
		// replacing the whole document selects the leading diagnostic, and now that
		// Harper is the only one, its fix preview has already inserted `have` beside
		// the struck-through `has` in the DOM before the pointer gets here.
		const target = await page.evaluate(() => {
			const underline = document.querySelector('.ll-diagnostic-range');
			if (!underline) return undefined;
			const box = underline.getBoundingClientRect();
			return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
		});
		if (!target) throw new Error('no flagged "has" to hover');

		await page.mouse.move(target.x - 80, target.y, { steps: 4 });
		await page.mouse.move(target.x, target.y, { steps: 8 });
		const popover = page.locator('.popover');
		await popover.waitFor({ state: 'visible', timeout: 10_000 });
		await page.waitForTimeout(400);

		// Cropped to the lines and the popover under them — the document is four
		// lines on purpose, so the card is most of the picture.
		const clip = await page.evaluate(() => {
			const region = document.querySelector('.editor-region').getBoundingClientRect();
			const card = document.querySelector('.popover').getBoundingClientRect();
			const lines = [...document.querySelectorAll('.cm-line')];
			const first = lines[0].getBoundingClientRect();
			const textRight = lines.reduce((edge, candidate) => {
				const range = document.createRange();
				range.selectNodeContents(candidate);
				return Math.max(edge, range.getBoundingClientRect().right);
			}, card.right);
			const top = Math.max(region.top, first.top - 18);
			const bottom = Math.min(region.bottom, card.bottom + 24);
			return {
				x: Math.round(region.left),
				y: Math.round(top),
				width: Math.round(Math.min(region.width, textRight + 28 - region.left)),
				height: Math.round(bottom - top)
			};
		});

		await page.screenshot({ path: outputPath, type: 'png', clip });
		console.log(`wrote ${outputPath} (${clip.width * 2}x${clip.height * 2})`);
	} else {
		// The whole scene, shared with the loop that films it — see
		// `prepareHeroScene`. The still is now this setup plus a shutter.
		await prepareHeroScene(page, editor);

		await page.screenshot({ path: outputPath, type: 'png' });
		console.log(`wrote ${outputPath}`);
	}
} finally {
	await browser.close();
}

// Posters are derived from the lossless still by the system ffmpeg's libwebp
// encoder. Detail PNGs are intermediate source frames; only the README's hero
// PNG is a shipped asset of its own.
await run('ffmpeg', ['-y', '-i', outputPath, '-c:v', 'libwebp', '-quality', '82', webpPath]);
console.log(`wrote ${webpPath}`);
if (performers || harper) await unlink(outputPath);

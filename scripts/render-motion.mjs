/*
 * The landing page's moving pictures: the real workbench, driven by a real
 * browser, filmed one frame at a time.
 *
 * Each is the same scene as its own still from `render-workbench-shot.mjs`, and
 * shares that still's setup — the roster, the songs and the phrase all come from
 * `shot-scene.mjs`, so a picture and its loop cannot drift. What a loop adds is
 * the part a still cannot argue. A reader looking at finished `<i>` spans has to
 * take on faith that nobody typed them; a reader watching the pointer drag a
 * phrase and press two names has seen it. A reader looking at an open grammar
 * card has to take on faith that the fix beside the explanation does what it
 * says.
 *
 *     bun run vite dev --host 127.0.0.1 --port 5173
 *     node scripts/render-motion.mjs              # performer tagging
 *     node scripts/render-motion.mjs --harper     # on-device grammar
 *
 * `ORIGIN` overrides the server it drives. Each scene writes two files into
 * `static/`: a `.webm` for the page, and a `.gif` for anywhere a video tag is
 * not welcome — a README, an issue, a social post.
 *
 * Run it with **node**, not bun: bun resolves `playwright-core` out of its own
 * global cache, which is routinely a different version from the one in
 * `node_modules` and then demands a browser build that is not downloaded.
 *
 * ## Why frames rather than a screen recording
 *
 * Playwright records video, and its own bundled ffmpeg is built
 * `--disable-everything` — no GIF encoder, no `palettegen`, and a lone MJPEG
 * decoder, so a recording could only ever be re-encoded through a lossy
 * intermediate. Screenshotting each beat instead is lossless, and it makes the
 * timing *declared* rather than observed: a frame is captured when the scene is
 * in a known state, so the loop is byte-identical run to run and cannot come
 * out slower on a busy machine. That is the same reason every other picture
 * here is a script rather than a capture taken by hand.
 */
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import {
	harperTranscription,
	preparePerformerScene,
	selectionPoints,
	waitForWorkbench
} from './shot-scene.mjs';

const run = promisify(execFile);
const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5173';
const harper = process.argv.includes('--harper');
const stem = harper ? 'workbench-harper' : 'workbench-performers';
const webmPath = resolve(`static/${stem}.webm`);
const gifPath = resolve(`static/${stem}.gif`);

/**
 * 20fps. The cursor is the only thing moving for most of the loop, and a
 * pointer reads as deliberate at 20 where at 30 it reads as a mouse being
 * flicked — and a GIF pays for every frame twice, in palette error and in
 * bytes.
 */
const FPS = 20;

/** The capture is the whole editor column; the crop is worked out afterwards. */
const SCALE = 2;

const frames = [];

/*
 * The pointer. Playwright's mouse moves the page and draws nothing, so the
 * cursor in the picture is ours — an arrow that follows the same coordinates
 * the real mouse is given, one `page.evaluate` per frame, so the two cannot
 * disagree about where the press landed.
 *
 * `pointer-events: none` is load-bearing rather than tidy: every transient
 * surface in this workbench dismisses on an outside `pointerdown` read in the
 * capture phase, so an element sitting under the pointer that could take a hit
 * would close the very picker being filmed.
 *
 * The ring is the press. A pointer that merely stops over a button and the
 * button changing state a frame later is two facts a viewer has to connect;
 * the pulse is the click being *seen*, which is the whole argument for filming
 * this rather than drawing three stills.
 */
const CURSOR_SCRIPT = `
	const host = document.createElement('div');
	host.id = '__shot_cursor';
	host.style.cssText = [
		'position:fixed', 'left:0', 'top:0', 'width:0', 'height:0',
		'pointer-events:none', 'z-index:2147483647'
	].join(';');
	host.innerHTML = \`
		<div id="__shot_ring" style="position:absolute;left:0;top:0;width:0;height:0">
			<div style="position:absolute;left:-19px;top:-19px;width:38px;height:38px;
				border-radius:50%;border:2px solid rgba(255,255,255,0.9);
				box-shadow:0 0 0 1px rgba(0,0,0,0.35)"></div>
		</div>
		<svg id="__shot_arrow" width="26" height="30" viewBox="0 0 26 30"
			style="position:absolute;left:0;top:0;overflow:visible">
			<path d="M1.5,1.5 L1.5,21.5 L6.6,16.7 L10.1,24.3 L13.6,22.7 L10.2,15.2 L17.2,14.8 Z"
				fill="#ffffff" stroke="rgba(0,0,0,0.55)" stroke-width="1.4"
				stroke-linejoin="round" />
		</svg>\`;
	document.body.appendChild(host);

	/* A steady caret rather than a blinking one. A blink is a change in a region
	   that is otherwise still for seconds at a time, which costs the GIF real
	   bytes for a detail nobody is watching — and a loop that catches it mid-off
	   reads as a dropped frame. */
	const steady = document.createElement('style');
	steady.textContent = '.cm-cursor, .cm-cursor-primary { animation: none !important; }';
	document.head.appendChild(steady);

	window.__shotCursor = (x, y, press) => {
		const arrow = document.getElementById('__shot_arrow');
		const ring = document.getElementById('__shot_ring');
		/* The path's tip is at 1.5,1.5, so the hotspot is offset by that much and
		   the arrow's point lands exactly where the real mouse is. */
		arrow.style.transform = 'translate(' + (x - 1.5) + 'px,' + (y - 1.5) + 'px)'
			+ (press > 0 ? ' scale(0.92)' : '');
		arrow.style.transformOrigin = '1.5px 1.5px';
		ring.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + (0.3 + press * 0.9) + ')';
		ring.style.opacity = String(press > 0 ? Math.max(0, 0.55 * (1 - press)) : 0);
	};
	window.__shotCursor(-100, -100, 0);
`;

/** Ease so the pointer starts and stops like a hand, not like a tween. */
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function main() {
	await mkdir(resolve('static'), { recursive: true });
	const frameDir = await mkdtemp(join(tmpdir(), 'lyriclint-motion-'));
	const browser = await chromium.launch();

	try {
		const page = await browser.newPage({
			// The same window each still is taken in: narrower than a laptop on
			// purpose, and — for the performer scene — tall enough to hold the whole
			// song plus the picker under the selection. The grammar scene's document
			// is four lines, so it needs no more room than the hero's.
			viewport: { width: 1280, height: harper ? 820 : 1150 },
			deviceScaleFactor: SCALE,
			colorScheme: 'dark',
			// The transport, the drafts menu and the wordmark all animate on
			// arrival, and a frame taken mid-spring catches the brand halfway.
			// Nothing this loop films is one of those: the cursor is ours and the
			// picker's own steps are state changes, not transitions.
			reducedMotion: 'reduce'
		});

		await page.goto(`${origin}/lint/`);
		const editor = await waitForWorkbench(page);

		if (harper) {
			await editor.click();
			await page.keyboard.press('Control+A');
			await editor.fill(harperTranscription);
			// Harper runs beside the native rules and arrives a beat later; the
			// settle wait covers both.
			await page.waitForTimeout(2500);
		} else {
			await preparePerformerScene(page, editor);
		}

		/*
		 * The caret goes to the top of the document, and both halves of that matter.
		 *
		 * CodeMirror's active-line wash follows the caret rather than the focus —
		 * the highlighter decorates off `state.selection` and never asks whether the
		 * view is focused, so blurring does not clear it. Left where the paste ends,
		 * the loop opens on a band across its last line that vanishes on the first
		 * gesture, which reads as a rendering fault rather than as a caret.
		 *
		 * The blur is still worth making, because it takes the caret itself out of
		 * the frames the loop rests on.
		 *
		 * **The grammar scene opens with its fix already previewed as a diff, and
		 * that is the product rather than a leftover.** `DiagnosticList` expands the
		 * leading card whenever nothing else has been chosen — "so the panel is
		 * never a wall of closed rows" — and an expanded card previews its fix in
		 * the document. With exactly one finding there is therefore no state in
		 * which that card is closed: moving the caret, pressing Escape and switching
		 * the panel's tab were all tried, and the diff is still there after each,
		 * because none of them is a *different* diagnostic to lead with. So the loop
		 * opens the way the workbench opens, and what the hover adds is the half a
		 * diff cannot carry: the message, the source it comes from, and the button.
		 */
		await page.keyboard.press('Control+Home');
		await page.evaluate(() =>
			document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
		);
		await page.waitForTimeout(300);
		await page.evaluate(CURSOR_SCRIPT);

		/*
		 * The capture region is the editor column entire, and the crop is decided
		 * afterwards from boxes measured as the scene plays. It has to be: the
		 * finished document is *wider* than the one the loop opens on, because
		 * assigning the phrase writes `[Verse 2: Blair & <i>Avery</i>]` and that
		 * legend runs past the longest line the song had before it. A crop taken
		 * from the opening frame — which is exactly the still's own crop — cuts
		 * the end off the one line the whole loop exists to produce.
		 */
		const region = await page.evaluate(() => {
			const box = document.querySelector('.editor-region').getBoundingClientRect();
			return {
				x: Math.round(box.left),
				y: Math.round(box.top),
				width: Math.round(box.width),
				height: Math.round(box.height)
			};
		});

		/** Every box worth keeping in frame, unioned as the scene plays. */
		const seen = [];
		const observe = async () => {
			seen.push(
				...(await page.evaluate(() => {
					const rects = [];
					const push = (el) => {
						if (!el) return;
						const r = el.getBoundingClientRect();
						if (r.width > 0 && r.height > 0)
							rects.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
					};
					// A `.cm-line`'s own box is the full content width, so the text's
					// real right edge comes from a range over each line's contents.
					for (const line of document.querySelectorAll('.cm-line')) {
						const range = document.createRange();
						range.selectNodeContents(line);
						const r = range.getBoundingClientRect();
						const box = line.getBoundingClientRect();
						rects.push({
							left: box.left,
							top: box.top,
							right: Math.max(r.right, box.left + 1),
							bottom: box.bottom
						});
					}
					// Whichever surface this scene opens over the document.
					push(document.querySelector('.picker-layer .picker'));
					push(document.querySelector('.popover'));
					return rects;
				}))
			);
		};

		/*
		 * Where the pointer waits before the first gesture — and where it is put
		 * back at the end, so the last frame and the first are the same picture
		 * apart from the markup the loop wrote. A loop that ends with the arrow
		 * parked somewhere else jumps twice on repeat: once for the document
		 * resetting, which is honest, and once for the pointer teleporting, which
		 * only reads as a dropped frame.
		 */
		const firstLineTop = await page.evaluate(
			() => document.querySelector('.cm-line').getBoundingClientRect().top
		);
		const restPosition = harper
			? { x: region.x + region.width * 0.45, y: firstLineTop + 6 }
			: { x: region.x + region.width * 0.62, y: region.y + 90 };
		// The crop is the union of what the scene drew, and the pointer is drawn by
		// us rather than by the page — so its home has to be entered into that union
		// by hand or the arrow can rest just outside the frame. The box is the
		// arrow's own, measured down and right from the hotspot.
		seen.push({
			left: restPosition.x - 4,
			top: restPosition.y - 4,
			right: restPosition.x + 30,
			bottom: restPosition.y + 34
		});
		let cursor = { ...restPosition };
		let frameIndex = 0;

		const capture = async (press = 0) => {
			await page.evaluate(([x, y, p]) => window.__shotCursor(x, y, p), [cursor.x, cursor.y, press]);
			const path = join(frameDir, `f-${String(frameIndex).padStart(4, '0')}.png`);
			await page.screenshot({ path, type: 'png', clip: region });
			frames.push(path);
			frameIndex += 1;
		};

		const hold = async (count, press = 0) => {
			for (let i = 0; i < count; i += 1) await capture(press);
		};

		/*
		 * A move is the same call whether or not a button is down — the drag is
		 * the mouse being *held*, which `page.mouse.down()` established before
		 * this ran and `page.mouse.up()` ends after it. There is deliberately no
		 * pressed variant here.
		 */
		const glide = async (to, count) => {
			const from = { ...cursor };
			for (let i = 1; i <= count; i += 1) {
				const t = ease(i / count);
				cursor = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
				await page.mouse.move(cursor.x, cursor.y);
				await capture();
			}
		};

		/** A press, its pulse, and the frames the surface takes to answer it. */
		const clickHere = async (settleFrames) => {
			await page.mouse.move(cursor.x, cursor.y);
			await page.mouse.down();
			await capture(0.05);
			await page.mouse.up();
			for (const p of [0.35, 0.6, 0.85]) await capture(p);
			await hold(settleFrames);
		};

		/** The centre of a live box, re-measured every time, never remembered. */
		const centreOf = async (selector, text) => {
			const box = await page.evaluate(
				([sel, label]) => {
					const nodes = [...document.querySelectorAll(sel)];
					const el = label ? nodes.find((n) => n.textContent.trim().startsWith(label)) : nodes[0];
					if (!el) return undefined;
					const r = el.getBoundingClientRect();
					return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
				},
				[selector, text]
			);
			if (!box) throw new Error(`no ${selector}${text ? ` reading "${text}"` : ''}`);
			return box;
		};

		// ── 1. The document as it stands, before anything is asked of it.
		await observe();
		await hold(14);

		async function filmPerformers() {
			// ── 2. The pointer arrives at the phrase and drags across it. The picker
			//       opens on a *pointer* selection and on nothing else, so this is the
			//       gesture a reader would actually make.
			const points = await selectionPoints(page);
			await glide(points.from, 15);
			await hold(3);

			await page.mouse.move(points.from.x, points.from.y);
			await page.mouse.down();
			await capture(0.05);
			await glide(points.to, 13);
			await page.mouse.up();
			await capture();

			await page.locator('.picker-layer .picker').waitFor({ state: 'visible', timeout: 10_000 });
			await observe();
			await hold(14);

			// ── 3. `Who sings this? · 1 of 2` — the phrase's own voice.
			await glide(await centreOf('.picker-layer .picker [data-picker-chip]', 'Avery'), 13);
			await clickHere(11);
			await observe();

			// ── 4. `Next`, because this section has no legend yet and applying would
			//       otherwise promise an assignment and then ask a second question.
			await glide(await centreOf('.picker-layer .picker .actions button', 'Next'), 11);
			await clickHere(14);
			await page.waitForTimeout(200);
			await observe();

			/*
			 * ── 5. `Who sings the rest? · 2 of 2` — the section's general voice, and
			 *       **both** performers are pressed for it.
			 *
			 * The obvious cut picks one name here and one there, which reads as a
			 * radio group: a viewer comes away thinking a passage belongs to exactly
			 * one voice. The roster is a multiple selection, and two performers
			 * singing the same line together is ordinary in the songs this tool is
			 * used on — so the loop spends one extra press answering the question the
			 * shorter version left open. The first step took one name and this one
			 * takes two, which shows both shapes in the same eleven seconds without
			 * either needing a caption.
			 */
			await glide(await centreOf('.picker-layer .picker [data-picker-chip]', 'Avery'), 12);
			await clickHere(8);
			await glide(await centreOf('.picker-layer .picker [data-picker-chip]', 'Blair'), 11);
			await clickHere(12);
			await observe();

			// ── 6. Apply. The wrapper, the slot and the header legend are written
			//       together as one edit.
			await glide(await centreOf('.picker-layer .picker .actions button', 'Apply'), 11);
			await page.mouse.move(cursor.x, cursor.y);
			await page.mouse.down();
			await capture(0.05);
			await page.mouse.up();
			for (const p of [0.35, 0.6, 0.85]) await capture(p);
			await page.waitForTimeout(600);

			// Applying returns focus to the editor. Nothing should carry a focus ring
			// in the frames the loop rests on — it reads as a control the viewer is
			// being asked to press — and the loop restarts on a document that looks
			// like the one it opened on, minus the markup it just wrote.
			await page.evaluate(() =>
				document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
			);
			await observe();

			// The pointer goes home, so the last thing on screen is the result rather
			// than an arrow parked on the line it just wrote — and so the loop closes
			// on the frame it opened with. It is `restPosition` rather than an offset
			// nudged from wherever `Apply` happened to be: nudged, it left the crop
			// entirely and the longest beat ran with no pointer in it at all, which
			// reads as the recording having stopped.
			await glide(restPosition, 14);
			await hold(38);

			const result = await page.evaluate(() =>
				[...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n')
			);
			if (!/\[Verse 2: .+\]/.test(result) || !/<i>Somewhere past the bridge<\/i>/.test(result)) {
				throw new Error(`the assignment did not land:\n${result}`);
			}
		}

		/*
		 * The grammar scene. One finding, hovered the way a reader hovers it, read,
		 * and fixed — which is the whole of what this section claims and the half a
		 * still cannot show: that the button beside the explanation does what the
		 * explanation says.
		 */
		async function filmHarper() {
			// The scene's whole premise is one finding, so it is asserted rather than
			// assumed: a second underline anywhere in this document would put a card
			// the loop never opens beside the one it does, and the extra lines below
			// are exactly where one could appear unnoticed.
			const found = await page.locator('.ll-diagnostic-range').count();
			if (found !== 1) throw new Error(`expected exactly one finding, found ${found}`);

			// The pointer arrives at the underline and *stays*: the popover opens
			// through `HoverIntent`, which is a wait rather than an event, so a
			// pointer that merely crosses the word opens nothing.
			const underline = await centreOf('.ll-diagnostic-range');
			await glide(underline, 16);
			await page.mouse.move(underline.x, underline.y);
			await page.locator('.popover').waitFor({ state: 'visible', timeout: 10_000 });
			await observe();

			// Long enough to read the message, the citation and the diff, because
			// that is what the card is for.
			await hold(26);

			/*
			 * Onto the fix. The travel from the underline to the button crosses open
			 * document, and the card is watching for exactly that — but it allows a
			 * grace margin and a short delay so the diagonal from underline to
			 * popover does not close it early. The glide is short for the same
			 * reason: a slow crawl through the gap is how that grace gets spent.
			 */
			await glide(await centreOf('.popover .diagnostic-actions__fix'), 10);
			await page.locator('.popover').waitFor({ state: 'visible', timeout: 2_000 });
			await observe();
			await hold(6);

			await clickHere(16);
			await page.evaluate(() =>
				document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
			);
			await observe();

			await glide(restPosition, 14);
			await hold(34);

			const fixed = await page.evaluate(() => ({
				text: [...document.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'),
				underlines: document.querySelectorAll('.ll-diagnostic-range').length
			}));
			if (!/I have counted/.test(fixed.text)) {
				throw new Error(`the fix did not land:\n${fixed.text}`);
			}
			if (fixed.underlines > 0) {
				throw new Error(`${fixed.underlines} underline(s) left after the fix`);
			}
		}

		await (harper ? filmHarper() : filmPerformers());

		await browser.close();

		// ── The crop: the union of every box the scene put on screen, in the
		//    captured frames' own pixels. Even on both axes, because `yuv420p`
		//    subsamples chroma and an odd dimension is rejected outright.
		const pad = { top: 20, bottom: 24, right: 28 };
		const left = region.x;
		const top = Math.max(region.y, Math.min(...seen.map((r) => r.top)) - pad.top);
		const right = Math.min(
			region.x + region.width,
			Math.max(...seen.map((r) => r.right)) + pad.right
		);
		const bottom = Math.min(
			region.y + region.height,
			Math.max(...seen.map((r) => r.bottom)) + pad.bottom
		);
		const even = (n) => Math.max(2, Math.round(n) - (Math.round(n) % 2));
		const crop = {
			x: even((left - region.x) * SCALE),
			y: even((top - region.y) * SCALE),
			width: even((right - left) * SCALE),
			height: even((bottom - top) * SCALE)
		};
		const cropFilter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`;
		const input = ['-framerate', String(FPS), '-i', join(frameDir, 'f-%04d.png')];

		console.log(
			`captured ${frames.length} frames (${(frames.length / FPS).toFixed(1)}s) ` +
				`· crop ${crop.width}x${crop.height}`
		);

		// VP9 at the capture's own 2x, because this is what the page plays and a
		// product shot is scaled down in the layout — a 1x encode set into the
		// frame is visibly soft on every display anybody reads that page on.
		await run('ffmpeg', [
			'-y',
			...input,
			'-vf',
			cropFilter,
			'-c:v',
			'libvpx-vp9',
			'-pix_fmt',
			'yuv420p',
			'-crf',
			'30',
			'-b:v',
			'0',
			'-row-mt',
			'1',
			'-cpu-used',
			'2',
			'-an',
			webmPath
		]);

		// The GIF is 1x. It is the sharing copy rather than the page's, and GIF
		// pays for a wider picture twice over — in palette error across a dark UI
		// full of antialiased text, and in bytes. `stats_mode=diff` weights the
		// palette towards what actually changes between frames instead of towards
		// the acres of still background, and `diff_mode=rectangle` writes each
		// frame as the rectangle that moved, which is most of the saving on a
		// loop whose subject is a pointer crossing a static document.
		const gifWidth = even(crop.width / SCALE);
		const palette = join(frameDir, 'palette.png');
		const gifScale = `scale=${gifWidth}:-2:flags=lanczos`;
		await run('ffmpeg', [
			'-y',
			...input,
			'-vf',
			`${cropFilter},${gifScale},palettegen=max_colors=192:stats_mode=diff`,
			palette
		]);
		await run('ffmpeg', [
			'-y',
			...input,
			'-i',
			palette,
			'-lavfi',
			`${cropFilter},${gifScale}[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
			'-loop',
			'0',
			gifPath
		]);

		for (const [label, path] of [
			['webm', webmPath],
			['gif', gifPath]
		]) {
			const { size } = await (await import('node:fs/promises')).stat(path);
			console.log(`wrote ${path} (${label}, ${(size / 1024).toFixed(0)}KB)`);
		}
	} finally {
		if (browser.isConnected()) await browser.close();
		await rm(frameDir, { recursive: true, force: true });
	}
}

await main();

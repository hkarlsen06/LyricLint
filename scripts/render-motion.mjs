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
 *     node scripts/render-motion.mjs --hero       # the landing page's first screen
 *     node scripts/render-motion.mjs --hero --rehearse # verify timing and actions without encoding
 *     node scripts/render-motion.mjs              # performer tagging
 *     node scripts/render-motion.mjs --harper     # on-device grammar
 *     node scripts/render-motion.mjs --player     # synced lyric playback
 *     node scripts/render-motion.mjs --song       # credits and artwork
 *
 * `ORIGIN` overrides the server it drives. The detail scenes write two files
 * each into `static/`: a `.webm` for the page, and a `.gif` for anywhere a video
 * tag is not welcome — a README, an issue, a social post. The hero writes full
 * and phone-sized WebMs, with no GIF for the reason given where it is encoded.
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
import { mkdir, mkdtemp, rm, link, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { filmHeroScene } from './hero-shot-scene.mjs';
import { createKeyOverlay } from './key-overlay.mjs';
import { renderMobileLoop } from './render-mobile-loop.mjs';
import { writeShotDimensions } from './write-shot-dimensions.mjs';
import {
	harperTranscription,
	installPlayerScene,
	playerShotRegion,
	playerLineTimes,
	installHeroScene,
	preparePlayerScene,
	preparePerformerScene,
	selectionPoints,
	shotViewport,
	waitForWorkbench
} from './shot-scene.mjs';

const run = promisify(execFile);
const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5173';
const harper = process.argv.includes('--harper');
const hero = process.argv.includes('--hero');
// Exercise the authored timeline and all real controls before spending time encoding.
const rehearse = process.argv.includes('--rehearse');
const player = process.argv.includes('--player');
const song = process.argv.includes('--song');
const mediaScene = player || song;
const scene = player ? 'player' : song ? 'song' : hero ? 'hero' : harper ? 'harper' : 'performers';
const stem = scene === 'hero' ? 'workbench' : `workbench-${scene}`;
const webmPath = resolve(`static/${stem}.webm`);
const gifPath = resolve(`static/${stem}.gif`);

/** Smooth pointer motion, with scene beats still measured in twentieths of a second. */
const FPS = 60;
const BEATS_PER_SECOND = 20;

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
		const parent = document.querySelector('dialog:modal') ?? document.body;
		if (host.parentElement !== parent) parent.append(host);
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
const ease = (t) => t * t * t * (10 + t * (-15 + 6 * t));

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
			viewport: shotViewport(scene),
			permissions: ['clipboard-read', 'clipboard-write'],
			deviceScaleFactor: SCALE,
			colorScheme: 'dark',
			// The transport, the drafts menu and the wordmark all animate on
			// arrival, and a frame taken mid-spring catches the brand halfway.
			// Nothing this loop films is one of those: the cursor is ours and the
			// picker's own steps are state changes, not transitions.
			reducedMotion: 'reduce'
		});

		if (mediaScene) await installPlayerScene(page);
		if (hero) await installHeroScene(page);
		await page.goto(`${origin}/workbench/`);
		const editor = await waitForWorkbench(page);

		if (mediaScene) {
			await preparePlayerScene(page, editor, { timed: !player });
			// Copy confirmations and the paused-line fade must spend filmed time,
			// not the variable wall time needed to encode a screenshot.
			await page.clock.install();
			await page.clock.pauseAt(new Date(Date.now() + 100));
		} else if (hero) {
			// The film starts blank; the same song's populated still covers loading.
			await page.clock.install();
			await page.clock.pauseAt(new Date(Date.now() + 100));
		} else if (harper) {
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
		// The hero opens on a blank document; media scenes prepare their own caret.
		if (!hero && !mediaScene) {
			await page.keyboard.press('Control+Home');
			await page.evaluate(() =>
				document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
			);
			await page.waitForTimeout(300);
		}
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
		/*
		 * **The hero films the whole window, and its crop is the whole window too.**
		 * Every other loop here is a detail shot of the editor column, so it captures
		 * that column and works the crop out afterwards from what the scene drew.
		 * This one's subject is the *panel* — a queue of findings emptying, card by
		 * card, beside the document each press rewrites — so both columns have to be
		 * in frame at once, and there is nothing left for a union to decide. It is
		 * the still's own frame, which is what lets the two share a slot on the page
		 * without the box changing size when the video's metadata lands.
		 */
		const region = mediaScene
			? await playerShotRegion(page, scene)
			: hero
				? { x: 0, y: 0, width: 1280, height: 820 }
				: await page.evaluate(() => {
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
		/*
		 * The hero's home is the empty canvas to the right of the lyric, and every
		 * word of that is a constraint. The lyric column is capped at
		 * `--measure-editor` and left-aligned, so the band between the longest line
		 * and the panel's edge is the one large region of this window that nothing
		 * is drawn in and nothing answers a pointer. It has to be nothing: a pointer
		 * that *stays* is what `HoverIntent` is waiting for, so an arrow parked on an
		 * underline, on a line's count badge or on the action tray would spend the
		 * loop's longest holds pulling a surface open behind it. Well below the tray,
		 * for the same reason.
		 */
		const restPosition = player
			? { x: region.x + region.width * 0.74, y: region.y + 160 }
			: song
				? { x: region.x + region.width - 40, y: region.y + 36 }
				: hero
					? { x: region.x + region.width * 0.66, y: region.y + 300 }
					: harper
						? { x: region.x + region.width * 0.45, y: firstLineTop + 6 }
						: { x: region.x + Math.min(region.width * 0.62, 500), y: region.y + 90 };
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
		let filmSpeed = 1;
		const keys = player || hero ? await createKeyOverlay(page) : null;
		let phase = '';
		let syncStartFrame = 0;
		let syncEndFrame = 0;
		if (player || hero) {
			await page.evaluate(() => {
				const speed = document.createElement('div');
				speed.setAttribute('aria-hidden', 'true');
				speed.id = '__shot_speed';
				speed.style.cssText =
					'position:fixed;z-index:2147483646;pointer-events:none;display:none;transform:translate(-50%,-50%)';
				speed.innerHTML = `<svg width="128" height="80" viewBox="0 0 128 80" fill="none" aria-hidden="true" style="overflow:visible;filter:drop-shadow(0 2px 3px #000)">
					<defs><filter id="shot-tape" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
						<feTurbulence class="wave" type="fractalNoise" baseFrequency="0 .025" numOctaves="2" seed="11" result="wave"/>
						<feColorMatrix in="wave" type="matrix" values="1 0 0 0 0  0 0 0 0 .5  0 0 0 0 0  0 0 0 0 1" result="map"/>
						<feDisplacementMap in="SourceGraphic" in2="map" scale="0" xChannelSelector="R" yChannelSelector="G" result="warped"/>
						<feTurbulence class="grain" type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="1" result="grain"/>
						<feColorMatrix in="grain" type="saturate" values="0"/>
						<feComponentTransfer><feFuncA type="linear" slope="0"/></feComponentTransfer>
						<feComposite in2="warped" operator="in" result="noise"/>
						<feBlend in="warped" in2="noise" mode="screen"/>
					</filter></defs>
					<path d="M12 12 62 40 12 68Z M66 12 116 40 66 68Z" fill="#fff" stroke="#161616" stroke-width="2"/>
				</svg>`;
				const tracking = document.createElement('div');
				tracking.id = '__shot_tracking';
				tracking.setAttribute('aria-hidden', 'true');
				tracking.style.cssText = `position:fixed;z-index:2147483645;pointer-events:none;display:none;height:6px;
					background:repeating-linear-gradient(90deg,transparent 0 2px,#fff8 2px 3px,transparent 3px 7px,#fff3 7px 9px);`;
				document.body.append(tracking, speed);
			});
		}
		const pressKey = (key, label, action = '') =>
			keys.press(key, {
				at: frameIndex / FPS,
				label,
				action,
				continueCount: phase === 'sync',
				showCount: label === 'Space'
			});

		const capture = async (press = 0, samples = FPS / BEATS_PER_SECOND) => {
			if (mediaScene || hero) {
				await page.evaluate(
					(seconds) => window.__shotAdvance(seconds),
					(samples / FPS) * filmSpeed
				);
				await page.clock.runFor((samples / FPS) * 1000 * filmSpeed);
			}
			if (player || hero) {
				const center = await page.evaluate(
					({ phase, filmSpeed, frameIndex, hero }) => {
						const speed = document.querySelector('#__shot_speed');
						const media = document.querySelector('.workspace-media')?.getBoundingClientRect();
						const editor = document.querySelector('.editor-region').getBoundingClientRect();
						const centerX = editor.left + editor.width / 2;
						const bottom = media?.bottom ?? editor.bottom;
						const centerY = (editor.top + bottom) / 2;
						speed.style.left = `${centerX}px`;
						speed.style.top = `${centerY - 72}px`;

						// VHS scan distortion follows the supplied rewind reference, played forward.
						// Affect the footage; keep the tutorial icon and key counter clean.
						const strength = Math.min(1, Math.max(0, Math.log2(filmSpeed) / 5));
						speed
							.querySelector('.wave')
							.setAttribute('baseFrequency', `0 ${0.022 + 0.004 * Math.sin(frameIndex * 0.12)}`);
						speed.querySelector('feDisplacementMap').setAttribute('scale', String(36 * strength));
						// Fine random grain dominates a full-window encode. The hero keeps
						// the tape texture coarser and lighter at its larger resolution.
						speed.querySelector('.grain').setAttribute('baseFrequency', hero ? '.16' : '.8');
						speed
							.querySelector('.grain')
							.setAttribute('seed', String((Math.floor(frameIndex / 8) % 4) + 1));
						speed
							.querySelector('feFuncA')
							.setAttribute('slope', String((hero ? 0.1 : 0.22) * strength));
						document.querySelector('.workspace').style.filter = phase ? 'url(#shot-tape)' : '';
						const tracking = document.querySelector('#__shot_tracking');
						tracking.style.display = phase ? 'block' : 'none';
						tracking.style.left = `${editor.left}px`;
						tracking.style.width = `${editor.width}px`;
						tracking.style.top = `${editor.top + ((frameIndex * 7) % (bottom - editor.top - 6))}px`;
						tracking.style.opacity = String(strength * 0.3);
						speed.style.display = phase ? 'flex' : 'none';
						return hero
							? { x: editor.left + 205, y: editor.bottom - 52 }
							: { x: centerX, y: centerY };
					},
					{ phase, filmSpeed, frameIndex, hero }
				);
				await keys.render(frameIndex / FPS, center);
			}
			if (song) {
				const metadata = await page.locator('.song-panel > section').first().boundingBox();
				if (!metadata || metadata.y + metadata.height > region.y + region.height) {
					throw new Error('the metadata scene outgrew its frame');
				}
			}
			await page.evaluate(([x, y, p]) => window.__shotCursor(x, y, p), [cursor.x, cursor.y, press]);
			const path = join(frameDir, `f-${String(frameIndex).padStart(4, '0')}.png`);
			if (!rehearse) await page.screenshot({ path, type: 'png', clip: region });
			frames.push(path);
			frameIndex += 1;
			// Holds keep their original pacing without photographing an unchanged
			// cursor three times. Moving frames always request a single sample.
			for (let i = 1; i < samples; i += 1) {
				const repeated = join(frameDir, `f-${String(frameIndex).padStart(4, '0')}.png`);
				if (!rehearse) await link(path, repeated);
				frames.push(repeated);
				frameIndex += 1;
			}
		};

		const hold = async (count, press = 0) => {
			for (let i = 0; i < count; i += 1) await capture(press);
		};

		/*
		 * A move is the same call whether or not a button is down — the drag is
		 * the mouse being *held*, which `page.mouse.down()` established before
		 * this ran and `page.mouse.up()` ends after it. The dragging option only
		 * keeps the path straight along the selected lyric line.
		 */
		const glide = async (to, beats, { dragging = false } = {}) => {
			const from = { ...cursor };
			const dx = to.x - from.x;
			const dy = to.y - from.y;
			const distance = Math.hypot(dx, dy);
			// Long reaches need more time than neighbouring controls. A gentle arc
			// keeps travel from looking ruler-straight; selection stays on its line.
			const seconds = Math.max(beats / BEATS_PER_SECOND, 0.18 + Math.sqrt(distance) / 38);
			const count = Math.ceil(seconds * FPS);
			const bend = dragging ? 0 : Math.min(18, distance * 0.045);
			for (let i = 1; i <= count; i += 1) {
				const t = ease(i / count);
				const arc = 4 * t * (1 - t) * bend;
				cursor = {
					x: from.x + dx * t - (dy / (distance || 1)) * arc,
					y: from.y + dy * t + (dx / (distance || 1)) * arc
				};
				await page.mouse.move(cursor.x, cursor.y);
				await capture(0, 1);
			}
		};

		/** A press, its pulse, and the frames the surface takes to answer it. */
		const clickHere = async (settleFrames, keepMoving = false) => {
			await page.mouse.move(cursor.x, cursor.y);
			await page.mouse.down();
			await capture(0.05, keepMoving ? 1 : FPS / BEATS_PER_SECOND);
			await page.mouse.up();
			if (!keepMoving) for (const p of [0.35, 0.6, 0.85]) await capture(p);
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
		if (!hero) await hold(14);

		async function filmPerformers() {
			// ── 2. The pointer arrives at the phrase and drags across it. The picker
			//       opens on a *pointer* selection and on nothing else, so this is the
			//       gesture a reader would actually make.
			const points = await selectionPoints(page);
			await glide(points.from, 15);

			await page.mouse.move(points.from.x, points.from.y);
			await page.mouse.down();
			await capture(0.05);
			await glide(points.to, 13, { dragging: true });
			await page.mouse.up();
			await capture();

			await page.locator('.picker-layer .picker').waitFor({ state: 'visible', timeout: 10_000 });
			await observe();
			await hold(6);

			// ── 3. `Who sings this? · 1 of 2` — the phrase's own voice.
			await glide(await centreOf('.picker-layer .picker [data-picker-chip]', 'Avery'), 13);
			await clickHere(0, true);
			await observe();

			// ── 4. `Next`, because this section has no legend yet and applying would
			//       otherwise promise an assignment and then ask a second question.
			await glide(await centreOf('.picker-layer .picker .actions button', 'Next'), 11);
			await clickHere(0, true);
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
			 *
			 * The two presses are one decision, and the tempo has to say so. "Both of
			 * them" was decided before the pointer moved — nobody reads the roster
			 * again between Avery and Blair — so a dwell between the presses reads as
			 * the hand hesitating over a question it already answered. The second
			 * press is a flick to the adjacent chip with no pause on the first, and
			 * the pointer continues directly to Apply once both are selected.
			 */
			await glide(await centreOf('.picker-layer .picker [data-picker-chip]', 'Avery'), 9);
			await clickHere(0, true);
			await glide(await centreOf('.picker-layer .picker [data-picker-chip]', 'Blair'), 5);
			await clickHere(0, true);
			await observe();

			// ── 6. Apply. The wrapper, the slot and the header legend are written
			//       together as one edit.
			await glide(await centreOf('.picker-layer .picker .actions button', 'Apply'), 11);
			await clickHere(0, true);
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

		async function filmPlayer() {
			const playback = () => page.evaluate(() => window.__shotPlayback());
			await glide(await centreOf('.media-strip__sync'), 12);
			await clickHere(4, true);
			if (!(await playback()).playing) throw new Error('Sync lyrics did not start playback');
			// Stamp the mock song immediately, then give that first result a clean beat.
			await pressKey('Space', 'Space');
			await capture(0, 1);
			if ((await page.locator('.ll-time-value[data-anchor-seek]').count()) !== 1) {
				throw new Error('the first sync tap did not create a timestamp');
			}
			if (await page.locator('#__shot_speed').isVisible()) {
				throw new Error('the fast-forward effect appeared before the first timestamp');
			}
			await hold(3);
			syncStartFrame = frameIndex;
			const syncEndTime = playerLineTimes.at(-1)[1] + 0.051;
			phase = 'sync';
			for (const [line, seconds] of playerLineTimes.slice(1)) {
				// A short, steep ramp compresses the middle; the final tap has a brief roll-off.
				// A little over 50ms compensates for the sync tap offset without
				// rounding an intended 0:32 down to 0:31.
				while ((await playback()).time < seconds + 0.051) {
					const elapsed = (frameIndex - syncStartFrame) / FPS;
					const remaining = Math.max(0, syncEndTime - (await playback()).time);
					filmSpeed = Math.min(70, 5 * 2 ** (elapsed / 0.2), 5 + 7 * remaining);
					await capture(0, 1);
				}
				await pressKey('Space', 'Space');
				await capture(0, 1);
				const timed = page.locator('.ll-time-value[data-anchor-seek]');
				if ((await timed.count()) !== playerLineTimes.findIndex(([n]) => n === line) + 1) {
					throw new Error(`Space did not time lyric line ${line}`);
				}
			}
			syncEndFrame = frameIndex;
			filmSpeed = 1;
			phase = '';
			if (keys.count !== playerLineTimes.length)
				throw new Error('Space presses were not deduplicated');
			if ((await playback()).playing) throw new Error('the completed sync did not pause');
			await page.mouse.wheel(0, -700);
			await glide(restPosition, 4);
			await hold(8);

			// Drag the real range thumb in both directions. The highlighted lyric,
			// not just the counter, must follow each part of the scrub.
			const slider = await page.locator('.media-strip__seek').evaluate((input) => {
				const box = input.getBoundingClientRect();
				const probe = document.createElement('span');
				probe.style.cssText = 'position:absolute;width:var(--space-3)';
				document.body.append(probe);
				const thumb = probe.getBoundingClientRect().width;
				probe.remove();
				return {
					x: box.x + thumb / 2,
					y: box.y + box.height / 2,
					width: box.width - thumb,
					max: Number(input.max)
				};
			});
			const scrubPoint = (time) => ({
				x: slider.x + (slider.width * time) / slider.max,
				y: slider.y
			});
			await glide(scrubPoint((await playback()).time), 12);
			await page.mouse.down();
			await capture(0.15);
			for (const [time, line] of [
				[10, 3],
				[34, 10],
				[18, 5]
			]) {
				await glide(scrubPoint(time), 22, { dragging: true });
				await hold(12);
				const expected = await page
					.locator('.cm-line')
					.nth(line - 1)
					.textContent();
				if ((await page.locator('.cm-line.ll-current-line').textContent()) !== expected) {
					throw new Error(`scrubbing to ${time} did not highlight line ${line}`);
				}
			}
			await page.mouse.up();
			await capture();

			const number = page.locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^4$/ });
			const box = await number.boundingBox();
			if (!box) throw new Error('line number 4 is not visible');
			await glide({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, 12);
			await clickHere(16);
			if (
				!(await playback()).playing ||
				!(await page.locator('.cm-line.ll-current-line').textContent()).includes(
					'And the quiet part was never really quiet'
				)
			) {
				throw new Error('clicking line number 4 did not jump to that lyric');
			}
			await glide(restPosition, 12);
			await hold(12);

			await pressKey('Escape', 'Esc', 'Pause');
			const paused = await playback();
			if (paused.playing) throw new Error('Escape did not pause');
			await hold(24);
			await pressKey('Escape', 'Esc', 'Replay');
			const resumed = await playback();
			if (!resumed.playing || Math.abs(resumed.time - (paused.time - 2)) > 0.1) {
				throw new Error(
					`resume did not rewind two seconds: ${JSON.stringify({ paused, resumed })}`
				);
			}
			await hold(40);
			const beforeBack = await playback();
			await pressKey('Shift+Escape', 'Shift + Esc', 'Back');
			if ((await playback()).time >= beforeBack.time - 0.1)
				throw new Error('Shift+Escape did not jump back');
			await hold(24);
			const beforeForward = await playback();
			await pressKey('Alt+Escape', 'Option + Esc', 'Forward');
			if ((await playback()).time <= beforeForward.time + 0.1)
				throw new Error('Alt+Escape did not jump forward');
			await hold(32);
			await pressKey('Escape', 'Esc', 'Pause');
			await hold(36);
		}

		async function filmSong() {
			const writer = page.locator('.metadata-list button').filter({ hasText: 'Avery' }).first();
			const box = await writer.boundingBox();
			if (!box) throw new Error('the song scene needs an Avery writer credit');
			const writerName = (await writer.textContent()).trim();
			await glide({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, 12);
			await clickHere(24);
			if ((await page.evaluate(() => navigator.clipboard.readText())) !== writerName) {
				throw new Error('writer copy did not reach the clipboard');
			}
			await glide(await centreOf('.song-panel .artwork-actions button', 'Copy image URL'), 12);
			await clickHere(24);
			const copiedUrl = await page.evaluate(() => navigator.clipboard.readText());
			if (!copiedUrl.startsWith('https://')) throw new Error('artwork URL was not copied');
			await glide(await centreOf('.song-panel .artwork-actions button', 'Download album art'), 10);
			const downloaded = page.waitForEvent('download');
			await clickHere(8);
			const download = await downloaded;
			if (await download.failure()) throw new Error('album art download failed');
			await glide(restPosition, 12);
			await hold(36);
		}

		await (player
			? filmPlayer()
			: song
				? filmSong()
				: hero
					? filmHeroScene({
							page,
							editor,
							hold,
							glide,
							clickHere,
							pressKey,
							restPosition,
							getTime: () => frameIndex / FPS,
							setSpeed(speed) {
								if (speed > 1 && !phase) syncStartFrame = frameIndex;
								if (speed === 1 && phase) syncEndFrame = frameIndex;
								filmSpeed = speed;
								phase = speed > 1 ? 'transcribe' : '';
							}
						})
					: harper
						? filmHarper()
						: filmPerformers());

		await browser.close();
		if (rehearse) {
			console.log(
				`Rehearsal passed: ${scene}, ${frameIndex} frames, ${(frameIndex / FPS).toFixed(2)}s`
			);
			return;
		}

		// ── The crop: the union of every box the scene put on screen, in the
		//    captured frames' own pixels. Even on both axes, because `yuv420p`
		//    subsamples chroma and an odd dimension is rejected outright.
		const pad = { top: 20, bottom: 24, right: 28 };
		const left = region.x;
		const top =
			hero || mediaScene
				? region.y
				: Math.max(region.y, Math.min(...seen.map((r) => r.top)) - pad.top);
		const right =
			hero || mediaScene
				? region.x + region.width
				: Math.min(region.x + region.width, Math.max(...seen.map((r) => r.right)) + pad.right);
		const bottom =
			hero || mediaScene
				? region.y + region.height
				: Math.min(region.y + region.height, Math.max(...seen.map((r) => r.bottom)) + pad.bottom);
		const even = (n) => Math.round(n) - (Math.round(n) % 2);
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
		const segments =
			player || hero
				? [
						{ start: 0, end: syncStartFrame, lossless: true },
						{ start: syncStartFrame, end: syncEndFrame, lossless: false },
						{ start: syncEndFrame, end: frames.length, lossless: true }
					]
				: [{ start: 0, end: frames.length, lossless: false }];
		const parts = [];
		for (const [index, segment] of segments.entries()) {
			const output = player || hero ? join(frameDir, `part-${index}.webm`) : webmPath;
			await run('ffmpeg', [
				'-y',
				'-start_number',
				String(segment.start),
				...input,
				'-frames:v',
				String(segment.end - segment.start),
				'-vf',
				cropFilter,
				'-c:v',
				'libvpx-vp9',
				'-pix_fmt',
				'yuv420p',
				'-crf',
				segment.lossless ? '0' : hero || player ? '50' : '30',
				// Random VHS grain needs compression. The clear sections stay lossless:
				// lossy motion prediction previously smeared lyric glyphs after seeks.
				// Spend fewer bits on the accelerated tape effect, where random grain
				// dominated the download. Gestures and readable review stay lossless;
				// the capture's dimensions, 60fps timing and tape treatment stay intact.
				...(segment.lossless ? ['-lossless', '1', '-auto-alt-ref', '0'] : []),
				'-b:v',
				'0',
				'-row-mt',
				'1',
				'-cpu-used',
				'2',
				'-an',
				output
			]);
			parts.push(`file 'part-${index}.webm'`);
		}
		if (player || hero) {
			const list = join(frameDir, 'parts.txt');
			await writeFile(list, parts.join('\n'));
			await run('ffmpeg', [
				'-y',
				'-f',
				'concat',
				'-safe',
				'0',
				'-i',
				list,
				'-c',
				'copy',
				'-metadata',
				`LYRICLINT_ACCELERATED_START_FRAME=${syncStartFrame}`,
				'-metadata',
				`LYRICLINT_ACCELERATED_END_FRAME=${syncEndFrame}`,
				webmPath
			]);
		}

		await writeShotDimensions();

		/*
		 * **The hero writes no GIF, and the arithmetic is why.** A GIF is the
		 * sharing copy for a detail shot: a few hundred frames of one column, most
		 * of it unchanging, which `diff_mode=rectangle` compresses to almost
		 * nothing. This scene is the opposite on every term — the whole window,
		 * three times the pixels, five times the frames, and both halves of it
		 * changing at once as the panel empties beside a document being rewritten.
		 * The result is tens of megabytes, which is not a thing anybody drops into
		 * a README or a post. What serves that job here is the same song's populated
		 * still, already generated by `render-workbench-shot.mjs` and
		 * already what `README.md` points at.
		 */
		if (hero) {
			await renderMobileLoop();
			const { size } = await (await import('node:fs/promises')).stat(webmPath);
			console.log(`wrote ${webmPath} (webm, ${(size / 1024).toFixed(0)}KB)`);
			console.log('no gif for the hero scene — the still is its sharing copy');
			return;
		}

		// The GIF is 1x. It is the sharing copy rather than the page's, and GIF
		// pays for a wider picture twice over — in palette error across a dark UI
		// full of antialiased text, and in bytes. `stats_mode=diff` weights the
		// palette towards what actually changes between frames instead of towards
		// the acres of still background, and `diff_mode=rectangle` writes each
		// frame as the rectangle that moved, which is most of the saving on a
		// loop whose subject is a pointer crossing a static document.
		const gifInput = player ? ['-i', webmPath] : input;
		const gifWidth = even(crop.width / SCALE);
		const palette = join(frameDir, 'palette.png');
		const gifScale = `fps=50,scale=${gifWidth}:-2:flags=lanczos`;
		await run('ffmpeg', [
			'-y',
			...gifInput,
			'-vf',
			`${cropFilter},${gifScale},palettegen=max_colors=${player ? 48 : 192}:stats_mode=diff`,
			palette
		]);
		await run('ffmpeg', [
			'-y',
			...gifInput,
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

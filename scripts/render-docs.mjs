/*
 * The product docs' pictures: the real workbench, driven by a real browser.
 * Decision record: docs/subsystems/site.md.
 *
 *     bun run vite dev --host 127.0.0.1 --port 5173
 *     node scripts/render-docs.mjs                  # every scene
 *     node scripts/render-docs.mjs --scene audio    # one scene
 *
 * `ORIGIN` overrides the server it drives. Each scene writes
 * `static/docs-<scene>.webp` with 400/640/960 widths, and loop scenes also
 * `static/docs-<scene>.webm`. A loop's still is taken from the same run and
 * the same frame region, so the figure's poster and its video cannot drift.
 *
 * Run it with **node**, for the reason `render-motion.mjs` gives. Loops are
 * screenshots under Playwright's fake clock, one per filmed frame (or per
 * three during a hold), for the reasons that script gives too. Every lyric
 * here is invented.
 */
import { execFile } from 'node:child_process';
import { link, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { CURSOR_SCRIPT } from './shot-cursor.mjs';
import { createKeyOverlay } from './key-overlay.mjs';
import { performersTranscription, waitForWorkbench } from './shot-scene.mjs';
import { writeShotDimensions } from './write-shot-dimensions.mjs';

const run = promisify(execFile);
const origin = process.env.ORIGIN ?? 'http://127.0.0.1:5173';
const FPS = 30;
const SCALE = 2;
const HOLD_STEP = 3;

// The workbench's own sample, read from its source so this script cannot drift
// from what `Load a sample 'scribe` loads. Its findings are chosen for range.
const sampleText = (await readFile('src/lib/ui/sample-draft.ts', 'utf8')).match(
	/sampleDraftText = `([^`]*)`/
)[1];

/** Two identical choruses with one mishearing in each, for the mirror to fix. */
const linkedTranscription = `[Verse 1]
The map you drew was a coffee ring and a guess
I keep it folded in the door where the cold gets in

[Chorus]
Hold the lion, hold the line
We were never gonna make it quietly
Hold the line before the morning comes

[Verse 2]
We counted three exits and took none of them
Somewhere past the bridge the signal dropped again

[Chorus]
Hold the lion, hold the line
We were never gonna make it quietly
Hold the line before the morning comes`;

/** An intro and a chorus with headers, then a verse that has not been given one. */
const headerlessTranscription = `[Intro]
I counted every streetlight on the way
You said we'd drive until the radio gave out

[Chorus]
Hold the line, hold the line
We were never gonna make it quietly

The map you drew was a coffee ring and a guess
I keep it folded in the door where the cold gets in`;

const savedScribes = [
	['Coffee Ring Map', linkedTranscription],
	['Leave the Radio On', performersTranscription],
	['Porch Light', sampleText],
	['Hold the Line', headerlessTranscription]
];

const ease = (t) => t * t * t * (10 + t * (-15 + 6 * t));
const even = (n) => Math.round(n / 2) * 2;

async function settle(page) {
	// The `document`-tier rules settle 1500ms after typing stops, and Harper a
	// beat after the native rules.
	await page.waitForTimeout(2500);
}

async function dismissToasts(page) {
	const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
	while (await dismiss.count()) await dismiss.first().click();
	await page.locator('.toast').first().waitFor({ state: 'detached', timeout: 10_000 });
}

async function blur(page) {
	await page.evaluate(() =>
		document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined
	);
}

async function replaceDocument(page, editor, text) {
	await editor.click();
	await page.keyboard.press('Control+A');
	await editor.fill(text);
	await settle(page);
	// A pasted legend imports its performers with a toast, and a toast in a
	// picture is a notification about work the reader never did.
	await dismissToasts(page);
}

/** A CSS-pixel clip around boxes, padded, kept inside the window, even at 2x. */
function hug(boxes, viewport, pad = 24) {
	const left = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x)) - pad));
	const top = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y)) - pad));
	const right = Math.min(
		viewport.width,
		Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + pad)
	);
	const bottom = Math.min(
		viewport.height,
		Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + pad)
	);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The lyric text's own extent: a `.cm-line` box is the full content width. */
async function lyricBox(page) {
	return page.evaluate(() => {
		const lines = [...document.querySelectorAll('.cm-content .cm-line')];
		const gutter = document.querySelector('.cm-gutters').getBoundingClientRect();
		let right = 0;
		for (const line of lines) {
			const range = document.createRange();
			range.selectNodeContents(line);
			right = Math.max(right, range.getBoundingClientRect().right);
		}
		const top = lines[0].getBoundingClientRect().top;
		const bottom = lines.at(-1).getBoundingClientRect().bottom;
		return { x: gutter.left, y: top, width: right - gutter.left, height: bottom - top };
	});
}

async function box(locator) {
	const found = await locator.boundingBox();
	if (!found) throw new Error(`${locator} has no box`);
	return found;
}

/** PNG to the page's WebP set, the same encoder and quality as the landing shots. */
async function writeStill(pngPath, stem) {
	await run('ffmpeg', [
		'-y',
		'-i',
		pngPath,
		'-c:v',
		'libwebp',
		'-quality',
		'82',
		`static/${stem}.webp`
	]);
	for (const width of [400, 640, 960]) {
		await run('ffmpeg', [
			'-y',
			'-i',
			pngPath,
			'-vf',
			`scale='min(${width},iw)':-1`,
			'-c:v',
			'libwebp',
			'-quality',
			'82',
			`static/${stem}-${width}.webp`
		]);
	}
	console.log(`wrote static/${stem}.webp`);
}

/*
 * Nothing is written into `static/` until the browser is done. A dev server
 * watches that directory and reloads the page on any change there, which would
 * throw a scene (or the next one) back to a fresh workbench halfway through.
 */
const work = await mkdtemp(join(tmpdir(), 'lyriclint-docs-'));
const pending = [];

async function shoot(page, stem, clip) {
	const png = join(work, `${stem}.png`);
	await page.screenshot({ path: png, type: 'png', clip });
	pending.push(() => writeStill(png, stem));
}

/**
 * Frames of one fixed region under the fake clock, with the drawn pointer.
 * `rest` is where the pointer starts and ends, so the loop closes on its
 * opening frame apart from what the scene changed.
 */
async function createFilm(page, region, rest) {
	const dir = await mkdtemp(join(work, 'film-'));
	await page.evaluate(CURSOR_SCRIPT);
	await page.clock.install();
	await page.clock.pauseAt(new Date(Date.now() + 100));
	let cursor = { ...rest };
	let index = 0;

	const frame = async (press = 0, count = 1) => {
		await page.clock.runFor((1000 / FPS) * count);
		// Workers (the linter, Harper) answer in real time; give them the chance.
		await page.waitForTimeout(10);
		await page.evaluate(([x, y, p]) => window.__shotCursor(x, y, p), [cursor.x, cursor.y, press]);
		const path = join(dir, `f-${String(index).padStart(4, '0')}.png`);
		await page.screenshot({ path, type: 'png', clip: region });
		index += 1;
		for (let i = 1; i < count; i += 1) {
			await link(path, join(dir, `f-${String(index).padStart(4, '0')}.png`));
			index += 1;
		}
	};
	const hold = async (frames, press = 0) => {
		for (let done = 0; done < frames; done += HOLD_STEP) {
			await frame(press, Math.min(HOLD_STEP, frames - done));
		}
	};
	const glide = async (to) => {
		const from = { ...cursor };
		const dx = to.x - from.x;
		const dy = to.y - from.y;
		const distance = Math.hypot(dx, dy);
		const count = Math.ceil(Math.max(0.3, 0.18 + Math.sqrt(distance) / 38) * FPS);
		const bend = Math.min(18, distance * 0.045);
		for (let i = 1; i <= count; i += 1) {
			const t = ease(i / count);
			const arc = 4 * t * (1 - t) * bend;
			cursor = {
				x: from.x + dx * t - (dy / (distance || 1)) * arc,
				y: from.y + dy * t + (dx / (distance || 1)) * arc
			};
			await page.mouse.move(cursor.x, cursor.y);
			await frame();
		}
	};
	const click = async (target, { settleFrames = 12 } = {}) => {
		const b = await box(target);
		await glide({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
		await page.mouse.click(cursor.x, cursor.y);
		for (const p of [0.05, 0.35, 0.6, 0.85]) await frame(p);
		await hold(settleFrames);
	};
	/** Advance filmed time until the page agrees, or fail loudly. */
	const until = async (predicate, what, limit = FPS * 8) => {
		for (let i = 0; i < limit; i += HOLD_STEP) {
			if (await predicate()) return;
			await hold(HOLD_STEP);
		}
		throw new Error(`timed out waiting for ${what}`);
	};
	return {
		frame,
		hold,
		glide,
		click,
		until,
		/** The still, from the same region, without the pointer. */
		async still(stem) {
			await page.evaluate(() => window.__shotCursor(-100, -100, 0));
			await shoot(page, stem, region);
			await page.evaluate(([x, y]) => window.__shotCursor(x, y, 0), [cursor.x, cursor.y]);
		},
		encode(stem) {
			pending.push(async () => {
				const output = `static/${stem}.webm`;
				await run('ffmpeg', [
					'-y',
					'-framerate',
					String(FPS),
					'-i',
					join(dir, 'f-%04d.png'),
					'-c:v',
					'libvpx-vp9',
					'-g',
					String(FPS * 10),
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
					output
				]);
				const { size } = await stat(output);
				console.log(`wrote ${output} (${index} frames, ${(size / 1024).toFixed(0)}KB)`);
			});
		}
	};
}

const scenes = {
	/** Paste, findings arrive, one fix, Copy lyrics confirms in place. */
	'first-scribe': {
		viewport: { width: 1100, height: 720 },
		async run(page) {
			await page.evaluate((text) => navigator.clipboard.writeText(text), sampleText);
			const rest = { x: 520, y: 560 };
			const film = await createFilm(page, { x: 0, y: 0, width: 1100, height: 720 }, rest);
			await film.hold(30);
			await film.click(page.getByRole('button', { name: 'Paste lyrics', exact: true }));
			await film.glide(rest);
			const findings = page.locator('.diagnostic-list__navigate');
			await film.until(async () => (await findings.count()) >= 7, 'seven findings');
			await film.hold(45);
			await film.still('docs-first-scribe');
			await film.hold(15);
			// The next card rises under the pointer once this one is fixed, so the
			// pointer leaves at once rather than parking on (and hinting) its button.
			await film.click(page.getByRole('button', { name: "Replace with don't", exact: true }), {
				settleFrames: 0
			});
			await film.glide(rest);
			await film.hold(36);
			const text = await page.locator('.cm-content').textContent();
			if (!text.includes("I don't need")) throw new Error('the fix did not land');
			await film.click(page.getByRole('button', { name: 'Copy lyrics', exact: true }), {
				settleFrames: 0
			});
			await page.getByRole('button', { name: 'Lyrics copied' }).waitFor();
			if ((await page.evaluate(() => navigator.clipboard.readText())).trim() === '') {
				throw new Error('nothing reached the clipboard');
			}
			await film.glide(rest);
			await film.hold(60);
			await film.encode('docs-first-scribe');
		}
	},

	/** The 'scribes menu with several saved 'scribes, each made through the UI. */
	scribes: {
		async run(page, editor) {
			const menu = page.getByRole('button', { name: "'Scribes", exact: true });
			for (const [index, [title, text]] of savedScribes.entries()) {
				if (index > 0) {
					await page.getByRole('button', { name: "New 'scribe", exact: true }).first().click();
					await page.waitForTimeout(500);
				}
				await replaceDocument(page, editor, text);
				// Named in the toolbar's own title field, the way a user names one.
				await page.locator('#draft-title').fill(title);
				await page.locator('#draft-title').press('Enter');
				await page.waitForTimeout(600);
				await dismissToasts(page);
			}
			// Open on the first, so the menu's current row is not simply the newest.
			await menu.click();
			await page.getByRole('button', { name: 'Coffee Ring Map', exact: false }).first().click();
			await page.waitForTimeout(800);
			await menu.click();
			const popover = page.locator('.draft-menu__popover');
			await popover.waitFor();
			await page.mouse.move(1000, 700);
			await page.waitForTimeout(600);
			await dismissToasts(page);
			const toolbar = await box(page.locator('.document-toolbar__home'));
			await shoot(
				page,
				'docs-scribes',
				hug([toolbar, await box(popover)], page.viewportSize(), 14)
			);
		}
	},

	/** `Mod-Shift-H` on a section with no header opens the header picker. */
	sections: {
		async run(page, editor) {
			await replaceDocument(page, editor, headerlessTranscription);
			await page.locator('.cm-line', { hasText: 'The map you drew' }).click();
			await page.keyboard.press('End');
			// The shortcut is what this picture is about, so it wears the key badge.
			const keys = await createKeyOverlay(page, { duration: 60 });
			await keys.press('Control+Shift+H', { at: 0, label: 'Ctrl Shift H' });
			const picker = page.getByRole('dialog', { name: 'Add section header' });
			await picker.waitFor();
			await page.mouse.move(1200, 700);
			await page.waitForTimeout(500);
			const lyrics = await lyricBox(page);
			const card = await box(picker);
			await keys.render(0, { x: card.x + card.width + 100, y: card.y + card.height / 2 });
			const badge = await box(page.locator('#__shot_keys'));
			await shoot(page, 'docs-sections', hug([lyrics, card, badge], page.viewportSize()));
		}
	},

	/** Linked choruses: one correction typed, both copies change. */
	'section-links': {
		async run(page, editor) {
			await replaceDocument(page, editor, linkedTranscription);
			await page.getByRole('button', { name: 'Manage linking', exact: true }).click();
			const second = page.getByRole('checkbox', { name: /^Chorus 2/ });
			if (!(await second.isChecked())) await second.click();
			await page.getByRole('button', { name: /^Link (2 )?sections/ }).click();
			await page.waitForTimeout(600);
			await dismissToasts(page);
			await editor.focus();
			await page.keyboard.press('Control+Home');
			await blur(page);
			await page.waitForTimeout(300);

			const lyrics = await lyricBox(page);
			// Room for the scope readout beside the first chorus's header.
			const region = hug([{ ...lyrics, width: Math.max(lyrics.width, 560) }], page.viewportSize());
			region.width = even(region.width);
			region.height = even(region.height);
			const rest = { x: region.x + region.width - 60, y: region.y + 40 };
			const film = await createFilm(page, region, rest);
			await film.hold(15);
			await film.still('docs-section-links');
			await film.hold(15);

			const lion = await page.evaluate(() => {
				const line = [...document.querySelectorAll('.cm-line')].find((l) =>
					l.textContent.startsWith('Hold the lion')
				);
				const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
				for (let node = walker.nextNode(); node; node = walker.nextNode()) {
					const at = node.textContent.indexOf('lion');
					if (at < 0) continue;
					const range = document.createRange();
					range.setStart(node, at);
					range.setEnd(node, at + 4);
					const r = range.getBoundingClientRect();
					return { x: r.right, y: r.top + r.height / 2 };
				}
			});
			// A caret, not a selection: a pointer selection opens the performer
			// picker, which is another page's subject.
			await film.glide(lion);
			await page.mouse.click(lion.x, lion.y);
			for (const p of [0.05, 0.35, 0.6, 0.85]) await film.frame(p);
			// Out of the way of the line, long enough to read the scope readout.
			await film.glide({ x: lion.x + 60, y: lion.y + 80 });
			await film.hold(30);
			for (const key of ['Backspace', 'Backspace', 'n', 'e']) {
				await page.keyboard.press(key);
				await film.hold(8);
			}
			await film.hold(30);
			await film.glide(rest);
			await film.hold(75);
			const text = await page
				.locator('.cm-content')
				.evaluate((c) => [...c.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n'));
			if (text.includes('lion') || text.split('Hold the line, hold the line').length !== 3) {
				throw new Error(`the correction did not reach both choruses:\n${text}`);
			}
			await film.encode('docs-section-links');
		}
	},

	/** An expanded finding beside its fix previewed in the document. */
	findings: {
		// Narrower than the default, so the lyric column is not mostly bare editor.
		viewport: { width: 1100, height: 900 },
		async run(page, editor) {
			await replaceDocument(page, editor, sampleText);
			const navigate = page.getByRole('button', { name: /^Go to “Definately”/ });
			await navigate.click();
			await page.waitForTimeout(600);
			await blur(page);
			await page.mouse.move(700, 800);
			await page.waitForTimeout(400);
			if ((await navigate.getAttribute('aria-expanded')) !== 'true') {
				throw new Error('the spelling finding did not expand');
			}
			// From the document's top edge to the foot of the expanded card, and
			// from the editor to the panel's own edge (the tab rail stays out).
			const clip = await navigate.evaluate((button) => {
				const editor = document.querySelector('.editor-region').getBoundingClientRect();
				const panel = document.querySelector('[role="tabpanel"]').getBoundingClientRect();
				const card = button.closest('li').getBoundingClientRect();
				return {
					x: Math.floor(editor.left),
					y: Math.floor(editor.top),
					width: Math.ceil(panel.right + 8 - editor.left),
					height: Math.ceil(card.bottom + 24 - editor.top)
				};
			});
			await shoot(page, 'docs-findings', clip);
		}
	},

	/** The audio picker at rest. No source is contacted. */
	audio: {
		async run(page, editor) {
			await replaceDocument(page, editor, performersTranscription);
			await page.getByRole('button', { name: 'Add audio source', exact: true }).click();
			const dialog = page.getByRole('dialog', { name: 'Add audio source' });
			await dialog.waitFor();
			await page.waitForTimeout(600);
			await shoot(page, 'docs-audio', hug([await box(dialog)], page.viewportSize(), 40));
		}
	},

	/** The Preferences tab of the right panel. */
	preferences: {
		// Short enough that the panel's settings fill it rather than trail off.
		viewport: { width: 1280, height: 600 },
		async run(page, editor) {
			await replaceDocument(page, editor, performersTranscription);
			await page.getByRole('tab', { name: 'Preferences', exact: true }).click();
			const panel = page.getByRole('tabpanel', { name: 'Preferences' });
			await panel.locator('h2, h3').first().waitFor();
			await blur(page);
			await page.mouse.move(400, 500);
			await page.waitForTimeout(600);
			await shoot(
				page,
				'docs-preferences',
				hug(
					[await box(page.locator('.right-panel, #document-panel').first())],
					page.viewportSize(),
					0
				)
			);
		}
	},

	/**
	 * The Assistant tab with one question answered. No assistant service runs
	 * here, so its one request is answered by a fixture: the wording restates
	 * `section.header-missing`'s own explanation and cites that rule and its
	 * source, which the panel resolves from the real catalog. Everything else
	 * (the transcript, the citation card, the composer) is the real panel.
	 */
	assistant: {
		viewport: { width: 1280, height: 620 },
		async run(page, editor) {
			await page.route('**/v1/answers', (route) =>
				route.fulfill({
					contentType: 'application/json',
					body: JSON.stringify({
						requestId: 'docs-fixture',
						assistant: {
							scope: 'reviewed',
							blocks: [
								{
									kind: 'prose',
									text: 'Yes. Every lyric section separated by a blank line needs its own song-part header, such as [Verse 2]. If the lines after the blank line continue the same part, remove the blank line instead: Genius does not allow blank lines to split one part into smaller stanzas.',
									ruleIds: ['section.header-missing'],
									sourceIds: ['G-SECTIONS']
								}
							]
						},
						quota: {
							browserRemaining: 19,
							ipRemaining: 49,
							resetsAt: new Date(Date.now() + 86_400_000).toISOString()
						}
					})
				})
			);
			await replaceDocument(page, editor, headerlessTranscription);
			await page.getByRole('tab', { name: 'Assistant', exact: true }).click();
			const panel = page.getByRole('tabpanel', { name: 'Assistant' });
			const question = panel.getByLabel('Your question');
			await question.fill('Does a new stanza after a blank line need its own header?');
			await question.press('Enter');
			await panel.getByText('Genius does not allow blank lines').waitFor();
			await page.waitForTimeout(800);
			await blur(page);
			await page.mouse.move(300, 700);
			await page.waitForTimeout(400);
			await dismissToasts(page);
			await shoot(page, 'docs-assistant', await box(page.locator('#document-panel')));
		}
	},

	/** The writing view at a phone's width. */
	phone: {
		viewport: { width: 390, height: 844 },
		mobile: true,
		async run(page, editor) {
			await replaceDocument(page, editor, sampleText);
			await page.keyboard.press('Control+Home');
			await blur(page);
			await page.waitForTimeout(400);
			await shoot(page, 'docs-phone', { x: 0, y: 0, width: 390, height: 844 });
		}
	}
};

const { values } = parseArgs({ options: { scene: { type: 'string' } } });
if (values.scene && !scenes[values.scene]) {
	throw new Error(`unknown scene ${values.scene}; one of ${Object.keys(scenes).join(', ')}`);
}
const chosen = values.scene ? [values.scene] : Object.keys(scenes);

await mkdir(resolve('static'), { recursive: true });
const browser = await chromium.launch();
try {
	for (const name of chosen) {
		// A dev server reloads the page whenever a watched source changes, which
		// throws a scene back to a fresh workbench. The scene starts again from
		// nothing; the owned preview `render:all` uses never reloads.
		for (let attempt = 1; ; attempt += 1) {
			const context = await browser.newContext({
				viewport: scenes[name].viewport ?? { width: 1280, height: 820 },
				deviceScaleFactor: SCALE,
				colorScheme: 'dark',
				reducedMotion: 'reduce',
				isMobile: scenes[name].mobile ?? false,
				hasTouch: scenes[name].mobile ?? false,
				permissions: ['clipboard-read', 'clipboard-write']
			});
			// Nothing leaves the machine: every source and CDN answers as offline.
			await context.route(
				(url) => !url.href.startsWith(origin) && /^https?:/.test(url.protocol),
				(route) => route.abort()
			);
			const page = await context.newPage();
			// Gone after any reload, including one that raised no error of its own.
			const reloaded = () => page.evaluate(() => !window.__docsScene).catch(() => true);
			try {
				await page.goto(`${origin}/workbench/`);
				const editor = await waitForWorkbench(page);
				await page.evaluate(() => (window.__docsScene = true));
				console.log(`scene ${name}`);
				await scenes[name].run(page, editor);
				if (!(await reloaded())) break;
				if (attempt >= 3) throw new Error(`scene ${name} was reloaded three times`);
				console.log(`scene ${name} was reloaded mid-capture; starting it again`);
			} catch (error) {
				if (attempt >= 3 || !(await reloaded())) throw error;
				console.log(`scene ${name} was reloaded mid-capture; starting it again`);
			} finally {
				await context.close();
			}
		}
	}
} finally {
	await browser.close();
}

for (const write of pending) await write();
await rm(work, { recursive: true, force: true });
await writeShotDimensions();

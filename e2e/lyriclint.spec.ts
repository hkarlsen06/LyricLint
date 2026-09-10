import { execFileSync } from 'node:child_process';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { corpusMetadata } from '../services/rules-assistant/generated/rules-context-meta.js';
import {
	heroCaptions,
	heroPlaybackRate,
	playerCaptions
} from '../src/lib/ui/site/demo-captions.js';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * The page-side globals these probes hang on `window`. They exist only inside a
 * `page.evaluate` callback, written by one of them and read by the next; the
 * type is erased before the callback is serialised into the browser.
 */
interface ProbeWindow extends Window {
	__csp?: string[];
	__errorPageDocument?: string;
}

function editor(page: Page): Locator {
	return page.getByRole('textbox', { name: 'Lyrics editor' });
}

/**
 * Read the canonical document from CodeMirror state. DOM text is unusable for
 * byte-exact assertions: it flattens line breaks and includes decoration
 * widgets such as diagnostic badges.
 */
function docText(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		interface ContentHandle {
			view: { state: { doc: { toString(): string } } };
		}
		interface ContentElement extends Element {
			cmView?: ContentHandle;
			cmTile?: ContentHandle;
		}
		const content = document.querySelector<ContentElement>('.cm-content');
		// Return null (instead of throwing) while the editor is still mounting,
		// e.g. immediately after a reload, so expect.poll keeps retrying.
		const handle = content?.cmView ?? content?.cmTile;
		return handle ? handle.view.state.doc.toString() : null;
	});
}

async function expectDocText(page: Page, expected: string): Promise<void> {
	await expect.poll(() => docText(page)).toBe(expected);
}

async function openWorkspace(page: Page): Promise<void> {
	await page.goto('/workbench/');
	await expect(editor(page)).toBeVisible();
}

async function replaceDocument(page: Page, text: string): Promise<void> {
	const textbox = editor(page);
	await textbox.click();
	await textbox.press(`${mod}+A`);
	await textbox.fill(text);
	await expectDocText(page, text);
}

async function waitForSaved(page: Page): Promise<void> {
	// The healthy save states draw nothing, so the wording is only in the
	// accessible name.
	await expect(page.getByLabel('Autosave status')).toHaveAttribute('aria-label', /Saved locally/u);
}

async function expectSocialPreview(page: Page): Promise<void> {
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
		'content',
		'https://lyriclint.com/social-preview.png'
	);
	await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
	await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
	await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
		'content',
		/LyricLint/u
	);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		'content',
		'summary_large_image'
	);
	await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
		'content',
		'https://lyriclint.com/social-preview.png'
	);
}

test('the homepage and workbench align the wordmark and link it home', async ({ page }) => {
	await page.goto('/');

	// The nav has one guide destination and the app, separate from the brand: no
	// `About` beside a wordmark that links the same page, and `App` at the
	// width the row actually has. Re-adding a second way home is the
	// regression.
	const nav = page.getByRole('navigation', { name: 'Site' });
	await expect(nav.getByRole('link')).toHaveText(['Guide', 'App']);
	const siteWordmark = page.locator('.site-header .app-wordmark');
	const siteHeader = page.locator('.site-header');
	await expect(siteWordmark).toHaveAttribute('data-state', 'static');
	await expect(siteWordmark).toHaveCSS('transition-property', 'none');
	await expect(siteHeader).not.toHaveAttribute('data-scrolled');
	const borderAtRest = await siteHeader.evaluate(
		(element) => getComputedStyle(element).borderBottomColor
	);
	const siteHeaderBox = await siteHeader.boundingBox();
	const siteWordmarkBox = await siteWordmark.boundingBox();

	// The masthead's contents align with the page container, not the viewport:
	// the brand shares a left edge with the headline and every paragraph.
	const heroInner = page.locator('.lp-hero__inner');
	const heroInnerBox = await heroInner.boundingBox();
	const heroGutter = await heroInner.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).paddingLeft)
	);

	// The transparent border is present at rest so the band never moves; only
	// its paint arrives once content starts travelling underneath the sticky
	// masthead.
	await page.evaluate(() => window.scrollTo(0, 40));
	await expect(siteHeader).toHaveAttribute('data-scrolled', 'true');
	await expect
		.poll(() => siteHeader.evaluate((element) => getComputedStyle(element).borderBottomColor))
		.not.toBe(borderAtRest);
	expect((await siteHeader.boundingBox())?.height).toBe(siteHeaderBox?.height);

	await page.getByRole('link', { name: 'Open the workbench' }).first().click();
	await expect(editor(page)).toBeVisible();
	const toolbarBox = await page.locator('.document-toolbar').boundingBox();

	expect(siteHeaderBox).not.toBeNull();
	expect(siteWordmarkBox).not.toBeNull();
	expect(heroInnerBox).not.toBeNull();
	expect(toolbarBox).not.toBeNull();
	// The band is still exactly the workbench toolbar's height, so arriving at
	// the tool reads as the same window rather than a second product.
	expect(siteHeaderBox!.height).toBe(toolbarBox!.height);
	expect(siteWordmarkBox!.x).toBeCloseTo(heroInnerBox!.x + heroGutter, 1);

	await page.getByRole('link', { name: 'LyricLint home' }).click();
	await expect(page).toHaveURL(/\/$/u);
});

test('marketing home opens the canonical workbench', async ({ page }) => {
	await page.goto('/');

	await expect(
		page.getByRole('heading', { name: 'Catch Genius formatting problems before you submit.' })
	).toBeVisible();
	// The title the page actually ships. It was shortened in 220ded2 and this
	// assertion was not, so it had been failing since.
	await expect(page).toHaveTitle('Free lyric formatter for Genius transcriptions · LyricLint');
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Genius/u);
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/'
	);
	await expectSocialPreview(page);
	await expect
		.poll(async () =>
			(await page.locator('script[type="application/ld+json"]').allTextContents()).some((json) =>
				json.includes('"@type":"WebApplication"')
			)
		)
		.toBe(true);
	await page.getByRole('link', { name: 'Open the workbench' }).first().click();

	await expect(page).toHaveURL(/\/workbench\/$/u);
	await expect(editor(page)).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/workbench/'
	);
	await expect(page.locator('main.workspace h1')).toHaveText('LyricLint transcription workbench');
});

test('the old lint URL permanently redirects without losing workspace state', async ({ page }) => {
	const response = await page.request.get('/lint/?panel=linking&x=1&x=2', { maxRedirects: 0 });
	expect(response.status()).toBe(308);
	expect(response.headers().location).toBe('/workbench/?panel=linking&x=1&x=2');

	await page.goto('/lint/?panel=linking&x=1&x=2#draft');
	await expect(page).toHaveURL(/\/workbench\/\?panel=linking&x=1&x=2#draft$/u);
	await expect(editor(page)).toBeVisible();
});

test('the landing page activates its real editor only near the live demo', async ({ page }) => {
	await page.goto('/');

	const fallback = page.locator('.site-demo__fallback');
	await expect(fallback).toBeVisible();
	await expect(editor(page)).toHaveCount(0);

	// Reaching the prerendered stand-in crosses the component's look-ahead
	// boundary. CodeMirror replaces the same-shaped text rather than joining the
	// first navigation, and the fallback retires once the real editor is ready.
	await fallback.scrollIntoViewIfNeeded();
	await expect(editor(page)).toBeVisible();
	await expect(fallback).toHaveCount(0);
});

test('the landing demo explains the header prerequisite before assigning voices', async ({
	page
}) => {
	for (const width of [1440, 900]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.goto('/');
		const demo = page.locator('.lp-demo');
		await demo.scrollIntoViewIfNeeded();
		await expect(editor(page)).toBeVisible();
		await expect.poll(() => docText(page)).toMatch(/^Verse 1:/u);

		const heading = await demo.getByRole('heading').boundingBox();
		const frame = await demo.locator('.site-demo__editor').boundingBox();
		if (width === 1440) expect(Math.abs(heading!.y - frame!.y)).toBeLessThan(1);
		else expect(heading!.y).toBeGreaterThan(frame!.y + frame!.height);

		// The initial selection explains its prerequisite without moving the copy.
		// Repairing the header then enables the ordinary performer picker.
		const word = await demo
			.locator('.cm-line')
			.nth(1)
			.evaluate((line) => {
				const text = line.firstChild!;
				const start = text.textContent!.indexOf('counted');
				const range = document.createRange();
				range.setStart(text, start);
				range.setEnd(text, start + 'counted'.length);
				const rect = range.getBoundingClientRect();
				return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
			});
		await page.mouse.dblclick(word.x, word.y);
		const tooltip = page.locator('.control-tooltip');
		await expect(tooltip).toHaveText('Fix the section header first to tag performers.');
		await expect(page.getByRole('status')).toHaveText(
			'Fix the section header first to tag performers.'
		);
		await expect(page.getByRole('dialog', { name: 'Assign performers' })).toHaveCount(0);
		const afterHint = await demo.getByRole('heading').boundingBox();
		expect(afterHint!.y).toBe(heading!.y);
		await page.keyboard.press('Escape');
		await expect(tooltip).toHaveCount(0);
		await editor(page).press('ArrowLeft');
		await demo.locator('[data-ll-diagnostic-range]').first().hover();
		await page.getByRole('button', { name: 'Use [Verse 1]', exact: true }).click();
		await expect.poll(() => docText(page)).toMatch(/^\[Verse 1\]/u);
		await page.mouse.dblclick(word.x, word.y);
		await expect(tooltip).toHaveCount(0);
		const picker = page.getByRole('dialog', { name: 'Assign performers' });
		await expect(picker).toBeVisible();
		await picker.getByRole('button', { name: 'Avery', exact: true }).click();
		await picker.getByRole('button', { name: 'Next', exact: true }).click();
		await picker.getByRole('button', { name: 'Blair', exact: true }).click();
		await picker.getByRole('button', { name: 'Apply', exact: true }).click();
		await expect(picker).toHaveCount(0);
		await expect.poll(() => docText(page)).toContain('<i>counted</i>');
		await expect.poll(() => docText(page)).toContain('Avery');
		await expect.poll(() => docText(page)).toContain('Blair');
	}
});

test('the landing demo keeps accepted and ignored findings dismissed while editing', async ({
	page
}) => {
	await page.goto('/');
	const demo = page.locator('.lp-demo');
	await demo.scrollIntoViewIfNeeded();
	await expect(editor(page)).toBeVisible();
	const lyrics =
		"[Verse]\nI counted every [?] on the way\nYou said we'd drive until the radio gave out (Yeah)";
	await replaceDocument(page, lyrics);
	await demo.getByRole('heading').click();

	const findings = demo.locator('[data-ll-diagnostic-range]');
	await expect(findings).toHaveCount(1);
	await expect(findings).toHaveText('[?]');
	await findings.hover();
	await page.getByRole('button', { name: 'It really is unintelligible', exact: true }).click();
	await expect(page.locator('.popover')).toHaveCount(0);
	await expect(findings).toHaveCount(0);
	await expectDocText(page, lyrics);

	// Moving the accepted marker and introducing a fresh finding proves that a
	// subsequent lint pass retains the decision while still checking other text.
	const edited = lyrics
		.replace('counted every', 'counted nearly every')
		.replace('(Yeah)', '(yeah)');
	await replaceDocument(page, edited);
	await demo.getByRole('heading').click();
	await expect(findings).toHaveCount(1);
	await expect(findings).toHaveText('yeah');
	await findings.hover();
	await page.getByRole('button', { name: 'Ignore', exact: true }).click();
	await expect(page.locator('.popover')).toHaveCount(0);
	await expect(findings).toHaveCount(0);
	await expectDocText(page, edited);
});

test('a landing video keeps its still until its first frame is ready', async ({ page }) => {
	let releaseVideo!: () => void;
	const videoReleased = new Promise<void>((resolve) => {
		releaseVideo = resolve;
	});
	await page.route('**/workbench.webm', async (route) => {
		await videoReleased;
		await route.continue();
	});

	await page.goto('/', { waitUntil: 'domcontentloaded' });

	const frame = page.locator('.lp-shot__frame').first();
	await frame.scrollIntoViewIfNeeded();
	const poster = frame.locator('.lp-shot__poster');
	await expect(poster).toBeVisible();
	await expect(poster).toHaveAttribute('fetchpriority', 'high');
	await expect(frame.locator('video')).not.toHaveAttribute('poster');
	await page.evaluate(() => document.fonts.ready);
	const before = await frame.boundingBox();
	await expect(frame).not.toHaveAttribute('data-video-ready', '');

	releaseVideo();
	await expect(frame).toHaveAttribute('data-video-ready', '');
	await expect(poster).toHaveCSS('opacity', '0');
	expect(await frame.boundingBox()).toEqual(before);
});

test('a failed mobile hero keeps its still without downloading the desktop video', async ({
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	const requested: string[] = [];
	await page.route(/\/workbench(?:-mobile)?\.webm$/, async (route) => {
		requested.push(new URL(route.request().url()).pathname);
		await route.abort('failed');
	});
	await page.goto('/');
	const frame = page.locator('.lp-hero .lp-shot__frame');
	const video = frame.locator('video');
	await frame.scrollIntoViewIfNeeded();
	await expect(video).toHaveAttribute('src', /\/workbench-mobile\.webm$/);
	await expect
		.poll(() => video.evaluate((element: HTMLVideoElement) => element.error?.code))
		.toBe(4);
	await expect(frame).not.toHaveAttribute('data-video-ready', '');
	await expect(frame.locator('.lp-shot__poster')).toHaveCSS('opacity', '1');
	expect(requested).toEqual(['/workbench-mobile.webm']);
});

test('landing video frames keep their dimensions through loading on phone and desktop', async ({
	page
}) => {
	for (const width of [390, 1280]) {
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/');
		await page.evaluate(() => document.fonts.ready);
		const player = page.locator('.lp-player');
		await expect(player.locator('figcaption')).toHaveCount(0);
		await expect(player).not.toContainText('F7');
		await expect(player).toContainText('tap Space as each line starts');
		const playerFrame = await player.locator('.lp-shot__frame').boundingBox();
		const playerCopy = await player.locator('.lp-split__copy').boundingBox();
		if (width >= 1280) {
			expect(playerFrame!.y + playerFrame!.height / 2).toBeCloseTo(
				playerCopy!.y + playerCopy!.height / 2,
				0
			);
		} else {
			expect(playerFrame!.x).toBeGreaterThanOrEqual(0);
			expect(playerFrame!.x + playerFrame!.width).toBeLessThanOrEqual(width);
			expect(playerCopy!.y).toBeGreaterThanOrEqual(playerFrame!.y + playerFrame!.height);
		}
		for (const scene of ['player', 'song']) {
			await expect(page.locator(`video[src$="workbench-${scene}.webm"]`)).toHaveCount(1);
			await expect(page.locator(`img[src$="workbench-${scene}.webp"]`)).toHaveAttribute(
				'loading',
				'lazy'
			);
		}
		for (const frame of await page.locator('.lp-shot__frame').all()) {
			const before = await frame.boundingBox();
			await frame.scrollIntoViewIfNeeded();
			await expect(frame).toHaveAttribute('data-video-ready', '');
			const detailPoster = frame.locator('img[src*="workbench-"]');
			if (await detailPoster.count()) {
				const candidateWidth = width === 390 ? 400 : 640;
				await expect
					.poll(() => detailPoster.evaluate((image: HTMLImageElement) => image.currentSrc))
					.toMatch(
						new RegExp(`workbench-(player|song|performers|harper)-${candidateWidth}\\.webp$`)
					);
			}
			const video = frame.locator('video');
			if (await video.getAttribute('data-mobile-src')) {
				await expect(video).toHaveAttribute(
					'src',
					width === 390 ? /\/workbench-mobile\.webm$/ : /\/workbench\.webm$/
				);
			}
			const dimensions = await video.evaluate((element: HTMLVideoElement) => ({
				actual: [element.videoWidth, element.videoHeight],
				declared: [element.width, element.height]
			}));
			expect(dimensions.actual[0] / dimensions.actual[1]).toBeCloseTo(
				dimensions.declared[0] / dimensions.declared[1],
				5
			);
			const after = await frame.boundingBox();
			expect(after!.width).toBeCloseTo(before!.width, 1);
			expect(after!.height).toBeCloseTo(before!.height, 1);
		}
	}
});

test('demo subtitles follow spoken beats inside the video header', async ({ page }) => {
	test.setTimeout(60_000);
	for (const width of [390, 1280]) {
		await page.setViewportSize({ width, height: 1000 });
		await page.goto('/');
		await page.evaluate(() => document.fonts.ready);
		for (const [selector, cues, headerCenter, rate] of [
			['.lp-hero video', heroCaptions, 28 / 1280, heroPlaybackRate],
			['.lp-player video', playerCaptions, 22 / 688, 1]
		] as const) {
			const video = page.locator(selector);
			const frame = video.locator('xpath=ancestor::*[contains(@class, "lp-shot__frame")]');
			await frame.scrollIntoViewIfNeeded();
			await expect(frame).toHaveAttribute('data-video-ready', '');
			expect(await video.evaluate((element: HTMLVideoElement) => element.playbackRate)).toBe(rate);
			await video.evaluate((element: HTMLVideoElement) => element.pause());
			const before = await frame.boundingBox();
			const caption = frame.locator('.demo-captions__current');
			await expect(frame.locator('.demo-captions__measure')).toHaveCount(0);
			// Watch a real cue boundary too: frame scheduling must continue after play.
			await video.evaluate(async (element: HTMLVideoElement, time) => {
				element.currentTime = time;
				await element.play();
			}, cues[0].start + 0.1);
			await expect(caption).toHaveText(cues[1].text);
			await video.evaluate((element: HTMLVideoElement) => element.pause());
			// Backwards seek to the opening also exercises the viewport/loop reset.
			for (const cue of [...cues, cues[0]]) {
				await video.evaluate((element: HTMLVideoElement, time) => {
					element.currentTime = time;
				}, cue.start + 0.1);
				await expect(caption).toHaveText(cue.text);
				await expect(caption).toBeVisible();
				expect(await frame.boundingBox()).toEqual(before);
				const text = await caption.boundingBox();
				const footage = await video.boundingBox();
				expect(text!.y).toBeGreaterThanOrEqual(footage!.y);
				expect(text!.y + text!.height / 2).toBeCloseTo(
					footage!.y + Math.max(footage!.width * headerCenter, text!.height / 2),
					0
				);
				const maxHeight = await caption.evaluate((element) => {
					const style = getComputedStyle(element);
					return (
						2 * parseFloat(style.lineHeight) +
						parseFloat(style.paddingTop) +
						parseFloat(style.paddingBottom)
					);
				});
				expect(text!.height).toBeLessThanOrEqual(maxHeight + 1);
				expect(text!.x + text!.width / 2).toBeCloseTo(footage!.x + footage!.width / 2, 0);
				expect(before!.height - footage!.height).toBeLessThan(3);
				expect(text!.x).toBeGreaterThanOrEqual(before!.x);
				expect(text!.x + text!.width).toBeLessThanOrEqual(before!.x + before!.width);
			}
		}
	}
});

test('player demonstrations keep their screenshots for reduced motion', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	for (const caption of await page.locator('.demo-captions').all()) {
		await expect(caption).toBeHidden();
	}
	for (const scene of ['player', 'song']) {
		const video = page.locator(`video[src$="workbench-${scene}.webm"]`);
		const frame = video.locator('..');
		await frame.scrollIntoViewIfNeeded();
		const still = frame.locator('img');
		await expect(still).toBeVisible();
		await expect(still).toHaveCSS('opacity', '1');
		await expect
			.poll(() => still.evaluate((image: HTMLImageElement) => image.naturalWidth))
			.toBeGreaterThan(0);
		await expect(video).toHaveAttribute('preload', 'none');
		await expect(video).not.toHaveAttribute('poster');
		await expect(frame).not.toHaveAttribute('data-video-ready');
		expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
	}
});

test('the unified guide has one entrance and exposes check metadata and language semantics', async ({
	page
}) => {
	await page.goto('/guidelines/');
	await expect(page).toHaveTitle('Transcription guide · LyricLint');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/guidelines/'
	);
	await expectSocialPreview(page);
	await expect
		.poll(() => page.locator('script[type="application/ld+json"]').textContent())
		.toContain('"@type":"CollectionPage"');
	await expect(page.getByRole('navigation', { name: 'Site' }).getByRole('link')).toHaveText([
		'Guide',
		'App'
	]);
	await expect(page.getByRole('heading', { name: 'Browse by topic', exact: true })).toHaveCount(1);
	await expect(page.locator('main .reference-questions a')).toHaveCount(4);
	await expect(page.locator('a[href^="/rules/"]')).toHaveCount(0);
	await expect(page.locator('.reference-filters')).not.toHaveAttribute('open');
	await expect(page.locator('.reference-controls[aria-label="Search scope"]')).toHaveCount(0);

	await page.goto('/guidelines/checks/spelling-arabic-common/');
	// The page is named for what the rule catches rather than for the one
	// misspelling its reviewed example happens to carry — the index row that
	// opens it says the same words. The message is still on the page, under the
	// example that produces it.
	await expect(page).toHaveTitle('A non-standard Arabic spelling · LyricLint');
	await expect(page.locator('main h1')).toHaveText('A non-standard Arabic spelling');
	// Scoped to the element rather than by text: the same words are in the
	// paragraph and in the `<strong>` inside it, so a bare `getByText` resolves
	// two nodes and fails strict mode.
	await expect(page.locator('p.site-aside strong')).toContainText('Review “لاكن”');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/guidelines/checks/spelling-arabic-common/'
	);
	await expect
		.poll(() => page.locator('script[type="application/ld+json"]').textContent())
		.toContain('"@type":"TechArticle"');
	await expect(page.locator('pre[lang="ar"][dir="rtl"]')).toHaveCount(2);

	// A rule page names the convention behind it in the guidance catalog, and
	// the press lands the topic page on the entry itself — the reverse of the
	// entry's own "Checked by" ids, derived from the same mapping.
	await page.goto('/guidelines/checks/numbers-spell-out/');
	await page
		.locator('main.site-split__page')
		.getByRole('link', { name: 'Spell numbers out' })
		.click();
	await expect(page).toHaveURL(/\/guidelines\/numbers\/#spelled-out$/u);
	await expect(page.locator('.guidelines__entry[data-current] h2')).toHaveText('Spell numbers out');
});

test('legacy rule URLs redirect into the guide without losing search or fragments', async ({
	page
}) => {
	await page.goto('/rules/?q=two%20singers#old-position');
	await expect(page).toHaveURL(/\/guidelines\/\?q=two(?:%20|\+)singers#old-position$/u);
	await expect(page.getByRole('searchbox', { name: 'Search the transcription guide' })).toHaveValue(
		'two singers'
	);
	await page.goto('/rules/#section');
	await expect(page).toHaveURL(/\/guidelines\/#section$/u);
	await expect(page.locator('#section')).toBeAttached();
	await expect(
		page
			.getByRole('navigation', { name: 'Browse reference topics' })
			.getByRole('link', { name: 'Section headers and performers', exact: true })
	).toBeInViewport();
	for (const width of [1280, 390]) {
		await page.setViewportSize({ width, height: 720 });
		await page.goto('/rules/#harper');
		await expect(page).toHaveURL(/\/guidelines\/#harper$/u);
		await expect(page.locator('#harper summary')).toBeInViewport();
		await page.locator('#harper summary').click();
		await expect(page.locator('#harper')).toHaveAttribute('open');
	}
	await page.setViewportSize({ width: 1280, height: 720 });
	await page.goto('/rules/spelling-english-common/?q=definately&scope=rules#example');
	await expect(page).toHaveURL(
		/\/guidelines\/checks\/spelling-english-common\/\?q=definately&scope=rules#example$/u
	);
	await expect(page.locator('main h1')).toHaveText('A common English misspelling');
	await expect(page.locator('#reference-content')).toHaveValue('rules');
});

test('shared reference search finds warning text and preserves URL state', async ({ page }) => {
	await page.goto('/guidelines/');
	const search = page.getByRole('searchbox', { name: 'Search the transcription guide' });
	const rows = page.locator('.reference-result');
	await expect(page.getByRole('navigation', { name: 'Browse reference topics' })).toBeVisible();
	await expect(rows).toHaveCount(0);
	await search.fill('definately');
	await page.locator('.reference-filters summary').click();
	await page.getByRole('combobox', { name: 'Content', exact: true }).selectOption('rules');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('A common English misspelling');
	await expect(rows.first().locator('.reference-description')).toContainText('definately');
	await rows.first().click();
	await expect(page).toHaveURL(
		/\/guidelines\/checks\/spelling-english-common\/\?q=definately&scope=rules$/u
	);
	await expect(page.locator('main mark.site-hit').first()).toHaveText('definately');
	await expect(page.locator('.site-sample--invalid pre')).toHaveText(
		'[Verse]\nI will definately stay'
	);
	await page.reload();
	await expect(search).toHaveValue('definately');
	await expect(page.locator('#reference-content')).toHaveValue('rules');
	await page.goBack();
	await expect(search).toHaveValue('definately');
	await expect(page).toHaveURL(/\/guidelines\/\?q=definately&scope=rules$/u);
	await expect(page.locator('#reference-content')).toHaveValue('rules');

	await search.fill('languages');
	await rows.filter({ hasText: 'An English name for a localized part' }).click();
	const cited = page.locator('.source-reference a mark.site-hit');
	await expect(cited.first()).toHaveText('Languages');
	const [marked, prose] = await Promise.all([
		cited.first().evaluate((node) => getComputedStyle(node).color),
		page
			.locator('main p')
			.first()
			.evaluate((node) => getComputedStyle(node).color)
	]);
	expect(marked).toBe(prose);
	await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
	await expect(page.locator('main mark.site-hit')).toHaveCount(0);
});

test('reference check filters are shareable and describe the opened check', async ({ page }) => {
	await page.goto('/guidelines/?scope=rules');
	await page.locator('.reference-filters summary').click();
	await page.getByRole('button', { name: 'No automatic fix', exact: true }).click();
	await expect(page).toHaveURL(/scope=rules&fix=none$/u);
	const rows = page.locator('.reference-result');
	await expect(rows.first()).toBeVisible();
	await rows.first().click();
	await expect(page.locator('main .site-meta')).toContainText('No automatic fix');
	await page.reload();
	await page.locator('.reference-filters summary').click();
	await expect(page.getByRole('button', { name: 'No automatic fix', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('natural questions and typos find conventions with their checks', async ({ page }) => {
	await page.goto('/guidelines/?q=two%20singers');
	const search = page.getByRole('searchbox', { name: 'Search the transcription guide' });
	await expect(search).toHaveValue('two singers');
	const answer = page.locator('.reference-results > li').filter({
		has: page.locator('.site-run__title', {
			hasText: 'Name artists in headers when voices differ'
		})
	});
	await expect(answer).toBeVisible();
	await expect(answer.locator('.reference-related')).toContainText('Related checks:');
	await answer.locator('.reference-related a').first().click();
	await expect(page).toHaveURL(/\/guidelines\/checks\/[^/]+\/\?q=two\+singers$/u);
	await expect(search).toHaveValue('two singers');
	await page.locator('main a[href*="/guidelines/"]').first().click();
	await expect(page).toHaveURL(/\/guidelines\/.*\?q=two\+singers#/u);
	await expect(search).toHaveValue('two singers');
	await search.fill('perfomer');
	await expect(page.locator('.reference-result').first()).toBeVisible();
	await expect(
		page.locator('.reference-result', { hasText: 'Similar wording' }).first()
	).toBeVisible();
});

test('integrated checks keep the topic reading position and expose unmatched checks', async ({
	page
}) => {
	await page.goto('/guidelines/section-headers/#voice-order');
	const disclosure = page
		.locator('.guidelines__entry:has(#voice-order) .guidelines__checks details')
		.first();
	await disclosure.locator('summary').click();
	const check = disclosure.locator('a');
	await check.scrollIntoViewIfNeeded();
	const detail = page.locator('.site-split__detail');
	const before = await detail.evaluate((node) => node.scrollTop);
	await check.click();
	await expect(page).toHaveURL(/\/guidelines\/checks\//u);
	await page.goBack();
	await expect(page).toHaveURL(/\/guidelines\/section-headers\/#voice-order$/u);
	await expect(disclosure).toHaveAttribute('open');
	await expect
		.poll(async () => Math.abs((await detail.evaluate((node) => node.scrollTop)) - before))
		.toBeLessThan(2);
	await page.goto('/guidelines/non-english/');
	const additional = page.locator('section[aria-labelledby="additional-checks"]');
	await expect(
		additional.getByRole('heading', { name: 'More checks for this topic' })
	).toBeVisible();
	await additional.locator('summary').click();
	await expect(additional.locator('a[href*="language-selection-mismatch"]')).toBeVisible();
});

test('a guidelines deep link lands on its entry, and a search marks its words', async ({
	page
}) => {
	// A guideline is a fragment on its topic's page, and the landing re-centers
	// the whole entry — the double-rAF deferral in the topic page is the one
	// behavior there that was measured rather than reasoned into, and this is
	// its only end-to-end pin. The native hash jump parks the heading at
	// `scroll-margin-top`, ~72px under the masthead; centered, the third entry
	// of four sits well below that, which is what the y-floor separates.
	await page.goto('/guidelines/punctuation/#doubled-exclamation');
	// `data-current` is the page's own mark, read off the hash; a full-page
	// arrival is the one navigation where `:target` also holds, so both are
	// asserted here — the router-navigation press further down is where
	// `:target` never updates and the mark is all there is.
	const washed = page.locator('.guidelines__entry[data-current]');
	await expect(washed).toHaveCount(1);
	await expect(page.locator('.guidelines__entry:has(:target)')).toHaveCount(1);
	await expect(washed.locator('h2')).toHaveText('One exclamation mark at a time');
	// And the wash actually paints here: on a wide screen the index stands
	// beside the page, so the washed entry and the marked row say one thing
	// together. The stacked width is where it stands down — the phone group
	// pins that half.
	expect(await washed.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none');
	// The topic page no longer closes with a `Checked by the linter` run: the
	// entries' own meta lines carry the rules now, and every rule page links its
	// guideline back — re-adding the trailing family list is the regression.
	await expect(page.getByRole('heading', { name: 'Checked by the linter' })).toHaveCount(0);
	await expect
		.poll(async () => {
			const heading = await washed.locator('h2').boundingBox();
			const detail = await page.locator('.site-split__detail').boundingBox();
			return (heading?.y ?? 0) - (detail?.y ?? 0);
		})
		.toBeGreaterThanOrEqual(0);

	// The index column marks the same entry as the page and brings the row up
	// under the finder, for a reader who arrived by URL rather than by pressing
	// it there.
	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toContainText('One exclamation mark at a time');
	await expect(current).toBeInViewport();

	// The topic's own name keeps everything under its heading — the query that
	// used to drop every guidance entry and answer with linter rows alone. The
	// seventh row is the ad-libs entry, whose meta line names
	// `punctuation.parenthesis-spacing` among the rules that check its shape.
	const search = page.getByRole('searchbox', { name: 'Search the transcription guide' });
	await search.fill('punctuation');
	const entryRows = page.locator('.site-split__index .reference-result[href*="#"]');
	expect(await entryRows.count()).toBeGreaterThan(0);

	// And the page a search opens says which of its words matched, exactly as a
	// rule page does — including inside the invented sample, which may not have
	// gained a character for it. Scoped to the washed entry: the topic page
	// carries one `Incorrect` sample per entry that has one, so the bare
	// locator resolves several and fails strict mode.
	await search.fill('turn it up');
	await page
		.locator('.site-split__index .reference-result', { hasText: 'One exclamation mark' })
		.click();
	await expect(page.locator('main mark.site-hit').first()).toBeVisible();
	await expect(
		page.locator('.guidelines__entry[data-current] .site-sample--invalid pre')
	).toHaveText('Turn it up!!');
});

test('pressing an entry from the index washes it on the first press', async ({ page }) => {
	// Pressing an index row from the index page — or from the other topic — is
	// the router's navigation, a `pushState`, and `:target` only updates on a
	// native fragment navigation: for a while the first press drew no wash, and
	// the reader had to press another entry and come back (a same-path hash
	// press, the one navigation the router leaves to the browser) to see it.
	// The page marks the entry itself now, and this is that regression's pin at
	// both broken arrivals.
	await page.goto('/guidelines/?browse=all');
	await page
		.locator('.site-split__index .reference-result', { hasText: 'One exclamation mark' })
		.click();
	const washed = page.locator('.guidelines__entry[data-current]');
	await expect(washed).toHaveCount(1);
	await expect(washed.locator('h2')).toHaveText('One exclamation mark at a time');

	// And from one topic straight to the other — the path changes, the hash
	// arrives with it, and the wash has to land on the pressed entry, not stay
	// where the last one was.
	const crossTopic = page
		.locator('.site-split__index .reference-result[href*="section-headers"][href*="#"]')
		.first();
	const crossTitle = await crossTopic.locator('.site-run__title').innerText();
	await crossTopic.click();
	await expect(washed).toHaveCount(1);
	await expect(washed.locator('h2')).toHaveText(crossTitle);
});

test('the topic directory narrows browsing before showing entries', async ({ page }) => {
	await page.goto('/guidelines/');
	const topics = page.getByRole('navigation', { name: 'Browse reference topics' });
	await topics.getByRole('link', { name: 'Punctuation and symbols', exact: true }).click();
	await expect(page).toHaveURL(/\/guidelines\/punctuation\/$/u);
	await expect(page.locator('.reference-result').first()).toBeVisible();
	await expect(
		page.locator('.reference-result').filter({ hasNotText: 'Punctuation and symbols' })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
	await expect(topics).toBeVisible();
	await topics.getByRole('link', { name: 'Spelling and contractions', exact: true }).click();
	await expect(page).toHaveURL(/\/guidelines\/spelling\/$/u);
	await expect(topics).toHaveCount(0);
	await expect(page.locator('.reference-result').first()).toBeVisible();
	await expect(
		page.locator('.reference-result').filter({ hasNotText: 'Spelling and contractions' })
	).toHaveCount(0);
	const spellingResults = await page.locator('.reference-result').count();
	await page.reload();
	await expect(page.locator('.reference-result')).toHaveCount(spellingResults);
	await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
	await topics.getByRole('link', { name: 'Spelling and contractions', exact: true }).click();
	await expect(topics).toHaveCount(0);
	await expect(page.locator('.reference-result')).toHaveCount(spellingResults);
	await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
	await page.getByRole('button', { name: 'Browse all', exact: true }).click();
	expect(await page.locator('.reference-result').count()).toBeGreaterThan(40);
});

test('a practical question opens its convention and reveals its row', async ({ page }) => {
	// The welcome page's topic list is in the detail column, so pressing a
	// topic there says nothing about the list — which is then parked wherever
	// it was, the top for a fresh load, with the arrived-at topic's rows
	// marking themselves several screens below the fold to nobody. The reveal
	// has to run for this arrival exactly as for a deep link: `pressedARow`
	// reads where the press actually landed, not merely that the navigation
	// started inside the section.
	await page.goto('/guidelines/');
	await page.getByRole('link', { name: 'How do I write backing vocals?', exact: true }).click();
	await expect(page).toHaveURL(/\/guidelines\/section-headers\/#parenthetical-formatting$/u);

	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toHaveAttribute('href', /#parenthetical-formatting$/u);
	await expect(current).toBeInViewport();
	// In the column rather than under its pinned finder, which `toBeInViewport`
	// cannot see past.
	const finder = await page.locator('.site-split__index .site-finder').boundingBox();
	await expect
		.poll(async () => (await current.boundingBox())?.y ?? 0)
		.toBeGreaterThan(finder!.y + finder!.height - 1);
});

test('pressing a row the reader can see moves the list by nothing', async ({ page }) => {
	// The other half of the same rule, which the reveal above must not regress:
	// a row pressed in the list is by definition one the reader can see, so
	// opening it may not move the list under their pointer.
	await page.goto('/guidelines/?topic=ad-libs');
	const column = page.locator('.site-split__index');
	await page
		.locator('.reference-result', { hasText: 'Echo repeats are not ad-libs' })
		.scrollIntoViewIfNeeded();
	const before = await column.evaluate((el) => el.scrollTop);
	await page
		.locator('.site-split__index .reference-result', { hasText: 'Echo repeats are not ad-libs' })
		.click();
	await expect(page.locator('.guidelines__entry[data-current] h2')).toHaveText(
		'Echo repeats are not ad-libs'
	);
	// Give a wrongly armed reveal its frames to fire before reading the offset.
	await page.waitForTimeout(400);
	expect(await column.evaluate((el) => el.scrollTop)).toBe(before);
});

test('the spelling topic lists the standardized spellings, and the finder searches them', async ({
	page
}) => {
	// The table is drawn from the same `ruleLookupTable` the rule page loads —
	// one data source, two surfaces — so the row count is the reviewed table's
	// own, not a hand-written excerpt that would go stale beside it.
	await page.goto('/guidelines/spelling/');
	const rows = page.locator('.rules__lookup-row');
	await expect(rows.first()).toBeVisible();
	expect(await rows.count()).toBeGreaterThan(20);

	// A spelling the page lists has to answer the finder — the citation lesson,
	// arriving here for lookup tables — and the open page marks the form. The
	// index draws no linter rows any more, so what the query lands on is the
	// standardized-spellings landmark, through `spelling.standardized`'s own
	// lookup terms folded into its haystack.
	const search = page.getByRole('searchbox', { name: 'Search the transcription guide' });
	await search.fill('whoa');
	await expect(
		page.locator('.site-split__index .reference-result[href$="#standardized-spellings"]')
	).toBeVisible();
	await expect(page.locator('main mark.site-hit').first()).toBeVisible();

	// The landmark states its standing beside the entries', which it did not
	// for a while: the table led the catalog's first topic under a lede
	// promising every convention names its tier and its source, and was the one
	// section naming neither. The tier and the citation come off the landmark's
	// own record, so what is checked here is that the section draws them.
	const landmark = page.locator('.guidelines__landmark');
	await expect(landmark.locator('.site-meta')).toContainText('Genius staff guidance');
	await expect(landmark.locator('.site-meta a[href="https://genius.com/9298624"]')).toHaveCount(1);

	// Check titles remain compact; occurrence-specific explanations open with their input.
	await search.fill('');
	const orthography = page.locator('.guidelines__entry:has(#standard-orthography)');
	await expect(orthography.getByRole('heading', { name: 'What LyricLint checks' })).toBeVisible();
	const disclosures = orthography.locator('.guidelines__checks details');
	await expect(disclosures).toHaveCount(9);
	const english = disclosures.filter({
		has: page.locator('summary', { hasText: 'A common English misspelling' })
	});
	await expect(english).not.toHaveAttribute('open');
	await expect(english.locator('.site-sample').first()).toBeHidden();
	await english.locator('summary').click();
	await expect(english.locator('.site-sample--invalid pre')).toHaveText(
		'[Verse]\nI will definately stay'
	);
	await expect(english.locator('.site-sample--valid pre')).toHaveText(
		'[Verse]\nI will definitely stay'
	);
	const check = english.getByRole('link', {
		name: 'See trigger and fix: A common English misspelling',
		exact: true
	});
	await expect(check).not.toHaveAttribute('target');
	await expect(check).toHaveAttribute('href', /\/guidelines\/checks\/spelling-english-common\/$/u);
	await expect(english.locator('p').first()).toContainText('definitely');
});

test('a fragment naming nothing falls back to the lead, and a landmark washes', async ({
	page
}) => {
	// A fragment is somebody else's string, so one that resolves to no heading
	// must not be published as the reading position — that left the index
	// marking no row at all until the next scroll event. The lead section is
	// what a topic opened with no fragment lands on, and it is the honest answer
	// here too.
	await page.goto('/guidelines/spelling/#no-such-anchor');
	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toContainText('The standardized spellings');
	// And no wash: nothing on the page carries the name the link asked for.
	await expect(
		page.locator('.guidelines__entry[data-current], .guidelines__landmark[data-current]')
	).toHaveCount(0);

	// A landmark is a deep-link target exactly as an entry is — the index and
	// every rule page's guideline link both name its anchor — so it takes the
	// same arrival wash through the same pair of marks.
	await page.goto('/guidelines/spelling/#standardized-spellings');
	await expect(page.locator('.guidelines__landmark[data-current]')).toHaveCount(1);
	await expect(page.locator('.guidelines__landmark:has(:target)')).toHaveCount(1);
});

test('the assistant release manifest identifies the built website and citation corpus', async ({
	request
}) => {
	const response = await request.get('/assistant-release.json');
	expect(response.ok()).toBe(true);
	expect(response.headers()['content-type']).toContain('application/json');
	expect(await response.json()).toEqual({
		revision:
			process.env.RELEASE_REVISION ??
			execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
		...corpusMetadata,
		clientCorpusHash: true,
		answersUrl: expect.any(String)
	});
});

test('sitemap lists every public page including the workbench', async ({ request }) => {
	const sitemapResponse = await request.get('/sitemap.xml');
	expect(sitemapResponse.ok()).toBe(true);
	expect(sitemapResponse.headers()['content-type']).toMatch(/(?:application|text)\/xml/u);

	const sitemap = await sitemapResponse.text();
	// The home page, the rule index, and one page per rule — so this number moves
	// by one every time a rule ships. It read 52 against 55 rules for three
	// releases, which is what a bare figure with nothing saying what it counts
	// costs; the arithmetic is written out so the next mismatch is legible.
	const rulePages =
		sitemap.match(/<loc>https:\/\/lyriclint\.com\/guidelines\/checks\/[^/]+\/<\/loc>/gu) ?? [];
	expect(rulePages).toHaveLength(60);
	// One page per guidance topic — this number moves when `guidanceTopicTitles`
	// gains a topic with entries, which docs/guidelines.md tells the contributor.
	const guidelinePages =
		sitemap.match(/<loc>https:\/\/lyriclint\.com\/guidelines\/[^/]+\/<\/loc>/gu) ?? [];
	expect(guidelinePages).toHaveLength(10);
	// Plus the home, about, workbench, unified guide, and privacy pages.
	expect(sitemap.match(/<url>/gu)).toHaveLength(rulePages.length + guidelinePages.length + 5);
	expect(sitemap).toContain('<loc>https://lyriclint.com/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/about/</loc>');
	expect(sitemap).not.toContain('/rules/');
	expect(sitemap).toContain('<loc>https://lyriclint.com/guidelines/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/guidelines/punctuation/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/privacy/</loc>');
	expect(sitemap).toContain(
		'<loc>https://lyriclint.com/guidelines/checks/spelling-arabic-common/</loc>'
	);
	expect(sitemap).toContain('<loc>https://lyriclint.com/workbench/</loc>');
	expect(sitemap).not.toContain('/lint/');

	const robots = await (await request.get('/robots.txt')).text();
	expect(robots).toContain('Sitemap: https://lyriclint.com/sitemap.xml');
});

/**
 * The Content-Security-Policy, pinned where it can actually fail.
 *
 * Every page is prerendered, so the policy rides in a `<meta http-equiv>` that
 * SvelteKit writes from `csp` in `vite.config.ts` — and the three grants below
 * are the ones whose loss looks exactly like working code. A missing
 * `wasm-unsafe-eval` or `worker-src blob:` takes Harper out silently, leaving a
 * workbench that lints natively and simply never proofreads; and a `style-src`
 * that grows a hash makes the browser ignore the `unsafe-inline` beside it,
 * which unstyles CodeMirror, every Svelte transition and the boot screen at
 * once. None of that is a build error.
 *
 * The negative half matters as much: an assertion that the app draws is not
 * evidence that the policy is enforced rather than absent, so this also refuses
 * a foreign script, image, frame and object and checks the browser said so.
 */
test('the prerendered policy admits the workbench and refuses everything else', async ({
	page
}) => {
	const violations: string[] = [];
	await page.addInitScript(() => {
		(window as ProbeWindow).__csp = [];
		document.addEventListener('securitypolicyviolation', (event) => {
			(window as ProbeWindow).__csp?.push(`${event.effectiveDirective} <- ${event.blockedURI}`);
		});
	});
	page.on('pageerror', (error) => violations.push(`pageerror: ${error.message}`));

	await openWorkspace(page);

	const policy = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(policy).toBeTruthy();
	const csp = policy ?? '';

	// Harper: a same-origin wasm compiled inside a worker built from a blob.
	expect(csp).toContain("'wasm-unsafe-eval'");
	expect(csp).toMatch(/worker-src[^;]*blob:/u);
	// Nothing here evals JavaScript, and `wasm-unsafe-eval` is deliberately the
	// narrower grant rather than a step towards the wider one.
	expect(csp).not.toContain("'unsafe-eval'");

	// CodeMirror's StyleModule, Svelte's transitions and the boot screen's style
	// attribute are all inline and none can be hashed under a meta policy — and a
	// hash in this directive is what would switch `unsafe-inline` off.
	const styleSrc = /style-src ([^;]*)/u.exec(csp)?.[1] ?? '';
	expect(styleSrc).toContain("'unsafe-inline'");
	expect(styleSrc).not.toMatch(/sha(?:256|384|512)-/u);

	// The hydration script is admitted by hash, never by loosening the directive.
	const scriptSrc = /script-src ([^;]*)/u.exec(csp)?.[1] ?? '';
	expect(scriptSrc).toMatch(/sha256-/u);
	expect(scriptSrc).not.toContain("'unsafe-inline'");

	// `frame-ancestors` is one of three directives a meta policy ignores, so it
	// belongs in `static/_headers` and must not be written here as a no-op.
	expect(csp).not.toContain('frame-ancestors');

	// The workbench came up and nothing was refused bringing it up.
	await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	expect(await page.evaluate(() => (window as ProbeWindow).__csp)).toEqual([]);

	// Preview has no Cloudflare edge injection. Exercise both analytics grants
	// with local responses so this checks CSP without sending real telemetry.
	await page.route('https://static.cloudflareinsights.com/beacon.min.js', (route) =>
		route.fulfill({ contentType: 'application/javascript', body: '/* analytics probe */' })
	);
	await page.route('https://cloudflareinsights.com/cdn-cgi/rum', (route) =>
		route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
	);
	await page.evaluate(async () => {
		await new Promise<void>((resolve, reject) => {
			const script = document.createElement('script');
			script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
			script.onload = () => resolve();
			script.onerror = () => reject(new Error('Analytics script blocked'));
			document.head.append(script);
		});
		const response = await fetch('https://cloudflareinsights.com/cdn-cgi/rum', {
			method: 'POST',
			body: '{}'
		});
		if (!response.ok) throw new Error('Analytics report failed');
	});
	expect(await page.evaluate(() => (window as ProbeWindow).__csp)).toEqual([]);

	// And the policy is enforced rather than merely present.
	await page.evaluate(() => {
		const img = document.createElement('img');
		img.src = 'https://example.com/blocked.png';
		document.body.append(img);
		const script = document.createElement('script');
		script.src = 'https://example.com/blocked.js';
		document.head.append(script);
		const frame = document.createElement('iframe');
		frame.src = 'https://example.com/';
		document.body.append(frame);
		const object = document.createElement('object');
		object.data = 'https://example.com/blocked.swf';
		document.body.append(object);
	});
	await expect
		.poll(() => page.evaluate(() => (window as ProbeWindow).__csp))
		.toEqual(
			expect.arrayContaining([
				expect.stringContaining('script-src'),
				expect.stringContaining('img-src'),
				expect.stringContaining('frame-src'),
				expect.stringContaining('object-src')
			])
		);
	expect(violations).toEqual([]);
});

test.describe('document editing', () => {
	// Startup animation, CSP, and offline behavior retain ordinary preferences in
	// their integration cases. These assertions cover the ready document's actions.
	test.use({ reducedMotion: 'reduce' });

	test('paste → lint → safe fix updates the canonical editor text', async ({ page }) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Chorus: Blair]\nImma stay');

		const diagnostic = page.getByRole('button', {
			name: /^Go to Use “I'ma” instead of “Imma”/u
		});
		await expect(diagnostic).toBeVisible();
		await page.getByRole('button', { name: "Replace with I'ma" }).click();

		await expectDocText(page, "[Chorus: Blair]\nI'ma stay");
		await expect(diagnostic).toHaveCount(0);
	});

	test('meaning-sensitive spelling uses plain copy and offers a preview action', async ({
		page
	}) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Chorus: Blair]\nCuz I stay');

		const diagnostic = page.getByRole('button', {
			name: /^Go to If “Cuz” means “because,” use “'Cause”/u
		});
		await expect(diagnostic).toBeVisible();
		await expect(
			page.getByText('“Cuz” can also mean “cousin,” so check the lyric before replacing it.')
		).toBeVisible();
		await page.getByRole('button', { name: "Replace with 'Cause" }).click();

		await expectDocText(page, "[Chorus: Blair]\n'Cause I stay");
		await expect(diagnostic).toHaveCount(0);
	});

	test('language selector re-lints the current text without another editor change', async ({
		page
	}) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Verse]\nA lyric');

		const languageConflict = page.getByRole('button', {
			name: /^Go to “Verse” conflicts with the reviewed Norwegian header pack/u
		});
		await expect(languageConflict).toHaveCount(0);

		await page.getByRole('button', { name: 'Lyric language: English' }).click();
		const languageDialog = page.getByRole('dialog', { name: 'Lyric language' });
		await languageDialog.getByPlaceholder('Search languages').fill('Norwegian');
		await languageDialog.getByRole('button', { name: 'Norwegian' }).click();
		await expect(languageConflict).toBeVisible();
		await expect(page.getByRole('button', { name: 'Replace with Vers' })).toBeVisible();

		await page.getByRole('button', { name: 'Lyric language: Norwegian' }).click();
		await languageDialog.getByRole('button', { name: 'English', exact: true }).click();
		await expect(languageConflict).toHaveCount(0);
	});

	test('new drafts use the last selected language', async ({ page }) => {
		await openWorkspace(page);
		await page.getByRole('button', { name: /^Lyric language:/u }).click();
		const languageDialog = page.getByRole('dialog', { name: 'Lyric language' });
		await languageDialog.getByPlaceholder('Search languages').fill('French');
		await languageDialog.getByRole('button', { name: 'French' }).click();

		await page.getByRole('button', { name: "'Scribes", exact: true }).click();
		await page.getByRole('button', { name: "New 'scribe" }).click();

		await expect(page.getByRole('button', { name: 'Lyric language: French' })).toBeVisible();
		await expectDocText(page, '');
	});

	test('performer assignment is applied and undone as one atomic edit', async ({ page }) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Verse]\nHello world');

		await page.getByRole('tab', { name: 'Performers' }).click();
		await page.getByRole('textbox', { name: 'Add performer' }).fill('Blair');
		await page.getByRole('button', { name: 'Add', exact: true }).click();

		const textbox = editor(page);
		await textbox.click();
		await textbox.press('End');
		await textbox.press('Home');
		await textbox.press('Shift+End');
		await textbox.press('Alt+p');

		// A dialog, not a toolbar: the surface contains Tab (dialog-conventional),
		// where a toolbar promises that Tab exits.
		const picker = page.getByRole('dialog', { name: 'Assign performers' });
		await expect(picker).toBeVisible();
		await picker.getByRole('button', { name: 'Blair' }).click();
		await picker.getByRole('button', { name: 'Apply' }).click();
		await expectDocText(page, '[Verse: Blair]\nHello world');

		await textbox.press(`${mod}+z`);
		await expectDocText(page, '[Verse]\nHello world');
	});

	test('Copy lyrics writes byte-exact canonical text', async ({ page }) => {
		await openWorkspace(page);
		const canonical = '[Chorus: Blair & <i>Avery</i>]\nLead\n<i>Harmony</i>';
		await replaceDocument(page, canonical);

		await page.getByRole('button', { name: 'Copy lyrics' }).click();
		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toBe(canonical);
	});

	test('reload recovers exact text and selection, including the visibility flush path', async ({
		page
	}) => {
		await openWorkspace(page);
		const text = '[Verse]\nSilver moonlight';
		await replaceDocument(page, text);

		const textbox = editor(page);
		await textbox.press('End');
		for (let index = 0; index < 'moonlight'.length; index += 1) {
			await textbox.press('Shift+ArrowLeft');
		}
		await waitForSaved(page);
		await page.reload();
		await expectDocText(page, text);
		await editor(page).press(`${mod}+c`);
		expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('moonlight');

		const flushText = '[Verse]\nSaved by visibility flush';
		await replaceDocument(page, flushText);
		await page.evaluate(() => {
			Object.defineProperty(document, 'visibilityState', {
				configurable: true,
				get: () => 'hidden'
			});
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await page.reload();
		await expectDocText(page, flushText);
	});

	test('ignored diagnostics survive a reload and can be restored', async ({ page }) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Verse]\nImma go');
		const diagnostic = page.getByRole('button', {
			name: /^Go to Use “I'ma” instead of “Imma”/u
		});
		await expect(diagnostic).toBeVisible();

		// The expanded card's ignore control is labelled just “Ignore”; `exact`
		// keeps it apart from the “… ignored / Restore” toggle below the list.
		await page.getByRole('button', { name: 'Ignore', exact: true }).click();
		await expect(diagnostic).toHaveCount(0);
		// Persist the draft before reloading: this spec verifies the durable
		// ignores, not the unload flush path, so the document must survive.
		await waitForSaved(page);
		await page.reload();
		await expectDocText(page, '[Verse]\nImma go');
		await expect(diagnostic).toHaveCount(0);

		await page.getByRole('button', { name: /ignored/u }).click();
		await page.getByRole('button', { name: 'Restore', exact: true }).click();
		await expect(diagnostic).toBeVisible();
	});

	test('an edit after switching between two drafts remains revision-scoped and durable', async ({
		page
	}) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Verse]\nFirst draft');
		await page.getByRole('textbox', { name: "'Scribe title" }).fill('First');
		await page.getByRole('textbox', { name: "'Scribe title" }).press('Enter');
		await editor(page).click();
		await waitForSaved(page);

		await page.getByRole('button', { name: "'Scribes", exact: true }).click();
		await page.getByRole('button', { name: "New 'scribe" }).click();
		await replaceDocument(page, '[Verse]\nSecond draft');
		await page.getByRole('textbox', { name: "'Scribe title" }).fill('Second');
		await page.getByRole('textbox', { name: "'Scribe title" }).press('Enter');
		await editor(page).click();
		await waitForSaved(page);

		// The row's own control leads with the draft's name; the commands beside it
		// carry that name too ("Rename First"), so anchor on the start of the label.
		await page.getByRole('button', { name: "'Scribes", exact: true }).click();
		await page.getByRole('button', { name: /^First/u }).click();
		await expectDocText(page, '[Verse]\nFirst draft');
		await page.getByRole('button', { name: "'Scribes", exact: true }).click();
		await page.getByRole('button', { name: /^Second/u }).click();
		await expectDocText(page, '[Verse]\nSecond draft');

		const durableEdit = '[Verse]\nEdited after switching twice';
		await replaceDocument(page, durableEdit);
		await waitForSaved(page);
		await page.reload();
		await expectDocText(page, durableEdit);
	});

	/**
	 * A `.sr-only` live region inside an expanded diagnostic card once scrolled the
	 * whole app shell away — toolbar and status bar off screen, with no scrollbar
	 * and no wheel gesture to bring them back. Two independent causes, both pinned
	 * here against a probe shaped like that live region rather than against whichever
	 * component currently ships one: an absolutely positioned box escaped the panel's
	 * scroll clipping and reported its offset down the list as shell-level scrollable
	 * overflow, and the shell hid that overflow instead of clipping it, so a stray
	 * `scrollIntoView` or focus call could move it.
	 */
	test('nothing in the panel can scroll the app shell', async ({ page }) => {
		await openWorkspace(page);
		await replaceDocument(page, '[Verse]\nImma stay');
		const toolbar = page.getByRole('button', { name: 'Copy lyrics' });
		await expect(toolbar).toBeInViewport();

		const metrics = await page.locator('.right-panel__body').evaluate((panel) => {
			const shellElement = document.querySelector('main.workspace') as HTMLElement;
			const probe = document.createElement('p');
			probe.className = 'sr-only';
			probe.textContent = 'probe';
			const spacer = document.createElement('div');
			spacer.style.height = '3000px';
			panel.append(spacer, probe);
			shellElement.scrollTop = 500;
			return {
				probeTop: probe.getBoundingClientRect().top,
				shellBottom: shellElement.getBoundingClientRect().bottom,
				scrollHeight: shellElement.scrollHeight,
				clientHeight: shellElement.clientHeight,
				scrollTop: shellElement.scrollTop
			};
		});

		// The probe resolves against the panel it lives in, so it stays inside the shell.
		expect(metrics.probeTop).toBeLessThanOrEqual(metrics.shellBottom);
		expect(metrics.scrollHeight).toBe(metrics.clientHeight);
		// And the shell has no scroll port at all, so even a direct write is refused.
		expect(metrics.scrollTop).toBe(0);
		await expect(toolbar).toBeInViewport();
	});
});

test.describe('phone reference sections', () => {
	// The same emulation the workbench's phone block uses: `hasTouch` is what
	// makes `(pointer: coarse)` match, and the width is under the 62rem stack.
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the stacked index leads with a finder a finger can focus', async ({ page }) => {
		// The stack leads with the index at the index view — measured the other
		// way round, the whole guide stood above the search field, ten phone
		// viewports of prose between a reader and the section's primary control.
		await page.goto('/guidelines/');
		const search = page.getByRole('searchbox', { name: 'Search the transcription guide' });
		await expect(search).toBeInViewport();

		// And the field computes at least 16px under a coarse pointer, or iOS
		// Safari answers the focus by zooming the page in and never back out.
		// The element-selector raise in `responsive.css` loses to any class that
		// sizes a field, which is exactly how this one shipped at 13px — the
		// class-level restatement is what this pins. Emulation cannot reproduce
		// the zoom itself; the size is the whole mechanism.
		expect(
			Number.parseFloat(await search.evaluate((field) => getComputedStyle(field).fontSize))
		).toBeGreaterThanOrEqual(16);

		// The guide still follows, in order, below the rows.
		const guide = page.getByRole('heading', { name: 'Put what you hear into words.' });
		const guideBox = await guide.boundingBox();
		const finderBox = await search.boundingBox();
		expect(guideBox!.y).toBeGreaterThan(finderBox!.y);
	});

	test('Back restores an expanded check and its phone reading position', async ({ page }) => {
		await page.goto('/guidelines/section-headers/#voice-order');
		const disclosure = page
			.locator('.guidelines__entry:has(#voice-order) .guidelines__checks details')
			.first();
		await disclosure.locator('summary').click();
		const check = disclosure.locator('a');
		await check.scrollIntoViewIfNeeded();
		const before = await page.evaluate(() => window.scrollY);
		await check.click();
		await expect(page).toHaveURL(/\/guidelines\/checks\//u);
		await page.goBack();
		await expect(disclosure).toHaveAttribute('open');
		await expect
			.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before))
			.toBeLessThan(2);
	});

	test('the arrival wash stands down where the index is not beside the page', async ({ page }) => {
		// The wash exists to tie the washed entry to the marked row in the index
		// column — one selection, said by both columns at once. Stacked, the
		// list is `display: none` under an open page, so there is no row on
		// screen to agree with, and the paint stands down; the mark itself
		// stays, because the index reads the same state when the reader goes
		// back.
		await page.goto('/guidelines/punctuation/#doubled-exclamation');
		const washed = page.locator('.guidelines__entry[data-current]');
		await expect(washed).toHaveCount(1);
		expect(await washed.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
	});

	test('deep in a topic the way back stays pinned, and a jump clears it', async ({ page }) => {
		// The masthead is static at this width and the index is `display: none`
		// under an open page, so the pinned back bar is the one piece of
		// navigation a reader eight viewports into a topic still has.
		await page.goto('/guidelines/section-headers/');
		await page.mouse.wheel(0, 6000);
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(3000);
		const back = page.getByRole('button', { name: 'Back to guide' });
		await expect(back).toBeInViewport();

		// A deep-linked heading lands clear of the pinned bar: the headings'
		// `scroll-margin-top` moves with the same seam the bar's top edge does.
		await page.goto('/guidelines/section-headers/#voice-order');
		const heading = page.locator('#voice-order');
		await expect(heading).toBeVisible();
		const headingBox = await heading.boundingBox();
		const barBox = await page.locator('.site-split__backbar').boundingBox();
		expect(headingBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1);
	});
});

test.describe('phone', () => {
	// A phone is a coarse pointer *and* a small viewport, so the emulation has to
	// set both: `hasTouch` is what makes `(pointer: coarse)` match. Upright, the
	// workbench is served like anywhere else — stacked by the 68rem breakpoint,
	// not gated away.
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('supports both orientations without a desktop recommendation', async ({ page }) => {
		await page.goto('/workbench/');
		await expect(page.locator('main.workspace')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Workbench views' })).toBeVisible();
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(page.locator('main.workspace')).toBeVisible();
		await expect(editor(page)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'LyricLint needs the tall side' })).toHaveCount(
			0
		);
		await expect(page.locator('.toast-region')).not.toContainText('quicker on a laptop');
	});
});

test('a short desktop window keeps the workbench', async ({ page }) => {
	// The same height as the landscape phone above, with a fine pointer: a short
	// window on a laptop is a supported size, and telling someone with a mouse to
	// rotate their screen is the failure the pointer half of the query prevents.
	await page.setViewportSize({ width: 844, height: 390 });
	await openWorkspace(page);
	await expect(page.getByRole('heading', { name: 'LyricLint needs the tall side' })).toBeHidden();
});

test('offline reopen from cache via the service worker', async ({ page, context }) => {
	await openWorkspace(page);
	const text = '[Verse]\nOffline again';
	await replaceDocument(page, text);
	await waitForSaved(page);

	// Wait until the service worker is active and controlling the page (it
	// calls clients.claim on activate) so the offline reload can be served
	// from the precache.
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	await context.setOffline(true);
	await page.reload();
	await expect(editor(page)).toBeVisible();
	await expectDocText(page, text);
	await context.setOffline(false);
});

/**
 * The offline snapshot is the app, not the site: `/` and `/workbench/` are precached
 * and the 60 rule reference pages — most of the deploy by bytes, re-fetched
 * per visitor per deploy when they were precached — are not. A rules page joins
 * the snapshot by being read, which is the navigation strategy writing what it
 * serves. Both halves are pinned: re-adding the reference to the precache is
 * the specific cost regression, and losing the runtime write would quietly
 * shrink the offline promise to the two precached pages.
 */
test('the offline snapshot precaches the app and admits the guide when read', async ({
	page,
	context
}) => {
	await openWorkspace(page);
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	const cachedPages = () =>
		page.evaluate(async () => {
			const paths: string[] = [];
			for (const name of await caches.keys()) {
				const cache = await caches.open(name);
				paths.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
			}
			return paths.filter((path) => !path.startsWith('/_app/'));
		});

	await expect.poll(cachedPages).toContain('/workbench/');
	expect(await cachedPages()).not.toContain('/workbench.png');
	expect(await cachedPages()).not.toContainEqual(expect.stringMatching(/\.webm$/u));
	expect(await cachedPages()).toContain('/workbench-640.webp');
	expect(await cachedPages()).not.toContainEqual(expect.stringMatching(/^\/guidelines\//u));
	expect(await cachedPages()).not.toContain('/assistant-release.json');

	// Even navigating to the release manifest must leave it out of the snapshot:
	// CI and future release checks need the origin's current identity.
	await page.goto('/assistant-release.json');
	expect(await cachedPages()).not.toContain('/assistant-release.json');

	await page.goto('/guidelines/');
	await expect.poll(cachedPages).toContain('/guidelines/');

	await context.setOffline(true);
	expect(
		await page.evaluate(async () => {
			try {
				await fetch('/assistant-release.json', { cache: 'no-store' });
				return true;
			} catch {
				return false;
			}
		})
	).toBe(false);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Put what you hear into words.' })).toBeVisible();
	await page.goto('/');
	for (const poster of await page.locator('.lp-shot__poster').all()) {
		await poster.scrollIntoViewIfNeeded();
		await expect
			.poll(() =>
				poster.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)
			)
			.toBe(true);
		await expect(poster).toHaveCSS('opacity', '1');
	}
	await context.setOffline(false);
});

/**
 * The error page's way out has to be a new document.
 *
 * This screen is on the reader precisely because the client runtime failed, and
 * the failure is usually a rejected dynamic import — which the browser caches
 * against that module's URL, so a client-side navigation re-imports it and fails
 * instantly, forever. The button then does nothing on the one screen whose whole
 * job is offering a way out.
 *
 * Asserted as behaviour rather than as `data-sveltekit-reload`, because what has
 * to hold is that the document is replaced; the attribute is only how.
 */
test('the error page leaves by loading a new document, not by routing', async ({ page }) => {
	await page.goto('/this-route-does-not-exist/');
	await expect(
		page.getByRole('heading', { name: 'LyricLint could not open this page' })
	).toBeVisible();

	// Survives a client-side navigation; destroyed by a document load.
	await page.evaluate(() => {
		(window as ProbeWindow).__errorPageDocument = 'same document';
	});

	await page.getByRole('link', { name: 'Return to the workspace' }).click();
	await expect(editor(page)).toBeVisible();
	expect(await page.evaluate(() => (window as ProbeWindow).__errorPageDocument)).toBeUndefined();
});

/**
 * The site keeps the assistant as an answers-only dialog; the workbench puts
 * that same persisted conversation in its Assistant panel tab. No assistant
 * backend runs under this suite, so the request is blocked explicitly and the
 * failed turn gives both surfaces a transcript and a retry to render.
 */
test('the rules dialog and workbench tab share one persisted conversation', async ({ page }) => {
	await page.route('**/v1/answers', (route) => route.abort());
	await page.goto('/guidelines/');
	await page.getByRole('button', { name: 'Ask a question', exact: true }).click();
	const question = page.getByRole('dialog', { name: 'Ask LyricLint' }).getByLabel('Your question');
	await question.fill('When does a chorus need its own header?');
	await question.press('Enter');

	// One truthful name from both sections and the workbench: the same modal
	// opens from `/guidelines/` too, where `Ask the rules` was false on arrival.
	const dialog = page.getByRole('dialog', { name: 'Ask LyricLint' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Conversation', { exact: true })).toContainText(
		'When does a chorus need its own header?'
	);
	await expect(dialog.getByLabel('Your question')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Retry' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Allow' })).toHaveCount(0);

	// The same conversation survives a real navigation, but its workbench home
	// is the Assistant tab in the document dock.
	await openWorkspace(page);
	const tabs = page.getByRole('tablist', { name: 'Document panels' }).getByRole('tab');
	await expect(tabs).toHaveText([
		'Review',
		'Linking',
		'Assistant',
		'Performers',
		'Song',
		'Preferences'
	]);
	await page.getByRole('tab', { name: 'Assistant', exact: true }).click();

	const assistantPanel = page.getByRole('tabpanel', { name: 'Assistant' });
	await expect(assistantPanel.getByLabel('Conversation', { exact: true })).toContainText(
		'When does a chorus need its own header?'
	);
	await expect(assistantPanel.getByLabel('Your question')).toBeVisible();
	await expect(assistantPanel.getByRole('button', { name: 'Retry' })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

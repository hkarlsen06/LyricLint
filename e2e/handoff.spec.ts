import { readFileSync } from 'node:fs';
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { encodeHandoff } from '../src/lib/core/handoff.js';

const cityLights: string = JSON.parse(
	readFileSync('scripts/fixtures/city-lights.json', 'utf8')
).lyrics;
const geniusUrl = 'https://genius.com/Example-city-lights-lyrics';
const standIn = readFileSync('e2e/fixtures/lyric-editor-stand-in.html', 'utf8');
const standInTitle = 'Example – City Lights Lyrics | Genius Lyrics';
const geniusEditUrl = `${geniusUrl}/edit`;
const opened = "Opened the linked lyrics as a new 'scribe.";
const refused = "This link's lyrics could not be read, so no 'scribe was created.";

function editor(page: Page): Locator {
	return page.getByRole('textbox', { name: 'Lyrics editor' });
}

/** The CodeMirror document itself: the DOM flattens line breaks and draws badges. */
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
		const handle = content?.cmView ?? content?.cmTile;
		return handle ? handle.view.state.doc.toString() : null;
	});
}

function toasts(page: Page): Locator {
	return page.getByRole('region', { name: 'Notifications' });
}

async function cityLightsLink(): Promise<string> {
	return `/workbench/${await encodeHandoff({ text: cityLights, title: 'City Lights', geniusUrl })}`;
}

async function savedDraftTitles(page: Page): Promise<string[]> {
	await page.getByRole('button', { name: "'Scribes", exact: true }).click();
	const rows = page.locator('.draft-list > li .list-row__action');
	await expect(rows.first()).toBeVisible();
	const titles = await rows.locator('.list-row__name').allTextContents();
	await page.keyboard.press('Escape');
	return titles.map((title) => title.trim());
}

async function writeFirstDraft(page: Page, text: string): Promise<void> {
	await page.goto('/workbench/');
	const textbox = editor(page);
	await textbox.click();
	await textbox.fill(text);
	await page.getByRole('textbox', { name: "'Scribe title" }).fill('First');
	await page.getByRole('textbox', { name: "'Scribe title" }).press('Enter');
	await expect(page.getByLabel('Autosave status')).toHaveAttribute('aria-label', /Saved locally/u);
}

test('a hand-over link opens its lyric as a new draft and leaves the address bar clean', async ({
	page
}) => {
	await page.goto(await cityLightsLink());

	// The confirmation waits for the workspace, so it is checked first and the
	// editor is already there when it shows.
	await expect(toasts(page).getByText(opened)).toBeVisible();
	await expect(editor(page)).toBeVisible();
	await expect(page.getByTestId('live-region')).toHaveText(opened);
	await expect.poll(() => docText(page)).toBe(cityLights);
	await expect(page.getByRole('textbox', { name: "'Scribe title" })).toHaveValue('City Lights');
	expect(new URL(page.url()).hash).toBe('');
	expect(new URL(page.url()).pathname).toBe('/workbench/');

	await page.getByRole('tab', { name: 'Song' }).click();
	await expect(page.getByRole('link', { name: 'Open Genius page' })).toHaveAttribute(
		'href',
		geniusUrl
	);
});

test('the open draft stays as it was, whether the link loads the page or only its fragment', async ({
	page
}) => {
	const first = '[Verse]\nOne\nTwo';
	await writeFirstDraft(page, first);

	// Already on the workbench, so only the fragment changes.
	await page.goto(await cityLightsLink());
	await expect.poll(() => docText(page)).toBe(cityLights);
	expect(new URL(page.url()).hash).toBe('');
	expect((await savedDraftTitles(page)).sort()).toEqual(['City Lights', 'First']);

	await page.getByRole('button', { name: "'Scribes", exact: true }).click();
	await page.getByRole('button', { name: /^First/u }).click();
	await expect.poll(() => docText(page)).toBe(first);
});

test('a reload after a hand-over opens nothing twice', async ({ page }) => {
	await page.goto(await cityLightsLink());
	await expect.poll(() => docText(page)).toBe(cityLights);

	await page.reload();
	await expect.poll(() => docText(page)).toBe(cityLights);
	await page.reload();
	await expect.poll(() => docText(page)).toBe(cityLights);

	expect(await savedDraftTitles(page)).toEqual(['City Lights']);
});

test('a damaged link is refused and creates no draft', async ({ page }) => {
	const first = '[Verse]\nKeep me';
	await writeFirstDraft(page, first);
	const link = await cityLightsLink();
	const middle = Math.floor(link.length / 2);
	const damaged = link.slice(0, middle) + link.slice(middle + 10);

	await page.goto('about:blank');
	await page.goto(damaged);

	await expect(toasts(page).getByText(refused)).toBeVisible();
	await expect(page.getByTestId('live-region')).toHaveText(refused);
	await expect.poll(() => docText(page)).toBe(first);
	expect(new URL(page.url()).hash).toBe('');
	expect(await savedDraftTitles(page)).toEqual(['First']);
});

for (const entry of ['a fresh boot', 'a fragment-only navigation']) {
	test(`after ${entry}, the router never holds the payload, so Back opens nothing twice`, async ({
		page
	}) => {
		const link = await cityLightsLink();
		const payload = link.slice(link.indexOf('.') + 1);
		if (entry === 'a fragment-only navigation') await writeFirstDraft(page, '[Verse]\nFirst');
		const before = entry === 'a fresh boot' ? [] : ['First'];

		await page.goto(link);
		await expect.poll(() => docText(page)).toBe(cityLights);
		// A tab switch is a shallow navigation, which writes `page.url` into
		// `history.state`.
		await page.getByRole('tab', { name: 'Song' }).click();
		await expect(page).toHaveURL(/[?&]panel=song/u);
		const state = await page.evaluate(() => JSON.stringify(history.state));
		expect(state).toContain('pageUrl');
		expect(state).not.toContain(payload);
		expect(state).not.toContain('#open=');

		await page.evaluate(() => {
			const away = document.createElement('a');
			away.href = '/docs/';
			document.body.append(away);
			away.click();
		});
		await expect(page).toHaveURL(/\/docs\/$/u);
		await page.goBack();
		await expect.poll(() => docText(page)).toBe(cityLights);
		expect(page.url()).not.toContain('#open=');
		expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(payload);

		expect((await savedDraftTitles(page)).sort()).toEqual([...before, 'City Lights'].sort());
	});
}

for (const kind of ['an HTML', 'an SVG'] as const) {
	test(`a hand-over link clicked inside the app as ${kind} anchor never reaches the router`, async ({
		page
	}) => {
		const link = await cityLightsLink();
		const payload = link.slice(link.indexOf('.') + 1);
		await writeFirstDraft(page, '[Verse]\nFirst');

		await page.evaluate(
			({ href, svg }) => {
				if (!svg) {
					const inside = document.createElement('a');
					inside.href = href;
					document.body.append(inside);
					inside.click();
					return;
				}
				const namespace = 'http://www.w3.org/2000/svg';
				const drawing = document.createElementNS(namespace, 'svg');
				const inside = document.createElementNS(namespace, 'a');
				inside.setAttribute('href', href);
				drawing.append(inside);
				document.body.append(drawing);
				inside.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
			},
			{ href: link, svg: kind === 'an SVG' }
		);
		await expect.poll(() => docText(page)).toBe(cityLights);
		expect(page.url()).not.toContain('#open=');

		await page.getByRole('tab', { name: 'Song' }).click();
		await expect(page).toHaveURL(/[?&]panel=song/u);
		const state = await page.evaluate(() => JSON.stringify(history.state));
		expect(state).toContain('pageUrl');
		expect(state).not.toContain(payload);
		expect(page.url()).not.toContain('#open=');
		expect((await savedDraftTitles(page)).sort()).toEqual(['City Lights', 'First']);
	});
}

test('a hand-over link around an SVG anchor with no href is taken at the outer link', async ({
	page
}) => {
	const link = await cityLightsLink();
	const payload = link.slice(link.indexOf('.') + 1);
	await writeFirstDraft(page, '[Verse]\nFirst');

	await page.evaluate((href) => {
		const outer = document.createElement('a');
		outer.href = href;
		outer.innerHTML =
			'<svg width="40" height="40"><a><rect width="40" height="40" fill="currentColor"></rect></a></svg>';
		document.body.append(outer);
		outer
			.querySelector('rect')!
			.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
	}, link);
	await expect.poll(() => docText(page)).toBe(cityLights);

	await page.getByRole('tab', { name: 'Song' }).click();
	await expect(page).toHaveURL(/[?&]panel=song/u);
	expect(page.url()).not.toContain('#open=');
	expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(payload);
});

test('an SVG hand-over link with only xlink:href is taken at the click', async ({ page }) => {
	const link = await cityLightsLink();
	await writeFirstDraft(page, '[Verse]\nFirst');
	const before = await page.evaluate(() => history.length);

	await page.evaluate((href) => {
		const namespace = 'http://www.w3.org/2000/svg';
		const drawing = document.createElementNS(namespace, 'svg');
		const inside = document.createElementNS(namespace, 'a');
		inside.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', href);
		const shape = document.createElementNS(namespace, 'rect');
		shape.setAttribute('width', '40');
		shape.setAttribute('height', '40');
		inside.append(shape);
		drawing.append(inside);
		document.body.append(drawing);
		shape.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
	}, link);
	await expect.poll(() => docText(page)).toBe(cityLights);

	expect(await page.evaluate(() => history.length)).toBe(before);
	expect(page.url()).not.toContain('#open=');
});

test('a hand-over link clicked on another page loads the workbench in full', async ({ page }) => {
	const link = await cityLightsLink();
	const payload = link.slice(link.indexOf('.') + 1);
	await page.goto('/docs/');
	await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

	await page.evaluate((href) => {
		const outside = document.createElement('a');
		outside.href = href;
		document.body.append(outside);
		outside.click();
	}, link);
	// The click starts a full load, which ends any evaluation still running.
	await page.waitForURL(/\/workbench\/$/u);
	await expect.poll(() => docText(page)).toBe(cityLights);
	expect(page.url()).not.toContain('#open=');

	await page.getByRole('tab', { name: 'Song' }).click();
	await expect(page).toHaveURL(/[?&]panel=song/u);
	expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain(payload);
});

test('a script the edge injects never sees the fragment', async ({ page }) => {
	// Cloudflare adds its analytics beacon as a deferred script at the end of the
	// body. On a slow phone it runs before any of the application's modules,
	// which the delay on SvelteKit's entry chunks stands in for.
	await page.route('**/_app/immutable/entry/**', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 500));
		await route.continue();
	});
	await page.route('**/workbench/', async (route) => {
		const response = await route.fetch();
		const body = (await response.text()).replace(
			'</body>',
			'<script defer src="https://static.cloudflareinsights.com/beacon.min.js"></script></body>'
		);
		await route.fulfill({ response, body });
	});
	await page.route('https://static.cloudflareinsights.com/beacon.min.js', (route) =>
		route.fulfill({
			contentType: 'application/javascript',
			body: 'window.__beaconSaw = location.href;'
		})
	);

	await page.goto(await cityLightsLink());

	await expect.poll(() => docText(page)).toBe(cityLights);
	const saw = await page.evaluate(() => (window as { __beaconSaw?: string }).__beaconSaw);
	expect(saw).toMatch(/\/workbench\/$/u);
});

/**
 * The script of the bookmarklet the docs page draws, pointed at this server
 * instead of production.
 */
async function docsBookmarklet(page: Page, baseURL: string): Promise<string> {
	await page.goto('/docs/copy-paste/');
	const href = await page.getByRole('link', { name: 'Open in LyricLint' }).getAttribute('href');
	expect(href).toMatch(/^javascript:/u);
	const script = decodeURIComponent(href!.slice('javascript:'.length));
	const production = JSON.stringify('https://lyriclint.com/workbench/');
	expect(script).toContain(production);
	return script.replace(production, JSON.stringify(new URL('/workbench/', baseURL).href));
}

/** The stand-in Genius editing page, served without touching the network. */
async function openStandIn(page: Page): Promise<void> {
	await page.route(geniusEditUrl, (route) =>
		route.fulfill({ contentType: 'text/html', body: standIn })
	);
	await page.goto(geniusEditUrl);
}

/** Run the bookmarklet the way a browser runs a `javascript:` link, and take the tab it opens. */
async function pressBookmarklet(
	context: BrowserContext,
	page: Page,
	script: string
): Promise<Page> {
	const opened = context.waitForEvent('page');
	await page.addScriptTag({ content: script });
	const tab = await opened;
	await tab.waitForLoadState();
	return tab;
}

test('the docs bookmarklet opens the focused Genius lyric as a new draft and sends it nowhere', async ({
	page,
	context,
	baseURL
}) => {
	const script = await docsBookmarklet(page, baseURL!);
	await openStandIn(page);
	await page.getByRole('textbox', { name: 'Lyrics', exact: true }).fill(cityLights);
	const requests: string[] = [];
	context.on('request', (request) => requests.push(`${request.url()} ${request.postData() ?? ''}`));

	const tab = await pressBookmarklet(context, page, script);

	await expect.poll(() => docText(tab)).toBe(cityLights);
	await expect(tab.getByRole('textbox', { name: "'Scribe title" })).toHaveValue(standInTitle);
	await tab.getByRole('tab', { name: 'Song' }).click();
	await expect(tab.getByRole('link', { name: 'Open Genius page' })).toHaveAttribute(
		'href',
		geniusEditUrl
	);
	const lines = cityLights.split('\n').filter((line) => line.trim().length > 3);
	const leaks = requests.filter(
		(request) => request.includes('open=1.') || lines.some((line) => request.includes(line))
	);
	expect(leaks).toEqual([]);
});

test('the docs bookmarklet takes an editable box line by line, without its markup', async ({
	page,
	context,
	baseURL
}) => {
	const script = await docsBookmarklet(page, baseURL!);
	await openStandIn(page);
	await page.getByRole('textbox', { name: 'Rich lyrics' }).focus();

	const tab = await pressBookmarklet(context, page, script);

	await expect.poll(() => docText(tab)).toBe('[Chorus]\nCity lights are calling\nOh, oh');
});

test('the docs bookmarklet asks for the lyrics box and opens nothing when there is no lyric', async ({
	page,
	context,
	baseURL
}) => {
	const script = await docsBookmarklet(page, baseURL!);
	await openStandIn(page);
	const dialog = page.waitForEvent('dialog');
	const tabs: Page[] = [];
	context.on('page', (tab) => tabs.push(tab));

	// The message holds the script until it is answered.
	const pressed = page.addScriptTag({ content: script });

	const message = await dialog;
	expect(message.message()).toBe(
		'Click into the lyrics box first, then press Open in LyricLint again.'
	);
	await message.accept();
	await pressed;
	await expect(page.getByRole('heading', { name: 'Stand-in lyric editor' })).toBeVisible();
	expect(tabs).toEqual([]);
});

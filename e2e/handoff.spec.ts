import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { encodeHandoff } from '../src/lib/core/handoff.js';

const cityLights: string = JSON.parse(
	readFileSync('scripts/fixtures/city-lights.json', 'utf8')
).lyrics;
const geniusUrl = 'https://genius.com/Example-city-lights-lyrics';
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

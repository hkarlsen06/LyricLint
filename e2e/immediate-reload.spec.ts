import { exportOutput } from './format-fixture.js';
import { expect, test, type Page } from '@playwright/test';

async function text(page: Page): Promise<string> {
	return page.getByRole('textbox', { name: 'Lyrics editor' }).evaluate((element) => {
		const node = element as HTMLElement & {
			cmView?: { view: import('@codemirror/view').EditorView };
			cmTile?: { view: import('@codemirror/view').EditorView };
		};
		return (node.cmView ?? node.cmTile)!.view.state.doc.toString();
	});
}

// A cancelled beforeunload is not a reload, even if the old editor still has the words.
async function freshReload(page: Page) {
	const oldDocument = await page.evaluate(() => {
		const token = crypto.randomUUID();
		document.documentElement.dataset.reloadToken = token;
		return token;
	});
	const response = await page.reload();
	expect(response?.ok()).toBe(true);
	await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	expect(await page.locator('html').getAttribute('data-reload-token')).not.toBe(oldDocument);
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('native immediate reload preserves the pending words and selected lyric format', async ({
	page
}) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await editor.fill('[Verse]\nSilver moon');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.insertText(' tonight');
	const before = await text(page);
	expect(before).toContain('Silver moon tonight');
	await freshReload(page);
	expect(await text(page)).toBe(before);
	await exportOutput(page, 'Musixmatch', 'Silver moon tonight');
	await freshReload(page);
	expect(await text(page)).toBe(before);
	await exportOutput(page, 'Musixmatch', 'Silver moon tonight');
});

test('a failed local transaction retains the latest edit for a fresh reload', async ({ page }) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await editor.fill('[Verse]\nSilver moon');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args) {
			if (this.name === 'draftsV7')
				throw new DOMException('Injected disk refusal', 'QuotaExceededError');
			return put.apply(this, args);
		};
	});
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.insertText(' tonight');
	await expect(page.getByRole('img', { name: /^Autosave status: Save failed/u })).toBeAttached();
	await freshReload(page);
	expect(await text(page)).toBe('[Verse]\nSilver moon tonight');
});

test('client navigation retains pending words before the page is reloaded elsewhere', async ({
	page
}) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await editor.fill('[Verse]\nSilver moon');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await page.evaluate(() => {
		document.documentElement.dataset.clientRouteToken = 'same-document';
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args) {
			if (this.name === 'draftsV7')
				throw new DOMException('Injected disk refusal', 'QuotaExceededError');
			return put.apply(this, args);
		};
	});
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.insertText(' tonight');
	await expect(page.getByRole('img', { name: /^Autosave status: Save failed/u })).toBeAttached();
	await page
		.getByRole('navigation', { name: 'Workbench views' })
		.getByRole('button', { name: 'Tools', exact: true })
		.click();
	await page.getByRole('tab', { name: 'Preferences', exact: true }).click();
	await page.getByRole('link', { name: 'About LyricLint', exact: true }).click();
	await expect.poll(() => new URL(page.url()).pathname).toBe('/');
	expect(await page.locator('html').getAttribute('data-client-route-token')).toBe('same-document');
	expect(await page.evaluate(() => sessionStorage.getItem('lyriclint:departure:v2'))).toContain(
		'Silver moon tonight'
	);
	await page.reload();
	await page.goto('/workbench/');
	await expect(editor).toBeVisible();
	expect(await text(page)).toBe('[Verse]\nSilver moon tonight');
});

test('failed departure recovery keeps the workbench accessible when an in-app exit is requested', async ({
	page
}) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await editor.fill('[Verse]\nSilver moon');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await page.evaluate(() => {
		const put = IDBObjectStore.prototype.put;
		IDBObjectStore.prototype.put = function (...args) {
			if (this.name === 'draftsV7')
				throw new DOMException('Injected disk refusal', 'QuotaExceededError');
			return put.apply(this, args);
		};
		const setItem = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			if (key === 'lyriclint:departure:v2')
				throw new DOMException('Injected checkpoint refusal', 'QuotaExceededError');
			setItem.call(this, key, value);
		};
	});
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.insertText(' tonight');
	await expect(page.getByRole('img', { name: /^Autosave status: Save failed/u })).toBeAttached();
	await page
		.getByRole('navigation', { name: 'Workbench views' })
		.getByRole('button', { name: 'Tools', exact: true })
		.click();
	await page.getByRole('tab', { name: 'Preferences', exact: true }).click();
	await page.getByRole('link', { name: 'About LyricLint', exact: true }).click();
	await expect(page).toHaveURL(/\/workbench\//u);
	await expect(
		page
			.getByRole('group', { name: 'Notification' })
			.filter({ hasText: 'Your latest edits could not be kept for reload' })
	).toBeVisible();
	await page
		.getByRole('navigation', { name: 'Workbench views' })
		.getByRole('button', { name: 'Write', exact: true })
		.click();
	await expect(editor).toBeVisible();
	expect(await text(page)).toBe('[Verse]\nSilver moon tonight');
});

test('each draft restores its own format and lyrics after immediate reload', async ({ page }) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	const title = page.getByRole('textbox', { name: "'Scribe title", exact: true });
	await editor.fill('[Verse]\nMoon words');
	await title.fill('Moon draft');
	await title.press('Enter');
	await exportOutput(page, 'Musixmatch', 'Moon words');
	await freshReload(page);
	expect(await text(page)).toBe('[Verse]\nMoon words');
	await page.getByRole('button', { name: 'Document', exact: true }).click();
	await page.getByRole('button', { name: "New 'scribe", exact: true }).click();
	await page.getByRole('button', { name: 'Lyric format: Musixmatch' }).click();
	await editor.fill('Sun words');
	await title.fill('Sun draft');
	await title.press('Enter');
	await freshReload(page);
	expect(await text(page)).toBe('Sun words');
	await page.getByRole('button', { name: "Open saved 'scribes", exact: true }).click();
	await page.getByRole('button', { name: /^Moon draft/u }).click();
	await expect(title).toHaveValue('Moon draft');
	await freshReload(page);
	await expect(page.getByRole('button', { name: 'Copy Genius', exact: true })).toBeVisible();
	expect(await text(page)).toBe('[Verse]\nMoon words');
	await page.getByRole('button', { name: "Open saved 'scribes", exact: true }).click();
	await page.getByRole('button', { name: /^Sun draft/u }).click();
	await expect(title).toHaveValue('Sun draft');
	await freshReload(page);
	await expect(page.getByRole('button', { name: 'Copy Musixmatch', exact: true })).toBeVisible();
	expect(await text(page)).toBe('Sun words');
});

test('malformed recovery is preserved with a visible alert and downloadable original bytes', async ({
	page
}) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await editor.fill('[Verse]\nSaved original');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	const raw = '{unreadable checkpoint';
	await page.addInitScript((value) => {
		if (sessionStorage.getItem('probeInjected')) return;
		sessionStorage.setItem('probeInjected', 'true');
		sessionStorage.setItem('lyriclint:departure:v2', value);
	}, raw);
	await page.reload();
	await expect(page.getByRole('alert')).toContainText('Your pending edits could not be recovered.');
	const download = page.getByRole('link', { name: 'Download recovery file' });
	await expect(download).toBeVisible();
	expect(decodeURIComponent((await download.getAttribute('href'))!.split(',')[1]!)).toBe(raw);
	expect(await page.evaluate(() => sessionStorage.getItem('lyriclint:departure:v2'))).toBe(raw);
	await page.evaluate(() => sessionStorage.removeItem('lyriclint:departure:v2'));
	await freshReload(page);
	expect(await text(page)).toBe('[Verse]\nSaved original');
});

import { expect, test, type Page } from '@playwright/test';
import { docsGroups, docsPages } from '../src/lib/docs/catalog.js';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const [first, second, third] = docsPages;

// The controls these tests press answer only once the page has hydrated.
async function visit(page: Page, path: string) {
	const response = await page.goto(path);
	await page.waitForLoadState('networkidle');
	return response;
}

function sidebar(page: Page) {
	return page.locator('.docs__sidebar').getByRole('navigation', { name: 'Documentation' });
}

test('the docs index lists every page under its group', async ({ page }) => {
	await visit(page, '/docs/');

	await expect(page).toHaveTitle('Docs · LyricLint');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/docs/'
	);
	const nav = page.getByRole('navigation', { name: 'Site' });
	await expect(nav.getByRole('link', { name: 'Docs' })).toHaveAttribute('aria-current', 'page');
	await expect(page.locator('.site-header__section-link')).toHaveText('Docs');

	const main = page.locator('main');
	await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
	await expect(main.getByRole('heading', { level: 2 })).toHaveText([...docsGroups]);
	// One link per card, named by the page title alone.
	for (const doc of docsPages) {
		await expect(main.getByRole('link', { name: doc.title, exact: true })).toHaveAttribute(
			'href',
			`/docs/${doc.slug}/`
		);
	}
	await expect(main.getByRole('link', { name: 'transcription guide' })).toHaveAttribute(
		'href',
		'/guidelines/'
	);
});

test('a docs page marks itself in the sidebar and pages to its neighbors without moving it', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await visit(page, `/docs/${second.slug}/`);

	await expect(page).toHaveTitle(`${second.title} · LyricLint docs`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(second.title);
	const current = sidebar(page).locator('[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toHaveText(second.title);

	// The "On this page" list is the catalog's sections, linked by fragment.
	const toc = page.getByRole('navigation', { name: 'On this page' });
	await expect(toc.getByRole('link')).toHaveText(second.sections.map(({ title }) => title));
	await expect(toc.getByRole('link').first()).toHaveAttribute('href', `#${second.sections[0].id}`);

	const pager = page.getByRole('navigation', { name: 'Previous and next page' });
	await expect(pager.getByRole('link', { name: `Previous ${first.title}` })).toHaveAttribute(
		'href',
		`/docs/${first.slug}/`
	);
	const links = sidebar(page).getByRole('link');
	const before = await links.evaluateAll((elements) =>
		elements.map((element) => element.getBoundingClientRect().toJSON())
	);

	await pager.getByRole('link', { name: `Next ${third.title}` }).click();
	await expect(page).toHaveURL(`/docs/${third.slug}/`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(third.title);
	await expect(sidebar(page).locator('[aria-current="page"]')).toHaveText(third.title);
	// Selection is a fill and a bar, never a change of size.
	expect(
		await links.evaluateAll((elements) =>
			elements.map((element) => element.getBoundingClientRect().toJSON())
		)
	).toEqual(before);
});

test('the first page has no previous link and the last no next', async ({ page }) => {
	await visit(page, `/docs/${first.slug}/`);
	const pager = page.getByRole('navigation', { name: 'Previous and next page' });
	await expect(pager.getByRole('link')).toHaveCount(1);
	await expect(pager.getByRole('link')).toHaveAttribute('rel', 'next');

	await visit(page, `/docs/${docsPages.at(-1)!.slug}/`);
	await expect(pager.getByRole('link')).toHaveCount(1);
	await expect(pager.getByRole('link')).toHaveAttribute('rel', 'prev');
});

test('an unknown docs page is a 404', async ({ page }) => {
	const response = await visit(page, '/docs/not-a-page/');
	expect(response?.status()).toBe(404);
});

test('search opens from the keyboard and follows a section', async ({ page }) => {
	await visit(page, `/docs/${first.slug}/`);
	const target = docsPages.at(-1)!;
	const section = target.sections.at(-1)!;

	await page.keyboard.press(`${mod}+k`);
	const dialog = page.getByRole('dialog', { name: 'Search the docs' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole('combobox')).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();

	await page.keyboard.press('/');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('combobox').fill(section.title);
	await dialog
		.getByRole('option', { name: new RegExp(section.title, 'u') })
		.first()
		.click();
	await expect(page).toHaveURL(`/docs/${target.slug}/#${section.id}`);
	await expect(dialog).toBeHidden();
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

	test('the contents open in a sheet that dismisses three ways', async ({ page }) => {
		await visit(page, `/docs/${second.slug}/`);
		await expect(page.locator('.docs__sidebar')).toBeHidden();

		const trigger = page.getByRole('button', { name: 'Contents' });
		const sheet = page.getByRole('dialog', { name: 'Contents' });
		const nav = sheet.getByRole('navigation', { name: 'Documentation' });

		await trigger.click();
		await expect(sheet).toBeVisible();
		await expect(nav.locator('[aria-current="page"]')).toHaveText(second.title);
		await page.keyboard.press('Escape');
		await expect(sheet).toBeHidden();
		await expect(trigger).toBeFocused();

		await trigger.click();
		await sheet.getByRole('button', { name: 'Close' }).click();
		await expect(sheet).toBeHidden();

		// The sheet is narrower than the phone; the strip of overlay to its right
		// is outside it. A fixed point, because the sheet slides in.
		await trigger.click();
		await expect(sheet).toBeVisible();
		await page.mouse.click(380, 420);
		await expect(sheet).toBeHidden();

		// Choosing a page is where the reader was going; the sheet gets out of the way.
		await trigger.click();
		await nav.getByRole('link', { name: third.title, exact: true }).click();
		await expect(page).toHaveURL(`/docs/${third.slug}/`);
		await expect(sheet).toBeHidden();
	});

	test('the search field is not under 16px', async ({ page }) => {
		await visit(page, `/docs/${first.slug}/`);
		await page.getByRole('button', { name: 'Contents' }).click();
		await page.getByRole('button', { name: 'Search the docs' }).click();
		const field = page.getByRole('dialog', { name: 'Search the docs' }).getByRole('combobox');
		await expect(field).toBeFocused();
		const size = await field.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element).fontSize)
		);
		expect(size).toBeGreaterThanOrEqual(16);
		// Nothing on the page is wider than the phone.
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			390
		);
	});
});

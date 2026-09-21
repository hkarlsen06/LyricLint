import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
	test(`guide reading pane follows ranked search results at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/guidelines/');
		const index = page.locator('.site-split__index');
		const detail = page.locator('.site-split__detail');
		const search = index.getByRole('searchbox');
		const titles = detail.locator(
			'.guidelines__entry h2, .guidelines__landmark h2, .guidelines__check-result h2'
		);
		const results = index.locator('.reference-result .site-run__title');
		await expect(search).toBeInViewport();
		const allTitles = await titles.allTextContents();
		expect(allTitles.length).toBeGreaterThan(6);
		const initialSearchBox = await search.boundingBox();

		await search.fill('headers norwe');
		await expect(results).toHaveCount(6);
		await expect(titles).toHaveText(await results.allTextContents());
		await expect(search).toBeFocused();
		expect(await search.boundingBox()).toEqual(initialSearchBox);
		await expect(detail.locator('#voice-order')).toHaveCount(0);

		await index.getByRole('link', { name: /^Song parts open with bracketed headers/u }).click();
		await expect(detail.locator('#bracketed-headers')).toBeInViewport();
		await expect(titles).toHaveText(await results.allTextContents());
		const entry = detail.locator('.guidelines__entry:has(#bracketed-headers)');
		await expect(entry.getByRole('heading', { name: 'Exceptions and context' })).toBeAttached();
		await expect(entry.getByText('[Verse 1]', { exact: true })).toBeAttached();
		await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);

		if (width === 390) {
			await page
				.getByRole('navigation', { name: 'Guide navigation' })
				.getByRole('button', { name: 'Topics', exact: true })
				.click();
		}
		await search.fill('lyrics');
		await expect(detail.locator('.guidelines__check-result').first()).toBeAttached();
		await expect(titles).toHaveText(await results.allTextContents());
		expect(
			new Set(await detail.locator('.guidelines__topic').allTextContents()).size
		).toBeGreaterThan(1);
		await expect.poll(() => detail.evaluate((element) => element.scrollTop)).toBe(0);
		await expect(search).toBeFocused();
		await expect(page).toHaveURL(/[?&]q=lyrics(?:&|#|$)/u);
		const matchingTitles = await titles.allTextContents();
		await page.reload();
		await expect(search).toHaveValue('lyrics');
		await expect(titles).toHaveText(matchingTitles);
		await expect(results).toHaveText(matchingTitles);
		if (width === 390) {
			await page
				.getByRole('navigation', { name: 'Guide navigation' })
				.getByRole('button', { name: 'Topics', exact: true })
				.click();
		}

		await search.fill('standardized spellings');
		await expect(detail.locator('#standardized-spellings')).toBeAttached();
		await expect(titles).toHaveText(await results.allTextContents());
		await search.fill('zzzzzznomatchingconvention');
		await expect(results).toHaveCount(0);
		await expect(titles).toHaveCount(0);
		await expect(detail.getByText(/No results match/u)).toBeAttached();
		await expect(search).toBeFocused();

		await search.press('Escape');
		await expect(search).toHaveValue('');
		await expect(search).toBeFocused();
		await expect(titles).toHaveText(allTitles);
		await expect(detail.locator('#voice-order')).toBeAttached();
	});
}

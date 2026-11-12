import { expect, test, type Page } from '@playwright/test';

const guideNavigation = (page: Page) => page.getByRole('navigation', { name: 'Guide navigation' });

for (const setting of [
	{ width: 1440, colorScheme: 'dark', hasTouch: false },
	{ width: 360, colorScheme: 'dark', hasTouch: true },
	{ width: 390, colorScheme: 'light', hasTouch: true }
] satisfies { width: number; colorScheme: 'dark' | 'light'; hasTouch: boolean }[]) {
	test.describe(`${setting.width}px ${setting.colorScheme}`, () => {
		test.use({
			viewport: { width: setting.width, height: 900 },
			colorScheme: setting.colorScheme,
			hasTouch: setting.hasTouch,
			isMobile: setting.hasTouch,
			reducedMotion: 'reduce'
		});
		for (const route of ['', 'numbers/']) {
			test(`Musixmatch finder search and restoration from ${route || 'directory'}`, async ({
				page
			}, testInfo) => {
				await page.goto(`/guidelines/musixmatch/${route}`);
				const sidebar = page.locator('.guide-sidebar');
				const search = page.getByRole('searchbox', { name: 'What are you working on?' });
				const results = sidebar.locator('.reference-result');
				const heading = page.getByRole('heading', { level: 1 });
				// A phone article has no finder; its return link leads to the one on the directory.
				if (route && setting.hasTouch) {
					await expect(heading).toHaveText('Numbers for Musixmatch');
					await page.evaluate(() => document.fonts.ready);
					await guideNavigation(page).getByRole('link', { name: 'All topics' }).click();
					await expect(page).toHaveURL(/\/guidelines\/musixmatch\/$/u);
				}
				const reading =
					route && !setting.hasTouch ? 'Numbers for Musixmatch' : 'Musixmatch transcription guide';
				await expect(search).toBeInViewport();
				await expect(search).toBeEnabled();
				const bounds = await search.boundingBox();
				await search.fill('numbers');
				await expect(results.first()).toBeAttached();
				await expect(search).toBeFocused();
				expect(await search.boundingBox()).toEqual(bounds);
				await expect(heading).toHaveText(reading);
				await expect(
					sidebar.getByRole('link', { name: 'Musixmatch', exact: true })
				).toHaveAttribute('aria-current', 'true');
				await results.first().locator(':scope > a').click();
				await expect(page).toHaveURL(/\/guidelines\/musixmatch\/[^/]+\/\?q=numbers#mx-/u);
				await expect(page.locator('#mx-f06')).toBeInViewport();
				const check = page.locator('main .profile-guideline details[data-check-id]').first();
				await check.locator('summary').click();
				await expect(
					check.getByText('Requires review under this check', { exact: true })
				).toBeVisible();
				await page.screenshot({ path: testInfo.outputPath('matched-reader.png') });
				await expect(check.getByText('Accepted by this check', { exact: true })).toBeAttached();
				const checkLink = check.getByRole('link').last();
				await expect(checkLink).toHaveAttribute('href', /\/guidelines\/checks\/mxm-.*\?q=numbers/u);
				await checkLink.scrollIntoViewIfNeeded();
				const readingY = await page.evaluate(() => window.scrollY);
				await checkLink.click();
				await expect(page.getByRole('heading', { name: 'Example', exact: true })).toBeAttached();
				// A phone article hides the finder, which keeps the query for the way back.
				await expect(page.locator('#reference-search')).toHaveValue('numbers');
				await expect(page.locator('main a[href^="https://"]').first()).toBeAttached();
				await page.goBack();
				await expect(check).toHaveAttribute('open', '');
				await expect(checkLink).toBeInViewport();
				await expect
					.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - readingY))
					.toBeLessThanOrEqual(1);
				if (setting.hasTouch) {
					await guideNavigation(page).getByRole('link', { name: 'Back to results' }).click();
					await expect(page).toHaveURL(/\/guidelines\/musixmatch\/\?q=numbers$/u);
				}
				await search.fill('mxm');
				const gap = results.filter({ hasText: 'Language-specific evidence still missing' });
				await expect(gap).toHaveCount(1);
				await expect(gap).toContainText('LyricLint check');
				await search.fill('zzzzzznomatchingconvention');
				await expect(results).toHaveCount(0);
				await expect(sidebar.getByText(/No answers match yet/u)).toBeVisible();
				await expect(search).toBeFocused();
				await page.screenshot({ path: testInfo.outputPath('empty-finder.png') });
				await search.press('Escape');
				await expect(search).toHaveValue('');
				await expect(search).toBeFocused();
				await expect(results).toHaveCount(0);
				await expect(sidebar.locator('.reference-topics')).toBeVisible();
				await page.goto(`/guidelines/musixmatch/?q=zzzzzznomatchingconvention`);
				await expect(sidebar.getByText(/No answers match yet/u)).toBeVisible();
				await expect(search).toBeEnabled();
				await search.focus();
				await search.press('Escape');
				await expect(heading).toHaveText('Musixmatch transcription guide');
				if (setting.hasTouch) {
					expect(
						await search.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
					).toBeGreaterThanOrEqual(16);
					expect((await search.boundingBox())?.height).toBeGreaterThanOrEqual(44);
				}
				expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
					setting.width
				);
				await page.screenshot({ path: testInfo.outputPath('restored.png') });
				const finalAction = page.getByRole('main').locator('.button').last();
				await finalAction.scrollIntoViewIfNeeded();
				await expect(finalAction).toBeInViewport();
				await page.screenshot({ path: testInfo.outputPath('final-actions.png') });
			});
		}
	});
}

test('standalone Musixmatch check search keeps examples, sources and detail links', async ({
	page
}) => {
	await page.goto('/guidelines/musixmatch/?q=numbers&scope=rules');
	const results = page.locator('.guide-sidebar .reference-result');
	await expect(results.first()).toBeAttached();
	await expect(results.filter({ hasNotText: 'LyricLint check' })).toHaveCount(0);
	const result = results
		.filter({ hasText: 'A number without established context' })
		.locator(':scope > a');
	await expect(result).toHaveAttribute('href', /q=numbers&scope=rules/u);
	await result.click();
	await expect(
		page.getByRole('heading', { name: 'A number without established context', exact: true })
	).toBeVisible();
	const check = page.locator('main');
	await expect(check.getByText('Requires review under this check', { exact: true })).toBeAttached();
	await expect(check.getByText('Accepted by this rule', { exact: true })).toBeAttached();
	await expect(check).toContainText('A value alone does not prove its role or pronunciation');
	await expect(check.locator('a[href^="https://"]').first()).toBeAttached();
});

test('leaving a searched clause restores the Musixmatch topic directory', async ({ page }) => {
	await page.goto('/guidelines/musixmatch/?q=numbers');
	const sidebar = page.locator('.guide-sidebar');
	await sidebar.locator('a[href$="#mx-f06"]').first().click();
	await expect(page.locator('main #mx-f06')).toBeInViewport();
	const search = sidebar.getByRole('searchbox');
	await search.focus();
	await search.press('Escape');
	await expect(search).toHaveValue('');
	await sidebar.getByRole('link', { name: 'Musixmatch', exact: true }).click();
	await expect(page).toHaveURL(/\/guidelines\/musixmatch\/$/u);
	await expect(sidebar.locator('.reference-topics')).toBeVisible();
	await expect(sidebar.locator('.reference-results')).toHaveCount(0);
});

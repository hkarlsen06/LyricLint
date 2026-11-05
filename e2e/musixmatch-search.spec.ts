import { expect, test } from '@playwright/test';

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
			test(`Musixmatch ranked reader and restoration from ${route || 'directory'}`, async ({
				page
			}, testInfo) => {
				await page.goto(`/guidelines/musixmatch/${route}`);
				const index = page.locator('.site-split__index');
				const detail = page.locator('.site-split__detail');
				const search = index.getByRole('searchbox');
				const results = index.locator('.reference-result .site-run__title');
				const titles = detail.locator('.profile-guideline h2, .musixmatch-check-result h2');
				const topics = page
					.getByRole('navigation', { name: 'Guide navigation' })
					.getByRole('button', { name: 'Topics', exact: true });
				if (route && setting.hasTouch) {
					await expect(
						detail.getByRole('heading', { name: 'Numbers for Musixmatch', exact: true })
					).toBeInViewport();
					await page.evaluate(() => document.fonts.ready);
					await topics.click();
				}
				await expect(search).toBeInViewport();
				const bounds = await search.boundingBox();
				await search.fill('numbers');
				await expect(results.first()).toBeAttached();
				await expect(titles).toHaveText(
					(await results.allTextContents()).map((title) => title.replaceAll('`', ''))
				);
				await expect(search).toBeFocused();
				expect(await search.boundingBox()).toEqual(bounds);
				await expect(
					detail.getByText('What LyricLint can establish', { exact: true }).first()
				).toBeAttached();
				await expect(detail.locator('.profile-guideline .mxm-pill').first()).toBeAttached();
				await expect(index.getByRole('link', { name: 'Musixmatch', exact: true })).toHaveAttribute(
					'aria-current',
					'true'
				);
				await results.first().click();
				await expect(page).toHaveURL(/\/guidelines\/musixmatch\/[^/]+\/\?q=numbers#mx-/u);
				await expect(detail.locator('#mx-f06')).toBeInViewport();
				const check = detail.locator('.profile-guideline details[data-check-id]').first();
				await check.locator('summary').click();
				await expect(
					check.getByText('Requires review under this check', { exact: true })
				).toBeVisible();
				await page.screenshot({ path: testInfo.outputPath('matched-reader.png') });
				await expect(check.getByText('Accepted by this check', { exact: true })).toBeAttached();
				const checkLink = check.getByRole('link').last();
				await expect(checkLink).toHaveAttribute('href', /\/guidelines\/checks\/mxm-.*\?q=numbers/u);
				await checkLink.scrollIntoViewIfNeeded();
				const readingY = await detail.evaluate((element) => element.scrollTop);
				await checkLink.click();
				await expect(detail.getByRole('heading', { name: 'Example', exact: true })).toBeAttached();
				await expect(search).toHaveValue('numbers');
				await expect(detail.locator('a[href^="https://"]').first()).toBeAttached();
				await page.goBack();
				await expect(check).toHaveAttribute('open', '');
				await expect(checkLink).toBeInViewport();
				await expect
					.poll(async () =>
						Math.abs((await detail.evaluate((element) => element.scrollTop)) - readingY)
					)
					.toBeLessThanOrEqual(1);
				if (setting.hasTouch) await topics.click();
				await search.fill('Japanese');
				await expect(titles).toHaveText(
					(await results.allTextContents()).map((title) => title.replaceAll('`', ''))
				);
				await expect(detail.locator('.mxm-conflict').first()).toContainText('Guidelines disagree.');
				if (setting.hasTouch)
					await page
						.getByRole('navigation', { name: 'Guide navigation' })
						.getByRole('button', { name: 'Guide', exact: true })
						.click();
				await detail.locator('.mxm-conflict').first().scrollIntoViewIfNeeded();
				await page.screenshot({ path: testInfo.outputPath('source-conflict.png') });
				if (setting.hasTouch) await topics.click();
				await search.fill('mxm');
				await expect(titles).toHaveText(
					(await results.allTextContents()).map((title) => title.replaceAll('`', ''))
				);
				await expect(detail.locator('.musixmatch-check-result').first()).toBeAttached();
				const gap = detail.locator('.musixmatch-check-result').filter({
					has: page.getByRole('heading', {
						name: 'Language-specific evidence still missing',
						exact: true
					})
				});
				await expect(gap).toContainText('missing language-policy evidence');
				await expect(gap.locator('.site-sample--valid')).toHaveCount(0);
				await expect(gap).toContainText('Requires review under this check');
				await search.fill('zzzzzznomatchingconvention');
				await expect(results).toHaveCount(0);
				await expect(titles).toHaveCount(0);
				await expect(detail.getByText(/No results match/u)).toBeAttached();
				await expect(index.getByText(/No results match/u)).toBeAttached();
				await expect(detail.locator('.musixmatch-welcome')).toHaveCount(0);
				await expect(search).toBeFocused();
				if (setting.hasTouch)
					await page
						.getByRole('navigation', { name: 'Guide navigation' })
						.getByRole('button', { name: 'Guide', exact: true })
						.click();
				await page.screenshot({ path: testInfo.outputPath('empty-reader.png') });
				if (setting.hasTouch) await topics.click();
				await search.focus();
				await search.press('Escape');
				await expect(search).toHaveValue('');
				await expect(search).toBeFocused();
				// The result click selected the Numbers topic, so clearing restores that route.
				await expect(
					detail.getByRole('heading', { name: 'Numbers for Musixmatch', exact: true })
				).toBeAttached();
				await page.goto(`/guidelines/musixmatch/${route}?q=zzzzzznomatchingconvention`);
				if (route && setting.hasTouch) {
					await expect(
						detail.getByRole('heading', { name: 'Musixmatch search results', exact: true })
					).toBeInViewport();
					await page.evaluate(() => document.fonts.ready);
					await topics.click();
				}
				await expect(detail.getByText(/No results match/u)).toBeAttached();
				await search.focus();
				await search.press('Escape');
				await expect(
					detail.getByRole('heading', {
						name: route ? 'Numbers for Musixmatch' : 'Musixmatch transcription guide',
						exact: true
					})
				).toBeAttached();
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
				if (setting.hasTouch)
					await page
						.getByRole('navigation', { name: 'Guide navigation' })
						.getByRole('button', { name: 'Guide', exact: true })
						.click();
				const finalAction = detail.locator('main .button').last();
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
	const detail = page.locator('.site-split__detail');
	const results = page.locator('.site-split__index .reference-result .site-run__title');
	await expect(results.first()).toBeAttached();
	await expect(detail.locator('.musixmatch-check-result h2')).toHaveText(
		await results.allTextContents()
	);
	await expect(detail.locator('.profile-guideline')).toHaveCount(0);
	const check = detail.locator('.musixmatch-check-result').filter({
		has: page.getByRole('heading', { name: 'A number without established context', exact: true })
	});
	await expect(check.getByText('Requires review under this check', { exact: true })).toBeAttached();
	await expect(check.getByText('Accepted by this check', { exact: true })).toBeAttached();
	await expect(check).toContainText('A value alone does not prove its role or pronunciation');
	await expect(check.locator('a[href^="https://"]').first()).toBeAttached();
	await expect(
		check.getByRole('link', { name: 'A number without established context', exact: true })
	).toHaveAttribute('href', /q=numbers&scope=rules/u);
});

test('leaving a searched clause restores the Musixmatch topic directory', async ({ page }) => {
	await page.goto('/guidelines/musixmatch/?q=numbers');
	const index = page.locator('.site-split__index');
	await index.locator('a[href$="#mx-f06"]').click();
	await expect(page.locator('.site-split__detail #mx-f06')).toBeInViewport();
	const search = index.getByRole('searchbox');
	await search.focus();
	await search.press('Escape');
	await expect(search).toHaveValue('');
	await index.getByRole('link', { name: 'Musixmatch', exact: true }).click();
	await expect(page).toHaveURL(/\/guidelines\/musixmatch\/$/u);
	await expect(index.locator('.reference-topics')).toBeVisible();
	await expect(index.locator('.reference-results')).toHaveCount(0);
});

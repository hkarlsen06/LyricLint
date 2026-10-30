import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

test('guide disclosures and filter dropdowns remain accessible', async ({
	page,
	isMobile
}, testInfo) => {
	await page.setViewportSize({ width: isMobile ? 320 : 1440, height: 900 });
	await page.goto('/guidelines/');
	const preview = page.getByRole('region', { name: 'Standardized spellings' });
	const source = preview.locator('details');
	const sourceControl = source.locator('summary');
	await sourceControl.scrollIntoViewIfNeeded();
	const before = await sourceControl.boundingBox();
	await sourceControl.focus();
	await page.keyboard.press('Enter');
	await expect(source).toHaveAttribute('open');
	await expect(source.getByRole('link')).toBeVisible();
	expect(await sourceControl.boundingBox()).toEqual(before);
	await page.screenshot({ path: testInfo.outputPath('source-disclosure.png') });
	await page.keyboard.press('Enter');
	await expect(source).not.toHaveAttribute('open');
	const advice = page.locator('summary').filter({ hasText: 'Where does the advice come from?' });
	await advice.click();
	await expect(page.getByRole('button', { name: 'linter: show definition' })).toBeVisible();
	await advice.click();
	await page.getByRole('button', { name: 'Filters', exact: true }).click();
	await expect(page.getByLabel('Show', { exact: true })).toBeVisible();
	await page.getByLabel('Show', { exact: true }).selectOption('rules');
	await page.getByLabel('Topic', { exact: true }).selectOption('spelling');
	await expect(page.getByLabel('Show', { exact: true })).toHaveValue('rules');
	await expect(page.getByLabel('Topic', { exact: true })).toHaveValue('spelling');
	await page.screenshot({ path: testInfo.outputPath('filter-dropdowns.png') });
});

test('definitions fit a zoomed phone viewport', async ({ page, browserName }) => {
	test.skip(browserName !== 'chromium', 'Page scale emulation uses the Chromium protocol.');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/guidelines/spelling/#elision-apostrophe');
	await page
		.locator('.guidelines__entry:has(#elision-apostrophe)')
		.getByRole('button', { name: 'linter: show definition' })
		.click();
	const session = await page.context().newCDPSession(page);
	try {
		await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
		const definition = page.getByRole('dialog', { name: 'Linter' });
		await expect
			.poll(() =>
				definition.evaluate((element) => {
					const bounds = element.getBoundingClientRect();
					const viewport = window.visualViewport!;
					return (
						bounds.left >= viewport.offsetLeft &&
						bounds.top >= viewport.offsetTop &&
						bounds.right <= viewport.offsetLeft + viewport.width &&
						bounds.bottom <= viewport.offsetTop + viewport.height &&
						element.scrollWidth <= element.clientWidth
					);
				})
			)
			.toBe(true);
		await page.keyboard.press('Tab');
		await expect(definition.getByRole('button', { name: 'Close definition' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(definition).toHaveCount(0);
	} finally {
		await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
		await session.detach();
	}
});

test('homepage spellings and inline definitions work throughout the guide', async ({
	page,
	isMobile
}, testInfo) => {
	const width = isMobile ? 320 : 1440;
	await page.setViewportSize({ width, height: 900 });
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/guidelines/');
	const preview = page.getByRole('region', { name: 'Standardized spellings' });
	await expect(preview).toHaveCount(1);
	await expect(preview.getByRole('heading')).toBeVisible();
	await expect(preview.locator('tbody td:first-child')).toHaveText([
		"I'ma",
		'okay',
		'tryna',
		'ayy',
		'though',
		'skrrt'
	]);
	await expect(page.locator('.guide-questions figure, .guide-questions .site-meta')).toHaveCount(0);
	await expect(page.locator('.reference-topic-question')).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath('homepage-spellings.png') });
	await preview.getByRole('link', { name: 'See all standardized spellings' }).click();
	await expect(page).toHaveURL('/guidelines/spelling/#standardized-spellings');
	await expect(page.locator('#standardized-spellings')).toBeInViewport();

	await page.goto('/guidelines/spelling/?q=linter#elision-apostrophe');
	const entry = page.locator('.guidelines__entry:has(#elision-apostrophe)');
	const trigger = entry.getByRole('button', { name: 'linter: show definition' });
	await expect(trigger).toBeEnabled();
	await expect(trigger.locator('mark')).toHaveText('linter');
	await trigger.scrollIntoViewIfNeeded();
	const before = await trigger.boundingBox();
	const readingPosition = await page.evaluate(() => window.scrollY);
	await trigger.click();
	const definition = page.getByRole('dialog', { name: 'Linter' });
	await expect(definition).toBeFocused();
	await expect(definition).toContainText('It does not listen to the recording');
	expect(await trigger.boundingBox()).toEqual(before);
	expect(await page.evaluate(() => window.scrollY)).toBe(readingPosition);
	const bounds = await definition.boundingBox();
	expect(bounds).not.toBeNull();
	if (!bounds) throw new Error('Definition must be visible');
	expect(bounds.x).toBeGreaterThanOrEqual(0);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
	expect(bounds.y).toBeGreaterThanOrEqual(0);
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(900);
	await page.screenshot({ path: testInfo.outputPath('linter-definition.png') });
	await page.keyboard.press('Escape');
	await expect(trigger).toBeFocused();
	await expect(definition).toHaveCount(0);
	await page.keyboard.press('Enter');
	await definition.getByRole('button', { name: 'Close definition' }).click();
	await expect(trigger).toBeFocused();
	await expect(entry.locator(':scope > .site-sample--valid pre')).toHaveText(
		"Ballin' like we used to"
	);
	await expect(page.locator('pre button, code button, a button')).toHaveCount(0);
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
		width
	);
	expect(errors).toEqual([]);
});

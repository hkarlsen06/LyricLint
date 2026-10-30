import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
	test(`guide has a keyboard entrance and ordinary return links at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/guidelines/');
		await page.keyboard.press('Tab');
		const skip = page.getByRole('link', { name: /Skip to/u });
		await expect(skip).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.locator('main')).toBeFocused();
		await expect(page.locator('main').getByRole('searchbox')).toBeInViewport();
		await expect(page.getByRole('searchbox')).toHaveCount(1);
		await expect(page.locator('main h1')).toHaveText('Transcription guide');
		const search = page.getByRole('searchbox', { name: 'What are you working on?' });
		expect(
			Number.parseFloat(await search.evaluate((field) => getComputedStyle(field).fontSize))
		).toBeGreaterThanOrEqual(16);
		await page
			.getByRole('link', { name: 'How do I credit different singers?', exact: true })
			.click();
		await expect(page).toHaveURL(/\/guidelines\/section-headers\/#artist-identifiers$/u);
		await expect(page.locator('#artist-identifiers')).toBeInViewport();
		await expect(page.locator('main')).toBeFocused();
		if (width === 390) await expect(search).toBeHidden();
		await page
			.getByRole('navigation', { name: 'Guide navigation' })
			.getByRole('link', { name: 'All topics', exact: true })
			.click();
		await expect(page).toHaveURL('/guidelines/');
		await search.fill('two singers');
		await page.locator('.reference-result > a[href*="#artist-identifiers"]').click();
		await page
			.getByRole('navigation', { name: 'Guide navigation' })
			.getByRole('link', { name: 'Back to results', exact: true })
			.click();
		await expect(search).toHaveValue('two singers');
		await expect(page.locator('.reference-result').first()).toBeVisible();
	});

	test(`Back restores expanded checks and window reading position at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/guidelines/section-headers/#voice-order');
		const disclosure = page
			.locator('.guidelines__entry:has(#voice-order) .guidelines__checks details')
			.first();
		await disclosure.locator('summary').click();
		const check = disclosure.getByRole('link', { name: /See trigger and fix/u });
		await expect(check).toHaveAttribute('href', /^\/guidelines\/checks\/[^/]+\/$/u);
		await check.scrollIntoViewIfNeeded();
		const before = await page.evaluate(() => window.scrollY);
		expect(before).toBeGreaterThan(0);
		await check.click();
		await expect(page).toHaveURL(/\/guidelines\/checks\//u);
		await page.goBack();
		await expect(page).toHaveURL(/\/guidelines\/section-headers\/#voice-order$/u);
		await expect(disclosure).toHaveAttribute('open');
		await expect(check).toBeInViewport();
		await expect
			.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before))
			.toBeLessThan(2);
	});
}

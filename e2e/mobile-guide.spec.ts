import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce' });

for (const width of [320, 390]) {
	test(`phone guide accepts the first query and restores reading at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 844 });
		const startup = Promise.withResolvers<void>();
		await page.route('**/_app/immutable/entry/*.js', async (route) => {
			await startup.promise;
			await route.continue();
		});
		await page.goto('/guidelines/', { waitUntil: 'commit' });
		try {
			await expect(page.getByRole('searchbox')).toBeDisabled();
		} finally {
			startup.resolve();
		}
		// Fill as soon as the control is available, without waiting for hydration or idle time.
		await page.getByRole('searchbox').fill('two singers');
		await expect(page.getByRole('searchbox')).toHaveValue('two singers');
		await expect(page).toHaveURL(/q=two\+singers$/u);
		await page.locator('.reference-result > a[href$="#artist-identifiers"]').click();
		await expect(page.locator('#artist-identifiers')).toBeInViewport();
		await page.getByRole('link', { name: 'Back to results', exact: true }).click();
		await expect(page.getByRole('searchbox')).toHaveValue('two singers');

		await page.goto('/guidelines/essentials/#readability-limit');
		await expect
			.poll(async () => {
				const heading = await page.locator('#readability-limit').boundingBox();
				const header = await page.locator('.site-header').boundingBox();
				return heading && header ? heading.y - header.y - header.height : -1;
			})
			.toBeGreaterThanOrEqual(0);
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);

		await page.goto('/guidelines/section-headers/#voice-order');
		await page.locator('.guide-contents > summary').click();
		const check = page
			.locator('.guidelines__entry:has(#voice-order) .guidelines__checks details')
			.first();
		await check.locator('summary').click();
		const link = check.getByRole('link', { name: /See trigger and fix/u });
		await link.scrollIntoViewIfNeeded();
		const before = await page.evaluate(() => window.scrollY);
		await link.click();
		await expect(page).toHaveURL(/\/guidelines\/checks\//u);
		await page.goBack();
		await expect(page).toHaveURL(/\/guidelines\/section-headers\/#voice-order$/u);
		await expect(check).toHaveAttribute('open');
		await expect(page.locator('.guide-contents')).toHaveAttribute('open');
		await expect
			.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - before))
			.toBeLessThan(2);
	});
}

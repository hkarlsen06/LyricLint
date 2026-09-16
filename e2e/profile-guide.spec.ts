import { expect, test } from '@playwright/test';

test.describe('Musixmatch guide', () => {
	test('keeps the profile, source-qualified checks and query entry point connected', async ({
		page
	}) => {
		await page.goto('/guidelines/?profile=musixmatch');
		await expect(page).toHaveURL(/\/guidelines\/musixmatch\//u);
		await expect(
			page.getByRole('heading', { name: 'Musixmatch transcription guide', exact: true })
		).toBeVisible();
		await expect(
			page
				.getByRole('navigation', { name: 'Guideline profile' })
				.getByRole('link', { name: 'Musixmatch' })
		).toHaveAttribute('aria-current', 'true');
		await page.getByRole('searchbox').fill('instrumental spacing');
		await page
			.locator('.reference-results a')
			.filter({ hasText: 'blank is not needed' })
			.first()
			.click();
		await expect(page).toHaveURL(/\/guidelines\/musixmatch\/non-english\/.*#mx-ja05/u);
		const conflict = page.locator('#mx-ja05');
		await expect(conflict).toContainText('Unresolved source scope');
		await expect(conflict.getByRole('link', { name: 'Japanese FAQ' })).toBeVisible();
		await conflict.getByRole('link', { name: 'An instrumental interval needing review' }).click();
		await expect(page).toHaveURL(/\/guidelines\/checks\/mxm-structure-instrumental\//u);
		await expect(
			page.getByRole('heading', { name: 'An instrumental interval needing review', exact: true })
		).toBeVisible();
		await expect(page.getByText('Requires review under this check', { exact: true })).toBeVisible();
	});

	test('keeps phone navigation and long policy text within the viewport', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto('/guidelines/musixmatch/');
		const profileLink = page
			.getByRole('navigation', { name: 'Guideline profile' })
			.getByRole('link', { name: 'Musixmatch' });
		await expect(profileLink).toBeVisible();
		const before = await profileLink.boundingBox();
		await page.getByRole('searchbox').fill('backing vocals');
		const after = await profileLink.boundingBox();
		expect(after?.y).toBe(before?.y);
		await page.goto('/guidelines/musixmatch/non-english/#mx-es05');
		await expect(page.locator('#mx-es05')).toBeVisible();
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
		await expect(page.getByRole('button', { name: 'Back to guide', exact: true })).toBeVisible();
	});
});

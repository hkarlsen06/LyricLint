import { expect, test } from '@playwright/test';

for (const scenario of [
	{ name: 'desktop', width: 1440, reducedMotion: 'no-preference' },
	{ name: 'phone', width: 390, reducedMotion: 'no-preference' },
	{ name: 'reduced motion', width: 390, reducedMotion: 'reduce' }
] as const) {
	test(`workbench navigation starts its splash during loading on ${scenario.name}`, async ({
		page
	}) => {
		await page.setViewportSize({ width: scenario.width, height: 844 });
		await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
		await page.goto('/about/');
		// Let the current page hydrate before deliberately blocking route modules.
		await page.waitForLoadState('networkidle');
		const app = page.getByRole('link', { name: 'App', exact: true });
		await app.evaluate((link) => {
			link.setAttribute('data-sveltekit-preload-data', 'off');
			link.setAttribute('data-sveltekit-preload-code', 'off');
		});

		let release!: () => void;
		const downloading = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/*', async (route) => {
			const url = route.request().url();
			if (
				route.request().resourceType() === 'script' &&
				(url.includes('/workbench/') || url.includes('/_app/immutable/nodes/'))
			)
				await downloading;
			await route.continue();
		});

		try {
			await app.click();
			const splash = page.locator('.navigation-splash');
			await expect(splash).toBeVisible();
			await expect(page).toHaveURL(/\/about\/$/);
			await expect(splash).toHaveAttribute('aria-hidden', 'true');
			await expect(page.getByText('Opening the workbench…', { exact: true })).toHaveAttribute(
				'aria-live',
				'polite'
			);
			await expect
				.poll(() => splash.boundingBox())
				.toEqual({
					x: 0,
					y: 0,
					width: scenario.width,
					height: 844
				});
			if (scenario.reducedMotion === 'reduce') {
				await expect(splash.locator('.app-wordmark')).toHaveCSS('animation-name', 'none');
			}

			release();
			await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
			await expect(splash).toHaveCount(0);
			await page.reload();
			await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
			await expect(splash).toHaveCount(0);
		} finally {
			release();
		}
	});
}

test('another navigation dismisses a splash whose workbench is still downloading', async ({
	page
}) => {
	await page.goto('/about/');
	await page.waitForLoadState('networkidle');
	const app = page.getByRole('link', { name: 'App', exact: true });
	await app.evaluate((link) => {
		link.setAttribute('data-sveltekit-preload-data', 'off');
		link.setAttribute('data-sveltekit-preload-code', 'off');
	});
	let release!: () => void;
	const downloading = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/*', async (route) => {
		const url = route.request().url();
		if (
			route.request().resourceType() === 'script' &&
			(url.includes('/workbench/') || url.includes('/_app/immutable/nodes/'))
		)
			await downloading;
		await route.continue();
	});
	try {
		await app.click();
		await expect(page.locator('.navigation-splash')).toBeVisible();
		// Synthetic click omits pointerdown, exercising navigation cancellation itself.
		await page
			.getByRole('link', { name: 'Guide', exact: true })
			.evaluate((link: HTMLAnchorElement) => link.click());
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
		release();
		await expect(page).toHaveURL(/\/guidelines\/$/);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
	} finally {
		release();
	}
});

for (const refusal of ['another tab', 'unavailable storage'] as const) {
	test(`workbench navigation dismisses its splash for ${refusal}`, async ({ page, context }) => {
		if (refusal === 'another tab') {
			const owner = await context.newPage();
			await owner.goto('/workbench/');
			await expect(owner.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		} else {
			await page.addInitScript(() => {
				IDBFactory.prototype.open = () => {
					throw new DOMException('Storage blocked', 'SecurityError');
				};
			});
		}
		await page.goto('/about/');
		await page.waitForLoadState('networkidle');
		await page.getByRole('link', { name: 'App', exact: true }).click();
		if (refusal === 'another tab') {
			await expect(page.getByRole('heading', { name: /open in another tab/ })).toBeVisible();
		} else {
			await expect(page.getByRole('alert')).toContainText('Local storage is unavailable');
		}
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
	});
}

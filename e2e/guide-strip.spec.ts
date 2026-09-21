import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
	for (const path of ['/guidelines/', '/guidelines/section-headers/']) {
		test(`Back restores the guide pane after leaving ${path} at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion: 'reduce' });
			await page.goto(path);
			const strip = page.locator('.site-split');
			await expect(strip).toHaveAttribute('data-scrollbars-ready', '');
			const detail = page.locator('.site-split__detail');
			const expectedX =
				path === '/guidelines/'
					? width === 390
						? width
						: 0
					: width === 390
						? width * 2
						: width / 2;
			await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(expectedX);
			await detail.evaluate((el) => {
				el.scrollTop = 1200;
			});
			await page.locator('.site-home').click();
			await expect(page).toHaveURL('/');
			await page.goBack();
			await expect(page).toHaveURL(path);
			await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(expectedX);
			await expect.poll(() => detail.evaluate((el) => el.scrollTop)).toBe(1200);
		});
	}
	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		test(`guide strip scrolls between mounted panes at ${width}px with ${reducedMotion} motion`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion });
			await page.goto('/guidelines/');
			const strip = page.locator('.site-split');
			const intro = page.locator('.site-split__intro');
			const index = page.locator('.site-split__index');
			const detail = page.locator('.site-split__detail');
			const search = index.getByRole('searchbox');
			const navigation = page.getByRole('navigation', { name: 'Guide navigation' });
			const back = navigation.getByRole('button', {
				name: width === 390 ? 'Topics' : 'Introduction',
				exact: true
			});
			await expect(search).toBeInViewport();
			await expect(intro).toBeAttached();
			await expect(detail.locator('#voice-order')).toBeAttached();
			await expect.poll(() => strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
			await expect
				.poll(() =>
					strip.evaluate((el) =>
						Math.abs(el.scrollLeft - (el.clientWidth < 992 ? el.clientWidth : 0))
					)
				)
				.toBeLessThan(2);
			const initialScroll = await strip.evaluate((el) => el.scrollLeft);
			if (width === 390) {
				await navigation.getByRole('button', { name: 'Introduction', exact: true }).click();
				await expect(intro).toBeFocused();
				await navigation.getByRole('button', { name: 'Topics', exact: true }).click();
				await expect(index).toBeFocused();
			} else {
				await expect(
					navigation.getByRole('button', { name: 'Introduction', exact: true })
				).toBeHidden();
			}
			await expect(navigation.getByRole('button', { name: 'Guide', exact: true })).toHaveCount(1);
			await expect(
				strip.getByRole('button', { name: /^(Introduction|Topics|Guide)$/u })
			).toHaveCount(0);
			const forwardBox = await navigation
				.getByRole('button', { name: 'Guide', exact: true })
				.boundingBox();
			const navBox = await navigation.boundingBox();
			expect(forwardBox!.x).toBeGreaterThan(width / 2);
			const stripBox = await strip.boundingBox();
			if (width === 390) {
				const headerBox = await page.locator('.site-header').boundingBox();
				expect(Math.abs(stripBox!.y - headerBox!.y - headerBox!.height)).toBeLessThan(2);
				expect(forwardBox!.y).toBeGreaterThan(800);
				expect(forwardBox!.y + forwardBox!.height).toBeLessThan(900);
				expect(forwardBox!.height).toBeGreaterThanOrEqual(44);
				const introductionBox = await navigation
					.getByRole('button', { name: 'Introduction', exact: true })
					.boundingBox();
				const gap = {
					x: (introductionBox!.x + introductionBox!.width + forwardBox!.x) / 2,
					y: forwardBox!.y + forwardBox!.height / 2
				};
				expect(
					await page.evaluate(
						({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.site-split__index'),
						gap
					)
				).toBe(true);
			} else {
				expect(stripBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 1);
			}

			await expect(search).toBeInViewport();
			await index
				.getByRole('navigation', { name: 'Browse reference topics' })
				.getByRole('link', { name: 'Section headers and performers', exact: true })
				.click();
			await expect(page).toHaveURL(/\/guidelines\/section-headers\/$/u);
			await expect(back).toBeInViewport();
			await expect
				.poll(() => strip.evaluate((el) => el.scrollLeft))
				.toBeGreaterThan(initialScroll + 100);
			await expect
				.poll(() =>
					strip.evaluate((el) => Math.abs(el.scrollLeft - (el.scrollWidth - el.clientWidth)))
				)
				.toBeLessThan(2);
			await expect(navigation.getByRole('button', { name: 'Guide', exact: true })).toBeHidden();
			const backBox = await back.boundingBox();
			expect(backBox!.x).toBeLessThan(width / 2);
			expect(Math.abs(backBox!.y - forwardBox!.y)).toBeLessThan(2);
			expect((await navigation.boundingBox())!.height).toBe(navBox!.height);

			const url = page.url();
			const readingPosition = await detail.evaluate((el) => {
				el.scrollTo({ top: 1200, behavior: 'instant' });
				return el.scrollTop;
			});
			expect((await back.boundingBox())!.y).toBe(backBox!.y);
			await back.click();
			await expect(search).toBeInViewport();
			expect(page.url()).toBe(url);
			expect(await detail.evaluate((el) => el.scrollTop)).toBe(readingPosition);
			await expect
				.poll(() => strip.evaluate((el) => el.scrollLeft))
				.toBeLessThan(initialScroll + 5);

			await navigation.getByRole('button', { name: 'Guide', exact: true }).click();
			await expect(detail.locator('main')).toBeFocused();
			await expect
				.poll(() =>
					strip.evaluate((el) => Math.abs(el.scrollLeft - (el.scrollWidth - el.clientWidth)))
				)
				.toBeLessThan(2);
			await expect(back).toBeInViewport();
			await back.click();
			await expect
				.poll(() => strip.evaluate((el) => el.scrollLeft))
				.toBeLessThan(initialScroll + 5);

			// A native horizontal wheel gesture reaches the same reading pane without navigation.
			await page.mouse.move(width - 40, 500);
			await page.mouse.wheel(width, 0);
			await expect(back).toBeInViewport();
			expect(page.url()).toBe(url);
			expect(await detail.evaluate((el) => el.scrollTop)).toBe(readingPosition);
			expect(await page.evaluate(() => window.scrollY)).toBe(0);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);
			if (width === 390) {
				await detail.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }));
				const suggestion = detail.getByRole('link', { name: 'Send a suggestion' });
				await expect(suggestion).toBeInViewport();
				const suggestionBox = await suggestion.boundingBox();
				expect(suggestionBox!.y + suggestionBox!.height).toBeLessThan(backBox!.y);
			}
		});
	}
}

test.describe('touch and keyboard guide navigation', () => {
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('a phone swipe and the strip arrow keys reach adjacent panes', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/guidelines/');
		const strip = page.getByRole('region', { name: 'Guide columns' });
		await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(390);
		await strip.focus();
		await page.keyboard.press('ArrowLeft');
		await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(0);
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(390);

		const touch = await page.context().newCDPSession(page);
		await touch.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x: 350, y: 500 }]
		});
		for (const x of [300, 250, 200, 150, 100, 40]) {
			await touch.send('Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [{ x, y: 500 }]
			});
		}
		await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
		await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBe(780);
		await expect(
			page
				.getByRole('navigation', { name: 'Guide navigation' })
				.getByRole('button', { name: 'Topics', exact: true })
		).toBeInViewport();
		await expect(page).toHaveURL(/\/guidelines\/$/u);
	});
});

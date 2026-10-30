import { expect, test } from '@playwright/test';

for (const width of [1440, 390, 320]) {
	test(`finder opens a complete topic and Back restores results at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/guidelines/');
		const search = page.getByRole('searchbox', { name: 'What are you working on?' });
		const topics = page.getByRole('navigation', { name: 'Browse reference topics' });
		const topicLinks = await topics.locator('.reference-topics a').allTextContents();
		await search.fill('turn it up');
		await expect(search).toBeFocused();
		await expect(page).toHaveURL(/[?&]q=turn\+it\+up/u);
		await expect(topics.locator('.reference-topics a')).toHaveText(topicLinks);
		const result = page
			.locator('.reference-result')
			.filter({ hasText: 'One exclamation mark at a time' });
		await expect(result.locator(':scope > a .reference-description')).toBeVisible();
		await result.locator(':scope > a').scrollIntoViewIfNeeded();
		const position = await page.evaluate(() => window.scrollY);
		const sidebarPosition = await page.locator('.guide-sidebar').evaluate((node) => node.scrollTop);
		await result.locator(':scope > a').click();
		await expect(page).toHaveURL(
			/\/guidelines\/punctuation\/\?q=turn\+it\+up#doubled-exclamation$/u
		);
		await expect(page.locator('#doubled-exclamation')).toBeInViewport();
		await expect(page.locator('#unmarked-question')).toBeAttached();
		await expect(page.locator('main #voice-order')).toHaveCount(0);
		await expect(
			page.locator('.guidelines__entry:has(#doubled-exclamation) .site-sample--invalid pre')
		).toHaveText('Turn it up!!');
		await page.reload();
		await expect(page.locator('#doubled-exclamation')).toBeInViewport();
		await page.goBack();
		await expect(page).toHaveURL(/\/guidelines\/\?q=turn\+it\+up$/u);
		await expect(search).toHaveValue('turn it up');
		await expect(result).toBeVisible();
		await expect
			.poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - position))
			.toBeLessThan(2);
		await expect
			.poll(async () =>
				Math.abs(
					(await page.locator('.guide-sidebar').evaluate((node) => node.scrollTop)) -
						sidebarPosition
				)
			)
			.toBeLessThan(2);
		await search.fill('zzzzzznomatchingconvention');
		await expect(page.locator('.reference-result')).toHaveCount(0);
		await expect(page.getByText(/No answers match yet/u)).toBeVisible();
		await expect(topics).toBeVisible();
		await search.press('Escape');
		await expect(search).toHaveValue('');
		await expect(search).toBeFocused();
		await expect(page.locator('.reference-result')).toHaveCount(0);
	});
}

test('desktop article search updates only the finder and replaces history', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/guidelines/');
	await page
		.getByRole('navigation', { name: 'Browse reference topics' })
		.getByRole('link', { name: /^Section headers and performers/u })
		.click();
	const headings = page.locator('main h1, main h2');
	const titles = await headings.allTextContents();
	await page.locator('#voice-order').scrollIntoViewIfNeeded();
	const search = page.getByRole('searchbox', { name: 'What are you working on?' });
	await search.focus();
	const before = await page.locator('#voice-order').boundingBox();
	await search.fill('unknown word');
	await expect(page.locator('.reference-result').first()).toBeVisible();
	await expect(headings).toHaveText(titles);
	await expect(search).toBeFocused();
	expect(before).not.toBeNull();
	await expect
		.poll(async () =>
			Math.abs(((await page.locator('#voice-order').boundingBox())?.y ?? 0) - (before?.y ?? 0))
		)
		.toBeLessThan(2);
	await search.fill('two singers');
	await expect(page).toHaveURL(/q=two\+singers$/u);
	await expect(headings).toHaveText(titles);
	await page.goBack();
	await expect(page).toHaveURL('/guidelines/');
});

test('all finder filters survive typing, navigation and reload', async ({ page }) => {
	await page.goto('/guidelines/?scope=rules&topic=spelling&severity=warning&fix=none');
	await page.getByRole('button', { name: /^Filters/u }).click();
	await expect(page.getByRole('combobox', { name: 'Show', exact: true })).toHaveValue('rules');
	await expect(page.getByRole('combobox', { name: 'Topic', exact: true })).toHaveValue('spelling');
	await page.getByRole('searchbox', { name: 'What are you working on?' }).fill('spelling');
	await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('spelling');
	for (const [key, value] of Object.entries({
		scope: 'rules',
		topic: 'spelling',
		severity: 'warning',
		fix: 'none'
	})) {
		expect(new URL(page.url()).searchParams.get(key)).toBe(value);
	}
	await page
		.getByRole('navigation', { name: 'Browse reference topics' })
		.getByRole('link', { name: /^Section headers and performers/u })
		.click();
	await expect(page.locator('main h1')).toHaveText('Section headers and performers');
	for (const [key, value] of Object.entries({
		q: 'spelling',
		scope: 'rules',
		topic: 'spelling',
		severity: 'warning',
		fix: 'none'
	})) {
		expect(new URL(page.url()).searchParams.get(key)).toBe(value);
	}
	await page.reload();
	await expect(page.getByRole('searchbox')).toHaveValue('spelling');
	await page.getByRole('button', { name: /^Filters/u }).click();
	await expect(page.getByRole('button', { name: 'No automatic fix', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
	await expect(page).toHaveURL('/guidelines/section-headers/');
	await expect(page.getByRole('searchbox')).toHaveValue('');
	await expect(page.getByRole('combobox', { name: 'Show', exact: true })).toHaveValue('all');
	await page.getByRole('combobox', { name: 'Show', exact: true }).selectOption('guidelines');
	await page.getByRole('searchbox').fill('unknown word');
	await expect(page.locator('.reference-result > a').first()).toBeVisible();
	await expect(page.locator('.reference-result > a[href*="/checks/"]')).toHaveCount(0);
	await expect(page).toHaveURL(/scope=guidelines/u);
});

test('opening a lower result preserves the mounted desktop finder', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/guidelines/?browse=all');
	const result = page.locator('.reference-result:has(details)').nth(8);
	await result.locator('summary').click();
	await result.locator(':scope > a').scrollIntoViewIfNeeded();
	const sidebar = page.locator('.guide-sidebar');
	const before = await sidebar.evaluate((node) => node.scrollTop);
	expect(before).toBeGreaterThan(100);
	await result.locator(':scope > a').click();
	await expect(page).not.toHaveURL('/guidelines/?browse=all');
	await expect(result.locator('details')).toHaveAttribute('open');
	await expect
		.poll(async () => Math.abs((await sidebar.evaluate((node) => node.scrollTop)) - before))
		.toBeLessThan(2);
});

test('essentials and complete-guide links carry active search filters', async ({ page }) => {
	await page.goto('/guidelines/?q=unknown&scope=guidelines&topic=censored-unknown');
	const directory = page.getByRole('navigation', { name: 'Browse reference topics' });
	await directory.getByRole('link', { name: 'Start with the essentials' }).click();
	await expect(page).toHaveURL(
		'/guidelines/essentials/?q=unknown&scope=guidelines&topic=censored-unknown'
	);
	await directory.getByRole('link', { name: 'Read the whole guide' }).click();
	await expect(page).toHaveURL(
		'/guidelines/all/?q=unknown&scope=guidelines&topic=censored-unknown'
	);
	await expect(page.locator('#bracketed-headers')).toBeAttached();
});

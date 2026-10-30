import { expect, test } from '@playwright/test';
import { guidanceEntries } from '../src/lib/guidance/entries.js';
import { entryAnchor } from '../src/lib/guidance/guidance.js';
import { referenceTopics } from '../src/lib/reference/topics.js';

for (const width of [1440, 390, 320]) {
	test(`complete guide and essentials keep reviewed content readable at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/guidelines/all/');
		await expect(page.locator('main h1')).toHaveText('Complete Genius transcription guide');
		await expect(page.locator('main .guide-topic > h2')).toHaveText(
			referenceTopics.map((topic) => topic.title)
		);
		await expect(page.locator('main .guidelines__entry > h3')).toHaveCount(guidanceEntries.length);
		for (const entry of guidanceEntries) {
			await expect(page.locator(`main h3[id="${entryAnchor(entry.id)}"]`)).toHaveText(entry.title);
		}
		for (const anchor of [
			'standardized-spellings',
			'bracketed-headers',
			'unknown-marker',
			'spelled-out'
		]) {
			await page.locator(`#${anchor}`).scrollIntoViewIfNeeded();
			await expect(page.locator(`#${anchor}`)).toBeInViewport();
		}
		const longest = [...guidanceEntries].sort((a, b) => b.title.length - a.title.length)[0];
		expect(longest).toBeDefined();
		if (!longest) throw new Error('The guide must contain conventions');
		await page.locator(`#${entryAnchor(longest.id)}`).scrollIntoViewIfNeeded();
		await expect(page.locator(`#${entryAnchor(longest.id)}`)).toBeInViewport();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			'https://lyriclint.com/guidelines/all/'
		);
		await page.goto('/guidelines/essentials/');
		await expect(page.locator('main h1')).toHaveText('Genius transcription essentials');
		await expect(
			page.getByRole('navigation', { name: 'On this page' }).getByRole('link')
		).toHaveCount(7);
		for (const anchor of [
			'bracketed-headers',
			'elision-apostrophe',
			'include-every',
			'vocalized-sounds',
			'immediate-repeat',
			'unmarked-question',
			'unknown-marker',
			'readability-limit',
			'echo-effects',
			'brand-name-marks'
		]) {
			await expect(page.locator(`main #${anchor}`)).toBeAttached();
			await page.locator(`main #${anchor}`).scrollIntoViewIfNeeded();
			await expect(page.locator(`main #${anchor}`)).toBeInViewport();
		}
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
		await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
			'href',
			'https://lyriclint.com/guidelines/essentials/'
		);
	});

	test(`topic fragments recover safely and retain examples and sources at ${width}px`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/guidelines/spelling/#no-such-anchor');
		await expect(page.locator('main h1')).toBeInViewport();
		await expect(page.locator('main h1')).toHaveText('Spelling and contractions');
		await expect(page.locator('#standardized-spellings')).toBeAttached();
		await expect(page.locator('.guide-contents')).toHaveAttribute('open');
		await page
			.getByRole('navigation', { name: 'On this page' })
			.getByRole('link', { name: 'The standardized spellings' })
			.click();
		await expect(page.locator('#standardized-spellings')).toBeInViewport();
		await expect(
			page.locator('.guidelines__landmark > .guidelines__entry-heading .site-meta')
		).toContainText('Genius staff guidance');
		await expect(
			page.locator(
				'.guidelines__landmark > .guidelines__entry-heading a[href="https://genius.com/9298624"]'
			)
		).toHaveCount(1);
		await page.goto('/guidelines/punctuation/?q=two+singers#doubled-exclamation');
		const entry = page.locator('.guidelines__entry:has(#doubled-exclamation)');
		await expect(entry.locator('h2')).toBeInViewport();
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
		await expect
			.poll(async () => {
				const heading = await entry.locator('h2').boundingBox();
				const header = await page.locator('.site-header').boundingBox();
				return heading && header ? heading.y - header.y - header.height : -1;
			})
			.toBeGreaterThanOrEqual(0);
		await expect(entry.locator('.site-sample--invalid pre')).toHaveText('Turn it up!!');
		await expect(entry.locator('.site-sample--valid pre')).toHaveText('Turn it up!');
		await expect(entry.locator('.site-meta a[href="https://genius.com/15593987"]')).toBeAttached();
		await expect(page.locator('main #voice-order')).toHaveCount(0);
		await expect(page.locator('main #unmarked-question')).toBeAttached();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	});
}

test('unmatched topic checks remain available with exact check routes', async ({ page }) => {
	await page.goto('/guidelines/non-english/');
	const additional = page.locator('.guidelines__additional');
	await expect(
		additional.getByRole('heading', { name: 'More checks for this topic' })
	).toBeAttached();
	await additional.locator('summary').first().click();
	await expect(
		additional.locator('a[href="/guidelines/checks/language-selection-mismatch/"]')
	).toBeVisible();
});

for (const width of [1440, 390, 320]) {
	test(`essentials companion fragments clear the header at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		await page.goto('/guidelines/essentials/#readability-limit');
		await expect
			.poll(async () => {
				const heading = await page.locator('#readability-limit').boundingBox();
				const header = await page.locator('.site-header').boundingBox();
				return heading && header ? heading.y - header.y - header.height : -1;
			})
			.toBeGreaterThanOrEqual(0);
	});
}

for (const width of [1440, 390]) {
	test(`common transcription questions lead to sourced answers at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 });
		for (const [question, anchor] of [
			['How do I label song sections?', 'bracketed-headers'],
			['How do I credit different singers?', 'artist-identifiers'],
			['What if I cannot hear a word?', 'unknown-marker'],
			['How do I write ad-libs?', 'include-every']
		]) {
			await page.goto('/guidelines/');
			await expect(
				page.getByRole('link', { name: 'Start with the essentials', exact: true })
			).toHaveCount(1);
			await page.getByRole('link', { name: question, exact: true }).click();
			await expect(page.locator(`#${anchor}`)).toBeInViewport();
			await expect(
				page.locator(`.guidelines__entry:has(#${anchor}) .source-citation a`).first()
			).toBeAttached();
		}
		for (const [query, anchor] of [
			['24/7', 'digit-exemptions'],
			['backing vocals', 'parenthetical-formatting']
		]) {
			await page.goto('/guidelines/');
			await page.getByRole('searchbox').fill(query);
			await page.locator(`.reference-result > a[href$="#${anchor}"]`).click();
			await expect(page.locator(`#${anchor}`)).toBeInViewport();
			await page.getByRole('link', { name: 'Back to results', exact: true }).click();
			await expect(page.getByRole('searchbox')).toHaveValue(query);
		}
	});
}

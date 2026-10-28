import { expect, test, type Page } from '@playwright/test';

async function lyrics(page: Page): Promise<string | undefined> {
	return page.locator('.cm-content').evaluate((element) => {
		const node = element as HTMLElement & {
			cmView?: { view: { state: { doc: { toString(): string } } } };
			cmTile?: { view: { state: { doc: { toString(): string } } } };
		};
		return (node.cmView ?? node.cmTile)?.view.state.doc.toString();
	});
}
async function choose(page: Page, profile: 'Genius' | 'Musixmatch') {
	await page.getByRole('button', { name: /^Lyric format:/ }).click();
	await expect(page.getByRole('button', { name: `Lyric format: ${profile}` })).toBeVisible();
}

for (const phone of [false, true]) {
	test.describe(`retained review on ${phone ? 'phone' : 'desktop'}`, () => {
		test.use({ hasTouch: phone, isMobile: phone });
		test('returns to Review and reopens the requested section', async ({ page }) => {
			await page.setViewportSize({ width: phone ? 390 : 1440, height: 900 });
			await page.goto('/workbench/');
			await page
				.getByRole('textbox', { name: 'Lyrics editor' })
				.fill('[Verse]\nUnder the moon\n\n[Chorus]\nStay beside me');
			await choose(page, 'Musixmatch');
			if (phone)
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Review/ })
					.click();
			const review = page.getByRole('button', { name: 'Review in Song' });
			await review.click();
			await expect(page.getByRole('heading', { name: /Section 1/ })).toBeFocused();
			await page.getByRole('combobox', { name: 'Choose a section' }).selectOption({
				label: await page
					.getByRole('combobox', { name: 'Choose a section' })
					.locator('option')
					.nth(2)
					.innerText()
			});
			await page.getByRole('button', { name: 'Back to Review', exact: true }).click();
			await expect(review).toBeFocused();
			await review.click();
			await expect(page.getByRole('heading', { name: /Section 1/ })).toBeFocused();
			await expect(page.getByRole('heading', { name: /Section 2/ })).toHaveCount(0);
		});
	});
}

test('preserves exact source, edited annotations, history and saved mode through real UI switches', async ({
	page
}) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await expect(editor).toBeVisible();
	const source = '[Verse: Mira]\nWe follow the [moon](123456)\n\n[Chorus]\nStay beside me';
	await editor.fill(source);
	await expect.poll(() => lyrics(page)).toBe(source);
	for (let index = 0; index < 4; index++) {
		await choose(page, 'Musixmatch');
		await expect.poll(() => lyrics(page)).toBe('We follow the moon\n\nStay beside me');
		await expect(page.getByRole('button', { name: 'Unknown lyric [?]', exact: true })).toHaveCount(
			0
		);
		await expect(page.locator('.ll-conversion-section')).toHaveCount(2);
		await choose(page, 'Genius');
		await expect.poll(() => lyrics(page)).toBe(source);
	}
	await choose(page, 'Musixmatch');
	await editor.press('Control+Home');
	await editor.press('End');
	await editor.press('Backspace');
	await expect
		.poll(() =>
			page.locator('.cm-content').evaluate((element) => {
				const node = element as HTMLElement & {
					cmTile?: { view: { state: { selection: { main: { head: number } } } } };
					cmView?: { view: { state: { selection: { main: { head: number } } } } };
				};
				return (node.cmView ?? node.cmTile)?.view.state.selection.main.head;
			})
		)
		.toBe(17);
	await editor.press('Control+z');
	await editor.press('End');
	await editor.press('Control+Shift+ArrowLeft');
	await page.evaluate(() => navigator.clipboard.writeText('stars'));
	await editor.press('Control+v');
	await choose(page, 'Genius');
	await expect.poll(() => lyrics(page)).toBe(source.replace('[moon]', '[stars]'));
	await choose(page, 'Musixmatch');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/ })).toBeAttached();
	await page.reload();
	await expect(page.getByRole('button', { name: 'Lyric format: Musixmatch' })).toBeVisible();
	await expect.poll(() => lyrics(page)).toBe('We follow the stars\n\nStay beside me');
	await choose(page, 'Genius');
	await expect.poll(() => lyrics(page)).toBe(source.replace('[moon]', '[stars]'));
});

test.describe('touch controls', () => {
	test.use({ hasTouch: true, isMobile: true });
	test('keeps format controls fixed and section details reachable at phone width', async ({
		page
	}) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.goto('/workbench/');
		const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
		await editor.fill('[Verse]\nمرحبا بالعالم\n\n[Chorus]\n同じ言葉');
		const control = page.getByRole('button', { name: /^Lyric format:/ });
		await expect(control).toHaveAccessibleDescription(/Switch to Musixmatch/);
		const before = await control.boundingBox();
		const copyBefore = await page
			.getByRole('button', { name: 'Copy lyrics', exact: true })
			.boundingBox();
		await control.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('menu')).toHaveCount(0);
		await expect(control).toHaveAttribute('aria-label', 'Lyric format: Musixmatch');
		await expect(control).toBeFocused();
		const after = await control.boundingBox();
		const copyAfter = await page
			.getByRole('button', { name: 'Copy lyrics', exact: true })
			.boundingBox();
		await expect(control).toHaveAccessibleDescription(/Switch to Genius/);
		expect(after?.width).toBe(before?.width);
		expect(after?.x).toBe(before?.x);
		expect(after?.y).toBe(before?.y);
		expect(copyAfter?.x).toBe(copyBefore?.x);
		expect(copyAfter?.y).toBe(copyBefore?.y);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
		await page.locator('.ll-conversion-section').first().click();
		await expect(page.getByRole('heading', { name: /Section 1/ })).toBeVisible();
		await expect(control).toBeVisible();
		await page.getByRole('button', { name: 'Show passage', exact: true }).first().click();
		await expect(editor).toBeVisible();
		await expect(control).toBeVisible();
		// Clearing lives with the document it clears, in Song, rather than in the
		// header: quiet until pressed, confirming in place.
		await page
			.getByRole('navigation', { name: 'Workbench views' })
			.getByRole('button', {
				name: 'Tools',
				exact: true
			})
			.tap();
		await page.getByRole('tab', { name: 'Song', exact: true }).tap();
		await page.getByText('Clear this transcription', { exact: true }).click();
		const clear = page.getByRole('button', {
			name: 'Clear lyrics and retained details…',
			exact: true
		});
		await clear.scrollIntoViewIfNeeded();
		const clearBox = await clear.boundingBox();
		expect(clearBox!.x).toBeGreaterThanOrEqual(0);
		expect(clearBox!.x + clearBox!.width).toBeLessThanOrEqual(360);
		await clear.tap();
		await expect(
			page.getByRole('button', { name: 'Delete lyrics and details', exact: true })
		).toBeVisible();
		await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
		await expect(
			page.getByRole('button', { name: 'Delete lyrics and details', exact: true })
		).not.toBeVisible();
		await expect.poll(() => lyrics(page)).toBe('مرحبا بالعالم\n\n同じ言葉');
	});
});

test('opens the exact listening decision from a diagnostic, previews it, and retains the source form', async ({
	page
}) => {
	await page.goto('/workbench/');
	const source = '[Verse]\nI saw 2 stars';
	await page.getByRole('textbox', { name: 'Lyrics editor' }).fill(source);
	await choose(page, 'Musixmatch');
	await page.getByRole('button', { name: 'Review quantity', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Review quantity' })).toBeFocused();
	await page.getByLabel('Exact whole-number value', { exact: true }).fill('2');
	await page
		.getByRole('combobox', { name: 'Meaning', exact: true })
		.selectOption('ordinary-cardinal');
	await page
		.getByRole('combobox', { name: 'Reading on the recording', exact: true })
		.selectOption('whole-quantity');
	await page.getByRole('button', { name: 'Preview quantity', exact: true }).click();
	await expect(page.getByText('Proposed Musixmatch wording: two', { exact: true })).toBeVisible();
	await expect.poll(() => lyrics(page)).toBe('I saw 2 stars');
	await page.getByRole('button', { name: 'Save quantity decision', exact: true }).click();
	await expect.poll(() => lyrics(page)).toBe('I saw two stars');
	await choose(page, 'Genius');
	await expect.poll(() => lyrics(page)).toBe(source);
	await choose(page, 'Musixmatch');
	await expect.poll(() => lyrics(page)).toBe('I saw two stars');
});

test('reopens a rich draft and switches both formats entirely offline', async ({
	page,
	context
}) => {
	await page.goto('/workbench/');
	const source = '[Verse: Mira]\nUnder the [moon](123)';
	await page.getByRole('textbox', { name: 'Lyrics editor' }).fill(source);
	await choose(page, 'Musixmatch');
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);
	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('button', { name: 'Lyric format: Musixmatch' })).toBeVisible();
	await expect.poll(() => lyrics(page)).toBe('Under the moon');
	await choose(page, 'Genius');
	await expect.poll(() => lyrics(page)).toBe(source);
	await choose(page, 'Musixmatch');
	await page.locator('.ll-conversion-section').click();
	await expect(page.getByRole('heading', { name: /Section 1/u })).toBeVisible();
	await context.setOffline(false);
});

for (const phone of [false, true]) {
	test.describe(`focused task ${phone ? 'phone' : 'desktop'}`, () => {
		test.use({ hasTouch: phone, isMobile: phone });
		test(`replaces the chosen chorus entirely within Review on ${phone ? 'phone' : 'desktop'}`, async ({
			page
		}) => {
			await page.setViewportSize({ width: phone ? 390 : 1440, height: 900 });
			await page.goto('/workbench/');
			const source =
				'[Verse: Mira]\nI found your [silver compass](123456)\nWith 2 old tickets and a folded map\n\n[Chorus: Mira & Noor]\nWe are the neon after rain\nTake my hand and say my name\n\n[Bridge: Noor]\nI said **** and never once looked back\n\n[Chorus: Mira & Noor]\nWe are the neon after rain\nTake my hand and call my name\n\n[Outro: Noor]\nStay with me\nRepeat chorus';
			await page.getByRole('textbox', { name: 'Lyrics editor' }).fill(source);
			await choose(page, 'Musixmatch');
			if (phone)
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Review/ })
					.click();
			if (phone)
				await page
					.getByRole('button', {
						name: 'Go to Write the repeated lyrics instead of this placeholder.'
					})
					.click();
			await page.getByRole('button', { name: 'Review repeated passage', exact: true }).click();
			const task = page.getByRole('region', { name: 'Conversion task' });
			await expect(task.getByRole('heading', { name: 'Replace repeat placeholder' })).toBeFocused();
			await expect(task.getByRole('button', { name: 'Back to Review' })).toBeInViewport();
			for (const name of [
				'Document settings',
				'Retained details',
				'Wording and retained annotations',
				'Selected passage',
				'Decisions that need listening'
			])
				await expect(task.getByText(name, { exact: true })).toHaveCount(0);
			await expect(task.getByLabel('Earlier source section')).toBeInViewport();
			const before = await lyrics(page);
			const options = task.getByLabel('Earlier source section').locator('option');
			const option = options.filter({ hasText: 'Take my hand and say my name' });
			const id = await option.getAttribute('value');
			expect(id).toBeTruthy();
			await task.getByLabel('Earlier source section').selectOption(id!);
			await task.getByLabel('Copies to insert here').fill('1');
			await task.getByRole('button', { name: 'Preview replacement' }).click();
			await expect(task.getByLabel('Replacement preview')).toHaveText(
				'We are the neon after rain\nTake my hand and say my name'
			);
			expect(await lyrics(page)).toBe(before);
			for (const scheme of ['dark', 'light'] as const) {
				await page.emulateMedia({ colorScheme: scheme });
				await page.screenshot({
					path: `.audit/focused-review/repeat-${phone ? 'phone' : 'desktop'}-${scheme}.png`
				});
			}
			await task.getByRole('button', { name: 'Apply replacement' }).click();
			const expected = before!.replace(
				'Repeat chorus',
				'We are the neon after rain\nTake my hand and say my name'
			);
			await expect.poll(() => lyrics(page)).toBe(expected);
			await expect(
				page.locator(
					'.diagnostic-list__navigate:focus, #mobile-review-control:focus, #linter-panel-tab:focus'
				)
			).toHaveCount(1);
			if (phone)
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Write/ })
					.click();
			if (phone) await page.getByRole('button', { name: 'Document', exact: true }).click();
			await page
				.locator('.document-toolbar')
				.getByRole('button', { name: 'Undo', exact: true })
				.click();
			await expect.poll(() => lyrics(page)).toBe(before);
			await choose(page, 'Genius');
			await expect.poll(() => lyrics(page)).toBe(source);
			await choose(page, 'Musixmatch');
			await expect.poll(() => lyrics(page)).toBe(before);
			await expect(
				page.getByRole('img', { name: /^Autosave status: Saved locally/u })
			).toBeAttached();
			await page.reload();
			await expect.poll(() => lyrics(page)).toBe(before);
		});
	});
}

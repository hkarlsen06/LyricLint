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
	await page.getByRole('button', { name: `Lyric format: ${profile}` }).click();
	await expect(page.getByRole('button', { name: `Lyric format: ${profile}` })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
}

test('confirms a masked word in Musixmatch while retaining the exact Genius source', async ({
	page
}) => {
	await page.goto('/workbench/');
	const source = '[Verse: Mira]\nI said [****](123456) tonight';
	await page.getByRole('textbox', { name: 'Lyrics editor' }).fill(source);
	await choose(page, 'Musixmatch');
	await page.getByRole('button', { name: 'Review censored word', exact: true }).click();
	await expect(
		page.getByRole('button', { name: 'Preview replacement', exact: true })
	).toBeDisabled();
	await page.getByRole('textbox', { name: 'Audible prefix (if any)', exact: true }).fill('f');
	await page.getByRole('checkbox', { name: /^I listened: this word is censored right/u }).check();
	await page.getByRole('button', { name: 'Preview replacement', exact: true }).click();
	const comparison = page.getByLabel('Replacement preview');
	await expect(comparison.locator('del')).toHaveText('****');
	await expect(comparison.locator('ins')).toHaveText('f-');
	await expect(comparison).toHaveText('I said ****f- tonight');
	await page.getByRole('button', { name: 'Apply replacement', exact: true }).click();
	await expect.poll(() => lyrics(page)).toBe('I said f- tonight');
	const toolbar = page.locator('.document-toolbar');
	await toolbar.getByRole('button', { name: 'Undo', exact: true }).click();
	await expect.poll(() => lyrics(page)).toBe('I said **** tonight');
	await toolbar.getByRole('button', { name: 'Redo', exact: true }).click();
	await expect.poll(() => lyrics(page)).toBe('I said f- tonight');
	await choose(page, 'Genius');
	await expect.poll(() => lyrics(page)).toBe(source);
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await page.reload();
	await expect.poll(() => lyrics(page)).toBe(source);
	await choose(page, 'Musixmatch');
	await expect.poll(() => lyrics(page)).toBe('I said f- tonight');
});

test('keeps annotation spacing exact after typing over a selection across its hidden boundary', async ({
	page
}) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	const source =
		'[Verse 1: Mira]\ni found your [silver compass](123456) by the door\nBut every road kept turning black';
	await editor.fill(source);
	await choose(page, 'Musixmatch');
	await editor.evaluate((element) => {
		const node = element as HTMLElement & {
			cmView?: { view: import('@codemirror/view').EditorView };
			cmTile?: { view: import('@codemirror/view').EditorView };
		};
		const view = (node.cmView ?? node.cmTile)!.view;
		const from = view.state.doc.toString().indexOf('compass by');
		view.dispatch({ selection: { anchor: from + 'compass by'.length, head: from } });
		view.focus();
	});
	await page.keyboard.insertText('by');
	const plain = 'i found your silver by the door\nBut every road kept turning black';
	await expect.poll(() => lyrics(page)).toBe(plain);
	await choose(page, 'Genius');
	const expected = source.replace('[silver compass](123456) by', '[silver](123456) by');
	await expect.poll(() => lyrics(page)).toBe(expected);
	await page.getByRole('button', { name: 'Copy lyrics', exact: true }).click();
	await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
	await expect(page.getByRole('img', { name: /^Autosave status: Saved locally/u })).toBeAttached();
	await page.reload();
	await expect.poll(() => lyrics(page)).toBe(expected);
	await choose(page, 'Musixmatch');
	await expect.poll(() => lyrics(page)).toBe(plain);
});

for (const width of [1440, 390, 360]) {
	test.describe(`focused retained type at ${width}`, () => {
		test.use({ hasTouch: width < 600, isMobile: width < 600 });
		test('saves in Review with stable geometry, keyboard, Undo and reload', async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			if (width < 600)
				expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
			await page.goto('/workbench/');
			const source =
				'[Custom opening: Mira]\n[The extraordinarily long returning section for the final refrain: Noor]\nStay beside me';
			const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
			await editor.fill(source);
			await choose(page, 'Musixmatch');
			const plain = await lyrics(page);
			if (width < 600)
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Review/ })
					.click();
			const region = page.getByRole('region', { name: 'Retained details needing review' });
			const select = region.getByRole('combobox', { name: 'Musixmatch section type' });
			const save = region.getByRole('button', { name: 'Save section type' });
			const next = region.getByRole('button', { name: 'Next detail' });
			const before = {
				select: await select.boundingBox(),
				save: await save.boundingBox(),
				next: await next.boundingBox()
			};
			await select.focus();
			await select.press('ArrowDown');
			await select.press('Enter');
			await expect(region.getByRole('heading')).toHaveText('Retained details (2)');
			await expect.poll(() => lyrics(page)).toBe(plain);
			await next.click();
			await expect(select).toHaveValue('');
			expect(await select.boundingBox()).toEqual(before.select);
			expect(await save.boundingBox()).toEqual(before.save);
			expect(await next.boundingBox()).toEqual(before.next);
			await page.screenshot({ path: `.audit/retained-section-type-${width}.png`, fullPage: true });
			const box = await select.boundingBox();
			expect(box!.height).toBeGreaterThanOrEqual(44);
			expect(box!.x + box!.width).toBeLessThanOrEqual(width);
			expect(
				await select.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
			).toBeGreaterThanOrEqual(16);
			await select.selectOption('Chorus');
			await select.press('Tab');
			await expect(save).toBeFocused();
			await save.press('Enter');
			await expect(region.getByRole('heading')).toHaveText('Retained details (1)');
			await expect(region.getByRole('heading')).toBeFocused();
			await expect(region.locator('[aria-live="polite"]')).toContainText('no visible lyrics');
			await expect.poll(() => lyrics(page)).toBe(plain);
			if (width < 600) {
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Write/ })
					.click();
				await page.getByRole('button', { name: 'Document', exact: true }).click();
			}
			await page
				.locator('.document-toolbar')
				.getByRole('button', { name: 'Undo', exact: true })
				.click();
			if (width < 600)
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Review/ })
					.click();
			await expect(region.getByRole('heading')).toHaveText('Retained details (2)');
			await select.selectOption('Verse');
			await save.click();
			await select.selectOption('Chorus');
			await save.click();
			await expect(region.getByRole('heading')).toHaveText('Retained details (0)');
			await expect(region.getByRole('heading')).toBeFocused();
			await expect(page.getByRole('button', { name: 'Review in Song' })).toHaveCount(0);
			await expect(
				page.getByRole('img', { name: /^Autosave status: Saved locally/ })
			).toBeAttached();
			await page.reload();
			await expect(page.getByRole('button', { name: 'Lyric format: Musixmatch' })).toHaveAttribute(
				'aria-pressed',
				'true'
			);
			await choose(page, 'Genius');
			await expect.poll(() => lyrics(page)).toBe(source);
			await choose(page, 'Musixmatch');
			if (width < 600)
				await page
					.getByRole('navigation', { name: 'Workbench views' })
					.getByRole('button', { name: /Review/ })
					.click();
			await expect(select).toHaveCount(0);
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
	await expect(page.getByRole('button', { name: 'Lyric format: Musixmatch' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
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
		const control = page.getByRole('button', { name: 'Lyric format: Musixmatch' });
		await expect(control).toHaveAttribute('aria-pressed', 'false');
		const before = await control.boundingBox();
		const copyBefore = await page
			.getByRole('button', { name: 'Copy lyrics', exact: true })
			.boundingBox();
		await control.focus();
		await page.keyboard.press('Enter');
		await expect(page.getByRole('menu')).toHaveCount(0);
		await expect(control).toHaveAttribute('aria-pressed', 'true');
		await expect(control).toBeFocused();
		const after = await control.boundingBox();
		const copyAfter = await page
			.getByRole('button', { name: 'Copy lyrics', exact: true })
			.boundingBox();
		await expect(control).toHaveAttribute('aria-pressed', 'true');
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
		await expect(page.getByRole('button', { name: 'Show passage', exact: true })).toHaveCount(0);
		await page.getByRole('button', { name: 'Back to Song', exact: true }).tap();
		const tools = page.getByText('Advanced tools', { exact: true });
		await expect(tools).toBeFocused();
		await expect(page.locator('.song-panel__advanced')).not.toHaveAttribute('open', '');
		await expect(page.getByRole('combobox', { name: 'Choose a section' })).toHaveCount(0);
		await page
			.getByRole('navigation', { name: 'Workbench views' })
			.getByRole('button', { name: 'Write', exact: true })
			.tap();
		await expect(editor).toBeVisible();
		await expect(control).toBeVisible();
		await expect.poll(() => lyrics(page)).toBe('مرحبا بالعالم\n\n同じ言葉');
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
	await expect(page.getByLabel('Exact whole-number value', { exact: true })).toHaveCount(0);
	await expect(page.getByRole('combobox', { name: 'How is it sung?', exact: true })).toHaveCount(0);
	await page
		.getByRole('combobox', { name: 'How is this number used?', exact: true })
		.selectOption('ordinary-cardinal');
	await page
		.getByRole('combobox', { name: 'How is it sung?', exact: true })
		.selectOption('whole-quantity');
	await expect(page.getByLabel('Exact words as sung (required)', { exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Preview quantity', exact: true }).click();
	await expect(page.getByLabel('Replacement preview')).toHaveText('I saw two stars');
	await expect.poll(() => lyrics(page)).toBe('I saw 2 stars');
	await page.getByRole('button', { name: 'Apply quantity', exact: true }).click();
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
	await expect(page.getByRole('button', { name: 'Lyric format: Musixmatch' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
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
			await expect(task.getByRole('button', { name: /^Earlier source section/ })).toBeInViewport();
			const before = await lyrics(page);
			await task.getByRole('button', { name: /^Earlier source section/ }).click();
			const chooser = page.getByRole('dialog', { name: 'Earlier source section', exact: true });
			await expect(
				chooser.getByRole('button', { name: /Take my hand and call my name/ })
			).toBeVisible();
			await chooser.getByRole('button', { name: /Take my hand and say my name/ }).click();
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

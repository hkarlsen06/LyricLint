import { expect, test } from '@playwright/test';

for (const [width, colorScheme] of [
	[1440, 'dark'],
	[320, 'dark'],
	[360, 'dark'],
	[390, 'light']
] as const) {
	test.describe(`format controls ${width}`, () => {
		test.use({
			viewport: { width, height: 900 },
			hasTouch: width < 600,
			isMobile: width < 600,
			colorScheme
		});
		test('selects explicit formats with stable controls and preserves native history', async ({
			page
		}) => {
			await page.goto('/workbench/');
			const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
			const title = page.getByRole('textbox', { name: "'Scribe title", exact: true });
			await title.fill(
				'A very long document title that should truncate while both format names stay readable'
			);
			await title.press('Enter');
			const genius = page.getByRole('button', { name: 'Lyric format: Genius' });
			const musixmatch = page.getByRole('button', { name: 'Lyric format: Musixmatch' });
			const state = () =>
				editor.evaluate((el) => {
					const node = el as HTMLElement & {
						cmView?: { view: import('@codemirror/view').EditorView };
						cmTile?: { view: import('@codemirror/view').EditorView };
					};
					const view = (node.cmView ?? node.cmTile)!.view;
					return { text: view.state.doc.toString(), selection: view.state.selection.toJSON() };
				});
			for (const source of ['[Verse]\nSilver moon tonight', 'Silver moon tonight']) {
				await editor.fill(source);
				await editor.press('Control+End');
				await editor.press('ArrowLeft');
				await editor.press('Shift+ArrowRight');
				const original = await state();
				const copy = page.getByRole('button', { name: 'Copy lyrics', exact: true });
				const bounds = await Promise.all([genius, musixmatch, copy].map((el) => el.boundingBox()));
				await expect(genius).toHaveAttribute('aria-pressed', 'true');
				await musixmatch.focus();
				await page.keyboard.press('Enter');
				await expect(musixmatch).toHaveAttribute('aria-pressed', 'true');
				await expect(genius).toHaveAttribute('aria-pressed', 'false');
				await expect(musixmatch).toBeFocused();
				await expect.poll(async () => (await state()).text).toBe('Silver moon tonight');
				if (source.startsWith('['))
					await page.screenshot({
						path: `.audit/hillclimb/format-musixmatch-${width}-${colorScheme}.png`
					});
				await genius.focus();
				await page.keyboard.press('Space');
				await expect(genius).toHaveAttribute('aria-pressed', 'true');
				await expect(genius).toBeFocused();
				expect(await state()).toEqual(original);
				expect(await Promise.all([genius, musixmatch, copy].map((el) => el.boundingBox()))).toEqual(
					bounds
				);
				await genius.click();
				expect(await state()).toEqual(original);
				for (const control of [genius, musixmatch, copy]) {
					const box = (await control.boundingBox())!;
					expect(box.x).toBeGreaterThanOrEqual(0);
					expect(box.x + box.width).toBeLessThanOrEqual(width);
					expect(await control.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
				}
				if (source.startsWith('[')) {
					if (width < 600)
						await page.getByRole('button', { name: 'Document', exact: true }).click();
					await page.getByRole('button', { name: 'Undo', exact: true }).click();
					await expect(musixmatch).toHaveAttribute('aria-pressed', 'true');
					await page.getByRole('button', { name: 'Redo', exact: true }).click();
					await expect(genius).toHaveAttribute('aria-pressed', 'true');
					expect(await state()).toEqual(original);
					if (width < 600) await page.keyboard.press('Escape');
				}
			}
			if (width < 600) {
				expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
				const trigger = page.getByRole('button', { name: 'Document', exact: true });
				const box = (await trigger.boundingBox())!;
				expect(box.y).toBeLessThan((await genius.boundingBox())!.y);
				await trigger.click();
				const menu = page.locator('#document-commands');
				await expect(menu).toBeVisible();
				expect((await menu.boundingBox())!.y).toBe(box.y + box.height);
				await page.screenshot({ path: `.audit/hillclimb/format-menu-${width}-${colorScheme}.png` });
				await page.keyboard.press('Escape');
				await expect(trigger).toBeFocused();
				await trigger.click();
				await trigger.click();
				await expect(menu).toBeHidden();
				await trigger.click();
				await genius.click();
				await expect(menu).toBeHidden();
			}
			await page.screenshot({ path: `.audit/hillclimb/format-${width}-${colorScheme}.png` });
		});
	});
}

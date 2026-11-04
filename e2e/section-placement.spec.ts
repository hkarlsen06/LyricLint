import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
	test.describe(`retained placement at ${width}`, () => {
		test.use({ viewport: { width, height: 900 }, hasTouch: width < 600, isMobile: width < 600 });
		for (const [source, from, to, insert, genius] of [
			['[Verse]\nOne\n[Instrumental]', 0, 4, 'My new song', '[Verse]\nMy new song'],
			['[Verse]\nOne\n[Chorus]\nTwo', 1, 5, 'by', '[Verse]\nObywo']
		] as const) {
			test(`keeps words and explicitly repairs ${insert}`, async ({ page }) => {
				await page.goto('/workbench/');
				const editor = page.getByRole('textbox', { name: 'Lyrics editor', includeHidden: true });
				const lyrics = () =>
					editor.evaluate((el) => {
						const node = el as HTMLElement & {
							cmView?: { view: import('@codemirror/view').EditorView };
							cmTile?: { view: import('@codemirror/view').EditorView };
						};
						return (node.cmView ?? node.cmTile)!.view.state.doc.toString();
					});
				const choose = async (name: 'Genius' | 'Musixmatch') => {
					const option = page.getByRole('button', { name: `Lyric format: ${name}` });
					await option.click();
					await expect(option).toHaveAttribute('aria-pressed', 'true');
				};
				await editor.fill(source);
				await choose('Musixmatch');
				const before = await lyrics();
				await editor.evaluate(
					(el, { from, to }) => {
						const node = el as HTMLElement & {
							cmView?: { view: import('@codemirror/view').EditorView };
							cmTile?: { view: import('@codemirror/view').EditorView };
						};
						const v = (node.cmView ?? node.cmTile)!.view;
						v.dispatch({ selection: { anchor: from, head: to } });
						v.focus();
					},
					{ from, to }
				);
				await page.keyboard.insertText(insert);
				const authored = before.slice(0, from) + insert + before.slice(to);
				await expect.poll(lyrics).toBe(authored);
				await page.keyboard.press('Control+z');
				await expect.poll(lyrics).toBe(before);
				await page.keyboard.press('Control+y');
				await expect.poll(lyrics).toBe(authored);
				await choose('Genius');
				await expect.poll(lyrics).toBe(genius);
				await expect(
					page.getByRole('img', { name: /^Autosave status: Saved locally/ })
				).toBeAttached();
				await page.reload();
				await expect.poll(lyrics).toBe(genius);
				// Choose the document start explicitly before opening the retained metadata task.
				await editor.focus();
				await page.keyboard.press('Control+Home');
				if (width < 600)
					await page
						.getByRole('navigation', { name: 'Workbench views' })
						.getByRole('button', { name: /Review/ })
						.click();
				const retained = page.getByRole('region', { name: 'Retained details needing review' });
				await expect(retained.locator('[aria-live="polite"]')).toContainText('Place the retained');
				await retained.getByRole('button', { name: 'Review in Song' }).click();
				await expect(page.locator('h3[data-section-id]')).toBeFocused();
				const move = page.getByRole('button', { name: 'Move to cursor', exact: true });
				await expect(move).toBeVisible();
				await expect(move).toBeEnabled();
				const beforeBox = await move.boundingBox();
				if (width < 600) {
					expect(beforeBox!.height).toBeGreaterThanOrEqual(44);
					expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
				}
				await page.screenshot({
					path: `.audit/hillclimb/repair-${width}-${from}.png`,
					fullPage: true
				});
				await move.click();
				await expect
					.poll(lyrics)
					.toContain(source.includes('Instrumental') ? '[Instrumental]' : '[Chorus]');
				await expect(move).toBeFocused();
				expect(await move.boundingBox()).toEqual(beforeBox);
				if (width < 600)
					await page
						.getByRole('navigation', { name: 'Workbench views' })
						.getByRole('button', { name: /Write/ })
						.click();
				await editor.focus();
				await page.keyboard.press('Control+z');
				await expect.poll(lyrics).toBe(genius);
				await page.keyboard.press('Control+y');
				await expect
					.poll(lyrics)
					.toContain(source.includes('Instrumental') ? '[Instrumental]' : '[Chorus]');
				await choose('Musixmatch');
				await expect.poll(lyrics).toBe(authored);
				await page.screenshot({
					path: `.audit/hillclimb/after-${width}-${from}.png`,
					fullPage: true
				});
			});
		}
	});
}

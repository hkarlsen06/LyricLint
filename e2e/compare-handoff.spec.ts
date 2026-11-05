import { expect, test } from '@playwright/test';

for (const { width, profile, origin } of [
	{ width: 360, profile: 'Genius', origin: 'Review' },
	{ width: 390, profile: 'Musixmatch', origin: 'Tools' }
]) {
	test.describe(`Compare return at ${width}px in ${profile}`, () => {
		test.use({ viewport: { width, height: 844 }, hasTouch: true, isMobile: true });
		test(`reveals Write from ${origin} and retires Document commands`, async ({ page }) => {
			await page.goto('/workbench/');
			const source = '[Verse: Mira]\nSilver compass';
			const editor = page.getByRole('textbox', { name: 'Lyrics editor', exact: true });
			await editor.fill(source);
			const format = page.getByRole('button', { name: `Lyric format: ${profile}`, exact: true });
			await format.tap();
			await expect(format).toHaveAttribute('aria-pressed', 'true');
			const navigation = page.getByRole('navigation', { name: 'Workbench views' });
			await navigation.getByRole('button', { name: new RegExp(`^${origin}`) }).tap();
			await expect(editor).not.toBeVisible();
			const documentControl = page.getByRole('button', { name: 'Document', exact: true });
			await documentControl.tap();
			await page.getByRole('button', { name: 'Compare', exact: true }).tap();
			const dialog = page.getByRole('dialog', { name: /^Compare with/ });
			await dialog
				.getByRole('textbox', { name: 'The lyrics as the page has them' })
				.fill('[Verse: Mira]\nLunar compass');
			await dialog.getByRole('button', { name: 'Show changes' }).tap();
			await dialog.locator('.compare-diff__row:has(ins)').tap();
			const write = navigation.getByRole('button', { name: 'Write', exact: true });
			await expect(write).toHaveAttribute('aria-pressed', 'true');
			await expect(write).toBeFocused();
			await expect(editor).toBeVisible();
			await expect(editor).toContainText('Silver compass');
			await expect(format).toHaveAttribute('aria-pressed', 'true');
			await expect(documentControl).toHaveAttribute('aria-expanded', 'false');

			for (const dismissal of ['Escape', 'Close', 'outside', 'Cancel then Escape']) {
				await documentControl.tap();
				await page.getByRole('button', { name: 'Compare', exact: true }).tap();
				await expect(dialog).toBeVisible();
				if (dismissal === 'Cancel then Escape') {
					await dialog.getByRole('button', { name: 'Change baseline' }).tap();
					await dialog.getByRole('button', { name: 'Cancel', exact: true }).tap();
					await expect(dialog.getByRole('button', { name: 'Change baseline' })).toBeFocused();
					await page.keyboard.press('Escape');
				} else if (dismissal === 'Escape') await page.keyboard.press('Escape');
				else if (dismissal === 'Close') await dialog.getByRole('button', { name: 'Close' }).tap();
				else await page.touchscreen.tap(1, 1);
				await expect(dialog).not.toBeVisible();
				await expect(page.locator('dialog:modal')).toHaveCount(0);
				await expect(documentControl).toHaveAttribute('aria-expanded', 'false');
				await expect(documentControl).toBeFocused();
				await documentControl.tap();
				await expect(documentControl).toHaveAttribute('aria-expanded', 'true');
				await documentControl.tap();
			}
		});
	});
}

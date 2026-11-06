import { expect, test } from '@playwright/test';

for (const width of [1280, 360, 390]) {
	test.describe(`search exit at ${width}`, () => {
		test.use({
			viewport: { width, height: 900 },
			hasTouch: width < 600,
			isMobile: width < 600,
			colorScheme: width === 360 ? 'dark' : 'light',
			reducedMotion: 'reduce'
		});

		test('returns focus to the visible Find exit after the last replacements remove their control', async ({
			page
		}) => {
			await page.goto('/workbench/');
			const editor = page.getByRole('textbox', { name: 'Lyrics editor', exact: true });
			await editor.click();
			await page.keyboard.type('Echo one Echo two');
			const find = page.getByRole('button', { name: 'Find and replace', exact: true });
			await find.click();
			await page.getByRole('textbox', { name: 'Find', exact: true }).fill('Echo');
			await page.getByRole('textbox', { name: 'Replace with', exact: true }).fill('Song');
			await page.getByRole('button', { name: 'Replace all 2', exact: true }).click();
			await expect(page.getByRole('button', { name: /^Replace all /u })).toBeHidden();
			await find.click();
			await expect(page.getByRole('textbox', { name: 'Find', exact: true })).toBeHidden();
			await expect(find).toBeFocused();
			await expect(find).toHaveAttribute('aria-pressed', 'false');
			await expect(editor.locator('.cm-line')).toHaveText('Song one Song two');

			// The same visible control still opens Find, and Escape returns to typing.
			await page.keyboard.press('Enter');
			await expect(page.getByRole('textbox', { name: 'Find', exact: true })).toBeFocused();
			await page.keyboard.press('Escape');
			await expect(editor).toBeFocused();
			await page.keyboard.type('!');
			await expect(editor.locator('.cm-line')).toHaveText('Song one Song two!');
		});
	});
}

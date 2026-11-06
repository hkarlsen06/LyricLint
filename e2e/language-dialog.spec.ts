import { expect, test } from '@playwright/test';

test.use({
	viewport: { width: 390, height: 844 },
	hasTouch: true,
	isMobile: true,
	reducedMotion: 'reduce'
});

test('phone language controls regain focus after native option Escape', async ({ page }) => {
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor', exact: true });
	await expect(editor).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Workbench views' })).toBeVisible();
	await expect(page.locator('.boot-screen')).not.toBeVisible();
	await editor.fill('Bonjour moon');
	const documentTrigger = page.getByRole('button', { name: 'Document', exact: true });
	await documentTrigger.tap();
	const language = page.locator('.document-toolbar').getByRole('button', {
		name: /^Document language:/u
	});
	await language.tap();
	const dialog = page.getByRole('dialog', { name: 'Document language', exact: true });
	await dialog.getByText('Custom language code', { exact: true }).tap();
	await dialog.getByRole('textbox', { name: 'Language code', exact: true }).fill('fr-CA');
	await dialog.getByRole('button', { name: 'Use custom code', exact: true }).tap();
	await expect(dialog).not.toBeVisible();
	await page.keyboard.press('Escape');
	await expect(documentTrigger).toHaveAttribute('aria-expanded', 'false');
	await editor.tap();
	await documentTrigger.tap();
	await language.tap();
	await dialog.getByRole('searchbox').press('ArrowDown');
	await expect(dialog.locator('.language-option').first()).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).not.toBeVisible();
	await expect(language).toBeFocused();
	await expect(documentTrigger).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Escape');
	await expect(documentTrigger).toBeFocused();
	await editor.tap();
	await page.keyboard.press('ControlOrMeta+a');
	await documentTrigger.tap();
	const selection = page.getByRole('button', { name: 'Selection language: French', exact: true });
	await selection.tap();
	const passage = page.getByRole('dialog', { name: 'Selected passage language', exact: true });
	await passage.getByRole('searchbox').press('ArrowDown');
	await expect(passage.locator('.language-option').first()).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(passage).not.toBeVisible();
	await expect(selection).toBeFocused();
	await expect(documentTrigger).toHaveAttribute('aria-expanded', 'true');
	await page.keyboard.press('Escape');
	await expect(documentTrigger).toHaveAttribute('aria-expanded', 'false');
	await expect(documentTrigger).toBeFocused();
});

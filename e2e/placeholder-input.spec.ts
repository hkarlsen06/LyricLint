import { expect, test, type Page } from '@playwright/test';

async function text(page: Page) {
	return page.locator('.cm-content').evaluate((element) => {
		const node = element as HTMLElement & {
			cmTile?: { view: import('@codemirror/view').EditorView };
		};
		return node.cmTile?.view.state.doc.toString();
	});
}

const passage =
	'[Verse: Mira]\nThe [silver compass](123456) by the door\nHéllo 🌙 and café\nOther words stay exact\n\n[Chorus: Noor]\nHold the light\n\n[Chorus 2: Noor]\nHold the light';

for (const width of [360, 390, 1280]) {
	test.describe(`empty placeholder input at ${width}`, () => {
		test.use({
			viewport: { width, height: 900 },
			hasTouch: width < 600,
			isMobile: width < 600,
			reducedMotion: 'reduce'
		});

		test('preserves native multiline insertion and intentional terminal breaks', async ({
			page
		}) => {
			await page.goto('/workbench/');
			const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
			await expect(editor).toBeVisible();
			for (let trial = 0; trial < 12; trial++) {
				const documentMenu = page.getByRole('button', { name: 'Document', exact: true });
				if (await documentMenu.isVisible()) await documentMenu.click();
				await page.getByRole('button', { name: "New 'scribe", exact: true }).click();
				if (await documentMenu.isVisible()) await page.keyboard.press('Escape');
				const write = page.getByRole('button', { name: 'Write', exact: true });
				if (await write.isVisible()) await write.click();
				await page.getByRole('button', { name: 'Lyric format: Genius', exact: true }).click();
				await expect.poll(() => text(page)).toBe('');
				await expect(page.locator('.ll-placeholder-line')).toHaveCount(4);
				if (width < 600) await editor.tap();
				else await editor.click();
				const expected = passage + '\n'.repeat(trial % 3);
				// Exercise Chromium's editing engine without injecting a model change.
				// Bulk browser insertion is a regression probe, not a mobile IME proof.
				await page.keyboard.insertText(expected);
				await expect.poll(() => text(page)).toBe(expected);
			}
		});
	});
}

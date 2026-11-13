import { readFile } from 'node:fs/promises';
import { expect, test, type Locator } from '@playwright/test';
import { enableMusixmatchTools } from './format-fixture.js';

async function documentText(editor: Locator): Promise<string> {
	return editor.evaluate((element) => {
		const node = element as HTMLElement & {
			cmView?: { view: import('@codemirror/view').EditorView };
			cmTile?: { view: import('@codemirror/view').EditorView };
		};
		return (node.cmView ?? node.cmTile)!.view.state.doc.toString();
	});
}

interface PreparedExport {
	editor: Locator;
	source: string;
	opener: Locator;
	output: Locator;
	edited: string;
	other: 'Genius' | 'Musixmatch';
}

for (const width of [1280, 360, 390]) {
	test.describe(`independent output ${width}`, () => {
		test.use({
			viewport: { width, height: width === 360 ? 580 : 800 },
			hasTouch: width < 500,
			isMobile: width < 500
		});
		for (const primary of ['Genius', 'Musixmatch'] as const) {
			const prepared = test.extend<{ preparedExport: PreparedExport }>({
				preparedExport: [
					async ({ page, browserName }, use, testInfo) => {
						await page.goto('/workbench/');
						await enableMusixmatchTools(page);
						const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
						await expect(editor).toBeVisible();
						await page
							.getByRole('button', { name: `Lyric format: ${primary}`, exact: true })
							.click();
						const source =
							primary === 'Genius'
								? '[Verse]\nWith 2 old tickets and a folded map (Whatever)\nA [silver compass](123456) (nearby)'
								: 'With 2 old tickets and a folded map (Whatever)\nSilver compass';
						await editor.fill(source);
						const other = primary === 'Genius' ? 'Musixmatch' : 'Genius';
						const opener = page.getByRole('button', { name: `Export to ${other}`, exact: true });
						await opener.click();
						const output = page.getByRole('textbox', { name: `${other} output` });
						const edited =
							'Independent export\nWith 2 old tickets and a folded map (Whatever)\n' +
							'A long readable output line with words '.repeat(40);
						await output.fill(edited);
						await expect.poll(() => documentText(editor)).toBe(source);
						const downloading = page.waitForEvent('download');
						await page.getByRole('button', { name: 'Download .txt', exact: true }).click();
						const path = await (await downloading).path();
						if (!path) throw new Error('Missing export artifact');
						expect(await readFile(path, 'utf8')).toBe(edited);
						if (browserName === 'chromium') {
							await page.getByRole('button', { name: 'Copy', exact: true }).click();
							expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(edited);
						}
						await page.screenshot({ path: testInfo.outputPath('export.png') });
						const bounds = await output.boundingBox();
						expect(bounds?.x).toBeGreaterThanOrEqual(0);
						expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
						expect(
							await output.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
						).toBeGreaterThanOrEqual(16);
						await page.keyboard.press('Escape');
						await expect(opener).toBeFocused();
						await opener.click();
						await expect(output).toHaveValue(edited);
						await page.mouse.click(1, 1);
						await expect(page.locator('dialog:modal')).toHaveCount(0);
						await opener.click();
						await expect(output).toHaveValue(edited);
						await page.getByRole('button', { name: 'Edit lyrics', exact: true }).click();
						await use({ editor, source, opener, output, edited, other });
					},
					{ timeout: 30_000 }
				]
			});
			prepared(
				`${primary} preserves primary through output, reload and source expiry`,
				async ({ page, preparedExport }) => {
					const { editor, source, opener, output, edited, other } = preparedExport;
					await page.reload();
					await expect.poll(() => documentText(editor)).toBe(source);
					await opener.click();
					await expect(output).toHaveValue(edited);
					await page.getByRole('button', { name: 'Close', exact: true }).click();
					const title = await page
						.getByRole('textbox', { name: "'Scribe title", exact: true })
						.inputValue();
					await page.getByRole('button', { name: "Open saved 'scribes", exact: true }).click();
					const row = page
						.locator('.draft-list > li')
						.filter({ has: page.getByText(title, { exact: true }) });
					await row.getByRole('button', { name: `Actions for ${title}`, exact: true }).click();
					const scribeDownload = page.waitForEvent('download');
					await row
						.getByRole('button', { name: `Export Scribe for ${title}`, exact: true })
						.click();
					const scribePath = await (await scribeDownload).path();
					if (!scribePath) throw new Error('Missing Scribe file');
					const scribe = JSON.parse(await readFile(scribePath, 'utf8'));
					expect(scribe.version).toBe(3);
					expect(scribe.document.writing.export.text).toBe(edited);
					expect(scribe.document.lyrics).toBe(source);
					const importedTitle = `Round-trip ${primary} export`;
					scribe.document.title = importedTitle;
					await page.locator('input[type=file][accept*=".lls"]').setInputFiles({
						name: 'roundtrip.lls',
						mimeType: 'application/json',
						buffer: Buffer.from(JSON.stringify(scribe))
					});
					await expect(
						page.getByRole('textbox', { name: "'Scribe title", exact: true })
					).toHaveValue(importedTitle);
					await expect.poll(() => documentText(editor)).toBe(source);
					await opener.click();
					await expect(output).toHaveValue(edited);
					await page.keyboard.press('Escape');
					await editor.fill(`${source}\nChanged original`);
					await opener.click();
					await expect(output).not.toHaveValue(edited);
					await page.keyboard.press('Escape');
					await expect(
						page.getByRole('button', { name: `Lyric format: ${other}`, exact: true })
					).toHaveCount(0);
				}
			);
		}
	});
}

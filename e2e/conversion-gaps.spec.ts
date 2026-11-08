import { importPrimary } from './format-fixture.js';
import { expect, test, type Page } from '@playwright/test';

async function read(page: Page) {
	return page.locator('.cm-content').evaluate((el) => {
		const node = el as HTMLElement & {
			cmView?: { view: import('@codemirror/view').EditorView };
			cmTile?: { view: import('@codemirror/view').EditorView };
		};
		const view = (node.cmView ?? node.cmTile)!.view;
		return {
			text: view.state.doc.toString(),
			selected: view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to)
		};
	});
}
async function review(page: Page, mobile: boolean) {
	if (mobile)
		await page
			.getByRole('navigation', { name: 'Workbench views' })
			.getByRole('button', { name: /Review/ })
			.click();
}
for (const width of [1440, 360, 390]) {
	test.describe(`conversion gap replay ${width}`, () => {
		test.use({
			hasTouch: width < 600,
			isMobile: width < 600,
			viewport: { width, height: 900 },
			colorScheme: width === 360 ? 'dark' : 'light'
		});
		test('retained instruction exports the exact repeated header without changing source history', async ({
			page
		}) => {
			await page.goto('/workbench/');
			const source =
				'[Verse: Mira]\nKeep [every word](123456)\n\n[Chorus x2: Noor]\nStay beside me';
			await importPrimary(page, source);
			const plain = (await read(page)).text;
			await review(page, width < 600);
			const region = page.getByRole('region', { name: 'Retained details needing review' });
			await expect(region.getByRole('button', { name: 'Next detail' })).toHaveCount(0);
			const edit = region.getByRole('button', { name: 'Open Genius export' });
			await expect(edit).toBeVisible();
			await expect(region.locator('[aria-live="polite"]')).toContainText('[Chorus x2: Noor]');
			expect((await edit.boundingBox())!.height).toBeGreaterThanOrEqual(44);
			await edit.focus();
			await edit.press('Enter');
			const output = page.getByRole('textbox', { name: 'Genius output' });
			await expect(output).toHaveValue(source);
			await output.fill(source.replace('Chorus x2', 'Chorus'));
			expect((await read(page)).text).toBe(plain);
			await page.keyboard.press('Escape');
			await edit.click();
			await expect(output).toHaveValue(source.replace('Chorus x2', 'Chorus'));
			await page.keyboard.press('Escape');
			await review(page, width < 600);
			await expect(edit).toBeVisible();
			await page.screenshot({ path: `.audit/repeat-return-${width}.png`, fullPage: true });
		});
		test('names duration and recording replacement and requires fresh listening', async ({
			page
		}) => {
			await page.addInitScript(() =>
				Object.defineProperty(window, 'showOpenFilePicker', { value: undefined })
			);
			await page.goto('/workbench/');
			await importPrimary(page, '[Verse]\nFirst line\n\n[Chorus]\n#INSTRUMENTAL\n\nLast line');
			async function attach() {
				if (width < 600)
					await page
						.getByRole('navigation', { name: 'Workbench views' })
						.getByRole('button', { name: 'Write', exact: true })
						.click();
				await page
					.getByRole('button', { name: /^(Add audio source|Change audio source)$/ })
					.click();
				const chooser = page.waitForEvent('filechooser');
				await page.getByRole('button', { name: 'Choose a file…' }).click();
				await (await chooser).setFiles('.audit/main-format-test-migration/silence-25s.wav');
				await expect(page.getByRole('dialog')).not.toBeVisible();
			}
			await attach();
			await review(page, width < 600);
			const region = page.getByRole('region', { name: 'Retained details needing review' });
			await expect(region).toHaveCount(0);
			if (
				!(await page
					.getByRole('button', { name: 'Review instrumental interval', exact: true })
					.isVisible())
			)
				await page
					.getByRole('button', { name: 'Go to Confirm this instrumental interval.' })
					.click();
			await page.getByRole('button', { name: 'Review instrumental interval', exact: true }).click();
			await page.getByLabel('Between sections').selectOption({ label: 'Verse → Chorus' });
			await page.getByLabel('Starts at (seconds)').fill('2');
			await page.getByLabel('Ends at (seconds)').fill('26');
			await page.getByRole('checkbox', { name: /^I listened to this recording:/ }).check();
			await page
				.getByRole('button', { name: 'Preview instrumental interval', exact: true })
				.click();
			await expect(
				page.getByText(
					'The interval end exceeds the recording duration of 25 seconds. Choose an end inside this recording.',
					{ exact: true }
				)
			).toBeVisible();
			await page
				.getByText(
					'The interval end exceeds the recording duration of 25 seconds. Choose an end inside this recording.',
					{ exact: true }
				)
				.scrollIntoViewIfNeeded();
			await page.screenshot({ path: `.audit/bounds-${width}.png`, fullPage: true });
			const before = (await read(page)).text;
			await attach();
			await review(page, width < 600);
			await expect(page.getByRole('region', { name: 'Conversion task' })).toContainText(
				'The recording changed.'
			);
			await expect(page.getByLabel('Starts at (seconds)')).toHaveCount(0);
			expect((await read(page)).text).toBe(before);
			await page.screenshot({ path: `.audit/recording-changed-${width}.png`, fullPage: true });
			await page.getByRole('button', { name: 'Back to Review', exact: true }).click();
			if (
				!(await page
					.getByRole('button', { name: 'Review instrumental interval', exact: true })
					.isVisible())
			)
				await page
					.getByRole('button', { name: 'Go to Confirm this instrumental interval.' })
					.click();
			await page.getByRole('button', { name: 'Review instrumental interval', exact: true }).click();
			await expect(
				page.getByRole('checkbox', { name: /^I listened to this recording:/ })
			).not.toBeChecked();
		});
	});
}

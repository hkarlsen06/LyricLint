import { importPrimary } from './format-fixture.js';
import { readFile } from 'node:fs/promises';
import { expect, test as base, type Locator, type Page } from '@playwright/test';

async function activate(control: Locator, touch: boolean): Promise<void> {
	if (touch) await control.tap();
	else await control.click();
}

async function openDrafts(page: Page, touch: boolean): Promise<void> {
	const trigger = page.getByRole('button', { name: "Open saved 'scribes", exact: true });
	if ((await trigger.getAttribute('aria-expanded')) !== 'true') await activate(trigger, touch);
	await expect(page.locator('.draft-list')).toBeVisible();
}

function draftRow(page: Page, title: string): Locator {
	return page.locator('.draft-list > li').filter({
		has: page.getByText(title, { exact: true })
	});
}

async function actions(page: Page, title: string, touch: boolean): Promise<Locator> {
	await openDrafts(page, touch);
	const row = draftRow(page, title);
	const trigger = row.getByRole('button', { name: `Actions for ${title}`, exact: true });
	if ((await trigger.getAttribute('aria-expanded')) !== 'true') await activate(trigger, touch);
	return row;
}

async function exportedLyrics(
	page: Page,
	title: string,
	lyrics: string,
	touch: boolean
): Promise<void> {
	const row = await actions(page, title, touch);
	const downloading = page.waitForEvent('download');
	await activate(
		row.getByRole('button', { name: `Export Scribe for ${title}`, exact: true }),
		touch
	);
	const path = await (await downloading).path();
	if (!path) throw new Error('The Scribe download has no local artifact.');
	const file: unknown = JSON.parse(await readFile(path, 'utf8'));
	expect(file).toMatchObject({ format: 'LYRICLINT_SCRIBE', document: { title, lyrics } });
}

for (const width of [1280, 360, 390]) {
	const touch = width < 500;
	const test = base.extend<{
		exportedDrafts: { title: string; source: string; errors: string[] };
	}>({
		// Preparing and checking the independent drafts has its own bounded budget.
		// Confirmations and reload still run in order on the same page with the default budget.
		exportedDrafts: [
			async ({ page }, use) => {
				const errors: string[] = [];
				page.on('pageerror', (error) => errors.push(error.message));
				await page.goto('/workbench/');
				await expect(page.locator('[data-entrance-pending]')).toHaveAttribute(
					'data-entrance-pending',
					'false'
				);
				const title = 'Silver compass and the lights beyond the harbour';
				const source = '[Verse: Mira]\nI found your [silver compass](123456) by the door';
				const editor = page.getByRole('textbox', { name: 'Lyrics editor', exact: true });
				await importPrimary(page, source, 'genius');
				await page.getByRole('textbox', { name: "'Scribe title", exact: true }).fill(title);
				await page.getByRole('textbox', { name: "'Scribe title", exact: true }).press('Enter');
				await openDrafts(page, touch);
				await expect(page.getByRole('button', { name: /^Rename / })).toHaveCount(0);
				const originalRow = await actions(page, title, touch);
				await activate(
					originalRow.getByRole('button', { name: `Duplicate ${title}`, exact: true }),
					touch
				);
				const copy = `${title} copy`;
				await expect(page.getByRole('textbox', { name: "'Scribe title", exact: true })).toHaveValue(
					copy
				);
				await expect(page.locator('[data-entrance-pending]')).toHaveAttribute(
					'data-entrance-pending',
					'false'
				);
				await expect(page.getByRole('button', { name: 'Copy Genius', exact: true })).toBeVisible();
				await editor.press('ControlOrMeta+End');
				await editor.pressSequentially(' in the copy');
				await exportedLyrics(page, copy, `${source} in the copy`, touch);
				await openDrafts(page, touch);
				await activate(draftRow(page, title).locator('.list-row__action'), touch);
				await expect(page.getByRole('textbox', { name: "'Scribe title", exact: true })).toHaveValue(
					title
				);
				await expect(page.locator('[data-entrance-pending]')).toHaveAttribute(
					'data-entrance-pending',
					'false'
				);
				await exportedLyrics(page, title, source, touch);

				await use({ title, source, errors });
			},
			{ timeout: 30_000 }
		]
	});
	test.describe(`Saved draft actions at ${width}px`, () => {
		test.use({
			viewport: { width, height: 900 },
			hasTouch: touch,
			isMobile: touch,
			reducedMotion: 'reduce'
		});
		test('opens the copy for editing and keeps named confirmations in place', async ({
			page,
			exportedDrafts: { title, source, errors }
		}, testInfo) => {
			const row = draftRow(page, title);
			if (touch) {
				for (const control of await row.getByRole('button').all()) {
					const bounds = await control.boundingBox();
					if (!bounds) throw new Error('A visible draft action has no geometry.');
					expect(bounds.height, await control.getAttribute('aria-label')).toBeGreaterThanOrEqual(
						44
					);
				}
			}
			await page.screenshot({ path: testInfo.outputPath('draft-actions.png') });
			const remove = row.getByRole('button', { name: `Delete ${title}`, exact: true });
			const before = await remove.boundingBox();
			await activate(remove, touch);
			const confirm = row.getByRole('button', { name: `Delete ${title}`, exact: true });
			const after = await confirm.boundingBox();
			if (!before || !after) throw new Error('The visible delete control has no geometry.');
			expect(after.x).toBeCloseTo(before.x, 0);
			expect(after.y).toBeCloseTo(before.y, 0);
			expect(after.width).toBeCloseTo(before.width, 0);
			await expect(confirm).toBeFocused();
			await page.screenshot({ path: testInfo.outputPath('draft-delete-confirmation.png') });
			await activate(row.getByRole('button', { name: 'Cancel', exact: true }), touch);
			await page.keyboard.press('Escape');
			await expect(
				page.getByRole('button', { name: "Open saved 'scribes", exact: true })
			).toBeFocused();
			await page.reload();
			await expect(page.locator('[data-entrance-pending]')).toHaveAttribute(
				'data-entrance-pending',
				'false'
			);
			await exportedLyrics(page, title, source, touch);
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
			expect(errors).toEqual([]);
		});
	});
}

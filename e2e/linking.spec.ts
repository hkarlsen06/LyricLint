import { expect, test, type Page } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const editor = (page: Page) => page.getByRole('textbox', { name: 'Lyrics editor' });
const original =
	'[Chorus 1]\nHold on tight\nCarry me home\n\n[Verse]\nWalk with me\n\n[Chorus 2]\nHold on tighht\nCarry me home (Oh)';

async function expectLyrics(page: Page, text: string): Promise<void> {
	await expect
		.poll(() =>
			page.evaluate(() => {
				type Handle = { view: { state: { doc: { toString(): string } } } };
				const content = document.querySelector<HTMLElement & { cmView?: Handle; cmTile?: Handle }>(
					'.cm-content'
				);
				return (content?.cmView ?? content?.cmTile)?.view.state.doc.toString();
			})
		)
		.toBe(text);
}

test('Linking keeps lyrics intact, stages one correction, and stays on the chosen section', async ({
	page
}) => {
	await page.goto('/lint/');
	await expect(editor(page)).toBeVisible();
	await editor(page).fill(original);
	await page.getByRole('tab', { name: 'Linking', exact: true }).click();
	const panel = page.getByRole('tabpanel', { name: 'Linking', exact: true });
	await panel
		.getByRole('button', { name: /Set up link/u })
		.first()
		.click();
	const detail = page.locator('.linking-detail');
	const peer = detail.getByRole('checkbox', { name: /^Chorus 2/u });
	await expect(peer).toBeChecked();
	await expect(detail.getByRole('checkbox', { name: /^Chorus 1/u })).toBeEnabled();
	await expect(detail.getByText('This section', { exact: false })).toHaveCount(0);
	await expect(detail.locator('.difference')).toHaveCount(0);
	await expect(detail.getByRole('radio')).toHaveCount(0);
	await expect(
		detail.getByRole('button', { name: 'Review differences', exact: true })
	).toHaveAttribute('aria-expanded', 'false');
	await detail.getByRole('button', { name: 'Link 2 sections', exact: true }).click();
	await expectLyrics(page, original);
	await expect(
		editor(page).getByRole('button', { name: 'Edit linked sections', exact: true })
	).toHaveCount(2);
	await panel.getByRole('button', { name: 'Manage Chorus 1, Chorus 2', exact: true }).click();
	const heading = detail.getByRole('heading', { level: 2 });
	await expect(heading).toBeVisible();
	await expect(heading).toHaveText('Manage linked sections');
	await detail.getByRole('button', { name: 'Review differences', exact: true }).click();
	await expect(detail.locator('.difference')).toHaveCount(2);
	await expect(detail.locator('.version__choice input')).toHaveCount(0);
	await detail.getByRole('button', { name: 'Choose wording per difference', exact: true }).click();

	// Moving the caret to the other chorus must not take over the current decision.
	await editor(page).focus();
	await editor(page).press(`${mod}+End`);
	await expect(heading).toHaveText('Manage linked sections');
	await expect(detail.locator('.difference').last()).toBeVisible();
	await detail
		.getByRole('checkbox', { name: 'Use Chorus 1 wording for difference 1 in all 2 sections' })
		.click();
	await expect(detail.locator('del')).toHaveText('tighht');
	await expect(detail.locator('ins')).toHaveText('tight');
	await expectLyrics(page, original);
	await detail.getByRole('button', { name: 'Apply 1 change', exact: true }).click();
	await expectLyrics(page, original.replace('tighht', 'tight'));
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expectLyrics(page, original);

	// A pointer may pass or pause over a link on its way elsewhere. Only a press
	// should leave the panel the writer deliberately selected.
	await page.getByRole('tab', { name: /^Review/u }).click();
	const marker = editor(page)
		.getByRole('button', { name: 'Edit linked sections', exact: true })
		.last();
	await marker.hover();
	await page.waitForTimeout(500);
	await expect(page.getByRole('tab', { name: /^Review/u })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await marker.click();
	await expect(page.getByRole('tab', { name: 'Linking', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(detail.getByRole('heading', { name: 'Manage Chorus 2', exact: true })).toBeVisible();
	await expect(page.getByRole('dialog', { name: /Link this/u })).toHaveCount(0);
});

test('Linking can use a later section’s full version and undo all replacements together', async ({
	page
}) => {
	const lyrics = `${original}\n\n[Chorus 3]\nHold on tight\nCarry me home (Yeah)`;
	await page.goto('/lint/');
	await expect(editor(page)).toBeVisible();
	await editor(page).fill(lyrics);
	await page.getByRole('tab', { name: 'Linking', exact: true }).click();
	await page
		.getByRole('tabpanel', { name: 'Linking', exact: true })
		.getByRole('button', { name: /Set up link/u })
		.first()
		.click();
	const detail = page.locator('.linking-detail');
	await expect(detail.getByRole('heading', { name: 'Link sections', exact: true })).toBeVisible();
	await expect(detail.getByRole('radio')).toHaveCount(0);
	await detail.getByRole('button', { name: 'Review differences', exact: true }).click();
	await detail.getByRole('button', { name: 'Use one section’s full version', exact: true }).click();
	await detail.getByRole('radio', { name: 'Use Chorus 3’s full version', exact: true }).check();
	await expect(
		detail.getByRole('button', { name: 'Choose wording per difference', exact: true })
	).toHaveAttribute('aria-pressed', 'false');
	await expect(detail.locator('.difference')).toHaveCount(2);
	await expect(detail.locator('del')).toContainText(['tighht', '(Oh)']);
	await expectLyrics(page, lyrics);
	await detail.getByRole('button', { name: 'Link and apply 2 changes', exact: true }).click();
	await expectLyrics(
		page,
		lyrics
			.replace('Carry me home\n', 'Carry me home (Yeah)\n')
			.replace('tighht', 'tight')
			.replace('(Oh)', '(Yeah)')
	);
	await expect(
		editor(page).getByRole('button', { name: 'Edit linked sections', exact: true })
	).toHaveCount(3);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expectLyrics(page, lyrics);
	await expect(
		editor(page).getByRole('button', { name: 'Edit linked sections', exact: true })
	).toHaveCount(0);
});

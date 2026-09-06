import { expect, test, type Page } from '@playwright/test';

// These cases exercise editing and history; normal-motion startup stays covered
// by the desktop integration and CSP cases in lyriclint.spec.ts.
test.use({ reducedMotion: 'reduce' });

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

async function openWorkspace(page: Page, text: string): Promise<void> {
	await page.goto('/workbench/');
	await expect(editor(page)).toBeVisible();
	await editor(page).fill(text);
	await expectLyrics(page, text);
	// The fixture is a previous edit, not part of the linking action being undone.
	// Advance Date past CodeMirror's 500ms history window without delaying or
	// replacing the browser timers and animation frames the interaction needs.
	await page.clock.setFixedTime(await page.evaluate(() => Date.now() + 600));
}

test('Linking keeps lyrics intact, stages one correction, and stays on the chosen section', async ({
	page
}) => {
	await openWorkspace(page, original);
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
	await expect(editor(page).locator('.ll-section-link-marker')).toHaveCount(2);
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

	// The lock controls section-only editing without leaving the current tool;
	// the original link marker still opens the respective section in Linking.
	await page.getByRole('tab', { name: /^Review/u }).click();
	const marker = editor(page).locator('.ll-section-link-marker').last();
	const lock = editor(page).locator('.ll-section-local-toggle').last();
	await marker.hover();
	await expect(page.getByRole('tab', { name: /^Review/u })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await lock.focus();
	await lock.press('Enter');
	await expect(lock).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('tab', { name: /^Review/u })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await lock.press(' ');
	await expect(lock).toHaveAttribute('aria-pressed', 'false');
	await expectLyrics(page, original);
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
	await openWorkspace(page, lyrics);
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
	await expect(editor(page).locator('.ll-section-link-marker')).toHaveCount(3);
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expectLyrics(page, lyrics);
	await expect(editor(page).locator('.ll-section-link-marker')).toHaveCount(0);
});

const passageSong = [
	'[Intro]',
	'Hver sommer drar hun alltid til Italia',
	'Vin-vin-vin, i et badekar, ri-ri',
	'Lever livet hver dag',
	'',
	'[Chorus 1]',
	'Hver sommer drar hun alltid til Italia',
	'På vingård, drikker vin i et badekar',
	'Lever livet hver dag',
	'',
	'[Chorus 2]',
	'Hver sommer drar hun alltid til Italia',
	'På vingård, drikker vin i et badekar',
	'Lever livet hver dag',
	'',
	'[Outro]',
	'Hver sommer drar hun alltid til Italia',
	'Vin-vin-vin, i et badekar, ri-ri',
	'Lever livet hver dag (Oh)'
].join('\n');

async function placeCaret(page: Page, at: number): Promise<void> {
	await editor(page).focus();
	await page.evaluate((anchor) => {
		type View = { dispatch(spec: { selection: { anchor: number } }): void };
		type Handle = { view: View };
		const content = document.querySelector<HTMLElement & { cmView?: Handle; cmTile?: Handle }>(
			'.cm-content'
		);
		(content?.cmView ?? content?.cmTile)?.view.dispatch({ selection: { anchor } });
	}, at);
}

test('Passage scope identifies real recipients and reconnects an explicitly local matching word', async ({
	page
}) => {
	await openWorkspace(page, passageSong);
	await page.getByRole('tab', { name: 'Linking', exact: true }).click();
	const panel = page.getByRole('tabpanel', { name: 'Linking', exact: true });
	await panel.getByRole('button', { name: 'Set up link Intro, Chorus 1, Chorus 2, Outro' }).click();
	await panel.getByRole('button', { name: 'Link 4 sections', exact: true }).click();
	await expectLyrics(page, passageSong);
	await expect(panel.getByText('Not linked together', { exact: true })).toHaveCount(0);
	await expect(panel.getByText(/\d+ differences? kept/u)).toHaveCount(0);

	await panel.getByRole('button', { name: 'Manage Intro, Chorus 1, Chorus 2, Outro' }).click();
	await expect(
		panel.getByRole('button', { name: 'Link matching lyrics again', exact: true })
	).toHaveCount(0);
	await expect(panel.getByText('Already connected', { exact: true })).toHaveCount(0);
	await panel.getByRole('button', { name: '← Back to linking', exact: true }).click();

	const chorusAt = passageSong.indexOf('drikker') + 3;
	await placeCaret(page, chorusAt);
	await expect(
		editor(page).locator('.ll-section-link-status').filter({ hasText: 'Also edits Chorus 2' })
	).toHaveCount(1);
	await editor(page).press('x');
	await expectLyrics(page, passageSong.replaceAll('drikker', 'drixkker'));
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expectLyrics(page, passageSong);

	const suffix = passageSong.indexOf('badekar') + 'badekar'.length;
	await placeCaret(page, suffix);
	const intro = editor(page).locator('.ll-section-link-marker').first();
	await expect(intro).toHaveAttribute(
		'aria-label',
		/Typing also edits Chorus 1, Chorus 2, and Outro/u
	);
	await expect(intro).toHaveAttribute('aria-label', /Delete: Also edits Outro/u);
	await editor(page).press(`${mod}+Shift+L`);
	await editor(page).press('Backspace');
	await editor(page).press('r');
	await expectLyrics(page, passageSong);
	await editor(page).press(`${mod}+Shift+L`);
	await page.getByRole('tab', { name: 'Linking', exact: true }).click();
	await panel.getByRole('button', { name: 'Manage Intro, Chorus 1, Chorus 2, Outro' }).click();
	await panel.getByRole('button', { name: 'Link matching lyrics again', exact: true }).click();
	await expect(panel.getByText('Already connected', { exact: true })).toHaveCount(0);
	await expect(
		panel.getByRole('region', { name: 'Lyrics to link again', exact: true })
	).toContainText('badekar');
	await panel.getByRole('button', { name: 'Link these lyrics again', exact: true }).click();
	await expectLyrics(page, passageSong);
	await placeCaret(page, suffix);
	await editor(page).press('s');
	await expectLyrics(page, passageSong.replaceAll('badekar', 'badekars'));
});

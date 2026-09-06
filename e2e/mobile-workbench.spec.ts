import { expect, test, type Page } from '@playwright/test';

const lyricsEditor = (page: Page) => page.getByRole('textbox', { name: 'Lyrics editor' });
const mobileNavigation = (page: Page) => page.getByRole('navigation', { name: 'Workbench views' });

async function openWorkspace(page: Page): Promise<void> {
	await page.goto('/workbench/');
	await expect(lyricsEditor(page)).toBeVisible();
	await expect(mobileNavigation(page)).toBeVisible();
	await expect(page.locator('.boot-screen')).not.toBeVisible();
}

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

async function replaceLyrics(page: Page, text: string): Promise<void> {
	await lyricsEditor(page).fill(text);
	await expectLyrics(page, text);
}

test('phone writing keeps the document through tools, rotation, and recovery', async ({ page }) => {
	await openWorkspace(page);
	const navigation = mobileNavigation(page);
	await expect(navigation.getByRole('button', { name: 'Write', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	const canonical = '[Verse]\nSilver moonlight';
	await replaceLyrics(page, canonical);

	// Keep an identity probe: switching views must preserve the editor and its undo history.
	await lyricsEditor(page).evaluate((element) => {
		(element as HTMLElement & { mobileIdentityProbe?: boolean }).mobileIdentityProbe = true;
	});
	await navigation.getByRole('button', { name: 'Tools', exact: true }).click();
	await expect(lyricsEditor(page)).not.toBeVisible();
	await navigation.getByRole('button', { name: 'Write', exact: true }).click();
	expect(
		await lyricsEditor(page).evaluate(
			(element) => (element as HTMLElement & { mobileIdentityProbe?: boolean }).mobileIdentityProbe
		)
	).toBe(true);
	await expectLyrics(page, canonical);

	await page.setViewportSize({ width: 844, height: 390 });
	await expect(lyricsEditor(page)).toBeVisible();
	await expect(page.getByText(/turn your phone|rotate your phone/iu)).toHaveCount(0);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
	await page.setViewportSize({ width: 390, height: 844 });

	await expect(page.getByLabel('Autosave status')).toHaveAttribute('aria-label', /Saved locally/u);
	await page.reload();
	await expectLyrics(page, canonical);
	await expect(mobileNavigation(page)).toBeVisible();
});

test('phone review fixes a finding beside its lyric passage and returns to writing', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nImma go');
	const navigation = mobileNavigation(page);
	await navigation.getByRole('button', { name: /^Review/u }).click();
	const finding = page.getByRole('button', { name: /^Go to Use “I'ma” instead of “Imma”/u });
	await expect(finding).toBeVisible();
	await finding.click();
	await expect(lyricsEditor(page)).toBeVisible();
	await page.getByRole('button', { name: 'All findings', exact: true }).click();
	await expect(lyricsEditor(page)).not.toBeVisible();
	await finding.click();
	await page.getByRole('button', { name: /^(Replace with|Use) I'ma$/u }).click();
	await navigation.getByRole('button', { name: 'Write', exact: true }).click();
	await expect(lyricsEditor(page)).toContainText("I'ma go");
	// WebKit cannot grant Playwright clipboard permissions. Intercept only the
	// write boundary to verify the real Copy control exports canonical lyrics.
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string) => {
					document.documentElement.dataset.copiedLyrics = text;
				}
			}
		});
	});
	await page.getByRole('button', { name: 'Copy lyrics' }).click();
	await expect(page.locator('html')).toHaveAttribute('data-copied-lyrics', "[Verse]\nI'ma go");
	await page.getByRole('button', { name: 'Document', exact: true }).click();
	await page.getByRole('button', { name: 'Undo', exact: true }).click();
	await expectLyrics(page, '[Verse]\nImma go');
});

test('tapping an underlined phone finding opens its Review decision and returns to writing', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nImma go\nImma stay');
	const underline = lyricsEditor(page).locator('.ll-diagnostic-range').filter({ hasText: 'Imma' });
	await expect(underline).toHaveCount(2);
	await underline.last().tap();
	await expect(mobileNavigation(page).getByRole('button', { name: /^Review/u })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(lyricsEditor(page)).toBeVisible();
	await expect(lyricsEditor(page)).not.toBeFocused();
	await expect(page.locator('.diagnostic-list')).toContainText('Line 3');
	await expect(page.getByRole('button', { name: 'All findings', exact: true })).toBeVisible();
	await expect(page.locator('.popover')).not.toBeVisible();
	await expect(page.locator('.ll-diagnostic-cluster-menu:visible')).toHaveCount(0);
	const fix = page.getByRole('button', { name: /^(Replace with|Use) I'ma$/u });
	await expect(fix).toBeInViewport();
	await fix.tap();
	await mobileNavigation(page).getByRole('button', { name: 'Write', exact: true }).tap();
	await expectLyrics(page, "[Verse]\nImma go\nI'ma stay");
	await expect(page.locator('.diagnostic-list')).not.toBeVisible();
});

test('a related chorus tap keeps that occurrence as the mobile linking source', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(
		page,
		'[Chorus]\nHold on tight\n\n[Verse]\nWalk with me\n\n[Chorus]\nHold on tight'
	);
	await lyricsEditor(page).blur();
	const header = lyricsEditor(page).locator(
		'.ll-diagnostic-range[aria-label*="Link these repeats"]'
	);
	await expect(header.last()).toBeVisible();
	await header.last().tap();
	await expect(page.getByRole('button', { name: 'All findings', exact: true })).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => {
				type Handle = {
					view: {
						state: {
							selection: { main: { from: number } };
							doc: { lineAt(pos: number): { number: number } };
						};
					};
				};
				const content = document.querySelector<HTMLElement & { cmView?: Handle; cmTile?: Handle }>(
					'.cm-content'
				);
				const state = (content?.cmView ?? content?.cmTile)?.view.state;
				return state?.doc.lineAt(state.selection.main.from).number;
			})
		)
		.toBe(7);
	await expect(page.locator('.diagnostic-card--expanded')).toContainText('Line 7');
	await page.getByRole('button', { name: 'Manage linking', exact: true }).tap();
	await expect(page.getByRole('tab', { name: 'Linking', exact: true })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	const detail = page.locator('.linking-detail');
	await expect(detail.getByRole('heading', { name: 'Link Chorus 2', exact: true })).toBeVisible();
	await expect(detail.locator('.member').filter({ hasText: 'This section' })).toContainText(
		'Line 7'
	);
	await expect(page.getByRole('dialog', { name: 'Link this chorus' })).toHaveCount(0);
});

test('phone Linking preserves variations and previews one correction before applying', async ({
	page
}) => {
	await openWorkspace(page);
	const original =
		'[Chorus 1]\nHold on tight\nCarry me home\n\n[Verse]\nWalk with me\n\n[Chorus 2]\nHold on tighht\nCarry me home (Oh)';
	await replaceLyrics(page, original);
	await mobileNavigation(page).getByRole('button', { name: 'Tools', exact: true }).tap();
	await page.getByRole('tab', { name: 'Linking', exact: true }).tap();
	const panel = page.getByRole('tabpanel', { name: 'Linking', exact: true });
	await panel
		.getByRole('button', { name: /Set up link/u })
		.first()
		.tap();
	const detail = page.locator('.linking-detail');
	await expect(detail.getByRole('checkbox', { name: /^Chorus 2/u })).toBeChecked();
	await expect(detail.getByText('This section', { exact: false })).toHaveCount(0);
	await expect(detail.locator('.difference')).toHaveCount(0);
	await expect(detail.getByRole('radio')).toHaveCount(0);
	await expect(
		detail.getByRole('button', { name: 'Link 2 sections', exact: true })
	).toBeInViewport();
	await detail.getByRole('button', { name: 'Link 2 sections', exact: true }).tap();
	await expectLyrics(page, original);
	await panel.getByRole('button', { name: 'Manage Chorus 1, Chorus 2', exact: true }).tap();
	await expect(detail.getByRole('heading', { level: 2 })).toBeVisible();
	await detail.getByRole('button', { name: 'Review differences', exact: true }).tap();
	await expect(detail.locator('.difference')).toHaveCount(2);
	await expect(detail.locator('.version__choice input')).toHaveCount(0);
	await detail.getByRole('button', { name: 'Choose wording per difference', exact: true }).tap();
	const wordingChoice = detail.getByRole('checkbox', {
		name: 'Use Chorus 1 wording for difference 1 in all 2 sections'
	});
	await page.evaluate(() => document.fonts.ready.then(() => undefined));
	await wordingChoice.scrollIntoViewIfNeeded();
	const positions = () =>
		detail.locator('.version__choice, .difference').evaluateAll((elements) =>
			elements.map((element) => {
				const rect = element.getBoundingClientRect();
				return [rect.x, rect.y, rect.width, rect.height];
			})
		);
	const beforeChoice = await positions();
	await wordingChoice.tap();
	await expect(detail.locator('del')).toHaveText('tighht');
	expect(await positions()).toEqual(beforeChoice);
	await detail.getByRole('button', { name: 'Line 8', exact: true }).tap();
	await expect(
		mobileNavigation(page).getByRole('button', { name: 'Write', exact: true })
	).toBeFocused();
	await expect(lyricsEditor(page)).toBeVisible();
	await expect(lyricsEditor(page)).not.toBeFocused();
	await mobileNavigation(page).getByRole('button', { name: 'Tools', exact: true }).tap();
	await expect(detail.locator('del')).toHaveText('tighht');
	await expectLyrics(page, original);
	const apply = detail.getByRole('button', { name: 'Apply 1 change', exact: true });
	await apply.scrollIntoViewIfNeeded();
	await expect(apply).toBeInViewport();
	await apply.tap();
	await expectLyrics(page, original.replace('tighht', 'tight'));
	await mobileNavigation(page).getByRole('button', { name: 'Write', exact: true }).tap();
	await page.getByRole('button', { name: 'Document', exact: true }).tap();
	await page.getByRole('button', { name: 'Undo', exact: true }).tap();
	await expectLyrics(page, original);
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
		.toBe(true);
});

test('tapping a phone issue count opens the first finding in Review without a floating menu', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nShe said “hello”');
	const badge = lyricsEditor(page).locator('.ll-diagnostic-badge');
	await expect(badge).toHaveCount(1);
	await badge.tap();
	await expect(mobileNavigation(page).getByRole('button', { name: /^Review/u })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('.diagnostic-list')).toContainText('opening curly double quote');
	await expect(page.locator('.diagnostic-list')).toContainText('Line 2');
	await expect(page.locator('.popover')).not.toBeVisible();
	await expect(page.locator('.ll-diagnostic-cluster-menu:visible')).toHaveCount(0);
	await expect(lyricsEditor(page)).not.toBeFocused();
	await page.getByRole('button', { name: 'Next', exact: true }).tap();
	await expect(page.locator('.diagnostic-list')).toContainText('closing curly double quote');
	await mobileNavigation(page).getByRole('button', { name: 'Write', exact: true }).tap();
	await expectLyrics(page, '[Verse]\nShe said “hello”');
});

/** A real decodable file keeps this flow independent of catalogue accounts and network media. */
function silentWave(): Buffer {
	const samples = 8_000 * 30;
	const wave = Buffer.alloc(44 + samples * 2);
	wave.write('RIFF');
	wave.writeUInt32LE(wave.length - 8, 4);
	wave.write('WAVEfmt ', 8);
	wave.writeUInt32LE(16, 16);
	wave.writeUInt16LE(1, 20);
	wave.writeUInt16LE(1, 22);
	wave.writeUInt32LE(8_000, 24);
	wave.writeUInt32LE(16_000, 28);
	wave.writeUInt16LE(2, 32);
	wave.writeUInt16LE(16, 34);
	wave.write('data', 36);
	wave.writeUInt32LE(samples * 2, 40);
	return wave;
}

test('phone playback survives view changes and playback taps preserve writing focus', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nSilver moonlight');
	const navigation = mobileNavigation(page);
	await page.getByRole('button', { name: 'Add audio source' }).click();
	const fileChooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Choose a file…' }).click();
	await (
		await fileChooser
	).setFiles({ name: 'Moonlight.wav', mimeType: 'audio/wav', buffer: silentWave() });
	await navigation.getByRole('button', { name: 'Write', exact: true }).click();
	const play = page.getByRole('button', { name: 'Play', exact: true });
	await expect(play).toBeEnabled();
	await lyricsEditor(page).click();
	await play.tap();
	await expect(lyricsEditor(page)).toBeFocused();
	await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await navigation.getByRole('button', { name: /^Review/u }).click();
	await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Pause', exact: true }).tap();
	await navigation.getByRole('button', { name: 'Write', exact: true }).click();
	await expectLyrics(page, '[Verse]\nSilver moonlight');
});

test('phone review moves between findings and sets an occurrence aside', async ({ page }) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nImma go\nImma stay');
	await mobileNavigation(page)
		.getByRole('button', { name: /^Review/u })
		.click();
	const findings = page.getByRole('button', {
		name: `Go to Use “I'ma” instead of “Imma”.`,
		exact: true
	});
	await expect(findings).toHaveCount(2);
	await findings.first().click();
	await expect(findings).toHaveCount(1);
	await expect(page.locator('.diagnostic-list')).toContainText('Line 2');
	await page.getByRole('button', { name: 'Next', exact: true }).click();
	await expect(page.locator('.diagnostic-list')).toContainText('Line 3');
	await page.getByRole('button', { name: 'Previous', exact: true }).click();
	await expect(page.locator('.diagnostic-list')).toContainText('Line 2');
	await page.getByRole('button', { name: 'Ignore', exact: true }).click();
	await page.getByRole('button', { name: 'All findings', exact: true }).click();
	await expect(findings).toHaveCount(1);
	await mobileNavigation(page).getByRole('button', { name: 'Write', exact: true }).click();
	await expectLyrics(page, '[Verse]\nImma go\nImma stay');
});

test('phone language search keeps the touch font and target floor', async ({ page }) => {
	await openWorkspace(page);
	await page.getByRole('button', { name: 'Document', exact: true }).click();
	await page.getByRole('button', { name: 'Lyric language: English' }).click();
	const search = page.getByPlaceholder('Search languages');
	await expect(search).toBeVisible();
	const metrics = await search.evaluate((element) => ({
		fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
		height: element.getBoundingClientRect().height
	}));
	expect(metrics.fontSize).toBeGreaterThanOrEqual(16);
	expect(metrics.height).toBeGreaterThanOrEqual(44);
	await search.fill('Danish');
	await expect(page.getByRole('button', { name: /Danish/ })).toBeVisible();
});

test('touch selection stays available for editing until Assign voices is requested', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nHello world');
	const selection = { anchor: 8, head: 19 };
	// Linux WebKit cannot drag native iOS selection handles. Dispatch the same
	// CodeMirror selection transaction while retaining the real coarse-pointer
	// environment; the explicit action below is an actual touchscreen tap.
	await lyricsEditor(page).evaluate((element, range) => {
		type Handle = {
			view: { dispatch(spec: { selection: typeof range; userEvent: string }): void };
		};
		const content = element as HTMLElement & { cmView?: Handle; cmTile?: Handle };
		(content.cmView ?? content.cmTile)?.view.dispatch({
			selection: range,
			userEvent: 'select.pointer'
		});
	}, selection);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
	const picker = page.getByRole('dialog', { name: 'Assign performers' });
	await expect(picker).not.toBeVisible();
	await page.getByRole('button', { name: 'Assign voices', exact: true }).tap();
	await expect(picker).toBeVisible();
	const retainedSelection = await lyricsEditor(page).evaluate((element) => {
		type Handle = { view: { state: { selection: { main: { from: number; to: number } } } } };
		const content = element as HTMLElement & { cmView?: Handle; cmTile?: Handle };
		const range = (content.cmView ?? content.cmTile)?.view.state.selection.main;
		return range && { from: range.from, to: range.to };
	});
	expect(retainedSelection).toEqual({ from: 8, to: 19 });
	await expectLyrics(page, '[Verse]\nHello world');
});

test('the phone Document menu has named rows that receive taps above the editor tray', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nHello world');
	await page.getByRole('button', { name: 'Document', exact: true }).tap();
	const menu = page.locator('#document-commands');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('button', { name: "New 'scribe", exact: true })).toHaveText(
		"New 'scribe"
	);
	await expect(menu.getByRole('button', { name: 'Undo', exact: true })).toHaveText('Undo');
	await expect(menu.getByRole('button', { name: 'Redo', exact: true })).toHaveText('Redo');
	await expect(menu.getByRole('button', { name: /^Lyric language:/u })).toContainText('English');
	for (const button of await menu.locator(':scope > button:not(:disabled)').all()) {
		await expect(button).toBeInViewport();
		expect(
			await button.evaluate((element) => {
				const box = element.getBoundingClientRect();
				const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
				return hit !== null && (hit === element || element.contains(hit));
			})
		).toBe(true);
	}
	await menu.getByRole('button', { name: 'Undo', exact: true }).tap();
	await expectLyrics(page, '');
	await menu.getByRole('button', { name: 'Redo', exact: true }).tap();
	await expectLyrics(page, '[Verse]\nHello world');
	await page.getByRole('button', { name: 'Document', exact: true }).tap();
	await expect(menu).not.toBeVisible();
});

test('touch editing keeps a visible native caret without a duplicate drawn cursor', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nHello world');
	await lyricsEditor(page).focus();
	for (const colorScheme of ['dark', 'light'] as const) {
		await page.emulateMedia({ colorScheme });
		const colors = await lyricsEditor(page).evaluate((element) => {
			const probe = document.createElement('span');
			probe.style.color = 'var(--color-accent)';
			document.body.append(probe);
			const accent = getComputedStyle(probe).color;
			probe.remove();
			return {
				caret: getComputedStyle(element).caretColor,
				accent,
				touch: matchMedia('(any-pointer: coarse)').matches
			};
		});
		expect(colors.touch).toBe(true);
		expect(colors.caret).toBe(colors.accent);
		await expect(page.locator('.ll-caret-layer')).toHaveCSS('display', 'none');
	}
});

test('phone sync entry and repeated taps time lines without focusing the typing surface', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceLyrics(page, '[Verse]\nSilver moonlight\nOver the water\nCarry me home');
	await page.getByRole('button', { name: 'Add audio source' }).click();
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Choose a file…' }).click();
	await (
		await chooser
	).setFiles({ name: 'Moonlight.wav', mimeType: 'audio/wav', buffer: silentWave() });
	await mobileNavigation(page).getByRole('button', { name: 'Write', exact: true }).tap();
	await lyricsEditor(page).click();
	await expect(lyricsEditor(page)).toBeFocused();
	await page.getByRole('button', { name: 'Audio details', exact: true }).tap();
	await page.getByRole('button', { name: 'Sync lyrics', exact: true }).tap();
	const tap = page.getByRole('button', { name: 'Tap each line', exact: true });
	await expect(tap).toBeFocused();
	for (let index = 0; index < 3; index += 1) {
		await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
		await tap.tap();
		await expect(lyricsEditor(page)).not.toBeFocused();
	}
	await expect(page.getByRole('button', { name: 'Retime lyrics', exact: true })).toBeVisible();
	await expect(page.locator('.ll-time-value').filter({ hasText: /^0:/u })).toHaveCount(3);
});

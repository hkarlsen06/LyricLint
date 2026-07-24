import { expect, test, type Locator, type Page } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

function editor(page: Page): Locator {
	return page.getByRole('textbox', { name: 'Lyrics editor' });
}

/**
 * Read the canonical document from CodeMirror state. DOM text is unusable for
 * byte-exact assertions: it flattens line breaks and includes decoration
 * widgets such as diagnostic badges.
 */
function docText(page: Page): Promise<string> {
	return page.evaluate(() => {
		interface ContentHandle {
			view: { state: { doc: { toString(): string } } };
		}
		const content = document.querySelector('.cm-content') as unknown as {
			cmView?: ContentHandle;
			cmTile?: ContentHandle;
		};
		const handle = content.cmView ?? content.cmTile;
		if (!handle) throw new Error('CodeMirror content handle not found.');
		return handle.view.state.doc.toString();
	});
}

async function expectDocText(page: Page, expected: string): Promise<void> {
	await expect.poll(() => docText(page)).toBe(expected);
}

async function openWorkspace(page: Page): Promise<void> {
	await page.goto('/');
	await expect(editor(page)).toBeVisible();
}

async function replaceDocument(page: Page, text: string): Promise<void> {
	const textbox = editor(page);
	await textbox.click();
	await textbox.press(`${mod}+A`);
	await textbox.fill(text);
	await expectDocText(page, text);
}

async function waitForSaved(page: Page): Promise<void> {
	await expect(page.getByLabel('Autosave status')).toHaveText('Saved locally');
}

test('paste → lint → safe fix updates the canonical editor text', async ({ page }) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Chorus: Blair]\nImma stay');

	const diagnostic = page.getByRole('button', {
		name: /^Go to Use the reviewed spelling “I'ma” instead of “Imma”/u
	});
	await expect(diagnostic).toBeVisible();
	await page.getByRole('button', { name: "Replace with I'ma" }).click();

	await expectDocText(page, "[Chorus: Blair]\nI'ma stay");
	await expect(diagnostic).toHaveCount(0);
});

test('performer assignment is applied and undone as one atomic edit', async ({ page }) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Verse]\nHello world');

	await page.getByRole('tab', { name: 'Performers' }).click();
	await page.getByRole('textbox', { name: 'Add performer' }).fill('Blair');
	await page.getByRole('button', { name: 'Add', exact: true }).click();

	const textbox = editor(page);
	await textbox.click();
	await textbox.press('End');
	await textbox.press('Home');
	await textbox.press('Shift+End');
	await textbox.press('Alt+p');

	const picker = page.getByRole('toolbar', { name: 'Assign performers' });
	await expect(picker).toBeVisible();
	await picker.getByRole('button', { name: 'Blair' }).click();
	await picker.getByRole('button', { name: 'Apply' }).click();
	await expectDocText(page, '[Verse: Blair]\nHello world');

	await textbox.press(`${mod}+z`);
	await expectDocText(page, '[Verse]\nHello world');
});

test('Copy Genius markup writes byte-exact canonical text', async ({ page }) => {
	await openWorkspace(page);
	const canonical = '[Chorus: Blair & <i>Avery</i>]\nLead\n<i>Harmony</i>';
	await replaceDocument(page, canonical);

	await page.getByRole('button', { name: 'Copy Genius markup' }).click();
	const clipboard = await page.evaluate(() => navigator.clipboard.readText());
	expect(clipboard).toBe(canonical);
});

test('reload recovers exact text and selection, including the visibility flush path', async ({
	page
}) => {
	await openWorkspace(page);
	const text = '[Verse]\nSilver moonlight';
	await replaceDocument(page, text);

	const textbox = editor(page);
	await textbox.press('End');
	for (let index = 0; index < 'moonlight'.length; index += 1) {
		await textbox.press('Shift+ArrowLeft');
	}
	await waitForSaved(page);
	await page.reload();
	await expectDocText(page, text);
	await editor(page).press(`${mod}+c`);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('moonlight');

	const flushText = '[Verse]\nSaved by visibility flush';
	await replaceDocument(page, flushText);
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', {
			configurable: true,
			get: () => 'hidden'
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.reload();
	await expectDocText(page, flushText);
});

test('session ignores survive reload in the same tab and can be restored', async ({ page }) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Verse]\nImma go');
	const diagnostic = page.getByRole('button', {
		name: /^Go to Use the reviewed spelling “I'ma” instead of “Imma”/u
	});
	await expect(diagnostic).toBeVisible();

	await page.getByRole('button', { name: 'Ignore rule for this session' }).click();
	await expect(diagnostic).toHaveCount(0);
	await page.reload();
	await expect(diagnostic).toHaveCount(0);

	await page.getByRole('button', { name: /Ignored rules/u }).click();
	await page.getByRole('button', { name: 'Restore' }).click();
	await expect(diagnostic).toBeVisible();
});

test('an edit after switching between two drafts remains revision-scoped and durable', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Verse]\nFirst draft');
	await page.getByRole('textbox', { name: 'Draft title' }).fill('First');
	await page.getByRole('textbox', { name: 'Draft title' }).press('Enter');
	await editor(page).click();
	await waitForSaved(page);

	await page.getByRole('button', { name: 'Drafts' }).click();
	await page.getByRole('button', { name: 'New draft' }).click();
	await replaceDocument(page, '[Verse]\nSecond draft');
	await page.getByRole('textbox', { name: 'Draft title' }).fill('Second');
	await page.getByRole('textbox', { name: 'Draft title' }).press('Enter');
	await editor(page).click();
	await waitForSaved(page);

	await page.getByRole('button', { name: 'Drafts' }).click();
	await page.getByRole('button', { name: /First/u }).click();
	await expectDocText(page, '[Verse]\nFirst draft');
	await page.getByRole('button', { name: 'Drafts' }).click();
	await page.getByRole('button', { name: /Second/u }).click();
	await expectDocText(page, '[Verse]\nSecond draft');

	const durableEdit = '[Verse]\nEdited after switching twice';
	await replaceDocument(page, durableEdit);
	await waitForSaved(page);
	await page.reload();
	await expectDocText(page, durableEdit);
});

test('offline reopen from cache', async () => {
	test.skip(
		true,
		'The static export has no service worker or navigation cache, so the preview host cannot reopen while offline.'
	);
});

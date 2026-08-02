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
function docText(page: Page): Promise<string | null> {
	return page.evaluate(() => {
		interface ContentHandle {
			view: { state: { doc: { toString(): string } } };
		}
		const content = document.querySelector('.cm-content') as unknown as {
			cmView?: ContentHandle;
			cmTile?: ContentHandle;
		} | null;
		// Return null (instead of throwing) while the editor is still mounting,
		// e.g. immediately after a reload, so expect.poll keeps retrying.
		const handle = content?.cmView ?? content?.cmTile;
		return handle ? handle.view.state.doc.toString() : null;
	});
}

async function expectDocText(page: Page, expected: string): Promise<void> {
	await expect.poll(() => docText(page)).toBe(expected);
}

async function openWorkspace(page: Page): Promise<void> {
	await page.goto('/lint/');
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
	// The healthy save states draw nothing, so the wording is only in the
	// accessible name.
	await expect(page.getByLabel('Autosave status')).toHaveAttribute('aria-label', /Saved locally/u);
}

async function expectSocialPreview(page: Page): Promise<void> {
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
		'content',
		'https://lyriclint.com/social-preview.png'
	);
	await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
	await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
	await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute(
		'content',
		/LyricLint/u
	);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
		'content',
		'summary_large_image'
	);
	await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
		'content',
		'https://lyriclint.com/social-preview.png'
	);
}

test('the homepage and workbench align the wordmark and link it home', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('link', { name: 'About' })).toHaveAttribute('aria-current', 'page');
	const siteWordmark = page.locator('.site-header .app-wordmark');
	const siteHeader = page.locator('.site-header');
	await expect(siteWordmark).toHaveAttribute('data-state', 'static');
	await expect(siteWordmark).toHaveCSS('transition-property', 'none');
	await expect(siteHeader).not.toHaveAttribute('data-scrolled');
	const borderAtRest = await siteHeader.evaluate(
		(element) => getComputedStyle(element).borderBottomColor
	);
	const siteHeaderBox = await siteHeader.boundingBox();
	const siteWordmarkBox = await siteWordmark.boundingBox();

	// The masthead's contents align with the page container, not the viewport:
	// the brand shares a left edge with the headline and every paragraph.
	const heroInner = page.locator('.lp-hero__inner');
	const heroInnerBox = await heroInner.boundingBox();
	const heroGutter = await heroInner.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).paddingLeft)
	);

	// The transparent border is present at rest so the band never moves; only
	// its paint arrives once content starts travelling underneath the sticky
	// masthead.
	await page.evaluate(() => window.scrollTo(0, 40));
	await expect(siteHeader).toHaveAttribute('data-scrolled', 'true');
	await expect
		.poll(() => siteHeader.evaluate((element) => getComputedStyle(element).borderBottomColor))
		.not.toBe(borderAtRest);
	expect((await siteHeader.boundingBox())?.height).toBe(siteHeaderBox?.height);

	await page.getByRole('link', { name: 'Open the workbench' }).first().click();
	await expect(editor(page)).toBeVisible();
	const toolbarBox = await page.locator('.document-toolbar').boundingBox();

	expect(siteHeaderBox).not.toBeNull();
	expect(siteWordmarkBox).not.toBeNull();
	expect(heroInnerBox).not.toBeNull();
	expect(toolbarBox).not.toBeNull();
	// The band is still exactly the workbench toolbar's height, so arriving at
	// the tool reads as the same window rather than a second product.
	expect(siteHeaderBox!.height).toBe(toolbarBox!.height);
	expect(siteWordmarkBox!.x).toBeCloseTo(heroInnerBox!.x + heroGutter, 1);

	await page.getByRole('link', { name: 'LyricLint home' }).click();
	await expect(page).toHaveURL(/\/$/u);
});

test('marketing home opens the workbench at /lint', async ({ page }) => {
	await page.goto('/');

	await expect(
		page.getByRole('heading', { name: 'Catch Genius formatting problems before you submit.' })
	).toBeVisible();
	// The title the page actually ships. It was shortened in 220ded2 and this
	// assertion was not, so it had been failing since.
	await expect(page).toHaveTitle('LyricLint · For Genius transcribers');
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Genius/u);
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/'
	);
	await expectSocialPreview(page);
	await expect
		.poll(() => page.locator('script[type="application/ld+json"]').textContent())
		.toContain('"@type":"WebApplication"');
	await page.getByRole('link', { name: 'Open the workbench' }).first().click();

	await expect(page).toHaveURL(/\/lint\/$/u);
	await expect(editor(page)).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
	await expect(page.locator('main.workspace h1')).toHaveText('LyricLint transcription workbench');
});

test('the rule reference exposes article metadata and language semantics', async ({ page }) => {
	await page.goto('/rules/');

	await expect(page).toHaveTitle('Genius lyric formatting rules · LyricLint');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/rules/'
	);
	await expectSocialPreview(page);
	await expect
		.poll(() => page.locator('script[type="application/ld+json"]').textContent())
		.toContain('"@type":"CollectionPage"');

	await page.goto('/rules/spelling-arabic-common/');
	// The page is named for the rule, not for the one misspelling its reviewed
	// example happens to carry — the index row that opens it says the same words.
	// The message is still on the page, under the example that produces it.
	await expect(page).toHaveTitle('Standard Arabic spellings · LyricLint');
	await expect(page.locator('main h1')).toHaveText('Standard Arabic spellings');
	// Scoped to the element rather than by text: the same words are in the
	// paragraph and in the `<strong>` inside it, so a bare `getByText` resolves
	// two nodes and fails strict mode.
	await expect(page.locator('p.site-aside strong')).toContainText('Review “لاكن”');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/rules/spelling-arabic-common/'
	);
	await expect
		.poll(() => page.locator('script[type="application/ld+json"]').textContent())
		.toContain('"@type":"TechArticle"');
	await expect(page.locator('pre[lang="ar"][dir="rtl"]')).toHaveCount(2);
});

test('the rule index is searched by symptom and narrowed by chip', async ({ page }) => {
	await page.goto('/rules/');

	// The index proper. The `Popular` block at the head of the column is six of
	// these same rules drawn again, so counting it here makes every assertion
	// about "the whole list" six rows too many — and the readout underneath
	// counts rules rather than rows, so the two disagree. `RuleIndex.svelte.test.ts`
	// excludes it in exactly the same place and for exactly the same reason.
	const rows = page.locator('.rules__index .site-run:not(.rules__popular) a');
	const total = await rows.count();
	expect(total).toBeGreaterThan(40);
	// Nothing is narrowing the list, so there is no count to state.
	await expect(page.locator('.rules__readout')).toHaveCount(0);

	// The reader has the word the linter underlined, not the rule's name — and
	// that word lives only in the reviewed example on this page.
	await page.getByRole('searchbox', { name: 'Search the formatting rules' }).fill('definately');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('Common English misspellings');
	await expect(page.getByText(`1 of ${total} rules`)).toBeVisible();

	// The search survives opening one of its own results, because the list and
	// its filters are mounted by the section's layout rather than by the page.
	await rows.first().click();
	await expect(page).toHaveURL(/\/rules\/spelling-english-common\/$/u);
	await expect(rows).toHaveCount(1);

	// And the rule says why it matched, rather than leaving the reader to find
	// the word themselves down a page of prose and a nine-row table. Three
	// times over: the linter's own wording, the reviewed example, and the row
	// of the table that carries the misspelling. Four, because the reviewed
	// part of the third citation names it too — which is the citations being
	// text on the page like everything else rather than a coincidence.
	await expect(page.locator('main mark.rules__hit')).toHaveCount(4);
	await expect(page.locator('main mark.rules__hit').first()).toHaveText('definately');
	// The example is set in a `<pre>`, so the marks may not have cost it a
	// character. This is the one place that is observable end to end.
	await expect(page.locator('.site-sample--invalid pre')).toHaveText(
		'[Verse]\nI will definately stay'
	);

	// A citation is text on the page too, and searching it is what the reader
	// does when the link in front of them has the word in it. `languages` is
	// the reported case: `Song Headers in Different Languages`, on screen, and
	// the list used to answer `No rule matches this search`.
	await page.getByRole('searchbox', { name: 'Search the formatting rules' }).fill('languages');
	await expect(rows.first()).toBeVisible();
	// It narrows rather than groups — the assumption this was left out on.
	expect(await rows.count()).toBeLessThan(total / 2);
	await rows.filter({ hasText: 'Prefer the localized song part name' }).click();
	const cited = page.locator('.source-reference a mark.rules__hit');
	await expect(cited.first()).toHaveText('Languages');

	// And it gives up the accent inside the link. Measured, accent blue on this
	// fill is 3.92:1 in the dark scheme against the body colour's 9.28:1 — under
	// AA, on the one element added to help somebody read. The underline running
	// through the mark is what still says "link".
	const [marked, prose] = await Promise.all([
		cited.first().evaluate((node) => getComputedStyle(node).color),
		page
			.locator('main p')
			.first()
			.evaluate((node) => getComputedStyle(node).color)
	]);
	expect(marked).toBe(prose);

	await page.getByRole('button', { name: 'Clear filters' }).click();
	// Clearing the filters unmarks the rule as well as widening the list: the
	// query is one answer, read by both columns.
	await expect(page.locator('main mark.rules__hit')).toHaveCount(0);
	await expect(rows).toHaveCount(total);

	// Leaving `No automatic fix` alone is the list of rules that are judgment
	// calls, which is the question the three fix chips exist to answer.
	await page.getByRole('button', { name: /^Automatic fix/u }).click();
	await page.getByRole('button', { name: /^Previewed fix/u }).click();
	const remaining = await rows.count();
	expect(remaining).toBeGreaterThan(0);
	expect(remaining).toBeLessThan(total);
	await expect(rows.filter({ hasText: 'No automatic fix' })).toHaveCount(remaining);
});

test('sitemap lists every public page and excludes the workbench', async ({ request }) => {
	const sitemapResponse = await request.get('/sitemap.xml');
	expect(sitemapResponse.ok()).toBe(true);
	expect(sitemapResponse.headers()['content-type']).toMatch(/(?:application|text)\/xml/u);

	const sitemap = await sitemapResponse.text();
	// The home page, the rule index, and one page per rule — so this number moves
	// by one every time a rule ships. It read 52 against 55 rules for three
	// releases, which is what a bare figure with nothing saying what it counts
	// costs; the arithmetic is written out so the next mismatch is legible.
	const rulePages = sitemap.match(/<loc>https:\/\/lyriclint\.com\/rules\/[^/]+\/<\/loc>/gu) ?? [];
	expect(rulePages).toHaveLength(55);
	// Plus the home page, the rule index, and the privacy page.
	expect(sitemap.match(/<url>/gu)).toHaveLength(rulePages.length + 3);
	expect(sitemap).toContain('<loc>https://lyriclint.com/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/rules/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/privacy/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/rules/spelling-arabic-common/</loc>');
	expect(sitemap).not.toContain('/lint/');

	const robots = await (await request.get('/robots.txt')).text();
	expect(robots).toContain('Sitemap: https://lyriclint.com/sitemap.xml');
});

test('paste → lint → safe fix updates the canonical editor text', async ({ page }) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Chorus: Blair]\nImma stay');

	const diagnostic = page.getByRole('button', {
		name: /^Go to Use “I'ma” instead of “Imma”/u
	});
	await expect(diagnostic).toBeVisible();
	await page.getByRole('button', { name: "Replace with I'ma" }).click();

	await expectDocText(page, "[Chorus: Blair]\nI'ma stay");
	await expect(diagnostic).toHaveCount(0);
});

test('meaning-sensitive spelling uses plain copy and offers a preview action', async ({ page }) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Chorus: Blair]\nCuz I stay');

	const diagnostic = page.getByRole('button', {
		name: /^Go to If “Cuz” means “because,” use “'Cause”/u
	});
	await expect(diagnostic).toBeVisible();
	await expect(
		page.getByText('“Cuz” can also mean “cousin,” so check the lyric before replacing it.')
	).toBeVisible();
	await page.getByRole('button', { name: "Replace with 'Cause" }).click();

	await expectDocText(page, "[Chorus: Blair]\n'Cause I stay");
	await expect(diagnostic).toHaveCount(0);
});

test('language selector re-lints the current text without another editor change', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Verse]\nA lyric');

	const languageConflict = page.getByRole('button', {
		name: /^Go to “Verse” conflicts with the reviewed Norwegian header pack/u
	});
	await expect(languageConflict).toHaveCount(0);

	await page.getByRole('button', { name: 'Lyric language: English' }).click();
	const languageDialog = page.getByRole('dialog', { name: 'Lyric language' });
	await languageDialog.getByPlaceholder('Search languages').fill('Norwegian');
	await languageDialog.getByRole('button', { name: 'Norwegian' }).click();
	await expect(languageConflict).toBeVisible();
	await expect(page.getByRole('button', { name: 'Replace with Vers' })).toBeVisible();

	await page.getByRole('button', { name: 'Lyric language: Norwegian' }).click();
	await languageDialog.getByRole('button', { name: 'English', exact: true }).click();
	await expect(languageConflict).toHaveCount(0);
});

test('new drafts use the last selected language', async ({ page }) => {
	await openWorkspace(page);
	await page.getByRole('button', { name: /^Lyric language:/u }).click();
	const languageDialog = page.getByRole('dialog', { name: 'Lyric language' });
	await languageDialog.getByPlaceholder('Search languages').fill('French');
	await languageDialog.getByRole('button', { name: 'French' }).click();

	await page.getByRole('button', { name: "'Scribes", exact: true }).click();
	await page.getByRole('button', { name: "New 'scribe" }).click();

	await expect(page.getByRole('button', { name: 'Lyric language: French' })).toBeVisible();
	await expectDocText(page, '');
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

test('Copy lyrics writes byte-exact canonical text', async ({ page }) => {
	await openWorkspace(page);
	const canonical = '[Chorus: Blair & <i>Avery</i>]\nLead\n<i>Harmony</i>';
	await replaceDocument(page, canonical);

	await page.getByRole('button', { name: 'Copy lyrics' }).click();
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
		name: /^Go to Use “I'ma” instead of “Imma”/u
	});
	await expect(diagnostic).toBeVisible();

	// The expanded card's ignore control is labelled just “Ignore”; `exact`
	// keeps it apart from the “… ignored / Restore” toggle below the list.
	await page.getByRole('button', { name: 'Ignore', exact: true }).click();
	await expect(diagnostic).toHaveCount(0);
	// Persist the draft before reloading: this spec verifies sessionStorage
	// ignores, not the unload flush path, so the document must survive.
	await waitForSaved(page);
	await page.reload();
	await expectDocText(page, '[Verse]\nImma go');
	await expect(diagnostic).toHaveCount(0);

	await page.getByRole('button', { name: /ignored/u }).click();
	await page.getByRole('button', { name: 'Restore', exact: true }).click();
	await expect(diagnostic).toBeVisible();
});

test('an edit after switching between two drafts remains revision-scoped and durable', async ({
	page
}) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Verse]\nFirst draft');
	await page.getByRole('textbox', { name: "'Scribe title" }).fill('First');
	await page.getByRole('textbox', { name: "'Scribe title" }).press('Enter');
	await editor(page).click();
	await waitForSaved(page);

	await page.getByRole('button', { name: "'Scribes", exact: true }).click();
	await page.getByRole('button', { name: "New 'scribe" }).click();
	await replaceDocument(page, '[Verse]\nSecond draft');
	await page.getByRole('textbox', { name: "'Scribe title" }).fill('Second');
	await page.getByRole('textbox', { name: "'Scribe title" }).press('Enter');
	await editor(page).click();
	await waitForSaved(page);

	// The row's own control leads with the draft's name; the commands beside it
	// carry that name too ("Rename First"), so anchor on the start of the label.
	await page.getByRole('button', { name: "'Scribes", exact: true }).click();
	await page.getByRole('button', { name: /^First/u }).click();
	await expectDocText(page, '[Verse]\nFirst draft');
	await page.getByRole('button', { name: "'Scribes", exact: true }).click();
	await page.getByRole('button', { name: /^Second/u }).click();
	await expectDocText(page, '[Verse]\nSecond draft');

	const durableEdit = '[Verse]\nEdited after switching twice';
	await replaceDocument(page, durableEdit);
	await waitForSaved(page);
	await page.reload();
	await expectDocText(page, durableEdit);
});

/**
 * A `.sr-only` live region inside an expanded diagnostic card once scrolled the
 * whole app shell away — toolbar and status bar off screen, with no scrollbar
 * and no wheel gesture to bring them back. Two independent causes, both pinned
 * here against a probe shaped like that live region rather than against whichever
 * component currently ships one: an absolutely positioned box escaped the panel's
 * scroll clipping and reported its offset down the list as shell-level scrollable
 * overflow, and the shell hid that overflow instead of clipping it, so a stray
 * `scrollIntoView` or focus call could move it.
 */
test('nothing in the panel can scroll the app shell', async ({ page }) => {
	await openWorkspace(page);
	await replaceDocument(page, '[Verse]\nImma stay');
	const toolbar = page.getByRole('button', { name: 'Copy lyrics' });
	await expect(toolbar).toBeInViewport();

	const metrics = await page.locator('.right-panel__body').evaluate((panel) => {
		const shellElement = document.querySelector('main.workspace') as HTMLElement;
		const probe = document.createElement('p');
		probe.className = 'sr-only';
		probe.textContent = 'probe';
		const spacer = document.createElement('div');
		spacer.style.height = '3000px';
		panel.append(spacer, probe);
		shellElement.scrollTop = 500;
		return {
			probeTop: probe.getBoundingClientRect().top,
			shellBottom: shellElement.getBoundingClientRect().bottom,
			scrollHeight: shellElement.scrollHeight,
			clientHeight: shellElement.clientHeight,
			scrollTop: shellElement.scrollTop
		};
	});

	// The probe resolves against the panel it lives in, so it stays inside the shell.
	expect(metrics.probeTop).toBeLessThanOrEqual(metrics.shellBottom);
	expect(metrics.scrollHeight).toBe(metrics.clientHeight);
	// And the shell has no scroll port at all, so even a direct write is refused.
	expect(metrics.scrollTop).toBe(0);
	await expect(toolbar).toBeInViewport();
});

test.describe('phone', () => {
	// A phone is a coarse pointer *and* a small viewport, so the emulation has to
	// set both: `hasTouch` is what makes `(pointer: coarse)` match. Upright, the
	// workbench is served like anywhere else — stacked by the 68rem breakpoint,
	// not gated away.
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('serves the workbench upright and asks for a rotation on its side', async ({ page }) => {
		await page.goto('/lint/');

		await expect(page.locator('main.workspace')).toBeVisible();
		await expect(editor(page)).toBeVisible();
		await expect(page.getByRole('heading', { name: 'LyricLint needs the tall side' })).toBeHidden();

		// Sideways there is no height left to divide between the editor and the
		// panel, so this one orientation is refused. Gone from the layout and from
		// the accessibility tree, not just painted over.
		await page.setViewportSize({ width: 844, height: 390 });
		await expect(
			page.getByRole('heading', { name: 'LyricLint needs the tall side' })
		).toBeVisible();
		await expect(page.locator('main.workspace')).toBeHidden();
		await expect(editor(page)).toBeHidden();
	});

	/**
	 * The notice waits for the boot screen, and this is the only place that can
	 * see it: the boot screen is in the prerendered HTML and covers the whole
	 * window, toasts included, so a notice raised any earlier would spend its
	 * countdown behind it and be gone before anyone saw it. What is asserted is
	 * therefore the order — nothing of the notice while the boot screen is on
	 * screen — and that it still arrives afterwards, which is the half a plain
	 * delete would also have passed.
	 */
	test('holds the touch notice until the boot screen has gone', async ({ page }) => {
		// Scoped to the region that draws it: the same words are also written into
		// the sr-only live region, and an unscoped text match would be two nodes.
		const notice = page.locator('.toast-region').getByText('LyricLint is quicker on a laptop');
		const boot = page.locator('.boot-screen');

		await page.goto('/lint/');

		// The boot screen is in the prerendered HTML, so it is on screen from the
		// first paint and this is a state to assert against rather than a race to
		// win.
		await expect(boot).toBeVisible();
		await expect(notice).toHaveCount(0);

		await expect(boot).toHaveCount(0);
		await expect(notice).toBeVisible();

		// And it is a toast rather than the modal it was: the workbench is behind
		// it the whole time, not dimmed out and waiting on an answer.
		await expect(editor(page)).toBeVisible();
		await page.getByRole('button', { name: 'Dismiss notification' }).click();
		await expect(notice).toHaveCount(0);
	});
});

test('a short desktop window keeps the workbench', async ({ page }) => {
	// The same height as the landscape phone above, with a fine pointer: a short
	// window on a laptop is a supported size, and telling someone with a mouse to
	// rotate their screen is the failure the pointer half of the query prevents.
	await page.setViewportSize({ width: 844, height: 390 });
	await openWorkspace(page);
	await expect(page.getByRole('heading', { name: 'LyricLint needs the tall side' })).toBeHidden();
});

test('offline reopen from cache via the service worker', async ({ page, context }) => {
	await openWorkspace(page);
	const text = '[Verse]\nOffline again';
	await replaceDocument(page, text);
	await waitForSaved(page);

	// Wait until the service worker is active and controlling the page (it
	// calls clients.claim on activate) so the offline reload can be served
	// from the precache.
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	await context.setOffline(true);
	await page.reload();
	await expect(editor(page)).toBeVisible();
	await expectDocText(page, text);
	await context.setOffline(false);
});

/**
 * The offline snapshot is the app, not the site: `/` and `/lint/` are precached
 * and the ~57 rule reference pages — most of the deploy by bytes, re-fetched
 * per visitor per deploy when they were precached — are not. A rules page joins
 * the snapshot by being read, which is the navigation strategy writing what it
 * serves. Both halves are pinned: re-adding the reference to the precache is
 * the specific cost regression, and losing the runtime write would quietly
 * shrink the offline promise to the two precached pages.
 */
test('the offline snapshot precaches the app and admits a rules page when read', async ({
	page,
	context
}) => {
	await openWorkspace(page);
	await page.evaluate(() => navigator.serviceWorker.ready);
	await expect
		.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
		.toBe(true);

	const cachedPages = () =>
		page.evaluate(async () => {
			const paths: string[] = [];
			for (const name of await caches.keys()) {
				const cache = await caches.open(name);
				paths.push(...(await cache.keys()).map((request) => new URL(request.url).pathname));
			}
			return paths.filter((path) => !path.startsWith('/_app/'));
		});

	await expect.poll(cachedPages).toContain('/lint/');
	expect(await cachedPages()).not.toContainEqual(expect.stringMatching(/^\/rules\//u));

	await page.goto('/rules/');
	await expect.poll(cachedPages).toContain('/rules/');

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Genius lyric formatting rules' })).toBeVisible();
	await context.setOffline(false);
});

/**
 * The error page's way out has to be a new document.
 *
 * This screen is on the reader precisely because the client runtime failed, and
 * the failure is usually a rejected dynamic import — which the browser caches
 * against that module's URL, so a client-side navigation re-imports it and fails
 * instantly, forever. The button then does nothing on the one screen whose whole
 * job is offering a way out.
 *
 * Asserted as behaviour rather than as `data-sveltekit-reload`, because what has
 * to hold is that the document is replaced; the attribute is only how.
 */
test('the error page leaves by loading a new document, not by routing', async ({ page }) => {
	await page.goto('/this-route-does-not-exist/');
	await expect(
		page.getByRole('heading', { name: 'LyricLint could not open this page' })
	).toBeVisible();

	// Survives a client-side navigation; destroyed by a document load.
	await page.evaluate(() => {
		(window as unknown as { __errorPageDocument?: string }).__errorPageDocument = 'same document';
	});

	await page.getByRole('link', { name: 'Return to the workspace' }).click();
	await expect(editor(page)).toBeVisible();
	expect(
		await page.evaluate(
			() => (window as unknown as { __errorPageDocument?: string }).__errorPageDocument
		)
	).toBeUndefined();
});

/**
 * The site keeps the assistant as an answers-only dialog; the workbench puts
 * that same persisted conversation in its fourth panel tab. No assistant
 * backend runs under this suite, so the request is blocked explicitly and the
 * failed turn gives both surfaces a transcript and a retry to render.
 */
test('the rules dialog and workbench tab share one persisted conversation', async ({ page }) => {
	await page.route('**/v1/answers', (route) => route.abort());
	await page.goto('/rules/');
	const prompt = page.getByLabel('Ask about the guidelines');
	await prompt.fill('When does a chorus need its own header?');
	await prompt.press('Enter');

	const dialog = page.getByRole('dialog', { name: 'Ask the rules' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByLabel('Conversation', { exact: true })).toContainText(
		'When does a chorus need its own header?'
	);
	await expect(dialog.getByLabel('Your question')).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Retry' })).toBeVisible();
	await expect(dialog.getByRole('button', { name: 'Allow' })).toHaveCount(0);

	// The same conversation survives a real navigation, but its workbench home
	// is the second tab rather than another modal entry point.
	await openWorkspace(page);
	const tabs = page.getByRole('tablist', { name: 'Document panels' }).getByRole('tab');
	await expect(tabs).toHaveCount(4);
	await expect(tabs.nth(1)).toHaveText('Assistant');
	await expect(tabs.nth(2)).toHaveText('Tools');
	await expect(tabs.nth(3)).toHaveText('Performers');
	await tabs.nth(1).click();

	const assistantPanel = page.getByRole('tabpanel', { name: 'Assistant' });
	await expect(assistantPanel.getByLabel('Conversation', { exact: true })).toContainText(
		'When does a chorus need its own header?'
	);
	await expect(assistantPanel.getByLabel('Your question')).toBeVisible();
	await expect(assistantPanel.getByRole('button', { name: 'Retry' })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

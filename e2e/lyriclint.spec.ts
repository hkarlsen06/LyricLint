import { expect, test, type Locator, type Page } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

/**
 * The page-side globals these probes hang on `window`. They exist only inside a
 * `page.evaluate` callback, written by one of them and read by the next; the
 * type is erased before the callback is serialised into the browser.
 */
interface ProbeWindow extends Window {
	__csp?: string[];
	__errorPageDocument?: string;
}

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
		interface ContentElement extends Element {
			cmView?: ContentHandle;
			cmTile?: ContentHandle;
		}
		const content = document.querySelector<ContentElement>('.cm-content');
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

	// The nav is the three destinations that are not already the brand: no
	// `About` beside a wordmark that links the same page, and `App` at the
	// width the row actually has. Re-adding a second way home is the
	// regression.
	const nav = page.getByRole('navigation', { name: 'Site' });
	await expect(nav.getByRole('link')).toHaveText(['Guidelines', 'Linter Rules', 'App']);
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
	await expect(page).toHaveTitle('Free lyric formatter for Genius transcriptions · LyricLint');
	await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /Genius/u);
	await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/'
	);
	await expectSocialPreview(page);
	await expect
		.poll(async () =>
			(await page.locator('script[type="application/ld+json"]').allTextContents()).some((json) =>
				json.includes('"@type":"WebApplication"')
			)
		)
		.toBe(true);
	await page.getByRole('link', { name: 'Open the workbench' }).first().click();

	await expect(page).toHaveURL(/\/lint\/$/u);
	await expect(editor(page)).toBeVisible();
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
	await expect(page.locator('main.workspace h1')).toHaveText('LyricLint transcription workbench');
});

test('the landing page activates its real editor only near the live demo', async ({ page }) => {
	await page.goto('/');

	const fallback = page.locator('.site-demo__fallback');
	await expect(fallback).toBeVisible();
	await expect(editor(page)).toHaveCount(0);

	// Reaching the prerendered stand-in crosses the component's look-ahead
	// boundary. CodeMirror replaces the same-shaped text rather than joining the
	// first navigation, and the fallback retires once the real editor is ready.
	await fallback.scrollIntoViewIfNeeded();
	await expect(editor(page)).toBeVisible();
	await expect(fallback).toHaveCount(0);
});

test('a landing video keeps its still until its first frame is ready', async ({ page }) => {
	let releaseVideo!: () => void;
	const videoReleased = new Promise<void>((resolve) => {
		releaseVideo = resolve;
	});
	await page.route('**/workbench.webm', async (route) => {
		await videoReleased;
		await route.continue();
	});

	await page.goto('/', { waitUntil: 'domcontentloaded' });

	const frame = page.locator('.lp-shot__frame').first();
	const poster = frame.locator('.lp-shot__poster');
	await expect(poster).toBeVisible();
	await expect(frame).not.toHaveAttribute('data-video-ready', '');

	releaseVideo();
	await expect(frame).toHaveAttribute('data-video-ready', '');
	await expect(poster).toHaveCSS('opacity', '0');
});

test('the rule reference exposes article metadata and language semantics', async ({ page }) => {
	await page.goto('/rules/');

	await expect(page).toHaveTitle('The rules the linter checks · LyricLint');
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		'href',
		'https://lyriclint.com/rules/'
	);
	await expectSocialPreview(page);
	await expect
		.poll(() => page.locator('script[type="application/ld+json"]').textContent())
		.toContain('"@type":"CollectionPage"');

	// `/rules/` is the guide: the conventions written out, one section per
	// family, in the same order the list beside it runs. It used to be a page
	// *about* the list — how the reference is derived, how to use the search
	// field — which is documentation for somebody who already knew what they
	// were looking for, while the reader arriving from the landing page did not
	// know the conventions at all.
	const conventions = page.locator('main.rules__guide h2');
	expect(await conventions.count()).toBeGreaterThan(15);
	await expect(conventions.first()).toHaveText('Section headers');
	await expect(page.locator('main.rules__guide h2#spelling')).toBeVisible();
	// Every section states its convention and then names the ways it goes
	// wrong, which are links into the rules themselves.
	await expect(page.locator('#section + p')).toContainText('Every distinct song part carries');
	await expect(
		page.locator('.rules__checks a', { hasText: 'A section with no header' }).first()
		// The slash is required, not optional: `trailingSlash: 'always'` makes the
		// bare path a 301, and links carrying it were why Search Console credited
		// no rule page as an internal-link target.
	).toHaveAttribute('href', /\/rules\/section-header-missing\/$/u);
	// The eight per-language spelling rules are one entry with its packs after
	// it, here and in the list, rather than eight near-identical names.
	await expect(page.locator('.rules__checks-family')).toHaveText(
		'Spellings the reviewed guides correct (English, Norwegian, German, Spanish, French, Arabic, Japanese, Korean)'
	);

	await page.goto('/rules/spelling-arabic-common/');
	// The page is named for what the rule catches rather than for the one
	// misspelling its reviewed example happens to carry — the index row that
	// opens it says the same words. The message is still on the page, under the
	// example that produces it.
	await expect(page).toHaveTitle('A non-standard Arabic spelling · LyricLint');
	await expect(page.locator('main h1')).toHaveText('A non-standard Arabic spelling');
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

	// A rule page names the convention behind it in the guidance catalog, and
	// the press lands the topic page on the entry itself — the reverse of the
	// entry's own "Checked by" ids, derived from the same mapping.
	await page.goto('/rules/numbers-spell-out/');
	await page
		.locator('main.site-split__page')
		.getByRole('link', { name: 'Spell numbers out' })
		.click();
	await expect(page).toHaveURL(/\/guidelines\/numbers\/#spelled-out$/u);
	await expect(page.locator('.guidelines__entry[data-current] h2')).toHaveText('Spell numbers out');
});

test('the rule index is searched by symptom and narrowed by chip', async ({ page }) => {
	await page.goto('/rules/');

	// The index proper. The `Popular` block at the head of the column is six of
	// these same rules drawn again, so counting it here makes every assertion
	// about "the whole list" six rows too many — and the readout underneath
	// counts rules rather than rows, so the two disagree. `RuleIndex.svelte.test.ts`
	// excludes it in exactly the same place and for exactly the same reason.
	const rows = page.locator('.site-split__index .site-run:not(.rules__popular) a');
	const total = await rows.count();
	expect(total).toBeGreaterThan(40);
	// Nothing is narrowing the list, so there is no count to state.
	await expect(page.locator('.site-finder__readout')).toHaveCount(0);

	// The reader has the word the linter underlined, not the rule's name — and
	// that word lives only in the reviewed example on this page.
	await page.getByRole('searchbox', { name: 'Search the formatting rules' }).fill('definately');
	await expect(rows).toHaveCount(1);
	await expect(rows.first()).toContainText('A common English misspelling');
	// Scoped to the visible readout: the always-mounted `role="status"` region
	// carries the same sentence for a screen reader, so the bare text resolves
	// to two elements.
	await expect(page.locator('.site-finder__readout')).toContainText(`1 of ${total} rules`);

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
	await expect(page.locator('main mark.site-hit')).toHaveCount(4);
	await expect(page.locator('main mark.site-hit').first()).toHaveText('definately');
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
	await rows.filter({ hasText: 'An English name for a localized part' }).click();
	const cited = page.locator('.source-reference a mark.site-hit');
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
	await expect(page.locator('main mark.site-hit')).toHaveCount(0);
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

test('a guidelines deep link lands on its entry, and a search marks its words', async ({
	page
}) => {
	// A guideline is a fragment on its topic's page, and the landing re-centers
	// the whole entry — the double-rAF deferral in the topic page is the one
	// behavior there that was measured rather than reasoned into, and this is
	// its only end-to-end pin. The native hash jump parks the heading at
	// `scroll-margin-top`, ~72px under the masthead; centered, the third entry
	// of four sits well below that, which is what the y-floor separates.
	await page.goto('/guidelines/punctuation/#doubled-exclamation');
	// `data-current` is the page's own mark, read off the hash; a full-page
	// arrival is the one navigation where `:target` also holds, so both are
	// asserted here — the router-navigation press further down is where
	// `:target` never updates and the mark is all there is.
	const washed = page.locator('.guidelines__entry[data-current]');
	await expect(washed).toHaveCount(1);
	await expect(page.locator('.guidelines__entry:has(:target)')).toHaveCount(1);
	await expect(washed.locator('h2')).toHaveText('One exclamation mark at a time');
	// And the wash actually paints here: on a wide screen the index stands
	// beside the page, so the washed entry and the marked row say one thing
	// together. The stacked width is where it stands down — the phone group
	// pins that half.
	expect(await washed.evaluate((el) => getComputedStyle(el, '::before').content)).not.toBe('none');
	// The topic page no longer closes with a `Checked by the linter` run: the
	// entries' own meta lines carry the rules now, and every rule page links its
	// guideline back — re-adding the trailing family list is the regression.
	await expect(page.getByRole('heading', { name: 'Checked by the linter' })).toHaveCount(0);
	await expect
		.poll(async () => (await washed.locator('h2').boundingBox())?.y ?? 0)
		.toBeGreaterThan(140);

	// The index column marks the same entry as the page and brings the row up
	// under the finder, for a reader who arrived by URL rather than by pressing
	// it there.
	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toContainText('One exclamation mark at a time');
	await expect(current).toBeInViewport();

	// The topic's own name keeps everything under its heading — the query that
	// used to drop every guidance entry and answer with linter rows alone. The
	// seventh row is the ad-libs entry, whose meta line names
	// `punctuation.parenthesis-spacing` among the rules that check its shape.
	const search = page.getByRole('searchbox', { name: 'Search the transcription guidelines' });
	await search.fill('punctuation');
	const entryRows = page.locator('.site-split__index .site-run a[href*="#"]');
	await expect(entryRows).toHaveCount(7);

	// And the page a search opens says which of its words matched, exactly as a
	// rule page does — including inside the invented sample, which may not have
	// gained a character for it. Scoped to the washed entry: the topic page
	// carries one `Incorrect` sample per entry that has one, so the bare
	// locator resolves several and fails strict mode.
	await search.fill('turn it up');
	await page.locator('.site-split__index .site-run a', { hasText: 'One exclamation mark' }).click();
	await expect(page.locator('main mark.site-hit').first()).toBeVisible();
	await expect(
		page.locator('.guidelines__entry[data-current] .site-sample--invalid pre')
	).toHaveText('Turn it up!!');
});

test('pressing an entry from the index washes it on the first press', async ({ page }) => {
	// Pressing an index row from the index page — or from the other topic — is
	// the router's navigation, a `pushState`, and `:target` only updates on a
	// native fragment navigation: for a while the first press drew no wash, and
	// the reader had to press another entry and come back (a same-path hash
	// press, the one navigation the router leaves to the browser) to see it.
	// The page marks the entry itself now, and this is that regression's pin at
	// both broken arrivals.
	await page.goto('/guidelines/');
	await page.locator('.site-split__index .site-run a', { hasText: 'One exclamation mark' }).click();
	const washed = page.locator('.guidelines__entry[data-current]');
	await expect(washed).toHaveCount(1);
	await expect(washed.locator('h2')).toHaveText('One exclamation mark at a time');

	// And from one topic straight to the other — the path changes, the hash
	// arrives with it, and the wash has to land on the pressed entry, not stay
	// where the last one was.
	const crossTopic = page
		.locator('.site-split__index .site-run a[href*="section-headers"][href*="#"]')
		.first();
	const crossTitle = await crossTopic.locator('.site-run__title').innerText();
	await crossTopic.click();
	await expect(washed).toHaveCount(1);
	await expect(washed.locator('h2')).toHaveText(crossTitle);
});

test('a topic heading in the index opens the whole topic page from the top', async ({ page }) => {
	// Every row under a topic heading is a fragment on one page, and the
	// heading is the way to read that page whole. No fragment rides the press,
	// so the arrival leads the page and the index marks the leading section —
	// the same answer a topic opened with no hash lands on.
	await page.goto('/guidelines/');
	await page.locator('.site-index__group a', { hasText: 'Punctuation' }).click();
	await expect(page).toHaveURL(/\/guidelines\/punctuation\/$/u);
	await expect(page.locator('main h1')).toHaveText('Punctuation');

	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
});

test('a topic pressed on the welcome page reveals its rows in the list', async ({ page }) => {
	// The welcome page's topic list is in the detail column, so pressing a
	// topic there says nothing about the list — which is then parked wherever
	// it was, the top for a fresh load, with the arrived-at topic's rows
	// marking themselves several screens below the fold to nobody. The reveal
	// has to run for this arrival exactly as for a deep link: `pressedARow`
	// reads where the press actually landed, not merely that the navigation
	// started inside the section.
	await page.goto('/guidelines/');
	await page.locator('.site-split__detail a', { hasText: 'Ad-libs' }).click();
	await expect(page).toHaveURL(/\/guidelines\/ad-libs\/$/u);

	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toContainText('Transcribe every ad-lib');
	await expect(current).toBeInViewport();
	// In the column rather than under its pinned finder, which `toBeInViewport`
	// cannot see past.
	const finder = await page.locator('.site-split__index .site-finder').boundingBox();
	await expect
		.poll(async () => (await current.boundingBox())?.y ?? 0)
		.toBeGreaterThan(finder!.y + finder!.height - 1);
});

test('pressing a row the reader can see moves the list by nothing', async ({ page }) => {
	// The other half of the same rule, which the reveal above must not regress:
	// a row pressed in the list is by definition one the reader can see, so
	// opening it may not move the list under their pointer.
	await page.goto('/guidelines/');
	const column = page.locator('.site-split__index');
	await column.evaluate((el) => {
		const heading = [...el.querySelectorAll('.site-index__group')].find(
			(h) => h.textContent?.trim() === 'Ad-libs'
		);
		el.scrollTop += heading!.getBoundingClientRect().top - el.getBoundingClientRect().top - 200;
	});
	const before = await column.evaluate((el) => el.scrollTop);
	await page
		.locator('.site-split__index .site-run a', { hasText: 'Echo repeats are not ad-libs' })
		.click();
	await expect(page.locator('.guidelines__entry[data-current] h2')).toHaveText(
		'Echo repeats are not ad-libs'
	);
	// Give a wrongly armed reveal its frames to fire before reading the offset.
	await page.waitForTimeout(400);
	expect(await column.evaluate((el) => el.scrollTop)).toBe(before);
});

test('the spelling topic lists the standardized spellings, and the finder searches them', async ({
	page
}) => {
	// The table is drawn from the same `ruleLookupTable` the rule page loads —
	// one data source, two surfaces — so the row count is the reviewed table's
	// own, not a hand-written excerpt that would go stale beside it.
	await page.goto('/guidelines/spelling/');
	const rows = page.locator('.rules__lookup-row');
	await expect(rows.first()).toBeVisible();
	expect(await rows.count()).toBeGreaterThan(20);

	// A spelling the page lists has to answer the finder — the citation lesson,
	// arriving here for lookup tables — and the open page marks the form. The
	// index draws no linter rows any more, so what the query lands on is the
	// standardized-spellings landmark, through `spelling.standardized`'s own
	// lookup terms folded into its haystack.
	const search = page.getByRole('searchbox', { name: 'Search the transcription guidelines' });
	await search.fill('whoa');
	await expect(
		page.locator('.site-split__index .site-run a[href$="#standardized-spellings"]')
	).toBeVisible();
	await expect(page.locator('main mark.site-hit').first()).toBeVisible();

	// The landmark states its standing beside the entries', which it did not
	// for a while: the table led the catalog's first topic under a lede
	// promising every convention names its tier and its source, and was the one
	// section naming neither. The tier and the citation come off the landmark's
	// own record, so what is checked here is that the section draws them.
	const landmark = page.locator('.guidelines__landmark');
	await expect(landmark.locator('.site-meta')).toContainText('Genius staff guidance');
	await expect(landmark.locator('.site-meta a[href="https://genius.com/9298624"]')).toHaveCount(1);

	// A meta line naming more than three rules folds them behind one disclosure,
	// counted from `relatedRuleIds` at render time — nine consecutive monospace
	// links used to stand between the tier line and the statement. Unfolded,
	// the ids land in a full-width row under the whole line (the citations' own
	// `order` trick) and still open a tab.
	await search.fill('');
	const orthography = page.locator('.guidelines__entry:has(#standard-orthography)');
	const fold = orthography.getByRole('button', { name: '9 rules' });
	await expect(fold).toHaveAttribute('aria-expanded', 'false');
	await expect(orthography.locator('a.site-code')).toHaveCount(0);
	await fold.click();
	await expect(fold).toHaveAttribute('aria-expanded', 'true');
	const unfolded = orthography.locator('a.site-code');
	await expect(unfolded).toHaveCount(9);
	await expect(unfolded.first()).toHaveAttribute('target', '_blank');
});

test('a fragment naming nothing falls back to the lead, and a landmark washes', async ({
	page
}) => {
	// A fragment is somebody else's string, so one that resolves to no heading
	// must not be published as the reading position — that left the index
	// marking no row at all until the next scroll event. The lead section is
	// what a topic opened with no fragment lands on, and it is the honest answer
	// here too.
	await page.goto('/guidelines/spelling/#no-such-anchor');
	const current = page.locator('.site-split__index a[aria-current="page"]');
	await expect(current).toHaveCount(1);
	await expect(current).toContainText('The standardized spellings');
	// And no wash: nothing on the page carries the name the link asked for.
	await expect(
		page.locator('.guidelines__entry[data-current], .guidelines__landmark[data-current]')
	).toHaveCount(0);

	// A landmark is a deep-link target exactly as an entry is — the index and
	// every rule page's guideline link both name its anchor — so it takes the
	// same arrival wash through the same pair of marks.
	await page.goto('/guidelines/spelling/#standardized-spellings');
	await expect(page.locator('.guidelines__landmark[data-current]')).toHaveCount(1);
	await expect(page.locator('.guidelines__landmark:has(:target)')).toHaveCount(1);
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
	expect(rulePages).toHaveLength(60);
	// One page per guidance topic — this number moves when `guidanceTopicTitles`
	// gains a topic with entries, which docs/guidelines.md tells the contributor.
	const guidelinePages =
		sitemap.match(/<loc>https:\/\/lyriclint\.com\/guidelines\/[^/]+\/<\/loc>/gu) ?? [];
	expect(guidelinePages).toHaveLength(10);
	// Plus the home page, the rule index, the guidelines index, and the privacy
	// page.
	expect(sitemap.match(/<url>/gu)).toHaveLength(rulePages.length + guidelinePages.length + 4);
	expect(sitemap).toContain('<loc>https://lyriclint.com/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/rules/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/guidelines/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/guidelines/punctuation/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/privacy/</loc>');
	expect(sitemap).toContain('<loc>https://lyriclint.com/rules/spelling-arabic-common/</loc>');
	expect(sitemap).not.toContain('/lint/');

	const robots = await (await request.get('/robots.txt')).text();
	expect(robots).toContain('Sitemap: https://lyriclint.com/sitemap.xml');
});

/**
 * The Content-Security-Policy, pinned where it can actually fail.
 *
 * Every page is prerendered, so the policy rides in a `<meta http-equiv>` that
 * SvelteKit writes from `csp` in `vite.config.ts` — and the three grants below
 * are the ones whose loss looks exactly like working code. A missing
 * `wasm-unsafe-eval` or `worker-src blob:` takes Harper out silently, leaving a
 * workbench that lints natively and simply never proofreads; and a `style-src`
 * that grows a hash makes the browser ignore the `unsafe-inline` beside it,
 * which unstyles CodeMirror, every Svelte transition and the boot screen at
 * once. None of that is a build error.
 *
 * The negative half matters as much: an assertion that the app draws is not
 * evidence that the policy is enforced rather than absent, so this also refuses
 * a foreign script, image, frame and object and checks the browser said so.
 */
test('the prerendered policy admits the workbench and refuses everything else', async ({
	page
}) => {
	const violations: string[] = [];
	await page.addInitScript(() => {
		(window as ProbeWindow).__csp = [];
		document.addEventListener('securitypolicyviolation', (event) => {
			(window as ProbeWindow).__csp?.push(`${event.effectiveDirective} <- ${event.blockedURI}`);
		});
	});
	page.on('pageerror', (error) => violations.push(`pageerror: ${error.message}`));

	await openWorkspace(page);

	const policy = await page
		.locator('meta[http-equiv="content-security-policy"]')
		.getAttribute('content');
	expect(policy).toBeTruthy();
	const csp = policy ?? '';

	// Harper: a same-origin wasm compiled inside a worker built from a blob.
	expect(csp).toContain("'wasm-unsafe-eval'");
	expect(csp).toMatch(/worker-src[^;]*blob:/u);
	// Nothing here evals JavaScript, and `wasm-unsafe-eval` is deliberately the
	// narrower grant rather than a step towards the wider one.
	expect(csp).not.toContain("'unsafe-eval'");

	// CodeMirror's StyleModule, Svelte's transitions and the boot screen's style
	// attribute are all inline and none can be hashed under a meta policy — and a
	// hash in this directive is what would switch `unsafe-inline` off.
	const styleSrc = /style-src ([^;]*)/u.exec(csp)?.[1] ?? '';
	expect(styleSrc).toContain("'unsafe-inline'");
	expect(styleSrc).not.toMatch(/sha(?:256|384|512)-/u);

	// The hydration script is admitted by hash, never by loosening the directive.
	const scriptSrc = /script-src ([^;]*)/u.exec(csp)?.[1] ?? '';
	expect(scriptSrc).toMatch(/sha256-/u);
	expect(scriptSrc).not.toContain("'unsafe-inline'");

	// `frame-ancestors` is one of three directives a meta policy ignores, so it
	// belongs in `static/_headers` and must not be written here as a no-op.
	expect(csp).not.toContain('frame-ancestors');

	// The workbench came up and nothing was refused bringing it up.
	await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
	expect(await page.evaluate(() => (window as ProbeWindow).__csp)).toEqual([]);

	// And the policy is enforced rather than merely present.
	await page.evaluate(() => {
		const img = document.createElement('img');
		img.src = 'https://example.com/blocked.png';
		document.body.append(img);
		const script = document.createElement('script');
		script.src = 'https://example.com/blocked.js';
		document.head.append(script);
		const frame = document.createElement('iframe');
		frame.src = 'https://example.com/';
		document.body.append(frame);
		const object = document.createElement('object');
		object.data = 'https://example.com/blocked.swf';
		document.body.append(object);
	});
	await expect
		.poll(() => page.evaluate(() => (window as ProbeWindow).__csp))
		.toEqual(
			expect.arrayContaining([
				expect.stringContaining('script-src'),
				expect.stringContaining('img-src'),
				expect.stringContaining('frame-src'),
				expect.stringContaining('object-src')
			])
		);
	expect(violations).toEqual([]);
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

	// A dialog, not a toolbar: the surface contains Tab (dialog-conventional),
	// where a toolbar promises that Tab exits.
	const picker = page.getByRole('dialog', { name: 'Assign performers' });
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

test('ignored diagnostics survive a reload and can be restored', async ({ page }) => {
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
	// Persist the draft before reloading: this spec verifies the durable
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

test.describe('phone reference sections', () => {
	// The same emulation the workbench's phone block uses: `hasTouch` is what
	// makes `(pointer: coarse)` match, and the width is under the 62rem stack.
	test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

	test('the stacked index leads with a finder a finger can focus', async ({ page }) => {
		// The stack leads with the index at the index view — measured the other
		// way round, the whole guide stood above the search field, ten phone
		// viewports of prose between a reader and the section's primary control.
		await page.goto('/rules/');
		const search = page.getByRole('searchbox', { name: 'Search the formatting rules' });
		await expect(search).toBeInViewport();

		// And the field computes at least 16px under a coarse pointer, or iOS
		// Safari answers the focus by zooming the page in and never back out.
		// The element-selector raise in `responsive.css` loses to any class that
		// sizes a field, which is exactly how this one shipped at 13px — the
		// class-level restatement is what this pins. Emulation cannot reproduce
		// the zoom itself; the size is the whole mechanism.
		expect(
			Number.parseFloat(await search.evaluate((field) => getComputedStyle(field).fontSize))
		).toBeGreaterThanOrEqual(16);

		// The guide still follows, in order, below the rows.
		const guide = page.getByRole('heading', { name: 'The rules the linter checks' });
		const guideBox = await guide.boundingBox();
		const finderBox = await search.boundingBox();
		expect(guideBox!.y).toBeGreaterThan(finderBox!.y);
	});

	test('the arrival wash stands down where the index is not beside the page', async ({ page }) => {
		// The wash exists to tie the washed entry to the marked row in the index
		// column — one selection, said by both columns at once. Stacked, the
		// list is `display: none` under an open page, so there is no row on
		// screen to agree with, and the paint stands down; the mark itself
		// stays, because the index reads the same state when the reader goes
		// back.
		await page.goto('/guidelines/punctuation/#doubled-exclamation');
		const washed = page.locator('.guidelines__entry[data-current]');
		await expect(washed).toHaveCount(1);
		expect(await washed.evaluate((el) => getComputedStyle(el, '::before').content)).toBe('none');
	});

	test('deep in a topic the way back stays pinned, and a jump clears it', async ({ page }) => {
		// The masthead is static at this width and the index is `display: none`
		// under an open page, so the pinned back bar is the one piece of
		// navigation a reader eight viewports into a topic still has.
		await page.goto('/guidelines/section-headers/');
		await page.mouse.wheel(0, 6000);
		await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(3000);
		const back = page.getByRole('button', { name: 'All guidelines' });
		await expect(back).toBeInViewport();

		// A deep-linked heading lands clear of the pinned bar: the headings'
		// `scroll-margin-top` moves with the same seam the bar's top edge does.
		await page.goto('/guidelines/section-headers/#voice-order');
		const heading = page.locator('#voice-order');
		await expect(heading).toBeVisible();
		const headingBox = await heading.boundingBox();
		const barBox = await page.locator('.site-split__backbar').boundingBox();
		expect(headingBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1);
	});
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
 * and the 60 rule reference pages — most of the deploy by bytes, re-fetched
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
	expect(await cachedPages()).not.toContain('/workbench.png');
	expect(await cachedPages()).not.toContainEqual(expect.stringMatching(/^\/rules\//u));

	await page.goto('/rules/');
	await expect.poll(cachedPages).toContain('/rules/');

	await context.setOffline(true);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'The rules the linter checks' })).toBeVisible();
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
		(window as ProbeWindow).__errorPageDocument = 'same document';
	});

	await page.getByRole('link', { name: 'Return to the workspace' }).click();
	await expect(editor(page)).toBeVisible();
	expect(await page.evaluate(() => (window as ProbeWindow).__errorPageDocument)).toBeUndefined();
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
	// The assistant's entry point is the sparkles toggle beside the search field —
	// the workbench tab strip's own glyph, found by accessible name for the same
	// reason the tab is. Struck through at rest, pressing it sweeps the wand to
	// the head of the row and turns the search field into the ask field; Enter
	// there opens the modal with the question already sent.
	const spark = page.getByRole('button', { name: 'Ask the assistant' });
	await expect(spark).toHaveAttribute('aria-pressed', 'false');
	await spark.click();
	await expect(spark).toHaveAttribute('aria-pressed', 'true');
	const ask = page.getByLabel('Ask about the formatting rules');
	// Hidden, not gone: both bars stay mounted so the toggle's wipe has
	// something on both sides of its edge.
	await expect(page.getByLabel('Search the formatting rules')).toBeHidden();
	await ask.fill('When does a chorus need its own header?');
	await ask.press('Enter');

	// One truthful name from both sections and the workbench: the same modal
	// opens from `/guidelines/` too, where `Ask the rules` was false on arrival.
	const dialog = page.getByRole('dialog', { name: 'Ask LyricLint' });
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
	await expect(tabs).toHaveCount(5);
	// Assistant is a glyph, so it is found by accessible name rather than by text.
	await expect(tabs.nth(1)).toHaveAccessibleName('Assistant');
	await expect(tabs.nth(2)).toHaveText('Performers');
	await expect(tabs.nth(3)).toHaveText('Song');
	await expect(tabs.nth(4)).toHaveText('Preferences');
	await tabs.nth(1).click();

	const assistantPanel = page.getByRole('tabpanel', { name: 'Assistant' });
	await expect(assistantPanel.getByLabel('Conversation', { exact: true })).toContainText(
		'When does a chorus need its own header?'
	);
	await expect(assistantPanel.getByLabel('Your question')).toBeVisible();
	await expect(assistantPanel.getByRole('button', { name: 'Retry' })).toBeVisible();
	await expect(page.getByRole('dialog')).toHaveCount(0);
});

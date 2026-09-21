import { expect, test, type Page } from '@playwright/test';

// Network stalls must reach Playwright instead of the worker's precached modules.
test.use({ serviceWorkers: 'block' });

async function trackViewTransitions(page: Page, unsupported = false) {
	await page.addInitScript((unsupported) => {
		const start = document.startViewTransition?.bind(document);
		Object.defineProperty(document, 'startViewTransition', {
			configurable: true,
			value:
				unsupported || !start
					? undefined
					: (...args: Parameters<typeof start>) => {
							const root = document.documentElement;
							root.dataset.transitionsStarted = String(
								Number(root.dataset.transitionsStarted ?? 0) + 1
							);
							return start(...args);
						}
		});
	}, unsupported);
}

for (const scenario of [
	{ name: 'desktop', width: 1440, reducedMotion: 'no-preference' },
	{ name: 'phone', width: 390, reducedMotion: 'no-preference' },
	{ name: 'reduced motion', width: 390, reducedMotion: 'reduce' },
	{ name: 'without View Transitions', width: 1440, reducedMotion: 'no-preference' }
] as const) {
	test(`workbench navigation starts its splash during loading on ${scenario.name}`, async ({
		page
	}) => {
		await page.setViewportSize({ width: scenario.width, height: 844 });
		await page.emulateMedia({ reducedMotion: scenario.reducedMotion });
		await trackViewTransitions(page, scenario.name === 'without View Transitions');
		await page.goto('/about/');
		// Let the current page hydrate before deliberately blocking route modules.
		await page.waitForLoadState('networkidle');
		const app = page.getByRole('link', { name: 'App', exact: true });
		await app.evaluate((link) => {
			link.setAttribute('data-sveltekit-preload-data', 'off');
			link.setAttribute('data-sveltekit-preload-code', 'off');
		});

		let release!: () => void;
		const downloading = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/*', async (route) => {
			const url = route.request().url();
			if (
				route.request().resourceType() === 'script' &&
				(url.includes('/workbench/') || url.includes('/_app/immutable/nodes/'))
			)
				await downloading;
			await route.continue();
		});

		try {
			await app.click();
			const splash = page.locator('.navigation-splash');
			await expect(splash).toBeVisible();
			await expect(page).toHaveURL(/\/about\/$/);
			await expect(splash).toHaveAttribute('aria-hidden', 'true');
			await expect(page.getByText('Opening the workbench…', { exact: true })).toHaveAttribute(
				'aria-live',
				'polite'
			);
			await expect
				.poll(() => splash.boundingBox())
				.toEqual({
					x: 0,
					y: 0,
					width: scenario.width,
					height: 844
				});
			if (scenario.reducedMotion === 'reduce') {
				await expect(splash.locator('.app-wordmark')).toHaveCSS('animation-name', 'none');
			}
			const native =
				scenario.reducedMotion !== 'reduce' &&
				(await page.evaluate(() => !!document.startViewTransition));
			await expect
				.poll(() => page.locator('html').getAttribute('data-transitions-started'))
				.toBe(native ? '1' : null);
			// The download is still paused while the pull and landing sequence runs.
			await expect(splash).toHaveAttribute('data-wait', '');
			await expect(splash.locator('.app-wordmark')).toHaveCSS('--wm-open', '0');

			release();
			await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
			await expect(splash).toHaveCount(0);
			await expect
				.poll(() => page.locator('html').getAttribute('data-transitions-started'))
				.toBe(native ? '2' : null);
			await expect(page.locator('html')).not.toHaveAttribute('data-navigation-transition');
			await page.reload();
			await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
			await expect(splash).toHaveCount(0);
			await expect(page.locator('html')).not.toHaveAttribute('data-transitions-started');
		} finally {
			release();
		}
	});
}

test('a hot workbench exit covers the editor before rendering the destination', async ({
	page
}) => {
	await page.addInitScript(() => {
		const start = document.startViewTransition.bind(document);
		let captured = false;
		document.startViewTransition = (...args: Parameters<typeof start>) => {
			if (captured) return start(...args);
			captured = true;
			return start(async () => {
				document.documentElement.setAttribute('data-capture-held', '');
				await new Promise<void>((resolve) =>
					window.addEventListener('release-splash-capture', () => resolve(), { once: true })
				);
				const update = typeof args[0] === 'function' ? args[0] : args[0]?.update;
				await update?.();
			});
		};
	});
	await page.goto('/workbench/');
	const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
	await expect(editor).toBeVisible();
	await page.waitForLoadState('networkidle');
	const home = page.getByRole('link', { name: 'LyricLint home', exact: true });
	await home.hover();
	await page.waitForLoadState('networkidle');
	try {
		await home.click();
		await expect(page.locator('html')).toHaveAttribute('data-capture-held', '');
		await expect(editor).toBeVisible();
		await expect(page.locator('.site')).toHaveCount(0);
		await page.evaluate(() => window.dispatchEvent(new Event('release-splash-capture')));
		await expect(page).toHaveURL(new URL('/', page.url()).href);
		await expect(page.locator('.navigation-splash')).toBeVisible();
		await expect(page.locator('.site')).toBeVisible();
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
	} finally {
		await page.evaluate(() => window.dispatchEvent(new Event('release-splash-capture')));
	}
});

test('a preloaded page still plays the full spring and radial reveal', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/about/');
	await page.waitForLoadState('networkidle');
	const privacy = page.getByRole('link', { name: 'Privacy', exact: true });
	await privacy.hover();
	await page.waitForLoadState('networkidle');
	await privacy.click();
	await expect(page).toHaveURL(/\/privacy\/$/);
	await expect(page.getByText('Opening page…', { exact: true })).toHaveCount(0);
	await expect(page.locator('.navigation-splash')).toBeVisible();

	const sequence = await page.evaluate(async () => {
		const stages = new Set<string>();
		let pulled = false;
		let exploded = false;
		let radial = false;
		const started = performance.now();
		while (performance.now() - started < 5000) {
			const splash = document.querySelector<HTMLElement>('.navigation-splash');
			if (!splash) break;
			stages.add(splash.dataset.stage!);
			const mark = splash.querySelector('.app-wordmark')!;
			pulled ||= Number(getComputedStyle(mark).getPropertyValue('--wm-open')) > 1;
			const shock = Number(getComputedStyle(splash).getPropertyValue('--boot-shock'));
			exploded ||= shock > 0 && shock < 1;
			radial ||= getComputedStyle(splash, '::before').maskImage.includes('radial-gradient');
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		}
		return { stages: [...stages], pulled, exploded, radial };
	});
	expect(sequence.stages).toEqual(expect.arrayContaining(['pull', 'land']));
	expect(sequence).toMatchObject({ pulled: true, exploded: true, radial: true });
	await expect(page.locator('.navigation-splash')).toHaveCount(0);
	await expect(page.locator('html')).not.toHaveAttribute('data-navigation-transition');
});

for (const gesture of ['pointer', 'synthetic'] as const) {
	test(`a ${gesture} navigation supersedes the splash until its own page finishes loading`, async ({
		page
	}) => {
		await page.goto('/about/');
		await page.waitForLoadState('networkidle');
		const app = page.getByRole('link', { name: 'App', exact: true });
		const guide = page.getByRole('link', { name: 'Guide', exact: true });
		for (const link of [app, guide]) {
			await link.evaluate((link) => {
				link.setAttribute('data-sveltekit-preload-data', 'off');
				link.setAttribute('data-sveltekit-preload-code', 'off');
			});
		}
		let release!: () => void;
		const downloading = new Promise<void>((resolve) => (release = resolve));
		let releaseGuide!: () => void;
		const guideDownloading = new Promise<void>((resolve) => (releaseGuide = resolve));
		let guideRequested = false;
		await page.route('**/*', async (route) => {
			const url = route.request().url();
			if (url.includes('/guidelines/__data.json')) {
				guideRequested = true;
				await guideDownloading;
			} else if (
				route.request().resourceType() === 'script' &&
				(url.includes('/workbench/') || url.includes('/_app/immutable/nodes/'))
			)
				await downloading;
			await route.continue();
		});
		try {
			await app.click();
			await expect(page.locator('.navigation-splash')).toBeVisible();
			if (gesture === 'pointer') await guide.click();
			// Synthetic click omits pointerdown, exercising navigation cancellation itself.
			else await guide.evaluate((link: HTMLAnchorElement) => link.click());
			await expect.poll(() => guideRequested).toBe(true);
			await expect(page.getByText('Opening page…', { exact: true })).toHaveAttribute(
				'aria-live',
				'polite'
			);
			release();
			await expect(page.locator('.navigation-splash')).toBeVisible();
			await expect(page).toHaveURL(/\/about\/$/);
			releaseGuide();
			await expect(page).toHaveURL(/\/guidelines\/$/);
			await expect(page.locator('.navigation-splash')).toHaveCount(0);
		} finally {
			release();
			releaseGuide();
		}
	});
}
for (const [name, from, to] of [
	['site to site', '/about/', '/guidelines/'],
	['workbench to site', '/workbench/', '/']
] as const) {
	test(`the splash starts before loading ${name}`, async ({ page }) => {
		await page.goto(from);
		await page.waitForLoadState('networkidle');
		if (from === '/workbench/') {
			await expect(page.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		}
		const link = page.locator(`a[href="${to}"], a[href^="${to}#"]`).first();
		const destination = await link.evaluate((link: HTMLAnchorElement) => {
			link.setAttribute('data-sveltekit-preload-data', 'off');
			link.setAttribute('data-sveltekit-preload-code', 'off');
			return link.href;
		});
		let release!: () => void;
		const downloading = new Promise<void>((resolve) => (release = resolve));
		let blocked = false;
		await page.route('**/*', async (route) => {
			const url = route.request().url();
			if (
				url.includes(`${to}__data.json`) ||
				(route.request().resourceType() === 'script' &&
					(url.includes('/src/routes/') || url.includes('/_app/immutable/nodes/')))
			) {
				blocked = true;
				await downloading;
			}
			await route.continue();
		});
		try {
			await link.click();
			await expect.poll(() => blocked).toBe(true);
			await expect(page.locator('.navigation-splash')).toBeVisible();
			await expect(page).toHaveURL(new URL(from, page.url()).href);
			await expect(page.getByText('Opening page…', { exact: true })).toHaveAttribute(
				'aria-live',
				'polite'
			);
			release();
			await expect(page).toHaveURL(destination);
			await expect(page.locator('.navigation-splash')).toHaveCount(0);
			await expect(page.locator('html')).not.toHaveAttribute('data-navigation-transition');
		} finally {
			release();
		}
	});
}

for (const width of [1440, 390]) {
	test(`browsing the loaded guide never starts a splash at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await trackViewTransitions(page);
		await page.goto('/guidelines/');
		await page.waitForLoadState('networkidle');
		const index = page.locator('.site-split__index');
		await index.locator('a[href="/guidelines/spelling/"]').click();
		await expect(page).toHaveURL(/\/guidelines\/spelling\/$/);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);

		await page
			.getByRole('navigation', { name: 'Guide navigation' })
			.getByRole('button', { name: width === 390 ? 'Topics' : 'Introduction', exact: true })
			.click();
		await expect(index.getByRole('searchbox')).toBeInViewport();
		const punctuation = index
			.locator('a[href="/guidelines/punctuation/"], a[href^="/guidelines/punctuation/#"]')
			.first();
		const destination = await punctuation.evaluate((link: HTMLAnchorElement) => link.href);
		await punctuation.click();
		await expect(page).toHaveURL(destination);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);

		await page.goBack();
		await expect(page).toHaveURL(/\/guidelines\/spelling\/$/);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
		await page.goForward();
		await expect(page).toHaveURL(destination);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
		await page.getByRole('link', { name: 'Guide', exact: true }).click();
		await expect(page).toHaveURL(/\/guidelines\/$/);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
		await expect(page.locator('html')).not.toHaveAttribute('data-transitions-started');
	});
}

test('history navigation transitions while query and fragment changes do not', async ({ page }) => {
	await trackViewTransitions(page);
	await page.goto('/about/');
	await page.waitForLoadState('networkidle');
	await page.getByRole('link', { name: 'Guide', exact: true }).click();
	await expect(page).toHaveURL(/\/guidelines\/$/);
	await expect(page.locator('.navigation-splash')).toHaveCount(0);
	await expect(page.locator('html')).not.toHaveAttribute('data-navigation-transition');
	const transitions = () =>
		page.locator('html').getAttribute('data-transitions-started').then(Number);
	let previous = await transitions();
	expect(previous).toBeGreaterThan(0);

	for (const direction of ['back', 'forward'] as const) {
		if (direction === 'back') await page.goBack();
		else await page.goForward();
		await expect(page).toHaveURL(direction === 'back' ? /\/about\/$/ : /\/guidelines\/$/);
		await expect.poll(transitions).toBeGreaterThan(previous);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
		await expect(page.locator('html')).not.toHaveAttribute('data-navigation-transition');
		previous = await transitions();
	}

	for (const href of ['/guidelines/?q=voice', '/guidelines/?q=voice#navigation-test']) {
		await page.evaluate((href) => {
			const link = document.createElement('a');
			link.href = href;
			document.body.append(link);
			link.click();
			link.remove();
		}, href);
		await expect(page).toHaveURL(new URL(href, page.url()).href);
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
		expect(await transitions()).toBe(previous);
	}
});

for (const refusal of ['another tab', 'unavailable storage'] as const) {
	test(`workbench navigation dismisses its splash for ${refusal}`, async ({ page, context }) => {
		if (refusal === 'another tab') {
			const owner = await context.newPage();
			await owner.goto('/workbench/');
			await expect(owner.getByRole('textbox', { name: 'Lyrics editor' })).toBeVisible();
		} else {
			await page.addInitScript(() => {
				IDBFactory.prototype.open = () => {
					throw new DOMException('Storage blocked', 'SecurityError');
				};
			});
		}
		await page.goto('/about/');
		await page.waitForLoadState('networkidle');
		await page.getByRole('link', { name: 'App', exact: true }).click();
		if (refusal === 'another tab') {
			await expect(page.getByRole('heading', { name: /open in another tab/ })).toBeVisible();
		} else {
			await expect(page.getByRole('alert')).toContainText('Local storage is unavailable');
		}
		await expect(page.locator('.navigation-splash')).toHaveCount(0);
	});
}

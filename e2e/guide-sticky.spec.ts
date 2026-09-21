import { expect, test, type Locator } from '@playwright/test';

async function scrollInside(pane: Locator, selector: string, distance = 100) {
	await pane.evaluate(
		(port, { selector, distance }) => {
			const section = port.querySelector<HTMLElement>(selector)!;
			port.scrollTop +=
				section.getBoundingClientRect().top - port.getBoundingClientRect().top + distance;
		},
		{ selector, distance }
	);
}

async function expectPinned(title: Locator, above: Locator, below = false) {
	await expect
		.poll(async () => {
			const [titleBox, aboveBox] = await Promise.all([title.boundingBox(), above.boundingBox()]);
			return Math.abs(titleBox!.y - aboveBox!.y - (below ? aboveBox!.height : 0));
		})
		.toBeLessThan(2);
}

async function expectGlassThrough(pane: Locator, heading: Locator) {
	await expect(pane.locator('.guide-glass')).toHaveCount(1);
	await expect
		.poll(() =>
			heading.evaluate((element) => {
				const port = element.closest('.site-split__detail, .site-split__index')!;
				const glass = port.querySelector('.guide-glass')!;
				return Math.abs(
					Number.parseFloat(getComputedStyle(glass, '::before').height) -
						(element.getBoundingClientRect().bottom - port.getBoundingClientRect().top)
				);
			})
		)
		.toBeLessThan(2);
}

async function expectReachable(control: Locator) {
	await expect
		.poll(() =>
			control.evaluate((element) => {
				const bounds = element.getBoundingClientRect();
				const glass = element
					.closest('.site-split__detail, .site-split__index')!
					.querySelector<HTMLElement>('.guide-glass')!;
				// Make the decorative layer hittable to verify it paints below the
				// controls, rather than merely allowing clicks through blurred text.
				glass.style.pointerEvents = 'auto';
				try {
					return element.contains(
						document.elementFromPoint(
							bounds.left + bounds.width / 2,
							bounds.top + bounds.height / 2
						)
					);
				} finally {
					glass.style.removeProperty('pointer-events');
				}
			})
		)
		.toBe(true);
}

for (const width of [1440, 390]) {
	for (const reducedMotion of ['no-preference', 'reduce'] as const) {
		test(`guide context stays pinned without moving content at ${width}px with ${reducedMotion} motion`, async ({
			page
		}) => {
			test.setTimeout(60_000);
			await page.setViewportSize({ width, height: 900 });
			await page.emulateMedia({ reducedMotion });
			await page.goto('/guidelines/section-headers/');
			await page.evaluate(() => document.fonts.ready);
			const detail = page.locator('.site-split__detail');
			const topic = detail.locator('#topic-section-headers');
			const firstEntry = detail.locator('.guidelines__entry:has(#bracketed-headers)');
			const firstHeader = firstEntry.locator('.guidelines__entry-heading');
			await expect(detail.locator('main')).toBeInViewport();
			await detail.evaluate((port) => {
				port.scrollTop = 0;
			});
			await expect(topic).toHaveCSS('font-size', '28px');
			await expect
				.poll(() =>
					detail
						.locator('.guide-glass')
						.evaluate((glass) => getComputedStyle(glass, '::before').height)
				)
				.toBe('0px');
			const navigation = page.getByRole('navigation', { name: 'Guide navigation' });
			for (const surface of [page.locator('.site-header'), navigation, topic, firstHeader]) {
				await expect(surface).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
				await expect(surface).toHaveCSS('backdrop-filter', 'none');
			}

			// Sample the whole transition: the smaller sticky title must not pull
			// the following prose upward, including while its font size changes.
			const samples = await detail.evaluate(async (port) => {
				const topic = port.querySelector<HTMLElement>('#topic-section-headers')!;
				const entry = port.querySelector<HTMLElement>(
					'.guidelines__entry:has(#bracketed-headers)'
				)!;
				const prose = entry.querySelector<HTMLElement>(':scope > p')!;
				const read = () => ({
					font: Number.parseFloat(getComputedStyle(topic).fontSize),
					position:
						prose.getBoundingClientRect().top - port.getBoundingClientRect().top + port.scrollTop
				});
				const samples = [read()];
				port.scrollTop +=
					entry.getBoundingClientRect().top - port.getBoundingClientRect().top + 100;
				for (let frame = 0; frame < 90; frame++) {
					await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
					samples.push(read());
					if (frame > 2 && samples.at(-1)!.font <= 19.01) break;
				}
				return samples;
			});
			expect(samples.at(-1)!.font).toBeCloseTo(19, 1);
			if (reducedMotion === 'no-preference') {
				expect(samples.some(({ font }) => font > 19.1 && font < 27.9)).toBe(true);
			} else {
				expect(samples.every(({ font }) => font === 28 || font === 19)).toBe(true);
			}
			expect(
				Math.max(...samples.map(({ position }) => Math.abs(position - samples[0].position)))
			).toBeLessThan(2);
			await expectPinned(topic, detail);
			await expectPinned(firstHeader, topic, true);
			await expect(firstHeader.locator('.site-meta')).toBeInViewport();
			await expect(firstHeader.getByRole('link')).toBeInViewport();
			await expectGlassThrough(detail, firstHeader);
			const glass = detail.locator('.guide-glass');
			await expect(glass).toHaveAttribute('aria-hidden', 'true');
			await expect(glass).toHaveCSS('pointer-events', 'none');
			expect(
				await glass.evaluate((element) => getComputedStyle(element, '::before').backdropFilter)
			).toBe('blur(12px)');
			expect(
				await detail.evaluate(
					(port) =>
						Array.from(port.querySelectorAll('*')).filter(
							(element) => getComputedStyle(element).backdropFilter !== 'none'
						).length
				)
			).toBe(0);
			await expectReachable(firstHeader.getByRole('link'));
			await expect(firstHeader).toHaveCSS('border-bottom-width', '0px');
			await detail.evaluate((port) => {
				port.scrollTop += 60;
			});
			await expectPinned(firstHeader, topic, true);

			// A fragment arrival while its heading is already pinned must return
			// to the entry's real start rather than measuring the sticky box.
			await page.evaluate(() => {
				location.hash = 'bracketed-headers';
			});
			await expect
				.poll(() =>
					firstEntry.evaluate((entry) => {
						const port = entry.closest('.site-split__detail')!;
						const clearance = Number.parseFloat(
							getComputedStyle(entry.querySelector('h2')!).scrollMarginTop
						);
						return Math.abs(
							entry.getBoundingClientRect().top - port.getBoundingClientRect().top - clearance
						);
					})
				)
				.toBeLessThan(2);
			await scrollInside(detail, '.guidelines__entry:has(#bracketed-headers)');
			await expectGlassThrough(detail, firstHeader);
			await expectReachable(firstHeader.getByRole('link'));

			// During an entry handoff, the departing title must disappear beneath
			// the topic while the rest of its source row remains above the glass.
			await firstEntry.evaluate((entry) => {
				const port = entry.closest('.site-split__detail')!;
				const topic = entry.closest('.guide-topic')!.querySelector('.guide-topic-title')!;
				const header = entry.querySelector('.guidelines__entry-heading')!;
				port.scrollTop +=
					entry.getBoundingClientRect().bottom -
					(topic.getBoundingClientRect().bottom + header.getBoundingClientRect().height - 20);
			});
			await expect
				.poll(() =>
					firstHeader.evaluate((header) => {
						const port = header.closest('.site-split__detail')!;
						const pin = header
							.closest('.guide-topic')!
							.querySelector<HTMLElement>('.guide-topic-pin')!;
						const topic = pin.querySelector('.guide-topic-title')!;
						const glass = port.querySelector<HTMLElement>('.guide-glass')!;
						const boundary = topic.getBoundingClientRect().bottom;
						const x = header.getBoundingClientRect().left + 30;
						// Probe below the topic's paint to test clipping, not just stacking order.
						pin.style.pointerEvents = 'none';
						glass.style.pointerEvents = 'auto';
						try {
							return {
								covered: document.elementFromPoint(x, boundary - 4) === glass,
								visible: header.contains(document.elementFromPoint(x, boundary + 4))
							};
						} finally {
							pin.style.removeProperty('pointer-events');
							glass.style.removeProperty('pointer-events');
						}
					})
				)
				.toEqual({ covered: true, visible: true });

			const secondEntry = detail.locator('.guidelines__entry:has(#artist-identifiers)');
			await scrollInside(detail, '.guidelines__entry:has(#artist-identifiers)');
			await expectPinned(secondEntry.locator('.guidelines__entry-heading'), topic, true);
			await expect(firstHeader).not.toBeInViewport();
			const current = page.locator('.site-split__index a[aria-current="page"]');
			await expect(current).toHaveAttribute('href', /#artist-identifiers$/u);
			await expect
				.poll(() =>
					current.evaluate((row) => {
						const heading = row.closest('.guide-topic')!.querySelector('.guide-topic-title')!;
						return row.getBoundingClientRect().top - heading.getBoundingClientRect().bottom;
					})
				)
				.toBeGreaterThanOrEqual(-1);

			const spelling = detail.locator('#topic-spelling');
			await scrollInside(detail, '.guidelines__landmark:has(#standardized-spellings)');
			await expect(spelling).toHaveCSS('font-size', '19px');
			await expectPinned(spelling, detail);
			await expectPinned(
				detail.locator('.guidelines__landmark .guidelines__entry-heading'),
				spelling,
				true
			);
			await expect(topic).not.toBeInViewport();

			// Expanding pinned citations must grow the same backdrop and leave its
			// controls above the glass, including on a selected entry.
			const sourceEntrySelector =
				'.guidelines__entry:has(.guidelines__entry-heading button[aria-expanded])';
			const sourceHeader = detail
				.locator(sourceEntrySelector)
				.first()
				.locator('.guidelines__entry-heading');
			await scrollInside(detail, sourceEntrySelector);
			const sources = sourceHeader.getByRole('button', { name: 'Sources', exact: true });
			await expectReachable(sources);
			const closedHeight = (await sourceHeader.boundingBox())!.height;
			await sources.click();
			await expect(sources).toHaveAttribute('aria-expanded', 'true');
			await expect
				.poll(async () => (await sourceHeader.boundingBox())!.height)
				.toBeGreaterThan(closedHeight);
			await expectGlassThrough(detail, sourceHeader);
			await expectReachable(sourceHeader.getByRole('link').first());
			await sources.click();
			await expectGlassThrough(detail, sourceHeader);
			await detail.evaluate((port) => {
				port.scrollTop = 0;
			});
			await expect(topic).toHaveCSS('font-size', '28px');

			const index = page.locator('.site-split__index');
			if (width === 390) {
				await page
					.getByRole('navigation', { name: 'Guide navigation' })
					.getByRole('button', { name: 'Topics', exact: true })
					.click();
			}
			await expect(index.getByRole('searchbox')).toBeInViewport();
			const group = index.locator('.guide-topic').first();
			const indexTitle = group.locator('.guide-topic-title');
			await index.evaluate((port) => {
				port.scrollTop = 0;
			});
			await expect(indexTitle).toHaveCSS('font-size', '28px');
			await scrollInside(index, '.guide-topic', 30);
			await expect(indexTitle).toHaveCSS('font-size', '19px');
			await expectPinned(indexTitle, index.locator('.site-finder'), true);
			// A departing topic must stop painting at the search area's lower edge.
			await group.evaluate((group) => {
				const port = group.closest('.site-split__index')!;
				const finder = port.querySelector('.site-finder')!;
				const title = group.querySelector('.guide-topic-title')!;
				port.scrollTop +=
					group.getBoundingClientRect().bottom -
					(finder.getBoundingClientRect().bottom + title.getBoundingClientRect().height - 20);
			});
			await expect
				.poll(() =>
					indexTitle.evaluate((title) => {
						const finder = title.closest('.site-split__index')!.querySelector('.site-finder')!;
						const boundary = finder.getBoundingClientRect().bottom;
						const x = title.getBoundingClientRect().left + 30;
						return {
							covered: !document.elementsFromPoint(x, boundary - 4).includes(title),
							visible: document.elementsFromPoint(x, boundary + 4).includes(title)
						};
					})
				)
				.toEqual({ covered: true, visible: true });
			await scrollInside(index, '.guide-topic', 30);
			await expectGlassThrough(index, indexTitle);
			await expectReachable(index.getByRole('searchbox'));
			await index.evaluate((port) => {
				port.scrollTop += 100;
			});
			await expectPinned(indexTitle, index.locator('.site-finder'), true);
			await scrollInside(index, '.guide-topic + .guide-topic', 30);
			await expect(indexTitle).not.toBeInViewport();
			const nextTitle = index.locator('.guide-topic').nth(1).locator('.guide-topic-title');
			await expectPinned(nextTitle, index.locator('.site-finder'), true);
			await index.evaluate((port) => {
				port.scrollTop = 0;
			});
			await expect(indexTitle).toHaveCSS('font-size', '28px');
			await index.getByRole('searchbox').fill('header');
			await expect(index.locator('.guide-topic')).toHaveCount(0);
			await index.evaluate((port) => {
				port.scrollTop = 100;
			});
			await expectGlassThrough(index, index.locator('.site-finder'));
			await expectReachable(index.getByRole('searchbox'));
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);
		});
	}
}

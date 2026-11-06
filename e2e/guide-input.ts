import { test as base } from '@playwright/test';
import { open } from 'node:fs/promises';

export const test = base.extend<{ guideInput: void }>({
	guideInput: [
		async ({ page, browserName }, use, info) => {
			if (browserName !== 'chromium') return use();
			const session = await page.context().newCDPSession(page);
			try {
				await session.send('Tracing.start', {
					categories: 'input,cc,latencyInfo,blink.user_timing',
					transferMode: 'ReturnAsStream'
				});
				await page.addInitScript(() => {
					for (const type of ['mousemove', 'wheel', 'scroll', 'scrollend']) {
						document.addEventListener(
							type,
							(event) => {
								const strip = document.querySelector('.site-split');
								if (
									!strip ||
									((type === 'scroll' || type === 'scrollend') && event.target !== strip)
								)
									return;
								const pointer = event instanceof MouseEvent ? event : undefined;
								performance.mark('lyriclint-guide-input', {
									detail: {
										event: type,
										trusted: event.isTrusted,
										left: strip.scrollLeft,
										width: strip.clientWidth,
										detailTop: document.querySelector('.site-split__detail')?.scrollTop,
										target:
											event.target instanceof Element ? event.target.getAttribute('class') : null,
										x: pointer?.clientX,
										y: pointer?.clientY,
										hit: pointer
											? document
													.elementFromPoint(pointer.clientX, pointer.clientY)
													?.getAttribute('class')
											: null,
										deltaX: event instanceof WheelEvent ? event.deltaX : undefined,
										deltaY: event instanceof WheelEvent ? event.deltaY : undefined
									}
								});
							},
							{ capture: true, passive: true }
						);
					}
				});
				await use();
				const completed = new Promise<{ stream?: string }>((resolve) =>
					session.once('Tracing.tracingComplete', resolve)
				);
				await session.send('Tracing.end');
				const { stream } = await completed;
				if (!stream) throw new Error('Chromium did not return the guide input trace.');
				const path = info.outputPath('guide-native-input.json');
				try {
					const file = await open(path, 'w');
					try {
						while (true) {
							const chunk = await session.send('IO.read', { handle: stream });
							await file.writeFile(
								Buffer.from(chunk.data, chunk.base64Encoded ? 'base64' : 'utf8')
							);
							if (chunk.eof) break;
						}
						await file.sync();
					} finally {
						await file.close();
					}
				} finally {
					await session.send('IO.close', { handle: stream });
				}
				await info.attach('guide-native-input', { path, contentType: 'application/json' });
				const data = await page.evaluate(() => ({
					viewport: { width: innerWidth, height: innerHeight },
					reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
					events: performance
						.getEntriesByName('lyriclint-guide-input')
						.filter((entry) => entry instanceof PerformanceMark)
						.map((entry) => ({ time: entry.startTime, detail: entry.detail }))
				}));
				await info.attach('guide-input-events', {
					body: JSON.stringify(data),
					contentType: 'application/json'
				});
			} finally {
				await session.detach();
			}
		},
		{ auto: true }
	]
});

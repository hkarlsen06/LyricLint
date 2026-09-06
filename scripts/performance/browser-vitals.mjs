/**
 * Cold-browser lab navigation and interaction audit, never a field INP estimate.
 * bun scripts/performance/browser-vitals.mjs BASE_URL OUTPUT.json [RUNS=3]
 * Run against a production preview, with no concurrent Lighthouse/build/test workload.
 * Optional PERF_SCREENSHOTS=1 saves each page beside OUTPUT.json.
 * PERF_ROUTES=/ limits a targeted rerun; default is all three audited routes.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const [baseURL, outputPath, runCount = '3'] = process.argv.slice(2);
assert(baseURL && outputPath, 'Pass BASE_URL and OUTPUT.json');
const runs = Number(runCount);
assert(Number.isInteger(runs) && runs > 0, 'RUNS must be a positive integer');
const profiles = {
	mobile: {
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 1,
		isMobile: true,
		hasTouch: true,
		cpu: 4,
		latency: 150,
		throughput: 1_600_000 / 8
	},
	desktop: {
		viewport: { width: 1350, height: 940 },
		deviceScaleFactor: 1,
		isMobile: false,
		hasTouch: false,
		cpu: 1,
		latency: 40,
		throughput: 10_000_000 / 8
	}
};
const routes = (process.env.PERF_ROUTES ?? '/,/workbench/,/guidelines/').split(',');
assert(
	routes.every((route) => ['/', '/workbench/', '/guidelines/'].includes(route)),
	'Unknown audit route'
);
const settleMs = 10_000;
const browser = await chromium.launch({ headless: true });
const report = {
	kind: 'lab',
	baseURL,
	browser: browser.version(),
	startedAt: new Date().toISOString(),
	conditions: {
		profiles,
		runs,
		routes,
		settleMs,
		cache: 'fresh browser context for every navigation',
		serviceWorkers: 'allowed',
		loadCutoff: '10 seconds after DOMContentLoaded',
		interactionMetric:
			'largest observed Event Timing interaction duration (16 ms threshold); not field INP',
		transferScope: 'page target CDP loadingFinished; may exclude service-worker background requests'
	},
	results: []
};
await mkdir(dirname(outputPath), { recursive: true });

function installObservers() {
	const entries = { lcp: [], shifts: [], events: [], longTasks: [] };
	const observers = [];
	const supported = PerformanceObserver.supportedEntryTypes;
	const observe = (type, key, map, extra = {}) => {
		if (!supported.includes(type)) return;
		const consume = (records) => entries[key].push(...records.map(map));
		const observer = new PerformanceObserver((list) => consume(list.getEntries()));
		observer.observe({ type, buffered: true, ...extra });
		observers.push({ observer, consume });
	};
	observe('largest-contentful-paint', 'lcp', (e) => ({
		startTime: e.startTime,
		size: e.size,
		element: e.element?.tagName,
		url: e.url
	}));
	observe('layout-shift', 'shifts', (e) => ({
		startTime: e.startTime,
		value: e.value,
		hadRecentInput: e.hadRecentInput
	}));
	observe(
		'event',
		'events',
		(e) => ({
			name: e.name,
			startTime: e.startTime,
			duration: e.duration,
			interactionId: e.interactionId,
			inputDelay: e.processingStart - e.startTime,
			processingDuration: e.processingEnd - e.processingStart
		}),
		{ durationThreshold: 16 }
	);
	observe('longtask', 'longTasks', (e) => ({ startTime: e.startTime, duration: e.duration }));
	globalThis.readAudit = () => {
		for (const { observer, consume } of observers) consume(observer.takeRecords());
		let cls = 0,
			windowScore = 0,
			first = -Infinity,
			previous = -Infinity;
		for (const shift of entries.shifts) {
			if (shift.hadRecentInput) continue;
			if (shift.startTime - previous >= 1000 || shift.startTime - first >= 5000) {
				windowScore = 0;
				first = shift.startTime;
			}
			windowScore += shift.value;
			previous = shift.startTime;
			cls = Math.max(cls, windowScore);
		}
		const nav = performance.getEntriesByType('navigation')[0];
		return {
			atMs: performance.now(),
			ttfbMs: nav?.responseStart - nav?.startTime,
			fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
			lcpMs: entries.lcp.at(-1)?.startTime ?? null,
			lcpCandidate: entries.lcp.at(-1) ?? null,
			cls,
			navigation: nav?.toJSON(),
			...structuredClone(entries),
			resources: performance.getEntriesByType('resource').map((e) => ({
				name: e.name,
				initiatorType: e.initiatorType,
				duration: e.duration,
				transferSize: e.transferSize,
				encodedBodySize: e.encodedBodySize
			})),
			horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - innerWidth)
		};
	};
}

async function interact(page, route, profile) {
	const actions = [];
	async function action(name, run) {
		const start = await page.evaluate(() => performance.now());
		await run();
		await page.waitForTimeout(300);
		actions.push({ name, startMs: start, endMs: await page.evaluate(() => performance.now()) });
	}
	if (route === '/workbench/') {
		const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
		await editor.waitFor({ state: 'visible', timeout: 120_000 });
		await action('Paste representative lyrics', () =>
			editor.fill(
				'[Verse]\nImma go home\nI hear the rain\nWe walk along\nAnd sing again\n\n[Chorus]\nHold on to me\nHold on to me\n\n[Verse]\nI see the sun\nWe run away\nAnother night\nAnother day'
			)
		);
		await action('Type into lyrics editor', async () => {
			await editor.press('ControlOrMeta+End');
			await editor.pressSequentially(' in the rain', { delay: 60 });
		});
		assert((await editor.innerText()).includes('Another day in the rain'), 'Lyrics editing failed');
		await action('Open Find and replace', () =>
			page.getByRole('button', { name: 'Find and replace', exact: true }).click()
		);
		await page.locator('.ll-find').waitFor({ state: 'visible' });
		await action('Dismiss Find with Escape', () => page.keyboard.press('Escape'));
		await page.locator('.ll-find').waitFor({ state: 'detached' });
		if (profile === 'mobile') {
			const navigation = page.getByRole('navigation', { name: 'Workbench views' });
			await action('Open Tools', () =>
				navigation.getByRole('button', { name: 'Tools', exact: true }).click()
			);
			await action('Return to Write', () =>
				navigation.getByRole('button', { name: 'Write', exact: true }).click()
			);
			assert(await editor.isVisible(), 'Editor did not survive task navigation');
		}
	} else if (route === '/guidelines/') {
		const search = page.getByRole('searchbox');
		await action('Type reference search', () =>
			search.pressSequentially('punctuation', { delay: 60 })
		);
		assert.equal(await search.inputValue(), 'punctuation', 'Reference search input failed');
		await action('Clear reference search', () => search.fill(''));
	} else {
		await action('Scroll to live editor demonstration', () =>
			page
				.getByRole('heading', { name: 'This is the real editor, running on this page.' })
				.scrollIntoViewIfNeeded()
		);
		const demo = page.locator('.site-demo .cm-content');
		await demo.waitFor({ state: 'visible', timeout: 120_000 });
		await action('Type into live demonstration', async () => {
			await demo.click();
			await demo.press('ControlOrMeta+End');
			await demo.pressSequentially(' again', { delay: 60 });
		});
		assert((await demo.innerText()).endsWith(' again'), 'Live demonstration is not editable');
	}
	return actions;
}

try {
	for (let run = 1; run <= runs; run++) {
		for (const [profile, config] of Object.entries(profiles)) {
			for (const route of routes) {
				const { cpu, latency, throughput, ...device } = config;
				const context = await browser.newContext({ ...device, serviceWorkers: 'allow' });
				const page = await context.newPage();
				const errors = [];
				page.on('pageerror', (error) => errors.push(error.message));
				const cdp = await context.newCDPSession(page);
				await cdp.send('Network.enable');
				await cdp.send('Network.emulateNetworkConditions', {
					offline: false,
					latency,
					downloadThroughput: throughput,
					uploadThroughput: throughput
				});
				await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
				let pageTransferredBytes = 0;
				cdp.on('Network.loadingFinished', (event) => {
					pageTransferredBytes += event.encodedDataLength;
				});
				await page.addInitScript(installObservers);
				const result = { run, profile, route };
				try {
					const response = await page.goto(new URL(route, baseURL).href, {
						waitUntil: 'domcontentloaded',
						timeout: 120_000
					});
					assert.equal(response.status(), 200);
					await page.waitForTimeout(settleMs);
					result.initialLoad = {
						...(await page.evaluate(() => globalThis.readAudit())),
						pageTransferredBytes
					};
					assert(
						result.initialLoad.horizontalOverflowPx <= 1,
						'Initial page overflows horizontally'
					);
					result.actions = await interact(page, route, profile);
					await page.waitForTimeout(1000);
					result.afterInteractions = {
						...(await page.evaluate(() => globalThis.readAudit())),
						pageTransferredBytes
					};
					const events = result.afterInteractions.events.filter(
						(event) => event.interactionId && event.startTime >= result.initialLoad.atMs
					);
					result.labInteractionLatencyMs = events.length
						? Math.max(...events.map((e) => e.duration))
						: null;
					result.observedInteractions = new Set(events.map((e) => e.interactionId)).size;
					assert(
						result.afterInteractions.horizontalOverflowPx <= 1,
						'Interacted page overflows horizontally'
					);
					if (process.env.PERF_SCREENSHOTS === '1')
						await page.screenshot({
							path: join(
								dirname(outputPath),
								`${profile}-${route.replaceAll('/', '') || 'home'}-${run}.png`
							)
						});
					result.functionalityPassed = true;
				} catch (error) {
					result.failure = error.message;
					result.functionalityPassed = false;
					process.exitCode = 1;
				} finally {
					result.pageErrors = errors;
					report.results.push(result);
					await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
					console.log(
						JSON.stringify({
							run,
							profile,
							route,
							lcpMs: result.initialLoad?.lcpMs,
							cls: result.initialLoad?.cls,
							interactionMs: result.labInteractionLatencyMs,
							passed: result.functionalityPassed,
							failure: result.failure
						})
					);
					await context.close();
				}
			}
		}
	}
} finally {
	await browser.close();
}

import { chromium } from 'playwright';

// Run against a production preview, for example:
//   bun run build && bun run preview -- --host 127.0.0.1 --port 4173
//   bun run measure:landing
// Add PROFILE=slow-4g to include Chromium's network and 4x CPU throttling.

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:4173/';
const runs = Number.parseInt(process.env.RUNS ?? '3', 10);
const settleMs = Number.parseInt(process.env.SETTLE_MS ?? '5000', 10);
const profile = process.env.PROFILE ?? 'desktop';
const includeSamples = process.env.DETAILS !== '0';

const profiles = {
	desktop: null,
	'slow-4g': {
		downloadThroughput: (1.6 * 1024 * 1024) / 8,
		uploadThroughput: (750 * 1024) / 8,
		latency: 150,
		cpuSlowdown: 4
	}
};

if (!(profile in profiles)) {
	throw new Error(`Unknown PROFILE ${profile}. Use desktop or slow-4g.`);
}

const round = (value, places = 2) => {
	if (typeof value !== 'number') return value;
	const factor = 10 ** places;
	return Math.round(value * factor) / factor;
};

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarize(samples) {
	const keys = [
		'ttfb',
		'firstContentfulPaint',
		'largestContentfulPaint',
		'cumulativeLayoutShift',
		'totalBlockingTime',
		'domContentLoaded',
		'load',
		'transferSize',
		'requestCount'
	];
	return Object.fromEntries(
		keys.map((key) => [
			key,
			round(median(samples.map((sample) => sample[key])), key === 'cumulativeLayoutShift' ? 5 : 2)
		])
	);
}

const browser = await chromium.launch({ headless: true });
const samples = [];

try {
	for (let run = 0; run < runs; run += 1) {
		const context = await browser.newContext({
			colorScheme: 'dark',
			deviceScaleFactor: 1,
			serviceWorkers: 'block',
			viewport: { width: 1280, height: 800 }
		});
		const page = await context.newPage();
		const cdp = await context.newCDPSession(page);
		const selectedProfile = profiles[profile];

		await cdp.send('Network.enable');
		if (selectedProfile) {
			await cdp.send('Network.emulateNetworkConditions', {
				offline: false,
				latency: selectedProfile.latency,
				downloadThroughput: selectedProfile.downloadThroughput,
				uploadThroughput: selectedProfile.uploadThroughput,
				connectionType: 'cellular4g'
			});
			await cdp.send('Emulation.setCPUThrottlingRate', { rate: selectedProfile.cpuSlowdown });
		}

		await page.addInitScript(() => {
			window.__landingVitals = {
				cls: 0,
				lcp: null,
				longTasks: 0,
				shifts: []
			};

			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					if (entry.hadRecentInput) continue;
					window.__landingVitals.cls += entry.value;
					window.__landingVitals.shifts.push({
						startTime: entry.startTime,
						value: entry.value,
						sources: entry.sources.map((source) => {
							const node = source.node;
							return node instanceof Element
								? `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${
										node.classList.length ? `.${[...node.classList].join('.')}` : ''
									}`
								: null;
						})
					});
				}
			}).observe({ type: 'layout-shift', buffered: true });

			new PerformanceObserver((list) => {
				const entry = list.getEntries().at(-1);
				if (!entry) return;
				const element = entry.element;
				window.__landingVitals.lcp = {
					startTime: entry.startTime,
					renderTime: entry.renderTime,
					loadTime: entry.loadTime,
					size: entry.size,
					url: entry.url,
					element:
						element instanceof Element
							? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${
									element.classList.length ? `.${[...element.classList].join('.')}` : ''
								}`
							: null
				};
			}).observe({ type: 'largest-contentful-paint', buffered: true });

			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) {
					window.__landingVitals.longTasks += Math.max(0, entry.duration - 50);
				}
			}).observe({ type: 'longtask', buffered: true });
		});

		await page.goto(baseURL, { waitUntil: 'load' });
		await page.waitForTimeout(settleMs);

		const result = await page.evaluate(() => {
			const navigation = performance.getEntriesByType('navigation')[0];
			const paint = performance.getEntriesByName('first-contentful-paint')[0];
			const resources = performance.getEntriesByType('resource');
			const largestResources = resources
				.map((entry) => ({
					name: new URL(entry.name).pathname,
					initiatorType: entry.initiatorType,
					transferSize: entry.transferSize,
					startTime: entry.startTime,
					duration: entry.duration
				}))
				.sort((a, b) => b.transferSize - a.transferSize)
				.slice(0, 12);

			return {
				ttfb: navigation.responseStart - navigation.requestStart,
				firstContentfulPaint: paint?.startTime ?? 0,
				largestContentfulPaint: window.__landingVitals.lcp?.startTime ?? 0,
				cumulativeLayoutShift: window.__landingVitals.cls,
				totalBlockingTime: window.__landingVitals.longTasks,
				domContentLoaded: navigation.domContentLoadedEventEnd,
				load: navigation.loadEventEnd,
				transferSize:
					navigation.transferSize +
					resources.reduce((total, entry) => total + entry.transferSize, 0),
				requestCount: resources.length + 1,
				largestContentfulPaintEntry: window.__landingVitals.lcp,
				layoutShifts: window.__landingVitals.shifts,
				largestResources
			};
		});

		samples.push(result);
		await context.close();
	}
} finally {
	await browser.close();
}

console.log(
	JSON.stringify(
		{
			url: baseURL,
			profile,
			runs,
			median: summarize(samples),
			...(includeSamples
				? {
						samples: samples.map((sample) => ({
							...Object.fromEntries(
								Object.entries(sample).map(([key, value]) => [
									key,
									typeof value === 'number'
										? round(value, key === 'cumulativeLayoutShift' ? 5 : 2)
										: value
								])
							)
						}))
					}
				: {})
		},
		null,
		2
	)
);

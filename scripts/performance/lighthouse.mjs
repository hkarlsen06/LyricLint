/** bun scripts/performance/lighthouse.mjs URL OUTPUT_DIRECTORY [RUNS]
 * Uses a pinned, isolated bunx Lighthouse install and the project's Chromium.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const origin = process.argv[2];
const output = resolve(process.argv[3]);
const runs = Number(process.argv[4] ?? 3);
const routes = process.env.PERF_ROUTES?.split(',') ?? ['/', '/workbench/', '/guidelines/'];
const profiles = process.env.PERF_PROFILES?.split(',') ?? ['mobile', 'desktop'];
const chromeFlags =
	'--headless --no-sandbox --disable-dev-shm-usage' +
	(process.env.PERF_INSECURE_TLS === '1' ? ' --ignore-certificate-errors' : '');
await mkdir(output, { recursive: true });
const results = [];
for (const profile of profiles) {
	for (const route of routes) {
		for (let run = 1; run <= runs; run++) {
			const name = `${profile}-${route.replaceAll('/', '') || 'landing'}-${run}`;
			const path = resolve(output, name);
			await new Promise((done, reject) => {
				const child = spawn(
					'bunx',
					[
						'lighthouse@13.4.1',
						`${origin}${route}`,
						`--chrome-flags=${chromeFlags}`,
						'--output=json',
						'--output=html',
						`--output-path=${path}`,
						'--quiet',
						...(profile === 'desktop' ? ['--preset=desktop'] : [])
					],
					{
						env: { ...process.env, CHROME_PATH: chromium.executablePath() },
						stdio: 'inherit'
					}
				);
				child.on('error', reject);
				child.on('exit', (code) =>
					code === 0 ? done() : reject(new Error(`Lighthouse exited ${code}`))
				);
			});
			const report = JSON.parse(await readFile(`${path}.report.json`, 'utf8'));
			if (report.runtimeError) throw new Error(JSON.stringify(report.runtimeError));
			const audit = (id) => report.audits[id]?.numericValue;
			const result = {
				profile,
				route,
				run,
				version: report.lighthouseVersion,
				chrome: report.environment.hostUserAgent,
				settings: report.configSettings,
				performance: report.categories.performance.score * 100,
				accessibility: report.categories.accessibility.score * 100,
				bestPractices: report.categories['best-practices'].score * 100,
				seo: report.categories.seo.score * 100,
				ttfb: audit('server-response-time'),
				fcp: audit('first-contentful-paint'),
				lcp: audit('largest-contentful-paint'),
				tbt: audit('total-blocking-time'),
				cls: audit('cumulative-layout-shift'),
				bytes: audit('total-byte-weight')
			};
			results.push(result);
			console.log(JSON.stringify({ ...result, settings: undefined, chrome: undefined }));
			await writeFile(resolve(output, 'summary.json'), JSON.stringify(results, null, 2));
		}
	}
}

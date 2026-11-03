/** bun scripts/performance/workbench.mjs BASE_URL OUTPUT_DIRECTORY [RUNS=5] */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { installWorkbenchObserver, workbenchSettled } from './workbench-observer.mjs';
import { startWorkbenchProfiler } from './workbench-profiler.mjs';

export function workbenchFixture(revision) {
	return (
		'[Verse]\n' +
		'We keep on singing again\n'.repeat(revision) +
		'I see the morning light\nIdk if tommorrow will feel alright\n' +
		'This sentnce sounds strange tonight\nWe keep walking through the city and dream of home'
	);
}

async function scenario(browser, baseURL, profileDirectory) {
	const context = await browser.newContext({
		serviceWorkers: 'block',
		permissions: ['clipboard-read', 'clipboard-write'],
		locale: 'en-US',
		viewport: { width: 1350, height: 940 }
	});
	let profiler;
	try {
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		page.on('console', (message) => {
			if (message.type() === 'error') errors.push(message.text());
		});
		await page.addInitScript(installWorkbenchObserver);
		if (profileDirectory) profiler = await startWorkbenchProfiler(context, page);
		const response = await page.goto(new URL('/workbench/', baseURL).href, {
			waitUntil: 'domcontentloaded',
			timeout: 60_000
		});
		assert.equal(response.status(), 200, 'Workbench navigation failed');
		const editor = page.getByRole('textbox', { name: 'Lyrics editor' });
		await editor.waitFor({ timeout: 60_000 });
		await page.waitForFunction(
			() => Number.isFinite(globalThis.workbenchAudit.snapshot().editorReadyAt),
			null,
			{ timeout: 60_000 }
		);
		const resources = await page.evaluate(() =>
			performance.getEntriesByType('resource').map((entry) => entry.name)
		);
		assert(
			resources.some((name) => name.includes('/_app/immutable/')),
			'Serve a production build, not vite dev'
		);
		assert(
			!resources.some((name) => name.includes('/@vite/client')),
			'Dev server measurements are not supported'
		);
		const release = await page.request.get(new URL('/assistant-release.json', baseURL).href);
		assert.equal(release.status(), 200, 'Build release metadata is unavailable');
		const { revision: releaseRevision } = await release.json();
		assert(
			typeof releaseRevision === 'string' && /^[a-f0-9]{40}$/.test(releaseRevision),
			'Build release revision is invalid'
		);
		const startup = await page.evaluate(() => ({
			editorReadyMs: globalThis.workbenchAudit.snapshot().editorReadyAt
		}));
		const edits = [];
		for (let revision = 0; revision < 3; revision++) {
			const text = workbenchFixture(revision);
			await page.evaluate(
				({ text }) =>
					globalThis.workbenchAudit.begin(
						text,
						text.replace('[Verse]', '       '),
						text.indexOf('tommorrow'),
						text.indexOf('sentnce')
					),
				{ text }
			);
			await editor.fill(text);
			try {
				await page.waitForFunction(workbenchSettled, null, { polling: 'raf', timeout: 60_000 });
			} catch (error) {
				const snapshot = await page.evaluate(() => globalThis.workbenchAudit.snapshot());
				throw new Error(
					`Diagnostics did not settle for revision ${revision}: ${JSON.stringify(snapshot)}`,
					{ cause: error }
				);
			}
			const snapshot = await page.evaluate(() => globalThis.workbenchAudit.snapshot());
			await editor.press('ControlOrMeta+a');
			await editor.press('ControlOrMeta+c');
			assert.equal(
				await page.evaluate(() => navigator.clipboard.readText()),
				text,
				'Copied lyrics changed the fixture text'
			);
			assert.deepEqual(errors, [], 'Browser errors invalidate the sample');
			edits.push({
				kind: revision === 0 ? 'cold-first-paste' : 'warm-replacement-paste',
				revision,
				copyVerified: true,
				characters: text.length,
				inputToSettledMs: snapshot.now - snapshot.operation.startedAt,
				inputToHarperResponseMs: snapshot.completedLint.receivedAt - snapshot.operation.startedAt,
				harperRpcMs: snapshot.completedLint.receivedAt - snapshot.completedLint.sentAt,
				diagnosticCount: snapshot.keys.length,
				diagnosticKeys: snapshot.keys
			});
		}
		const cpu = profiler ? await profiler.stop(profileDirectory) : undefined;
		return { releaseRevision, startup, edits, errors, cpu };
	} finally {
		await profiler?.dispose();
		await context.close();
	}
}

export async function runWorkbenchAudit({ baseURL, directory, runs = 5 }) {
	assert(Number.isInteger(runs) && runs > 0, 'RUNS must be a positive integer');
	await mkdir(directory, { recursive: true });
	const report = {
		kind: 'local-production-editor-lab',
		runId: randomUUID(),
		complete: false,
		baseURL,
		startedAt: new Date().toISOString(),
		scope: {
			included: [
				'navigation-to-painted-editor',
				'native lint',
				'Harper RPC and worker',
				'diagnostic DOM and paint'
			],
			excluded: [
				'media playback',
				'remote assistant inference',
				'offline/service-worker lifecycle',
				'field INP',
				'compositor/GPU CPU attribution'
			],
			serviceWorkers: 'blocked in fresh contexts',
			action: 'Playwright fill, a bulk input replacement',
			settlement:
				'matching current-input Harper response, current-offset native and Harper rows, no pending worker RPC, two animation frames, 100 ms diagnostic DOM quiet',
			cpu: 'separate instrumented run; includes harness observation and copy validation; sampled self time excludes idle and unattributed program samples; not wall latency'
		},
		measurements: [],
		errors: []
	};
	await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
	let browser;
	try {
		browser = await chromium.launch({ headless: true });
		report.browser = browser.version();
		for (let run = 0; run < runs; run++) {
			const result = await scenario(browser, baseURL);
			if (run > 0)
				assert.equal(
					result.releaseRevision,
					report.measurements[0].releaseRevision,
					'Build changed during the run'
				);
			report.measurements.push({ run, ...result });
			await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
		}
		report.profileDirectory = join(directory, `profiles-${report.runId}`);
		await mkdir(report.profileDirectory);
		report.profiled = await scenario(browser, baseURL, report.profileDirectory);
		assert.equal(
			report.profiled.releaseRevision,
			report.measurements[0].releaseRevision,
			'Build changed before profiling'
		);
		report.complete = true;
	} catch (error) {
		report.errors.push(error.message);
		throw error;
	} finally {
		try {
			await writeFile(join(directory, 'report.json'), JSON.stringify(report, null, 2));
		} finally {
			await browser?.close();
		}
	}
	return report;
}

if (import.meta.main) {
	const [baseURL, directory, runCount = '5'] = process.argv.slice(2);
	assert(
		baseURL && directory && process.argv.length <= 5,
		'Pass BASE_URL and OUTPUT_DIRECTORY; serve a fresh production build first'
	);
	const report = await runWorkbenchAudit({ baseURL, directory, runs: Number(runCount) });
	console.log(
		JSON.stringify({
			output: join(directory, 'report.json'),
			measuredRuns: report.measurements.length,
			profiledTargets: report.profiled.cpu.map((target) => target.target),
			errors: report.errors
		})
	);
}

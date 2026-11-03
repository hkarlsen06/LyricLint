import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { loadavg, cpus } from 'node:os';
import { resolve } from 'node:path';

function distribution(values) {
	const sorted = values.toSorted((a, b) => a - b);
	return {
		medianMs: sorted[Math.floor(sorted.length / 2)],
		minMs: sorted[0],
		maxMs: sorted.at(-1)
	};
}

export function validateSample(rows) {
	assert(Array.isArray(rows) && rows.length > 0, 'Benchmark produced no scenarios');
	assert.equal(new Set(rows.map((r) => r.scenario)).size, rows.length, 'Duplicate scenario');
	for (const row of rows) {
		assert.equal(row.kind, 'native-lint-benchmark');
		assert(typeof row.scenario === 'string' && row.scenario.length > 0);
		assert(['true', 'false'].includes(row.dirty), 'Missing build cleanliness metadata');
		assert.equal(row.scope, 'parse+native-rules');
		assert(['none', 'rule-timers'].includes(row.instrumentation));
		assert.match(row.revision, /^[a-f0-9]{40}$/u, 'Build a revision-stamped bundle first');
		assert.match(row.fixtureHash, /^[a-f0-9]{64}$/u);
		assert.match(row.sha256, /^[a-f0-9]{64}$/u);
		assert.equal(row.errors, 0);
		assert(Number.isInteger(row.timedPasses) && row.timedPasses > 0, 'No timed work');
		assert(Number.isInteger(row.diagnosticsProduced) && row.diagnosticsProduced >= 0);
		for (const key of ['medianMs', 'minMs', 'maxMs'])
			assert(Number.isFinite(row[key]) && row[key] >= 0);
		assert(row.minMs <= row.medianMs && row.medianMs <= row.maxMs);
		if (row.instrumentation === 'rule-timers') {
			assert(Array.isArray(row.ruleTimes) && row.ruleTimes.length > 0, 'No per-rule measurements');
			assert.equal(new Set(row.ruleTimes.map((r) => r.id)).size, row.ruleTimes.length);
			for (const rule of row.ruleTimes) {
				assert(typeof rule.id === 'string' && rule.id.length > 0);
				for (const key of ['medianMs', 'minMs', 'maxMs'])
					assert(Number.isFinite(rule[key]) && rule[key] >= 0);
				assert(rule.minMs <= rule.medianMs && rule.medianMs <= rule.maxMs);
			}
		}
	}
	for (const key of ['revision', 'dirty', 'runtime', 'platform']) {
		assert(
			rows.every((row) => row[key] === rows[0][key]),
			`Mixed ${key} in one process`
		);
	}
	return rows;
}

export function assertComparable(expected, actual) {
	validateSample(expected);
	validateSample(actual);
	assert.deepEqual(
		actual.map((r) => r.scenario).toSorted(),
		expected.map((r) => r.scenario).toSorted()
	);
	for (const row of actual) {
		const baseline = expected.find((r) => r.scenario === row.scenario);
		if (row.instrumentation === 'rule-timers') {
			assert.deepEqual(
				row.ruleTimes.map((r) => r.id).toSorted(),
				baseline.ruleTimes.map((r) => r.id).toSorted()
			);
		}
		for (const key of [
			'scope',
			'instrumentation',
			'runtime',
			'platform',
			'fixtureHash',
			'timedPasses',
			'diagnosticsProduced',
			'sha256'
		]) {
			assert.equal(row[key], baseline[key], `${row.scenario}: ${key} changed`);
		}
	}
}

export async function compareLint({ before, after, output, trials = 5, rules = false }) {
	assert(Number.isInteger(trials) && trials >= 5 && trials <= 20, 'Use 5–20 paired trials');
	const report = {
		kind: 'paired-native-lint',
		scope: 'parse+native-rules',
		excludes: ['Harper worker', 'DOM rendering', 'startup', 'network'],
		startedAt: new Date().toISOString(),
		conditions: {
			runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`,
			logicalCpus: cpus().length,
			loadAverage: loadavg(),
			trials,
			rules
		},
		runs: [],
		complete: false
	};
	await writeFile(output, JSON.stringify(report, null, 2));
	const bundlePaths = { before: resolve(before), after: resolve(after) };
	const bundleHash = async (path) =>
		createHash('sha256')
			.update(await readFile(path))
			.digest('hex');
	report.bundles = Object.fromEntries(
		await Promise.all(
			Object.entries(bundlePaths).map(async ([name, path]) => [
				name,
				{ path, sha256: await bundleHash(path) }
			])
		)
	);
	const verifyBundles = async () => {
		for (const { path, sha256 } of Object.values(report.bundles)) {
			assert.equal(await bundleHash(path), sha256, `Bundle changed during measurement: ${path}`);
		}
	};
	const sideMetadata = new Map();
	let expected;
	for (let trial = 0; trial < trials; trial++) {
		for (const revision of trial % 2 ? ['after', 'before'] : ['before', 'after']) {
			await verifyBundles();
			const run = spawnSync(
				process.execPath,
				[resolve(revision === 'before' ? before : after), ...(rules ? ['--rules'] : [])],
				{
					encoding: 'utf8',
					timeout: 300_000,
					maxBuffer: 10 * 1024 * 1024
				}
			);
			assert.equal(run.status, 0, `Benchmark failed: ${run.error?.message ?? run.stderr}`);
			await verifyBundles();
			const rows = validateSample(
				run.stdout
					.trim()
					.split('\n')
					.map((line) => JSON.parse(line))
			);
			const metadata = { revision: rows[0].revision, dirty: rows[0].dirty };
			if (sideMetadata.has(revision))
				assert.deepEqual(
					metadata,
					sideMetadata.get(revision),
					'Build metadata changed within one side'
				);
			else sideMetadata.set(revision, metadata);
			if (expected) assertComparable(expected, rows);
			expected ??= rows;
			report.runs.push({ trial, revision, rows });
			await writeFile(output, JSON.stringify(report, null, 2));
			console.log(JSON.stringify({ trial, revision, scenarios: rows.length, errors: 0 }));
		}
	}
	report.summary = expected.map(({ scenario }) => ({
		scenario,
		...Object.fromEntries(
			['before', 'after'].map((revision) => {
				const rows = report.runs
					.filter((r) => r.revision === revision)
					.map((r) => r.rows.find((r) => r.scenario === scenario));
				return [
					revision,
					{
						...distribution(rows.map((r) => r.medianMs)),
						...(rules && {
							ruleTimes: rows[0].ruleTimes.map(({ id }) => ({
								id,
								...distribution(
									rows.map((r) => r.ruleTimes.find((rule) => rule.id === id).medianMs)
								)
							}))
						})
					}
				];
			})
		)
	}));
	report.complete = true;
	await writeFile(output, JSON.stringify(report, null, 2));
	return report;
}

if (import.meta.main) {
	const [before, after, output, ...flags] = process.argv.slice(2);
	assert(
		before && after && output && flags.every((flag) => flag === '--rules'),
		'Usage: node scripts/performance/compare-lint.mjs BEFORE.mjs AFTER.mjs OUTPUT.json [--rules]'
	);
	await compareLint({ before, after, output, rules: flags.includes('--rules') });
}

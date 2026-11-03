/** Build with scripts/performance/build-lint.ts for stamped, standalone Node benchmarks. */
import { createHash } from 'node:crypto';
import { parseDocument } from '../src/lib/core/parser.js';
import { runRules } from '../src/lib/rules/engine.js';
import { enabledRules } from '../src/lib/rules/registry.js';
import { ruleContext } from '../src/lib/rules/rule-test-utils.js';
import { loadStatisticalLanguageDetector } from '../src/lib/languages/detect.js';
import { lintWorkloads } from './performance/lint-workloads.js';

const measureRules = process.argv.includes('--rules');
if (process.argv.slice(2).some((arg) => arg !== '--rules')) {
	throw new Error('Usage: node benchmark.mjs [--rules]');
}
await loadStatisticalLanguageDetector();
const context = ruleContext();
const totals = new Map<string, number>();
const registry = measureRules
	? enabledRules.map((rule) => ({
			...rule,
			check(document: Parameters<typeof rule.check>[0], context: Parameters<typeof rule.check>[1]) {
				const start = performance.now();
				const result = rule.check(document, context);
				totals.set(rule.id, (totals.get(rule.id) ?? 0) + performance.now() - start);
				return result;
			}
		}))
	: enabledRules;
function distribution(samples: number[]) {
	const sorted = samples.toSorted((a, b) => a - b);
	return {
		medianMs: sorted[Math.floor(sorted.length / 2)],
		minMs: sorted[0],
		maxMs: sorted.at(-1)
	};
}
for (const scenario of lintWorkloads) {
	const hash = createHash('sha256');
	for (const text of scenario.texts) {
		const document = parseDocument(text);
		hash.update(JSON.stringify([document, runRules(document, context)]));
	}
	for (let warmup = 0; warmup < 3; warmup++) {
		for (const text of scenario.texts) runRules(parseDocument(text), context);
	}
	const samples: number[] = [];
	const ruleSamples = new Map<string, number[]>();
	let diagnosticsProduced = 0;
	let timedPasses = 0;
	for (let batch = 0; batch < 9; batch++) {
		totals.clear();
		const start = performance.now();
		for (const text of scenario.texts) {
			diagnosticsProduced += runRules(parseDocument(text), context, registry).length;
			timedPasses++;
		}
		samples.push((performance.now() - start) / scenario.texts.length);
		for (const [id, elapsed] of totals) {
			const values = ruleSamples.get(id) ?? [];
			values.push(elapsed / scenario.texts.length);
			ruleSamples.set(id, values);
		}
	}
	console.log(
		JSON.stringify({
			kind: 'native-lint-benchmark',
			scope: 'parse+native-rules',
			excludes: ['Harper worker', 'DOM rendering', 'startup', 'network'],
			instrumentation: measureRules ? 'rule-timers' : 'none',
			revision: process.env.LYRICLINT_BENCHMARK_REVISION ?? 'unstamped',
			dirty: process.env.LYRICLINT_BENCHMARK_DIRTY ?? 'unknown',
			runtime: process.versions.bun ? `Bun ${process.versions.bun}` : `Node ${process.version}`,
			platform: `${process.platform}/${process.arch}`,
			scenario: scenario.name,
			fixtureHash: createHash('sha256').update(JSON.stringify(scenario.texts)).digest('hex'),
			statisticalLanguageDetector: 'loaded',
			characters: scenario.texts[0]!.length,
			warmupPasses: scenario.texts.length * 3,
			timedPasses,
			diagnosticsProduced,
			errors: 0,
			...distribution(samples),
			sha256: hash.digest('hex'),
			...(measureRules && {
				ruleTimes: [...ruleSamples].map(([id, values]) => ({ id, ...distribution(values) }))
			})
		})
	);
}

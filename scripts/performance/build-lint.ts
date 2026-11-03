/** bun scripts/performance/build-lint.ts OUTPUT [--differential] */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const [output, ...flags] = process.argv.slice(2);
if (!output || flags.some((flag) => flag !== '--differential')) {
	throw new Error('Usage: bun scripts/performance/build-lint.ts OUTPUT [--differential]');
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty =
	execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
const result = await Bun.build({
	entrypoints: [
		flags.includes('--differential')
			? 'scripts/performance/lint-differential-entry.ts'
			: 'scripts/benchmark-lint.ts'
	],
	target: 'node',
	define: {
		'process.env.LYRICLINT_BENCHMARK_REVISION': JSON.stringify(revision),
		'process.env.LYRICLINT_BENCHMARK_DIRTY': JSON.stringify(String(dirty))
	}
});
if (!result.success) throw new Error(result.logs.join('\n'));
await Bun.write(resolve(output), result.outputs[0]!);
console.log(JSON.stringify({ output: resolve(output), revision, dirty }));

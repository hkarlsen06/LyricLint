import { describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertComparable, compareLint, validateSample } from './compare-lint.mjs';
import { compareDiagnostics, differentialCases } from './differential-lint.mjs';

const row = {
	kind: 'native-lint-benchmark',
	scope: 'parse+native-rules',
	instrumentation: 'none',
	revision: 'a'.repeat(40),
	dirty: 'false',
	runtime: process.version,
	platform: `${process.platform}/${process.arch}`,
	scenario: 'fixture',
	fixtureHash: 'b'.repeat(64),
	sha256: 'c'.repeat(64),
	timedPasses: 108,
	diagnosticsProduced: 12,
	errors: 0,
	medianMs: 2,
	minMs: 1,
	maxMs: 3
};
describe('native comparison verification', () => {
	test.each([
		{ sha256: 'd'.repeat(64) },
		{ fixtureHash: 'd'.repeat(64) },
		{ diagnosticsProduced: 0 },
		{ timedPasses: 0 },
		{ errors: 1 },
		{ runtime: 'different' },
		{ instrumentation: 'rule-timers' },
		{ medianMs: null },
		{ scope: 'whole-editor' }
	])('rejects changed outputs, missing work and incompatible measurements', (change) => {
		expect(() => assertComparable([row], [{ ...row, ...change }])).toThrow();
	});
	test('rejects unstamped bundles and empty or duplicate scenarios', () => {
		expect(() => validateSample([])).toThrow();
		expect(() => validateSample([row, row])).toThrow();
		expect(() => validateSample([{ ...row, revision: 'unstamped' }])).toThrow();
	});
	test('runs real child processes in alternating order and persists a complete report', async () => {
		const directory = await mkdtemp(join(tmpdir(), 'lint-comparison-'));
		try {
			const before = join(directory, 'before.mjs');
			const after = join(directory, 'after.mjs');
			const output = join(directory, 'report.json');
			await writeFile(before, `console.log(${JSON.stringify(JSON.stringify(row))})`);
			await writeFile(
				after,
				`console.log(${JSON.stringify(JSON.stringify({ ...row, revision: 'd'.repeat(40), medianMs: 1.5 }))})`
			);
			const report = await compareLint({ before, after, output });
			expect(report.runs.map((r) => r.revision)).toEqual([
				'before',
				'after',
				'after',
				'before',
				'before',
				'after',
				'after',
				'before',
				'before',
				'after'
			]);
			expect(report.complete).toBe(true);
			expect(report.summary[0].before.medianMs).toBe(2);
			expect(report.summary[0].after.medianMs).toBe(1.5);
			expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(report);
			await writeFile(
				after,
				`import {appendFileSync} from 'node:fs'; appendFileSync(process.argv[1], '\\n// changed'); console.log(${JSON.stringify(JSON.stringify(row))})`
			);
			await expect(compareLint({ before, after, output })).rejects.toThrow('Bundle changed');
			expect(JSON.parse(await readFile(output, 'utf8')).complete).toBe(false);
			const state = join(directory, 'trial-count');
			await writeFile(
				after,
				`import {existsSync,readFileSync,writeFileSync} from 'node:fs'; const path=${JSON.stringify(state)}; const count=existsSync(path)?Number(readFileSync(path,'utf8')):0; writeFileSync(path,String(count+1)); const row=${JSON.stringify(row)}; if(count)row.revision='e'.repeat(40); console.log(JSON.stringify(row));`
			);
			await expect(compareLint({ before, after, output })).rejects.toThrow(
				'Build metadata changed'
			);
			expect(JSON.parse(await readFile(output, 'utf8')).complete).toBe(false);
			await writeFile(after, 'process.exit(1)');
			await expect(compareLint({ before, after, output })).rejects.toThrow('Benchmark failed');
			expect(JSON.parse(await readFile(output, 'utf8')).complete).toBe(false);
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
describe('differential rule verification', () => {
	test('executes every case and catches changed fixes and ordering', () => {
		const cases = [...differentialCases(2)];
		const before = { ruleIds: ['rule'], check: () => [{ from: 1, fixes: [{ insert: 'yes' }] }] };
		expect(compareDiagnostics(before, before, cases).checked).toBe(6);
		expect(() =>
			compareDiagnostics(
				before,
				{ ...before, check: () => [{ from: 1, fixes: [{ insert: 'no' }] }] },
				cases
			)
		).toThrow();
		expect(() => compareDiagnostics(before, { ...before, ruleIds: ['other'] }, cases)).toThrow();
		expect(() => compareDiagnostics(before, before, [])).toThrow('No differential cases');
	});
});

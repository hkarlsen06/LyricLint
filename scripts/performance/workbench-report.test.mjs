import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('a real browser launch failure replaces old success with an incomplete report', async () => {
	const directory = await mkdtemp(join(tmpdir(), 'workbench-report-'));
	try {
		const output = join(directory, 'report.json');
		await writeFile(output, JSON.stringify({ complete: true, errors: [] }));
		const result = spawnSync(
			process.execPath,
			[
				fileURLToPath(new URL('./workbench.mjs', import.meta.url)),
				'http://127.0.0.1:9',
				directory,
				'1'
			],
			{
				encoding: 'utf8',
				timeout: 15_000,
				env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: join(directory, 'missing-browser') }
			}
		);
		expect(result.error).toBeUndefined();
		expect(result.status).not.toBe(0);
		const report = JSON.parse(await readFile(output, 'utf8'));
		expect(report.complete).toBe(false);
		expect(report.errors.length).toBeGreaterThan(0);
		expect(report.measurements).toEqual([]);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

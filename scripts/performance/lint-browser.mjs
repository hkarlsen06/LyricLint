/**
 * Compare two bundles of lint-browser-entry.ts in fresh Chromium pages.
 * bun scripts/performance/lint-browser.mjs before.js after.js
 * Builds must use the same entry; alternate order to reduce machine-load bias.
 * This measures parse + native lint, excluding Harper and DOM rendering.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const paths = process.argv.slice(2);
assert.equal(paths.length, 2, 'Pass the before and after browser bundles');
const browser = await chromium.launch({ headless: true });
let expectedHash;
try {
	for (let trial = 0; trial < 6; trial++) {
		for (const index of trial % 2 ? [1, 0] : [0, 1]) {
			const page = await browser.newPage();
			await page.addScriptTag({ path: paths[index] });
			const { outputs, ...result } = await page.evaluate(() => globalThis.measureLint(20));
			const outputHash = createHash('sha256').update(JSON.stringify(outputs)).digest('hex');
			expectedHash ??= outputHash;
			assert.equal(outputHash, expectedHash, 'Diagnostics changed between runs');
			console.log(
				JSON.stringify({ revision: index ? 'after' : 'before', trial, ...result, outputHash })
			);
			await page.close();
		}
	}
} finally {
	await browser.close();
}

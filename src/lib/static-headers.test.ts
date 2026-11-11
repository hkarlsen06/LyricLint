import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Each path in Cloudflare's `_headers` with the header lines under it, comments dropped. */
function headerBlocks(): Map<string, string[]> {
	const blocks = new Map<string, string[]>();
	let lines: string[] | undefined;
	for (const line of readFileSync(join(root, 'static/_headers'), 'utf8').split('\n')) {
		if (line.trim() === '' || line.trim().startsWith('#')) continue;
		if (/^\S/.test(line)) blocks.set(line.trim(), (lines = []));
		else lines?.push(line.trim());
	}
	return blocks;
}

describe('static/_headers', () => {
	it('severs the opener of the workbench and only there', () => {
		const coop = 'Cross-Origin-Opener-Policy: same-origin-allow-popups';
		const blocks = headerBlocks();
		expect(blocks.get('/workbench/')).toEqual([coop]);
		const elsewhere = [...blocks].filter(
			([path, lines]) =>
				path !== '/workbench/' &&
				lines.some((line) => line.startsWith('Cross-Origin-Opener-Policy'))
		);
		expect(elsewhere).toEqual([]);
	});
});

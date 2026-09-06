import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { legacyWorkbenchDestination } from './workbench-redirect.js';

const hostRules = readFileSync('static/_redirects', 'utf8')
	.split('\n')
	.filter((line) => /^\/lint\/?\s/u.test(line))
	.map((line) => line.trim().split(/\s+/));

function hostDestination(url: URL): string | undefined {
	for (const [source, destination, status] of hostRules) {
		expect(status).toBe('308');
		if (source === url.pathname) return `${destination}${url.search}`;
	}
	return undefined;
}

describe('legacy workbench migration', () => {
	it('permanently redirects both old paths while retaining exact query encoding', () => {
		for (const path of ['/lint', '/lint/']) {
			const url = new URL(`https://lyriclint.com${path}?panel=linking&x=1&x=2#draft`);
			expect(legacyWorkbenchDestination(url)).toBe('/workbench/?panel=linking&x=1&x=2');
			expect(hostDestination(url)).toBe(legacyWorkbenchDestination(url));
		}
	});

	it('does not redirect the canonical workbench or similarly named paths', () => {
		for (const path of ['/workbench/', '/linter/', '/lint/check/']) {
			expect(legacyWorkbenchDestination(new URL(path, 'https://lyriclint.com'))).toBeUndefined();
		}
	});
});

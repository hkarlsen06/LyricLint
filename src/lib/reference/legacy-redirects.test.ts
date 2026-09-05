import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ruleReferences } from '$lib/rules/reference.js';
import { legacyReferenceDestination } from './legacy-redirects.js';

const hostRules = readFileSync('static/_redirects', 'utf8')
	.split('\n')
	.filter((line) => line && !line.startsWith('#'))
	.map((line) => line.trim().split(/\s+/));

function hostDestination(url: URL): string | undefined {
	for (const [source, destination, status] of hostRules) {
		expect(status).toBe('308');
		const pattern = new RegExp(`^${source!.replace(':rule', '([^/]+)')}$`);
		const match = pattern.exec(url.pathname);
		if (match) return `${destination!.replace(':rule', match[1] ?? '')}${url.search}`;
	}
	return undefined;
}

describe('legacy reference migration', () => {
	it('permanently redirects every published check with or without the trailing slash', () => {
		for (const rule of ruleReferences()) {
			for (const suffix of ['', '/']) {
				const url = new URL(
					`https://lyriclint.com/rules/${rule.slug}${suffix}?q=two+singers&scope=rules#example`
				);
				const expected = `/guidelines/checks/${rule.slug}/?q=two+singers&scope=rules`;
				expect(legacyReferenceDestination(url)).toBe(expected);
				expect(hostDestination(url)).toBe(expected);
			}
		}
	});
	it('retains exact query encoding on the old index and omits a fragment override', () => {
		for (const path of ['/rules', '/rules/']) {
			const url = new URL(`https://lyriclint.com${path}?q=%5B%3F%5D&x=1&x=2#unknown-marker`);
			expect(legacyReferenceDestination(url)).toBe('/guidelines/?q=%5B%3F%5D&x=1&x=2');
			expect(hostDestination(url)).toBe(legacyReferenceDestination(url));
		}
	});
	it('never redirects the canonical guide or unrelated nested paths', () => {
		for (const path of [
			'/guidelines/',
			'/guidelines/checks/unknown-marker/',
			'/ruleset/',
			'/rules/a/b/'
		]) {
			const url = new URL(path, 'https://lyriclint.com');
			expect(legacyReferenceDestination(url)).toBeUndefined();
			expect(hostDestination(url)).toBeUndefined();
		}
	});
});

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * AGENTS.md routes agents to the decision records in docs/subsystems/ — the
 * split only works while the routing is honest. A doc nothing routes to is
 * never read, a routed doc that does not exist is a dead pointer, and a
 * `Touches:` path that no longer exists sends its reader to code that moved.
 * Each of those failures looks exactly like a working documentation system.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const subsystemsDir = join(root, 'docs', 'subsystems');
const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
const docs = readdirSync(subsystemsDir).filter((name) => name.endsWith('.md'));

describe('subsystem docs routing', () => {
	it('routes every doc from the AGENTS.md table', () => {
		// A prose mention elsewhere in AGENTS.md must not stand in for a table row —
		// the table is the routing mechanism, so the check reads only its rows.
		const tableRows = agents.split('\n').filter((line) => line.startsWith('|'));
		expect(tableRows.length).toBeGreaterThan(0);
		const unrouted = docs.filter(
			(name) => !tableRows.some((row) => row.includes(`docs/subsystems/${name}`))
		);
		expect(unrouted).toEqual([]);
	});

	it('references only docs that exist', () => {
		const referenced = [...agents.matchAll(/docs\/subsystems\/([\w-]+\.md)/g)].map(
			(match) => match[1]
		);
		expect(referenced.length).toBeGreaterThan(0);
		const missing = referenced.filter((name) => !existsSync(join(subsystemsDir, name)));
		expect(missing).toEqual([]);
	});

	it('gives every doc a Touches line, The rules, and a Decision record', () => {
		for (const name of docs) {
			const source = readFileSync(join(subsystemsDir, name), 'utf8');
			expect(source, name).toMatch(/^Touches: /m);
			expect(source, name).toContain('\n## The rules\n');
			expect(source, name).toContain('\n## Decision record\n');
		}
	});

	it('touches only paths that exist', () => {
		for (const name of docs) {
			const source = readFileSync(join(subsystemsDir, name), 'utf8');
			const block = source.split(/\n\n/).find((paragraph) => paragraph.startsWith('Touches: '));
			expect(block, name).toBeDefined();
			const paths = [...(block ?? '').matchAll(/`([^`]+)`/g)]
				.map((match) => match[1])
				.filter((token) => token.includes('/') || /\.(ts|css|svelte|md|html|mjs|svg)$/.test(token));
			expect(paths.length, name).toBeGreaterThan(0);
			const missing = paths.filter((path) => !existsSync(join(root, path)));
			expect(missing, name).toEqual([]);
		}
	});
});

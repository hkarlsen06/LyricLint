import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The editor renders through CodeMirror's CSS-in-JS rather than the stylesheet,
 * so nothing in `src/lib/ui/styles` governs it and it had quietly become a
 * second design system: its own monospace stack, its own performer palette on
 * different hues from the roster's, raw font weights and radii, and literal
 * fallback colors left over from an abandoned warm scheme. One of those
 * fallbacks was live — `--ll-focus` is defined nowhere, so a focus ring had been
 * rendering in a hardcoded orange.
 *
 * These tests are the guard rail. They read the theme sources as text, because
 * the point is to catch a literal before it ships, not to assert on a computed
 * style after the fact.
 */

const extensionsDir = dirname(fileURLToPath(import.meta.url));
const editorDir = dirname(extensionsDir);

function themeSources(): { path: string; source: string }[] {
	const files = [
		join(editorDir, 'create-editor.ts'),
		...readdirSync(extensionsDir)
			.filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
			.map((name) => join(extensionsDir, name))
	];
	return files.map((path) => ({ path, source: readFileSync(path, 'utf8') }));
}

/** Strip comments so prose explaining a banned pattern does not trip the ban. */
function withoutComments(source: string): string {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/[^\n]*/g, '');
}

function relative(path: string): string {
	return path.slice(editorDir.length + 1);
}

describe('editor theme token policy', () => {
	const sources = themeSources().map(({ path, source }) => ({
		path,
		source: withoutComments(source)
	}));

	it('declares no literal colors', () => {
		// `color-mix(in oklch, …)` is a color *space*, not a color, and stays legal.
		const banned = /oklch\(|#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;
		const offenders = sources
			.filter(({ source }) => banned.test(source))
			.map(({ path, source }) => `${relative(path)}: ${banned.exec(source)?.[0]}`);
		expect(offenders).toEqual([]);
	});

	it('declares no raw font stacks or numeric font weights', () => {
		const banned = /ui-sans-serif|ui-monospace|system-ui|sans-serif|monospace|fontWeight: '\d/;
		const offenders = sources
			.filter(({ source }) => banned.test(source))
			.map(({ path, source }) => `${relative(path)}: ${banned.exec(source)?.[0]}`);
		expect(offenders).toEqual([]);
	});

	it('reads no custom property it never defines', () => {
		const defined = new Set<string>();
		const read = new Map<string, string>();
		for (const { path, source } of sources) {
			// Two definition forms: a quoted object key (CSS-in-JS cannot spell a
			// custom property as a bare identifier) and an inline `style` string.
			for (const [, name] of source.matchAll(/(--ll-[a-z0-9-]+)['"]?\s*:/g)) {
				defined.add(name);
			}
			for (const [, name] of source.matchAll(/var\(\s*(--ll-[a-z0-9-]+)/g)) {
				if (!read.has(name)) read.set(name, relative(path));
			}
		}
		const orphans = [...read]
			.filter(([name]) => !defined.has(name))
			.map(([name, path]) => `${path}: ${name}`);
		expect(orphans).toEqual([]);
	});

	it('keys every performer solid and tint to paired tokens rather than colors', () => {
		const source = readFileSync(join(extensionsDir, 'performer-decorations.ts'), 'utf8');
		const palette = /export const performerPalette = \[([\s\S]*?)\] as const;/.exec(source)?.[1];
		expect(palette).toBeDefined();
		const solids = [...(palette ?? '').matchAll(/solid: '([^']+)'/g)].map(([, value]) => value);
		const tints = [...(palette ?? '').matchAll(/tint: '([^']+)'/g)].map(([, value]) => value);
		expect(solids).toHaveLength(8);
		expect(tints).toHaveLength(8);
		for (let index = 0; index < tints.length; index += 1) {
			const solid = solids[index];
			const tint = tints[index];
			expect(solid).toMatch(/^var\(--performer-[a-z]+\)$/);
			expect(tint).toBe(solid?.replace(/\)$/, '-tint)'));
		}
	});
});

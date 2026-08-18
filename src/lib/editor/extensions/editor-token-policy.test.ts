import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
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

function productStyleSources(root: string): { path: string; source: string }[] {
	const sources: { path: string; source: string }[] = [];
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const path = join(root, entry.name);
		if (entry.isDirectory()) {
			sources.push(...productStyleSources(path));
		} else if (
			['.css', '.svelte', '.ts'].includes(extname(entry.name)) &&
			!entry.name.endsWith('.test.ts')
		) {
			sources.push({ path, source: readFileSync(path, 'utf8') });
		}
	}
	return sources;
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

	/*
	 * The wrap column is a runaway-line cap, not a reading measure, and the
	 * difference is only visible in the editor: the line number, the timestamp
	 * cell, the performer bar and the anchor all address a lyric line by sitting
	 * against one visual row, so a wrapped line draws one lyric line as two rows
	 * with one number and one timestamp cell beside the pair. At a prose-width
	 * 76ch that happened to ordinary lines — a lead vocal with a parenthesized
	 * ad-lib after it runs to about 80 characters routinely — and because the cap
	 * is carried by end padding rather than a `max-width`, the active-line wash
	 * went on running to the edge of a pane a third wider than the text, so the
	 * editor appeared to wrap with visible room to spare.
	 *
	 * Read as text rather than measured, because the failure is a number being
	 * lowered back towards prose and not a layout that stops working: the cap
	 * only binds on a pane wider than itself, so a component test's own viewport
	 * would decide whether the regression was observable at all.
	 */
	it('caps the lyric line past the ad-lib band rather than at a prose measure', () => {
		const tokens = readFileSync(join(dirname(editorDir), 'ui', 'styles', 'tokens.css'), 'utf8');
		const editor = /--measure-editor:\s*(\d+)ch;/.exec(tokens)?.[1];
		const prose = /--measure-prose:\s*(\d+)ch;/.exec(tokens)?.[1];
		expect(editor).toBeDefined();
		expect(prose).toBeDefined();
		expect(Number(editor)).toBeGreaterThanOrEqual(90);
		expect(Number(editor)).toBeGreaterThan(Number(prose));
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

describe('application custom-property policy', () => {
	it('reads no statically named custom property the product never defines', () => {
		const srcDir = join(dirname(editorDir), '..');
		const sources = productStyleSources(srcDir);
		const defined = new Set<string>();
		const read = new Map<string, string>();

		for (const { path, source } of sources) {
			for (const [, name] of source.matchAll(/(--[a-z0-9-]+)['"]?\s*:/g)) defined.add(name);
			for (const [, name] of source.matchAll(/setProperty\(\s*['"](--[a-z0-9-]+)['"]/g)) {
				defined.add(name);
			}
			for (const [, name] of source.matchAll(/var\(\s*(--[a-z0-9-]+)(?=\s*[,)]{1})/g)) {
				if (!read.has(name)) read.set(name, path.slice(srcDir.length + 1));
			}
		}

		const orphans = [...read]
			.filter(([name]) => !defined.has(name))
			.map(([name, path]) => `${path}: ${name}`);
		expect(orphans).toEqual([]);
	});
});

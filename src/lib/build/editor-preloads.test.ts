import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Builder } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import { addEditorPreloads, editorPreloadFiles, withEditorPreloads } from './editor-preloads.js';

const chunk = (fileName: string, imports: string[], facadeModuleId: string | null = null) => ({
	type: 'chunk' as const,
	fileName,
	facadeModuleId,
	imports
});

describe('editor preloads', () => {
	it('follows only the editor static dependency graph, with cycles and shared imports deduplicated', () => {
		const entry = {
			...chunk('editor.js', ['view.js', 'state.js'], '/repo/src/lib/editor/create-editor.ts'),
			dynamicImports: ['search.js']
		};
		expect(
			editorPreloadFiles({
				'editor.js': entry,
				'view.js': chunk('view.js', ['state.js']),
				'state.js': chunk('state.js', ['view.js']),
				'search.js': chunk('search.js', []),
				'assistant.js': chunk('assistant.js', []),
				'font.woff2': { type: 'asset' }
			})
		).toEqual(['editor.js', 'view.js', 'state.js']);
	});

	it('fails visibly if the editor no longer has a dynamic entry', () => {
		expect(() => editorPreloadFiles({ 'page.js': chunk('page.js', []) })).toThrow(
			'dynamic editor entry'
		);
	});

	it('respects a base path or asset origin and does not duplicate existing links', () => {
		const html =
			'<head><meta charset="utf-8"><link rel="modulepreload" href="../state.js"><style>body { color: black }</style></head><body></body>';
		const result = addEditorPreloads(html, ['editor.js', 'state.js'], { base: '/app', assets: '' });
		expect(result.match(/href="\.\.\/state.js"/gu)).toHaveLength(1);
		expect(result).toContain('href="/app/editor.js" crossorigin');
		expect(result.indexOf('/app/editor.js')).toBeLessThan(result.indexOf('<style>'));
		expect(result.indexOf('/app/editor.js')).toBeGreaterThan(result.indexOf('../state.js'));
		expect(result.indexOf('/app/editor.js')).toBeGreaterThan(result.indexOf('<meta'));
		expect(
			addEditorPreloads('<head></head>', ['editor.js'], {
				base: '/app',
				assets: 'https://cdn.example/assets'
			})
		).toContain('href="https://cdn.example/assets/editor.js"');
	});

	it('changes only the mapped workbench page before the underlying adapter compresses it', async () => {
		const root = mkdtempSync(join(tmpdir(), 'lyriclint-preload-'));
		try {
			const client = join(root, 'client');
			const output = join(root, 'capture-output');
			mkdirSync(client);
			const metadata = join(client, '.lyriclint-editor-preloads.json');
			writeFileSync(metadata, JSON.stringify(['_app/editor.js']));
			const html = '<head></head><body>Workspace</body>';
			// SAFETY: this adapter uses only the Builder methods and config fields supplied by this fixture.
			// oxlint-disable-next-line anti-slop/no-chained-type-assertions
			const builder = {
				getClientDirectory: () => client,
				config: { kit: { paths: { base: '/base', assets: '' } } },
				prerendered: { pages: new Map([['/base/workbench/', { file: 'workbench/index.html' }]]) },
				writePrerendered(destination: string) {
					mkdirSync(join(destination, 'workbench'), { recursive: true });
					writeFileSync(join(destination, 'workbench/index.html'), html);
					writeFileSync(join(destination, 'index.html'), html);
					return ['workbench/index.html', 'index.html'];
				}
			} as unknown as Builder;
			const wrapped = withEditorPreloads({
				name: 'test',
				async adapt(active) {
					expect(existsSync(metadata)).toBe(false);
					expect(active.writePrerendered(output)).toEqual(['workbench/index.html', 'index.html']);
					expect(readFileSync(join(output, 'workbench/index.html'), 'utf8')).toContain(
						'href="/base/_app/editor.js"'
					);
					expect(readFileSync(join(output, 'index.html'), 'utf8')).toBe(html);
				}
			});
			await wrapped.adapt(builder);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

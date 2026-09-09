import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Adapter } from '@sveltejs/kit';
import type { Plugin, Rolldown } from 'vite';

// Owned build metadata bridges Kit's separate client build and adaptation.
// It is not a module/asset manifest entry and is removed before assets are copied.
const metadataFile = '.lyriclint-editor-preloads.json';
const editorModule = '/src/lib/editor/create-editor.ts';

type Chunk = Pick<Rolldown.OutputChunk, 'type' | 'fileName' | 'facadeModuleId' | 'imports'>;
type Bundle = Record<string, Chunk | { type: 'asset' }>;

export function editorPreloadFiles(bundle: Bundle): string[] {
	const entry = Object.values(bundle).find(
		(chunk): chunk is Chunk =>
			chunk.type === 'chunk' &&
			chunk.facadeModuleId?.replaceAll('\\', '/').endsWith(editorModule) === true
	);
	if (!entry) throw new Error('The dynamic editor entry is missing from the client bundle.');
	const files = new Set<string>();
	function visit(file: string): void {
		if (files.has(file)) return;
		const chunk = bundle[file];
		if (!chunk || chunk.type !== 'chunk') return;
		files.add(file);
		for (const dependency of chunk.imports) visit(dependency);
	}
	visit(entry.fileName);
	return [...files];
}

export function editorPreloadPlugin(): Plugin {
	let files: string[] | undefined;
	return {
		name: 'lyriclint-editor-preloads',
		apply: 'build',
		generateBundle(_options, bundle) {
			if (this.environment.name !== 'client') return;
			files = editorPreloadFiles(bundle);
		},
		writeBundle(options) {
			if (this.environment.name !== 'client' || !files || !options.dir) return;
			const path = join(options.dir, metadataFile);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, JSON.stringify(files));
		}
	};
}

export function addEditorPreloads(
	html: string,
	files: readonly string[],
	paths: { base: string; assets: string }
): string {
	const prefix = (paths.assets || paths.base).replace(/\/$/u, '');
	const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
	const pageUrl = new URL(`${paths.base}/workbench/`, 'https://build.invalid');
	const existing = new Set(
		[...html.matchAll(/<link\b[^>]*>/giu)]
			.filter(([tag]) => /\brel=["']modulepreload["']/iu.test(tag))
			.flatMap(([tag]) => {
				const href = /\bhref=["']([^"']+)["']/iu.exec(tag)?.[1];
				return href ? [new URL(href.replaceAll('&amp;', '&'), pageUrl).href] : [];
			})
	);
	const tags = files
		.map((file) => `${prefix}/${file}`)
		.filter((url) => !existing.has(new URL(url, pageUrl).href))
		.map((url) => `<link rel="modulepreload" href="${escape(url)}" crossorigin>`)
		.join('\n');
	const headEnd = html.indexOf('</head>');
	if (headEnd < 0) throw new Error('The workbench document has no head.');
	// Discover the large editor chunk beside Kit's initial imports, before the
	// inlined styles. A hint at the end of that stylesheet arrives too late.
	const firstStyle = html.search(/<style\b/iu);
	const insertion = firstStyle >= 0 && firstStyle < headEnd ? firstStyle : headEnd;
	return `${html.slice(0, insertion)}${tags}\n${html.slice(insertion)}`;
}

export function withEditorPreloads(adapter: Adapter): Adapter {
	return {
		...adapter,
		async adapt(builder) {
			const metadata = join(builder.getClientDirectory(), metadataFile);
			const files: string[] = JSON.parse(readFileSync(metadata, 'utf8'));
			rmSync(metadata);
			const { paths } = builder.config.kit;
			const page = builder.prerendered.pages.get(`${paths.base}/workbench/`);
			if (!page) throw new Error('The workbench must be prerendered to preload its editor.');
			await adapter.adapt({
				...builder,
				writePrerendered(destination) {
					const written = builder.writePrerendered(destination);
					const file = join(destination, page.file);
					writeFileSync(file, addEditorPreloads(readFileSync(file, 'utf8'), files, paths));
					return written;
				}
			});
		}
	};
}

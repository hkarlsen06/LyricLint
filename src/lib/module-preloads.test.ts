import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Manifest } from 'vite';
import { expect, it } from 'vitest';

// Exercise the installed Kit implementation, including the committed Bun patch.
// A dependency upgrade that loses the fix must fail before shipping late imports.
const require = createRequire(import.meta.url);
const kit = dirname(require.resolve('@sveltejs/kit/package.json'));
const utility = pathToFileURL(join(kit, 'src/exports/vite/build/utils.js')).href;
const {
	find_deps
}: {
	find_deps: (
		manifest: Manifest,
		entry: string,
		dynamicCss: boolean
	) => { imports: string[]; stylesheets: string[] };
} = await import(utility);

it.each([true, false])(
	'preloads static dependencies encountered first through lazy code (dynamic CSS: %s)',
	(dynamicCss) => {
		const manifest: Manifest = {
			page: { file: 'page.js', imports: ['assistant', 'database'] },
			assistant: { file: 'assistant.js', dynamicImports: ['dialog'] },
			dialog: { file: 'dialog.js', imports: ['database'], css: ['dialog.css'] },
			database: { file: 'database.js', imports: ['driver'], css: ['database.css'] },
			driver: { file: 'driver.js', imports: ['database'] }
		};

		const dependencies = find_deps(manifest, 'page', dynamicCss);
		expect(dependencies.imports).toEqual(['page.js', 'assistant.js', 'database.js', 'driver.js']);
		expect(dependencies.stylesheets).toContain('database.css');
		expect(dependencies.stylesheets.includes('dialog.css')).toBe(dynamicCss);
	}
);

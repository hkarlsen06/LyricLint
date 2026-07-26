import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * The dev server's certificate, when this machine has made one.
 *
 * `vite dev --host` on plain http is not a secure context anywhere but
 * `localhost`, so a phone on the LAN loses everything gated behind one — most
 * visibly the YouTube player, whose iframe inherits the parent page's
 * insecurity and cannot decrypt a DRM-protected track. `bun run certs` writes
 * the pair; a machine that has not run it still gets a working http dev server,
 * because a checkout should not require a certificate to boot.
 */
function devHttps(): { key: Buffer; cert: Buffer } | undefined {
	const key = 'certs/dev-key.pem';
	const cert = 'certs/dev-cert.pem';
	if (!existsSync(key) || !existsSync(cert)) return undefined;
	return { key: readFileSync(key), cert: readFileSync(cert) };
}

export default defineConfig({
	server: { https: devHttps() },
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Cloudflare Pages treats a static site without a top-level 404 page
			// as an SPA and rewrites unknown paths to index.html. A missing hashed
			// asset must remain a 404 rather than becoming 200 text/html.
			adapter: adapter({ fallback: '404.html' })
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					// Loads the token stylesheet so computed-style assertions see the
					// real design system rather than CSS fallbacks.
					setupFiles: ['./vitest-setup-client.ts'],
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});

import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
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

/**
 * Print the loopback literal where Vite would print `localhost`.
 *
 * The URL in the terminal is the one that gets clicked, so it has to be the one
 * that works — and `https://localhost:5173/` does not, for the one thing in this
 * application that leaves the origin. Spotify rejects the *name* `localhost` in
 * a redirect URI at any scheme (see "Spotify refuses the name `localhost`" in
 * AGENTS.md), so a dev session started from the printed URL fails its sign-in
 * with an error that blames TLS.
 *
 * Rewriting the printed URL rather than setting `server.host` is deliberate:
 * binding to `127.0.0.1` would take the LAN entry with it, and the phone on that
 * address is how the whole keyboard-inset and coarse-pointer story gets tested.
 * The server still listens on everything `--host` gave it; only the line that
 * names the local one changes.
 *
 * `resolvedUrls` is populated before `printUrls` runs, so mutating it here also
 * fixes what `--open` would launch.
 */
function loopbackLiteralUrls(): Plugin {
	return {
		name: 'lyriclint:loopback-literal-urls',
		configureServer(server) {
			const print = server.printUrls.bind(server);
			server.printUrls = () => {
				const urls = server.resolvedUrls;
				if (urls) {
					urls.local = urls.local.map((url) => url.replace('://localhost:', '://127.0.0.1:'));
				}
				print();
			};
		}
	};
}

export default defineConfig({
	/**
	 * Name the proxied host, so the tailnet dev server answers it.
	 *
	 * Caddy on the VPS terminates TLS for `dev.lyriclint.com` and forwards here
	 * with that Host header intact. Vite refuses a Host it was not told about —
	 * a DNS-rebinding defence — and answers 403 before any route runs, which
	 * reads as the dev server being down rather than being picky.
	 *
	 * The certificate pair `devHttps` looks for stays a local-machine concern:
	 * over the tailnet the proxy is what makes the origin secure, so the phone
	 * gets its secure context without this checkout owning a key.
	 */
	server: { https: devHttps(), allowedHosts: ['dev.lyriclint.com'] },
	build: {
		/**
		 * Inline Apple's badge, whatever its size.
		 *
		 * Vite inlines an asset as a data URI below `assetsInlineLimit`, which
		 * defaults to 4096 bytes; Apple's lockups are around 7.5KB each because
		 * Illustrator exported them, so they shipped as separate files and the badge
		 * visibly popped in a moment after a song attached. That request only starts
		 * when the element mounts, which is exactly the moment the user is looking at
		 * the row it appears in.
		 *
		 * The alternative — minifying the files — is off the table: their guidelines
		 * say use their artwork unmodified, and inlining is byte-for-byte the same
		 * file. A function rather than a raised global limit, because everything else
		 * in the build should keep the default: this is one exception with a reason,
		 * not a new threshold.
		 */
		assetsInlineLimit: (filePath: string) =>
			filePath.includes('apple-music-listen-on') ? true : undefined
	},
	// `PUBLIC_` alongside Vite's own prefix, so `import.meta.env.PUBLIC_*` carries
	// the same variables SvelteKit's `$env/static/public` would — without the two
	// failure modes that module has here: it refuses to compile when a variable is
	// unset, and its dynamic twin reads `process` at module scope, which the
	// browser test environment does not have.
	envPrefix: ['VITE_', 'PUBLIC_'],
	optimizeDeps: { include: ['@codemirror/search'] },
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
		}),
		loopbackLiteralUrls()
	],
	test: {
		expect: { requireAssertions: true },
		/**
		 * Pin the Spotify client id for the suite, so the tests never depend on an
		 * untracked file.
		 *
		 * The deployed build leaves `PUBLIC_SPOTIFY_CLIENT_ID` unset — Spotify's
		 * allowlist makes the feature unofferable to strangers, see
		 * `spotifyClientId` — and a developer on that allowlist sets it in
		 * `.env.local`. Vitest loads `.env.local` too, which meant the picker's
		 * tests quietly passed on the machine that had one and failed on a fresh
		 * checkout. What the suite is testing is the section's behaviour when it is
		 * configured, so it says so here rather than inheriting whatever the
		 * developer happens to have.
		 */
		env: {
			PUBLIC_SPOTIFY_CLIENT_ID: 'test-client-id',
			// A real-shaped, unsigned JWT expiring in 2100. It has to parse and it has
			// to be in date, because `appleMusicConfigured` checks `exp` rather than
			// mere presence — a bare string here would turn the feature off for the
			// whole suite and every Apple Music assertion would pass by not drawing.
			PUBLIC_APPLE_MUSIC_TOKEN:
				'eyJhbGciOiJFUzI1NiIsImtpZCI6IlRFU1RLRVlJRCJ9.eyJpc3MiOiJURVNUVEVBTUlEIiwiaWF0IjowLCJleHAiOjQxMDI0NDQ4MDB9.testsignature',
			// Empty for the same reason, and it matters more here: the suite runs as a
			// development build, so a developer's own dev-tab label would otherwise
			// rename every tab `DocumentTitle` asserts on. The test that covers the
			// label stubs it per render.
			PUBLIC_DEV_TAB_TITLE: ''
		},
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

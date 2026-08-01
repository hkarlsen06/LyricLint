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
	server: {
		https: devHttps(),
		allowedHosts: ['dev.lyriclint.com'],
		// Rule attachments resolve canonical facts from the generated assistant
		// corpus. SvelteKit's dev allowlist otherwise contains only `src`, so the
		// lazy JSON import is rejected even though it lives in this repository.
		fs: { allow: ['services/rules-assistant/generated'] }
	},
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
			adapter: adapter({ fallback: '404.html' }),
			// Cloudflare Pages consumes `_headers` as platform config and 404s its
			// URL. Left in `$service-worker` `files` it fails the precache validation,
			// so every new worker dies at install and stale clients never update.
			//
			// `register: false` because SvelteKit's own registration runs in dev too,
			// and this worker is cache-first over every same-origin GET — which on a
			// dev server means every Vite module request. Its miss path ends in a
			// throw, so a dev server that restarts, re-optimizes a dep, or invalidates
			// a module URL stops producing a retriable network error and starts
			// producing a rejected dynamic import. The browser caches that rejection
			// against the URL, SvelteKit renders `+error.svelte`, and the tab cannot
			// route out of it. It also serves `static/` cache-first, so an edited
			// asset goes on being the old one. The workbench registers it itself,
			// under `dev`, in the root layout.
			//
			// The `.gif` is the motion loop's sharing copy — a README, an issue, a
			// post. No page references it, so precaching it would spend every
			// visitor's bandwidth on an asset only ever fetched from outside the app.
			serviceWorker: {
				register: false,
				files: (file) => !file.startsWith('_') && !file.endsWith('.gif')
			}
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
			PUBLIC_DEV_TAB_TITLE: '',
			// Pinned so the assistant surfaces draw for their tests regardless of
			// what a developer's env files say. The URL is never fetched — every
			// test injects its own `ask` — and the site key never renders a widget.
			PUBLIC_ASSISTANT_ANSWERS_URL: 'https://assistant.test/v1/answers',
			PUBLIC_TURNSTILE_SITE_KEY: 'test-site-key'
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
					/**
					 * A ceiling on how many test files are in a browser at once. It is a
					 * ceiling rather than a repair, and the measurements are recorded here
					 * because the reasoning that first proposed it was wrong twice.
					 *
					 * The guess was that Vitest sizes its pool from the CPU count, so eight
					 * cores would mean eight Chromium instances at a few hundred MB each, and
					 * that an 8-core / 15GiB box would swap and report it as a timeout on a
					 * different file each run — a memory ceiling wearing the costume of a
					 * race. Both halves are wrong. Browser mode launches *one* Chromium and
					 * opens a page per file, so the per-file cost is a renderer child rather
					 * than a browser; and the pool never saturates anyway, because these
					 * files are individually quick.
					 *
					 * Measured on this repo, 122 files and 1520 tests: the whole suite runs
					 * in ~30s and peaks at 6.8GB of 15GiB with zero swap, capped or not.
					 * So the cap currently costs nothing and prevents nothing.
					 *
					 * It stays because the file count only goes up and the failure it guards
					 * against is the expensive kind to diagnose — but re-measure before
					 * believing any of the above. These are one machine's numbers, and a
					 * suite with slower individual files would saturate a pool this one
					 * leaves idle.
					 *
					 * The `server` project is deliberately uncapped — its 85 files are the
					 * bulk of the run and a node worker is cheap enough to have one per core.
					 */
					maxWorkers: 4,
					/**
					 * Vitest refuses two projects that disagree about `maxWorkers` while
					 * sharing a group, because a group is what it sizes a pool for — so the
					 * cap above is only expressible if these two run in separate groups.
					 * The node project takes group 0 and this one group 1.
					 *
					 * Running second is the right half of that anyway: the 85 node files
					 * finish in about six seconds and are where a broken rule or transform
					 * shows up, so putting them first is the faster failure. It also hands
					 * the browsers a machine the node pool has already let go of, which is
					 * the memory argument the cap is making, for free.
					 */
					sequence: { groupOrder: 1 },
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
					// Group 0, so these run before the browser project — see the note on
					// `sequence.groupOrder` there. Deliberately no `maxWorkers`: a node worker
					// is cheap enough to have one per core, and these 85 files are the bulk of
					// the run.
					sequence: { groupOrder: 0 },
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});

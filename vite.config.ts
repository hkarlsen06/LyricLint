import { existsSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

/**
 * The port both local servers listen on.
 *
 * `vite dev` defaults to 5173 and `vite preview` to 4173, which makes the built
 * site a different origin than the one it was developed on — and this
 * application has two things registered against an exact origin. Spotify
 * matches a redirect URI as a whole string, so a sign-in from the preview
 * server comes back `INVALID_CLIENT: Invalid redirect URI`; MusicKit keeps its
 * user token per origin, so checking a build means signing into Apple Music
 * again. Neither is a failure the port is an obvious suspect for.
 *
 * The port is the only half that needs settling. The scheme follows on its own,
 * because Vite resolves every preview option it shares with the dev server as
 * `preview?.x ?? server.x` — so a `bun run certs` pair reaches `preview` without
 * being named there, and the two are genuinely one origin rather than two that
 * merely agree about a number.
 *
 * Which is worth knowing before trusting a green e2e run on a machine that has
 * made certs: `playwright.config.ts` drives `bun run preview` with an
 * `http://127.0.0.1` base URL, and inherited TLS is what that would run into.
 *
 * One constant rather than a number in each block, so the two cannot drift
 * apart the next time either is touched. Vite falls forward to the next free
 * port when one server is already up, since `strictPort` is left off.
 */
const DEV_PORT = 5173;

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
		port: DEV_PORT,
		https: devHttps(),
		allowedHosts: ['dev.lyriclint.com'],
		// Rule attachments resolve canonical facts from the generated assistant
		// corpus. SvelteKit's dev allowlist otherwise contains only `src`, so the
		// lazy JSON import is rejected even though it lives in this repository.
		fs: { allow: ['services/rules-assistant/generated'] }
	},
	/**
	 * Serve the built site the way the dev server serves the source: on the dev
	 * port, on every interface.
	 *
	 * `vite preview` binds loopback alone and says so — `Network: use --host to
	 * expose` — so Caddy on the VPS, which forwards `dev.lyriclint.com` over the
	 * tailnet address, met a refused connection and a preview build could only be
	 * opened on the machine that ran it. `host: true` is what the dev script's own
	 * `--host` flag does, and it belongs here rather than in that script because a
	 * flag on one command cannot reach the other: Vite resolves `preview.host` as
	 * `preview?.host ?? server.host`, and `server.host` is unset in this file
	 * precisely because dev takes it from the CLI.
	 *
	 * `allowedHosts` and `https` are deliberately *not* repeated. That same `??`
	 * fallback already hands preview both, so the proxied Host header is accepted
	 * and a `bun run certs` pair is picked up without either being named twice —
	 * and a second copy is one that drifts.
	 */
	preview: {
		port: DEV_PORT,
		host: true
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
	// CodeMirror's search panel is opened lazily; pre-bundling prevents its first
	// use in development from invalidating the module graph under a live editor.
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
			/**
			 * The Content-Security-Policy, carried by SvelteKit rather than by
			 * `static/_headers`.
			 *
			 * Every page here is prerendered (`prerender = true` on the root layout),
			 * and a prerendered page carries an inline hydration `<script>`. Reaching
			 * for `script-src 'unsafe-inline'` to admit it would give up most of what a
			 * CSP is for, so `mode: 'hash'` is the answer instead: SvelteKit hashes its
			 * own inline script and adds the `sha256-` source itself, and it emits the
			 * whole policy as a `<meta http-equiv>` in each prerendered document. That
			 * travels with the markup, which matters here more than usual — the service
			 * worker serves navigations out of its own cache, where the headers are
			 * whatever was fetched at install, while a meta tag is part of the document
			 * being replayed.
			 *
			 * `mode` is stated rather than left at `'auto'` even though `'auto'` would
			 * resolve to the same thing: nonces on a prerendered page are insecure and
			 * SvelteKit forbids them, so the only mode this site can ever use is this
			 * one, and saying so keeps a future non-prerendered route from silently
			 * changing the mechanism.
			 *
			 * `frame-ancestors` lives in `static/_headers`, because it is one of the
			 * three directives (with `report-uri` and `sandbox`) a `<meta>` policy
			 * ignores — SvelteKit drops it from the tag rather than emitting something
			 * that does nothing. That split is deliberate and is the whole of the
			 * hybrid: everything expressible in a document goes here, and the one
			 * directive that has to be a header goes there, beside the
			 * `X-Frame-Options: DENY` it restates in the modern spelling.
			 *
			 * Every third-party origin below is a script this application injects on a
			 * press, and nothing is contacted before one — see the media sources and
			 * the assistant. A wildcard appears only where a vendor's own player
			 * spreads across subdomains we do not choose.
			 */
			csp: {
				mode: 'hash',
				directives: {
					// The floor. Everything not named below resolves to same-origin.
					'default-src': ['self'],

					// `wasm-unsafe-eval` is Harper: `harper.js` fetches a same-origin
					// hashed `.wasm` and runs `WebAssembly.instantiateStreaming`, which
					// Chromium checks against `script-src`. It is NOT `unsafe-eval` —
					// nothing in the bundle calls `eval` or `new Function`, and the
					// grammar checker is the only WebAssembly here.
					//
					// The four hosts are the four scripts injected by a press:
					// Turnstile's challenge, YouTube's IFrame API, Spotify's Web
					// Playback SDK, and Apple's MusicKit. SvelteKit appends the
					// `sha256-` for its own inline hydration script.
					'script-src': [
						'self',
						'wasm-unsafe-eval',
						'https://challenges.cloudflare.com',
						'https://www.youtube.com',
						'https://sdk.scdn.co',
						'https://js-cdn.music.apple.com'
					],

					// Harper's `WorkerLinter` builds its worker from a `blob:` URL — the
					// worker body is inlined in the package and blob-ified at runtime,
					// so there is no same-origin URL to name. A blob worker inherits
					// this document's policy, which is what lets its `.wasm` fetch pass
					// under `connect-src 'self'`.
					'worker-src': ['self', 'blob:'],

					// `unsafe-inline` is required and is the one real concession in this
					// policy, for three independent reasons that cannot be hashed:
					// CodeMirror injects `<style>` elements through `StyleModule` at
					// runtime, Svelte's transitions create `<style>` elements for their
					// keyframes, and the boot screen writes its timings as a `style`
					// attribute. Under a meta CSP there is no build step that could see
					// any of them.
					//
					// It is also load-bearing that this list carries no hash: a browser
					// ignores `unsafe-inline` the moment a hash or nonce joins the same
					// directive, and SvelteKit reads `unsafe-inline` here as its signal
					// to stop adding style hashes at all. Adding one back would silently
					// re-break every surface above.
					'style-src': ['self', 'unsafe-inline'],

					// `data:` is Vite's own inlining — the Apple Music badge lockups by
					// the exception in `build.assetsInlineLimit`, plus whatever else
					// falls under the default threshold. The three hosts are album art
					// and video stills.
					'img-src': [
						'self',
						'data:',
						'https://i.ytimg.com',
						'https://*.mzstatic.com',
						'https://*.scdn.co',
						'https://*.spotifycdn.com'
					],

					// Self-hosted in `static/fonts`, so no vendor and no `data:`.
					'font-src': ['self'],

					// `blob:` is a local audio file through `URL.createObjectURL`, and
					// is also how MusicKit feeds its media element. YouTube and Spotify
					// play inside their own frames and need nothing here.
					'media-src': ['self', 'blob:', 'https://*.apple.com', 'https://*.mzstatic.com'],

					'connect-src': [
						// The wasm asset, `_app/version.json`, and the service worker.
						'self',
						// The rules assistant — a streaming NDJSON POST, not EventSource.
						'https://api.lyriclint.com',
						// Spotify: the PKCE token exchange, then the Web API. The
						// wildcards are the Web Playback SDK's own traffic once it
						// connects — a websocket to `dealer.spotify.com` and calls to
						// `spclient` and `apresolve` — which this repository never names
						// and cannot narrow.
						'https://accounts.spotify.com',
						'https://api.spotify.com',
						'https://*.spotify.com',
						'wss://*.spotify.com',
						// Apple: the catalogue read this application makes, then
						// MusicKit's own — `amp-api`, the iTunes license hosts, metrics.
						'https://api.music.apple.com',
						'https://*.apple.com',
						// Artwork is fetched as well as drawn: `downloadImage` in
						// `ui/clipboard.ts` has to pull the bytes through `fetch` before
						// there is a blob to name, because `download` on an anchor is
						// ignored cross-origin. Without these, `Save artwork` degrades to
						// opening a tab every time.
						'https://*.mzstatic.com',
						'https://*.scdn.co',
						'https://*.spotifycdn.com',
						'https://i.ytimg.com',
						// Cloudflare's own recommendation for Turnstile.
						'https://challenges.cloudflare.com'
					],

					// The YouTube player, Turnstile's widget, and the Spotify SDK's DRM
					// frame. Apple signs in through a pop-up rather than a frame, but
					// MusicKit is the one remote source the deployed build ships and its
					// internals are not ours to enumerate.
					'frame-src': [
						'https://www.youtube-nocookie.com',
						'https://challenges.cloudflare.com',
						'https://sdk.scdn.co',
						'https://*.apple.com',
						// The Discord server widget on the landing page's community section.
						'https://discord.com'
					],

					// No plugins, ever.
					'object-src': ['none'],
					// A `<base>` injection cannot re-point every relative URL on the page.
					'base-uri': ['self'],
					// Nothing here posts anywhere; Spotify's authorize step is a
					// top-level redirect rather than a form.
					'form-action': ['self'],
					'manifest-src': ['self']
				}
			},
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
			// post. `workbench.png` serves the same job for the README while the page
			// uses its WebP. No page references either, so neither belongs in every
			// visitor's offline snapshot.
			serviceWorker: {
				register: false,
				files: (file) => !file.startsWith('_') && !file.endsWith('.gif') && file !== 'workbench.png'
			},
			// A deploy reaches a client on their next full-page load — navigations
			// are network-first through the worker, and a new build's chunks match
			// no strategy in an old one — but a client-side navigation reuses the
			// running app, stale code included, so a tab that only ever routed
			// client-side could carry a superseded build for as long as it stayed
			// open. The poll marks `updated`, and the root layout turns the first
			// navigation after that into a full-page one. Neither cache layer can
			// pin the poll: SvelteKit sends it with its own `no-cache` headers, and
			// `_app/version.json` matches none of the worker's strategies, so it
			// falls open to the network.
			version: { pollInterval: 60_000 }
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
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
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

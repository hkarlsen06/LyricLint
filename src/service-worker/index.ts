// Decision record: docs/subsystems/service-worker.md. Read it before changing this file, and update it with any behavior change.
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self as worker } from '$app/service-worker';

/**
 * The worker is an offline snapshot, and it must never stand between the user
 * and the network. Three strategies, chosen by what a URL can honestly promise,
 * and anything that matches none of them is not intercepted at all:
 *
 * - A hashed build asset is content-addressed, so its URL never changes meaning:
 *   cache-first forever, and a network copy may be cached on sight. That
 *   self-heal is what lets an old worker serve a newer deploy's page: the
 *   page's new chunks miss the old snapshot, come from the network, and join it.
 * - A navigation is network-first. What the user sees online is the deployed
 *   site, always; the snapshot answers only when the network cannot. The
 *   worker's version therefore decides nothing about freshness. It is only
 *   how good the offline copy is.
 * - A static or prerendered URL can change between deploys, so it belongs to
 *   this version's snapshot alone and is never written outside install, except
 *   by a navigation landing fresh markup over its own stale copy.
 */

const cachePrefix = 'lyriclint-';
const cacheName = `${cachePrefix}${version}`;

// Manifest paths are relative to the base path, where this worker is served,
// and the front page's is empty.
const root = new URL('./', worker.location.href);
const toPathname = ({ path }: { path: string }): string => new URL(path, root).pathname;

const build = immutable.map(toPathname);
const immutablePaths = new Set(build);

// The Harper wasm is 18MB, most of the build. It is cached the first time the
// workbench actually loads it (the immutable strategy writes on sight), so the
// offline promise still covers it without every landing-page visitor paying for
// it at install.
const precachedImmutable = build.filter((asset) => !asset.endsWith('.wasm'));

/**
 * Only the app's own pages are precached: the workbench, and the front page the
 * offline navigation fallback serves. The other ~57 prerendered pages are the
 * rule reference, ~6MB of markup that changes every deploy and that most
 * sessions never open, and precaching it made install the most expensive thing
 * this application did, per visitor, per deploy. A rules page is cached when it
 * is actually read (the navigation strategy writes what it serves), which keeps
 * the pages someone uses offline without shipping the whole reference to
 * everyone.
 */
const shellPath = root.pathname;

// The snapshot holds one copy per URL, written by a plain fetch at install, so
// a `Vary` header must not split it. Vite's CORS middleware answers `Vary:
// Origin`, and a module script or font is requested in CORS mode: matching on
// Vary turned every cached chunk into a miss, and offline into a blank shell.
const oneCopy: CacheQueryOptions = { ignoreVary: true };
// A page is one copy too, whatever query string it was opened with.
const onePage: CacheQueryOptions = { ...oneCopy, ignoreSearch: true };
const pages = prerendered.map(toPathname);
const precachedPages = pages.filter(
	(path) => path === shellPath || path.replace(/\/$/u, '') === `${shellPath}workbench`
);
const pagePaths = new Set(pages);

/**
 * The `static/` files this worker precaches.
 *
 * Cloudflare Pages consumes `_headers` as platform config and 404s its URL.
 * Precached, it fails the validation below, so every new worker dies at
 * install and stale clients never update.
 *
 * The `.gif` is the motion loop's sharing copy for a README, an issue, a post.
 * `workbench.png` serves the same job for the README while the page uses its
 * WebP. No page references either, so neither belongs in every visitor's
 * offline snapshot. Marketing WebMs are enhancements too: keep their stills
 * offline, without precaching every resolution of every loop for visitors who
 * never watch them. Unlisted video URLs go to the network. Docs pages join the
 * offline snapshot by being read, so their stills should not bloat install.
 */
const files = assets
	.filter(
		({ path }) =>
			!path.startsWith('_') &&
			!path.endsWith('.gif') &&
			!path.endsWith('.webm') &&
			path !== 'workbench.png' &&
			!path.startsWith('docs-')
	)
	.map(toPathname);
const staticPaths = new Set(files);

async function copyForward(cache: Cache, olderCaches: Cache[], asset: string): Promise<boolean> {
	for (const older of olderCaches) {
		const cached = await older.match(asset, oneCopy);
		if (cached) {
			await cache.put(asset, cached);
			return true;
		}
	}
	return false;
}

/**
 * Why a response must not enter the snapshot under this URL, if it must not.
 *
 * Some static hosts answer a missing hashed asset with the HTML app shell and a
 * 200 status. Cached, that permanently poisons the URL in a cache-first worker,
 * so install and the on-sight write both refuse it.
 */
function contentTypeMismatch(pathname: string, response: Response): string | undefined {
	const expected = pathname.endsWith('.js')
		? 'javascript'
		: pathname.endsWith('.css')
			? 'text/css'
			: pathname.endsWith('.wasm')
				? 'application/wasm'
				: undefined;
	const actual = response.headers.get('content-type')?.toLowerCase() ?? '';
	return expected && !actual.includes(expected)
		? `expected ${expected}, received ${actual || 'no content type'}`
		: undefined;
}

async function precacheApplication(): Promise<void> {
	const cache = await caches.open(cacheName);
	const olderNames = (await caches.keys()).filter(
		(name) => name.startsWith(cachePrefix) && name !== cacheName
	);
	const olderCaches = await Promise.all(olderNames.map((name) => caches.open(name)));

	try {
		// Hashed assets already held for a previous version are copied across
		// rather than refetched: content-addressing is what makes that sound, and
		// it is what keeps an update from re-downloading a bundle that did not
		// change. Only assets in *this* build's manifest are copied, so retired
		// chunks die with the old cache.
		const copied = await Promise.all(
			precachedImmutable.map(async (asset) => ({
				asset,
				held: await copyForward(cache, olderCaches, asset)
			}))
		);
		// A missing CacheStorage entry can still be held by the HTTP cache:
		// the page loads its chunks before it registers this worker. Hashed
		// URLs cannot change meaning, so reuse those responses instead of
		// downloading the running application's modules a second time.
		// Static files also use the normal cache policy (revalidation when
		// stale); only the two page snapshots must bypass the HTTP cache.
		const missing = [
			...copied.filter(({ held }) => !held).map(({ asset }) => ({ asset, reload: false })),
			...files.map((asset) => ({ asset, reload: false })),
			...precachedPages.map((asset) => ({ asset, reload: true }))
		];

		// Fetch and validate the whole remainder before writing any of it, so a
		// refused response leaves no partial snapshot behind.
		const assets = await Promise.all(
			missing.map(async ({ asset, reload }) => {
				const request = new Request(asset, reload ? { cache: 'reload' } : undefined);
				const response = await fetch(request);
				if (!response.ok) {
					throw new Error(`Could not precache ${asset}: HTTP ${response.status}`);
				}

				const mismatch = contentTypeMismatch(new URL(request.url).pathname, response);
				if (mismatch) throw new Error(`Could not precache ${asset}: ${mismatch}`);
				return { request, response };
			})
		);

		await Promise.all(assets.map(({ request, response }) => cache.put(request, response)));
	} catch (error) {
		await caches.delete(cacheName);
		throw error;
	}
}

worker.addEventListener('install', (event) => {
	// Deliberately no skipWaiting: this worker activates only once no page from
	// the previous version is open anywhere. Activation is when the previous
	// snapshot is deleted, and a deploy used to do both mid-session, so a tab
	// still running the old document lost the cache its own lazy imports resolved
	// from, and the next dynamic import rejected for the life of that document.
	// Waiting costs nothing the user can see, because navigations are
	// network-first: the site is current the moment it is deployed, worker or no.
	event.waitUntil(precacheApplication());
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			// Network-first navigations pay the worker's own startup on every page
			// load; preload starts the request beside the worker instead of after it.
			await worker.registration.navigationPreload?.enable();
			// Only this application's own caches, not every cache on the origin:
			// whatever else runs here owns its own storage.
			const names = await caches.keys();
			await Promise.all(
				names
					.filter((name) => name.startsWith(cachePrefix) && name !== cacheName)
					.map((name) => caches.delete(name))
			);
			await worker.clients.claim();
		})()
	);
});

async function immutableAsset(event: FetchEvent): Promise<Response> {
	const cached = await caches.match(event.request, oneCopy);
	if (cached) return cached;
	const response = await fetch(event.request);
	if (response.ok && !contentTypeMismatch(new URL(event.request.url).pathname, response)) {
		const copy = response.clone();
		event.waitUntil(caches.open(cacheName).then((cache) => cache.put(event.request, copy)));
	}
	return response;
}

async function navigation(event: FetchEvent): Promise<Response> {
	const request = event.request;
	try {
		const preloaded: Response | undefined = await event.preloadResponse;
		const response = preloaded ?? (await fetch(request));
		// A page of ours that arrived whole refreshes its own offline copy. This
		// is how a visited rules page earns a place in the snapshot, and how the
		// precached pair stays current between worker updates. Keyed by path, so a
		// page opened with a hundred different searches is still one entry.
		const { pathname } = new URL(request.url);
		if (response.ok && pagePaths.has(pathname)) {
			const copy = response.clone();
			event.waitUntil(caches.open(cacheName).then((cache) => cache.put(pathname, copy)));
		}
		// An origin answering 5xx is an outage, and a snapshot of the page beats
		// an error about it. A 404 is not: it is answered truthfully.
		if (response.status >= 500) {
			const cached = await caches.match(request, onePage);
			if (cached) return cached;
		}
		return response;
	} catch {
		const cached = await caches.match(request, onePage);
		if (cached) return cached;
		const shell = await caches.match(shellPath, oneCopy);
		if (shell) return shell;
		throw new Error('This page is not in the offline snapshot.');
	}
}

async function staticAsset(request: Request): Promise<Response> {
	return (await caches.match(request, oneCopy)) ?? fetch(request);
}

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;
	// This prerendered manifest proves which release the origin is serving.
	// Even a direct navigation must bypass the offline snapshot.
	if (url.pathname === `${shellPath}assistant-release.json`) return;

	if (immutablePaths.has(url.pathname)) {
		event.respondWith(immutableAsset(event));
		return;
	}
	if (request.mode === 'navigate') {
		event.respondWith(navigation(event));
		return;
	}
	if (staticPaths.has(url.pathname) || pagePaths.has(url.pathname)) {
		event.respondWith(staticAsset(request));
	}
	// Anything else is not this worker's to answer. Failing open is the rule the
	// dev-server incident taught: a worker that proxies traffic it has no
	// strategy for turns somebody else's transient failure into its own
	// permanent one.
});

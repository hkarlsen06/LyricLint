// Decision record: docs/subsystems/service-worker.md — read it before changing this file, and update it with any behavior change.
/// <reference lib="webworker" />

import { base, build, files, prerendered, version } from '$service-worker';

/**
 * The worker is an offline snapshot, and it must never stand between the user
 * and the network. Three strategies, chosen by what a URL can honestly promise,
 * and anything that matches none of them is not intercepted at all:
 *
 * - A hashed build asset is content-addressed, so its URL never changes meaning:
 *   cache-first forever, and a network copy may be cached on sight. That
 *   self-heal is what lets an old worker serve a newer deploy's page — the
 *   page's new chunks miss the old snapshot, come from the network, and join it.
 * - A navigation is network-first. What the user sees online is the deployed
 *   site, always; the snapshot answers only when the network cannot. The
 *   worker's version therefore decides nothing about freshness — it is only
 *   how good the offline copy is.
 * - A static or prerendered URL can change between deploys, so it belongs to
 *   this version's snapshot alone and is never written outside install, except
 *   by a navigation landing fresh markup over its own stale copy.
 */

// The webworker lib's own `self`, shadowing the DOM `Window` one that the
// project's shared lib set would otherwise put in scope here.
declare const self: ServiceWorkerGlobalScope;
const worker = self;
const cachePrefix = 'lyriclint-';
const cacheName = `${cachePrefix}${version}`;

const toPathname = (asset: string): string => new URL(asset, worker.location.href).pathname;

const immutablePaths = new Set(build.map(toPathname));

// The Harper wasm is 18MB — most of the build. It is cached the first time the
// workbench actually loads it (the immutable strategy writes on sight), so the
// offline promise still covers it without every landing-page visitor paying for
// it at install.
const precachedImmutable = build.filter((asset) => !asset.endsWith('.wasm'));

/**
 * Only the app's own pages are precached: the workbench, and the front page the
 * offline navigation fallback serves. The other ~57 prerendered pages are the
 * rule reference, ~6MB of markup that changes every deploy and that most
 * sessions never open — precaching it made install the most expensive thing
 * this application did, per visitor, per deploy. A rules page is cached when it
 * is actually read (the navigation strategy writes what it serves), which keeps
 * the pages someone uses offline without shipping the whole reference to
 * everyone.
 */
const precachedPages = prerendered.filter((page) => {
	const path = toPathname(page).replace(/\/$/u, '');
	return path === base || path === `${base}/lint`;
});
const pagePaths = new Set(prerendered.map(toPathname));
const staticPaths = new Set(files.map(toPathname));
const shellPath = toPathname(`${base}/`);

async function copyForward(cache: Cache, olderCaches: Cache[], asset: string): Promise<boolean> {
	for (const older of olderCaches) {
		const cached = await older.match(asset);
		if (cached) {
			await cache.put(asset, cached);
			return true;
		}
	}
	return false;
}

function expectedContentType(pathname: string): string | undefined {
	if (pathname.endsWith('.js')) return 'javascript';
	if (pathname.endsWith('.css')) return 'text/css';
	return undefined;
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
		// `reload` bypasses the HTTP cache entirely, and only two of these three
		// sets are worth that. A hashed asset the copy-forward could not find is
		// one this origin has never held, and a precached page's freshness is the
		// whole point of precaching it. The static files are neither: their bytes
		// are usually identical from deploy to deploy — the two motion loops are
		// most of the ~3MB — so forcing them made every install re-download a set
		// ordinary revalidation answers with 304s. They can still change between
		// deploys, which is why they are refetched at all rather than copied
		// forward; a conditional request is what tells the two cases apart.
		const missing = [
			...copied.filter(({ held }) => !held).map(({ asset }) => ({ asset, revalidate: false })),
			...files.map((asset) => ({ asset, revalidate: true })),
			...precachedPages.map((asset) => ({ asset, revalidate: false }))
		];

		// Fetch and validate the whole remainder before writing any of it. Some
		// static hosts answer a missing immutable asset with the HTML app shell
		// and a 200 status; Cache.addAll accepts that response and permanently
		// poisons the JavaScript URL in a cache-first worker.
		const assets = await Promise.all(
			missing.map(async ({ asset, revalidate }) => {
				const request = new Request(asset, revalidate ? undefined : { cache: 'reload' });
				const response = await fetch(request);
				if (!response.ok) {
					throw new Error(`Could not precache ${asset}: HTTP ${response.status}`);
				}

				const expected = expectedContentType(new URL(request.url).pathname);
				const actual = response.headers.get('content-type')?.toLowerCase() ?? '';
				if (expected && !actual.includes(expected)) {
					throw new Error(
						`Could not precache ${asset}: expected ${expected}, received ${actual || 'no content type'}`
					);
				}
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
	// snapshot is deleted, and a deploy used to do both mid-session — so a tab
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
			// Only this application's own caches, not every cache on the origin —
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
	const cached = await caches.match(event.request);
	if (cached) return cached;
	const response = await fetch(event.request);
	if (response.ok) {
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
		// A page of ours that arrived whole refreshes its own offline copy — this
		// is how a visited rules page earns a place in the snapshot, and how the
		// precached pair stays current between worker updates.
		if (response.ok && pagePaths.has(new URL(request.url).pathname)) {
			const copy = response.clone();
			event.waitUntil(caches.open(cacheName).then((cache) => cache.put(request, copy)));
		}
		// An origin answering 5xx is an outage, and a snapshot of the page beats
		// an error about it. A 404 is not: it is answered truthfully.
		if (response.status >= 500) {
			const cached = await caches.match(request, { ignoreSearch: true });
			if (cached) return cached;
		}
		return response;
	} catch {
		const cached = await caches.match(request, { ignoreSearch: true });
		if (cached) return cached;
		const shell = await caches.match(shellPath);
		if (shell) return shell;
		throw new Error('This page is not in the offline snapshot.');
	}
}

async function staticAsset(request: Request): Promise<Response> {
	return (await caches.match(request)) ?? fetch(request);
}

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;

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

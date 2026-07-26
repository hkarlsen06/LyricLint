/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';

const worker = self as unknown as ServiceWorkerGlobalScope;
const cacheName = `lyriclint-${version}`;
const applicationAssets = [...build, ...files, ...prerendered];

function expectedContentType(pathname: string): string | undefined {
	if (pathname.endsWith('.js')) return 'javascript';
	if (pathname.endsWith('.css')) return 'text/css';
	return undefined;
}

async function precacheApplication(): Promise<void> {
	const cache = await caches.open(cacheName);

	try {
		// Fetch and validate the complete snapshot before writing any of it. Some
		// static hosts answer a missing immutable asset with the HTML app shell
		// and a 200 status; Cache.addAll accepts that response and permanently
		// poisons the JavaScript URL in a cache-first worker.
		const assets = await Promise.all(
			applicationAssets.map(async (asset) => {
				const request = new Request(asset, { cache: 'reload' });
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
	event.waitUntil(precacheApplication().then(() => worker.skipWaiting()));
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((names) =>
				Promise.all(names.filter((name) => name !== cacheName).map((name) => caches.delete(name)))
			)
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== worker.location.origin) return;

	event.respondWith(
		caches.match(request).then(async (cached) => {
			if (cached) return cached;
			try {
				return await fetch(request);
			} catch {
				if (request.mode === 'navigate') {
					const shell = await caches.match('/');
					if (shell) return shell;
				}
				throw new Error('Requested resource is not available offline.');
			}
		})
	);
});

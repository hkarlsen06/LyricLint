/** Measure actual HTTP requests during cold navigation + offline snapshot install.
 * Run after `bun run build`: bun scripts/performance/precache.mjs [build directory] [--verify]
 * The server uses the immutable cache policy in static/_headers. Response bodies
 * are uncompressed, so byte counts compare origin body bytes, not CDN wire bytes.
 * No Playwright routing: it disables the HTTP cache this benchmark measures.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const verify = args.includes('--verify');
const root = resolve(args.find((arg) => arg !== '--verify') ?? 'build');
const headers = await readFile(resolve(root, '_headers'), 'utf8');
const immutableCacheControl = headers.match(
	/\/_app\/immutable\/\*\s+Cache-Control:\s*([^\r\n]+)/u
)?.[1];
assert.ok(immutableCacheControl, 'Build must declare the immutable cache policy');
const types = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.wasm': 'application/wasm',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.png': 'image/png',
	'.woff2': 'font/woff2',
	'.webm': 'video/webm'
};
let requests = [];
const server = createServer(async (request, response) => {
	const pathname = new URL(request.url, 'http://localhost').pathname;
	try {
		const file = resolve(root, `.${pathname}`, pathname.endsWith('/') ? 'index.html' : '');
		if (!file.startsWith(`${root}/`)) throw new Error('Invalid path');
		const body = await readFile(file);
		response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
		response.setHeader(
			'Cache-Control',
			pathname.startsWith('/_app/immutable/') ? immutableCacheControl : 'no-cache'
		);
		response.setHeader('Content-Length', body.length);
		requests.push({ pathname, bytes: body.length });
		response.end(body);
	} catch {
		response.writeHead(404).end();
	}
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
	for (const route of ['/', '/workbench/']) {
		for (let run = 1; run <= 3; run++) {
			const context = await browser.newContext({ reducedMotion: 'reduce' });
			const page = await context.newPage();
			requests = [];
			await page.goto(`${origin}${route}`);
			await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
			const immutable = requests.filter(
				({ pathname }) => pathname.startsWith('/_app/immutable/') && !pathname.endsWith('.wasm')
			);
			const unique = new Map(immutable.map(({ pathname, bytes }) => [pathname, bytes]));
			const cache = await page.evaluate(async () => {
				const names = (await caches.keys()).filter((name) => name.startsWith('lyriclint-'));
				const held = await caches.open(names[0]);
				return (await held.keys()).map((request) => new URL(request.url).pathname);
			});
			console.log(
				JSON.stringify({
					route,
					run,
					requests: immutable.length,
					uniqueRequests: unique.size,
					bytes: immutable.reduce((sum, request) => sum + request.bytes, 0),
					duplicateBytes:
						immutable.reduce((sum, request) => sum + request.bytes, 0) -
						[...unique.values()].reduce((sum, bytes) => sum + bytes, 0),
					cachedAssets: cache.length,
					totalRequestBytes: requests.reduce((sum, request) => sum + request.bytes, 0),
					videoRequests: requests.filter(({ pathname }) => pathname.endsWith('.webm')).length,
					videoBytes: requests
						.filter(({ pathname }) => pathname.endsWith('.webm'))
						.reduce((sum, request) => sum + request.bytes, 0),
					offlinePages: cache.filter((path) => path === '/' || path === '/workbench/')
				})
			);
			if (verify) {
				assert.equal(
					requests.filter(({ pathname }) => pathname.endsWith('.webm')).length,
					0,
					'Reduced-motion visits must not download marketing videos through the worker'
				);
				assert.equal(immutable.length, unique.size, `${route}: immutable assets downloaded twice`);
				assert.ok(
					cache.includes('/') && cache.includes('/workbench/'),
					'Offline shells are cached'
				);
				for (const pathname of unique.keys()) {
					assert.ok(
						cache.includes(pathname),
						`${pathname}: downloaded asset missing from snapshot`
					);
				}
			}
			await context.close();
		}
	}
} finally {
	await browser.close();
	await new Promise((done) => server.close(done));
}

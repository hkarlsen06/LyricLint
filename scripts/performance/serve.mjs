/** Local production audit server. Precompress a disposable build copy first. */
import { createServer } from 'node:http';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import sirv from 'sirv';

const root = resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 4183);
for (const file of await readdir(root, { recursive: true })) {
	if (/\.(html|js|css|json|svg|wasm)$/.test(file)) {
		await writeFile(join(root, `${file}.gz`), gzipSync(await readFile(join(root, file))));
	}
}
createServer(
	sirv(root, {
		gzip: true,
		setHeaders(response, pathname) {
			response.setHeader(
				'Cache-Control',
				pathname.includes('/_app/immutable/') ? 'public, max-age=31536000, immutable' : 'no-cache'
			);
		}
	})
).listen(port, '127.0.0.1', () => console.log(`Audit server: http://127.0.0.1:${port}`));

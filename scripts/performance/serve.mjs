/** Local audit server. Optional CERT KEY arguments enable production-like HTTP/2. */
import { createServer } from 'node:http';
import { createSecureServer } from 'node:http2';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import sirv from 'sirv';

const root = resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 4183);
const [certificate, key] = process.argv.slice(4);
if (Boolean(certificate) !== Boolean(key)) throw new Error('Supply both CERT and KEY.');
for (const file of await readdir(root, { recursive: true })) {
	if (/\.(html|js|css|json|svg|wasm)$/.test(file)) {
		const content = await readFile(join(root, file));
		await writeFile(join(root, `${file}.gz`), gzipSync(content));
		if (certificate) {
			await writeFile(
				join(root, `${file}.br`),
				brotliCompressSync(content, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } })
			);
		}
	}
}
const serve = sirv(root, {
	brotli: Boolean(certificate),
	gzip: true,
	setHeaders(response, pathname) {
		response.setHeader(
			'Cache-Control',
			pathname.includes('/_app/immutable/') ? 'public, max-age=31536000, immutable' : 'no-cache'
		);
	}
});
const server = certificate
	? createSecureServer(
			{ cert: await readFile(certificate), key: await readFile(key), allowHTTP1: true },
			serve
		)
	: createServer(serve);
server.listen(port, '127.0.0.1', () =>
	console.log(`Audit server: ${certificate ? 'https' : 'http'}://127.0.0.1:${port}`)
);

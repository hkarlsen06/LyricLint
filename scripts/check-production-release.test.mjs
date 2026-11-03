import { describe, expect, test } from 'bun:test';
import { checkProductionRelease } from './check-production-release.mjs';

const release = {
	revision: 'a'.repeat(40),
	ruleSetVersion: 'test-version',
	corpusHash: 'b'.repeat(64),
	clientCorpusHash: true,
	answersUrl: 'https://api.lyriclint.com/v1/answers'
};
function server({ site = release, health = {}, status = 200 } = {}) {
	const requests = [];
	return {
		requests,
		fetchMetadata: async (url, options) => {
			requests.push({ url: new URL(url), options });
			return Response.json(
				new URL(url).pathname === '/health'
					? {
							ruleSetVersion: release.ruleSetVersion,
							corpusHash: release.corpusHash,
							supportedCorpora: [release],
							...health
						}
					: site,
				{ status }
			);
		}
	};
}
describe('production release verification', () => {
	test('checks the live revision and exact supported corpus with fresh read-only probes', async () => {
		const fixture = server();
		expect(await checkProductionRelease({ revision: release.revision, ...fixture })).toEqual(
			release
		);
		expect(fixture.requests.map((r) => r.url.pathname)).toEqual([
			'/assistant-release.json',
			'/health'
		]);
		for (const { url, options } of fixture.requests) {
			expect(url.searchParams.get('release-check')).toBeTruthy();
			expect(options.cache).toBe('no-store');
			expect(options.headers['cache-control']).toBe('no-cache');
			expect(options.method ?? 'GET').toBe('GET');
		}
	});
	test('rejects a stale site before querying the worker', async () => {
		const fixture = server();
		await expect(checkProductionRelease({ revision: 'c'.repeat(40), ...fixture })).rejects.toThrow(
			'Website revision mismatch'
		);
		expect(fixture.requests).toHaveLength(1);
	});
	test('rejects malformed revisions without network work', async () => {
		const fixture = server();
		await expect(checkProductionRelease({ revision: 'short', ...fixture })).rejects.toThrow(
			'full 40-character'
		);
		expect(fixture.requests).toHaveLength(0);
	});
	test.each([{ corpusHash: 'c'.repeat(64) }, { supportedCorpora: [] }])(
		'rejects incompatible worker metadata',
		async (health) => {
			await expect(
				checkProductionRelease({ revision: release.revision, ...server({ health }) })
			).rejects.toThrow();
		}
	);
	test('propagates non-success responses', async () => {
		await expect(
			checkProductionRelease({ revision: release.revision, ...server({ status: 503 }) })
		).rejects.toThrow('HTTP 503');
	});
});

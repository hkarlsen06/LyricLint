import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAssistantDeployment } from './check-assistant-deployment.mjs';

const corpus = { ruleSetVersion: '2026.09.09.0', contentHash: 'current-corpus' };
const answersUrl = 'https://api.example.com/v1/answers';

test('checks the configured assistant health endpoint without a cached response', async () => {
	await checkAssistantDeployment(answersUrl, corpus, async (url, options) => {
		assert.equal(url.href, 'https://api.example.com/health');
		assert.equal(options.cache, 'no-store');
		assert.ok(options.signal instanceof AbortSignal);
		return Response.json({ ruleSetVersion: corpus.ruleSetVersion, corpusHash: corpus.contentHash });
	});
});

for (const [name, health] of [
	['older ruleset', { ruleSetVersion: 'older', corpusHash: corpus.contentHash }],
	[
		'changed corpus at the same version',
		{ ruleSetVersion: corpus.ruleSetVersion, corpusHash: 'old' }
	],
	['missing metadata', {}]
]) {
	test(`blocks publication for ${name}`, async () => {
		await assert.rejects(
			checkAssistantDeployment(answersUrl, corpus, async () => Response.json(health)),
			/bun run assistant:deploy/
		);
	});
}

test('blocks publication when health is unavailable', async () => {
	await assert.rejects(
		checkAssistantDeployment(answersUrl, corpus, async () => new Response('', { status: 503 })),
		/HTTP 503/
	);
	await assert.rejects(
		checkAssistantDeployment(answersUrl, corpus, async () => {
			throw new Error('Network unavailable');
		}),
		/Network unavailable/
	);
});

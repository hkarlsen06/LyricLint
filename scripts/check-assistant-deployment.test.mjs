import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAssistantDeployment } from './check-assistant-deployment.mjs';

const corpus = { ruleSetVersion: '2026.09.09.0', contentHash: 'current-corpus' };
const answersUrl = 'https://api.example.com/v1/answers';

test('checks the configured assistant health endpoint without a cached response', async () => {
	await checkAssistantDeployment(answersUrl, corpus, async (url, options) => {
		assert.equal(url.origin + url.pathname, 'https://api.example.com/health');
		assert.ok(url.searchParams.get('release-check'));
		assert.equal(options.cache, 'no-store');
		assert.equal(options.headers['cache-control'], 'no-cache');
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

const live = {
	ruleSetVersion: corpus.ruleSetVersion,
	corpusHash: 'previous-corpus',
	clientCorpusHash: true
};
const currentHealth = { ruleSetVersion: corpus.ruleSetVersion, corpusHash: corpus.contentHash };

test('allows publication only when both exact corpora are supported, even at the same ruleset version', async () => {
	await checkAssistantDeployment(
		answersUrl,
		corpus,
		async () =>
			Response.json({
				...currentHealth,
				supportedCorpora: [currentHealth, live]
			}),
		live
	);
});

for (const supportedCorpora of [
	undefined,
	{},
	[currentHealth],
	[live],
	[currentHealth, { ...live, corpusHash: 'wrong-hash' }]
]) {
	test(`blocks a one-sided or malformed compatibility declaration: ${JSON.stringify(supportedCorpora)}`, async () => {
		await assert.rejects(
			checkAssistantDeployment(
				answersUrl,
				corpus,
				async () =>
					Response.json({
						...currentHealth,
						supportedCorpora
					}),
				live
			),
			/does not support the live and incoming/
		);
	});
}

test('requires explicit hashless support while the legacy website is live', async () => {
	const legacy = { ...live, clientCorpusHash: false };
	await assert.rejects(
		checkAssistantDeployment(
			answersUrl,
			corpus,
			async () =>
				Response.json({
					...currentHealth,
					supportedCorpora: [currentHealth, live]
				}),
			legacy
		),
		/legacy clients/
	);
	await checkAssistantDeployment(
		answersUrl,
		corpus,
		async () =>
			Response.json({
				...currentHealth,
				supportedCorpora: [currentHealth, { ...live, acceptsLegacyClients: true }]
			}),
		legacy
	);
});

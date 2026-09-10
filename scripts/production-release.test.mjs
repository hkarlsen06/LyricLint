import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertCiPublisher } from './deploy-production.mjs';
import { requestProductionDeploy } from './request-production-deploy.mjs';
import {
	BOOTSTRAP_RELEASE,
	assertReleaseCorpus,
	deployProduction,
	parseSiteRelease,
	productionWorkerConfig,
	PRODUCTION_ANSWERS_URL,
	readSiteRelease,
	releaseCorporaModule,
	sameRelease,
	waitForPublication
} from './production-release.mjs';

function fixture(letter, ruleSetVersion = 'same-version') {
	const content = { ruleSetVersion, rules: [{ id: `rule-${letter}` }] };
	const contentHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
	return {
		corpus: { ...content, contentHash, generatedAt: '2026-09-10T00:00:00Z' },
		release: {
			revision: letter.repeat(40),
			ruleSetVersion,
			corpusHash: contentHash,
			clientCorpusHash: true,
			answersUrl: PRODUCTION_ANSWERS_URL
		}
	};
}

const previous = fixture('a');
const candidate = fixture('c');

test('reads exact live release metadata without using an offline or cached snapshot', async () => {
	const result = await readSiteRelease('https://site.test', async (url, options) => {
		assert.equal(url.origin + url.pathname, 'https://site.test/assistant-release.json');
		assert.ok(url.searchParams.get('release-check'));
		assert.equal(options.cache, 'no-store');
		assert.equal(options.headers['cache-control'], 'no-cache');
		assert.ok(options.signal instanceof AbortSignal);
		return Response.json(previous.release);
	});
	assert.deepEqual(result, previous.release);
});

test('bootstraps only the precisely identified pre-manifest production build', async () => {
	const fetchBuild = (version) => async (url) =>
		url.pathname === '/assistant-release.json'
			? new Response('', { status: 404 })
			: Response.json({ version });
	assert.deepEqual(
		await readSiteRelease('https://site.test', fetchBuild('1789066083892')),
		BOOTSTRAP_RELEASE
	);
	await assert.rejects(
		readSiteRelease('https://site.test', fetchBuild('some-other-build')),
		/known migration build/
	);
});

test('refuses unknown or malformed website metadata instead of choosing a previous Git commit', async () => {
	for (const invalid of [
		null,
		{},
		{ ...previous.release, revision: '../main' },
		{ ...previous.release, corpusHash: 'unknown' },
		{ ...previous.release, clientCorpusHash: false }
	]) {
		assert.throws(() => parseSiteRelease(invalid), /invalid assistant release/);
	}
	await assert.rejects(
		readSiteRelease('https://site.test', async () => new Response('', { status: 503 })),
		/HTTP 503/
	);
	await assert.rejects(
		readSiteRelease('https://site.test', async () => Response.json({})),
		/invalid assistant release/
	);
});

test('checks both corpus identity and the actual committed content before preparing a release', () => {
	assert.doesNotThrow(() => assertReleaseCorpus(previous.release, previous.corpus));
	assert.throws(() => assertReleaseCorpus(previous.release, candidate.corpus), /does not match/);
	assert.throws(
		() => assertReleaseCorpus(previous.release, { ...previous.corpus, rules: [] }),
		/does not match/
	);
	assert.throws(
		() =>
			assertReleaseCorpus(previous.release, { ...previous.corpus, ruleSetVersion: 'different' }),
		/does not match/
	);
});

test('retains the actual published corpus even when the candidate reuses its version label', () => {
	const module = releaseCorporaModule(candidate.corpus, previous.corpus, previous.release);
	assert.ok(module.includes(JSON.stringify(previous.corpus)));
	assert.ok(module.includes('legacyCorpusHash: string | undefined = undefined'));
	const legacy = releaseCorporaModule(candidate.corpus, previous.corpus, {
		...previous.release,
		clientCorpusHash: false
	});
	assert.ok(
		legacy.includes(`legacyCorpusHash: string | undefined = "${previous.corpus.contentHash}"`)
	);
	const unchanged = releaseCorporaModule(previous.corpus, previous.corpus, previous.release);
	assert.ok(unchanged.includes('compatibleCorpora: readonly AssistantCorpus[] = []'));
});

function operations({ failure, current = [true, true, true], changedLive = false } = {}) {
	const calls = [];
	let reads = 0;
	const step = async (name) => {
		calls.push(name);
		if (failure === name) throw new Error(`${name} failed`);
	};
	return {
		calls,
		isCurrentRevision: async () => current.shift(),
		async readLiveRelease() {
			await step('read-live');
			return changedLive && reads++ > 0 ? fixture('b').release : previous.release;
		},
		async prepareAndTestWorker(live) {
			assert.deepEqual(live, previous.release);
			await step('prepare-and-test');
		},
		deployWorker: () => step('deploy-worker'),
		async verifyWorker(live) {
			assert.deepEqual(live, previous.release);
			await step('verify-worker');
		},
		deployPages: () => step('deploy-pages'),
		async verifySite(release) {
			assert.deepEqual(release, candidate.release);
			await step('verify-site');
		}
	};
}

const releaseOrder = [
	'read-live',
	'prepare-and-test',
	'read-live',
	'deploy-worker',
	'verify-worker',
	'deploy-pages',
	'verify-site'
];

test('prepares and tests compatibility before either publisher, verifies it before Pages, then verifies the live artifact', async () => {
	const ops = operations();
	assert.equal(await deployProduction(candidate.release, ops), true);
	assert.deepEqual(ops.calls, releaseOrder);
});

for (const failure of [
	'read-live',
	'prepare-and-test',
	'deploy-worker',
	'verify-worker',
	'deploy-pages',
	'verify-site'
]) {
	test(`stops the rollout at ${failure} failure`, async () => {
		const ops = operations({ failure });
		await assert.rejects(deployProduction(candidate.release, ops), new RegExp(`${failure} failed`));
		assert.deepEqual(ops.calls, releaseOrder.slice(0, releaseOrder.indexOf(failure) + 1));
	});
}

test('a retry after Pages failure still prepares the old live website, not the already-updated Worker', async () => {
	const failed = operations({ failure: 'deploy-pages' });
	await assert.rejects(deployProduction(candidate.release, failed), /deploy-pages failed/);
	const retry = operations();
	assert.equal(await deployProduction(candidate.release, retry), true);
	assert.deepEqual(retry.calls, releaseOrder);
});

test('a retry after Pages succeeded verifies without pruning the existing compatible Worker', async () => {
	const ops = operations();
	ops.readLiveRelease = async () => {
		ops.calls.push('read-live');
		return candidate.release;
	};
	ops.verifyWorker = async (live) => {
		assert.deepEqual(live, candidate.release);
		ops.calls.push('verify-worker');
	};
	assert.equal(await deployProduction(candidate.release, ops), true);
	assert.deepEqual(ops.calls, ['read-live', 'verify-worker', 'verify-site']);
});

test('deployment verification retries propagation delays but fails on a persistent mismatch', async () => {
	let checks = 0;
	let waits = 0;
	const options = {
		attempts: 3,
		wait: async () => {
			waits++;
		}
	};
	await waitForPublication(async () => {
		if (++checks < 2) throw new Error('Old edge response');
	}, options);
	assert.equal(checks, 2);
	assert.equal(waits, 1);
	await assert.rejects(
		waitForPublication(async () => {
			throw new Error('Wrong release');
		}, options),
		/Wrong release/
	);
	assert.equal(waits, 3);
});

test('code releases retain the existing domain and inherit the kill switch without losing other bindings', () => {
	const source = Bun.JSONC.parse(
		readFileSync(new URL('../services/rules-assistant/wrangler.jsonc', import.meta.url), 'utf8')
	);
	const before = structuredClone(source);
	const config = productionWorkerConfig(source);
	assert.deepEqual(source, before);
	assert.equal('route' in config, false);
	assert.equal('routes' in config, false);
	assert.equal(config.workers_dev, false);
	assert.equal(config.preview_urls, false);
	assert.equal('ASSISTANT_DISABLED' in config.vars, false);
	assert.deepEqual(config.unsafe.bindings, [
		...source.unsafe.bindings,
		{ name: 'ASSISTANT_DISABLED', type: 'inherit' }
	]);
	assert.deepEqual(config.durable_objects, source.durable_objects);
	assert.deepEqual(config.migrations, source.migrations);
	assert.deepEqual(config.analytics_engine_datasets, source.analytics_engine_datasets);
	assert.equal(config.vars.ALLOWED_ORIGIN, source.vars.ALLOWED_ORIGIN);
});

test('a superseding main revision cannot publish the older website', async () => {
	for (const [current, expected] of [
		[[false], []],
		[
			[true, false],
			['read-live', 'prepare-and-test']
		],
		[[true, true, false], releaseOrder.slice(0, 5)]
	]) {
		const ops = operations({ current });
		assert.equal(await deployProduction(candidate.release, ops), false);
		assert.deepEqual(ops.calls, expected);
	}
});

test('refuses to publish if production changed outside the lock while tests ran', async () => {
	const ops = operations({ changedLive: true });
	await assert.rejects(deployProduction(candidate.release, ops), /live website changed/);
	assert.deepEqual(ops.calls, releaseOrder.slice(0, 3));
});

test('verifying publication includes revision and client protocol as well as corpus', () => {
	assert.equal(sameRelease(candidate.release, candidate.release), true);
	for (const patch of [
		{ revision: 'd'.repeat(40) },
		{ corpusHash: previous.release.corpusHash },
		{ clientCorpusHash: false }
	]) {
		assert.equal(sameRelease({ ...candidate.release, ...patch }, candidate.release), false);
	}
});

const ready = {
	revision: 'current-main',
	mainRevision: 'current-main',
	dirty: false,
	runId: 123,
	jobs: [
		...['checks', 'assistant', 'e2e'].map((name) => ({ name, conclusion: 'success' })),
		{ name: 'deploy', databaseId: 456, status: 'completed' }
	]
};

test('both package deployment commands route to the same CI publisher', () => {
	for (const [path, name] of [
		['../package.json', 'assistant:deploy'],
		['../services/rules-assistant/package.json', 'deploy']
	]) {
		const pkg = JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
		assert.match(pkg.scripts[name], /request-production-deploy\.mjs$/);
		assert.doesNotMatch(pkg.scripts[name], /wrangler/);
	}
	const calls = [];
	requestProductionDeploy(ready, (command, args) => calls.push([command, ...args]));
	assert.deepEqual(calls, [
		['gh', 'run', 'rerun', '123', '--job', '456'],
		['gh', 'run', 'watch', '123', '--exit-status']
	]);
});

test('local retry cannot bypass failed checks and does not restart a running publisher', () => {
	const calls = [];
	assert.throws(
		() => requestProductionDeploy({ ...ready, jobs: [] }, (command) => calls.push(command)),
		/requires a successful/
	);
	assert.deepEqual(calls, []);
	requestProductionDeploy(
		{
			...ready,
			jobs: ready.jobs.map((job) =>
				job.name === 'deploy' ? { ...job, status: 'in_progress' } : job
			)
		},
		(command, args) => calls.push([command, ...args])
	);
	assert.deepEqual(calls, [['gh', 'run', 'watch', '123', '--exit-status']]);
});

test('the raw publisher refuses local use, PRs, other branches and missing credentials', () => {
	const env = {
		GITHUB_ACTIONS: 'true',
		GITHUB_EVENT_NAME: 'push',
		GITHUB_REF: 'refs/heads/main',
		GITHUB_SHA: candidate.release.revision,
		GH_TOKEN: 'set',
		CLOUDFLARE_API_TOKEN: 'set',
		CLOUDFLARE_ACCOUNT_ID: 'set',
		PUBLIC_ASSISTANT_ANSWERS_URL: PRODUCTION_ANSWERS_URL
	};
	assert.doesNotThrow(() => assertCiPublisher(env));
	for (const patch of [
		{ GITHUB_ACTIONS: undefined },
		{ GITHUB_EVENT_NAME: 'pull_request' },
		{ GITHUB_REF: 'refs/heads/topic' },
		{ GITHUB_SHA: 'invalid' },
		{ CLOUDFLARE_API_TOKEN: '' }
	]) {
		assert.throws(
			() => assertCiPublisher({ ...env, ...patch }),
			/only by main CI|Missing production/
		);
	}
	assert.throws(
		() =>
			assertCiPublisher({
				...env,
				PUBLIC_ASSISTANT_ANSWERS_URL: 'https://another.test/v1/answers'
			}),
		/endpoint does not match/
	);
});

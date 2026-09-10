import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { checkAssistantDeployment } from './check-assistant-deployment.mjs';
import {
	assertAssistantReleaseReady,
	readAssistantReleaseState
} from './check-assistant-release.mjs';
import {
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

const root = fileURLToPath(new URL('..', import.meta.url));
const worker = fileURLToPath(new URL('../services/rules-assistant', import.meta.url));
const siteUrl = 'https://lyriclint.com';

export function assertCiPublisher(env) {
	if (
		env.GITHUB_ACTIONS !== 'true' ||
		env.GITHUB_EVENT_NAME !== 'push' ||
		env.GITHUB_REF !== 'refs/heads/main' ||
		!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')
	) {
		throw new Error(
			'Production is published only by main CI. Use bun run assistant:deploy to retry it.'
		);
	}
	for (const name of [
		'GH_TOKEN',
		'CLOUDFLARE_API_TOKEN',
		'CLOUDFLARE_ACCOUNT_ID',
		'PUBLIC_ASSISTANT_ANSWERS_URL'
	]) {
		if (!env[name]) throw new Error(`Missing production deployment configuration: ${name}.`);
	}
	if (env.PUBLIC_ASSISTANT_ANSWERS_URL !== PRODUCTION_ANSWERS_URL) {
		throw new Error('The configured assistant endpoint does not match the production Worker.');
	}
}

if (import.meta.main) {
	assertCiPublisher(process.env);
	const capture = (command, args) =>
		execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim();
	const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });
	const state = readAssistantReleaseState(capture);
	assertAssistantReleaseReady(state);
	if (
		state.revision !== process.env.GITHUB_SHA ||
		String(state.runId) !== process.env.GITHUB_RUN_ID
	) {
		throw new Error('Only the latest CI run for this checked-out main revision may publish.');
	}
	const candidate = parseSiteRelease(
		JSON.parse(await readFile(new URL('../build/assistant-release.json', import.meta.url), 'utf8'))
	);
	if (candidate.revision !== state.revision)
		throw new Error('The tested Pages artifact belongs to a different revision.');
	const corpus = JSON.parse(
		await readFile(
			new URL('../services/rules-assistant/generated/rules-context.json', import.meta.url),
			'utf8'
		)
	);
	assertReleaseCorpus(candidate, corpus);
	const answersUrl = candidate.answersUrl;
	const published = await deployProduction(candidate, {
		isCurrentRevision: async () =>
			capture('gh', ['api', 'repos/{owner}/{repo}/git/ref/heads/main', '--jq', '.object.sha']) ===
			state.revision,
		readLiveRelease: () => readSiteRelease(siteUrl),
		async prepareAndTestWorker(live) {
			// A shallow checkout may not contain the published revision. Fetch only
			// that exact commit, then read reviewed data rather than executable code.
			run('git', ['fetch', '--no-tags', '--depth=1', 'origin', live.revision]);
			const liveCorpus = JSON.parse(
				capture('git', [
					'show',
					`${live.revision}:services/rules-assistant/generated/rules-context.json`
				])
			);
			await writeFile(
				new URL('../services/rules-assistant/generated/release-corpora.ts', import.meta.url),
				releaseCorporaModule(corpus, liveCorpus, live)
			);
			const config = Bun.JSONC.parse(await readFile(`${worker}/wrangler.jsonc`, 'utf8'));
			await writeFile(
				`${worker}/wrangler.release.json`,
				JSON.stringify(productionWorkerConfig(config))
			);
			run('bun', ['run', 'check'], worker);
			run('bun', ['run', 'test'], worker);
		},
		async deployWorker() {
			run(
				'bun',
				[
					'x',
					'--no-install',
					'wrangler',
					'deploy',
					'--config',
					'wrangler.release.json',
					'--keep-vars'
				],
				worker
			);
		},
		verifyWorker: (live) =>
			waitForPublication(() => checkAssistantDeployment(answersUrl, corpus, fetch, live)),
		async deployPages() {
			// Reuse the lockfile-pinned executable from the repository root so the
			// Pages command does not discover the separate Worker's configuration.
			run(`${worker}/node_modules/.bin/wrangler`, [
				'pages',
				'deploy',
				`${root}/build`,
				'--project-name',
				'lyriclint',
				'--branch',
				'main',
				'--commit-hash',
				state.revision,
				'--commit-dirty=false'
			]);
		},
		async verifySite(expected) {
			// Publication is asynchronous at the edge. Wait within the deployment
			// lock, while the Worker continues to support both website versions.
			await waitForPublication(async () => {
				if (!sameRelease(await readSiteRelease(siteUrl), expected)) {
					throw new Error(
						'Pages has not served the tested release after publication; both corpora remain supported.'
					);
				}
			});
		}
	});
	console.log(
		published
			? 'The tested website and compatible assistant are published.'
			: 'A newer main revision supersedes this publication.'
	);
}

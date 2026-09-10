import { execFileSync } from 'node:child_process';

export function assertAssistantReleaseReady({ revision, mainRevision, dirty, jobs }) {
	if (dirty) throw new Error('Commit or stash tracked changes before deploying the assistant.');
	if (revision !== mainRevision) {
		throw new Error('Deploy the assistant from the current GitHub main revision.');
	}
	for (const name of ['checks', 'assistant', 'e2e']) {
		if (!jobs.some((job) => job.name === name && job.conclusion === 'success')) {
			throw new Error(`Assistant deployment requires a successful ${name} CI job for ${revision}.`);
		}
	}
}

export function readAssistantReleaseState(
	run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim()
) {
	const revision = run('git', ['rev-parse', 'HEAD']);
	const dirty = run('git', ['status', '--porcelain', '--untracked-files=no']) !== '';
	const mainRevision = run('gh', [
		'api',
		'repos/{owner}/{repo}/git/ref/heads/main',
		'--jq',
		'.object.sha'
	]);
	const runs = JSON.parse(
		run('gh', [
			'run',
			'list',
			'--workflow',
			'ci.yml',
			'--branch',
			'main',
			'--event',
			'push',
			'--commit',
			revision,
			'--limit',
			'1',
			'--json',
			'databaseId'
		])
	);
	const jobs = runs.length
		? JSON.parse(run('gh', ['run', 'view', String(runs[0].databaseId), '--json', 'jobs'])).jobs
		: [];
	return { revision, mainRevision, dirty, jobs, runId: runs[0]?.databaseId };
}

if (import.meta.main) {
	const state = readAssistantReleaseState();
	assertAssistantReleaseReady(state);
	const { revision } = state;
	console.log(`CI passed for ${revision}; the assistant can be deployed.`);
}

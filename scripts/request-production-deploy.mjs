import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
	assertAssistantReleaseReady,
	readAssistantReleaseState
} from './check-assistant-release.mjs';

/** Local commands can request the guarded CI publisher, never publish one half. */
export function requestProductionDeploy(state, run) {
	assertAssistantReleaseReady(state);
	const deployment = state.jobs.find((job) => job.name === 'deploy');
	if (!state.runId || !deployment?.databaseId) {
		throw new Error('The production deploy job is not available yet; retry after CI creates it.');
	}
	if (deployment.status === 'completed') {
		run('gh', ['run', 'rerun', String(state.runId), '--job', String(deployment.databaseId)]);
	}
	run('gh', ['run', 'watch', String(state.runId), '--exit-status']);
}

if (import.meta.main) {
	const cwd = fileURLToPath(new URL('..', import.meta.url));
	const state = readAssistantReleaseState((command, args) =>
		execFileSync(command, args, { cwd, encoding: 'utf8' }).trim()
	);
	requestProductionDeploy(state, (command, args) =>
		execFileSync(command, args, { cwd, stdio: 'inherit' })
	);
}

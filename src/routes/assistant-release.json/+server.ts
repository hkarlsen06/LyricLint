import { execFileSync } from 'node:child_process';
import { assistantAnswersUrl } from '$lib/assistant/api.js';
import { corpusMetadata } from '../../../services/rules-assistant/generated/rules-context-meta.js';

export const prerender = true;
export const trailingSlash = 'never';

/** Built with the website artifact; the rollout checks the served release before
 * promoting the assistant. Local builds identify their checked-out revision. */
export function GET(): Response {
	const revision =
		process.env.RELEASE_REVISION ??
		execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
	if (!/^[a-f0-9]{40}$/u.test(revision)) {
		throw new Error('RELEASE_REVISION must be a full Git commit SHA.');
	}
	return Response.json(
		{ revision, ...corpusMetadata, clientCorpusHash: true, answersUrl: assistantAnswersUrl() },
		{ headers: { 'cache-control': 'no-store' } }
	);
}

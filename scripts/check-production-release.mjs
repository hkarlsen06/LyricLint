import { execFileSync } from 'node:child_process';
import { readSiteRelease } from './production-release.mjs';
import { checkAssistantDeployment } from './check-assistant-deployment.mjs';

/** Read-only verification of the published site and its exact assistant corpus. */
export async function checkProductionRelease({
	revision,
	siteUrl = 'https://lyriclint.com',
	fetchMetadata = fetch
}) {
	if (!/^[a-f0-9]{40}$/u.test(revision ?? '')) {
		throw new Error('Expected a full 40-character release revision.');
	}
	const release = await readSiteRelease(siteUrl, fetchMetadata);
	if (release.revision !== revision) {
		throw new Error(
			`Website revision mismatch: expected ${revision}, received ${release.revision}.`
		);
	}
	await checkAssistantDeployment(
		release.answersUrl,
		{ ruleSetVersion: release.ruleSetVersion, contentHash: release.corpusHash },
		fetchMetadata,
		release
	);
	return release;
}

if (import.meta.main) {
	const [
		revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
		siteUrl
	] = process.argv.slice(2);
	if (process.argv.length > 4)
		throw new Error('Usage: bun run release:check [REVISION] [SITE_URL]');
	const release = await checkProductionRelease({ revision, ...(siteUrl && { siteUrl }) });
	console.log(
		JSON.stringify({
			status: 'ok',
			siteUrl: siteUrl ?? 'https://lyriclint.com',
			revision: release.revision,
			ruleSetVersion: release.ruleSetVersion,
			corpusHash: release.corpusHash,
			answersUrl: release.answersUrl
		})
	);
}

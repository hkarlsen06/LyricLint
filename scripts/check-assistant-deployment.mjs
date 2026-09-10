import { readFile } from 'node:fs/promises';
import { fetchReleaseMetadata } from './production-release.mjs';

/** Verify the live Worker serves the corpus built into this site's revision. */
export async function checkAssistantDeployment(
	answersUrl,
	corpus,
	fetchHealth = fetch,
	liveRelease
) {
	const healthUrl = new URL('/health', answersUrl);
	const response = await fetchReleaseMetadata(healthUrl, fetchHealth);
	if (!response.ok) throw new Error(`Assistant health check failed: HTTP ${response.status}.`);
	const health = await response.json();
	if (health.ruleSetVersion !== corpus.ruleSetVersion || health.corpusHash !== corpus.contentHash) {
		throw new Error(
			`Assistant deployment is stale: expected ruleset ${corpus.ruleSetVersion} and corpus ${corpus.contentHash}, ` +
				`received ${health.ruleSetVersion} and ${health.corpusHash}. ` +
				'Rerun the coordinated production release with bun run assistant:deploy.'
		);
	}
	// Publication must preserve the website that is still live if Pages fails.
	// Checking only the candidate was the one-way gate behind the September outage.
	if (liveRelease) {
		for (const release of [
			{
				ruleSetVersion: corpus.ruleSetVersion,
				corpusHash: corpus.contentHash,
				clientCorpusHash: true
			},
			liveRelease
		]) {
			const supported = (
				Array.isArray(health.supportedCorpora) ? health.supportedCorpora : []
			).find(
				(entry) =>
					entry?.ruleSetVersion === release.ruleSetVersion &&
					entry.corpusHash === release.corpusHash
			);
			if (!supported || (!release.clientCorpusHash && supported.acceptsLegacyClients !== true)) {
				throw new Error(
					`The assistant does not support the live and incoming websites: missing ruleset ${release.ruleSetVersion}, ` +
						`corpus ${release.corpusHash}${release.clientCorpusHash ? '' : ' (legacy clients)'}. ` +
						'Pages publication was stopped; rerun bun run assistant:deploy.'
				);
			}
		}
	}
}

if (import.meta.main) {
	const corpus = JSON.parse(
		await readFile(
			new URL('../services/rules-assistant/generated/rules-context.json', import.meta.url),
			'utf8'
		)
	);
	await checkAssistantDeployment(process.env.PUBLIC_ASSISTANT_ANSWERS_URL, corpus);
	console.log('The deployed assistant matches the tested site corpus.');
}

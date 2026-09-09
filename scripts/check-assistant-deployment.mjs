import { readFile } from 'node:fs/promises';

/** Verify the live Worker serves the corpus built into this site's revision. */
export async function checkAssistantDeployment(answersUrl, corpus, fetchHealth = fetch) {
	const healthUrl = new URL('/health', answersUrl);
	const response = await fetchHealth(healthUrl, {
		cache: 'no-store',
		signal: AbortSignal.timeout(15_000)
	});
	if (!response.ok) throw new Error(`Assistant health check failed: HTTP ${response.status}.`);
	const health = await response.json();
	if (health.ruleSetVersion !== corpus.ruleSetVersion || health.corpusHash !== corpus.contentHash) {
		throw new Error(
			`Assistant deployment is stale: expected ruleset ${corpus.ruleSetVersion} and corpus ${corpus.contentHash}, ` +
				`received ${health.ruleSetVersion} and ${health.corpusHash}. ` +
				'Deploy this revision of the Worker with bun run assistant:deploy, then rerun the Pages deploy job.'
		);
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

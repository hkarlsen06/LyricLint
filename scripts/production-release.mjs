import { createHash, randomUUID } from 'node:crypto';

export const PRODUCTION_ANSWERS_URL = 'https://api.lyriclint.com/v1/answers';

// The last release before /assistant-release.json existed, verified against
// CI run 34516450728. This one-time migration never guesses from a version label.
export const BOOTSTRAP_RELEASE = {
	revision: '0982b7a205ebce2a57ebcfa6357a91a89cfc418d',
	ruleSetVersion: '2026.09.10.0',
	corpusHash: '5b8a4913bae061c26eb8fff9b9ac1b3569bb394f89a09017fbb2c12e36d07d6d',
	clientCorpusHash: false,
	answersUrl: PRODUCTION_ANSWERS_URL
};
const BOOTSTRAP_BUILD = '1789066083892';

// oxlint-disable anti-slop/no-runtime-typeof -- This is the I/O parser for untrusted JSON. Regexes alone coerce non-string fields.
export function parseSiteRelease(value) {
	if (
		!value ||
		typeof value.revision !== 'string' ||
		!/^[a-f0-9]{40}$/.test(value.revision ?? '') ||
		typeof value.ruleSetVersion !== 'string' ||
		!value.ruleSetVersion.length ||
		value.ruleSetVersion.length > 64 ||
		typeof value.corpusHash !== 'string' ||
		!/^[a-f0-9]{64}$/.test(value.corpusHash ?? '') ||
		value.clientCorpusHash !== true ||
		value.answersUrl !== PRODUCTION_ANSWERS_URL
	) {
		throw new Error('The website has invalid assistant release metadata; refusing to deploy.');
	}
	return value;
}
// oxlint-enable anti-slop/no-runtime-typeof

export async function readSiteRelease(siteUrl, fetchSite = fetch) {
	const response = await fetchReleaseMetadata(
		new URL('/assistant-release.json', siteUrl),
		fetchSite
	);
	if (response.ok) return parseSiteRelease(await response.json());
	if (response.status !== 404) {
		throw new Error(`Cannot identify the live website: HTTP ${response.status}.`);
	}
	const version = await fetchReleaseMetadata(new URL('/_app/version.json', siteUrl), fetchSite);
	if (!version.ok || (await version.json()).version !== BOOTSTRAP_BUILD) {
		throw new Error(
			'The live website has no release manifest and is not the known migration build.'
		);
	}
	return BOOTSTRAP_RELEASE;
}

export function fetchReleaseMetadata(url, fetchMetadata = fetch) {
	const freshUrl = new URL(url);
	// Bun's cache option alone adds no HTTP request headers. A unique URL also
	// bypasses an edge-cached pre-migration 404 or an older /health response.
	freshUrl.searchParams.set('release-check', randomUUID());
	return fetchMetadata(freshUrl, {
		cache: 'no-store',
		headers: { 'cache-control': 'no-cache' },
		signal: AbortSignal.timeout(15_000)
	});
}

export async function waitForPublication(
	check,
	{ attempts = 12, wait = () => new Promise((resolve) => setTimeout(resolve, 5_000)) } = {}
) {
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			await check();
			return;
		} catch (error) {
			if (attempt + 1 === attempts) throw error;
		}
		await wait();
	}
}

export function productionWorkerConfig(source) {
	const config = structuredClone(source);
	// Routine code releases retain the existing custom domain. Omitting routes
	// avoids zone permissions and cannot remove/reassign a production hostname.
	delete config.route;
	delete config.routes;
	config.workers_dev = false;
	config.preview_urls = false;
	// Explicit source vars override --keep-vars. Inherit the operational switch
	// by name instead; Wrangler uses strict binding inheritance on upload.
	delete config.vars.ASSISTANT_DISABLED;
	config.unsafe.bindings = [
		...config.unsafe.bindings.filter((binding) => binding.name !== 'ASSISTANT_DISABLED'),
		{ name: 'ASSISTANT_DISABLED', type: 'inherit' }
	];
	return config;
}

export function assertReleaseCorpus(release, corpus) {
	const content = { ...corpus };
	delete content.generatedAt;
	delete content.contentHash;
	const actualHash = createHash('sha256').update(JSON.stringify(content)).digest('hex');
	if (
		corpus.ruleSetVersion !== release.ruleSetVersion ||
		corpus.contentHash !== release.corpusHash ||
		actualHash !== release.corpusHash
	) {
		throw new Error(`The committed corpus does not match website release ${release.revision}.`);
	}
}

export function releaseCorporaModule(currentCorpus, liveCorpus, liveRelease) {
	assertReleaseCorpus(liveRelease, liveCorpus);
	const compatible = currentCorpus.contentHash === liveCorpus.contentHash ? [] : [liveCorpus];
	const legacyHash = liveRelease.clientCorpusHash
		? 'undefined'
		: JSON.stringify(liveCorpus.contentHash);
	return (
		'// Prepared by the coordinated CI release from the currently published website.\n' +
		"import type { AssistantCorpus } from './rules-context';\n\n" +
		`export const compatibleCorpora: readonly AssistantCorpus[] = ${JSON.stringify(compatible)};\n` +
		`export const legacyCorpusHash: string | undefined = ${legacyHash};\n`
	);
}

export function sameRelease(actual, expected) {
	return (
		actual.revision === expected.revision &&
		actual.ruleSetVersion === expected.ruleSetVersion &&
		actual.corpusHash === expected.corpusHash &&
		actual.clientCorpusHash === expected.clientCorpusHash &&
		actual.answersUrl === expected.answersUrl
	);
}

/** Both publishers run under the same CI lock, using the website actually live. */
export async function deployProduction(candidate, operations) {
	if (!(await operations.isCurrentRevision())) return false;
	const live = await operations.readLiveRelease();
	// A Pages upload can succeed even when its verification timed out. A retry
	// must not redeploy a same-revision Worker that prunes the previous clients.
	if (sameRelease(live, candidate)) {
		await operations.verifyWorker(live);
		await operations.verifySite(candidate);
		return true;
	}
	await operations.prepareAndTestWorker(live);
	if (!(await operations.isCurrentRevision())) return false;
	if (!sameRelease(await operations.readLiveRelease(), live)) {
		throw new Error(
			'The live website changed while preparing its compatible Worker; rerun deployment.'
		);
	}
	await operations.deployWorker();
	await operations.verifyWorker(live);
	// A newer commit can supersede this one while the Worker is publishing. The
	// deployed Worker still serves `live`, so leaving Pages alone remains safe.
	if (!(await operations.isCurrentRevision())) return false;
	await operations.deployPages();
	await operations.verifySite(candidate);
	return true;
}

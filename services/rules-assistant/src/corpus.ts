/**
 * The generated knowledge corpus. `generated/rules-context.json` is produced by
 * `bun run assistant:corpus` at the repository root from the frontend's own
 * reviewed data (currentRuleSet, RuleReference derivations, the source
 * registry, the reviewed language packs, and docs/rules.md) — never edited by
 * hand. Parity tests in the main app fail when it goes stale.
 */
import type { AssistantCorpus } from '../generated/rules-context';
import { corpus } from '../generated/rules-context-data';
import { corpus as musixmatchCorpus } from '../generated/musixmatch-context-data';
import { compatibleCorpora, legacyCorpusHash } from '../generated/release-corpora';

export { corpus };

export type RulesCorpus = AssistantCorpus;

export interface CorpusContext {
	readonly corpus: RulesCorpus;
	readonly ruleIds: ReadonlySet<string>;
	readonly sourceIds: ReadonlySet<string>;
}

export interface SupportedCorpus {
	profile?: 'genius' | 'musixmatch';
	ruleSetVersion: string;
	corpusHash: string;
	acceptsLegacyClients: boolean;
}

/** Only release-approved corpora can be selected. A request never supplies content. */
export function createCorpusCatalog(corpora: readonly RulesCorpus[], legacyHash?: string) {
	const key = (profile: string, version: string, hash: string) =>
		JSON.stringify([profile, version, hash]);
	const contexts = new Map<string, CorpusContext>();
	for (const corpus of corpora) {
		contexts.set(key(corpus.profile ?? 'genius', corpus.ruleSetVersion, corpus.contentHash), {
			corpus,
			ruleIds: new Set(corpus.rules.map((rule) => rule.id)),
			sourceIds: new Set(corpus.sources.map((source) => source.id))
		});
	}
	if (
		legacyHash !== undefined &&
		!corpora.some(
			(corpus) => (corpus.profile ?? 'genius') === 'genius' && corpus.contentHash === legacyHash
		)
	) {
		throw new Error('The legacy client corpus must be included in the release.');
	}
	return {
		supportedCorpora: [...contexts.values()].map(({ corpus }): SupportedCorpus => {
			const result: SupportedCorpus = {
				ruleSetVersion: corpus.ruleSetVersion,
				corpusHash: corpus.contentHash,
				acceptsLegacyClients:
					(corpus.profile ?? 'genius') === 'genius' && corpus.contentHash === legacyHash
			};
			if (corpus.profile) result.profile = corpus.profile;
			return result;
		}),
		resolve(
			version: string,
			hash?: string,
			profile: 'genius' | 'musixmatch' = 'genius'
		): CorpusContext | undefined {
			const selectedHash = hash ?? (profile === 'genius' ? legacyHash : undefined);
			return selectedHash === undefined
				? undefined
				: contexts.get(key(profile, version, selectedHash));
		}
	};
}

export type CorpusCatalog = ReturnType<typeof createCorpusCatalog>;

export const corpusCatalog = createCorpusCatalog(
	[corpus, musixmatchCorpus, ...compatibleCorpora],
	legacyCorpusHash
);
